import { getFilms } from "@/lib/api/queries";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { FilmCard } from "@/components/films/film-card";
import { EmptyState } from "@/components/ui-states/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Home / landing page.
 *
 * Server Component: fetches films directly via `getFilms()` (which wraps
 * Prisma) so no client-side data-fetching is required. The first 3 films
 * seed the hero carousel; the full list backs the "Cartelera" tab. "Pronto"
 * and "Preventa" tabs are wired but empty in Fase 1 — the seed does not
 * distinguish upcoming vs. presale titles yet, so both render an
 * `EmptyState` placeholder to keep the layout coherent.
 *
 * City filtering is deliberately client-side only (see `CityProvider`),
 * so this render always fetches the full list and lets downstream detail
 * pages narrow by city.
 */
export default async function Home() {
  const films = await getFilms();
  const heroFilms = films.slice(0, 3);

  return (
    <main>
      <HeroCarousel films={heroFilms} />

      <section className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Cartelera
          </h1>
          <p className="text-sm text-muted-foreground">
            Explora las películas en cartelera y compra tus boletas en segundos.
          </p>
        </header>

        <Tabs defaultValue="cartelera">
          <TabsList>
            <TabsTrigger value="cartelera">Cartelera</TabsTrigger>
            <TabsTrigger value="pronto">Pronto</TabsTrigger>
            <TabsTrigger value="preventa">Preventa</TabsTrigger>
          </TabsList>

          <TabsContent value="cartelera" className="mt-6">
            {films.length === 0 ? (
              <EmptyState
                title="Aún no hay funciones"
                description="Vuelve pronto o cambia de ciudad para ver la cartelera disponible."
              />
            ) : (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {films.map((film, index) => (
                  <li key={film.id}>
                    <FilmCard film={film} preload={index < 6} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="pronto" className="mt-6">
            <EmptyState />
          </TabsContent>

          <TabsContent value="preventa" className="mt-6">
            <EmptyState />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
