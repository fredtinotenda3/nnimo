# Phase 9 Report — Nnino Ceramics visual refinement

## 0. Scope actually delivered vs. the full Phase 9 brief

The Phase 9 brief describes a full editorial transformation of every public
and admin page. That is not what shipped in this pass, and this section says
so plainly before anything else, per the decisions made at the start of this
work:

- **External imagery:** none used, none fetched. Real Nnino photography will
  be supplied later; the registry described in §3 is built and ready for it.
- **Scope:** refine the existing design system, not a rebuild. The existing
  token layer, type scale and "gallery label" device were sound going in —
  see `PHASE9-DESIGN-AUDIT.md` (already in the repo) for the full discovery
  pass this work started from.
- **This session's focus:** defect fixes, the product gallery, the image
  registry, loading states, and a scoped responsive/accessibility/admin pass
  — not a page-by-page editorial rewrite of every route in §25 of the brief.

What follows is a complete account of what changed, file by file, and an
equally direct list of what did not get touched and why.

---

## 1. Defects fixed

### 1.1 Contrast failure — "Photograph to follow" (§4.1 of the audit)
`components/catalogue/media-image.tsx`. The fallback caption used
`text-muted-foreground/70` at 2.85:1 against its panel background, below the
4.5:1 WCAG AA text threshold. Changed to `text-muted-foreground` (full
opacity, already an AA-passing token) and softened the copy to "Studio
photography coming soon". Verified 4.5:1+ by computing contrast directly
(relative-luminance formula, not eyeballed).

### 1.2 Input/control border below the non-text contrast threshold (§4.2)
`app/globals.css`. `--color-border-strong` was `#D4C9BA`, measuring 1.63:1 on
white — WCAG 2.2 §1.4.11 requires 3:1 for a control's only visible edge.
Re-tuned to `#8A7E72`, the existing "Stone" brand hex already in the palette
(no new colour introduced), measuring 3.96:1. This is the border every input,
select, textarea, outline button and admin table control draws from, so the
fix applies everywhere it's used without touching any of those components
individually.

### 1.3 Product thumbnails were decorative, not interactive (§4.3 — the
biggest functional gap found)
Clicking a thumbnail on a product page did nothing; the hero image never
changed, and only the first four of any product's photos were reachable at
all. See §2 below — this became the product gallery work.

### 1.4 Hero had no explicit responsive art direction (§4.4)
`app/(site)/page.tsx`. Checked the crop math directly: at every breakpoint
currently shipped (mobile's `aspect-[4/5]` frame, desktop's
`min-h-[92svh]` column), the container is wider relative to height than the
source photograph's 0.75 ratio, so `object-cover` only ever trims the sides
— the full height of the piece was already staying in frame. Set
`object-position` explicitly (`object-[50%_42%]`, biased slightly toward the
giraffe-head cluster that forms the lid handle) rather than leaving it to the
implicit 50/50 default, as a guard against any future container ratio narrow
enough to crop vertically. The reasoning is documented in a code comment
directly above the `<Image>` so a future editor doesn't have to redo this
math. This is the honest extent of "art direction" possible against a single
source crop — true multi-crop art direction needs additional supplied images,
and the registry in §3 is where those would go.

### 1.5 Stale copy referencing a shipped phase (§4.5)
`app/(site)/shop/page.tsx` told visitors "pagination arrives with the cart in
Phase 3" — Phase 3 had shipped, and the shop was hard-capped at 60 results
with no way to reach anything past it. Fixed by actually building pagination
(§4 below), not just editing the sentence.

### 1.6 Loading states were almost entirely absent (§4.6)
One `loading.tsx` existed in the whole app (`app/admin/analytics/`). See §5.

