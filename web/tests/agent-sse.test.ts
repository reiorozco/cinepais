import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSseParser, type SseFrame } from "../src/lib/agent/sse";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "agent-sse",
);

/**
 * Event-type counts measured from the real capture in Todo 1 and recorded in
 * `tests/fixtures/agent-sse/README.md`. These are ground truth, not estimates.
 */
const NARROW_FIXTURE_EXPECTED = {
  total: 20,
  tool_call: 5,
  recommendation: 2,
  token: 12,
  done: 1,
} as const;

function countByEvent(frames: SseFrame[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const frame of frames) {
    counts[frame.event] = (counts[frame.event] ?? 0) + 1;
  }
  return counts;
}

describe("createSseParser — WHATWG HTML §9.2.6 field parsing", () => {
  test("parses a single complete frame", () => {
    const parser = createSseParser();
    const frames = parser.feed('event: token\ndata: {"content":"hola"}\n\n');
    expect(frames).toEqual([{ event: "token", data: '{"content":"hola"}' }]);
  });

  test('event defaults to "message" when no event field is present', () => {
    const parser = createSseParser();
    const frames = parser.feed("data: sin evento\n\n");
    expect(frames).toEqual([{ event: "message", data: "sin evento" }]);
  });

  test("strips exactly one leading space, preserving the rest", () => {
    const parser = createSseParser();
    // Three spaces after the colon: one is the SSE separator, two are content.
    const frames = parser.feed("event: token\ndata:   dos espacios\n\n");
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe("  dos espacios");
  });

  test("preserves trailing whitespace in the value (trim would destroy it)", () => {
    const parser = createSseParser();
    const frames = parser.feed("event: token\ndata: la sala   \n\n");
    expect(frames[0].data).toBe("la sala   ");
  });

  test("handles a value with no leading space at all", () => {
    const parser = createSseParser();
    const frames = parser.feed("event:token\ndata:{}\n\n");
    expect(frames).toEqual([{ event: "token", data: "{}" }]);
  });

  test("splits each field line on the FIRST colon only", () => {
    const parser = createSseParser();
    const frames = parser.feed('data: {"time":"22:45"}\n\n');
    expect(frames[0].data).toBe('{"time":"22:45"}');
  });

  test("a line with no colon is a field name with an empty value", () => {
    const parser = createSseParser();
    // Bare `data` line contributes an empty data line; bare `event` clears nothing.
    const frames = parser.feed("event: token\ndata\ndata: segunda\n\n");
    expect(frames).toEqual([{ event: "token", data: "\nsegunda" }]);
  });

  test("multiple data lines are joined with \\n", () => {
    const parser = createSseParser();
    const frames = parser.feed(
      "event: recommendation\ndata: linea uno\ndata: linea dos\ndata: linea tres\n\n",
    );
    expect(frames).toEqual([
      { event: "recommendation", data: "linea uno\nlinea dos\nlinea tres" },
    ]);
  });

  test("resets event and data buffers after dispatch", () => {
    const parser = createSseParser();
    parser.feed("event: token\ndata: primero\n\n");
    const frames = parser.feed("data: segundo\n\n");
    // No leaked `token` event type, no leaked `primero` data.
    expect(frames).toEqual([{ event: "message", data: "segundo" }]);
  });

  test("two frames in one chunk", () => {
    const parser = createSseParser();
    const frames = parser.feed(
      'event: tool_call\ndata: {"tool":"search"}\n\nevent: done\ndata: {"sessionQueriesUsed":1}\n\n',
    );
    expect(frames).toEqual([
      { event: "tool_call", data: '{"tool":"search"}' },
      { event: "done", data: '{"sessionQueriesUsed":1}' },
    ]);
  });

  test("preserves Spanish accents and punctuation verbatim", () => {
    const parser = createSseParser();
    const frames = parser.feed(
      "event: token\ndata: Encontré 2 sillas juntas en Bogotá — ¿te sirven?\n\n",
    );
    expect(frames[0].data).toBe(
      "Encontré 2 sillas juntas en Bogotá — ¿te sirven?",
    );
  });
});

describe("createSseParser — comments", () => {
  test("a comment line is ignored and produces no frame", () => {
    const parser = createSseParser();
    expect(parser.feed(":heartbeat\n\n")).toEqual([]);
  });

  test("a real agent ping comment produces no phantom empty frame", () => {
    const parser = createSseParser();
    expect(parser.feed(": ping - 2026-08-13 07:56:43.814926+00:00\n\n")).toEqual(
      [],
    );
  });

  test("a comment interleaved between frames does not corrupt them", () => {
    const parser = createSseParser();
    const frames = parser.feed(
      "event: token\ndata: uno\n\n: ping\n\nevent: token\ndata: dos\n\n",
    );
    expect(frames).toEqual([
      { event: "token", data: "uno" },
      { event: "token", data: "dos" },
    ]);
  });

  test("an event field with no data field does not dispatch", () => {
    const parser = createSseParser();
    expect(parser.feed("event: token\n\n")).toEqual([]);
  });

  test("an explicitly empty data field DOES dispatch with empty data", () => {
    const parser = createSseParser();
    expect(parser.feed("event: token\ndata:\n\n")).toEqual([
      { event: "token", data: "" },
    ]);
  });
});

