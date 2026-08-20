"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
} from "react";
import { usePathname } from "next/navigation";
import { SendHorizontal, Sparkles, X } from "lucide-react";

import { MarkdownLite } from "@/components/copilot/markdown-lite";
import { RecommendationCard } from "@/components/copilot/recommendation-card";
import {
  RATE_LIMIT_COOLDOWN_MS,
  useCopilotChat,
  type ChatMessage,
} from "@/components/copilot/use-copilot-chat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating copilot — launcher bubble, panel, and the conversation inside it.
 *
 * Mounted once in the root layout (inside `SelectionProvider`, after
 * `Footer`). The App Router does not remount the root layout on client-side
 * navigation, so a panel opened on `/` is the same DOM node after a
 * `router.push` to `/showtimes/<id>`. That property is what makes the HITL
 * hand-off demo possible and is asserted live in Todo 10's evidence.
 *
 * Conversation state lives in `useCopilotChat`; this file is the surface.
 * Layout is three flex children inside a fixed-height panel: header,
 * `[data-copilot-body]` (the only `flex-1`, so it absorbs the height and
 * scrolls), and the composer footer.
 *
 * Layout notes:
 * - The fixed wrapper is `pointer-events-none` and spans the viewport width on
 *   mobile so the panel can be sized from a real layout box (`w-full`) instead
 *   of `100vw`, which would include the scrollbar and overflow horizontally.
 *   Only the launcher and the panel opt back into pointer events, so the
 *   invisible wrapper never swallows clicks meant for the page beneath it.
 * - `/showtimes/*` renders the seat map's fixed bottom bar (`z-40`, ~123px tall
 *   stacked / ~79px on `sm`+). The widget lifts above it on those routes so the
 *   launcher never covers the "Seleccionar boletas" CTA; every other route gets
 *   the standard `bottom-6` placement.
 */

/**
 * The composer mirrors the agent's own `MAX_INPUT_CHARS=2000` cap
 * (`agent/README.md` §Security) so an `input_too_long` error event is
 * unreachable from here. The counter stays hidden until the cap is in reach.
 */
const COUNTER_VISIBLE_FROM = 1800;

/**
 * How close to the agent's per-session query cap the remaining-query line
 * appears. Below it nothing renders: a counter shown from query one would read
 * as a paywall on a demo that is free.
 */
const REMAINING_QUERIES_VISIBLE_FROM = 3;

/**
 * How often the wall clock is re-sampled while a rate-limit cooldown runs.
 * Faster than the one-second granularity it drives, so the displayed second
 * never lags behind the real deadline by a visible amount.
 */
const COOLDOWN_TICK_MS = 250;

/**
 * The composer's placeholder is the only instruction telling a visitor what to
 * type, so when the field is locked it has to say which lock is on: a session
 * cap clears in a new tab, a daily cap does not, and a cooldown clears itself.
 */
function composerPlaceholder({
  sessionCapped,
  dailyCapped,
  coolingDown,
}: {
  sessionCapped: boolean;
  dailyCapped: boolean;
  coolingDown: boolean;
}): string {
  if (dailyCapped) return "Sin cupo de consultas por hoy.";
  if (sessionCapped) return "Llegaste al límite de esta sesión.";
  if (coolingDown) return "Espera un momento antes de volver a preguntar…";
  return "Pregunta por funciones o sillas…";
}

function remainingQueriesLabel(remaining: number): string {
  if (remaining <= 0) return "No te quedan consultas en esta sesión.";
  if (remaining === 1) return "Te queda 1 consulta en esta sesión.";
  return `Te quedan ${remaining} consultas en esta sesión.`;
}

/**
 * Openers aimed at the four planted seed scenarios (`.omo/handoff-fase-c.md`):
 * a sold-out IMAX function, the front-rows-only one, the wide-open optimal
 * rows, and a checkerboard 2D room with no three contiguous seats. Titles are
 * real seed films — "Sombras del Puente" (film-02) and "La Odisea" (film-01).
 */
const SUGGESTIONS: readonly string[] = [
  "¿Hay sillas para Sombras del Puente en IMAX en Medellín?",
  "Quiero 2 sillas juntas para La Odisea en IMAX en Medellín",
  "¿Dónde veo La Odisea en IMAX este finde con buena ubicación?",
  "Necesito 3 sillas juntas para una función 2D en Bogotá",
];

