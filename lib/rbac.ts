import { Role } from "@/lib/generated/prisma/enums";

/**
 * Permissions are coarse-grained on purpose: one permission per admin section,
 * plus the two genuinely dangerous capabilities (managing users, issuing
 * refunds). Nnino is a ten-person business — a finer matrix would be
 * complexity nobody maintains, and unmaintained permissions drift into
 * everyone-gets-OWNER.
 *
 * Phase 4 added exactly one permission — `customer:write`, for editing consent
 * and internal notes on a customer record. Everything else the admin CMS needs
 * was already expressible: product/collection/artist/content/media/settings
 * writes, custom_order writes and audit:read all existed from Phase 1. Sections
 * that only read (the audit log, the customer directory) reuse the existing
 * read permission rather than inventing a paired one nobody would revoke
 * separately.
 */
export const PERMISSIONS = [
  "dashboard:read",
  "product:read",
  "product:write",
  "collection:read",
  "collection:write",
  "inventory:read",
  "inventory:write",
  "order:read",
  "order:write",
  "order:refund",
  "order:settle",
  "customer:read",
  "customer:write",
  "artist:read",
  "artist:write",
  "custom_order:read",
  "custom_order:write",
  "wholesale:read",
  "wholesale:write",
  "campaign:read",
  "campaign:write",
  "content:read",
  "content:write",
  "media:read",
  "media:write",
  "settings:write",
  "user:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CATALOGUE: Permission[] = [
  "product:read",
  "product:write",
  "collection:read",
  "collection:write",
  "inventory:read",
  "inventory:write",
  "artist:read",
  "artist:write",
  "media:read",
  "media:write",
];

const ORDERS: Permission[] = [
  "order:read",
  "order:write",
  "customer:read",
  "customer:write",
  "custom_order:read",
  "custom_order:write",
  "wholesale:read",
  "wholesale:write",
];

const MARKETING: Permission[] = [
  "campaign:read",
  "campaign:write",
  "content:read",
  "content:write",
  "media:read",
  "media:write",
  "product:read",
  "collection:read",
];

const CONTENT: Permission[] = [
  "content:read",
  "content:write",
  "media:read",
  "media:write",
  "artist:read",
  "artist:write",
  "product:read",
  "collection:read",
];

/**
 * OWNER is the only role that can manage users or read the audit log — the two
 * capabilities that would let someone quietly escalate or cover their tracks.
 * MANAGER runs the business day to day but cannot do either.
 *
 * `order:settle` is deliberately NOT in the ORDERS bundle. Marking an order paid
 * by hand is the one admin action that asserts money was received when no
 * payment network said so, and while Paynow is unavailable it is the ONLY way an
 * order becomes PAID. That makes it a finance decision rather than an order-desk
 * one, so it sits with `order:refund` — OWNER and MANAGER — instead of following
 * `order:write` down to ORDER_MANAGER. Widening it is one line here plus the
 * assertion in tests/rbac.test.ts, and should be a deliberate decision by the
 * studio rather than a default.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  MANAGER: [
    "dashboard:read",
    ...CATALOGUE,
    ...ORDERS,
    ...MARKETING,
    ...CONTENT,
    "order:refund",
    "order:settle",
    "settings:write",
  ],
  PRODUCT_MANAGER: ["dashboard:read", ...CATALOGUE],
  ORDER_MANAGER: ["dashboard:read", ...ORDERS, "product:read", "inventory:read"],
  MARKETING_MANAGER: ["dashboard:read", ...MARKETING],
  CONTENT_MANAGER: ["dashboard:read", ...CONTENT],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Human-readable role names for the admin UI. */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  PRODUCT_MANAGER: "Product manager",
  ORDER_MANAGER: "Order manager",
  MARKETING_MANAGER: "Marketing manager",
  CONTENT_MANAGER: "Content manager",
};
