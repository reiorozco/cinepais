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
  /** Message displayed when the intersection is empty. */
  emptyMessage: string;
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
  emptyMessage,
}: FilmGridClientProps) {
  const { city } = useCity();

  const visibleFilms = useMemo(() => {
    return films.filter((film) => {
      const cities = filmCityMap[film.id];
      // No showtimes at all → the film is intentionally in the current
      // list (e.g. no format filter) but we can't guarantee city presence.
      // Drop it from the city-scoped view to keep the grid honest.
      if (!cities || cities.length === 0) return false;
      return cities.includes(city);
    });
  }, [films, filmCityMap, city]);

  if (visibleFilms.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <ul
      role="list"
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      {visibleFilms.map((film, index) => (
        <li key={film.id}>
          <FilmCard film={film} preload={index < 6} />
        </li>
      ))}
    </ul>
  );
}
