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

/**
 * Seat map route. Server component: reads the seed data via `getSeats` and
 * `getFilmDetail`, renders the film + function metadata (info card), then
 * mounts the interactive `<SeatMap>` client island.
 *
 * Data is passed to the client as plain props — the reducer/context (see
 * `SelectionProvider`) is the single source of truth for the current
 * selection; the seats list itself never enters context state.
 */
export default async function SeatMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getSeats(id);
  if (!data) notFound();

  const film = await getFilmDetail(data.showtime.filmId);
  if (!film) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 pb-40 pt-8">
      <InfoCard showtime={data.showtime} film={film} />
      <SeatMap
        showtime={data.showtime}
        seats={data.seats}
        summary={data.summary}
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
    <section
      aria-label="Detalles de la función"
      className="flex flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row"
    >
      <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10">
        <Image
          src={film.posterUrl}
          alt={`Póster de ${film.title}`}
          fill
          sizes="128px"
          className="object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold leading-tight text-foreground">
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
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
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
    <div className="flex items-start gap-2">
      <span aria-hidden className="mt-0.5 text-muted-foreground">
        {icon}
      </span>
      <div>
        <dt className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
