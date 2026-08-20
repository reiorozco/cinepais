import type { Film } from "@/lib/api/schemas";

/** Everything a catalogue tab needs except the status it is keyed by. */
type FilmTabCopy = {
  label: string;
  /** Copy for the genuine "this status has no films" case. */
  emptyTitle: string;
  emptyDescription: string;
  /**
   * Copy for the *other* empty case: this status does have films, the
   * visitor's city just plays none of them. Separate from the pair above
   * because one message for both causes is wrong in one of the two.
   */
  cityEmptyTitle: string;
  cityEmptyDescription: string;
};

/** One catalogue tab: a status plus the copy that describes it. */
export type FilmTab = FilmTabCopy & {
  /** Catalogue status this tab shows. Also the tab's `value`. */
  status: Film["status"];
};

/**
 * Copy for every catalogue status, written in display order.
 *
 * Typed as a total `Record` on purpose — the same guarantee `STATUS_BADGE`
 * (`./film-card.tsx`) gives for the badge: adding a value to `FilmStatusSchema`
 * breaks this map at compile time instead of silently rendering one tab fewer
 * than there are statuses.
 */
const FILM_TAB_COPY: Record<Film["status"], FilmTabCopy> = {
  cartelera: {
    label: "Cartelera",
    emptyTitle: "Aún no hay funciones",
    emptyDescription:
      "Vuelve pronto o cambia de ciudad para ver la cartelera disponible.",
    cityEmptyTitle: "No hay funciones en tu ciudad",
    cityEmptyDescription:
      "Estas películas están en cartelera, pero no se proyectan en la ciudad que elegiste. Cambia de ciudad para ver sus funciones.",
  },
  pronto: {
    label: "Pronto",
    emptyTitle: "Aún no hay próximos estrenos",
    emptyDescription:
      "Estamos preparando los estrenos que vienen. Vuelve pronto para verlos aquí.",
    cityEmptyTitle: "No hay próximos estrenos en tu ciudad",
    cityEmptyDescription:
      "Estos estrenos todavía no llegan a la ciudad que elegiste. Cambia de ciudad o vuelve pronto para verlos aquí.",
  },
  preventa: {
    label: "Preventa",
    emptyTitle: "Aún no hay preventas abiertas",
    emptyDescription:
      "Cuando abramos la venta anticipada de un estreno, aparecerá en esta pestaña.",
    cityEmptyTitle: "No hay preventas en tu ciudad",
    cityEmptyDescription:
      "La venta anticipada de estos estrenos está abierta en otras ciudades. Cambia de ciudad para comprar tus boletas.",
  },
};

/**
 * The catalogue tabs, in display order. Each one is a pure projection of
 * `film.status` — the same field `FilmCard` derives its badge from, so a card
 * can never appear under a tab its badge contradicts, and no film can show up
 * under two tabs.
 *
 * Lives here rather than inside a page because `/` and `/films` render the
 * very same tabs: a private copy in either one is exactly how the two drift
 * into disagreeing about what a status means.
 *
 * Derived from `FILM_TAB_COPY` so there is no second list to keep in sync —
 * string keys iterate in insertion order, so the order written above is the
 * order rendered.
 */
export const FILM_TABS: readonly FilmTab[] = (
  Object.keys(FILM_TAB_COPY) as Film["status"][]
).map((status) => ({ status, ...FILM_TAB_COPY[status] }));
