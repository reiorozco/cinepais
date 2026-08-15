import type { ReactNode } from "react";

type EmptyStateProps = {
  /** Optional override for the primary line. */
  title?: string;
  /** Optional supporting line rendered below the title. */
  description?: string;
  /** Slot for a small piece of decorative content above the title. */
  icon?: ReactNode;
};

/**
 * Neutral placeholder for tab panels or lists that have no content yet.
 *
 * Server component: no interactivity, no state — a pure visual affordance
 * that keeps the layout from collapsing when the underlying data set is
 * empty (e.g. the "Pronto" and "Preventa" tabs in Fase 1 which are wired
 * but not populated from the seed).
 */
export function EmptyState({
  title = "Próximamente — vuelve pronto",
  description,
  icon,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"
    >
      {icon ? <div aria-hidden className="text-muted-foreground/70">{icon}</div> : null}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground/80">{description}</p>
      ) : null}
    </div>
  );
}
