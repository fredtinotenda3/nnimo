import type { Permission } from "@/lib/rbac";

export type AdminSection = {
  label: string;
  href: string;
  permission: Permission;
  built: boolean;
};

/**
 * The admin navigation.
 *
 * Every entry is filtered through `can()` in the layout, so a role only ever
 * sees the sections it holds a permission for — but that is presentation, not
 * protection. Each page independently calls `requirePermission()`, because a URL
 * typed into the address bar never passes through this list.
 *
 * `built: false` is now only Inventory. Phase 7 added Analytics and
 * deliberately left Inventory unbuilt: this phase reports ON stock
 * (/admin/analytics/inventory), it does not manage it, and marking the
 * section live would promise an editing surface that does not exist.
 *
 * Campaigns and Landing pages moved to `built: true` in the Marketing Engine
 * phase — both now have full admin CRUD (see app/admin/campaigns and
 * app/admin/landing-pages).
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  { label: "Dashboard",      href: "/admin",               permission: "dashboard:read",     built: true  },
  { label: "Analytics",      href: "/admin/analytics",     permission: "dashboard:read",     built: true  },
  { label: "Products",       href: "/admin/products",      permission: "product:read",       built: true  },
  { label: "Collections",    href: "/admin/collections",   permission: "collection:read",    built: true  },
  { label: "Campaigns",      href: "/admin/campaigns",     permission: "campaign:read",      built: true  },
  { label: "Landing pages",  href: "/admin/landing-pages", permission: "campaign:read",      built: true  },
  { label: "Media",          href: "/admin/media",         permission: "media:read",         built: true  },
  { label: "Orders",         href: "/admin/orders",        permission: "order:read",         built: true  },
  { label: "Customers",      href: "/admin/customers",     permission: "customer:read",      built: true  },
  { label: "Enquiries",      href: "/admin/inquiries",     permission: "custom_order:read",  built: true  },
  { label: "Team",           href: "/admin/team",          permission: "artist:read",        built: true  },
  { label: "Content",        href: "/admin/content",       permission: "content:write",      built: true  },
  { label: "Settings",       href: "/admin/settings",      permission: "settings:write",     built: true  },
  { label: "Audit log",      href: "/admin/audit",         permission: "audit:read",         built: true  },
  // Not yet built — later phase.
  { label: "Inventory",      href: "/admin/inventory",     permission: "inventory:read",     built: false },
];
