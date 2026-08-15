# PHASE 4 IMPLEMENTATION REPORT

Admin CMS & business operations for Nnino Ceramics.

**64 files: 54 created, 10 modified. Nothing deleted. Zero new dependencies.**

---

## 1. Verification results

Run in the build sandbox against the uploaded repository.

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | **PASS** — clean |
| Lint | `npm run lint` | **PASS** — 0 errors, 0 warnings |
| Tests | `npm run test` | **PASS** — 140 passed, 8 files |
| Schema conformance | custom checker (see §1.2) | **PASS** — 161 files scanned |
| Build | `npm run build` | **NOT VERIFIED** — see §1.1 |
| DB verify | `npm run db:verify` | **NOT VERIFIED** — see §1.1 |

Test count went from 38 to 140. The 102 new tests are in `tests/rbac.test.ts`,
`tests/admin-validation.test.ts`, `tests/admin-catalogue.test.ts` and
`tests/admin-media-registries.test.ts`.

### 1.1 The two gates I could not clear, and why

**`npm run build` — environmental failure, not a code failure.**

Turbopack's native binary exits with `Bus error` on the single-CPU build
sandbox. I verified this is not caused by Phase 4 by extracting your original
uploaded zip to a separate directory, symlinking the same `node_modules`, and
running `next build` against completely untouched Phase 1–3 code. It fails
identically. The crash is in the bundler binary, before it reaches application
code.

`tsc --noEmit` passing is meaningful here — `next.config.ts` sets
`typescript: { ignoreBuildErrors: false }`, so type errors would fail the build,
and there are none. But bundling, route collection and page-level static
analysis are genuinely unverified. **Run `npm run build` locally before
deploying.**

**`npm run db:verify` — no database available.**

The sandbox has no Postgres instance, and `prisma generate` could not run
because `binaries.prisma.sh` is outside the allowed network egress. See §1.2 for
what I did instead and what that leaves unverified.

### 1.2 What I did instead of `prisma generate`

Without the generated client, `tsc` fails at the first
`@/lib/generated/prisma/*` import and typechecks nothing at all. So I wrote a
generator that parses `prisma/schema.prisma` into type-only stubs, emitted into
`lib/generated/` — which `.gitignore` already excludes, so none of it is in this
zip.

Enum members and model field names in those stubs are derived exactly from your
schema, so they are trustworthy. **Prisma's `select`/`include` result inference
is not reproducible** in a stub, so those return types are loose.

That gap is real, and it is why I also wrote a schema-conformance checker: it
walks every `db.<model>.<method>({…})` call in `app/`, `lib/` and `components/`,
extracts each key from the object literal, and verifies it against the actual
field and relation names in `schema.prisma`.

**It found a genuine bug that `tsc` could not** — see §7.

---

## 2. Discovery findings (Phase 4A)

### Reused unchanged

| Component | Verdict |
|---|---|
| `lib/session.ts` — `requirePermission`, re-reads the User row per request | Reused. This is the authorisation boundary |
| `lib/rbac.ts` — 6 roles, 26 permissions | Extended by exactly one permission |
| `lib/audit.ts` — closed action union, never throws into caller | Reused; union extended |
| `lib/media/*` — driver interface, local + S3, derived storage keys | Reused. Upload path added on top |
| `lib/catalogue.ts` — `PUBLIC_PRODUCT_WHERE` / `PUBLIC_COLLECTION_WHERE` | Reused. Draft leakage already prevented in one place |
| `lib/commerce/purchasability.ts` | Reused — the admin now renders the same verdict a customer gets |
| `lib/commerce/money.ts`, `fulfilment.ts` | Reused |
| UI primitives (`table`, `badge`, `empty-state`, `button`…) | Reused |

**No new CMS, auth system, RBAC system, database layer, payment architecture or
media architecture was introduced. No model was created — every capability
mapped to an existing one.**

### What was incomplete

`/admin/products`, `/admin/collections` and `/admin/team` were read-only lists
with a publish toggle. `/admin/orders` was the only genuinely built section.
Eight navigation entries were marked `built: false`.

---

## 3. Database changes

One migration: `prisma/migrations/20260813090000_phase4_admin/migration.sql`.
**Strictly additive.** No column dropped, renamed or retyped; no data deleted;
every new column nullable. Safe to apply to a populated production database
while serving traffic.

