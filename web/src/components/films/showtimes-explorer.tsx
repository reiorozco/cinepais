"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EmptyState } from "@/components/ui-states/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCity } from "@/components/providers/city-provider";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FormatSchema, type Showtime } from "@/lib/api/schemas";
import type { z } from "zod";

type Format = z.infer<typeof FormatSchema>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Sentinel value for the "all formats" tab. Not part of the Format union. */
const ALL_FORMATS = "todos" as const;
type FormatFilter = typeof ALL_FORMATS | Format;

/**
 * Room slug → human label. Kept in sync with the seat-map info card. Unknown
 * slugs fall back to `Sala <slug>` so a new room type in the seed never
 * breaks the UI, only shows a raw slug until the map is updated.
 */
const ROOM_LABEL: Record<string, string> = {
  imax: "Sala IMAX",
  "2d-1": "Sala 1",
  "2d-2": "Sala 2",
  premium: "Sala Premium",
};

function roomLabel(room: string): string {
  return ROOM_LABEL[room] ?? `Sala ${room}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Format "2026-08-06" → { weekday: "VIE", day: "6", month: "AGO" }.
 *
 * Parses as UTC midnight so the labels don't shift by ±1 day depending on
 * the runtime timezone (Bogotá is UTC-5; `new Date("2026-08-06")` in a UTC
 * formatter yields Aug 5 without `timeZone: "UTC"`).
 */
function formatDateLabel(businessDate: string): {
  weekday: string;
  day: string;
  month: string;
} {
  const d = new Date(`${businessDate}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday").replace(".", "").toUpperCase(),
    day: get("day"),
    month: get("month").replace(".", "").toUpperCase(),
  };
}

/**
 * Today's date in Colombia (`YYYY-MM-DD`), used to label the "HOY" chip.
 *
 * The `en-CA` locale conveniently emits ISO 8601; pinning the timezone to
 * `America/Bogota` matches the seed's business-day semantics (a showtime at
 * 22:45 on Aug 6 belongs to Aug 6 in Bogotá even if it crosses midnight in
 * UTC). Computed once at render time — the tiny risk of a stale label at
 * exactly midnight Colombia time is acceptable for a portfolio demo.
 */
function todayInBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Format "19:30" (24h) → "7:30 p. m." (12h Colombian style). The es-CO
 * formatter emits a period-separated AM/PM marker which reads naturally in
 * Spanish; keep as-is rather than uppercasing.
 */
function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ref = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(ref);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ShowtimesExplorerProps = {
  /** All purchasable showtimes for the current film (already cutoff-filtered). */
  showtimes: Showtime[];
};

/**
 * Interactive explorer under the film's ficha.
 *
 * Client component: keeps the selected date and format in local state and
 * consumes the shared `useCity()` selection. Never re-fetches — the parent
 * server component hands us the full purchasable list for the film, and we
 * pivot in-memory on every filter change.
 *
 * Filtering pipeline (order matters — cheap filters first):
 *   1. city   → dropped based on `useCity()`. Cheapest, most selective.
 *   2. date   → user picks one from the 7-day carousel.
 *   3. format → user picks "Todos" or a specific format. The tab list is
 *               derived from the (city ∩ date) intersection so it never
 *               offers a format that has zero results in the current slice.
 */
