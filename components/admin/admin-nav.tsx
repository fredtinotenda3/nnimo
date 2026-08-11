"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
 
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/admin-sections";

export function AdminNav({ sections }: { sections: AdminSection[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections">
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => {
          const active =
            section.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(section.href);

          if (!section.built) {
            return (
              <li key={section.href}>
                <span
                  aria-disabled="true"
                  className="text-body-sm flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-muted-foreground/60"
                >
                  {section.label}
                  <span className="text-metadata text-muted-foreground/60">Soon</span>
                </span>
              </li>
            );
          }

          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-body-sm flex items-center rounded-[var(--radius-sm)] px-3 py-2 transition-colors",
                  active
                    ? "bg-surface-sunken font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { ADMIN_SECTIONS };