### Columns

| Table | Column | Purpose |
|---|---|---|
| `Product` | `seoTitle`, `seoDescription`, `ogImageId` | SEO overrides. Null = fall back to name/description, which is Phase 2 behaviour |
| `Collection` | `seoTitle`, `seoDescription`, `ogImageId` | Same |
| `Artist` | `sourceNote` | Where a disputed fact is recorded rather than resolved — this is where the Marion Moyo conflict lives |
| `Media` | `originalFilename` | Library searchability. **Never used to build a path** — `buildStorageKey()` still derives keys from a random uuid |
| `Setting` | `updatedBy` | Attribution. Deliberately not a foreign key: a setting must outlive the account that set it |

### Constraints and indexes

`ProductImage_productId_mediaId_key` (unique) — this is what makes a
double-clicked "associate existing media" harmless. The migration de-duplicates
first, keeping the lowest `ctid` of each group. Expected to be a no-op, since
nothing in Phases 1–3 could create a duplicate.

Nine indexes supporting the new server-side list queries:
`ProductImage(productId, position)`, `Product(updatedAt)`, `Product(artistId)`,
`Collection(sortOrder)`, `Artist(sortOrder)`, `Media(createdAt)`,
`Customer(createdAt)`, `AuditLog(action)`, `CustomOrderInquiry(createdAt)`.

**Every admin list is filtered, sorted and paginated in Postgres**, so each of
these runs on every page load.

---

## 4. Permissions added

**One:** `customer:write` — granted to `OWNER`, `MANAGER`, `ORDER_MANAGER`.

Everything else Phase 4 needed was already expressible. Sections that only read
(audit log, customer directory) reuse the existing read permission rather than
inventing a paired one nobody would revoke separately.

`audit:read` remains **OWNER-only**. That is a Phase 1 decision I kept:
reading the audit log and managing users are the two capabilities that would let
an account quietly escalate or verify its tracks were covered, so `MANAGER` —
who runs the business day to day — has neither. There is a test asserting this.

---

## 5. Audit actions added

17 added to the closed union in `lib/audit.ts`:

```
product.created            collection.created         customer.updated
product.updated            collection.updated         team.created
product.images_updated     collection.published       team.updated
                           collection.unpublished     content.updated
                           collection.products_updated
media.uploaded             inquiry.status_change      order.note_updated
media.updated              inquiry.updated
```

Deliberately **not** audited: reads, filter changes, and draft-to-draft edits of
unpublished records. Auditing those buries the entries that matter.

Price changes get their own `product.price_change` entry in addition to the
general update, recording before/after and whether the piece was published —
because that field decides whether money can change hands.

---

## 6. Routes added

| Route | Permission | Notes |
|---|---|---|
| `/admin` *(rewritten)* | `dashboard:read` | Panels gated per-permission; ungated panels don't run their queries |
| `/admin/products` *(rewritten)* | `product:read` | Search, 5 filters, pagination |
| `/admin/products/new`, `/[id]` | `product:write` / `product:read` | Details, gallery, SEO, lifecycle, history |
| `/admin/collections` *(rewritten)* | `collection:read` | |
| `/admin/collections/new`, `/[id]` | `collection:write` / `collection:read` | Includes membership management |
| `/admin/media` | `media:read` | Upload, alt text, usage, delete |
| `/admin/customers`, `/[id]` | `customer:read` | |
| `/admin/team` *(rewritten)*, `/new`, `/[id]` | `artist:read` / `artist:write` | |
| `/admin/content` | `content:write` | |
| `/admin/settings` | `settings:write` | |
| `/admin/inquiries`, `/[id]` | `custom_order:read` | |
| `/admin/audit` | `audit:read` | OWNER only |
| `/admin/orders` *(modified)* | `order:read` | **Pagination added** — see §7 |

Every page calls `requirePermission()` independently. Navigation filtering is
presentation, not protection — a typed URL never passes through
`ADMIN_SECTIONS`.

---

## 7. Bugs found and fixed in existing code

**1. Invalid Prisma relation alias (introduced by me, caught by the checker).**

