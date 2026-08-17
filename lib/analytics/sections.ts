import type { Permission } from "@/lib/rbac";

export type AnalyticsSection = {
  label: string;
  href: string;
  permission: Permission;
};

/**
 * The analytics sections and the permission each one requires.
 *
 * Kept here rather than inside the tab component for two reasons. It is the
 * authorisation contract for the whole section, and a contract that only exists
 * inside a `.tsx` file cannot be unit tested without rendering React — so it
 * would not be tested, which is how a new page quietly ships readable by every
 * role. And it mirrors lib/admin-sections.ts, which does the same job for the
 * top-level admin navigation.
 *
 * NO NEW PERMISSION WAS INTRODUCED. The six existing read permissions express
 * this exactly: sales needs `order:read`, products `product:read`, and so on.
 * An `analytics:read` permission would have had to be added to every role's
 * mapping to say something already sayable, and a coarser one would have given
 * a MARKETING_MANAGER the revenue figures that `order:read` deliberately
 * withholds.
 *
 * This list drives which TABS a role sees. It is not the gate: every page calls
 * `requirePermission()` for itself, because a URL typed into the address bar
 * never passes through here.
 */
export const ANALYTICS_SECTIONS: AnalyticsSection[] = [
  { label: "Overview",  href: "/admin/analytics",            permission: "dashboard:read"    },
  { label: "Sales",     href: "/admin/analytics/sales",      permission: "order:read"        },
  { label: "Products",  href: "/admin/analytics/products",   permission: "product:read"      },
  { label: "Customers", href: "/admin/analytics/customers",  permission: "customer:read"     },
  { label: "Inventory", href: "/admin/analytics/inventory",  permission: "inventory:read"    },
  { label: "Enquiries", href: "/admin/analytics/enquiries",  permission: "custom_order:read" },
];

/**
 * The permission a given analytics path requires, or null if it is not one.
 *
 * Exists so the mapping can be asserted directly in a test rather than
 * re-derived there: a test that rebuilds the table it is checking will agree
 * with itself no matter what the application does.
 */
export function permissionForAnalyticsPath(path: string): Permission | null {
  return ANALYTICS_SECTIONS.find((section) => section.href === path)?.permission ?? null;
}
