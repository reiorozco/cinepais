import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ShowtimesExplorer } from "@/components/films/showtimes-explorer";
import { getFilmDetail, getShowtimes } from "@/lib/api/queries";
import type { FilmDetail } from "@/lib/api/schemas";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

type FilmDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Per-film `<title>` and description. Runs after `params` resolves so the
 * browser tab always reflects the movie the user is looking at. If the film
 * cannot be found we defer the 404 to the page render — Next won't render
 * this metadata unless the page component also completes, so a `notFound`
 * later still produces the correct 404 UI.
 */
export async function generateMetadata({
  params,
}: FilmDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const film = await getFilmDetail(id);
  if (!film) {
    return { title: "Película no encontrada" };
  }
  return {
    title: film.title,
    description:
      film.synopsis.length > 155
        ? `${film.synopsis.slice(0, 152)}…`
        : film.synopsis,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * `/films/[id]` — film detail (screenshot 03 in the design reference).
 *
 * Server component: fetches the film's descriptor and its full purchasable
 * showtime list in parallel, then hands the showtimes to the client-only
 * `ShowtimesExplorer` for date / format / city pivoting. Note the API
 * already applies the 15-minute cutoff — the client never has to worry
 * about excluding started shows.
 *
 * Per Todo 10 rules:
 *  - `params` is a Promise in Next 16 and must be `await`-ed.
 *  - City filtering stays client-side (via `useCity()`); we deliberately
 *    do NOT accept a `?city=` searchParam and do NOT pre-filter here.
 *  - No route-segment config exports (`dynamic`, `revalidate`, ...) — the
 *    dynamic `params` already opts this route out of prerendering.
 */
export default async function FilmDetailPage({ params }: FilmDetailPageProps) {
  const { id } = await params;

  // Fetch film + showtimes in parallel. A missing film short-circuits to
  // the 404 UI without waiting for the (possibly empty) showtime query to
  // finish parsing.
  const [film, showtimes] = await Promise.all([
    getFilmDetail(id),
    getShowtimes({ filmId: id }),
  ]);

  if (!film) notFound();

  const durationLabel = formatDuration(film.durationMin);

  return (
    <main>
      {/* Backdrop hero: blurred poster + tint + title overlay */}
      <section
        aria-label={`Presentación de ${film.title}`}
        className="relative isolate h-64 overflow-hidden bg-brand-header md:h-80"
      >
        <Image
          src={film.posterUrl}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          priority
          className="scale-110 object-cover blur-md brightness-75"
        />
        {/* Layered gradient reads well on any poster hue */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-brand-header via-brand-header/70 to-brand-header/40"
        />
        <div className="relative mx-auto flex h-full max-w-6xl items-end px-6 pb-8">
          <div className="flex flex-col gap-3 text-white">
            <div className="flex flex-wrap gap-1.5">
              {film.genres.map((g) => (
                <Badge
                  key={g}
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white backdrop-blur"
                >
                  {g}
                </Badge>
              ))}
            </div>
            <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              {film.title}
            </h1>
            <p className="text-sm text-white/80">
              {film.rating} · {durationLabel}
            </p>
          </div>
        </div>
      </section>

      {/* Ficha: poster + metadata + synopsis */}
      <section
        aria-label="Ficha técnica"
        className="mx-auto max-w-6xl px-6 py-10"
      >
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 md:w-48">
            <Image
              src={film.posterUrl}
              alt={`Póster de ${film.title}`}
              fill
              sizes="(min-width: 768px) 192px, 160px"
              className="object-cover"
            />
          </div>
          <div className="flex-1">
            <FilmMetaList film={film} durationLabel={durationLabel} />
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Sinopsis
              </h2>
              <p className="max-w-prose text-sm leading-relaxed text-foreground/90">
                {film.synopsis}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Horarios: date / format / city → accordion per cinema */}
      <section
        id="horarios"
        aria-label="Horarios disponibles"
        className="mx-auto max-w-6xl px-6 pb-16"
      >
        <h2 className="mb-6 font-heading text-2xl font-bold tracking-tight text-foreground">
          Horarios
        </h2>
        <ShowtimesExplorer showtimes={showtimes} />
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Ficha helpers
// ---------------------------------------------------------------------------

/**
 * Two-column definition list with the classic cinema-page fields. Uses
 * `<dl>` semantics so screen readers announce label/value pairs correctly
 * — a plain `<div>` grid would strip that structure.
 */
function FilmMetaList({
  film,
  durationLabel,
}: {
  film: FilmDetail;
  durationLabel: string;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <MetaRow label="Director" value={film.director} />
      <MetaRow label="Duración" value={durationLabel} />
      <MetaRow label="Género" value={film.genres.join(", ")} />
      <MetaRow label="Clasificación" value={film.rating} />
      <MetaRow
        label="Reparto"
        value={film.cast.join(", ")}
        span="sm:col-span-2"
      />
    </dl>
  );
}

function MetaRow({
  label,
  value,
  span,
}: {
  label: string;
  value: string;
  span?: string;
}) {
  return (
    <div className={span}>
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}

/**
 * 165 → "2h 45m", 90 → "1h 30m", 45 → "45m". Keeps the hour-less variant
 * for shorts so we never show "0h 45m" (visually noisy and unnatural in
 * Spanish).
 */
function formatDuration(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
