import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Calendar, MapPin, Clock } from "lucide-react";
import { getSeats, getFilmDetail } from "@/lib/api/queries";
import { formatCOP } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SelectionClearer } from "@/components/checkout/selection-clearer";

/**
 * Static, not `generateMetadata`. This URL is shareable — it carries `order`,
 * `showtimeId` and `seatIds` — and putting someone's order number in a page
 * title they might paste into a chat is a worse default than a generic one.
 */
export const metadata: Metadata = {
  title: "Boletas confirmadas",
  description:
    "Confirmación de boletas CinePaís. Demo con datos ficticios — no se realizó ningún cobro.",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AREA_LABELS: Record<string, string> = {
  general: "General",
  preferential: "Preferencial",
  premium: "Premium",
  wheelchair: "Acceso preferente",
};

const ROOM_LABEL: Record<string, string> = {
  imax: "Sala IMAX",
  "2d-1": "Sala 1",
  "2d-2": "Sala 2",
  premium: "Sala Premium",
};

const DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatShowtimeDate(businessDate: string): string {
  const d = new Date(`${businessDate}T00:00:00Z`);
  const text = DATE_FMT.format(d);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Confirmation Page — SERVER component
// ---------------------------------------------------------------------------

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{
    order?: string;
    showtimeId?: string;
    seatIds?: string;
  }>;
}) {
  const { order, showtimeId, seatIds } = await searchParams;

  // All three params are required; missing any → 404
  if (!order || !showtimeId || !seatIds) notFound();

  const data = await getSeats(showtimeId);
  if (!data) notFound();

  const film = await getFilmDetail(data.showtime.filmId);
  if (!film) notFound();

  const seatIdList = seatIds.split(",").filter(Boolean);
  const seats = data.seats.filter((s) => seatIdList.includes(s.seatId));

  // If none of the requested seat IDs exist in this showtime → 404
  if (seats.length === 0) notFound();

  const total = seats.reduce((sum, s) => sum + s.price, 0);
  const roomLabel =
    ROOM_LABEL[data.showtime.room] ?? `Sala ${data.showtime.room}`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* Clear the client-side seat selection on mount (side-effect island) */}
      <SelectionClearer />

      {/* ── Success header ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center text-center mb-10">
        <CheckCircle2
          className="size-16 text-seat-selected mb-4"
          aria-hidden
        />
        <h1 className="font-heading text-3xl font-semibold text-foreground mb-2">
          ¡Boletas confirmadas!
        </h1>
        <p className="text-muted-foreground">
          Orden{" "}
          <span className="font-mono font-semibold text-foreground">
            {order}
          </span>
        </p>
      </div>

      {/* ── Film + función info ───────────────────────────────────────────── */}
      <section
        aria-label="Detalles de la función"
        className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 mb-4"
      >
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3">
          {film.title}
        </h2>
        <dl className="grid gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                Sede
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {data.showtime.siteName} · {data.showtime.city}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                Función
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {formatShowtimeDate(data.showtime.businessDate)} ·{" "}
                {data.showtime.time}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                Sala · Formato
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {roomLabel} · {data.showtime.formats.join(", ")}
              </dd>
            </div>
          </div>
        </dl>
      </section>

      {/* ── Seat recap ───────────────────────────────────────────────────── */}
      <section
        aria-label="Boletas"
        className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 mb-6"
      >
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
          Boletas ({seats.length})
        </h2>
        <ul className="divide-y divide-foreground/5">
          {seats.map((seat) => {
            const rowLetter = String.fromCharCode(64 + seat.row);
            const areaLabel =
              AREA_LABELS[seat.areaCategory] ?? seat.areaCategory;
            return (
              <li
                key={seat.seatId}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">
                    Fila {rowLetter}, asiento {seat.col}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {areaLabel}
                  </span>
                </div>
                <span className="text-foreground tabular-nums">
                  {formatCOP(seat.price)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between font-semibold text-foreground border-t border-foreground/10 pt-3 mt-3">
          <span>Total</span>
          <span className="tabular-nums">{formatCOP(total)}</span>
        </div>
      </section>

      {/* ── Demo disclaimer ───────────────────────────────────────────────── */}
      <p className="text-sm text-muted-foreground text-center mb-8 px-4">
        Esto es una demo — no se realizó ningún cobro.
      </p>

      {/* ── Back to catalog ───────────────────────────────────────────────── */}
      {/* A real button, not a 20px text link: this is the only forward action
          on the last screen of the funnel, where the visitor decides whether
          to keep browsing. `buttonVariants` rather than `<Button>` because the
          element has to stay an `<a>` for prefetching and middle-click. */}
      <div className="text-center">
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 px-6 sm:h-9",
          )}
        >
          Volver a la cartelera
        </Link>
      </div>
    </main>
  );
}
