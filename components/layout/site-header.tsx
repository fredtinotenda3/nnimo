"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { PRIMARY_NAV } from "@/lib/navigation";
import { CartTrigger } from "@/components/commerce/cart-trigger";
import { SiteLogo } from "@/components/site/site-logo";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SiteHeaderProps {
  cartCount?: number;
  overHero?: boolean;
}

function SiteHeader({ overHero = false, cartCount = 0 }: SiteHeaderProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (!overHero) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24);
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [overHero]);

  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (!menuOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const first = drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (toggleRef.current) focusable.push(toggleRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  React.useEffect(() => {
    if (wasOpen.current && !menuOpen) toggleRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  const solid = !overHero || scrolled || menuOpen;

  return (
    <>
      <a
        href="#main"
        className="text-nav sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:bg-surface focus-visible:px-4 focus-visible:py-3 focus-visible:text-foreground"
      >
        Skip to content
      </a>

      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
          solid
            ? "border-b border-border bg-background/95 backdrop-blur-sm"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <Container>
          <div className="flex h-16 items-center justify-between gap-6 lg:h-20">
            <Link href="/" className="shrink-0" aria-label="Nnino Ceramics — home">
              <SiteLogo className="h-7 lg:h-8" invert={!solid} />
            </Link>

            <nav aria-label="Primary" className="hidden lg:block">
              <ul className="flex items-center gap-6 xl:gap-8">
                {PRIMARY_NAV.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "text-nav relative py-2 transition-colors",
                          solid
                            ? "text-muted-foreground hover:text-foreground"
                            : "text-warm-white/80 hover:text-warm-white",
                          active && (solid ? "text-foreground" : "text-warm-white"),
                        )}
                      >
                        {item.label}
                        {active ? (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 left-0 h-px w-full bg-primary"
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="flex items-center gap-1">
              <CartTrigger count={cartCount} solid={solid} />

              <button
                ref={toggleRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                className={cn(
                  "-mr-2 inline-flex h-11 w-11 items-center justify-center transition-colors lg:hidden",
                  solid ? "text-foreground" : "text-warm-white",
                )}
              >
                {menuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
                <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              </button>
            </div>
          </div>
        </Container>
      </header>

      <div id="mobile-nav" ref={drawerRef}>
        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
              className="fixed inset-x-0 top-16 z-40 border-b border-border bg-background lg:hidden"
            >
              <Container>
                <nav aria-label="Mobile" className="py-6">
                  <ul className="flex flex-col">
                    {PRIMARY_NAV.map((item) => (
                      <li key={item.href} className="border-b border-border last:border-0">
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className="text-heading-2 block py-4 text-foreground"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </Container>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

export { SiteHeader };