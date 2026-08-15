import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  TokenEventSchema,
  ToolCallEventSchema,
  AlternativeSchema,
  RecommendationEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  AgentEventSchema,
  parseAgentEvent,
} from "../src/lib/agent/events";

/**
 * Real `data:` payloads lifted VERBATIM out of
 * web/tests/fixtures/agent-sse/real-narrow-two-recommendations.txt.
 * The "lifted verbatim" test below asserts each one still appears
 * byte-for-byte in the fixture, so transcription drift cannot hide.
 */
const REAL_TOOL_CALL_DATA = `{"type":"tool_call","tool":"search_showtimes","input":{"date":"2026-08-14","film_query":"Sombras del Puente","format":"IMAX"}}`;

const REAL_RECOMMENDATION_DATA = `{"type":"recommendation","outcome":"recommended","showtimeId":"st-site-med-2-premium-0-1400","filmId":"film-02","seatIds":["1_4_1","1_4_2"],"requestedN":2,"siteName":"CinePaís Laureles","city":"Medellín","businessDate":"2026-08-14","time":"14:00","formats":["Premium"],"priceFrom":24000,"qualityTier":"optimal","reasoning":"Encontré 2 sillas juntas en fila 4 (zona óptima) en CinePaís Laureles a las 14:00.","alternatives":[{"showtimeId":"st-site-med-3-premium-0-2100","filmId":"film-02","siteName":"CinePaís Envigado","businessDate":"2026-08-14","time":"21:00","formats":["Premium"],"priceFrom":24000,"qualityTier":"optimal","reason":"mejor calidad de silla"},{"showtimeId":"st-site-med-1-imax-0-1400","filmId":"film-02","siteName":"CinePaís El Poblado","businessDate":"2026-08-14","time":"14:00","formats":["IMAX"],"priceFrom":32000,"qualityTier":null,"reason":"esta función está agotada"}]}`;

const REAL_TOKEN_DATA = `{"type":"token","content":"La función de **Sombras del Puente** en formato **IMAX**"}`;

const REAL_DONE_DATA = `{"type":"done","sessionQueriesUsed":1,"sessionQueryCap":20}`;

const FIXTURE_PATH = new URL(
  "./fixtures/agent-sse/real-narrow-two-recommendations.txt",
  import.meta.url,
);

/** Raw bytes as captured off the wire — CRLF terminated, per the SSE spec. */
const FIXTURE = readFileSync(FIXTURE_PATH, "utf8");

/** Event-type counts measured in Todo 1 for this fixture. */
const FIXTURE_EVENT_COUNTS = {
  tool_call: 5,
  recommendation: 2,
  token: 12,
  done: 1,
} as const;

describe("real wire payloads", () => {
  test("the fixture is CRLF-terminated, as a real SSE stream is", () => {
    expect(FIXTURE).toContain("\r\n");
  });

  test("embedded payloads are lifted verbatim from the fixture file", () => {
    expect(FIXTURE).toContain(`data: ${REAL_TOOL_CALL_DATA}\r\n`);
    expect(FIXTURE).toContain(`data: ${REAL_RECOMMENDATION_DATA}\r\n`);
    expect(FIXTURE).toContain(`data: ${REAL_TOKEN_DATA}\r\n`);
    expect(FIXTURE).toContain(`data: ${REAL_DONE_DATA}\r\n`);
  });

  test("parses the verbatim real recommendation payload and keeps the soldout alternative", () => {
    const event = parseAgentEvent("recommendation", REAL_RECOMMENDATION_DATA);

    expect(event).not.toBeNull();
    expect(event?.type).toBe("recommendation");
    if (event?.type !== "recommendation") throw new Error("unreachable");

    expect(event.outcome).toBe("recommended");
    expect(event.showtimeId).toBe("st-site-med-2-premium-0-1400");
    expect(event.seatIds).toEqual(["1_4_1", "1_4_2"]);
    expect(event.requestedN).toBe(2);
    expect(event.priceFrom).toBe(24000);
    expect(event.qualityTier).toBe("optimal");
    expect(event.alternatives).toHaveLength(2);
    // The soldout alternative arrives with qualityTier === null.
    expect(event.alternatives.some((a) => a.qualityTier === null)).toBe(true);
    expect(
      event.alternatives.find((a) => a.qualityTier === null)?.reason,
    ).toBe("esta función está agotada");
  });

  test("parses the verbatim real tool_call payload", () => {
    const event = parseAgentEvent("tool_call", REAL_TOOL_CALL_DATA);
    expect(event).not.toBeNull();
    if (event?.type !== "tool_call") throw new Error("unreachable");
    expect(event.tool).toBe("search_showtimes");
    expect(event.input).toEqual({
      date: "2026-08-14",
      film_query: "Sombras del Puente",
      format: "IMAX",
    });
  });

  test("parses the verbatim real token payload without mangling Spanish content", () => {
    const event = parseAgentEvent("token", REAL_TOKEN_DATA);
    expect(event).not.toBeNull();
    if (event?.type !== "token") throw new Error("unreachable");
    expect(event.content).toBe(
      "La función de **Sombras del Puente** en formato **IMAX**",
    );
  });

  test("parses the verbatim real done payload", () => {
    const event = parseAgentEvent("done", REAL_DONE_DATA);
    expect(event).not.toBeNull();
    if (event?.type !== "done") throw new Error("unreachable");
    expect(event.sessionQueriesUsed).toBe(1);
    expect(event.sessionQueryCap).toBe(20);
  });

  test("every data frame in the fixture parses, matching Todo 1 event counts", () => {
    const counts: Record<string, number> = {};
    let failures = 0;
    let currentEvent = "message";

    for (const line of FIXTURE.replace(/\r\n/g, "\n").split("\n")) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice("event: ".length);
        continue;
      }
      if (!line.startsWith("data: ")) continue;

      const parsed = parseAgentEvent(currentEvent, line.slice("data: ".length));
      if (parsed === null) {
        failures += 1;
        continue;
      }
      counts[parsed.type] = (counts[parsed.type] ?? 0) + 1;
    }

    expect(failures).toBe(0);
    expect(counts).toEqual(FIXTURE_EVENT_COUNTS);
  });
});

