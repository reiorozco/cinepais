"use client";

import { useEffect } from "react";
import { useSelectionActions } from "@/components/providers/selection-provider";

/**
 * Client island mounted inside the confirmation server component.
 * Clears the seat selection on mount so returning to the seat map starts fresh.
 * Renders nothing — side-effect only.
 */
export function SelectionClearer() {
  const { dispatch } = useSelectionActions();

  useEffect(() => {
    dispatch({ type: "clear" });
  }, [dispatch]);

  return null;
}
