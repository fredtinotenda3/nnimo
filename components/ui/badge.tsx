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
        success: "border-transparent bg-secondary text-secondary-foreground",
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