describe("individual event schemas", () => {
  test("TokenEventSchema round-trips", () => {
    const payload = { type: "token", content: "Encontré" };
    expect(TokenEventSchema.parse(payload)).toEqual(payload);
  });

  test("ToolCallEventSchema round-trips with an arbitrary input record", () => {
    const payload = {
      type: "tool_call",
      tool: "recommend_best",
      input: { film_query: "La Odisea", n: 2, nested: { a: [1, 2] } },
    };
    expect(ToolCallEventSchema.parse(payload)).toEqual(payload);
  });

  test("ToolCallEventSchema rejects a non-object input", () => {
    const result = ToolCallEventSchema.safeParse({
      type: "tool_call",
      tool: "recommend_best",
      input: "not-an-object",
    });
    expect(result.success).toBe(false);
  });

  test("AlternativeSchema accepts a soldout alternative with qualityTier null", () => {
    const payload = {
      showtimeId: "st-site-med-1-imax-0-1400",
      filmId: "film-02",
      siteName: "CinePaís El Poblado",
      businessDate: "2026-08-14",
      time: "14:00",
      formats: ["IMAX"],
      priceFrom: 32000,
      qualityTier: null,
      reason: "esta función está agotada",
    };
    const parsed = AlternativeSchema.parse(payload);
    expect(parsed).toEqual(payload);
    expect(parsed.qualityTier).toBeNull();
  });

  test("AlternativeSchema rejects a null priceFrom (events.py:30 is int, not int | None)", () => {
    const result = AlternativeSchema.safeParse({
      showtimeId: "st-1",
      filmId: "film-02",
      siteName: "CinePaís El Poblado",
      businessDate: "2026-08-14",
      time: "14:00",
      formats: ["IMAX"],
      priceFrom: null,
      qualityTier: null,
      reason: "esta función está agotada",
    });
    expect(result.success).toBe(false);
  });

  test("RecommendationEventSchema round-trips a recommended outcome", () => {
    const payload = {
      type: "recommendation",
      outcome: "recommended",
      showtimeId: "st-site-med-2-premium-0-1400",
      filmId: "film-02",
      seatIds: ["1_4_1", "1_4_2"],
      requestedN: 2,
      siteName: "CinePaís Laureles",
      city: "Medellín",
      businessDate: "2026-08-14",
      time: "14:00",
      formats: ["Premium"],
      priceFrom: 24000,
      qualityTier: "optimal",
      reasoning: "Encontré 2 sillas juntas en fila 4.",
      alternatives: [],
    };
    expect(RecommendationEventSchema.parse(payload)).toEqual(payload);
  });

  test("RecommendationEventSchema accepts no_availability with null showtimeId AND null priceFrom", () => {
    const payload = {
      type: "recommendation",
      outcome: "no_availability",
      showtimeId: null,
      filmId: null,
      seatIds: [],
      requestedN: 4,
      siteName: null,
      city: null,
      businessDate: null,
      time: null,
      formats: [],
      priceFrom: null,
      qualityTier: null,
      reasoning: "No encontré funciones con 4 sillas juntas.",
      alternatives: [],
    };
    const parsed = RecommendationEventSchema.parse(payload);
    expect(parsed.showtimeId).toBeNull();
    expect(parsed.priceFrom).toBeNull();
    expect(parsed.qualityTier).toBeNull();
    expect(parsed.seatIds).toEqual([]);
  });

  test("RecommendationEventSchema defaults alternatives to []", () => {
    const parsed = RecommendationEventSchema.parse({
      type: "recommendation",
      outcome: "degraded",
      showtimeId: "st-1",
      filmId: "film-02",
      seatIds: ["1_4_1"],
      requestedN: 2,
      siteName: "CinePaís Laureles",
      city: "Medellín",
      businessDate: "2026-08-14",
      time: "14:00",
      formats: ["Premium"],
      priceFrom: 24000,
      qualityTier: "optimal",
      reasoning: "Solo encontré 1 silla.",
    });
    expect(parsed.alternatives).toEqual([]);
  });

  test("RecommendationEventSchema rejects an unknown outcome", () => {
    const result = RecommendationEventSchema.safeParse({
      type: "recommendation",
      outcome: "maybe",
      showtimeId: null,
      filmId: null,
      seatIds: [],
      requestedN: 2,
      siteName: null,
      city: null,
      businessDate: null,
      time: null,
      formats: [],
      priceFrom: null,
      qualityTier: null,
      reasoning: "",
    });
    expect(result.success).toBe(false);
  });

  test("DoneEventSchema round-trips", () => {
    const payload = {
      type: "done",
      sessionQueriesUsed: 1,
      sessionQueryCap: 20,
    };
    expect(DoneEventSchema.parse(payload)).toEqual(payload);
  });

  test("ErrorEventSchema round-trips a Spanish message", () => {
    const payload = {
      type: "error",
      code: "session_cap_exceeded",
      message: "Alcanzaste el límite de consultas de esta sesión.",
    };
    expect(ErrorEventSchema.parse(payload)).toEqual(payload);
  });
});

