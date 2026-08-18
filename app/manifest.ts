import type { MetadataRoute } from "next";

/**
 * PHASE 8 (finding M6). Web app manifest.
 *
 * Modest but not cosmetic: without a manifest, a visitor who adds the site to a
 * phone home screen — a realistic thing for a returning customer or for the studio
 * team using /admin daily — gets the bare hostname as the label and a screenshot of
 * the page as the icon. With one, they get the brand name and the correct theme
 * colour behind the status bar.
 *
 * DELIBERATELY NOT A PWA. `display: "browser"` and no icons array, because:
 *
 *   - There is no service worker in this application and Phase 8 must not add one.
 *     Declaring `display: "standalone"` without offline handling produces an app-like
 *     shell that shows the browser's offline error page instead of a graceful
 *     fallback, which is a worse experience than the tab it replaced.
 *   - The available brand artwork (public/brand/nnino-wordmark.png and
 *     nnino-motif.png) is a wide wordmark and a motif, neither of which is a square
 *     maskable icon. Listing them would produce a letterboxed or clipped home-screen
 *     icon. Generating proper 192/512 maskable icons needs a design decision about
 *     how the motif is cropped, which is Marion's call and not mine to guess — noted
 *     in PHASE-8-REPORT.md.
 *
 * So this declares only what is true and useful today. app/favicon.ico continues to
 * serve the browser tab.
 *
 * The theme colour matches `viewport.themeColor` in app/layout.tsx. If one changes,
 * change both.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nnino Ceramics",
    short_name: "Nnino",
    description:
      "Handcrafted ceramics and sculpture from Bulawayo, Zimbabwe. Every piece is individually designed, hand sculptured, hand painted and signed.",
    start_url: "/",
    display: "browser",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    lang: "en-ZW",
    dir: "ltr",
  };
}
