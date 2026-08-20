"use client";

import { useEffect, useRef, useState } from "react";

import { useOptionalCity } from "@/components/providers/city-provider";
import { streamChat } from "@/lib/agent/client";
import type { AgentEvent, RecommendationEvent } from "@/lib/agent/events";

/**
 * Conversation state machine for the copilot panel.
 *
 * Owns everything between a typed question and a rendered turn: the ordered
 * message list, the text accumulated token by token, the Spanish tool-activity
 * label, the turn's recommendation payload and the session counters the agent
 * reports on `done`.
 *
 * It consumes {@link streamChat}, which never throws and never rejects — every
 * actionable failure arrives as an `error` event, and a user cancellation emits
 * nothing at all. So there is no `try`/`catch` here and no retry: a retry would
 * turn one rate-limit into a storm.
 *
 * Two ordering shapes are valid (`agent/docs/sse-contract.md` §Event ordering):
 * `tool_call → recommendation → token* → done` and `token+ → done`. The `token`
 * events of the first shape may be entirely absent, so the assistant message is
 * created lazily — on the first `token` OR `recommendation`, whichever lands
 * first. A turn that produces only a recommendation therefore has no text to
 * render and no empty bubble is possible.
 *
 * The assistant's prose is never inspected for structured data. `seatIds`,
 * prices and showtime ids come from the `recommendation` payload only
 * (`sse-contract.md:74`); the text is display-only.
 */

export type ChatStatus = "idle" | "streaming" | "done" | "error";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  /** Accumulated text. Assistant messages grow one `token` event at a time. */
  content: string;
  /**
   * The turn's latest `recommendation`. Replaced, never merged: a turn can emit
   * more than one payload and the LAST is the agent's own correction
   * (`sse-contract.md` + the Fase C round-7 finding), so exactly one card ever
   * renders per turn.
   */
  recommendation: RecommendationEvent | null;
  /** `error` renders as a distinct bubble carrying the agent's Spanish copy. */
  variant: "text" | "error";
  /**
   * An extra Spanish line rendered under an error bubble, or `null`. It carries
   * only copy — the machine code that selected it stays in this module and is
   * never handed to the UI.
   */
  hint: string | null;
};

export type SessionCounters = {
  sessionQueriesUsed: number;
  sessionQueryCap: number;
};

export type CopilotChat = {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Spanish label for the tool currently running, or `null`. */
  activity: string | null;
  /** Counters from the last `done` event. Surfaced by the limits UI. */
  counters: SessionCounters | null;
  /**
   * Epoch milliseconds until which sending is refused after a rate limit, or
   * `null` when no cooldown is running.
   *
   * Deliberately a timestamp rather than a countdown: the hook holds no timer,
   * so nothing here has to be cleaned up and the lock cannot leak past unmount.
   * The panel derives the visible seconds from it and re-renders itself.
   */
  cooldownUntil: number | null;
  /**
   * `true` once the agent reports the session query cap. Never reset — the cap
   * is a deliberate cost control and the session id it applies to is fixed for
   * the lifetime of this tab.
   */
  sessionCapped: boolean;
  send: (text: string) => void;
};

const SESSION_STORAGE_KEY = "cinepais.copilot.sessionId";

/**
 * How long sending stays blocked after a rate limit.
 *
 * The agent's window is 10 requests per minute per IP (`agent/README.md`
 * §Security), so a full minute is the shortest wait guaranteed to clear it.
 * Exported because the panel clamps its countdown to this span — it is the one
 * value that has to agree between the guard here and the seconds on screen.
 */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

/**
 * The three error codes that do more than render a bubble. Everything else in
 * the contract's table — `input_too_long`, `timeout`, `internal_error`, … —
 * stays a plain bubble the user can immediately retry from.
 */
const RATE_LIMIT_CODE = "rate_limit_exceeded";
const SESSION_CAP_CODE = "session_cap_exceeded";
const UNREACHABLE_CODE = "agent_unreachable";

/**
 * Complements the transport's own copy on an unreachable agent, which already
 * says to check that the agent is running (`client.ts` `UNREACHABLE_MESSAGE`).
 * Repeating that would be noise; what the message does not say is that nothing
 * was lost and a retry is free.
 */
const UNREACHABLE_HINT =
  "Puedes intentarlo de nuevo cuando quieras; la conversación sigue aquí.";

/**
 * The agent's four read tools, in the user's language. An unknown tool name
 * falls back rather than leaking an English identifier into the panel.
 */
const TOOL_LABELS: ReadonlyMap<string, string> = new Map([
  ["recommend_best", "Buscando la mejor función…"],
  ["search_showtimes", "Consultando funciones…"],
  ["seat_availability", "Revisando disponibilidad…"],
  ["adjacent_seats", "Buscando sillas juntas…"],
]);

const FALLBACK_TOOL_LABEL = "Consultando…";

/** Exported so the mapping can be driven directly, without a live stream. */
export function toolLabel(tool: string): string {
  return TOOL_LABELS.get(tool) ?? FALLBACK_TOOL_LABEL;
}

function emptyAssistantMessage(id: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    recommendation: null,
    variant: "text",
    hint: null,
  };
}

/**
 * Apply `update` to the turn's assistant message, creating it if this is the
 * first event that needs one.
 *
 * Pure by contract: React re-invokes state updaters under StrictMode to surface
 * impurity, so this must never mutate its input or read anything outside its
 * arguments — otherwise a dev-only double invocation would duplicate tokens.
 */
