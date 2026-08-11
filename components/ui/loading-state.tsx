import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A shimmer block. `animate-pulse` is suppressed automatically for anyone with
 * prefers-reduced-motion by the base layer in globals.css.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-sm)] bg-surface-sunken",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export interface LoadingStateProps extends React.ComponentProps<"div"> {
  /** Announced to assistive technology while content loads. */
  label?: string;
  /** Number of shimmer rows. */
  rows?: number;
}

/**
 * Used as the body of a Suspense boundary or a route-level loading.tsx. The
 * status role plus a label means screen readers say something is happening
 * instead of falling silent.
 */
function LoadingState({
  className,
  label = "Loading",
  rows = 3,
  ...props
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex w-full flex-col gap-3", className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={index === 0 ? "h-6 w-1/3" : "h-4 w-full"} />
      ))}
    </div>
  );
}

export { LoadingState, Skeleton };
