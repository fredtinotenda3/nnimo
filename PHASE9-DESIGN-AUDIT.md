# PHASE 9 — DESIGN AUDIT (DISCOVERY ONLY)

**Status: discovery. No Phase 9 code has been written.**
No component, token, page or image asset has been changed for Phase 9. The only
code in the accompanying ZIP belongs to Task 1 (production checkout safety).

This document is the deliverable for Task 2. It reports what the repository's
design system actually is today, what genuinely needs work, and — most
importantly — three findings that need a decision from you before any Phase 9
implementation should start.

---

## 0. Read this section first

Three things materially change the shape of Phase 9 as briefed.

### 0.1 The brief assumes a design system that does not need building. It already exists.

The Phase 9 brief reads as though it is addressing a functional-but-undesigned
application: it asks for design tokens to be created (§12), a typography scale
to be created (§13), a global design system to be created (§14), and benchmarks
to be studied before "creating something more distinctive".

That is not the state of this repository. `app/globals.css` already contains a
two-layer colour system (verbatim brand hexes, plus contrast-corrected semantic
tokens) with **measured** WCAG ratios recorded in the file header, eleven named
typography role utilities, a documented radius scale, a vertical rhythm scale,
and a signature visual device (the gallery wall label). `components/ui/`
contains the primitives. Accessibility work that is usually missing entirely —
a skip link, a focus trap in the mobile drawer, a global `:focus-visible`
outline, `prefers-reduced-motion` honoured at the base layer — is present and
correct.

**Implication:** Phase 9 is not a design-system build. Treating it as one would
mean rewriting a working, documented, accessible system in order to arrive
somewhere similar, which is the single most expensive way to spend this phase
and carries the highest regression risk against a live checkout. The real
opportunity is narrower and more valuable: fix the specific defects listed in
§4, resolve the photography problem, and raise the two or three pages that are
genuinely below the standard of the rest.

I would rather tell you this now than deliver a rebuild you did not need.

### 0.2 I cannot source external imagery in this environment.

Part B of the brief (§§1–8, 38–40) is built on sourcing high-quality imagery
from Pexels, Unsplash and similar. This execution environment's network policy
permits only package registries and GitHub — `pexels.com`, `unsplash.com` and
`pixabay.com` are all unreachable. I cannot download, inspect, quality-check,
crop or optimise a single external photograph here.

So the image-sourcing workstream is not executable by me as briefed, no matter
how the phase is scheduled. What I *can* build is everything around it: the
image architecture, the manifest/registry structure, the licensing and
provenance record, the responsive art-direction plumbing, and the replacement
path — all designed so that dropping real files into `public/images/` later is
a data change rather than a redesign. Someone with a browser then does the
sourcing.

Please tell me which you want (see §7).

### 0.3 The external-imagery mandate contradicts a standing project rule.

This is a business decision, not an engineering one, so I am surfacing it rather
than resolving it.

A rule has been in force since Phase 2 and is written into the code. The header
of `lib/brand-assets.ts` states, as a guarantee about this application:

> There are no stock images, no placeholders and no generated imagery anywhere
> in this application.

The same file refuses to caption the team photograph with individual names
because the photograph is unlabelled and identifying people would be guesswork,
and refuses to attach the giraffe tureen photographs to the catalogue SKU they
probably depict because "probably" is an inference. That is the standard the
codebase currently holds itself to.

The Phase 9 brief asks for contextual photography of *other people's ceramics*
to be placed throughout a site that sells Nnino's ceramics. §6 of the brief is
alert to this and forbids misrepresenting temporary imagery as Nnino product
photography — but the tension does not fully dissolve, because:

- **Product and collection contexts are the hard case.** A hero image of an
  unrelated potter's vessel on a page selling a Nnino piece communicates "this
  is the quality of what you are buying" whether or not a caption says
  otherwise. §6 forbids the claim; the composition still makes it.
- **Licensing permits use but not every use.** Pexels and Unsplash licences
  allow free commercial use, but both prohibit implying endorsement by
  depicted people, and neither licence is a defence against a
  misleading-advertising complaint about photographs used to sell goods they
  do not depict. Craft and lifestyle contexts (hands in clay, a studio, a table
  setting) are materially lower risk than product-adjacent ones.
- **It is reversible in one direction only.** Once the site is populated with
  images customers may reasonably read as Nnino's work, replacing them later is
  easy; unpicking a customer's impression is not.

**My recommendation, for your decision:** adopt external imagery for *editorial
and atmospheric* contexts only — craft process, studio, materials, lifestyle,
custom/bespoke, story — and keep every product-level and collection-level image
slot on real Nnino photography or the existing honest fallback. That satisfies
the brief's actual goal ("the site must not look like we don't have photos yet")
in every place a visitor forms an impression of the brand, without the site ever
implying that a photograph of someone else's pot is a Nnino pot.