describe("AgentEventSchema discriminated union", () => {
  test("discriminates all five event types", () => {
    const payloads = [
      { type: "token", content: "hola" },
      { type: "tool_call", tool: "search_showtimes", input: {} },
      {
        type: "recommendation",
        outcome: "no_availability",
        showtimeId: null,
        filmId: null,
        seatIds: [],
        requestedN: 2,
        siteName: null,
        city: null,
        businessDate: null,
        time: null,
        formats: [],
        priceFrom: null,
        qualityTier: null,
        reasoning: "Sin disponibilidad.",
        alternatives: [],
      },
      { type: "done", sessionQueriesUsed: 3, sessionQueryCap: 20 },
      { type: "error", code: "input_too_long", message: "Mensaje muy largo." },
    ];

    const types = payloads.map((p) => AgentEventSchema.parse(p).type);
    expect(types).toEqual([
      "token",
      "tool_call",
      "recommendation",
      "done",
      "error",
    ]);
  });

  test("rejects an unknown event type", () => {
    const result = AgentEventSchema.safeParse({ type: "ping", content: "x" });
    expect(result.success).toBe(false);
  });
});

describe("parseAgentEvent", () => {
  test("returns null on malformed JSON instead of throwing", () => {
    expect(() => parseAgentEvent("token", "{not json")).not.toThrow();
    expect(parseAgentEvent("token", "{not json")).toBeNull();
    expect(parseAgentEvent("done", "")).toBeNull();
    expect(parseAgentEvent("token", "undefined")).toBeNull();
  });

  test("returns null when a required field is missing instead of throwing", () => {
    expect(() =>
      parseAgentEvent("recommendation", '{"type":"recommendation"}'),
    ).not.toThrow();
    expect(
      parseAgentEvent("recommendation", '{"type":"recommendation"}'),
    ).toBeNull();
    // token without content
    expect(parseAgentEvent("token", '{"type":"token"}')).toBeNull();
    // tool_call without input
    expect(
      parseAgentEvent("tool_call", '{"type":"tool_call","tool":"x"}'),
    ).toBeNull();
    // done without the cap
    expect(
      parseAgentEvent("done", '{"type":"done","sessionQueriesUsed":1}'),
    ).toBeNull();
    // error without message
    expect(parseAgentEvent("error", '{"type":"error","code":"x"}')).toBeNull();
  });

  test("returns null for a JSON value that is not an object", () => {
    expect(parseAgentEvent("token", '"just a string"')).toBeNull();
    expect(parseAgentEvent("token", "null")).toBeNull();
    expect(parseAgentEvent("token", "[]")).toBeNull();
  });

  test("returns null for an unknown event type", () => {
    expect(parseAgentEvent("ping", '{"type":"ping"}')).toBeNull();
  });

  test("returns null when the SSE event name contradicts the payload type", () => {
    expect(parseAgentEvent("done", REAL_TOKEN_DATA)).toBeNull();
  });

  test("falls back to the payload type when the SSE event name is the default 'message'", () => {
    const event = parseAgentEvent("message", REAL_DONE_DATA);
    expect(event).not.toBeNull();
    expect(event?.type).toBe("done");
  });

  test("does not silently coerce extra unknown fields into a different shape", () => {
    const event = parseAgentEvent(
      "done",
      '{"type":"done","sessionQueriesUsed":1,"sessionQueryCap":20,"extra":"x"}',
    );
    expect(event).not.toBeNull();
    expect(event).toEqual({
      type: "done",
      sessionQueriesUsed: 1,
      sessionQueryCap: 20,
    });
  });
});
