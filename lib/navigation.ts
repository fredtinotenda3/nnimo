/**
 * Public navigation map.
 *
 * Lives in its own module, not in site-header.tsx, because site-header is a
 * "use client" module: importing a plain value out of a client module into a
 * server component (the footer) yields a client *reference*, not the array, and
 * `.map` on it throws at render time. Shared data that both server and client
 * components need has to sit outside the client boundary.
 */
export type NavItem = { label: string; href: string };

export const PRIMARY_NAV: NavItem[] = [
  { label: "Collections", href: "/collections" },
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Nnino Family", href: "/family" },
  { label: "Custom", href: "/custom" },
  { label: "Contact", href: "/contact" },
];

/** Buying-related links, shown in the footer only. */
export const FOOTER_BUYING_NAV: NavItem[] = [
  { label: "Custom commissions", href: "/custom" },
  { label: "Wholesale enquiries", href: "/custom" },
  { label: "Contact the studio", href: "/contact" },
];
