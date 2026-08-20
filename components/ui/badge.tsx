import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "text-metadata inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 leading-none",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-sunken text-muted-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        // Was `bg-secondary` (Clay Green, the secondary *action* colour) reused
        // for the success *state* colour. Phase 9 gives success its own token
        // (§ globals.css) so a future change to the secondary button colour
        // can no longer silently recolour every "Published"/"Paid" badge.
        success: "border-transparent bg-success text-success-foreground",
        // Added Phase 9, additive — not yet adopted by any existing badge call
        // (those keep using "accent" for attention states, which already reads
        // correctly). Available where a distinct warning/information tone is
        // clearer than the general-purpose accent, e.g. a future low-stock or
        // payment-pending indicator.
        warning: "border-transparent bg-warning text-warning-foreground",
        information: "border-transparent bg-information text-information-foreground",
        outline: "border-border-strong bg-transparent text-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };