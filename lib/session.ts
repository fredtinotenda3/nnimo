import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";
import { logger } from "@/lib/logger";
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

/**
 * The guard for server actions that CHANGE something.
 *
 * PHASE 8 (finding M3). `RATE_LIMIT_RULES.adminMutation` was defined in Phase 5 and
 * called from nowhere. An unused limit is worse than a missing one, because it reads
 * as coverage: someone reviewing lib/rate-limit.ts sees a rule named for admin
 * mutations and reasonably concludes admin mutations are limited.
 *
 * WHY NOT JUST PUT THE LIMIT IN requirePermission()
 *
 * That was the tempting one-line version, and it is wrong. `requirePermission` is
 * called by every admin PAGE as well as every action, and several times per render
 * in places — app/admin/products/actions.ts alone calls it eleven times across nine
 * actions. Charging reads against a mutation budget would mean an operator working
 * through the catalogue on a busy afternoon could throttle themselves out of their
 * own admin by browsing. So reads keep using `requirePermission` and writes use
 * this, which makes the distinction greppable rather than implicit.
 *
 * WHAT THIS IS AND IS NOT FOR
 *
 * It is a blast-radius bound on an ALREADY-AUTHENTICATED session: a compromised
 * operator cookie, a runaway script, or a stuck client retrying a form. It is not an
 * access control — RBAC is, immediately below, and it runs first. Identity is the
 * client address rather than the user id, deliberately: a stolen session used from
 * one machine should be bounded even though it presents a different user id each
 * time it rotates.
 *
 * 120 per minute is high on purpose. Bulk work in the admin — reordering a
 * collection's images, working through an order queue — is legitimately bursty, and
 * a limit that interrupts real work is a limit that gets removed.
 *
 * FAILS OPEN, per the rule's configuration: a Redis outage must not stop the studio
 * fulfilling orders.
 */
export async function requireMutationPermission(permission: Permission): Promise<AdminUser> {
  // Authorisation FIRST. An unauthenticated or unauthorised caller must be rejected
  // on those grounds, not told to slow down — a 429 to an anonymous caller would
  // confirm the endpoint exists and is worth retrying.
  const user = await requirePermission(permission);

  const limit = await checkRateLimit("adminMutation", await clientIdentity());
  if (!limit.allowed) {
    logger.warn("admin.mutation_rate_limited", { userId: user.id, permission });
    // Thrown rather than returned: every call site has a different error-shape
    // convention (some return `{ error }`, some redirect), and 120 writes a minute
    // from one operator is not a normal path that deserves inline handling. The
    // Phase 8 error boundary (app/admin/error.tsx) renders this without leaking
    // internals.
    throw new Error("Too many changes in a short time. Please wait a moment and try again.");
  }

  return user;
}

/** For route handlers, where redirecting is the wrong response. */
export async function requirePermissionOrThrow(permission: Permission): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (!can(user.role, permission)) throw new Response("Forbidden", { status: 403 });
  return user;
}
