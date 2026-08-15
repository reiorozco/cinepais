"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Ticket } from "lucide-react";
import { useSelectionState } from "@/components/providers/selection-provider";
import { formatCOP } from "@/lib/format";
import { computeOrderNumber } from "@/lib/business/order";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types (subset of the read API shape)
// ---------------------------------------------------------------------------

type SeatRow = {
  seatId: string;
  row: number;
  col: number;
  areaCategory: string;
  price: number;
};

type ShowtimeRow = {
  filmId: string;
  siteName: string;
  city: string;
  businessDate: string;
  time: string;
  formats: string[];
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

const SHOWTIME_DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatShowtimeDate(businessDate: string): string {
  const d = new Date(`${businessDate}T00:00:00Z`);
  const text = SHOWTIME_DATE_FMT.format(d);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Checkout Page — CLIENT component (reads React context)
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  const router = useRouter();
  const { showtimeId, selectedSeatIds } = useSelectionState();

  const [showtime, setShowtime] = useState<ShowtimeRow | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<SeatRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  // Value is never rendered — it is a fetch-effect dependency the retry button bumps
  const [retryCount, setRetryCount] = useState(0);
  const [confirming, setConfirming] = useState(false);

  // Guard: empty selection → redirect to home
  useEffect(() => {
    if (selectedSeatIds.size === 0 && showtimeId === null) {
      router.replace("/");
    }
  }, [selectedSeatIds, showtimeId, router]);

  // Fetch seat data from the read API (client-safe endpoint)
  useEffect(() => {
    if (!showtimeId || selectedSeatIds.size === 0) return;

    fetch(`/api/showtimes/${showtimeId}/seats`)
      .then((r) => {
        // A non-2xx response still resolves the promise, so it needs an explicit throw
        if (!r.ok) throw new Error(`Seats request failed: ${r.status}`);
        return r.json();
      })
      .then((data: { showtime: ShowtimeRow; seats: SeatRow[] }) => {
        setShowtime(data.showtime);
        const ids = Array.from(selectedSeatIds);
        setSelectedSeats(data.seats.filter((s) => ids.includes(s.seatId)));
      })
      .catch(() => setLoadError(true));
  }, [showtimeId, selectedSeatIds, retryCount]);

  // Render null while the redirect is pending (no flash of content)
  if (selectedSeatIds.size === 0 && showtimeId === null) return null;

  const sortedSeatIds = [...selectedSeatIds].sort();
  const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  function handleRetry() {
    setLoadError(false);
    setRetryCount((n) => n + 1);
  }

  function handleConfirm() {
    if (!showtimeId || selectedSeats.length === 0) return;
    setConfirming(true);
    const orderNumber = computeOrderNumber(showtimeId, sortedSeatIds);
    const params = new URLSearchParams({
      order: orderNumber,
      showtimeId,
      seatIds: sortedSeatIds.join(","),
    });
    router.push(`/checkout/confirmation?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* Page title */}
      <div className="flex items-center gap-3 mb-8">
        <Ticket className="size-6 text-primary" aria-hidden />
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Resumen de compra
        </h1>
      </div>

      {/* Context: showtime info */}
      {showtime && (
        <section
          aria-label="Función seleccionada"
          className="rounded-xl bg-card ring-1 ring-foreground/10 p-4 mb-4 text-sm text-muted-foreground"
        >
          <p>
            <span className="font-medium text-foreground">{showtime.siteName}</span>
            {" · "}{showtime.city}
          </p>
          <p>
            {formatShowtimeDate(showtime.businessDate)} · {showtime.time}
            {" · "}{showtime.formats.join(" · ")}
          </p>
        </section>
      )}

      {/* Seat summary */}
      <section
        aria-label="Boletas seleccionadas"
        className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 mb-4"
      >
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
          Boletas ({selectedSeatIds.size})
        </h2>

        {loadError ? (
          <div
            role="alert"
            data-testid="checkout-error"
            className="flex flex-col items-start gap-3 rounded-lg bg-destructive/10 ring-1 ring-destructive/25 p-4"
          >
            <p className="flex items-start gap-2 text-sm text-foreground">
              <AlertCircle
                className="size-4 shrink-0 mt-0.5 text-destructive"
                aria-hidden
              />
              No pudimos cargar tus boletas. Revisa tu conexión e inténtalo de
              nuevo.
            </p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Reintentar
            </Button>
          </div>
        ) : selectedSeats.length === 0 ? (
          /* Loading skeleton while the API call is in flight */
          <ul className="space-y-3" aria-label="Cargando boletas…">
            {Array.from(selectedSeatIds).map((id) => (
              <li
                key={id}
                className="h-6 rounded bg-muted animate-pulse"
                aria-hidden
              />
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-foreground/5">
            {selectedSeats.map((seat) => {
              const rowLetter = String.fromCharCode(64 + seat.row);
              const seatLabel = `Fila ${rowLetter}, asiento ${seat.col}`;
              const areaLabel =
                AREA_LABELS[seat.areaCategory] ?? seat.areaCategory;
              return (
                <li
                  key={seat.seatId}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <span className="font-medium text-foreground">
                      {seatLabel}
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
        )}
      </section>

      {/* Totals */}
      <section
        aria-label="Totales"
        className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 mb-8"
      >
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>Subtotal boletas</span>
          <span className="tabular-nums">{formatCOP(total)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground mb-3">
          <span>Cargo por servicio</span>
          <span>$0 (demo)</span>
        </div>
        <div className="flex justify-between font-semibold text-foreground border-t border-foreground/10 pt-3">
          <span>Total</span>
          <span className="tabular-nums" data-testid="checkout-total">
            {formatCOP(total)}
          </span>
        </div>
      </section>

      {/* Demo notice */}
      <p className="text-xs text-muted-foreground text-center mb-6">
        Esto es una demo — no se realizará ningún cobro.
      </p>

      {/* Confirm button */}
      <Button
        className="w-full"
        onClick={handleConfirm}
        disabled={confirming || selectedSeats.length === 0}
      >
        Confirmar compra (demo)
      </Button>
    </main>
  );
}