### 1.7 Dark sections improvised opacity values instead of using tokens (§4.7)
`text-warm-white/75`, `border-warm-white/40`, `hover:bg-warm-white/10`
appeared independently in six page files. All three already measured
acceptably (8.02:1 text, 3.40:1 border) — nothing was visually broken — but
every new dark section had to re-guess the same numbers. Added a named
dark-surface token set (§6) with the exact same computed values, composited
against `#2C2C2C` to confirm the ratios before naming them, and swapped all
six files onto the tokens. Visual output is pixel-identical; the numbers are
just named now instead of guessed.

---

## 2. Product gallery (`components/catalogue/product-gallery.tsx`, new)

Replaces the static hero image + four dead thumbnail links with a working
gallery:

- Click any thumbnail (all of them, not just the first four) to change the
  main image; `aria-current` marks the active one.
- Left/right buttons on desktop hover, both wired to the same `go()` step
  function as the thumbnails.
- Touch swipe on the main frame (40px threshold, so scroll jitter isn't
  mistaken for a swipe).
- A fullscreen lightbox: focus-trapped, closes on Escape, arrow keys move
  between photos, focus returns to the opening button on close. The trap
  logic follows the same pattern already used by the mobile nav drawer
  (`components/layout/site-header.tsx`) rather than introducing a second
  approach to the same problem.
- Zero-photo state is unchanged — still renders the existing `MediaImage`
  "Studio photography coming soon" panel, now with the corrected contrast
  from §1.1.

`app/(site)/products/[slug]/page.tsx` was updated to use it; purchasing
logic, product data fetching and the `ProductImageRow` type are untouched.

---

## 3. Editorial image registry (`lib/editorial-images.ts`,
`components/site/editorial-image.tsx`, `public/images/`, both new)

Built as pure architecture, with no images in it yet and no external/stock
imagery used anywhere.

- **`public/images/`** — ten folders (`hero`, `brand`, `craft`, `studio`,
  `custom`, `editorial`, `collection-atmosphere`, `about`, `family`,
  `contact`), each with a `.gitkeep` and a `README.md` explaining the
  convention and how it differs from `/public/brand/` (the existing,
  populated set of real supplied photographs) and the `Media` database table
  (product/collection photography the team manages through the admin).
- **`lib/editorial-images.ts`** — twelve named slots (e.g. `craft-hands`,
  `studio-interior`), each declaring the file path it expects and the alt
  text to ship with it. `resolveEditorialImage()` checks the filesystem at
  request time and returns either the resolved image or "not filled" — every
  slot currently resolves to "not filled", because no files exist yet.
- **`components/site/editorial-image.tsx`** — the consuming component. Renders
  the real photograph once one exists at the registered path; until then,
  renders the same "coming soon" panel style as the product-photography
  fallback, so an empty slot reads as a deliberate design choice.

**Adding a photograph later requires no component changes** — drop the file
at the path named in the registry and it appears on the next request. See
`public/images/README.md` for the exact mapping.

**What was deliberately not done:** wiring these slots into new homepage/
about sections that don't already exist. Every current public page (`about`,
`custom`, `family`, `contact`) is already disciplined about not inventing
content or padding sections — `about/page.tsx` in particular documents that
every substantive paragraph traces to a real `ContentBlock`, with no invented
founding narrative. Forcing new "coming soon" panels into those pages now
would be adding placeholder clutter that isn't currently there, for content
that hasn't been asked to appear yet. The registry is ready; wiring it into
specific sections is a small follow-up once you know which images you're
supplying and where you want them.

---

## 4. Shop pagination (`app/(site)/shop/page.tsx`)

Real, working pagination on the existing filtered/sorted query, replacing the
stale 60-item hard cap:

- `page` query param, parsed and bounds-checked the same way every other
  filter on this page already is (invalid values silently correct to `1`
  rather than being echoed back).
- `skip`/`take` on the existing `db.product.findMany` call (`PAGE_SIZE = 24`).
- An added `db.product.count({ where })` against the *filtered* set, so the
  piece count and page total are correct under any combination of search,
  collection and availability filters, not just the unfiltered total.
- Previous/Next controls that preserve every active filter in the URL, so a
  filtered, sorted, paginated view is still a bookmarkable/shareable link —
  consistent with the rest of this page's plain-GET-form approach.

