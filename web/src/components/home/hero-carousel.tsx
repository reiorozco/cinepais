"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Film } from "@/lib/api/schemas";

type HeroCarouselProps = {
  films: Film[];
};

/**
 * Full-width scroll-snap carousel for the top of the home page.
 *
 * Client component: needs local state to track the active slide, wire up
 * prev/next buttons, and reflect the user's own horizontal scroll (touch
 * swipe on mobile, trackpad on desktop). Uses CSS scroll-snap for the
 * physical scrolling and IntersectionObserver to derive the active slide
 * — no carousel library is pulled in.
 *
 * Design targets a ~340px hero: dark surface, poster as a wide backdrop
 * behind a gradient overlay, title + CTA in the lower-left, dot indicators
 * centered below. Matches the reference in `specs/design-reference/01-home.png`.
 */
export function HeroCarousel({ films }: HeroCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [active, setActive] = useState(0);

  // Reset slot refs when the film list changes.
  useEffect(() => {
    slideRefs.current = slideRefs.current.slice(0, films.length);
  }, [films.length]);

  // Track which slide is currently in view so dots + aria stay in sync.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the highest intersection ratio in this batch.
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          const index = slideRefs.current.findIndex((el) => el === entry.target);
          if (index === -1) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { index, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio > 0.5) setActive(best.index);
      },
      { root: scroller, threshold: [0.25, 0.5, 0.75, 1] }
    );

    for (const el of slideRefs.current) {
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [films.length]);

  const scrollToIndex = useCallback((index: number) => {
    const target = slideRefs.current[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);

  const handlePrev = useCallback(() => {
    scrollToIndex(Math.max(0, active - 1));
  }, [active, scrollToIndex]);

  const handleNext = useCallback(() => {
    scrollToIndex(Math.min(films.length - 1, active + 1));
  }, [active, films.length, scrollToIndex]);

  const canPrev = active > 0;
  const canNext = active < films.length - 1;

  const slides = useMemo(() => films.map((film) => film), [films]);

  if (slides.length === 0) return null;

  return (
    <section
      aria-label="Estrenos destacados"
      aria-roledescription="carousel"
      className="relative isolate bg-surface-dark text-white"
    >
      <div
        ref={scrollerRef}
        data-testid="hero-scroller"
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex w-full">
          {slides.map((film, index) => (
            <li
              key={film.id}
              ref={(el) => {
                slideRefs.current[index] = el;
              }}
              aria-roledescription="slide"
              aria-label={`${index + 1} de ${slides.length}: ${film.title}`}
              className="relative w-full shrink-0 snap-start snap-always"
            >
              <div className="relative h-[340px] w-full overflow-hidden sm:h-[420px] md:h-[480px]">
                <Image
                  src={film.posterUrl}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-cover"
                  priority={index === 0}
                />
                {/* Gradient overlay for readable copy on any poster */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent"
                />

                {/* Content */}
                <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-14 pt-10">
                  <span className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/80 backdrop-blur-sm">
                    Estreno
                  </span>
                  <h2 className="mt-3 max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl">
                    {film.title}
                  </h2>
                  <p className="mt-2 max-w-lg text-sm text-white/75">
                    {film.rating} · {film.durationMin} min · {film.genres.join(" · ")}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/films/${film.id}`}
                      className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                      Ver horarios
                    </Link>
                    <Link
                      href={`/films/${film.id}`}
                      className="inline-flex items-center rounded-md border border-white/25 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                      Más información
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Prev / Next controls */}
      <button
        type="button"
        aria-label="Estreno anterior"
        aria-controls="hero-scroller"
        onClick={handlePrev}
        disabled={!canPrev}
        className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-30 sm:left-4"
      >
        <ChevronIcon direction="left" />
      </button>
      <button
        type="button"
        aria-label="Siguiente estreno"
        aria-controls="hero-scroller"
        onClick={handleNext}
        disabled={!canNext}
        className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-30 sm:right-4"
      >
        <ChevronIcon direction="right" />
      </button>

      {/* Dot indicators */}
      <div
        role="tablist"
        aria-label="Selector de estreno"
        className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-2"
      >
        {slides.map((film, index) => {
          const isActive = index === active;
          return (
            <button
              key={film.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Ir al estreno ${index + 1}`}
              onClick={() => scrollToIndex(index)}
              className={
                "h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 " +
                (isActive ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/60")
              }
            />
          );
        })}
      </div>
    </section>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={direction === "left" ? "" : "rotate-180"}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