I had written `publishedProducts: { where: … }` in the collections query. Prisma
has no relation aliasing — this would have thrown at runtime on a page that
typechecked cleanly. Fixed to use the real `products` relation with a filter,
with `_count` supplying the total. This is precisely the class of error the type
stubs could not catch, and the reason the conformance checker exists.

**2. Wrong audit action on a live code path (pre-existing).**

`app/admin/publish-actions.ts` → `toggleCollectionPublished` recorded
`"product.publish"` against a `Collection` entity. The audit log was describing
something that did not happen. Now records
`collection.published` / `collection.unpublished`.

**3. Unreachable orders (pre-existing).**

`/admin/orders` capped at 100 rows and explained so in a footnote. Beyond 100
orders, the rest were simply unreachable through the UI. Now paginated in
Postgres.

**4. Upload type was attacker-controlled (pre-existing, security).**

`assertUploadAllowed` validated `File.type` — a client-supplied string. The local
media driver writes into `public/`, which Next serves statically, so a file
declaring `image/png` that is actually HTML or SVG-with-script was a **stored XSS
primitive on your own origin**.

Added `lib/media/inspect.ts`: magic-byte identification with no native
dependency (no `sharp`, no build complications), which also extracts real pixel
dimensions for `Media.width/height`. The declared type is now used only as a
cheap early rejection; what gets stored is what the bytes prove they are.

Tested against SVG-with-script, HTML, PDF, GIF, PE executable, ELF binary,
truncated input, and a JPEG with a hostile zero-length segment (which would loop
forever in a naive parser). All refused or handled.

---

## 8. Tests added (102 new)

| File | Covers |
|---|---|
| `tests/rbac.test.ts` | Full permission matrix per role; OWNER-only audit and user management; nav gating; no role escapes the declared permission set |
| `tests/admin-validation.test.ts` | Every admin form schema. Heavily weighted toward **blank stays blank**: an empty price must be `null` not `0`, an unwritten biography `null` not `""` |
| `tests/admin-catalogue.test.ts` | Completeness rules (blocking vs advisory), slug generation and collision handling, and **hostile URL parameters** — `?page=999999999`, `?page=-3`, 500-char search terms, enum injection |
| `tests/admin-media-registries.test.ts` | Magic-byte sniffing against malicious payloads; upload constraints; storage-key derivation; settings registry contains no credential-shaped key; content registry covers every key the public pages read |

Notable assertions encoding decisions rather than behaviour:

- `customerSchema` has **no** `email` key, so a crafted POST cannot change one
- The settings registry is scanned for `secret|password|token|api_key|credential`
- Content registry must cover all 9 keys the `app/(site)` pages actually read
- Every setting must accept a blank value — "not decided yet" is a real state

---

## 9. Business rules honoured

**No business information was invented.** Where source material is silent, the
field is null, the placeholder says "Not set" or "Not yet written", and the admin
shows it as outstanding rather than filling it.

- **Prices** — blank is `null`, never `0`. An unpriced piece stays
  non-purchasable via the existing `evaluatePurchasability`, which the edit page
  now renders directly so the admin cannot disagree with the storefront
- **Biographies** — all ten imported team members have `bio: null`. The form
  placeholder reads "Not yet written" and offers no template
- **Marion Moyo** — the conflict is *recorded, not resolved*. `Artist.sourceNote`
  holds both readings; the team list shows a banner; the record page explains it
  and asks for studio confirmation. The role field is free text precisely so this
  is possible
- **Delivery policy and business hours** — seeded blank, placeholder "Not set"
- **Dashboard** — every figure is a real aggregate. No sample data, no trend
  invented from one data point. Zero orders shows zero
- **Revenue** — counts `PAID` and `PARTIALLY_REFUNDED` only. An abandoned
  checkout is not revenue

---

## 10. Security review (§21)