export function ShowtimesExplorer({ showtimes }: ShowtimesExplorerProps) {
  const { city } = useCity();

  // City-filtered slice: base for the date / format / accordion derivations.
  const cityShowtimes = useMemo(
    () => showtimes.filter((s) => s.city === city),
    [showtimes, city]
  );

  // Distinct dates (ascending), capped at 7 to match the design reference.
  // The seed produces at most 7 days per SEED_NOW, so this is usually a
  // no-op — the cap defends against future scheduling changes.
  const dates = useMemo(() => {
    const set = new Set(cityShowtimes.map((s) => s.businessDate));
    return Array.from(set).sort().slice(0, 7);
  }, [cityShowtimes]);

  const [selectedDate, setSelectedDate] = useState<string | null>(
    dates[0] ?? null
  );

  // If the current selection disappears (city change removes it), gracefully
  // slide to the first available date without forcing an empty view.
  const activeDate =
    selectedDate && dates.includes(selectedDate)
      ? selectedDate
      : (dates[0] ?? null);

  const dateShowtimes = useMemo(
    () => cityShowtimes.filter((s) => s.businessDate === activeDate),
    [cityShowtimes, activeDate]
  );

  // Formats available for the selected date, sorted with a stable canonical
  // order (IMAX → Premium → 2D → …) so the tab list doesn't jitter as dates
  // change. Unknown formats fall to the end alphabetically.
  const formats = useMemo(() => derivedFormats(dateShowtimes), [dateShowtimes]);

  const [selectedFormat, setSelectedFormat] = useState<FormatFilter>(
    ALL_FORMATS
  );

  const activeFormat: FormatFilter =
    selectedFormat === ALL_FORMATS ||
    (formats as readonly string[]).includes(selectedFormat)
      ? selectedFormat
      : ALL_FORMATS;

  const filteredShowtimes = useMemo(() => {
    if (activeFormat === ALL_FORMATS) return dateShowtimes;
    return dateShowtimes.filter((s) => s.formats.includes(activeFormat));
  }, [dateShowtimes, activeFormat]);

  const bySite = useMemo(() => groupBySite(filteredShowtimes), [filteredShowtimes]);
  const siteNames = Object.keys(bySite);

  // Controlled Accordion state: base-ui does not re-apply `defaultValue`
  // when the component remounts, so we drive the open panel ourselves and
  // auto-open the first cinema whenever the site list identity changes
  // (city / date / format switch).
  const siteNamesKey = siteNames.join("|");
  const [expandedSites, setExpandedSites] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting UI state in response to a derived-value change (siteNames) is a documented exception to this rule; the alternative (key-based reset) doesn't work with controlled components that own their state in the parent
    setExpandedSites(siteNames.length > 0 ? [siteNames[0]!] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- siteNamesKey is derived from siteNames and captures the identity change; using siteNamesKey instead of siteNames avoids unnecessary re-runs when siteNames array reference changes but content doesn't
  }, [siteNamesKey]);

  const today = todayInBogota();

  return (
    <div className="flex flex-col gap-6">
      {/* Date selector */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Fecha
        </p>
        {dates.length === 0 ? (
          <EmptyState
            title={`Sin funciones disponibles en ${city}`}
            description="Prueba cambiar de ciudad en el selector del encabezado."
          />
        ) : (
          <div
            role="tablist"
            aria-label="Selector de fecha"
            className="flex gap-2 overflow-x-auto pb-2"
          >
            {dates.map((d) => {
              const label = formatDateLabel(d);
              const isToday = d === today;
              const isActive = d === activeDate;
              return (
                <button
                  key={d}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-label={`${isToday ? "Hoy, " : ""}${label.weekday} ${label.day} de ${label.month}`}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "flex min-w-[76px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 text-center transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted"
                  )}
                >
                  <span className="text-[11px] font-semibold tracking-wide">
                    {isToday ? "HOY" : label.weekday}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {label.day}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium tracking-wide",
                      isActive ? "text-primary-foreground/85" : "text-muted-foreground"
                    )}
                  >
                    {label.month}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Format tabs — only render when we have a selected date */}
      {activeDate ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Formato
          </p>
          <Tabs
            value={activeFormat}
            onValueChange={(v) => {
              if (typeof v === "string") setSelectedFormat(v as FormatFilter);
            }}
          >
            <TabsList variant="line" className="w-full justify-start border-b bg-transparent">
              <TabsTrigger value={ALL_FORMATS}>Todos</TabsTrigger>
              {formats.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {f}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      {/* Accordion per cinema */}
      {activeDate ? (
        siteNames.length === 0 ? (
          <EmptyState
            title="No hay funciones este día en este formato"
            description="Cambia de fecha o de formato para ver más opciones."
          />
         ) : (
           <Accordion
             multiple
             value={expandedSites}
             onValueChange={(v) => {
               if (Array.isArray(v)) setExpandedSites(v as string[]);
             }}
             className="rounded-xl border border-border bg-card"
           >
            {siteNames.map((siteName) => {
              const items = bySite[siteName];
              const formatSummary = summarizeFormats(items);
              return (
                <AccordionItem
                  key={siteName}
                  value={siteName}
                  className="px-4"
                >
                  <AccordionTrigger className="py-4">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-base font-semibold text-foreground">
                        {siteName}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {items.length}{" "}
                        {items.length === 1 ? "función" : "funciones"} ·{" "}
                        {formatSummary}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 lg:grid-cols-4">
                      {items.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={`/showtimes/${s.id}`}
                            aria-label={`Ver sillas para las ${formatTime12h(s.time)} en ${roomLabel(s.room)} — desde ${formatCOP(s.priceFrom)}`}
                            className="group/showtime-card flex h-full flex-col gap-1 rounded-lg border border-border bg-background p-3 !no-underline transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:!text-foreground hover:shadow-sm focus-visible:-translate-y-0.5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            <span className="text-lg font-bold leading-none text-foreground">
                              {formatTime12h(s.time)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {roomLabel(s.room)} · {s.formats.join(" · ")}
                            </span>
                            <span className="mt-1 text-xs font-medium text-primary">
                              Desde {formatCOP(s.priceFrom)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Canonical order for the format tabs. Anything outside this list falls to
 * the end in alphabetical order, so the tab strip stays stable even if a
 * new format shows up in the seed before this list is updated.
 */
const FORMAT_ORDER: readonly Format[] = ["IMAX", "Premium", "2D", "Onyx", "Doblada", "Subtitulada"];

function derivedFormats(showtimes: Showtime[]): Format[] {
  const set = new Set<Format>();
  for (const s of showtimes) for (const f of s.formats) set.add(f);
  const known = FORMAT_ORDER.filter((f) => set.has(f));
  const unknown = Array.from(set)
    .filter((f) => !(FORMAT_ORDER as readonly string[]).includes(f))
    .sort();
  return [...known, ...unknown];
}

function groupBySite(showtimes: Showtime[]): Record<string, Showtime[]> {
  const out: Record<string, Showtime[]> = {};
  for (const s of showtimes) {
    (out[s.siteName] ??= []).push(s);
  }
  // Sort each cinema's showtimes by time and sort site keys alphabetically
  // by inserting them into a fresh, ordered object.
  const sortedKeys = Object.keys(out).sort((a, b) => a.localeCompare(b, "es"));
  const sorted: Record<string, Showtime[]> = {};
  for (const key of sortedKeys) {
    sorted[key] = out[key]!.slice().sort((a, b) => a.time.localeCompare(b.time));
  }
  return sorted;
}

/**
 * "IMAX · 2D · Premium" summary for the accordion header. Deduplicates
 * formats across the site's showtimes and preserves canonical order.
 */
function summarizeFormats(showtimes: Showtime[]): string {
  const set = new Set<Format>();
  for (const s of showtimes) for (const f of s.formats) set.add(f);
  const ordered = FORMAT_ORDER.filter((f) => set.has(f));
  return ordered.length > 0 ? ordered.join(" · ") : "";
}
