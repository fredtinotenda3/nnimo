import * as React from "react";
import Link from "next/link";

/**
 * The masthead every admin page opens with.
 *
 * One component rather than repeated markup so the eyebrow / title / actions
 * rhythm stays identical across fourteen sections — an operator moving between
 * Products and Orders should not have to re-find the primary action.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="text-metadata text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {backLabel ?? "Back"}
          </Link>
        ) : eyebrow ? (
          <p className="text-label text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-heading-1 mt-3">{title}</h1>
        {description ? (
          <div className="text-body-sm mt-3 max-w-2xl text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}

/**
 * A labelled section within a page.
 *
 * Admin pages are long forms; without consistent section headings they read as
 * one undifferentiated wall of inputs.
 */
export function AdminSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-heading-2">{title}</h2>
          {description ? (
            <div className="text-body-sm mt-2 max-w-2xl text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
