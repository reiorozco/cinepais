import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Film } from "@/lib/api/schemas";

type FilmCardProps = {
  film: Film;
  /**
   * Whether the poster should be preloaded. Pass `true` for a small number
   * of above-the-fold cards to help LCP; leave `false` (default) for the
   * long tail below the fold.
   */
  preload?: boolean;
};

/**
 * Poster card used in the cartelera grid.
 *
 * Server component: no interactivity beyond the wrapping `<Link>`, which
 * navigates to the film detail route. The Estreno / Preventa badge is
 * derived from the film id suffix (`01..06` = Estreno, `09..10` = Preventa)
 * per Fase 1 seed conventions — nothing else about the card is dynamic.
 */
export function FilmCard({ film, preload = false }: FilmCardProps) {
  const badge = badgeForFilmId(film.id);
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
          preload={preload}
        />
        {badge ? (
          <Badge
            variant={badge === "Estreno" ? "default" : "secondary"}
            className="absolute left-2 top-2 shadow-sm"
          >
            {badge}
          </Badge>
        ) : null}
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
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {film.rating} · {film.durationMin} min
        </p>
      </div>
    </Link>
  );
}

/**
 * Derive the marketing badge from a film id. Seed data uses `film-01`
 * through `film-10`; the last two characters identify the slot.
 *
 * - `01`–`06` → "Estreno" (marketing-heavy releases in the hero carousel + top of grid)
 * - `09`–`10` → "Preventa" (advance-sales, not yet in theatres)
 * - `07`–`08` → no badge (regular catalog)
 */
function badgeForFilmId(id: string): "Estreno" | "Preventa" | null {
  const suffix = id.slice(-2);
  if (["01", "02", "03", "04", "05", "06"].includes(suffix)) return "Estreno";
  if (["09", "10"].includes(suffix)) return "Preventa";
  return null;
}
