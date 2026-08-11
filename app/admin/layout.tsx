import * as React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { AdminNav } from "@/components/admin/admin-nav";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Nnino Admin" },
  // The admin must never be indexed, whatever a crawler finds.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The authorisation boundary for every admin route.
 *
 * requireAdmin() resolves the session and re-reads the User row, so a
 * deactivated account loses access on its next request rather than when its JWT
 * expires. proxy.ts only does a cookie check for the redirect — it is not
 * trusted here.
 *
 * Individual pages additionally call requirePermission() for their own section,
 * because a layout guard alone would let a URL typed directly into the address
 * bar reach a page the role should not see.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  const sections = ADMIN_SECTIONS.filter((section) => can(user.role, section.permission));

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      <aside className="border-b border-border bg-surface lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-8 p-6 lg:sticky lg:top-0 lg:max-h-dvh lg:overflow-y-auto">
          <div>
            <Link href="/" className="text-heading-2">
              Nnino
            </Link>
            <p className="text-metadata mt-1 text-muted-foreground">Operations</p>
          </div>

          <AdminNav sections={sections} />

          <div className="mt-auto border-t border-border pt-5">
            <p className="text-body-sm font-medium">{user.name}</p>
            <p className="text-metadata mt-1 text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </p>
            <div className="-ml-3 mt-2">
              <SignOutButton />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10 lg:py-14">
          {children}
        </div>
      </div>
    </div>
  );
}
