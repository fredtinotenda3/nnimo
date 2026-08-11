import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Semantic table primitives. Real <table> markup, not divs with grid, so screen
 * readers announce rows and columns and the admin can be navigated by keyboard.
 *
 * `caption` is not optional in practice — WCAG 1.3.1 wants a table to say what
 * it contains. Use <TableCaption> and hide it visually with `sr-only` where the
 * surrounding heading already says it.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-left", className)}
        {...props}
      />
    </div>
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      className={cn("text-body-sm mb-3 text-left text-muted-foreground", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b border-border", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors last:border-0 hover:bg-surface-sunken/60",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("text-metadata px-4 py-3 text-muted-foreground first:pl-0 last:pr-0", className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("text-body-sm px-4 py-3.5 align-middle first:pl-0 last:pr-0", className)}
      {...props}
    />
  );
}

/** Right-aligned numeric cell with tabular figures so columns line up. */
function TableNumericCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "text-body-sm px-4 py-3.5 text-right align-middle tabular-nums first:pl-0 last:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumericCell,
};
