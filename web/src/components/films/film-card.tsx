import type { ComponentProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Film } from "@/lib/api/schemas";

type FilmCardProps = {
  film: Film;
  /**
   * Whether the poster is fetched with high priority. Pass `true` for a small
   * number of above-the-fold cards to help LCP; leave `false` (default) for the
   * long tail below the fold.
   */
  priority?: boolean;
};

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

/**
 * Marketing badge per catalogue status — the single source of truth shared with
 * the home tabs and the hero carousel, which key off the very same
 * `film.status` field. Exported rather than duplicated: the hero previously
 * hardcoded "Estreno" on every slide, which lied the moment a `preventa` or
 * `pronto` title reached it.
 *
 * Typed as a total `Record` on purpose: adding a value to `FilmStatusSchema`
 * breaks this map at compile time instead of silently rendering no badge.
 *
 * `pronto` titles are not purchasable yet, so they get the quietest variant and
 * must not compete with the two states that can actually convert.
 */
export const STATUS_BADGE: Record<
  Film["status"],
  { label: string; variant: BadgeVariant }
> = {
  cartelera: { label: "Estreno", variant: "default" },
  preventa: { label: "Preventa", variant: "secondary" },
  pronto: { label: "Pronto", variant: "outline" },
};

/**
 * Poster card used in the cartelera grid.
 *
 * Server component: no interactivity beyond the wrapping `<Link>`, which
 * navigates to the film detail route. The Estreno / Preventa / Pronto badge is
 * derived from `film.status` — the same field the home page filters its tabs
 * on, so a card can never advertise a state its tab contradicts.
 */
export function FilmCard({ film, priority = false }: FilmCardProps) {
  const badge = STATUS_BADGE[film.status];
  const genresLabel = film.genres.join(" · ");

  return (
    <Link
      href={`/films/${film.id}`}
      className="group/film-card block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`Ver ${film.title}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 aspect-[2/3]">
        <Image
          src={film.posterUrl}
          alt={`Póster de ${film.title}`}
          fill
          sizes="(min-width: 1024px) 16vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover/film-card:scale-[1.02]"
          priority={priority}
        />
        <Badge
          variant={badge.variant}
          className="absolute left-2 top-2 shadow-sm"
        >
          {badge.label}
        </Badge>
      </div>

      <div className="mt-3 space-y-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
          {film.title}
        </h3>
        {genresLabel ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {genresLabel}
          </p>
        ) : null}
        {/* No `/80` here: at 11px the muted token is already at 4.6:1, and
            fading it dropped rating + runtime — the two facts a visitor scans
            before picking a film — to 3.23:1, under the 4.5:1 AA floor. */}
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {film.rating} · {film.durationMin} min
        </p>
      </div>
    </Link>
  );
}