export function CopilotWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const pathname = usePathname();
  const {
    messages,
    status,
    activity,
    counters,
    cooldownUntil,
    sessionCapped,
    dailyCapped,
    send,
  } = useCopilotChat();
  // Wall clock, sampled only while a cooldown runs. Reading `Date.now()` during
  // render is banned (`react-hooks/purity`) and would be an SSR hazard besides,
  // so the interval below samples it instead. `0` means "not sampled yet"; the
  // clamp on `cooldownRemainingMs` turns that into a correct full-length
  // countdown rather than a nonsense number on the first render.
  const [nowMs, setNowMs] = useState(0);

  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const titleId = `${baseId}-title`;

  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Guards the close branch of the focus effect so the widget never steals
  // focus on first paint (mount also runs with `open === false`).
  const wasOpenRef = useRef(false);
  // Whether the reader is following the live end of the conversation. Updated
  // only from real scroll events, so it survives the DOM growing underneath it.
  const followingRef = useRef(true);

  const clearsSeatMapBar = pathname?.startsWith("/showtimes/") ?? false;
  const streaming = status === "streaming";

  const cooldownRemainingMs =
    cooldownUntil === null
      ? 0
      : Math.min(RATE_LIMIT_COOLDOWN_MS, Math.max(0, cooldownUntil - nowMs));
  const cooldownSecondsLeft = Math.ceil(cooldownRemainingMs / 1000);
  const coolingDown = cooldownRemainingMs > 0;

  const remainingQueries =
    counters === null
      ? null
      : Math.max(0, counters.sessionQueryCap - counters.sessionQueriesUsed);
  const showsRemainingQueries =
    counters !== null &&
    !sessionCapped &&
    counters.sessionQueriesUsed >=
      counters.sessionQueryCap - REMAINING_QUERIES_VISIBLE_FROM;

  // Both caps are terminal for this tab and both must lock the composer; the
  // cooldown is temporary and only blocks sending. They are kept apart because
  // a disabled-but-recoverable field wants different copy from a spent one.
  const capped = sessionCapped || dailyCapped;
  const composerDisabled = capped || coolingDown;

  const canSend = !streaming && !composerDisabled && draft.trim().length > 0;

  // Escape closes the panel. Bound only while open, removed on close/unmount.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Runs only while a cooldown is pending, and stops itself the moment the
  // deadline passes, so an expired lock leaves no interval behind. Setting
  // state from the interval callback (never from the effect body) is what keeps
  // `react-hooks/set-state-in-effect` satisfied.
  useEffect(() => {
    if (cooldownUntil === null) return;

    const id = window.setInterval(() => {
      const sampled = Date.now();
      setNowMs(sampled);
      if (sampled >= cooldownUntil) window.clearInterval(id);
    }, COOLDOWN_TICK_MS);

    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  // Focus moves to the composer on open — typing is the first thing anyone
  // wants to do — and back to the launcher on close.
  useEffect(() => {
    if (open) {
      (inputRef.current ?? panelRef.current)?.focus();
    } else if (wasOpenRef.current) {
      launcherRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // Keep the newest content in view as a turn streams, but never yank the view
  // back down while the user is scrolled up re-reading an earlier answer.
  // Intentionally dependency-array-free: any render can add content, and
  // `followingRef` is the real guard. Measuring the distance HERE instead would
  // always read "far from the bottom" — the DOM has already grown by then, and
  // an 1100px jump in a single tick is normal (`route.fulfill` delivers a whole
  // stream in one reader chunk, and a recommendation card is tall).
  useEffect(() => {
    const body = bodyRef.current;
    if (body === null || !followingRef.current) return;
    // The empty state is not a conversation. Pinning it to its bottom scrolled
    // the sparkle avatar and the "what is this?" line clean out of view (157px
    // hidden on mobile, 104px on desktop) and opened the panel on a clipped
    // suggestion chip — the copilot's entire first impression, discarded.
    if (messages.length === 0) return;
    body.scrollTop = body.scrollHeight;
  });

  // Grow the composer with its content up to `max-h-24`, so a Shift+Enter
  // newline is visible instead of scrolling out of a one-row box. `height:auto`
  // before the read is what lets it shrink again after a deletion.
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  });

  function handleBodyScroll(event: ReactUIEvent<HTMLDivElement>) {
    const body = event.currentTarget;
    followingRef.current =
      body.scrollHeight - body.scrollTop - body.clientHeight < 40;
  }

  function submitDraft() {
    if (!canSend) return;
    send(draft);
    setDraft("");
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // An IME candidate window commits with Enter; sending there would swallow
    // the word being composed.
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    submitDraft();
  }

  function handleSuggestion(suggestion: string) {
    if (streaming || composerDisabled) return;
    send(suggestion);
    setDraft("");
  }

  return (
    <div
      data-copilot-root=""
      className={cn(
        "pointer-events-none fixed bottom-6 left-4 right-4 z-50 flex flex-col items-end gap-3 sm:left-auto sm:right-6",
        clearsSeatMapBar && "bottom-36 sm:bottom-28",
      )}
    >
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-copilot-panel=""
          className="pointer-events-auto flex h-[26rem] max-h-[70vh] w-full flex-col overflow-hidden rounded-2xl bg-surface-dark text-white shadow-2xl shadow-black/40 outline-none ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-primary sm:w-96"
        >
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Sparkles className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p
                id={titleId}
                className="font-heading text-sm font-semibold leading-tight"
              >
                Copiloto CinePaís
              </p>
              <p className="truncate text-xs text-white/55">
                Funciones, sillas y disponibilidad
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar el copiloto de CinePaís"
              onClick={() => setOpen(false)}
              className="size-11 shrink-0 text-white/70 hover:bg-white/10 hover:text-white sm:size-7"
            >
              <X aria-hidden />
            </Button>
          </div>

          <div
            ref={bodyRef}
            data-copilot-body=""
            onScroll={handleBodyScroll}
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {messages.length === 0 ? (
              <EmptyState
                onPick={handleSuggestion}
                disabled={streaming || composerDisabled}
              />
            ) : (
              messages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))
            )}

            {streaming ? <ActivityRow label={activity} /> : null}
          </div>

          <form
            data-copilot-footer=""
            onSubmit={(event) => {
              event.preventDefault();
              submitDraft();
            }}
            className="flex flex-col gap-1.5 border-t border-white/10 px-3 py-3"
          >
            {sessionCapped ? (
              <p
                data-copilot-session-cap=""
                role="status"
                className="rounded-lg bg-white/5 px-3 py-2 text-[0.7rem] leading-relaxed text-white/60"
              >
                Llegaste al límite de consultas de esta sesión. Abre CinePaís en
                una pestaña nueva para empezar otra, o vuelve más tarde.
              </p>
            ) : null}

            {/* No extra notice for the daily cap: the agent's own Spanish
                message is already rendered verbatim in the bubble directly
                above, and repeating it here would say the same thing twice.
                What was missing was the lock, not the copy. */}

            {/* No live region on purpose: announcing a value that changes every
                second would talk over everything else a screen reader is
                saying. The lock itself is conveyed by the disabled control. */}
            {coolingDown && !capped ? (
              <p
                data-copilot-cooldown=""
                className="rounded-lg bg-white/5 px-3 py-2 text-[0.7rem] leading-relaxed text-white/60"
              >
                Podrás escribir de nuevo en{" "}
                <span data-copilot-cooldown-seconds="" className="tabular-nums">
                  {cooldownSecondsLeft}
                </span>{" "}
                {cooldownSecondsLeft === 1 ? "segundo" : "segundos"}.
              </p>
            ) : null}

            {showsRemainingQueries && remainingQueries !== null ? (
              <p
                data-copilot-remaining=""
                role="status"
                className="text-[0.7rem] leading-relaxed text-white/45"
              >
                {remainingQueriesLabel(remainingQueries)}
              </p>
            ) : null}

            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                data-copilot-input=""
                name="message"
                rows={1}
                value={draft}
                maxLength={2000}
                // Disabled during a cooldown too: `submitDraft` already
                // refused Enter there, but silently — the field looked live
                // and swallowed the keystroke with no feedback at all.
                disabled={composerDisabled}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={composerPlaceholder({
                  sessionCapped,
                  dailyCapped,
                  coolingDown,
                })}
                aria-label="Escribe tu pregunta para el copiloto"
                className="max-h-24 min-h-11 flex-1 resize-none overflow-y-auto rounded-lg bg-white/5 px-3 py-2 text-sm leading-snug text-white outline-none ring-1 ring-white/10 placeholder:text-white/55 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:min-h-9"
              />

              <Button
                type="submit"
                size="icon-lg"
                data-copilot-send=""
                disabled={!canSend}
                aria-label="Enviar la pregunta al copiloto"
                className="size-11 shrink-0 sm:size-9"
              >
                <SendHorizontal aria-hidden />
              </Button>
            </div>

            {draft.length > COUNTER_VISIBLE_FROM ? (
              <p
                data-copilot-counter=""
                aria-live="polite"
                className="text-right text-[0.7rem] tabular-nums text-white/50"
              >
                {draft.length}/2000
              </p>
            ) : null}
          </form>
        </div>
      ) : null}

      <Button
        ref={launcherRef}
        size="icon-lg"
        aria-label={
          open
            ? "Cerrar el copiloto de CinePaís"
            : "Abrir el copiloto de CinePaís"
        }
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-copilot-launcher=""
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto size-14 rounded-full bg-brand-header text-white shadow-lg shadow-black/30 hover:-translate-y-0.5 hover:bg-brand-header"
      >
        {open ? (
          <X aria-hidden className="size-6" />
        ) : (
          <Sparkles aria-hidden className="size-6" />
        )}
      </Button>
    </div>
  );
}