function upsertAssistantMessage(
  messages: ChatMessage[],
  id: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const exists = messages.some((message) => message.id === id);
  if (!exists) return [...messages, update(emptyAssistantMessage(id))];
  return messages.map((message) =>
    message.id === id ? update(message) : message,
  );
}

/**
 * Resolve the per-tab session id the agent uses for its 20-query cap.
 *
 * `sessionStorage` does not exist during SSR, so this is only ever called from
 * an effect or an event handler — never from the render path, where touching it
 * would break hydration. Storage can also throw (private mode, blocked
 * cookies); an in-memory id keeps the copilot usable in that case.
 */
function readOrCreateSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored !== null && stored !== "") return stored;

    const created = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function useCopilotChat(): CopilotChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [activity, setActivity] = useState<string | null>(null);
  const [counters, setCounters] = useState<SessionCounters | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [sessionCapped, setSessionCapped] = useState(false);

  // `useOptionalCity`, not `useCity`: the city is a search anchor the agent
  // treats as optional, so a widget mounted outside `CityProvider` must lose
  // the anchor rather than throw and take the whole panel down with it.
  const cityContext = useOptionalCity();

  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Monotonic turn number. Events from a superseded turn are dropped rather
  // than written into the live one.
  const turnRef = useRef(0);
  const messageSeqRef = useRef(0);

  // Resolved after mount, into a ref rather than state: the id is never
  // rendered, so making it state would only add a render and trip
  // `react-hooks/set-state-in-effect`.
  useEffect(() => {
    sessionIdRef.current = readOrCreateSessionId();
  }, []);

  // An in-flight stream outlives the component otherwise. `abort()` is
  // idempotent, so StrictMode's double mount/unmount in dev is harmless.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  function nextMessageId(prefix: string): string {
    messageSeqRef.current += 1;
    return `${prefix}-${messageSeqRef.current}`;
  }

  function ensureSessionId(): string {
    if (sessionIdRef.current === null) {
      sessionIdRef.current = readOrCreateSessionId();
    }
    return sessionIdRef.current;
  }

  function send(text: string): void {
    const message = text.trim();
    // Both guards are also enforced by the composer's disabled state; keeping
    // them here is what makes the agent's `empty_message` code unreachable
    // through any path into this hook.
    if (message === "" || status === "streaming") return;

    // Permanent for the rest of this hook instance. The session id is never
    // touched here: minting a fresh one would hand the user a clean cap and
    // defeat the control outright.
    if (sessionCapped) return;

    // Self-expiring, so no timer has to re-enable anything: once the wall clock
    // passes the deadline this guard simply stops matching.
    if (cooldownUntil !== null && Date.now() < cooldownUntil) return;

    // A new question supersedes anything still in flight. `streamChat` emits
    // nothing for an `AbortError`, so this can never surface as a failure.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    turnRef.current += 1;
    const turn = turnRef.current;

    const userMessageId = nextMessageId("user");
    // Allocated up front so the event handler can address the assistant message
    // without touching a ref inside a state updater.
    const assistantMessageId = nextMessageId("assistant");

    setMessages((previous) => [
      ...previous,
      {
        id: userMessageId,
        role: "user",
        content: message,
        recommendation: null,
        variant: "text",
        hint: null,
      },
    ]);
    setStatus("streaming");
    setActivity(null);

    function handleEvent(event: AgentEvent): void {
      if (turnRef.current !== turn) return;

      switch (event.type) {
        case "token":
          setMessages((previous) =>
            upsertAssistantMessage(previous, assistantMessageId, (current) => ({
              ...current,
              content: current.content + event.content,
            })),
          );
          return;

        case "tool_call":
          setActivity(toolLabel(event.tool));
          return;

        case "recommendation":
          setMessages((previous) =>
            upsertAssistantMessage(previous, assistantMessageId, (current) => ({
              ...current,
              recommendation: event,
            })),
          );
          return;

        case "done":
          setActivity(null);
          setCounters({
            sessionQueriesUsed: event.sessionQueriesUsed,
            sessionQueryCap: event.sessionQueryCap,
          });
          setStatus("done");
          return;

        case "error":
          setActivity(null);
          // The agent's Spanish copy is rendered verbatim — this widget never
          // re-authors it (`sse-contract.md` §Error codes).
          setMessages((previous) => [
            ...previous,
            {
              id: `${assistantMessageId}-error`,
              role: "assistant",
              content: event.message,
              recommendation: null,
              variant: "error",
              hint: event.code === UNREACHABLE_CODE ? UNREACHABLE_HINT : null,
            },
          ]);

          if (event.code === RATE_LIMIT_CODE) {
            setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
          }
          if (event.code === SESSION_CAP_CODE) {
            setSessionCapped(true);
          }

          setStatus("error");
          return;
      }
    }

    void streamChat({
      message,
      sessionId: ensureSessionId(),
      // Read at send time, not at mount: the header's selector can change the
      // city between two turns of the same conversation.
      city: cityContext?.city ?? null,
      signal: controller.signal,
      onEvent: handleEvent,
    });
  }

  return {
    messages,
    status,
    activity,
    counters,
    cooldownUntil,
    sessionCapped,
    send,
  };
}
