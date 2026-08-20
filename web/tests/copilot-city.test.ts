// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act, cleanup } from "@testing-library/react";

import { CityProvider } from "../src/components/providers/city-provider";
import { useCopilotChat } from "../src/components/copilot/use-copilot-chat";
import { buildChatRequestBody } from "../src/lib/agent/client";

/**
 * The city the copilot sends to the agent, end to end.
 *
 * The contract this file pins is cross-language, so it is quoted rather than
 * paraphrased — `agent/src/cinepais_agent/main.py:126-133`:
 *
 * ```python
 * class ChatRequest(BaseModel):
 *     message: str
 *     sessionId: Annotated[str, Field(min_length=1, max_length=128)]
 *     city: str | None = None
 * ```
 *
 * Pydantic v2 ignores unknown fields, so a mismatch between these two halves
 * fails *silently*: the field would be dropped with no error and no 422. That
 * is why the assertions below are on the serialized body string rather than on
 * the arguments handed to `streamChat` — only the bytes on the wire prove it.
 */

const SESSION_STORAGE_KEY = "cinepais.copilot.sessionId";
const CITY_STORAGE_KEY = "cinepais.city";

/** Matches `CityProvider`'s `DEFAULT_CITY`, asserted below rather than assumed. */
const DEFAULT_CITY = "Bogotá";

const SESSION_ID = "sesion-de-prueba";

function withCityProvider({ children }: { children: ReactNode }) {
  return createElement(CityProvider, null, children);
}

/**
 * A fetch mock that captures the request body, standing in for the agent.
 *
 * The body is an empty 200 SSE stream: `streamChat` needs a readable body to
 * reach a clean end, and no event is required to prove what was *sent*.
 */
function mockFetchCapturingBody(): { bodyOf: () => string } {
  const bodies: string[] = [];
  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return Promise.resolve({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start: (controller) => controller.close(),
      }),
      json: () => Promise.reject(new Error("an SSE body is not JSON")),
    } as unknown as Response);
  }) as unknown as typeof fetch;

  return {
    bodyOf: () => {
      expect(bodies).toHaveLength(1);
      return bodies[0];
    },
  };
}

/** Drive one turn through the real hook and return the raw body it produced. */
async function sendOneTurn(wrapper?: typeof withCityProvider): Promise<string> {
  const { bodyOf } = mockFetchCapturingBody();
  const { result } = renderHook(() => useCopilotChat(), { wrapper });

  await act(async () => {
    result.current.send("¿Dónde veo La Odisea en IMAX?");
  });

  return bodyOf();
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // Pre-seeded so `readOrCreateSessionId` returns early: `crypto.randomUUID` is
  // not guaranteed under jsdom, and the session id is not what this file tests.
  sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("copilot city — (happy) the provider's city reaches the wire", () => {
  test("sends the city the provider currently holds", async () => {
    localStorage.setItem(CITY_STORAGE_KEY, "Medellín");

    const body = await sendOneTurn(withCityProvider);

    expect(JSON.parse(body)).toEqual({
      message: "¿Dónde veo La Odisea en IMAX?",
      sessionId: SESSION_ID,
      city: "Medellín",
    });
  });

  test("sends the provider's default city when nothing is stored", async () => {
    const body = await sendOneTurn(withCityProvider);

    // Pinned against the provider's own default so a change there fails here
    // rather than silently anchoring the agent on a city nobody picked.
    expect(JSON.parse(body).city).toBe(DEFAULT_CITY);
  });

  test("carries an accented Colombian name through as UTF-8, not escaped", async () => {
    localStorage.setItem(CITY_STORAGE_KEY, "Medellín");

    const body = await sendOneTurn(withCityProvider);

    // `sanitize_city` matches on the accented letter itself; a mojibake or
    // ASCII-folded value would be dropped agent-side and look like a no-op.
    expect(JSON.parse(body).city).toBe("Medellín");
    expect(JSON.parse(body).city).not.toContain("\uFFFD");
  });
});

describe("copilot city — (failure) the field is omitted, never null", () => {
  test("with NO CityProvider above, the hook still sends a well-formed body", async () => {
    const body = await sendOneTurn();
    const parsed: Record<string, unknown> = JSON.parse(body);

    // The whole point: an absent provider degrades to the pre-Wave-1 behaviour.
    expect(parsed).toEqual({
      message: "¿Dónde veo La Odisea en IMAX?",
      sessionId: SESSION_ID,
    });
    expect("city" in parsed).toBe(false);
    expect(body).not.toContain("city");
  });

  test("a whitespace-only stored city is omitted rather than sent blank", async () => {
    localStorage.setItem(CITY_STORAGE_KEY, "   ");

    const body = await sendOneTurn(withCityProvider);
    const parsed: Record<string, unknown> = JSON.parse(body);

    expect("city" in parsed).toBe(false);
  });
});

describe("buildChatRequestBody — the serialized shape in isolation", () => {
  const message = "hola";
  const sessionId = "s";

  test("includes a trimmed city when one is known", () => {
    expect(buildChatRequestBody({ message, sessionId, city: "  Bogotá  " })).toBe(
      '{"message":"hola","sessionId":"s","city":"Bogotá"}',
    );
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   \t "],
  ])("omits the key entirely for %s", (_label, city) => {
    const body = buildChatRequestBody({ message, sessionId, city });

    expect(body).toBe('{"message":"hola","sessionId":"s"}');
    expect(body).not.toContain("null");
    expect(body).not.toContain("city");
  });

  test("key order is stable, so the body is byte-comparable in evidence", () => {
    expect(Object.keys(JSON.parse(buildChatRequestBody({ message, sessionId, city: "Cali" })))).toEqual([
      "message",
      "sessionId",
      "city",
    ]);
  });
});

/**
 * Offline conformance against `ChatRequest` (quoted at the top of this file).
 * No network and no Python — this asserts the shape the model accepts, which is
 * what makes a silent Pydantic drop impossible to ship unnoticed.
 */
describe("ChatRequest conformance (offline)", () => {
  function assertParsesAsChatRequest(body: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(body);
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();

    const value = parsed as Record<string, unknown>;

    // `message: str`
    expect(typeof value.message).toBe("string");
    // `sessionId: Annotated[str, Field(min_length=1, max_length=128)]`
    expect(typeof value.sessionId).toBe("string");
    expect(String(value.sessionId).length).toBeGreaterThanOrEqual(1);
    expect(String(value.sessionId).length).toBeLessThanOrEqual(128);
    // `city: str | None = None` — present as a string, or absent. Never `null`
    // from this side: absent is the only shape a pre-Wave-1 agent also accepts.
    if ("city" in value) expect(typeof value.city).toBe("string");

    // No field outside the model. Pydantic v2 would drop an extra key in
    // silence, so an unnoticed typo here is exactly the failure mode.
    expect(Object.keys(value).sort()).toEqual(
      ("city" in value ? ["city", "message", "sessionId"] : ["message", "sessionId"]),
    );

    return value;
  }

  test("the with-city body conforms", async () => {
    localStorage.setItem(CITY_STORAGE_KEY, "Medellín");
    const value = assertParsesAsChatRequest(await sendOneTurn(withCityProvider));
    expect(value.city).toBe("Medellín");
  });

  test("the without-city body conforms", async () => {
    const value = assertParsesAsChatRequest(await sendOneTurn());
    expect("city" in value).toBe(false);
  });
});
