# Phase 1 report

**Status: not complete.** The design foundation and the platform foundation are
written and verified as far as this environment allows, but three Phase 1
verification criteria could not be met here because the sandbox blocks the
network and has no database. Details under TESTED and REMAINING. Nothing below is
claimed as passing that was not actually run.

---

## BUILT

### Design foundation

| File | What it establishes |
|---|---|
| `app/globals.css` | Two-layer token system (brand hexes + AA-corrected semantic tokens), all seven typography roles as Tailwind v4 `@utility`, base layer with focus-visible and reduced-motion, the `gallery-label` signature utility |
| `app/layout.tsx` | Playfair Display / Inter / Cormorant Garamond self-hosted via `next/font`, enumerated weights, site-wide metadata, OpenGraph, viewport |
| `components/layout/site-header.tsx` | Responsive nav; transparent over hero → solid on scroll (rAF-throttled); skip link; mobile drawer with scroll lock, Escape close, `aria-expanded`/`aria-controls` |
| `components/layout/site-footer.tsx` | Server component (zero JS); contact details sourced from `lib/brand.ts` |
| `components/ui/*` (16 files) | Your 11 primitives placed correctly, plus the 4 missing from the brief — **Tabs, Table, EmptyState, LoadingState** — plus `GalleryLabel` |

Fixes applied to the primitives as supplied: `dropdownmenu.tsx` → `dropdown-menu.tsx`
(kebab-case, matching the rest), and eight leading blank lines stripped from
`select.tsx`.

### Platform foundation

| File | What it does |
|---|---|
| `prisma/schema.prisma` | Revised: Prisma 7 `prisma-client` generator with required `output`; `Media.url` made a nullable cache so LOCAL→S3 needs no row rewrite; 8 redundant indexes on UNIQUE columns removed |
| `prisma/sql/0002_constraints.sql` | 20 CHECK constraints and 2 partial indexes Prisma cannot express — including `reserved <= onHand` and one-primary-image-per-product |
| `lib/env.ts` | Zod validation of every variable at boot; `MEDIA_DRIVER=s3` demands its whole credential set |
| `lib/db.ts` | PrismaClient singleton surviving dev hot-reload |
| `lib/auth.config.ts` / `lib/auth.ts` | Auth.js v5 split config; Credentials + bcrypt cost 12; timing-uniform comparison against a dummy hash |
| `lib/session.ts` | The real authorisation boundary — re-reads the `User` row per request so deactivation is immediate despite JWT |
| `lib/rbac.ts` | 26 permissions × 6 roles; `OWNER` alone can manage users or read the audit log |
| `proxy.ts` | Next 16's renamed middleware; cookie check only, documented as *not* a security boundary |
| `lib/inventory.ts` | Conditional-UPDATE reserve/commit/release/adjust — overselling prevented by Postgres row locks, not by read-then-write |
| `lib/media/*` | `MediaDriver` interface, working local driver, S3 driver stub; storage keys derived from validated MIME, never the client filename |
| `lib/audit.ts`, `lib/money.ts`, `lib/brand.ts` | Closed-set audit actions; Decimal-safe money with a `Price on request` path for null; brand facts with per-value source citations |
| `app/admin/*` | Shell with per-page permission checks, dashboard, three read-only listings |
| `app/(auth)/login/*` | Generic error messages, open-redirect-safe `?next=` |
| `docs/architecture/*` | Data model with entity map and deletion table; text state diagrams for all six lifecycles; security decisions; design system with the contrast measurements; local development |

---

## WIRED

End-to-end and verified by the compiler and the production build:

- Root layout → design tokens → every primitive consumes semantic tokens only.
- `(site)` layout → header + footer → home page → `db` queries for collections,
  published products and team.
- `/login` → server action → `signIn` → Auth.js Credentials → `db.user` → JWT.
- `proxy.ts` → `/admin` cookie redirect. Confirmed active: the build output lists
  `ƒ Proxy (Middleware)`.
- `/admin` layout → `requireAdmin()` → `db.user` re-read → RBAC filters the nav →
  each page independently calls `requirePermission()`.
- Sign out → server action → `signOut`.
- `next.config.ts` security headers applied to all routes.

