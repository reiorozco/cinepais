import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <main>
      {/* Hero skeleton */}
      <div className="relative h-[340px] bg-muted animate-pulse" />

      {/* Tabs + grid skeleton */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Tab triggers */}
        <div className="flex gap-2 mb-6">
          {[80, 56, 72].map((w) => (
            <Skeleton key={w} className={`h-9 w-${w < 60 ? "14" : w < 70 ? "16" : "20"}`} />
          ))}
        </div>

        {/* Film grid */}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <li key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
