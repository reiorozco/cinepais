import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const DARK_SURFACE_TOKENS = {
  "--foreground": "oklch(0.985 0 0)",
  "--muted-foreground": "oklch(0.72 0 0)",
  "--border": "oklch(1 0 0 / 12%)",
} as CSSProperties;

export default function FilmsLoading() {
  return (
    <main>
      <section
        style={DARK_SURFACE_TOKENS}
        className="min-h-screen bg-surface-dark text-white"
      >
        <div className="mx-auto max-w-6xl px-6 py-10">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-36 bg-white/10" />
              <Skeleton className="h-4 w-72 bg-white/10" />
            </div>
            <Skeleton className="h-9 w-32 bg-white/10" />
          </div>

          {/* Tab triggers */}
          <div className="flex gap-4 border-b border-white/10 pb-3 mb-6">
            {[80, 56, 80].map((w, i) => (
              <Skeleton key={i} className={`h-5 w-${i === 1 ? "14" : "20"} bg-white/10`} />
            ))}
          </div>

          {/* Film grid */}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <li key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg bg-white/10" />
                <Skeleton className="h-4 w-3/4 bg-white/10" />
                <Skeleton className="h-3 w-1/2 bg-white/10" />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
