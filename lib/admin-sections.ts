import type { Permission } from "@/lib/rbac";

export type AdminSection = {
  label: string;
  href: string;
  permission: Permission;
  built: boolean;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { label: "Dashboard",      href: "/admin",               permission: "dashboard:read",     built: true  },
  { label: "Products",       href: "/admin/products",       permission: "product:read",       built: true  },
  { label: "Collections",    href: "/admin/collections",    permission: "collection:read",    built: true  },
  { label: "Team",           href: "/admin/team",           permission: "artist:read",        built: true  },
  { label: "Inventory",      href: "/admin/inventory",      permission: "inventory:read",     built: false },
  { label: "Orders",         href: "/admin/orders",         permission: "order:read",         built: true },
  { label: "Customers",      href: "/admin/customers",      permission: "customer:read",      built: false },
  { label: "Custom orders",  href: "/admin/custom-orders",  permission: "custom_order:read",  built: false },
  { label: "Wholesale",      href: "/admin/wholesale",      permission: "wholesale:read",     built: false },
  { label: "Campaigns",      href: "/admin/campaigns",      permission: "campaign:read",      built: false },
  { label: "Landing pages",  href: "/admin/landing-pages",  permission: "campaign:read",      built: false },
  { label: "Content",        href: "/admin/content",        permission: "content:read",       built: false },
  { label: "Media",          href: "/admin/media",          permission: "media:read",         built: false },
  { label: "Settings",       href: "/admin/settings",       permission: "settings:write",     built: false },
];