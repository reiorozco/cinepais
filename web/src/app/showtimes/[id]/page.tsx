import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getFilmDetail, getSeats } from "@/lib/api/queries";
import { SeatMap } from "@/components/seats/seat-map";
import type { FilmDetail, Showtime } from "@/lib/api/schemas";

/**
 * Room-code → human label. The DB stores room slugs (`imax`, `2d-1`,
 * `premium`); this map produces the label a moviegoer expects on their
 * ticket. Unknown rooms fall back to `Sala <slug>` so the UI never breaks
 * if a new room type is seeded before this map is updated.
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

// businessDate is "YYYY-MM-DD"; we parse it strictly as UTC to avoid
// timezone-drift bugs (e.g. Bogotá is UTC-5, so `new Date("2026-08-05")`
// in local time would render as Aug 4 in a UTC-based Intl formatter).
const DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatShowtimeDate(businessDate: string): string {
  const d = new Date(`${businessDate}T00:00:00Z`);
  const text = DATE_FMT.format(d);
  // Intl outputs lowercase weekday names in es-CO; capitalize for polish.
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// `?preselect=` URL contract
// ---------------------------------------------------------------------------

/** Business max is 4 seats; 8 leaves slack for dropped candidates while
 *  keeping a hostile `?preselect=a,a,…×10000` from driving an unbounded loop. */
const MAX_PRESELECT_IDS = 8;

/**
 * Tames the raw `?preselect=` string. Seat existence, availability and
 * adjacency are the reducer's job — checking them here would create a second
 * rule implementation that can drift.
 *
 * The `typeof` guard is NOT redundant with the annotation: Next resolves a
 * repeated key (`?preselect=a&preselect=b`) to `string[]`, which is outside
 * the declared type but well inside what a user can type.
 */
function parsePreselectParam(raw: string | undefined): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((seatId) => seatId.trim())
    .filter((seatId) => seatId.length > 0)
    .slice(0, MAX_PRESELECT_IDS);
}

type SeatMapPageProps = {
  params: Promise<{ id: string }>;
  /** `?preselect=<seatId>,<seatId>` — the copilot hand-off contract. */
  searchParams: Promise<{ preselect?: string }>;
};

/**
 * `generateMetadata` and the page body both need the same two rows, and
 * `getSeats` pulls every seat in the room (up to 260). `cache()` collapses
 * them into one query per request — without it, adding a title would have
 * doubled the heaviest read in the app.
 */
const loadShowtime = cache(async (id: string) => {
  const data = await getSeats(id);
  if (!data) return null;

  const film = await getFilmDetail(data.showtime.filmId);
  if (!film) return null;

  return { data, film };
});

export async function generateMetadata({
  params,
}: SeatMapPageProps): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadShowtime(id);
  if (!loaded) return { title: "Función no encontrada" };

  const { data, film } = loaded;
  const { showtime } = data;

  return {
    title: `Sillas · ${film.title} — ${showtime.time}`,
    description: `Elige tus sillas para ${film.title} en ${showtime.siteName} (${showtime.city}), ${formatShowtimeDate(showtime.businessDate)} a las ${showtime.time}.`,
  };
}

/**
 * Seat map route. Server component: reads the seed data via `getSeats` and
 * `getFilmDetail`, renders the film + function metadata (info card), then
 * mounts the interactive `<SeatMap>` client island.
 *
 * Data is passed to the client as plain props — the reducer/context (see
 * `SelectionProvider`) is the single source of truth for the current
 * selection; the seats list itself never enters context state.
 *
 * `params` and `searchParams` are both Promises in Next 16. Reading
 * `searchParams` opts this route out of prerendering on its own — do NOT add
 * a route-segment config to force it.
 */
export default async function SeatMapPage({
  params,
  searchParams,
}: SeatMapPageProps) {
  const { id } = await params;
  const { preselect } = await searchParams;

  const preselectSeatIds = parsePreselectParam(preselect);

  const loaded = await loadShowtime(id);
  if (!loaded) notFound();

  const { data, film } = loaded;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-40 pt-6 sm:pt-8">
      <InfoCard showtime={data.showtime} film={film} />
      <SeatMap
        showtime={data.showtime}
        seats={data.seats}
        summary={data.summary}
        preselectSeatIds={preselectSeatIds}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// InfoCard — poster + title + badges + site/room/date/time/duration
// ---------------------------------------------------------------------------

function InfoCard({
  showtime,
  film,
}: {
  showtime: Showtime;
  film: FilmDetail;
}) {
  return (
    /* Compact on touch. Everything on this card restates a decision the
       visitor made on the previous screen, and at 390px the full-size version
       pushed all 260 seats — the entire point of the route — below the fold.
       The poster is the biggest offender (128×192) and is dropped outright
       under `sm:`; nothing here is load-bearing that the title does not
       already carry. */
    <section
      aria-label="Detalles de la función"
      className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:gap-6 sm:p-6"
    >
      <div className="relative hidden aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 sm:block">
        <Image
          src={film.posterUrl}
          alt={`Póster de ${film.title}`}
          fill
          sizes="128px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 sm:gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold leading-tight text-foreground sm:text-2xl">
            {film.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {film.rating} · {film.durationMin} min · {film.genres.join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {showtime.formats.map((format) => (
            <Badge key={format} variant="secondary">
              {format}
            </Badge>
          ))}
        </div>
        <dl className="flex flex-col gap-1.5 text-sm sm:grid sm:grid-cols-3 sm:gap-4">
          <InfoField
            icon={<MapPin className="size-4" />}
            label="Sede"
            value={`${showtime.siteName} · ${showtime.city}`}
          />
          <InfoField
            icon={<Calendar className="size-4" />}
            label="Función"
            value={`${formatShowtimeDate(showtime.businessDate)} · ${showtime.time}`}
          />
          <InfoField
            icon={<Clock className="size-4" />}
            label="Sala"
            value={roomLabel(showtime.room)}
          />
        </dl>
      </div>
    </section>
  );
}

function InfoField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 sm:items-start">
      <span
        aria-hidden
        className="shrink-0 text-muted-foreground sm:mt-0.5"
      >
        {icon}
      </span>
      {/* One line per field on touch: the icon already carries the category,
          so the uppercase label is redundant there and costs a whole row each.
          `sr-only` keeps the `<dt>` present for the `<dl>` pairing and for
          screen readers, which never see the icon. */}
      <div className="min-w-0">
        <dt className="sr-only sm:not-sr-only sm:text-xs sm:uppercase sm:tracking-widest sm:text-muted-foreground">
          {label}
        </dt>
        <dd className="font-medium text-foreground sm:mt-0.5">{value}</dd>
      </div>
    </div>
  );
}
