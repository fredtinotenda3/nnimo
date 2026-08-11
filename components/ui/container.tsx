import * as React from "react";
import { cn } from "@/lib/utils";

/** Constrains content to the site's reading/shopping width with responsive gutters. */
function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12", className)}
      {...props}
    />
  );
}

export { Container };