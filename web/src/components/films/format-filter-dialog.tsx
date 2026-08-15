"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Format options
// ---------------------------------------------------------------------------

/**
 * The seed emits exactly three room formats: IMAX, 2D, Premium. Keep this list
 * in sync with `prisma/seed.ts` — adding a new format there requires a new
 * entry here (and the label used for display, if different from the code).
 */
const FORMAT_OPTIONS = [
  { value: "IMAX", label: "IMAX" },
  { value: "2D", label: "2D" },
  { value: "Premium", label: "Premium" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type FormatFilterDialogProps = {
  /** Currently applied format from `?format=` searchParam. */
  currentFormat?: string;
};

/**
 * "Filtrar por" button that opens a shadcn Dialog with the three seed
 * formats plus a "Todos" reset option. Selecting an option updates the URL
 * `?format=` query and lets the Server Component re-render the filtered
 * catalog. Uses `router.push` (not replace) so the browser back button
 * clears the filter naturally.
 */
export function FormatFilterDialog({ currentFormat }: FormatFilterDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function apply(next: string | null) {
    setOpen(false);
    router.push(next ? `/films?format=${encodeURIComponent(next)}` : "/films");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 bg-transparent text-white hover:bg-white/10 focus-visible:ring-white/30"
          />
        }
      >
        <span>Filtrar por</span>
        <ChevronDown className="text-white/70" aria-hidden />
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filtrar por formato</DialogTitle>
          <DialogDescription>
            Elige un formato para ver únicamente las películas con funciones
            disponibles en esa sala.
          </DialogDescription>
        </DialogHeader>

        <ul className="mt-2 flex flex-col gap-1" role="radiogroup" aria-label="Formato">
          <FilterOption
            label="Todos los formatos"
            selected={!currentFormat}
            onSelect={() => apply(null)}
          />
          {FORMAT_OPTIONS.map((opt) => (
            <FilterOption
              key={opt.value}
              label={opt.label}
              selected={currentFormat === opt.value}
              onSelect={() => apply(opt.value)}
            />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Option row
// ---------------------------------------------------------------------------

function FilterOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "bg-muted font-medium"
        )}
      >
        <span>{label}</span>
        {selected ? (
          <Check className="size-4 text-primary" aria-hidden />
        ) : null}
      </button>
    </li>
  );
}
