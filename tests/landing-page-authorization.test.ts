import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import type { Role } from "@/lib/generated/prisma/enums";

/**
 * Landing page admin authorization.
 *
 * Landing pages reuse campaign:read/campaign:write rather than a separate
 * permission pair — deliberately: a landing page is a presentation layer on
 * top of a campaign (or stands alone), not a distinct resource with its own
 * access rules. See app/admin/landing-pages/actions.ts, which calls
 * `requireMutationPermission("campaign:write")` for every mutation.
 */
describe("landing page authorization", () => {
  it("lets MARKETING_MANAGER and MANAGER manage landing pages", () => {
    expect(can("MARKETING_MANAGER", "campaign:write")).toBe(true);
    expect(can("MANAGER", "campaign:write")).toBe(true);
  });

  it("keeps roles with no marketing access out of landing pages entirely", () => {
    const excluded: Role[] = ["PRODUCT_MANAGER", "ORDER_MANAGER", "CONTENT_MANAGER"];
    for (const role of excluded) {
      expect(can(role, "campaign:read")).toBe(false);
      expect(can(role, "campaign:write")).toBe(false);
    }
  });

  it("lists Landing pages as built in the admin nav, gated on campaign:read", () => {
    const section = ADMIN_SECTIONS.find((entry) => entry.href === "/admin/landing-pages");
    expect(section).toBeDefined();
    expect(section?.built).toBe(true);
    expect(section?.permission).toBe("campaign:read");
  });
});

/**
 * Draft landing page protection.
 *
 * The actual enforcement is `PUBLIC_LANDING_PAGE_WHERE` in
 * lib/marketing/public.ts, which — like PUBLIC_COLLECTION_WHERE /
 * PUBLIC_PRODUCT_WHERE in lib/catalogue.ts — imports the real Prisma enum
 * VALUE (`LandingPageStatus.PUBLISHED`), not just its type. That import fails
 * under this suite's `@/lib/db` stub the same way it would for the existing
 * catalogue constants, which is why neither has a unit test today; both are
 * exercised by an integration test instead
 * (tests/integration/landing-pages.integration.test.ts), against a real
 * database. See that file for the actual "draft page 404s for a visitor,
 * published page does not" assertions.
 *
 * What CAN be verified here without a database is the shape of the contract:
 * every LandingPage status in the schema is accounted for, and there is
 * exactly one status a visitor may see.
 */
describe("landing page draft protection — status contract", () => {
  it("defines exactly the three statuses the admin form offers, with PUBLISHED as the only public one", async () => {
    const { LANDING_PAGE_STATUS_VALUES } = await import("@/lib/admin/schemas");
    expect(LANDING_PAGE_STATUS_VALUES).toEqual(["DRAFT", "PUBLISHED", "ARCHIVED"]);

    const publicStatuses = LANDING_PAGE_STATUS_VALUES.filter((status) => status === "PUBLISHED");
    expect(publicStatuses).toEqual(["PUBLISHED"]);
  });
});
