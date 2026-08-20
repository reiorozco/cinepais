"use client";

import { useMemo } from "react";
import { FilmCard } from "@/components/films/film-card";
import { EmptyState } from "@/components/ui-states/empty-state";
import { useCity } from "@/components/providers/city-provider";
import type { Film } from "@/lib/api/schemas";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FilmGridClientProps = {
  /** Films already filtered server-side by any format `?format=` param. */
  films: Film[];
  /**
   * Map of `filmId → distinct city names` derived server-side from the
   * matching showtimes. This lets us do city filtering entirely on the
   * client (per `useCity()`) without a second round-trip to the server —
   * see Todo 6 / plan §Todo 9 for the "no `?city=` searchParam" rule.
   */
  filmCityMap: Record<string, string[]>;
  /**
   * Copy for the one way this grid empties: `films` arrived non-empty and
   * the city filter removed every last one. The caller words it because only
   * it knows the tab and whether a `?format=` is also to blame — guessing
   * that cause here is what made the old single message wrong.
   */
  emptyTitle: string;
  emptyDescription?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Client wrapper around the film grid that narrows the server-fetched list
 * by the user's `useCity()` selection. Cities are stored in `localStorage`,
 * so we cannot filter server-side without shipping the choice up.
 *
 * The `filmCityMap` prop is the sole source of truth for "does this film
 * have any showtime in the current city": we deliberately do NOT re-fetch
 * from the API here — the server has already computed the intersection.
 */
export function FilmGridClient({
  films,
  filmCityMap,
  emptyTitle,
  emptyDescription,
}: FilmGridClientProps) {
  const { city } = useCity();

  const visibleFilms = useMemo(() => {
    return films.filter((film) => {
      const cities = filmCityMap[film.id];
      // No entry at all means zero showtimes anywhere — true by construction
      // for every `pronto` title. That is an announcement, not a listing, so
      // no city can claim or exclude it. (A film whose showtimes merely lost
      // the `?format=` filter never reaches here; the server drops it from
      // `films` first.) Narrowing these by city silently emptied Pronto.
      if (!cities || cities.length === 0) return true;
      return cities.includes(city);
    });
  }, [films, filmCityMap, city]);

  if (visibleFilms.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul
      role="list"
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      {visibleFilms.map((film, index) => (
        <li key={film.id}>
          <FilmCard film={film} priority={index < 6} />
        </li>
      ))}
    </ul>
  );
}
