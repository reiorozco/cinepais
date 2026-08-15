import { z } from "zod";

/**
 * Zod mirror of the agent's SSE event contract.
 *
 * Source of truth: `agent/src/cinepais_agent/events.py` — these schemas mirror
 * those Pydantic models field-for-field. Nullability is copied literally:
 * `Alternative.priceFrom` is `int` (never null) while
 * `RecommendationEvent.priceFrom` is `int | None`, because a
 * `no_availability` outcome carries no price.
 *
 * `formats` is typed as `string[]` rather than the `Format` enum on purpose:
 * the agent already validates it against `Literal[...]` before it reaches the
 * wire, and a permissive array here means a future format never turns a whole
 * recommendation into a dropped frame.
 */

const QualityTierSchema = z.enum(["low", "optimal", "high"]);

export const TokenEventSchema = z.object({
  type: z.literal("token"),
  content: z.string(),
});

export const ToolCallEventSchema = z.object({
  type: z.literal("tool_call"),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});

/** An alternative showtime presented alongside the main recommendation. */
export const AlternativeSchema = z.object({
  showtimeId: z.string(),
  filmId: z.string(),
  siteName: z.string(),
  businessDate: z.string(),
  time: z.string(),
  formats: z.array(z.string()),
  // events.py:30 — `int`, NOT `int | None`.
  priceFrom: z.number(),
  // events.py:31 — null marks a soldout alternative.
  qualityTier: QualityTierSchema.nullable(),
  reason: z.string(),
});

export const RecommendationEventSchema = z.object({
  type: z.literal("recommendation"),
  outcome: z.enum(["recommended", "degraded", "no_availability"]),
  showtimeId: z.string().nullable(),
  filmId: z.string().nullable(),
  seatIds: z.array(z.string()),
  requestedN: z.number(),
  siteName: z.string().nullable(),
  city: z.string().nullable(),
  businessDate: z.string().nullable(),
  time: z.string().nullable(),
  formats: z.array(z.string()),
  // events.py:47 — `int | None`. A `no_availability` outcome sends null here.
  priceFrom: z.number().nullable(),
  qualityTier: QualityTierSchema.nullable(),
  reasoning: z.string(),
  alternatives: z.array(AlternativeSchema).default([]),
});

export const DoneEventSchema = z.object({
  type: z.literal("done"),
  sessionQueriesUsed: z.number(),
  sessionQueryCap: z.number(),
});

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

export const AgentEventSchema = z.discriminatedUnion("type", [
  TokenEventSchema,
  ToolCallEventSchema,
  RecommendationEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
]);

// Type exports
export type QualityTier = z.infer<typeof QualityTierSchema>;
export type TokenEvent = z.infer<typeof TokenEventSchema>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type RecommendationEvent = z.infer<typeof RecommendationEventSchema>;
export type DoneEvent = z.infer<typeof DoneEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/** The SSE event names the agent emits. */
const KNOWN_EVENT_NAMES = new Set<string>([
  "token",
  "tool_call",
  "recommendation",
  "done",
  "error",
]);

/**
 * Parse one SSE frame into a typed agent event.
 *
 * Returns `null` — never throws — when the payload is malformed JSON, fails
 * the schema, or carries a `type` that contradicts a known SSE event name.
 * One bad frame must never kill the stream.
 *
 * `eventName` is advisory: an unrecognized name (including the WHATWG default
 * `"message"`) defers entirely to the payload's own `type` discriminant.
 */
export function parseAgentEvent(
  eventName: string,
  rawData: string,
): AgentEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawData);
  } catch {
    return null;
  }

  const result = AgentEventSchema.safeParse(json);
  if (!result.success) return null;

  if (KNOWN_EVENT_NAMES.has(eventName) && result.data.type !== eventName) {
    return null;
  }

  return result.data;
}
