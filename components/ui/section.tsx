import * as React from "react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

export interface SectionProps extends React.ComponentProps<"section"> {
  /** Renders children inside a Container automatically. Disable for full-bleed sections. */
  contained?: boolean;
  tone?: "default" | "sunken";
}

/** Vertical rhythm unit for the page — every homepage/landing block should be a Section. */
function Section({
  className,
  contained = true,
  tone = "default",
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "py-16 sm:py-20 lg:py-28",
        tone === "sunken" && "bg-surface-sunken",
        className,
      )}
      {...props}
    >
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}

export { Section };