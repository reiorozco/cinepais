import { AGENT_BASE_URL } from "./config";
import { parseAgentEvent, type AgentEvent, type ErrorEvent } from "./events";
import { createSseParser } from "./sse";

/**
 * Streaming client for the agent's `POST /chat` SSE endpoint.
 *
 * Composes the two pure modules around it: {@link createSseParser} turns
 * decoded text into frames, {@link parseAgentEvent} validates each frame. This
 * module owns the two things they deliberately do not — the network and the
 * bytes-to-text decoding.
 *
 * Every failure the caller can act on arrives through the same channel as a
 * success: an `error` event on `onEvent`. The one exception is user
 * cancellation, which is not a failure and emits nothing.
 *
 * There is no retry or backoff here on purpose. The agent is rate-limited
 * (10 req/min per IP), so an automatic retry turns one 429 into a storm.
 */

export type StreamChatOptions = {
  message: string;
  sessionId: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
};

const RATE_LIMIT_MESSAGE =
  "Has superado el límite de solicitudes. Intenta de nuevo en un momento.";
const HTTP_ERROR_MESSAGE =
  "El copiloto no pudo responder. Intenta de nuevo en un momento.";
const UNREACHABLE_MESSAGE =
  "No pude conectarme al copiloto. Verifica que el agente esté corriendo.";

/**
 * `AbortController.abort()` surfaces as a rejection named `AbortError` from
 * both `fetch()` and `reader.read()`. It means the user changed their mind, so
 * it must never reach the UI as an error.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function unreachableEvent(): ErrorEvent {
  return {
    type: "error",
    code: "agent_unreachable",
    message: UNREACHABLE_MESSAGE,
  };
}

/**
 * Read the agent's Spanish copy out of a JSON error body.
 *
 * The agent's wording always wins over ours, so this is attempted before any
 * fallback. Returns `null` when the response has no body, is not JSON, or
 * carries no usable `message` — all of which are normal for a non-OK response.
 */
async function readAgentErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const { message } = body as { message?: unknown };
    return typeof message === "string" && message !== "" ? message : null;
  } catch {
    return null;
  }
}

/**
 * Turn a non-OK response into a synthetic `error` event.
 *
 * A non-OK response never carries an SSE body, so nothing downstream can
 * produce an event for it and the client has to fabricate one.
 *
 * The 429 body keys its machine code as `"error"`, not `"code"`
 * (`agent/src/cinepais_agent/main.py:87-91`), so reading `body.code` would
 * yield `undefined`. Only `message` is taken from the wire; the code is always
 * ours.
 */
async function buildHttpErrorEvent(response: Response): Promise<ErrorEvent> {
  const agentMessage = await readAgentErrorMessage(response);

  if (response.status === 429) {
    return {
      type: "error",
      code: "rate_limit_exceeded",
      message: agentMessage ?? RATE_LIMIT_MESSAGE,
    };
  }

  return {
    type: "error",
    code: "http_error",
    message: agentMessage ?? HTTP_ERROR_MESSAGE,
  };
}

export async function streamChat({
  message,
  sessionId,
  signal,
  onEvent,
}: StreamChatOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${AGENT_BASE_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
      signal,
    });
  } catch (error) {
    // A rejected `fetch` is network/CORS/DNS — the agent was never reached.
    if (isAbortError(error)) return;
    onEvent(unreachableEvent());
    return;
  }

  if (!response.ok) {
    onEvent(await buildHttpErrorEvent(response));
    return;
  }

  if (response.body === null) {
    // A 200 with no body is a protocol failure: no `done` event will ever
    // arrive, so the caller must be told rather than left waiting.
    onEvent({
      type: "error",
      code: "http_error",
      message: HTTP_ERROR_MESSAGE,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      // `{ stream: true }` is load-bearing, not decoration: a multi-byte
      // character ("Medellín", "Encontré") split across two network chunks
      // decodes to U+FFFD without it, corrupting the Spanish copy.
      const frames = parser.feed(decoder.decode(value, { stream: true }));

      for (const frame of frames) {
        // `null` means a malformed or schema-violating frame. One bad frame
        // is skipped in silence; it must never abort a live stream.
        const event = parseAgentEvent(frame.event, frame.data);
        if (event !== null) onEvent(event);
      }
    }
  } catch (error) {
    if (isAbortError(error)) return;
    onEvent(unreachableEvent());
  }
}