/**
 * Pre-first-turn surface. `m-auto` centres it inside the scroll container while
 * there is free space, without forcing centring on the message list later.
 */
function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (suggestion: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="m-auto flex flex-col items-center gap-4 py-2 text-center">
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-full bg-white/5 text-white/60 ring-1 ring-white/10"
      >
        <Sparkles className="size-6" />
      </span>
      <p className="text-sm leading-relaxed text-white/80">
        Pregúntale al copiloto sobre funciones, sillas y disponibilidad.
      </p>

      <ul className="flex w-full flex-col gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              data-copilot-suggestion=""
              disabled={disabled}
              onClick={() => onPick(suggestion)}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-left text-xs leading-snug text-white/80 outline-none ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-white/45">
        Datos ficticios de CinePaís. Desde aquí no se compra nada.
      </p>
    </div>
  );
}

/**
 * One turn's worth of surface. An assistant message renders its text bubble
 * only when there is text: tool-only turns carry a recommendation and no
 * `token` events at all, and an empty bubble there would be a rendering
 * artifact rather than an answer.
 *
 * The assistant bubble is a `<div>`, not a `<p>` — `MarkdownLite` can emit a
 * `<ul>`, and a `<ul>` inside a `<p>` is invalid nesting that the browser
 * silently repairs by closing the paragraph early. `whitespace-pre-wrap` moved
 * with it, onto the text nodes the renderer produces. The user bubble stays a
 * plain `<p>`: what a person typed is text, and parsing it would be a way to
 * make their own input surprise them.
 */
