import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { CitySelector } from "@/components/layout/city-selector";

type City = { id: string; name: string };

type HeaderProps = {
  cities: City[];
};

/**
 * Global top navigation.
 *
 * Server component: receives the city list already fetched by the root layout
 * (single DB query per request, shared with the rest of the tree). The
 * `CitySelector` is the only client island — everything else is static markup
 * that streams straight from the server.
 *
 * Uses the `--brand-header` token (near-black cool) so the wordmark inherits
 * white via `currentColor` and the surface contrasts cleanly with the catalog
 * pages below.
 */
export function Header({ cities }: HeaderProps) {
  return (
    <header className="bg-brand-header text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <Link
          href="/"
          aria-label="CinePaís — inicio"
          className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Wordmark className="h-7 w-auto text-white sm:h-8" />
        </Link>

        <nav aria-label="Principal" className="min-w-0 flex-1">
          <ul className="flex items-center gap-6">
            <li>
              <Link
                href="/films"
                className="inline-flex min-h-11 items-center text-sm font-medium text-white/85 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:underline underline-offset-4"
              >
                Películas
              </Link>
            </li>
          </ul>
        </nav>

        <CitySelector cities={cities} />
      </div>
    </header>
  );
}