| Control | Implementation |
|---|---|
| Authentication | Every route via `requirePermission()`; session re-reads the User row per request, so a deactivated account loses access immediately |
| Authorisation | Per-action, not per-layout. A server action is a public POST endpoint — each proves the caller's rights independently |
| CSRF | Next server actions carry a built-in origin check. This is why uploads use an action rather than a hand-rolled `/api` route |
| Input validation | Zod, server-side, in `lib/admin/schemas.ts`. Client `required`/`maxlength` are courtesies and never relied on |
| URL parameters | Page numbers clamped, search terms capped, enum filters checked against known sets before reaching a `where` |
| File upload | Magic-byte identification; declared MIME type not trusted; 12 MB cap enforced server-side; storage keys from random uuid, never from the filename |
| Secret exposure | Settings page renders **only** registry-defined keys — an allow-list, not a blacklist. No definition is a credential. Credentials panel reports configured/not-configured booleans only |
| Payment data | Not readable or editable anywhere in the customer section |
| Media deletion | Refused while referenced. Prevents silently stripping a photograph off a live product page |
| Audit metadata | Ids, booleans, before/after money values. Settings audit records **keys, not values** |

---

## 11. Accessibility (§14)

`components/admin/field.tsx` wires `htmlFor`, `aria-describedby` (help + error),
`aria-invalid` and `role="alert"` once, so ~60 inputs get it consistently rather
than 60 chances to get it wrong.

Gallery reordering uses up/down buttons with screen-reader labels rather than
drag-and-drop — WCAG 2.1.1 requires a keyboard path, drag needs one anyway, and a
piece has three or four photographs.

Filtering is a GET form and pagination is links, so the admin works without
JavaScript, the back button behaves, and a filtered view is a shareable URL.

---

## 12. Remaining blockers

1. **`npm run build` must be run locally.** Sandbox limitation, confirmed
   reproducible on untouched Phase 1–3 code.
2. **`npm run db:generate` then `db:migrate` then `db:verify` must be run
   locally.** Prisma's `select`/`include` inference is unverified — the schema
   conformance checker covers field and relation names, not result-type shapes.
3. **Phase 1 constraints still missing from your database.** You applied the
   Phase 1 migration without pasting `prisma/sql/0002_constraints.sql`, so the
   CHECK constraints and partial unique indexes are still absent. Unrelated to
   Phase 4, but it means the database permits states the application assumes
   cannot occur.
4. **`MEDIA_DRIVER=local` writes into `public/`**, which does not survive a
   Vercel redeploy. The media page says so in the UI. Set `MEDIA_DRIVER=s3`
   before launch — no code change required.

---

## 13. Needs your decision

**1. Mixed-currency revenue.** Every `Order` carries its own currency, but the
dashboard sums paid orders into one figure. It detects and warns when more than
one currency is present, but if Nnino sells in ZWL alongside USD, that total
needs to become per-currency before it means anything. Currently latent.

**2. Enquiry lifecycle — I did not use the one in the brief.** §11 suggested
`NEW → REVIEWING → QUOTED → ACCEPTED → IN_PRODUCTION → COMPLETED → DECLINED`, and
said not to force it if the schema had something better. It does: the existing
`CustomOrderStatus` models the same journey plus `PAYMENT` (quote accepted, money
not taken) and `DELIVERED` (distinct from `COMPLETED`). A parallel enum would
mean a migration, a mapping and two vocabularies for one process. **Confirm this
is acceptable.**

**3. Customer email is not editable.** It keys orders and the access tokens in
confirmation emails; editing it would break links customers already hold. There
is no `email` field in the schema, so this is enforced, not merely hidden. Say if
the studio genuinely needs it.

**4. Content blocks have no rich-text editor.** A textarea is honest about what
is stored, and a WYSIWYG producing HTML would need output sanitising — a whole
security surface bought for italics. Say if the studio needs formatting.

---

## 14. Acceptance criteria (§23)

| Criterion | Status |
|---|---|
| Manage products | Done |
| Manage product prices | Done — with price-change audit |
| Manage product images | Done — attach, reorder, primary, alt text, remove |
| Manage collections | Done — including membership |
| Publish/unpublish catalogue | Done — separate audited action |
| Manage media | Done |
| Manage orders | Done — Phase 3 extended with pagination |
| Manage customers | Done |
| Manage team members | Done — including the recorded role conflict |
| Manage editable content | Done |
| Manage business settings | Done |
| Manage custom enquiries | Done |
| View audit history | Done — OWNER only |
| All through existing RBAC | Done — one permission added |
| Public site unchanged | **Believed intact, not proven** — no public route or public query was modified, but this needs your local `npm run build` and a click-through |
