import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import type { Role } from "@/lib/generated/prisma/enums";

// String literals, not a runtime import of the Role enum — importing the
// value (not just the type) from "@/lib/generated/prisma/enums" fails under
// the unit-test stub (see tests/stubs/db.ts and vitest.config.ts), the same
// reason tests/rbac.test.ts does this.
const ALL_ROLES: Role[] = [
  "OWNER",
  "MANAGER",
  "PRODUCT_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "CONTENT_MANAGER",
];

/**
 * Campaign admin authorization.
 *
 * app/admin/campaigns/actions.ts and app/admin/campaigns/[id]/page.tsx guard
 * every mutation with `requireMutationPermission("campaign:write")` and every
 * read with `requirePermission("campaign:read")` — see those files. This
 * suite asserts the permission MATRIX those calls rely on, the same way
 * tests/rbac.test.ts asserts it for every other resource, rather than
 * re-deriving RBAC's own logic.
 */
describe("campaign authorization", () => {
  it("lets MARKETING_MANAGER and MANAGER manage campaigns", () => {
    expect(can("MARKETING_MANAGER", "campaign:read")).toBe(true);
    expect(can("MARKETING_MANAGER", "campaign:write")).toBe(true);
    expect(can("MANAGER", "campaign:read")).toBe(true);
    expect(can("MANAGER", "campaign:write")).toBe(true);
  });

  it("gives OWNER full campaign access", () => {
    expect(can("OWNER", "campaign:read")).toBe(true);
    expect(can("OWNER", "campaign:write")).toBe(true);
  });

  it("keeps every other role out of campaign:write", () => {
    const excluded: Role[] = ["PRODUCT_MANAGER", "ORDER_MANAGER", "CONTENT_MANAGER"];
    for (const role of excluded) {
      expect(can(role, "campaign:write")).toBe(false);
    }
  });

  it("is all-or-nothing per role — no role can read campaigns but not write them, or vice versa", () => {
    // Unlike product/collection (where PRODUCT_MANAGER gets write but
    // ORDER_MANAGER gets read-only), campaign:read and campaign:write are
    // granted to exactly the same two roles — see lib/rbac.ts. This test
    // documents that as a deliberate choice, not an oversight: there is no
    // "can see campaigns but not run them" role in this phase.
    for (const role of ALL_ROLES) {
      expect(can(role, "campaign:read")).toBe(can(role, "campaign:write"));
    }
  });

  it("lists Campaigns as built in the admin nav", () => {
    const section = ADMIN_SECTIONS.find((entry) => entry.href === "/admin/campaigns");
    expect(section).toBeDefined();
    expect(section?.built).toBe(true);
    expect(section?.permission).toBe("campaign:read");
  });
});
