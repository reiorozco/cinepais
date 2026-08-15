import { Skeleton } from "@/components/ui/skeleton";

export default function SeatMapLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-40 pt-8">
      {/* Info card skeleton */}
      <section className="flex flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row mb-8">
        <Skeleton className="aspect-[2/3] w-32 shrink-0 rounded-md" />
        <div className="flex flex-1 flex-col gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <Skeleton className="mt-0.5 size-4 shrink-0 rounded" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seat grid skeleton */}
      <div className="space-y-4">
        {/* Screen label */}
        <div className="flex justify-center mb-6">
          <Skeleton className="h-2 w-48 rounded-full" />
        </div>

        {/* Seat rows */}
        {Array.from({ length: 10 }).map((_, row) => (
          <div key={row} className="flex gap-1.5 justify-center">
            <Skeleton className="size-5 shrink-0 rounded text-xs" />
            {Array.from({ length: 14 }).map((_, col) => (
              <Skeleton
                key={col}
                className="size-7 rounded"
                style={{ opacity: 0.6 + Math.random() * 0.4 }}
              />
            ))}
            <Skeleton className="size-5 shrink-0 rounded text-xs" />
          </div>
        ))}

        {/* Legend skeleton */}
        <div className="mt-6 flex flex-wrap gap-4 justify-center">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
