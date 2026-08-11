import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@/lib/generated/prisma/enums";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * The real authorisation boundary.
 *
 * proxy.ts only performs a cheap cookie check to redirect anonymous visitors —
 * it is a UX convenience, not a security control, and must never be the only
 * gate (see docs/architecture/security.md). Every admin page, route handler and
 * server action calls one of the functions below, which resolve the session and
 * then re-read the User row so that deactivation and role changes take effect
 * on the very next request rather than when the JWT happens to expire.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function requireAdmin(): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission): Promise<AdminUser> {
  const user = await requireAdmin();
  if (!can(user.role, permission)) redirect("/admin?denied=" + encodeURIComponent(permission));
  return user;
}

/** For route handlers, where redirecting is the wrong response. */
export async function requirePermissionOrThrow(permission: Permission): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (!can(user.role, permission)) throw new Response("Forbidden", { status: 403 });
  return user;
}
