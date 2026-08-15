"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
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
  const [city, setCity] = useState<string>(DEFAULT_CITY);

  // Re-read from localStorage after mount (client-only)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setCity(stored);
  }, []);

  // Persist to localStorage whenever city changes (after initial mount)
  function handleSetCity(next: string) {
    setCity(next);
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

export function useCity(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error("useCity must be used inside CityProvider");
  return ctx;
}