function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div
        data-copilot-message=""
        data-role="user"
        className="flex justify-end"
      >
        <p
          data-copilot-text=""
          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground"
        >
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div
      data-copilot-message=""
      data-role="assistant"
      data-variant={message.variant}
      className="flex flex-col gap-2"
    >
      {message.content.length > 0 ? (
        <div
          data-copilot-text=""
          className={cn(
            "max-w-[92%] space-y-2 rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed",
            message.variant === "error"
              ? "bg-destructive/10 text-white/85 ring-1 ring-destructive/35"
              : "bg-white/5 text-white/85",
          )}
        >
          <MarkdownLite text={message.content} />
        </div>
      ) : null}

      {message.hint !== null ? (
        <p
          data-copilot-hint=""
          className="max-w-[92%] px-3 text-xs leading-relaxed text-white/50"
        >
          {message.hint}
        </p>
      ) : null}

      {message.recommendation !== null ? (
        <RecommendationCard recommendation={message.recommendation} />
      ) : null}
    </div>
  );
}

/**
 * Streaming affordance. A `recommend_best` turn runs 5-45s
 * (`sse-contract.md` §Latency), so silence would read as a hang; the label is
 * the tool's Spanish name while one is running, and a neutral line once the
 * agent is only narrating.
 */
function ActivityRow({ label }: { label: string | null }) {
  return (
    <p
      data-copilot-activity=""
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-xs text-white/55"
    >
      <span aria-hidden className="flex items-center gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-white/45" />
        <span className="size-1.5 animate-pulse rounded-full bg-white/45 [animation-delay:200ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-white/45 [animation-delay:400ms]" />
      </span>
      {label ?? "Escribiendo…"}
    </p>
  );
}
