import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { streamChat } from "../src/lib/agent/client";
import { AGENT_BASE_URL } from "../src/lib/agent/config";
import type { AgentEvent, ErrorEvent } from "../src/lib/agent/events";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "agent-sse",
);

/**
 * Event-type sequence measured from the real capture in Todo 1 and recorded in
 * `tests/fixtures/agent-sse/README.md`: tool_call 1, recommendation 1,
 * token 11, done 1 = 14 events, in SSE wire order.
 */
const BROAD_FIXTURE_SEQUENCE: string[] = [
  "tool_call",
  "recommendation",
  ...Array<string>(11).fill("token"),
  "done",
];

/**
 * Deliberately small so that multi-byte UTF-8 characters in the Spanish copy
 * ("Medellín", "Encontré", "óptima") land astride a chunk boundary. Without
 * `{ stream: true }` in the client's decoder those split sequences become
 * U+FFFD, which the decoding-integrity assertion below catches.
 */
const CHUNK_SIZE_BYTES = 7;

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

/** Split text into byte-sized chunks — never pre-decoded strings. */
function byteChunks(text: string, size = CHUNK_SIZE_BYTES): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.slice(offset, offset + size));
  }
  return chunks;
}

function streamFromText(text: string, size = CHUNK_SIZE_BYTES): ReadableStream<Uint8Array> {
  const chunks = byteChunks(text, size);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/**
 * Delivers `text`, then fails the stream on the next read.
 *
 * The failure has to be raised from `pull`, not `start`: erroring a stream
 * resets its queue (WHATWG "reset queue"), so a chunk enqueued and errored in
 * the same tick is discarded and never reaches the reader at all.
 */
function streamThenFail(text: string, failure: Error): ReadableStream<Uint8Array> {
  let delivered = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (delivered) {
        controller.error(failure);
        return;
      }
      delivered = true;
      controller.enqueue(new TextEncoder().encode(text));
    },
  });
}

const ONE_TOKEN_FRAME = 'event: token\ndata: {"type":"token","content":"hola"}\n\n';

/** A minimal OK Response carrying a real byte stream. */
function okResponse(body: ReadableStream<Uint8Array>): Response {
  return {
    ok: true,
    status: 200,
    body,
    json: () => Promise.reject(new Error("an SSE body is not JSON")),
  } as unknown as Response;
}

/** A non-OK Response. `body` is null and `json()` rejects, as on the wire. */
function errorResponse(status: number, jsonBody?: unknown): Response {
  return {
    ok: false,
    status,
    body: null,
    json: () =>
      jsonBody === undefined
        ? Promise.reject(new SyntaxError("Unexpected end of JSON input"))
        : Promise.resolve(jsonBody),
  } as unknown as Response;
}

function abortError(): Error {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  return error;
}

function collect(): { events: AgentEvent[]; onEvent: (event: AgentEvent) => void } {
  const events: AgentEvent[] = [];
  return { events, onEvent: (event) => void events.push(event) };
}

