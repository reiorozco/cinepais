"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "cinepais.city";
const DEFAULT_CITY = "Bogotá";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type CityContextValue = {
  city: string;
  setCity: (city: string) => void;
};

const CityContext = createContext<CityContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides the selected city across the app.
 *
 * SSR-safe: returns DEFAULT_CITY on first render (avoids hydration mismatch),
 * then re-reads localStorage in a useEffect so the client reflects any stored value.
 */
export function CityProvider({ children }: { children: ReactNode }) {
  // Track manual city selection (overrides external store)
  const [override, setOverride] = useState<string | null>(null);

  // Read from localStorage as an external store (SSR-safe via getServerSnapshot)
  const city = useSyncExternalStore(
    (callback) => {
      // Subscribe to storage events (e.g., other tabs changing the city)
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => {
      // Client snapshot: return override if set, else read localStorage
      if (override !== null) return override;
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CITY;
    },
    () => {
      // Server snapshot: always return DEFAULT_CITY (no localStorage on server)
      return DEFAULT_CITY;
    }
  );

  // Persist to localStorage and update override whenever city changes
  function handleSetCity(next: string) {
    setOverride(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <CityContext.Provider value={{ city, setCity: handleSetCity }}>
      {children}
    </CityContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Same read as {@link useCity}, but `null` instead of a throw when no provider
 * is above. Use it only where the city is an optional hint — the copilot sends
 * it to the agent as a soft anchor — so an absent provider costs the hint
 * rather than the whole subtree. Everywhere the city is the point, throwing is
 * the correct behaviour and {@link useCity} is the hook.
 */
export function useOptionalCity(): CityContextValue | null {
  return useContext(CityContext);
}

export function useCity(): CityContextValue {
  const ctx = useOptionalCity();
  if (!ctx) throw new Error("useCity must be used inside CityProvider");
  return ctx;
}