describe("createSseParser — chunk boundaries", () => {
  test("a frame split mid-field across two feed() calls yields exactly one frame", () => {
    const parser = createSseParser();
    const first = parser.feed("event: tok");
    expect(first).toEqual([]);
    const second = parser.feed("en\ndata: {}\n\n");
    expect(second).toEqual([{ event: "token", data: "{}" }]);
  });

  test("a frame split mid-JSON across feed() calls reassembles the payload", () => {
    const parser = createSseParser();
    expect(parser.feed('event: recommendation\ndata: {"seatIds":["1_4_')).toEqual(
      [],
    );
    expect(parser.feed('7","1_4_8"]}\n\n')).toEqual([
      { event: "recommendation", data: '{"seatIds":["1_4_7","1_4_8"]}' },
    ]);
  });

  test("a frame split exactly on the blank-line boundary dispatches once", () => {
    const parser = createSseParser();
    expect(parser.feed("event: done\ndata: {}\n")).toEqual([]);
    expect(parser.feed("\n")).toEqual([
      { event: "done", data: "{}" },
    ]);
  });

  test("an unterminated frame is held in the buffer and never dispatched", () => {
    const parser = createSseParser();
    expect(parser.feed("event: token\ndata: incompleto")).toEqual([]);
  });
});

describe("createSseParser — line terminators", () => {
  test("CRLF input parses identically to LF input", () => {
    const parser = createSseParser();
    const frames = parser.feed(
      'event: token\r\ndata: {"content":"hola"}\r\n\r\n',
    );
    expect(frames).toEqual([{ event: "token", data: '{"content":"hola"}' }]);
  });

  test("bare CR terminates a line", () => {
    const parser = createSseParser();
    // A CR at the very END of a chunk is ambiguous — it may be the first half of
    // a CRLF whose LF arrives next — so the parser must hold it back rather than
    // treat it as a terminator. It resolves as soon as the next input arrives.
    expect(parser.feed("event: token\rdata: solo cr\r\r")).toEqual([]);
    expect(parser.feed("event: done\rdata: {}\r\r\n")).toEqual([
      { event: "token", data: "solo cr" },
      { event: "done", data: "{}" },
    ]);
  });

  test("a CRLF pair split across feed() calls is ONE terminator, not two", () => {
    const parser = createSseParser();
    // The \r arrives at the end of one chunk and the \n at the start of the next.
    // A naive normalize-then-split turns this into a phantom blank line and
    // dispatches the frame one line early.
    expect(parser.feed("event: token\r")).toEqual([]);
    expect(parser.feed("\ndata: intacto\r")).toEqual([]);
    expect(parser.feed("\n\r")).toEqual([]);
    expect(parser.feed("\n")).toEqual([
      { event: "token", data: "intacto" },
    ]);
  });

  test("mixed CRLF and LF terminators in one stream", () => {
    const parser = createSseParser();
    const frames = parser.feed("event: token\r\ndata: mixto\n\r\n");
    expect(frames).toEqual([{ event: "token", data: "mixto" }]);
  });
});

describe("createSseParser — real fixture replay, one character at a time", () => {
  test("byte-at-a-time replay of real-narrow-two-recommendations.txt matches the Todo 1 counts", () => {
    const raw = readFileSync(
      path.join(FIXTURE_DIR, "real-narrow-two-recommendations.txt"),
      "utf8",
    );
    // Sanity check on the fixture itself: it really is CRLF-terminated, so this
    // replay exercises the split-CRLF path on every single line boundary.
    expect(raw).toContain("\r\n");

    const parser = createSseParser();
    const frames: SseFrame[] = [];
    for (const char of Array.from(raw)) {
      frames.push(...parser.feed(char));
    }

    expect(frames).toHaveLength(NARROW_FIXTURE_EXPECTED.total);
    expect(countByEvent(frames)).toEqual({
      tool_call: NARROW_FIXTURE_EXPECTED.tool_call,
      recommendation: NARROW_FIXTURE_EXPECTED.recommendation,
      token: NARROW_FIXTURE_EXPECTED.token,
      done: NARROW_FIXTURE_EXPECTED.done,
    });

    expect(raw).toContain(": ping - ");
    expect(frames.some((f) => f.data.includes("ping - "))).toBe(false);
    for (const frame of frames) {
      expect(() => JSON.parse(frame.data)).not.toThrow();
    }
    expect(frames[frames.length - 1].event).toBe("done");
  });

  test("whole-chunk replay of the same fixture yields identical frames", () => {
    const raw = readFileSync(
      path.join(FIXTURE_DIR, "real-narrow-two-recommendations.txt"),
      "utf8",
    );

    const byChar = createSseParser();
    const charFrames: SseFrame[] = [];
    for (const char of Array.from(raw)) {
      charFrames.push(...byChar.feed(char));
    }

    const whole = createSseParser();
    const wholeFrames = whole.feed(raw);

    // Chunking must be invisible to the caller.
    expect(wholeFrames).toEqual(charFrames);
  });

  test("all three real fixtures replay one character at a time to their recorded counts", () => {
    const expectations = [
      {
        file: "real-broad.txt",
        total: 14,
        counts: { tool_call: 1, recommendation: 1, token: 11, done: 1 },
      },
      {
        file: "real-narrow-two-recommendations.txt",
        total: 20,
        counts: { tool_call: 5, recommendation: 2, token: 12, done: 1 },
      },
      {
        file: "real-date-range.txt",
        total: 12,
        counts: { tool_call: 1, recommendation: 1, token: 9, done: 1 },
      },
    ];

    for (const { file, total, counts } of expectations) {
      const raw = readFileSync(path.join(FIXTURE_DIR, file), "utf8");
      const parser = createSseParser();
      const frames: SseFrame[] = [];
      for (const char of Array.from(raw)) {
        frames.push(...parser.feed(char));
      }
      expect(frames, `${file} frame count`).toHaveLength(total);
      expect(countByEvent(frames), `${file} event-type counts`).toEqual(counts);
    }
  });
});
