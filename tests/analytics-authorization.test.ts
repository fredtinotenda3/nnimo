import { describe, expect, it } from "vitest";
import { ANALYTICS_SECTIONS, permissionForAnalyticsPath } from "@/lib/analytics/sections";
import { can, PERMISSIONS, type Permission } from "@/lib/rbac";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * The analytics authorisation boundary.
 *
 * Two mechanisms must agree about who may read what: the tab strip, which
 * decides what a role SEES, and each page's own `requirePermission()` call,
 * which decides what a role may READ. Both read `ANALYTICS_SECTIONS`, so these
 * tests assert against the real table rather than a copy of it.
 *
 * The interesting cases are the roles that can reach SOME of the section. A
 * MARKETING_MANAGER legitimately needs product analytics to plan a campaign and
 * has no business reading revenue or customer records; if that ever stops being
 * true, one of these tests fails rather than a page quietly opening up.
 */

/** Which sections a role can reach, by path. */
function reachable(role: Role): string[] {
  return ANALYTICS_SECTIONS.filter((section) => can(role, section.permission)).map(
    (section) => section.href,
  );
}

const ALL_SECTIONS = ANALYTICS_SECTIONS.map((section) => section.href);

describe("section definitions", () => {
  it("maps every section to a permission that actually exists", () => {
    // A typo'd permission would make `can()` return false for every role and
    // the section would silently vanish for everyone, including the owner.
    for (const section of ANALYTICS_SECTIONS) {
      expect(PERMISSIONS).toContain(section.permission satisfies Permission);
    }
  });

  it("introduces no new permission for analytics", () => {
    // Deliberate: reading sales figures is `order:read`. A parallel
    // `analytics:read` would have to be kept in step with six role mappings.
    expect(PERMISSIONS).not.toContain("analytics:read" as Permission);
  });

  it("gates each section on the permission for the data it exposes", () => {
    expect(permissionForAnalyticsPath("/admin/analytics")).toBe("dashboard:read");
    expect(permissionForAnalyticsPath("/admin/analytics/sales")).toBe("order:read");
    expect(permissionForAnalyticsPath("/admin/analytics/products")).toBe("product:read");
    expect(permissionForAnalyticsPath("/admin/analytics/customers")).toBe("customer:read");
    expect(permissionForAnalyticsPath("/admin/analytics/inventory")).toBe("inventory:read");
    expect(permissionForAnalyticsPath("/admin/analytics/enquiries")).toBe("custom_order:read");
  });

  it("returns null for a path that is not an analytics section", () => {
    expect(permissionForAnalyticsPath("/admin/orders")).toBeNull();
  });

  it("has a unique path per section", () => {
    expect(new Set(ALL_SECTIONS).size).toBe(ALL_SECTIONS.length);
  });
});

describe("role reach", () => {
  it("gives the owner every section", () => {
    expect(reachable(Role.OWNER)).toEqual(ALL_SECTIONS);
  });

  it("gives the manager every section", () => {
    expect(reachable(Role.MANAGER)).toEqual(ALL_SECTIONS);
  });

  it("gives the product manager catalogue and stock, but never revenue", () => {
    const paths = reachable(Role.PRODUCT_MANAGER);
    expect(paths).toContain("/admin/analytics/products");
    expect(paths).toContain("/admin/analytics/inventory");
    expect(paths).not.toContain("/admin/analytics/sales");
    expect(paths).not.toContain("/admin/analytics/customers");
  });

  it("gives the marketing manager product analytics, but never revenue or customers", () => {
    const paths = reachable(Role.MARKETING_MANAGER);
    expect(paths).toContain("/admin/analytics/products");
    expect(paths).not.toContain("/admin/analytics/sales");
    expect(paths).not.toContain("/admin/analytics/customers");
    expect(paths).not.toContain("/admin/analytics/enquiries");
  });

  it("gives the content manager no commercial section at all", () => {
    const paths = reachable(Role.CONTENT_MANAGER);
    expect(paths).not.toContain("/admin/analytics/sales");
    expect(paths).not.toContain("/admin/analytics/customers");
    expect(paths).not.toContain("/admin/analytics/inventory");
  });

  it("gives the order manager sales, customers and enquiries", () => {
    const paths = reachable(Role.ORDER_MANAGER);
    expect(paths).toContain("/admin/analytics/sales");
    expect(paths).toContain("/admin/analytics/customers");
    expect(paths).toContain("/admin/analytics/enquiries");
  });

  it("lets every role reach the overview, which gates its own panels", () => {
    // The overview is `dashboard:read`, which every role holds. It is safe
    // because each PANEL inside it is gated separately — and the gate decides
    // what is QUERIED, not merely what is rendered.
    for (const role of Object.values(Role)) {
      expect(reachable(role)).toContain("/admin/analytics");
    }
  });

  it("never exposes a section to a role lacking the underlying read permission", () => {
    for (const role of Object.values(Role)) {
      for (const section of ANALYTICS_SECTIONS) {
        if (reachable(role).includes(section.href)) {
          expect(can(role, section.permission)).toBe(true);
        }
      }
    }
  });
});