§7 lists this as an explicit decision point. I have not assumed the answer.

---

## 1. Audit method

Static review of the repository at the state supplied in `nnimo-main.zip`:
`app/globals.css`, `app/layout.tsx`, the `(site)` and `admin` route groups,
`components/ui`, `components/catalogue`, `components/commerce`,
`components/layout`, `components/admin`, `lib/brand-assets.ts`, `lib/media`,
`next.config.ts`, and `public/brand`.

Contrast ratios below are **computed**, not estimated — WCAG 2.2 relative
luminance, with alpha composited against the actual background token. Anything I
could not measure or execute is labelled as such. No browser, no device lab and
no running application were available, so nothing here is a rendered-output
observation.

---

## 2. What the design system is today

### 2.1 Colour

Two deliberately separated layers in `app/globals.css`:

| Layer | Purpose |
|---|---|
| Brand tokens | `--color-terracotta` `#b85c3a`, `--color-ochre` `#d4a96a`, `--color-clay` `#7a8b6f`, `--color-stone` `#8a7e72`, `--color-warm-white` `#faf7f2`, `--color-charcoal` `#2c2c2c`. Verbatim, never altered. |
| Semantic tokens | What components consume: `background`, `surface`, `surface-sunken`, `foreground`, `muted-foreground`, `border`, `border-strong`, `ring`, `primary(-hover/-foreground)`, `secondary(-hover/-foreground)`, `accent(-foreground)`, `destructive(-foreground)`. |

The separation exists because several brand hexes fail AA when carrying small
text, so the semantic layer holds contrast-corrected variants of the same hue.
That reasoning is documented in the file with the measured ratios. I re-measured
and confirm the headline claims:

- `muted-foreground` `#6B6157` on background — **5.66:1** (passes AA body)
- `muted-foreground` on `surface-sunken` — **5.15:1** (passes)
- white on `primary` — **4.54:1** (passes, narrowly)

This is better colour discipline than most commercial front ends. It does not
need replacing.

**Against the brief's §12 shopping list**, the gaps are: no `success`,
`warning` or `information` semantic tokens (only `destructive` exists), and no
dark-surface token set even though two sections render on charcoal and improvise
with `text-warm-white/75`-style opacity utilities.

### 2.2 Typography

Self-hosted at build time via `next/font` — Playfair Display (display),
Inter (body), Cormorant Garamond (editorial/price). Weights are enumerated
rather than loaded as full variable ranges, which is a deliberate mobile-payload
decision.

Eleven role utilities, all fluid where it matters: `text-display`,
`text-heading-1/2/3`, `text-body-lg/body/body-sm`, `text-label`, `text-nav`,
`text-price`, `text-metadata`, `text-quote`.

Two decisions worth keeping and building on, because they are the kind of thing
that separates a considered system from a template:

- Display and headings sit at weight 400, not bold — "editorial restraint reads
  as a gallery, bold reads as a shop banner".
- `text-heading-3` deliberately switches to the body face, because Playfair
  loses legibility below ~1.25rem and small serif headings are where templates
  look cheap.

**Gap against §13:** there is no `text-button` role (buttons reuse `text-nav`),
and no explicit measure/`max-ch` guidance — line length is controlled ad hoc per
page with `max-w-*`, so long-form pages will drift.

### 2.3 Signature device

`@utility gallery-label` — a hairline terracotta rule, the piece name, then its
physical facts in small caps. Reasoned from the product: every Nnino piece is
signed underneath and each is a one-off, so the catalogue is closer to a gallery
hang than a product grid.

This is the strongest existing asset in the system and the right thing to
extend across collections, custom and editorial contexts in Phase 9. It is
already distinctive and it is not borrowed from any of the benchmark brands in
§9 of the brief.

### 2.4 Layout, primitives and states

- `Container` — `max-w-7xl` with responsive gutters. One implementation.
- `Section` — vertical rhythm plus an optional `sunken` tone for alternation.
- `Button` — six variants (`primary`, `secondary`, `outline`, `ghost`, `link`,
  `destructive`) and four sizes, on a 2px radius. Already close to the brief's
  §27 list and already not pill-shaped.
- Empty states exist and are used on the shop, cart, homepage and family pages.
  The copy is unusually good — the shop's empty state explains that importing a
  catalogue is not the same as offering something for sale.

### 2.5 Accessibility baseline

Genuinely strong, and better than the brief assumes:

- Skip link to `#main`.
- Global `:focus-visible` outline using the brand ring token, never removed.
- Mobile drawer: body scroll lock, focus moved into the drawer, full Tab/Shift-Tab
  focus trap, Escape to close, focus returned to the toggle on close.
- `prefers-reduced-motion` honoured in the base layer, including disabling
  `scroll-behavior: smooth`.