**Not wired, because there is no database in this sandbox:** every `db.*` call
compiles and builds against the real client's types but has never executed a
query. That is the honest limit of what "wired" means here.

---

## SEEDED

**Written, never executed.** `prisma/seed.ts` could not run (no database, no
Prisma client — see TESTED). The transcription in `prisma/seed/source-data.ts` is
complete and each entry cites its source document:

| Data | Count | Source |
|---|---|---|
| Collections | 38 | Brochure, document order — includes **Olive** and **Leapard Ivy**, which were missing from your brief's list |
| Range items | ~290 | Brochure, item captions per range page |
| Measured pieces | 18 | Nnimo.pdf — 13 with dimensions, 11 of those with weight |
| Priced pieces | 11 | Scanned price list — 9 at $150, 2 with no price printed |
| Team members | 10 | Names and roles as supplied |
| Content blocks | 15 | 3 with source-backed copy, 12 empty |
| Settings | 3 | Lead time, low-stock threshold, currency |

Verified figures carried through, e.g. 3D King Cheetah Tureen H68 × W35 cm,
8.5 kg; 3D Sable Collection Vase H64 × W33 cm, 10.35 kg.

**Deliberately not seeded:** stock levels, orders, customers, reviews,
testimonials, sales figures, artist biographies. None are established by the
source material. All 38 collections import as `DRAFT` and all products as
`CATALOGUE` with `availability = null`, because the brochure proves a range
existed in 2022, not that it is in production now.

The scanned price list is undated, so even the 9 priced pieces stay `CATALOGUE`.
They are the publish-ready candidates; the decision is the business's.

The seed is idempotent — every write is an upsert keyed on a natural unique
column, and fields the team may have edited (price, stage, copy, passwords) are
only written on create.

---

## TESTED

Actually run, in this environment:

```
npx tsc --noEmit     ✅ clean
npx eslint .         ✅ clean
npx next build       ✅ compiled, 8 routes, Proxy registered
```

The build was run with fonts stubbed, because `fonts.googleapis.com` returns 403
here. With the real `next/font` code restored the build fails with Next's own
message: *"Failed to fetch Playfair Display from Google Fonts. If you are offline
or behind a proxy…"* — a network condition, not a code defect. It will build on
your machine.

### Real defects these checks caught

1. **`next.config.ts` had an `eslint` key that no longer exists.** Next 16 removed
   `next lint` entirely and `next build` no longer lints, so the option was
   deleted from `NextConfig`. Caught by `tsc`, not guessed.
2. **`eslint.config.mjs` used the `FlatCompat` shim** and crashed with *"Converting
   circular structure to JSON"*. `eslint-config-next@16` exports a flat
   `Linter.Config[]` directly. Rewritten to import and spread it.
