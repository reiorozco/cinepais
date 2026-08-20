import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { getFilms, getShowtimes } from "@/lib/api/queries";
import { FilmGridClient } from "@/components/films/film-grid-client";
import { FILM_TABS } from "@/components/films/film-tabs";
import { FormatFilterDialog } from "@/components/films/format-filter-dialog";
import { EmptyState } from "@/components/ui-states/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

/**
 * Dark-surface token overrides applied inline on the catalog section.
 *
 * Not lifted to `globals.css` because Tailwind v4's PostCSS pipeline strips
 * raw attribute selectors like `[data-surface="dark"]` from the output
 * bundle (they aren't matched by any scanned utility class), which silently
 * regresses WCAG-AA contrast on every descendant that uses
 * `text-foreground` / `text-muted-foreground` / `border-border`. Setting
 * the CSS custom properties on the element itself makes them cascade to
 * every descendant without touching any child component.
 */
const DARK_SURFACE_TOKENS = {
  "--foreground": "oklch(0.985 0 0)",
  "--muted-foreground": "oklch(0.72 0 0)",
  "--border": "oklch(1 0 0 / 12%)",
} as CSSProperties;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Películas",
  description:
    "Cartelera completa de CinePaís: estrenos, funciones de hoy y preventa. Filtra por formato IMAX, 2D o Premium.",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type FilmsPageProps = {
  searchParams: Promise<{ format?: string }>;
};

/**
 * `/films` — dark-charcoal catalog (screenshot 02 in the design reference).
 *
 * Server component: fetches films and showtimes at request time, applies
 * the `?format=` filter server-side (via `getShowtimes({ format })`), and
 * derives a per-film city list that the client component uses to complete
 * the filtering by the browser-local `useCity()` selection.
 *
 * Per Todo 9 rules:
 *  - `?format=` is the ONLY searchParam — city stays client-side.
 *  - `searchParams` is a Promise in Next 16 and must be `await`-ed.
 *  - We MUST NOT declare a route-segment config (`dynamic`, etc.) — the
 *    `searchParams` usage already opts this route out of prerendering.
 */
export default async function FilmsPage({ searchParams }: FilmsPageProps) {
  const { format } = await searchParams;

  // Two queries in parallel: films are the display units, showtimes tell us
  // which films are actually programmable under the requested filters.
  const [allFilms, showtimes] = await Promise.all([
    getFilms(),
    getShowtimes({ format }),
  ]);

  // Films that have at least one purchasable showtime under `format`. Any
  // film not in the set is either sold out for that format, cut off by the
  // 15-min purchase window, or simply never programmed in that room.
  const filmIdsWithShowtimes = new Set(showtimes.map((s) => s.filmId));

  // If a format is applied, restrict the grid to matching films. If not,
  // keep the whole catalog — the empty tabs handle the visual affordance.
  const filteredFilms = format
    ? allFilms.filter((f) => filmIdsWithShowtimes.has(f.id))
    : allFilms;

  // Derive `filmId → distinct cities` from the (possibly format-filtered)
  // showtimes. The client uses this to hide films that have no showtime in
  // the currently-selected city. Passing distinct values keeps the payload
  // small even with hundreds of showtimes.
  const filmCityMap: Record<string, string[]> = {};
  for (const s of showtimes) {
    const bucket = filmCityMap[s.filmId] ?? (filmCityMap[s.filmId] = []);
    if (!bucket.includes(s.city)) bucket.push(s.city);
  }

  return (
    <main>
      <section
        data-surface="dark"
        style={DARK_SURFACE_TOKENS}
        className="min-h-screen bg-surface-dark text-white"
      >
        <div className="mx-auto max-w-6xl px-6 py-10">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight text-white">
                Películas
              </h1>
              <p className="mt-1 text-sm text-white/70">
                Cartelera completa en tu ciudad. Filtra por formato para ver
                las funciones que te interesan.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {format ? (
                <Badge
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white"
                >
                  Formato: {format}
                </Badge>
              ) : null}
              <FormatFilterDialog currentFormat={format} />
            </div>
          </header>

          {/* Triggers and panels both project the shared `FILM_TABS` — the same
              config the home page renders. One list is what stops a card from
              surfacing under a tab its `status` badge contradicts. */}
          <Tabs defaultValue={FILM_TABS[0].status} className="gap-6">
            <TabsList
              variant="line"
              className="w-full justify-start border-b border-white/10 bg-transparent"
            >
              {FILM_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.status}
                  value={tab.status}
                  className="text-white/60 hover:text-white data-active:text-white"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {FILM_TABS.map((tab) => {
              // Partition AFTER the `?format=` narrowing, never before. A
              // format therefore empties Pronto: a `pronto` film has no
              // showtimes at all, so no format can match it. Correct, not a
              // filter bug — do not "fix" it.
              const tabFilms = filteredFilms.filter(
                (film) => film.status === tab.status,
              );

              // Reached only when this tab HAS films and the city filter
              // inside the grid drops all of them. A `?format=` is then a
              // second genuine cause, so name it; with no format applied it
              // is not one, and blaming it would be plain false.
              const cityEmpty = format
                ? {
                    title: `No hay funciones en ${format} en tu ciudad`,
                    description: `Estas películas no tienen funciones en formato ${format} en la ciudad que elegiste. Prueba con otro formato o cambia de ciudad.`,
                  }
                : {
                    title: tab.cityEmptyTitle,
                    description: tab.cityEmptyDescription,
                  };

              return (
                <TabsContent
                  key={tab.status}
                  value={tab.status}
                  className="text-white"
                >
                  {tabFilms.length === 0 ? (
                    <EmptyState
                      title={tab.emptyTitle}
                      description={tab.emptyDescription}
                    />
                  ) : (
                    <FilmGridClient
                      films={tabFilms}
                      filmCityMap={filmCityMap}
                      emptyTitle={cityEmpty.title}
                      emptyDescription={cityEmpty.description}
                    />
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </section>
    </main>
  );
}
