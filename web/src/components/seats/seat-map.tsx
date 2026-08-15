"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Accessibility, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCOP } from "@/lib/format";
import { ROOM_LAYOUTS, normalizeRoom } from "@/lib/business/layout";
import { useSelection } from "@/components/providers/selection-provider";
import type { Seat, SeatSummary, Showtime } from "@/lib/api/schemas";
import type { SeatForSelection } from "@/lib/business/selection";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SeatMapProps = {
  showtime: Showtime;
  seats: Seat[];
  summary: SeatSummary;
};

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ZOOM_LEVELS = [0.75, 1, 1.25] as const;
type Zoom = (typeof ZOOM_LEVELS)[number];

const EMPTY_IDS: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Interactive seat map. Client component: pulls selection state from
 * `SelectionProvider` (the reducer owns max-4, orphan, wheelchair-exemption
 * business rules) and only holds the *ephemeral* UI state locally — current
 * zoom level and the wheelchair-confirmation dialog target.
 *
 * The `seats` array is a plain prop, never lifted into context: seats are
 * large (up to ~260 per showtime) and immutable per render, so keeping them
 * out of the reducer avoids needless work when the selection changes.
 */
export function SeatMap({ showtime, seats, summary }: SeatMapProps) {
  const router = useRouter();
  const { showtimeId, selectedSeatIds, dispatch } = useSelection();

  const [zoom, setZoom] = useState<Zoom>(1);
  const [pendingWheelchair, setPendingWheelchair] =
    useState<SeatForSelection | null>(null);

  const layout = ROOM_LAYOUTS[normalizeRoom(showtime.room)];
  const blocks = layout.blocks as [number, number][];

  // Index seats by (row → col → seat) so the render loop is O(1) per cell
  // and the row-scoped adjacency check for the reducer doesn't have to walk
  // the full seats array.
  const seatByRowCol = useMemo(() => {
    const m = new Map<number, Map<number, Seat>>();
    for (const s of seats) {
      let row = m.get(s.row);
      if (!row) {
        row = new Map();
        m.set(s.row, row);
      }
      row.set(s.col, s);
    }
    return m;
  }, [seats]);

  // Only honor the selection when it belongs to *this* showtime. The reducer
  // clears + re-applies on mismatch, but the first render after mount can
  // briefly show stale ids belonging to a previously visited showtime.
  const activeIds: ReadonlySet<string> =
    showtimeId === showtime.id ? selectedSeatIds : EMPTY_IDS;

  const selectedSeats = useMemo(
    () => seats.filter((s) => activeIds.has(s.seatId)),
    [seats, activeIds],
  );

  const totalCOP = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  function rowSeatsFor(row: number): SeatForSelection[] {
    const rowMap = seatByRowCol.get(row);
    if (!rowMap) return [];
    return Array.from(rowMap.values(), toSeatForSelection);
  }

  function dispatchToggle(seat: SeatForSelection) {
    dispatch({
      type: "toggle",
      showtimeId: showtime.id,
      seat,
      rowSeats: rowSeatsFor(seat.row),
      blocks,
    });
  }

  function handleSeatClick(seat: Seat) {
    if (seat.status === "Sold") return;

    const selForReducer = toSeatForSelection(seat);
    const isAlreadySelected = activeIds.has(seat.seatId);

    // First-time click on a wheelchair seat → confirm through the dialog.
    // Deselecting an already-picked wheelchair seat is silent (no dialog).
    if (seat.areaCategory === "wheelchair" && !isAlreadySelected) {
      setPendingWheelchair(selForReducer);
      return;
    }

    dispatchToggle(selForReducer);
  }

  function confirmPendingWheelchair() {
    if (!pendingWheelchair) return;
    dispatchToggle(pendingWheelchair);
    setPendingWheelchair(null);
  }

  return (
    <section aria-label="Selección de sillas" className="mt-8">
      <Legend />

      <div className="mt-6 rounded-xl bg-surface-dark p-6 text-white">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-white/70">
            Sillas · {summary.availableCount} / {summary.totalCount} disponibles
          </p>
          <ZoomControls value={zoom} onChange={setZoom} />
        </div>

        {/* Pantalla */}
        <div className="mx-auto mb-8 max-w-md text-center">
          <div className="mx-auto h-1.5 w-full max-w-sm rounded-full bg-gradient-to-b from-white/50 to-white/10 shadow-[0_0_28px_rgba(255,255,255,0.35)]" />
          <p className="mt-2 text-xs uppercase tracking-widest text-white/60">
            Pantalla
          </p>
        </div>

        {/* Grid: overflow-x on the outer wrapper handles wide rooms + zoom-up */}
        <div className="overflow-x-auto pb-2">
          <div
            className="mx-auto flex origin-top flex-col items-center gap-1.5 transition-transform duration-200"
            style={{
              transform: `scale(${zoom})`,
              width: "fit-content",
            }}
          >
            {Array.from({ length: layout.rows }, (_, i) => i + 1).map((row) => (
              <SeatRow
                key={row}
                row={row}
                rowLetter={ROW_LETTERS[row - 1] ?? String(row)}
                blocks={blocks}
                seatByCol={seatByRowCol.get(row)}
                activeIds={activeIds}
                onSeatClick={handleSeatClick}
              />
            ))}
          </div>
        </div>
      </div>

      <BottomBar
        selectedSeats={selectedSeats}
        totalCOP={totalCOP}
        onBack={() => router.back()}
        onCheckout={() => router.push("/checkout")}
      />

      <Dialog
        open={pendingWheelchair !== null}
        onOpenChange={(open) => {
          if (!open) setPendingWheelchair(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Silla de acceso preferente</DialogTitle>
            <DialogDescription>
              Esta silla está reservada para personas con movilidad reducida.
              La silla contigua es para su acompañante — puedes agregarla
              después de confirmar. ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button onClick={confirmPendingWheelchair}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Legend — 5 states
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div
      role="list"
      aria-label="Leyenda de sillas"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
    >
      <LegendItem swatchClass="bg-seat-selected" label="Seleccionada" />
      <LegendItem swatchClass="bg-seat-sold" label="No disponible" />
      <LegendItem swatchClass="bg-seat-available" label="General" />
      <LegendItem
        swatchClass="bg-seat-available"
        icon={<Accessibility className="size-3 text-white" aria-hidden />}
        label="Silla de ruedas"
      />
      <LegendItem swatchClass="bg-seat-preferential" label="Preferencial" />
    </div>
  );
}

function LegendItem({
  swatchClass,
  label,
  icon,
}: {
  swatchClass: string;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <div role="listitem" className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-t-sm ring-1 ring-foreground/10",
          swatchClass,
        )}
      >
        {icon}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zoom controls
// ---------------------------------------------------------------------------

function ZoomControls({
  value,
  onChange,
}: {
  value: Zoom;
  onChange: (z: Zoom) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Nivel de acercamiento"
      className="flex items-center gap-1 rounded-md bg-white/10 p-1"
    >
      {ZOOM_LEVELS.map((z) => {
        const active = z === value;
        return (
          <button
            key={z}
            type="button"
            onClick={() => onChange(z)}
            aria-pressed={active}
            className={cn(
              "min-w-11 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-white text-brand-header"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {z}×
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seat row — row letter + blocks separated by aisle gaps
// ---------------------------------------------------------------------------

function SeatRow({
  row,
  rowLetter,
  blocks,
  seatByCol,
  activeIds,
  onSeatClick,
}: {
  row: number;
  rowLetter: string;
  blocks: [number, number][];
  seatByCol: Map<number, Seat> | undefined;
  activeIds: ReadonlySet<string>;
  onSeatClick: (seat: Seat) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <RowLetter letter={rowLetter} />

      <div className="flex items-center">
        {blocks.map(([start, end], blockIdx) => (
          <div
            key={blockIdx}
            className={cn(
              "flex gap-1",
              blockIdx > 0 && "ml-5", // aisle
            )}
          >
            {Array.from(
              { length: end - start + 1 },
              (_, i) => start + i,
            ).map((col) => {
              const seat = seatByCol?.get(col);
              if (!seat) {
                // Empty slot in a block (e.g. reserved padding). Render an
                // invisible spacer so column alignment stays clean.
                return (
                  <span
                    key={col}
                    aria-hidden
                    className="inline-block h-6 w-6"
                  />
                );
              }
              return (
                <SeatButton
                  key={col}
                  seat={seat}
                  rowLetter={rowLetter}
                  selected={activeIds.has(seat.seatId)}
                  onClick={onSeatClick}
                />
              );
            })}
          </div>
        ))}
      </div>

      <RowLetter letter={rowLetter} />
    </div>
  );
}

function RowLetter({ letter }: { letter: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex w-6 items-center justify-center text-[11px] font-medium text-white/60"
    >
      {letter}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Seat button
// ---------------------------------------------------------------------------

function SeatButton({
  seat,
  rowLetter,
  selected,
  onClick,
}: {
  seat: Seat;
  rowLetter: string;
  selected: boolean;
  onClick: (seat: Seat) => void;
}) {
  const isSold = seat.status === "Sold";
  const isWheelchair = seat.areaCategory === "wheelchair";
  const isPreferential = seat.areaCategory === "preferential";

  const label = `${rowLetter}${seat.col}`;
  const statusText = selected
    ? "seleccionada"
    : isSold
      ? "no disponible"
      : isWheelchair
        ? "silla de ruedas"
        : isPreferential
          ? "preferencial"
          : "disponible";

  return (
    <button
      type="button"
      data-seat-id={seat.seatId}
      data-status={seat.status}
      data-area={seat.areaCategory}
      aria-label={`Silla ${label} — ${statusText} — ${formatCOP(seat.price)}`}
      aria-pressed={selected}
      disabled={isSold}
      onClick={() => onClick(seat)}
      className={cn(
        "relative inline-flex size-6 items-center justify-center rounded-t-sm text-[10px] font-medium ring-1 ring-inset ring-black/10 transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-white",
        seatFillClass(seat, selected),
        !isSold &&
          !selected &&
          "hover:brightness-110 focus-visible:brightness-110 cursor-pointer",
        isSold && "cursor-not-allowed opacity-70",
      )}
    >
      {isWheelchair ? (
        <Accessibility className="size-3.5 text-white" aria-hidden />
      ) : (
        <span aria-hidden className="text-white/85">
          {seat.col}
        </span>
      )}
    </button>
  );
}

/**
 * Colour rules — order matters:
 *   1. selected wins over everything (bright green)
 *   2. sold → neutral gray
 *   3. wheelchair + preferential → their zone tokens
 *   4. general + premium → default seat-available blue
 */
function seatFillClass(seat: Seat, selected: boolean): string {
  if (selected) return "bg-seat-selected text-white";
  if (seat.status === "Sold") return "bg-seat-sold text-transparent";
  if (seat.areaCategory === "preferential")
    return "bg-seat-preferential text-white";
  return "bg-seat-available text-white";
}

// ---------------------------------------------------------------------------
// Bottom bar — sticky, running total + primary CTA
// ---------------------------------------------------------------------------

function BottomBar({
  selectedSeats,
  totalCOP,
  onBack,
  onCheckout,
}: {
  selectedSeats: Seat[];
  totalCOP: number;
  onBack: () => void;
  onCheckout: () => void;
}) {
  const hasSelection = selectedSeats.length > 0;
  const seatLabels = selectedSeats
    .map((s) => `${ROW_LETTERS[s.row - 1] ?? s.row}${s.col}`)
    .join(", ");

  return (
    <div
      role="region"
      aria-label="Resumen de selección"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.2)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-baseline gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Sillas ({selectedSeats.length}/4)
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {hasSelection ? seatLabels : "Ninguna seleccionada"}
            </p>
          </div>
          <div className="text-right sm:text-left">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Total
            </p>
            <p
              data-testid="selection-total"
              className="mt-0.5 font-heading text-xl font-bold text-foreground tabular-nums"
            >
              {formatCOP(totalCOP)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft aria-hidden />
            Atrás
          </Button>
          <Button
            disabled={!hasSelection}
            onClick={onCheckout}
            aria-disabled={!hasSelection}
          >
            Seleccionar boletas
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSeatForSelection(s: Seat): SeatForSelection {
  return {
    seatId: s.seatId,
    col: s.col,
    row: s.row,
    status: s.status,
    areaCategory: s.areaCategory,
  };
}
