import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_LABELS, can, permissionsFor, type Permission } from "@/lib/rbac";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import type { Role } from "@/lib/generated/prisma/enums";

const ALL_ROLES: Role[] = [
  "OWNER",
  "MANAGER",
  "PRODUCT_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "CONTENT_MANAGER",
];

/**
 * The permission matrix.
 *
 * These assertions encode decisions, not current behaviour: if someone widens a
 * role, the test that fails should be the one describing why that role was
 * narrow. The two that matter most are that OWNER alone can read the audit log
 * and manage users — the pair of capabilities that would let an account quietly
 * escalate or check whether its tracks were covered.
 */
describe("role permissions", () => {
  it("gives OWNER everything", () => {
    for (const permission of PERMISSIONS) {
      expect(can("OWNER", permission)).toBe(true);
    }
  });

  it("reserves user management and the audit log for OWNER alone", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "OWNER";
      expect(can(role, "user:manage")).toBe(expected);
      expect(can(role, "audit:read")).toBe(expected);
    }
  });

  it("lets MANAGER run the business but not manage users", () => {
    expect(can("MANAGER", "product:write")).toBe(true);
    expect(can("MANAGER", "order:write")).toBe(true);
    expect(can("MANAGER", "order:refund")).toBe(true);
    expect(can("MANAGER", "settings:write")).toBe(true);
    expect(can("MANAGER", "user:manage")).toBe(false);
    expect(can("MANAGER", "audit:read")).toBe(false);
  });

  it("keeps PRODUCT_MANAGER out of orders and customers", () => {
    expect(can("PRODUCT_MANAGER", "product:write")).toBe(true);
    expect(can("PRODUCT_MANAGER", "collection:write")).toBe(true);
    expect(can("PRODUCT_MANAGER", "media:write")).toBe(true);
    expect(can("PRODUCT_MANAGER", "order:read")).toBe(false);
    expect(can("PRODUCT_MANAGER", "order:write")).toBe(false);
    expect(can("PRODUCT_MANAGER", "customer:read")).toBe(false);
    expect(can("PRODUCT_MANAGER", "settings:write")).toBe(false);
  });

  it("lets ORDER_MANAGER read the catalogue but never change it", () => {
    expect(can("ORDER_MANAGER", "product:read")).toBe(true);
    expect(can("ORDER_MANAGER", "product:write")).toBe(false);
    expect(can("ORDER_MANAGER", "collection:write")).toBe(false);
    expect(can("ORDER_MANAGER", "order:write")).toBe(true);
    expect(can("ORDER_MANAGER", "custom_order:write")).toBe(true);
  });

  it("grants customer:write only to roles that handle orders", () => {
    expect(can("OWNER", "customer:write")).toBe(true);
    expect(can("MANAGER", "customer:write")).toBe(true);
    expect(can("ORDER_MANAGER", "customer:write")).toBe(true);
    expect(can("PRODUCT_MANAGER", "customer:write")).toBe(false);
    expect(can("MARKETING_MANAGER", "customer:write")).toBe(false);
    expect(can("CONTENT_MANAGER", "customer:write")).toBe(false);
  });

  it("never lets a non-owner refund except MANAGER", () => {
    const canRefund = ALL_ROLES.filter((role) => can(role, "order:refund"));
    expect(canRefund.sort()).toEqual(["MANAGER", "OWNER"]);
  });

  it("gives every role the dashboard and nothing without a role", () => {
    for (const role of ALL_ROLES) {
      expect(can(role, "dashboard:read")).toBe(true);
    }
    expect(can(null, "dashboard:read")).toBe(false);
    expect(can(undefined, "product:read")).toBe(false);
  });

  it("declares a label for every role", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("issues no permission outside the declared set", () => {
    const declared = new Set<string>(PERMISSIONS);
    for (const role of ALL_ROLES) {
      for (const permission of permissionsFor(role)) {
        expect(declared.has(permission)).toBe(true);
      }
    }
  });
});

describe("admin navigation", () => {
  it("gates every section on a real permission", () => {
    const declared = new Set<string>(PERMISSIONS);
    for (const section of ADMIN_SECTIONS) {
      expect(declared.has(section.permission)).toBe(true);
    }
  });

  it("has no duplicate routes", () => {
    const hrefs = ADMIN_SECTIONS.map((section) => section.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("marks every Phase 4 section as built", () => {
    const phase4 = [
      "/admin",
      "/admin/products",
      "/admin/collections",
      "/admin/media",
      "/admin/orders",
      "/admin/customers",
      "/admin/inquiries",
      "/admin/team",
      "/admin/content",
      "/admin/settings",
      "/admin/audit",
    ];
    for (const href of phase4) {
      const section = ADMIN_SECTIONS.find((candidate) => candidate.href === href);
      expect(section, `${href} missing from the navigation`).toBeDefined();
      expect(section?.built, `${href} is not marked built`).toBe(true);
    }
  });

  it("shows a role only the sections it can reach", () => {
    const visible = (role: Role) =>
      ADMIN_SECTIONS.filter((section) => can(role, section.permission)).map((s) => s.href);

    // The audit log is the one that must never leak into another role's nav.
    expect(visible("MANAGER")).not.toContain("/admin/audit");
    expect(visible("OWNER")).toContain("/admin/audit");

    expect(visible("PRODUCT_MANAGER")).not.toContain("/admin/orders");
    expect(visible("PRODUCT_MANAGER")).not.toContain("/admin/customers");
    expect(visible("PRODUCT_MANAGER")).toContain("/admin/products");

    expect(visible("CONTENT_MANAGER")).toContain("/admin/content");
    expect(visible("CONTENT_MANAGER")).not.toContain("/admin/settings");
  });
});

describe("permission naming", () => {
  it("uses a consistent resource:verb shape", () => {
    for (const permission of PERMISSIONS as readonly Permission[]) {
      expect(permission).toMatch(/^[a-z_]+:[a-z_]+$/);
    }
  });
});