function errorsOf(events: AgentEvent[]): ErrorEvent[] {
  return events.filter((event): event is ErrorEvent => event.type === "error");
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("streamChat — request shape", () => {
  test("POSTs JSON to AGENT_BASE_URL/chat and forwards the abort signal", async () => {
    // The generic is what makes `mock.calls[0]` a typed tuple; a bare
    // `vi.fn()` infers zero parameters and the destructuring below goes unsound.
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(okResponse(streamFromText(""))),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const controller = new AbortController();
    const { onEvent } = collect();
    await streamChat({
      message: "¿Dónde veo Sombras del Puente?",
      sessionId: "sesion-1",
      signal: controller.signal,
      onEvent,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${AGENT_BASE_URL}/chat`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      message: "¿Dónde veo Sombras del Puente?",
      sessionId: "sesion-1",
    });
    expect(init.signal).toBe(controller.signal);
  });

  test("never retries — a 429 produces exactly one fetch call", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(errorResponse(429)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("streamChat — (a) successful stream from the real fixture", () => {
  test("emits the event-type sequence measured from real-broad.txt", async () => {
    const fixture = readFixture("real-broad.txt");
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(streamFromText(fixture))),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "Sombras del Puente en Medellín", sessionId: "s", onEvent });

    expect(events.map((event) => event.type)).toEqual(BROAD_FIXTURE_SEQUENCE);
    expect(events).toHaveLength(14);
    expect(errorsOf(events)).toHaveLength(0);
  });

  test("decodes multi-byte Spanish characters split across chunk boundaries", async () => {
    const fixture = readFixture("real-broad.txt");
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(streamFromText(fixture))),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    const text = events
      .filter((event) => event.type === "token")
      .map((event) => event.content)
      .join("");

    // U+FFFD is what a decoder without `{ stream: true }` leaves behind.
    expect(text).not.toContain("\uFFFD");
    expect(text).toContain("Medellín");
    expect(text).toContain("Sombras del Puente");

    const recommendation = events.find((event) => event.type === "recommendation");
    expect(recommendation?.reasoning).toContain("Encontré");
    expect(recommendation?.city).toBe("Medellín");
  });
});

describe("streamChat — (b) HTTP 429", () => {
  test("a 429 with no body yields exactly one rate_limit_exceeded error event", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(errorResponse(429)),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(events).toEqual([
      {
        type: "error",
        code: "rate_limit_exceeded",
        message: "Has superado el límite de solicitudes. Intenta de nuevo en un momento.",
      },
    ]);
  });

  test("prefers the agent's Spanish message and ignores the body's `error` key", async () => {
    // The live shape from agent/src/cinepais_agent/main.py:87-91 — the machine
    // code lives under `error`, NOT `code`.
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        errorResponse(429, {
          error: "rate_limit_exceeded",
          message: "Has superado el límite de solicitudes. Intenta de nuevo en un momento.",
          retryAfter: "60",
        }),
      ),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "error",
      code: "rate_limit_exceeded",
      message: "Has superado el límite de solicitudes. Intenta de nuevo en un momento.",
    });
  });

  test("a non-429 non-OK response yields a single http_error event in Spanish", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(errorResponse(500)),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(events).toHaveLength(1);
    const [event] = errorsOf(events);
    expect(event.code).toBe("http_error");
    expect(event.message).toBe("El copiloto no pudo responder. Intenta de nuevo en un momento.");
  });
});

describe("streamChat — (c) transport failure", () => {
  test("a rejected fetch yields exactly one agent_unreachable error event", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(events).toEqual([
      {
        type: "error",
        code: "agent_unreachable",
        message: "No pude conectarme al copiloto. Verifica que el agente esté corriendo.",
      },
    ]);
  });

  test("a stream that errors mid-flight yields one agent_unreachable event", async () => {
    const body = streamThenFail(ONE_TOKEN_FRAME, new TypeError("network error"));
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(body)),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(events.map((event) => event.type)).toEqual(["token", "error"]);
    expect(errorsOf(events)[0].code).toBe("agent_unreachable");
  });
});

describe("streamChat — (d) user cancellation", () => {
  test("an aborted signal produces ZERO error events (fetch rejects)", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn(() =>
      Promise.reject(abortError()),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({
      message: "hola",
      sessionId: "s",
      signal: controller.signal,
      onEvent,
    });

    // Cancellation is a user decision, not a failure. If an AbortError ever
    // leaks through as a user-visible error, fix the catch — not this line.
    expect(errorsOf(events)).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test("an abort mid-stream produces ZERO error events (reader rejects)", async () => {
    const controller = new AbortController();
    const body = streamThenFail(ONE_TOKEN_FRAME, abortError());
    globalThis.fetch = vi.fn(() => {
      controller.abort();
      return Promise.resolve(okResponse(body));
    }) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({
      message: "hola",
      sessionId: "s",
      signal: controller.signal,
      onEvent,
    });

    expect(errorsOf(events)).toHaveLength(0);
    expect(events.map((event) => event.type)).toEqual(["token"]);
  });
});

describe("streamChat — (e) malformed frame in the middle of a good stream", () => {
  test("skips the bad frame silently while surrounding events still arrive", async () => {
    const stream = [
      'event: token\ndata: {"type":"token","content":"antes"}\n\n',
      // Not JSON at all.
      "event: token\ndata: {no soy json\n\n",
      // Valid JSON, but violates the schema (`content` must be a string).
      'event: token\ndata: {"type":"token","content":42}\n\n',
      // Valid JSON, but an unknown discriminant.
      'event: token\ndata: {"type":"desconocido","content":"x"}\n\n',
      'event: token\ndata: {"type":"token","content":"después"}\n\n',
      'event: done\ndata: {"type":"done","sessionQueriesUsed":1,"sessionQueryCap":20}\n\n',
    ].join("");

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(okResponse(streamFromText(stream))),
    ) as unknown as typeof fetch;

    const { events, onEvent } = collect();
    await streamChat({ message: "hola", sessionId: "s", onEvent });

    expect(events.map((event) => event.type)).toEqual(["token", "token", "done"]);
    expect(errorsOf(events)).toHaveLength(0);

    const contents = events
      .filter((event) => event.type === "token")
      .map((event) => event.content);
    expect(contents).toEqual(["antes", "después"]);
  });
});