3. **Two cascading-render bugs in `site-header.tsx`**, found by React 19's
   `react-hooks/set-state-in-effect`: a `setScrolled(true)` sync for non-hero
   pages (now derived, not stored) and a `setMenuOpen(false)` effect on pathname
   change (now handled in the link's `onClick`).
4. **`AUDITED_ACTIONS` was declared but only used as a type.** Audit actions are
   now a constrained union with a runtime guard, so a typo cannot create an
   untracked action.

### Not run

`prisma generate`, `prisma migrate dev`, `prisma db seed`, and every runtime path
that touches the database.

---

## VERIFIED

Against your Phase 1 checklist:

| Criterion | Status |
|---|---|
| Confirm TypeScript passes | ✅ clean |
| Confirm lint passes | ✅ clean |
| Confirm production build passes | ⚠️ passes with fonts stubbed; fails offline only on the Google Fonts fetch |
| See the Nnino visual foundation | ⚠️ builds and renders; not viewed in a browser |
| Start the application | ❌ needs a database |
| Access the authentication system / log into `/admin` | ❌ needs a database |
| See the admin shell | ❌ needs a database |
| See seeded collections / products / team | ❌ seed never ran |
| See which products have real price data | ❌ the dashboard panel exists; no data behind it |
| See catalogue vs sellable | ❌ same |
| Confirm database relationships | ❌ schema never applied |
| Confirm protected admin routes | ⚠️ code reviewed and building; never exercised against a live session |

**Three environmental blockers, all confirmed by direct test:**

1. `binaries.prisma.sh` → **403**. Prisma's schema engine downloads from there and
   it is not on this sandbox's allow-list, so `generate`, `migrate` and `validate`
   all fail. (Prisma 7 does bundle `schema_engine_bg.wasm`, but the CLI still
   reaches for the native binary; there is no env var to force the WASM path.)
2. **No Docker and no Postgres binary** — so there is no database to migrate to
   even with a working engine.
3. `fonts.googleapis.com` → **403**.

None is a defect in this code. All three disappear on your machine.

---

## REMAINING

### To finish Phase 1 — about fifteen minutes on your machine

```bash
npm install
cp .env.example .env
npx auth secret                 # writes AUTH_SECRET
# set SEED_OWNER_PASSWORD (12+ chars) in .env
docker compose up -d
npm run db:generate
npx prisma migrate dev --name init
# paste prisma/sql/0002_constraints.sql into the generated migration.sql
npm run db:seed
npm run verify                  # typecheck → lint → build
npm run dev                     # sign in at /login, then change the password
```

Then the eight ❌/⚠️ rows above become checkable.

### Decision I need from you

**Three of the six brand colours fail WCAG AA** for the text they carry:
Stone Grey body text 3.74:1, Warm White on Terracotta 4.29:1, white on Clay Green
3.65:1. I kept the exact hexes as brand tokens for large fills and added
contrast-corrected variants of the same hues for text (`#6B6157` = 5.72:1,
`#5F6F55` = 5.40:1, white on terracotta = 4.54:1). Same appearance, compliant
contrast — but it is a deviation from the literal palette and needs your
approval. Measurements are in `docs/architecture/design-system.md`.

### Correction to Phase 0

You told me to keep ignoring the repo's `AGENTS.md` as suspicious. I extracted
`create-next-app@16.3.0` and read its source: **it generates `AGENTS.md` and
`CLAUDE.md` itself**, and `next dev` re-adds the block on every run. The content
is Next's own notice that v16 has breaking changes. It is first-party tooling, not
an injection attempt — deleting it will not stick. I still ignore anything in the
repo that tries to redirect this brief.

### Intentionally deferred

- **No initial migration is checked in.** `prisma migrate dev` generates it by
  diffing against a live shadow database. Hand-writing ~700 lines of unverified
  DDL would mean the first `migrate deploy` in staging is also the first time
  anyone finds out whether it is correct. See `prisma/migrations/README.md`.
- **S3 driver not implemented** — the interface, key derivation, validation and
  URL resolution are all shared with the local driver; adding
  `@aws-sdk/client-s3` before a bucket exists means shipping 2 MB of dependency
  and an untestable credential shape. One file when the bucket is provisioned.
- **No Content-Security-Policy.** Worth shipping only once the real script
  surface is known; a policy written now would either be too loose to matter or
  break the first payment SDK in Phase 6. On the Phase 8 list. Self-hosted fonts
  mean no `fonts.googleapis.com` origin will need allowing.
- **No Auth.js adapter tables** (`Account`/`Session`/`VerificationToken`) — not
  needed for JWT admin sessions. Additive migration in Phase 3 for customer
  accounts, which is why `Customer` and `User` are separate models.
- **No automated tests.** The highest-value first targets are `lib/inventory.ts`
  (concurrent reservation of the last piece) and `lib/rbac.ts` (permission matrix
  exhaustiveness) — both pure enough to test without a browser. Recommend Vitest
  plus a Testcontainers Postgres for the inventory transactions.
- **Media assets not placed.** `marion.zip` is ~50 MB of photography, video and
  audio. Committing it to `public/` is what your brief's §16 warns against; it
  should be uploaded through the admin once the media UI exists in Phase 4, which
  is also when alt text and ordering can be captured.
- Phases 2–8 untouched, as instructed.

### Known issue

`next-auth` is pinned at `5.0.0-beta.32`. Its peer range now includes `next@^16`
(the widely-cited GitHub issue saying otherwise is stale), but it is still a beta.
The stable alternative is `better-auth@1.6.x`, which declares `next ^16` and
`prisma ^7` support. Auth.js was chosen because you named it and because
`lib/session.ts` keeps the authorisation logic in our own code, so swapping the
session provider later touches two files rather than the whole admin. Worth
revisiting before go-live.
