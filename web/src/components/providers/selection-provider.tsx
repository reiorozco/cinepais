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
// Persistence
// ---------------------------------------------------------------------------

/**
 * Third `sessionStorage`/`localStorage` key in the app, following the same
 * `cinepais.*` convention as `cinepais.city` and `cinepais.copilot.sessionId`.
 * `sessionStorage` rather than `localStorage`: a half-finished purchase should
 * survive a refresh or a backgrounded iOS tab, not greet someone next week.
 */
const STORAGE_KEY = "cinepais.selection";

/**
 * Mirrors the reducer's own max-4 rule. Nothing but this app writes the key,
 * but it is user-editable, and an unbounded array from a hand-edited value
 * would be restored straight into a `Set` and rendered.
 */
const MAX_PERSISTED_SEATS = 4;

type PersistedSelection = { showtimeId: string; seatIds: string[] };

function readPersistedSelection(): PersistedSelection | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { showtimeId, seatIds } = parsed as Partial<PersistedSelection>;
    if (typeof showtimeId !== "string" || showtimeId === "") return null;
    if (!Array.isArray(seatIds)) return null;

    const ids = seatIds
      .filter((id): id is string => typeof id === "string" && id !== "")
      .slice(0, MAX_PERSISTED_SEATS);
    if (ids.length === 0) return null;

    return { showtimeId, seatIds: ids };
  } catch {
    // Malformed JSON, or storage denied outright (private mode, blocked
    // cookies). Losing the restore is the correct degradation; throwing here
    // would take the whole purchase flow down with it.
    return null;
  }
}

function writePersistedSelection(state: SelectionState): void {
  try {
    if (state.showtimeId === null || state.selectedSeatIds.size === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        showtimeId: state.showtimeId,
        seatIds: Array.from(state.selectedSeatIds),
      }),
    );
  } catch {
    // Same reasoning as the read: persistence is an enhancement, not a
    // precondition for buying a ticket.
  }
}

// ---------------------------------------------------------------------------
// Provider state — the business reducer plus a hydration flag
// ---------------------------------------------------------------------------

export type SelectionContextValue = SelectionState & {
  /**
   * `false` on the server and on the first client render, `true` once
   * `sessionStorage` has been consulted.
   *
   * Consumers that redirect on an empty selection MUST wait for this. React
   * commits child effects before parent ones, so `/checkout`'s guard runs
   * before this provider's restore — without the flag a refresh would bounce
   * the visitor home a frame before their seats came back.
   */
  hydrated: boolean;
};

type ProviderState = { selection: SelectionState; hydrated: boolean };

type ProviderAction =
  | SelectionAction
  | { type: "hydrate"; persisted: PersistedSelection | null };

const INITIAL_STATE: SelectionState = {
  showtimeId: null,
  selectedSeatIds: new Set(),
  error: null,
};

const INITIAL_PROVIDER_STATE: ProviderState = {
  selection: INITIAL_STATE,
  hydrated: false,
};

/**
 * Restores a selection the reducer already accepted; it does not re-derive one.
 * Every persisted id passed the max-4, orphan and wheelchair rules at the
 * moment it was chosen, and `/checkout` re-fetches the room and intersects
 * against live seats — so a seat sold in the meantime simply stops rendering.
 * No business rule is evaluated here, and none may be added.
 */
function providerReducer(
  state: ProviderState,
  action: ProviderAction,
): ProviderState {
  if (action.type === "hydrate") {
    if (action.persisted === null) return { ...state, hydrated: true };
    return {
      selection: {
        showtimeId: action.persisted.showtimeId,
        selectedSeatIds: new Set(action.persisted.seatIds),
        error: null,
      },
      hydrated: true,
    };
  }

  const selection = selectionReducer(state.selection, action);
  if (selection === state.selection) return state;
  return { ...state, selection };
}

// ---------------------------------------------------------------------------
// Contexts — split into state + actions for stable dispatch reference
// ---------------------------------------------------------------------------

const SelectionStateContext = createContext<SelectionContextValue | null>(null);
const SelectionActionsContext = createContext<{
  dispatch: Dispatch<SelectionAction>;
} | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    providerReducer,
    INITIAL_PROVIDER_STATE,
  );

  const { selection, hydrated } = state;

  // Storage cannot be touched during render without breaking hydration, so the
  // read is an effect and `hydrated` flips only after the restore is dispatched
  // — the ordering the flag exists to guarantee.
  useEffect(() => {
    dispatch({ type: "hydrate", persisted: readPersistedSelection() });
  }, []);

  // Never before hydration: writing on the first render would overwrite the
  // stored selection with the empty initial state and destroy what we came to
  // restore.
  useEffect(() => {
    if (!hydrated) return;
    writePersistedSelection(selection);
  }, [hydrated, selection]);

  // Show toast whenever error changes to a non-null value
  useEffect(() => {
    if (selection.error === "max") {
      toast.error("Máximo 4 boletas por compra");
    } else if (selection.error === "orphan") {
      toast.error(
        "Esa selección dejaría una silla sola — elige sillas contiguas",
      );
    }
  }, [selection.error]);

  const value = useMemo<SelectionContextValue>(
    () => ({ ...selection, hydrated }),
    [selection, hydrated],
  );

  // Stable actions object — dispatch identity is stable across renders
  const actions = useMemo(() => ({ dispatch }), [dispatch]);

  return (
    <SelectionStateContext.Provider value={value}>
      <SelectionActionsContext.Provider value={actions}>
        {children}
      </SelectionActionsContext.Provider>
    </SelectionStateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSelectionState(): SelectionContextValue {
  const ctx = useContext(SelectionStateContext);
  if (!ctx) throw new Error("useSelectionState must be used inside SelectionProvider");
  return ctx;
}

export function useSelectionActions(): { dispatch: Dispatch<SelectionAction> } {
  const ctx = useContext(SelectionActionsContext);
  if (!ctx) throw new Error("useSelectionActions must be used inside SelectionProvider");
  return ctx;
}

export function useSelection(): SelectionContextValue & {
  dispatch: Dispatch<SelectionAction>;
} {
  return { ...useSelectionState(), ...useSelectionActions() };
}