- `Field` (admin) wires `htmlFor`, `aria-describedby`, `aria-invalid` and
  `role="alert"` once, centrally, rather than on ~60 inputs individually.

---

## 3. Imagery — the actual Phase 9 problem

### 3.1 What real photography exists

Ten files in `public/brand/`: the wordmark, tagline mark and motif (brand
artwork), plus six photographs — one hero tureen, four further tureen views, an
antelope vase, and one team photograph.

That is **one photographed piece, one further vessel, and one group shot** for a
site with a shop, collections, product detail pages, about, family, custom and
contact. It is nowhere near enough, and this is the correct core diagnosis in
the brief.

### 3.2 What the code does about it today

`components/catalogue/media-image.tsx` renders an unphotographed piece as a
catalogue card: warm panel, piece name in the display face, collection beneath,
and the line **"Photograph to follow"**.

This is honest and it degrades gracefully. It is also the exact thing §40 of the
brief objects to — it makes the site look like "we don't have photos yet",
because that is precisely what it says.

Note the direct conflict: the fallback is currently the mechanism that keeps the
"no stock imagery" guarantee true. Changing it is the same decision as §0.3, not
a separate one.

### 3.3 Two architectural facts that make replacement cheap

Worth stating because they de-risk whatever you decide:

- **Product and collection photography already goes through the `Media` table
  and a driver abstraction** (`lib/media/`), so it is uploaded, reordered and
  alt-texted by the team with no deploy. Real Nnino photography arriving later
  needs no code change at all.
- **Brand/editorial assets are separate**, in `public/` and referenced by
  `lib/brand-assets.ts` — a single typed module with `src`, `width`, `height`,
  `alt` and `source` per asset. This is already the "centralised image
  configuration" the brief asks for in §7; it does not need inventing, only
  extending.

`next.config.ts` already serves AVIF/WebP with a tuned `deviceSizes` ladder and
constrains `remotePatterns` to the configured media host.

---

## 4. Defects found — evidence-backed

These are concrete, independent of any design direction, and worth fixing
regardless of what you decide about imagery.

### 4.1 Contrast failure: "Photograph to follow" — **2.85:1, fails WCAG AA**

`components/catalogue/media-image.tsx` renders it as
`text-metadata text-muted-foreground/70`. Composited, that is `#948B81` on
`#F2ECE4` = **2.85:1**, against a 4.5:1 requirement — and it is set at
0.6875rem, the smallest tier in the system, which makes it worse in practice
than the number suggests. Dropping the `/70` opacity restores **5.15:1**.

This is currently on every unphotographed product card, which is most of the
catalogue.

### 4.2 Input borders below the non-text contrast threshold — **1.63:1**

`--color-border-strong` `#D4C9BA` on `--color-surface` `#FFFFFF` is **1.63:1**.
WCAG 2.2 §1.4.11 asks for 3:1 on visual boundaries needed to identify a control.
Every admin and public form input is bordered with this token on white and has
no other affordance identifying its bounds.

Not a certain failure — 1.4.11's scope for input borders is argued both ways,
and the focus state is strong — but it is the kind of thing an accessibility
audit flags, and it is a token change rather than a redesign.

### 4.3 Product detail thumbnails are decorative, not interactive

`app/(site)/products/[slug]/page.tsx` renders additional views as `<li>`
elements containing a plain `<Image>`. They are not buttons, not links, and
carry no handler — **clicking a thumbnail does nothing, and the main image never
changes.** For the one product that actually has five photographs, four of them
are unreachable at any useful size.

This is the single biggest gap between the brief's §18 ambition ("the image
should dominate the experience") and current behaviour, and it is a real
functional defect rather than a matter of taste.

### 4.4 Hero has no responsive art direction

The homepage hero (`app/(site)/page.tsx`) serves the same 810×1080 asset to
every viewport, cropped by `object-cover` — an aspect-ratio switch, not an art
direction. The brief explicitly asks for this in §16, and the layout comment
shows the constraint was understood (the split hero exists because the supplied
photograph is too small to stretch full-bleed).

### 4.5 Stale copy referencing a completed phase

`app/(site)/shop/page.tsx` tells visitors: "pagination arrives with the cart in
Phase 3." Phase 3 shipped. The shop is also hard-capped at 60 pieces with no
pagination, so this is both stale and a real limit.

### 4.6 Loading states are almost entirely absent

One `loading.tsx` in the entire application (`app/admin/analytics/`). The public
shop, collections, product detail, cart and checkout have none, so every
navigation on a slow connection — the mobile-first Zimbabwe traffic this is
built for — shows nothing until the server component resolves. §34 of the brief
asks for polished loading states; this is the gap behind it.

### 4.7 Dark sections improvise instead of using tokens

