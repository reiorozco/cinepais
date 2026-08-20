"use client";

import { useCity } from "@/components/providers/city-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type City = { id: string; name: string };

type CitySelectorProps = {
  cities: City[];
};

/**
 * City picker for the top nav.
 *
 * Client island: reads `city` from `useCity()` and calls `setCity()` on change.
 * The provider persists the selection to `localStorage["cinepais.city"]`, which
 * downstream server components observe on next navigation (via cookie-like
 * client-side state) — see `CityProvider` for the SSR-safe read pattern.
 *
 * The trigger uses transparent bg + white text so it reads correctly on the
 * dark header, while the dropdown popup keeps its default light popover styles
 * for contrast against the page below.
 */
export function CitySelector({ cities }: CitySelectorProps) {
  const { city, setCity } = useCity();

  return (
    <Select
      value={city}
      onValueChange={(value) => {
        if (typeof value === "string") setCity(value);
      }}
    >
      {/* A real floor, not `min-w-0`: releasing the flex minimum on mobile
          squeezed the trigger to 67px and rendered "Bogotá" as "Bog", which
          reads as a rendering bug on the app's primary catalogue filter. */}
      <SelectTrigger
        aria-label="Ciudad"
        className="h-9 min-w-24 shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10 focus-visible:ring-white/30 sm:min-w-32 [&_svg]:text-white/70"
      >
        <SelectValue placeholder="Ciudad" />
      </SelectTrigger>
      <SelectContent>
        {cities.map((c) => (
          <SelectItem key={c.id} value={c.name}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
