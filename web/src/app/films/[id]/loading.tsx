import { Skeleton } from "@/components/ui/skeleton";

export default function FilmDetailLoading() {
  return (
    <main>
      {/* Backdrop hero skeleton */}
      <div className="relative h-64 overflow-hidden bg-brand-header md:h-80">
        <div className="absolute inset-0 animate-pulse bg-muted/30" />
        <div className="relative mx-auto flex h-full max-w-6xl items-end px-6 pb-8">
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 bg-white/20" />
              <Skeleton className="h-5 w-14 bg-white/20" />
            </div>
            <Skeleton className="h-10 w-64 bg-white/20 md:w-96" />
            <Skeleton className="h-4 w-28 bg-white/20" />
          </div>
        </div>
      </div>

      {/* Ficha skeleton */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row">
          <Skeleton className="aspect-[2/3] w-40 shrink-0 rounded-lg md:w-48" />
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full max-w-prose" />
              <Skeleton className="h-4 w-5/6 max-w-prose" />
              <Skeleton className="h-4 w-4/6 max-w-prose" />
            </div>
          </div>
        </div>
      </section>

      {/* Showtimes section skeleton */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <Skeleton className="mb-6 h-8 w-28" />

        {/* Date selector skeleton */}
        <div className="mb-6 flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-14 shrink-0 rounded-lg" />
          ))}
        </div>

        {/* Format filter skeleton */}
        <div className="mb-4 flex gap-2">
          {[48, 48, 64].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
          ))}
        </div>

        {/* Accordion items skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-2 rounded-lg border border-border px-4 py-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