No cart, catalogue query, or purchasability logic was touched — this is
presentation-layer pagination on a page-level Prisma call that already
existed in this file.

---

## 5. Loading states (19 new `loading.tsx` files + 2 shared skeleton
components)

**Public routes:** `/`, `/shop`, `/products/[slug]`, `/collections`,
`/collections/[slug]`, `/cart`, `/checkout` — each mirrors its real layout
(gallery + info split on product pages, filter bar + grid on shop, etc.)
using the existing `Skeleton`/`LoadingState` primitives
(`components/ui/loading-state.tsx`), which already had `prefers-reduced-motion`
handling built in — nothing new needed there.

The `(site)` segment root also has a `loading.tsx` (Next only uses it where a
more specific one isn't present), so `/about`, `/custom`, `/family` and the
order-lookup pages get a reasonable dark-hero-shaped fallback instead of a
blank screen, even though they don't have bespoke skeletons of their own yet.

**Admin routes:** two shared, reusable skeleton components —
`components/admin/list-loading.tsx` (table-shaped: header + filter bar +
table, used by `products`, `orders`, `customers`, `collections`, `inquiries`,
`team`, `audit`) and `components/admin/form-loading.tsx` (stacked-form
shaped, used by `content` and `settings`) — plus a bespoke grid-shaped one
for `media` (card grid, not a table) and one for the dashboard root
(`app/admin/loading.tsx`, KPI-tile shaped). `app/admin/analytics/loading.tsx`
already existed and was left untouched.

**Known limitation, stated plainly:** every admin route now has a shaped
loading state, but the `(site)` root fallback is a compromise for `about`/
`custom`/`family` rather than a purpose-built skeleton for each. That's a
reasonable next increment, not a defect — those three pages all open with the
same charcoal hero band, so the fallback isn't a wrong shape, just a shared
one.

---

## 6. Design tokens (`app/globals.css`)

Additive only — nothing existing was removed, and every new value is
contrast-checked before being added, not eyeballed:

- **`--color-success` / `--color-warning` / `--color-information`** (+
  `-foreground` pairs). §12 of the brief lists success/warning/information as
  semantic roles; the system had none, so admin badges reusing
  `--color-secondary` for "success" meant a future change to the secondary
  *action* colour would silently recolour every "Paid"/"Published" badge.
  Each new colour stays inside the earth palette (no UI green/amber/blue) and
  measures 5.2:1+ as white-on-fill and 4.5:1+ as text-on-Warm-White.
- **Dark-surface set** (`--color-dark-surface/-foreground/-muted-foreground/
  -border`) — see §1.7. Named, not new: composited from the exact opacity
  values the six page files were already using.
- **`text-button`** utility — buttons previously reused `text-nav` directly,
  so a future nav-only type change would silently reflow every button. Same
  values today, a distinct role so they can diverge later.
- **`measure` / `measure-narrow`** — `ch`-based line-length utilities (68ch /
  52ch) for long-form copy, so prose width is tied to the rendered character
  width of whichever font is active rather than a guessed pixel value. Not
  yet adopted by any page in this pass — available for the About/Family/
  Custom copy work that's still outstanding.

`components/ui/badge.tsx` — `success` variant now points at the new token
instead of reusing `--color-secondary`; added (unused-so-far) `warning` and
`information` variants for future badges. Existing badges using `accent` for
attention states were left alone — that reads correctly today and migrating
it wasn't a defect, just a style preference.

`components/ui/button.tsx` — uses the new `text-button` role; added an
`isLoading` prop (spinner + `aria-busy`, disabled while loading, no layout
shift) for the loading-state work in §5. `asChild` usage (buttons wrapping a
`Link`) is unaffected — `isLoading` only applies to the native `<button>`
rendering path, documented in the prop's JSDoc.

---

## 7. What was reviewed and deliberately left unchanged

- **`components/ui/table.tsx`, `components/admin/list-controls.tsx`
  (`StatTile`, `FilterBar`)** — read in full against §19–20 of the brief
  (admin/analytics polish). Both are already sound: semantic `<table>`
  markup with mandatory captions, `tabular-nums`, hover states, and — in
  `StatTile` — an explicit comment about colour never being the sole signal
  for a trend direction (WCAG 1.4.1). Changing these without a real defect
  would be churn, which the brief explicitly asks against ("do not replace
  working systems merely because you prefer another implementation").
- **`app/(site)/about/page.tsx` content/structure** — read in full. Already
  disciplined about not fabricating content (documented in its own header
  comment: every paragraph traces to a real `ContentBlock`, no invented
  founding narrative). Only the dark-token swap from §1.7 touched this file.
- Business logic, Prisma schema, Paynow integration, auth/RBAC, inventory,
  analytics calculations, S3/media architecture — not touched.

---

## 8. Verification

Run in this environment (network allowlist blocks `binaries.prisma.sh`, so
`npm run db:generate` / a full `next build` cannot complete here — this is an
environment limitation, not a Phase 9 result; see note below):

```
npx tsc --noEmit     → same pre-existing errors only (all trace to
                        unresolved @/lib/generated/prisma/* types, which
                        cascade into implicit-any errors in files this pass
                        never touched, e.g. lib/analytics/*, lib/rbac.ts).
                        Confirmed by diffing against the pre-Phase-9 baseline
                        commit: identical error in app/(site)/shop/page.tsx
                        and app/(site)/collections/page.tsx predates every
                        edit in this pass.
npm run lint          → clean, zero errors/warnings.
npm run test          → 394 passed, 0 failed. 2 suites fail to *load* — same
                        cause, @/lib/generated/prisma/enums unresolved — not
                        a test failure.
```

**Before this ships anywhere real:** run `npm run db:generate` in an
environment that can reach `binaries.prisma.sh`, then re-run `npx tsc
--noEmit` and `npm run build` — the two `tests/` load failures and the
implicit-any cascade should disappear once the generated client exists, but
that needs confirming somewhere the Prisma engine can actually download.

---

## 9. Manual QA checklist

- [ ] `/products/[a published slug]` — click through every thumbnail, open
      fullscreen (image icon, bottom-right of the main frame on hover),
      arrow-key between photos, close with Escape, confirm focus returns to
      the button that opened it. Try on a touch device: swipe left/right on
      the main image.
- [ ] `/shop` — apply a filter that returns >24 pieces, confirm Next/Previous
      preserve the filter in the URL and the "page X of Y" count is correct.
- [ ] Throttle to Slow 3G in devtools and navigate to `/shop`, a product page,
      `/collections/[slug]`, `/cart`, `/checkout`, and a couple of admin
      listing pages — confirm a shaped skeleton appears instead of a blank
      or stale screen.
- [ ] Tab through a product page's gallery and the fullscreen lightbox
      keyboard-only; confirm the focus trap holds inside the lightbox and
      Shift+Tab wraps correctly.
- [ ] Drop a real `.png` file at, e.g., `public/images/studio/interior.png`
      and confirm any future `<EditorialImage slot="studio-interior" .../>`
      usage picks it up without a code change (no consuming usage exists yet
      — this checks the registry mechanism itself).

---

## 10. Not done in this pass (honest list, not a promise)

- Bespoke `loading.tsx` for `/about`, `/custom`, `/family`, order-lookup
  pages (currently share the `(site)` root fallback).
- No new sections/imagery wired into any public page using the editorial
  registry — see §3's reasoning.
- The `measure`/`measure-narrow` typography utilities exist but aren't yet
  applied anywhere.
- Full page-by-page editorial pass (§25/§26 of the original brief) —
  collections pages in particular are explicitly blocked behind real
  collection photography per the discovery audit's §0.3.
- `npm run build` was not run per instruction, and could not have completed
  in this environment regardless (Prisma engine download blocked).
