"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  selectionReducer,
  type SelectionState,
  type SelectionAction,
} from "@/lib/business/selection";

// ---------------------------------------------------------------------------
// Contexts — split into state + actions for stable dispatch reference
// ---------------------------------------------------------------------------

const SelectionStateContext = createContext<SelectionState | null>(null);
const SelectionActionsContext = createContext<{
  dispatch: Dispatch<SelectionAction>;
} | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const INITIAL_STATE: SelectionState = {
  showtimeId: null,
  selectedSeatIds: new Set(),
  error: null,
};

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(selectionReducer, INITIAL_STATE);

  // Show toast whenever error changes to a non-null value
  useEffect(() => {
    if (state.error === "max") {
      toast.error("Máximo 4 boletas por compra");
    } else if (state.error === "orphan") {
      toast.error(
        "Esa selección dejaría una silla sola — elige sillas contiguas",
      );
    }
  }, [state.error]);

  // Stable actions object — dispatch identity is stable across renders
  const actions = useMemo(() => ({ dispatch }), [dispatch]);

  return (
    <SelectionStateContext.Provider value={state}>
      <SelectionActionsContext.Provider value={actions}>
        {children}
      </SelectionActionsContext.Provider>
    </SelectionStateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSelectionState(): SelectionState {
  const ctx = useContext(SelectionStateContext);
  if (!ctx) throw new Error("useSelectionState must be used inside SelectionProvider");
  return ctx;
}

export function useSelectionActions(): { dispatch: Dispatch<SelectionAction> } {
  const ctx = useContext(SelectionActionsContext);
  if (!ctx) throw new Error("useSelectionActions must be used inside SelectionProvider");
  return ctx;
}

export function useSelection(): SelectionState & {
  dispatch: Dispatch<SelectionAction>;
} {
  return { ...useSelectionState(), ...useSelectionActions() };
}
