"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, Clock, MapPin, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  Alternative,
  QualityTier,
  RecommendationEvent,
} from "@/lib/agent/events";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Structured render of the agent's `recommendation` SSE event.
 *
 * The payload is the ONLY source: the agent builds it from tool output, never
 * from its own prose (`agent/docs/sse-contract.md` §recommendation), so this
 * component never parses assistant text. Every field the contract marks
 * nullable is rendered through a neutral Spanish fallback — a card that prints
 * `$ null` on a `no_availability` turn is the failure mode this guards.
 *
 * Outcome branches (`sse-contract.md:97-100`):
 * - `recommended` — `showtimeId` non-null and `seatIds.length === requestedN`
 * - `degraded`    — `showtimeId` non-null and `1 <= seatIds.length < requestedN`
 * - `no_availability` — `showtimeId` null, `seatIds` empty; the alternatives
 *   list becomes the primary content.
 *
 * Sold-out alternatives (`qualityTier === null`) are outcome-agnostic — they
 * surface on all three branches — and are rendered disabled with an "Agotada"
 * badge rather than dressed up as buyable.
 *
 * Presentational and self-contained: it owns its dark surface so it renders
 * correctly both inside the copilot panel and anywhere else.
 */

type Outcome = RecommendationEvent["outcome"];

const OUTCOME_META: Record<Outcome, { label: string; chip: string }> = {
  // Green = the colour the seats themselves turn once pre-selected on the map.
  recommended: {
    label: "Recomendado",
    chip: "bg-seat-selected text-brand-header",
  },
  // Distinct hue, still positive: fewer seats is not an error state and must
  // never be styled like one (spec decision #3 — never discourage the sale).
  degraded: {
    label: "Menos sillas juntas",
    chip: "bg-primary text-primary-foreground",
  },
  no_availability: {
    label: "Sin disponibilidad",
    chip: "bg-white/10 text-white/70",
  },
};

const OUTCOME_RING: Record<Outcome, string> = {
  recommended: "ring-seat-selected/45",
  degraded: "ring-primary/55",
  no_availability: "ring-white/15",
};

/** Seat-quality tier → the Spanish zone wording a moviegoer understands. */
const QUALITY_LABEL: Record<QualityTier, string> = {
  low: "adelante",
  optimal: "óptima",
  high: "atrás",
};

// `businessDate` is "YYYY-MM-DD"; parsed strictly as UTC so a Bogotá browser
// (UTC-5) never renders the previous day. Same approach as
// `src/app/showtimes/[id]/page.tsx`.
const LONG_DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

