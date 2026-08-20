import { getFilms } from "@/lib/api/queries";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { FilmCard } from "@/components/films/film-card";
import { FILM_TABS } from "@/components/films/film-tabs";
import { EmptyState } from "@/components/ui-states/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Home / landing page.
 *
 * Server Component: fetches films directly via `getFilms()` (which wraps
 * Prisma) so no client-side data-fetching is required. The first 3 films seed
 * the hero carousel; the rest are split across the three tabs by `film.status`.
 *
 * `getFilms()` is deliberately called with **no city argument**: it filters on
 * `showtimes.some.site.city`, and a `pronto` film has zero showtimes by
 * construction, so passing the selected city would silently empty the Pronto
 * tab. City filtering stays client-side (see `CityProvider`) and downstream
 * detail pages narrow by city.
 */
export default async function Home() {
  const films = await getFilms();
  // Only purchasable titles reach the hero. `films` is title-sorted and
  // unfiltered, so an unlucky re-seed could put a `pronto` film — one with
  // zero showtimes by construction — behind a "Ver horarios" CTA that lands on
  // a detail page with nothing to buy.
  const heroFilms = films
    .filter((film) => film.status === "cartelera")
    .slice(0, 3);

  return (
    <main>
      <HeroCarousel films={heroFilms} />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6 flex flex-col gap-1">
          {/* Not "Cartelera": the section holds all three tabs, so titling it
              after the first one contradicted the Preventa and Pronto panels
              sitting directly underneath it. */}
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Películas
          </h1>
          <p className="text-sm text-muted-foreground">
            Explora la cartelera, las preventas y los estrenos que vienen —
            y compra tus boletas en segundos.
          </p>
        </header>

        <Tabs defaultValue={FILM_TABS[0].status}>
          <TabsList>
            {FILM_TABS.map((tab) => (
              <TabsTrigger key={tab.status} value={tab.status}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {FILM_TABS.map((tab, tabIndex) => {
            const tabFilms = films.filter((film) => film.status === tab.status);

            return (
              <TabsContent key={tab.status} value={tab.status} className="mt-6">
                {tabFilms.length === 0 ? (
                  <EmptyState
                    title={tab.emptyTitle}
                    description={tab.emptyDescription}
                  />
                ) : (
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {tabFilms.map((film, index) => (
                      <li key={film.id}>
                        {/* Only the default tab is painted on first load, so it
                            is the only one whose posters can affect LCP. */}
                        <FilmCard
                          film={film}
                          priority={tabIndex === 0 && index < 6}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </section>
    </main>
  );
}