The charcoal hero and closing sections use `text-warm-white/75`,
`border-warm-white/40`, `hover:bg-warm-white/10`. All three measure acceptably
(**8.02:1** body text, **3.40:1** border) so nothing is broken — but they are
opacity guesses rather than tokens, and every new dark section re-guesses them.
A small dark-surface token set would make this systematic.

---

## 5. Page-by-page assessment

| Page | State | Priority |
|---|---|---|
| Homepage | Strongest page. Ten considered sections, real hero, motif used once at low opacity. Needs art direction (§4.4), not restructuring. | Medium |
| Shop | Sound grid and filters, excellent empty states. Needs pagination, stale copy fix, loading state. | Medium |
| Product detail | **Weakest high-value page.** Gallery is non-functional (§4.3). Layout and metadata hierarchy are otherwise good. | **High** |
| Collections | Hero imagery supported, but visual identity per collection depends entirely on photography that does not exist. Blocked behind the §0.3 decision. | High (blocked) |
| About / Family / Custom | Structurally complete, visually thin — these are the pages most improved by editorial imagery, and the lowest-risk place to use it. | High |
| Cart | Simple and clear. Little to do. | Low |
| Checkout | **Changed by Task 1.** Now states the manual-settlement position truthfully. Deliberately plain. | Low |
| Order confirmation | **Changed by Task 1.** Carries the required manual-settlement message. | Low |
| Admin | Consistent, uses the same tokens, `Field` handles accessibility centrally. Needs table/density ergonomics, not luxury styling (§33). | Medium |

---

## 6. What I would propose for Phase 9

Sequenced by value, assuming §0.3 is decided in favour of editorial-only
external imagery. Not started, not committed.

1. **Defect fixes** (§4.1, §4.2, §4.5) — contrast, borders, stale copy. Small,
   independent, no design risk.
2. **Product detail gallery** (§4.3) — make thumbnails interactive, add a larger
   view. The highest-value single change in the phase.
3. **Token extensions** — `success`/`warning`/`information`, a dark-surface set,
   a `text-button` role and a documented measure. Additive; nothing existing
   changes.
4. **Image architecture** — extend `lib/brand-assets.ts` into a
   provenance-carrying registry (`source`, `sourceUrl`, `creator`, `licence`,
   `temporary: true`, `intendedUse`) with `public/images/<context>/` folders and
   descriptive filenames. Buildable now, populated later.
5. **Loading states** (§4.6) across the public routes.
6. **Editorial imagery population** — craft, studio, lifestyle, custom, story.
   Requires §0.2 resolved (someone must fetch the files).
7. **Responsive art direction** (§4.4) for the hero and collection heroes.
8. **Homepage and About/Family/Custom editorial refinement**, once imagery
   exists to art-direct with.
9. **Admin ergonomics** (§33) — table density, filter layout, empty states.
10. **Pagination** for the shop.

Steps 1–5 are executable here today. Steps 6–8 are gated on §0.2 and §0.3.

---

## 7. Decisions needed before Phase 9 implementation

1. **Scope of external imagery.** My recommendation: editorial and atmospheric
   contexts only; product and collection slots stay on real Nnino photography or
   the honest fallback (§0.3). Alternatives: full adoption as briefed, or none.
2. **Who sources the images.** I cannot reach Pexels/Unsplash from here (§0.2).
   Either you supply the files, or I build the architecture and you populate it.
3. **The "Photograph to follow" fallback.** Keep it (honest, but reads as
   unfinished), soften the wording, or replace it with contextual imagery. This
   follows from decision 1.
4. **Rebuild vs refine.** I recommend refining the existing system (§0.1). If
   you want a from-scratch visual redirection, say so explicitly — it is a
   legitimate choice, but it is a much larger phase against a live checkout and
   I would want to sequence it differently.
5. **Benchmark interpretation.** §9 of the brief lists nine ceramics brands to
   study. The existing gallery-label device is already distinctive and not
   derived from any of them. I would extend it rather than start a new visual
   language.

---

## 8. Limitations of this audit

Stated plainly, so nothing here is read as more than it is:

- **Static analysis only.** No browser, no rendered output, no device testing,
  no Lighthouse run, no screenshots. Every visual judgement is inferred from
  source, and the layout ones would need confirming in a browser.
- **Contrast ratios are computed from tokens**, which is exact for the token
  pairs given, but does not account for a colour I did not think to check or a
  combination that only occurs at runtime.
- **No automated accessibility scan** (axe, pa11y) was run — those need a
  running application.
- **No performance measurement.** No bundle analysis, no Core Web Vitals, no
  image-weight audit. §32 of the brief concerns performance; I can only report
  that the configuration looks correct, not that the result is fast.
- **The catalogue's real content was not inspected** — no database was
  available, so how many products are published, and how many have photography,
  is unknown. That number materially affects §3 and should be checked before
  step 6.