// Short form for the alternatives list, which must stay readable at 4 entries
// inside a ~384px panel.
const SHORT_DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function parseBusinessDate(businessDate: string | null): Date | null {
  if (businessDate === null) return null;
  const date = new Date(`${businessDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Intl outputs lowercase weekday names in es-CO; capitalize for polish. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The `Number.isNaN` guard inside `parseBusinessDate` is load-bearing, not
 * decoration: `Intl.DateTimeFormat.format` THROWS a RangeError on an invalid
 * Date, and the schema only validates `businessDate` as a string.
 */
function formatDate(
  businessDate: string | null,
  formatter: Intl.DateTimeFormat,
): string | null {
  const date = parseBusinessDate(businessDate);
  return date === null ? null : capitalize(formatter.format(date));
}

/** COP, or null. `Number.isFinite` makes "$ NaN" structurally unreachable. */
function formatPrice(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return formatCOP(value);
}

/** Drops nulls and empty strings, then joins with the app's " · " separator. */
function joinMeta(parts: Array<string | null>): string {
  return parts
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" · ");
}

const CHIP_CLASS =
  "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold leading-tight";

const META_CHIP_CLASS =
  "inline-flex items-center rounded-md bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-white/75 ring-1 ring-white/10";

export type RecommendationCardProps = {
  /** A `recommendation` event already validated by `parseAgentEvent`. */
  recommendation: RecommendationEvent;
};

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const router = useRouter();

  const {
    outcome,
    showtimeId,
    seatIds,
    requestedN,
    siteName,
    city,
    businessDate,
    time,
    formats,
    priceFrom,
    qualityTier,
    reasoning,
    alternatives,
  } = recommendation;

  const hasPrimary = outcome !== "no_availability";
  const canPreselect = showtimeId !== null && seatIds.length > 0;

  const placeLabel = joinMeta([siteName, city]);
  const dateLabel = formatDate(businessDate, LONG_DATE_FMT);
  const priceLabel = formatPrice(priceFrom);
  const seatCountLabel =
    seatIds.length === 1 ? "1 silla" : `${seatIds.length} sillas juntas`;

  /**
   * Client-side navigation on purpose, via the App Router. A hard navigation
   * would remount the root layout and destroy the conversation, which is the
   * whole point of mounting the widget there — so every CTA in this file goes
   * through `router.push`, never through a document-level location assignment
   * or a plain anchor element.
   *
   * Ids are encoded defensively: for real seed ids (`st-…`, `area_row_col`)
   * `encodeURIComponent` is the identity function, so the URL still reads
   * `?preselect=1_4_7,1_4_8` while a hostile id can no longer inject a path
   * segment or an extra query parameter.
   */
  function goToPrimarySeats() {
    if (showtimeId === null || seatIds.length === 0) return;
    const preselect = seatIds
      .map((seatId) => encodeURIComponent(seatId))
      .join(",");
    router.push(`/showtimes/${encodeURIComponent(showtimeId)}?preselect=${preselect}`);
  }

  function goToAlternative(alternativeShowtimeId: string) {
    // Alternatives carry no `seatIds` in the contract, so there is no seat
    // hand-off to make — navigate without `?preselect=`.
    router.push(`/showtimes/${encodeURIComponent(alternativeShowtimeId)}`);
  }

  return (
    <article
      data-recommendation-card=""
      data-outcome={outcome}
      aria-label="Recomendación del copiloto"
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-surface-dark p-3 text-left text-white ring-1",
        OUTCOME_RING[outcome],
      )}
    >
      <span className={cn(CHIP_CLASS, OUTCOME_META[outcome].chip)}>
        {OUTCOME_META[outcome].label}
      </span>

      {hasPrimary ? (
        <section
          data-recommendation-primary=""
          className="flex flex-col gap-2.5"
        >
          <div className="flex flex-col gap-1">
            {/* A <p>, not an <h4>: the panel's own title is a <p> too, and a
                heading here would skip levels under the page's <h1>. */}
            <p className="flex items-start gap-1.5 font-heading text-sm font-semibold leading-tight">
              <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-white/50" />
              <span className="min-w-0">
                {placeLabel.length > 0 ? placeLabel : "Sede por confirmar"}
              </span>
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-xs text-white/60">
              <span className="inline-flex items-center gap-1">
                <CalendarDays aria-hidden className="size-3.5 shrink-0" />
                {dateLabel ?? "Fecha por confirmar"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-3.5 shrink-0" />
                {time ?? "Horario por confirmar"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {formats.map((format) => (
              <span key={format} className={META_CHIP_CLASS}>
                {format}
              </span>
            ))}
            {qualityTier !== null ? (
              <span className={META_CHIP_CLASS}>
                Zona {QUALITY_LABEL[qualityTier]}
              </span>
            ) : null}
            {seatIds.length > 0 ? (
              <span className={META_CHIP_CLASS}>{seatCountLabel}</span>
            ) : null}
          </div>

          <p className="flex items-center gap-1.5 text-sm">
            <Ticket aria-hidden className="size-3.5 shrink-0 text-white/50" />
            {priceLabel === null ? (
              <span className="text-xs text-white/55">Precio no disponible</span>
            ) : (
              <>
                <span className="text-xs text-white/55">Desde</span>
                <span className="font-semibold">{priceLabel}</span>
              </>
            )}
          </p>

          {outcome === "degraded" && requestedN > seatIds.length ? (
            <p className="rounded-lg bg-primary/15 px-2.5 py-2 text-xs leading-relaxed text-white/85 ring-1 ring-primary/30">
              Encontré {seatIds.length} de {requestedN} sillas juntas. Puedes
              continuar con {seatIds.length === 1 ? "esa silla" : "esas sillas"}{" "}
              o revisar otras opciones.
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-white/75">{reasoning}</p>

          {canPreselect ? (
            <div className="flex flex-col gap-1">
              <Button
                size="lg"
                data-recommendation-cta=""
                onClick={goToPrimarySeats}
                className="w-full"
              >
                Ver y confirmar sillas
              </Button>
              <p className="text-center text-[0.7rem] leading-tight text-white/45">
                Te llevo al mapa con las sillas marcadas. Todavía no se compra
                nada.
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <section data-recommendation-empty="" className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-white/85">
            {alternatives.length > 0
              ? "No encontré esa función disponible, pero mira estas opciones:"
              : "No encontré funciones disponibles con esos criterios."}
          </p>
          <p className="text-xs leading-relaxed text-white/60">{reasoning}</p>
        </section>
      )}

      {alternatives.length > 0 ? (
        <section
          data-recommendation-alternatives=""
          className="flex flex-col gap-2 border-t border-white/10 pt-3"
        >
          <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-white/45">
            {hasPrimary ? "Otras opciones" : "Opciones cercanas"}
          </p>
          <ul className="flex flex-col gap-1.5">
            {alternatives.map((alternative, index) => (
              // The contract dedupes alternatives by `showtimeId`, but a
              // duplicate would only surface as a React key warning — the index
              // suffix keeps that impossible. These rows hold no state, so an
              // index in the key is inert here.
              <li key={`${alternative.showtimeId}-${index}`}>
                <AlternativeRow
                  alternative={alternative}
                  onOpen={goToAlternative}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function AlternativeRow({
  alternative,
  onOpen,
}: {
  alternative: Alternative;
  onOpen: (showtimeId: string) => void;
}) {
  // `qualityTier === null` is the soldout marker (`sse-contract.md:131,144-156`):
  // the entry has no ratable seats, so it is informational only.
  const soldout = alternative.qualityTier === null;

  const metaLabel = joinMeta([
    formatDate(alternative.businessDate, SHORT_DATE_FMT),
    alternative.time,
    alternative.formats.join(" · "),
  ]);
  const priceLabel = formatPrice(alternative.priceFrom);

  return (
    <button
      type="button"
      disabled={soldout}
      data-alternative=""
      data-alternative-soldout={soldout ? "true" : undefined}
      onClick={soldout ? undefined : () => onOpen(alternative.showtimeId)}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left outline-none ring-1 ring-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-primary",
        soldout
          ? "cursor-default bg-white/[0.03] opacity-60"
          : "bg-white/5 hover:bg-white/10",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-white/90">
          {alternative.siteName}
        </span>
        {metaLabel.length > 0 ? (
          <span className="mt-0.5 block truncate text-[0.7rem] text-white/55">
            {metaLabel}
          </span>
        ) : null}
        <span className="mt-0.5 block text-[0.7rem] leading-snug text-white/45">
          {alternative.reason}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs font-semibold text-white/85">
          {priceLabel ?? "Sin precio"}
        </span>
        {soldout ? (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white/70">
            Agotada
          </span>
        ) : (
          <ChevronRight aria-hidden className="size-4 text-white/40" />
        )}
      </span>
    </button>
  );
}
