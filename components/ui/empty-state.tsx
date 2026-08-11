import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  /** What is not here. Sentence case, no full stop. */
  title: string;
  /** What to do about it. An empty screen is an instruction, not an apology. */
  description?: string;
  action?: React.ReactNode;
}

/**
 * Empty states name the next action rather than describing the void. No
 * illustrations, no "Oops!" — the copy does the work.
 */
function EmptyState({
  className,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 border border-dashed border-border-strong bg-surface px-6 py-12 sm:px-10",
        "rounded-[var(--radius-md)]",
        className,
      )}
      {...props}
    >
      <p className="text-heading-3">{title}</p>
      {description ? (
        <p className="text-body-sm max-w-prose text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
