# APPLY — Phase 7

Analytics, business intelligence and internal operations.

This archive contains **only** the files Phase 7 created or modified: 29 new, 6
modified, 0 deleted. Everything from Phases 1–5 that Phase 7 did not touch is
absent, as are `node_modules`, `.next`, `.git` and the generated Prisma client.

**Nothing in here needs a credential.** No Paynow, no S3, no email provider, no
Redis. Those remain deferred external integrations and Phase 7 does not depend
on any of them.

> This file replaces the Phase 5 `APPLY.md`. If you still need those
> instructions, they are in git history on the Phase 5 commit.

---

## 1. What is in this archive

**New — the analytics layer** (`lib/analytics/`)

Split along one hard line: `range.ts`, `compute.ts`, `params.ts`, `sections.ts`
and `types.ts` are **pure** and import no database, so the calculations are unit
tested directly. `context.ts`, `sales.ts`, `catalogue.ts`, `audience.ts`,
`operations.ts` and `overview.ts` do the querying and hold no derivation logic.
That split is forced by `tests/stubs/db.ts`, which makes anything importing
`@/lib/db` unusable from a unit test — see `docs/architecture/analytics.md` §1.

**New — UI**

`components/admin/analytics-shell.tsx`, `components/admin/analytics-charts.tsx`,
six pages under `app/admin/analytics/` and a segment-level `loading.tsx`. All
server components. No charting dependency was added — the charts are inline SVG
with a visually-hidden data table beside each one.

**New — database, docs, tests**

One migration, `docs/architecture/analytics.md`, four unit suites and one
integration suite.

**Modified — six files, all additive**

| File | Change |
|---|---|
| `lib/admin/dashboard.ts` | Now delegates to `lib/analytics/`. **Exported names and types unchanged** |
| `lib/admin/settings-registry.ts` | New `timezone` kind, new `business.timezone` definition |
| `lib/admin-sections.ts` | Analytics nav entry |
| `components/admin/list-controls.tsx` | Optional `trend` prop on `StatTile`; absent prop = old behaviour |
| `prisma/seed/source-data.ts` | Seeds `business.timezone` = `Africa/Harare` |
| `scripts/verify-database.mjs` | Registers the new index |

`app/admin/page.tsx` is **not** in this archive. The dashboard refactor kept
`getCommerceKpis`, `getCatalogueKpis`, `getOperationsFeed` and
`hasMixedCurrencies` signature-compatible precisely so that page needed no
change.

---

## 2. Applying it

### 2.1 Back up first

```bash
git status                     # commit or stash anything outstanding
git checkout -b phase-7-analytics
pg_dump "$DIRECT_DATABASE_URL" > backup-pre-phase-7.sql
```

### 2.2 Unzip over the repository root

```bash
cd /path/to/nnimo
unzip -o /path/to/nnino-phase-7.zip
```

Paths in the archive are repository-relative, so this lands each file in place.

**No file needs deleting this time.** Unlike Phase 5, which needed a manual
`rm lib/payments/registry.ts`, Phase 7 removes nothing.

### 2.3 Review the diff

```bash
git status
git diff -- lib/admin/dashboard.ts
git diff -- components/admin/list-controls.tsx
```

Those two are the only modifications touching existing behaviour, and both are
meant to be boring. If `git diff` on `dashboard.ts` shows a changed export
signature rather than a changed body, stop — something went wrong.

---

## 3. Verification gate

Run in this order. Steps 1–4 were executed in the build sandbox and passed;
steps 5–6 could not be and are the ones that genuinely need your machine.

```bash
npm run db:generate     # 1
npx tsc --noEmit        # 2  → expect clean
npm run lint            # 3  → expect clean
npm run test            # 4  → expect 307 passing, 19 files
npm run build           # 5  NOT run in the sandbox
npm run db:verify       # 6  NOT run in the sandbox
```

### 3.1 The migration

`npm run db:verify` will **fail on step 6 until the migration is applied**,
because it now checks for the new index by name. Apply it first:

```bash
npm run db:migrate      # development
# or, for an existing/production database:
npm run db:deploy
```

Then:

```bash
npm run db:verify
```

Expect `order_settled_paid_at` in the index list and
`All required database objects are present.`

The migration is idempotent (`CREATE INDEX IF NOT EXISTS`), non-destructive, and
touches no row. On a large `Order` table consider the concurrent form instead, to
avoid taking a write lock:

```sql
-- Run OUTSIDE a transaction if you use this variant.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "order_settled_paid_at"
  ON "Order" ("paidAt")
  WHERE "paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED');
```

With the current order volume the plain form is instant; this is here for later.

### 3.2 Seed the timezone setting

The new setting is seeded, but the seed only creates keys that are missing. On a
database that already has settings, confirm it landed:

```bash
npm run db:seed
```

Then check **Admin → Settings → Business details → Timezone** reads
`Africa/Harare`. If it is blank, `normaliseTimeZone()` falls back to
`Africa/Harare` anyway, so analytics is correct either way — but the field should
show the value so the team knows it is editable.

### 3.3 If step 2 or 3 fails

Almost certainly a stale generated Prisma client. Run `npm run db:generate` and
retry before reading anything into it.

---

## 4. The integration suite — please run this

```bash
# Needs TEST_DATABASE_URL pointing at a migrated, DISPOSABLE database.
npm run test:integration
```

**This is the step that matters most.** The 307 unit tests prove every
calculation, but they cannot execute the four raw SQL statements Phase 7 added,
because the unit config stubs the database. Those four are the parts TypeScript
cannot check at all:

1. `date_trunc(... AT TIME ZONE ...)` bucketing in `sales.ts` and `audience.ts`
2. the `HAVING`-based repeat-customer count in `audience.ts`
3. the double-`LEFT JOIN` revenue-by-range query in `sales.ts`
4. the `FILTER`-based inventory snapshot in `catalogue.ts`

`tests/integration/analytics.integration.test.ts` covers all four (12 tests).
**Until it runs, treat that SQL as reviewed, not verified.**

---

## 5. Manual verification worth doing by hand

### 5.1 The timezone boundary — the thing most likely to be wrong

```sql
-- A settled order that landed at 22:30 UTC, which is already
-- tomorrow in Bulawayo.
UPDATE "Order"
   SET "paidAt" = '2026-08-15T22:30:00Z', "paymentStatus" = 'PAID'
 WHERE "orderNumber" = '<some test order>';
```

Open `/admin/analytics/sales?range=custom&from=2026-08-16&to=2026-08-16`.

The revenue chart must show that order on **16 August**, not the 15th. If it
appears on the 15th, the `AT TIME ZONE` clause and the range boundaries have
disagreed — which is exactly the bug this design exists to prevent.

### 5.2 Authorization

Log in as a `MARKETING_MANAGER`. Expected:

- The Analytics nav entry is visible (overview is `dashboard:read`).
- Tabs show Overview and Products. **No Sales, Customers, Inventory or
  Enquiries.**
- Visiting `/admin/analytics/sales` directly redirects to
  `/admin?denied=order%3Aread`.
- On the overview, the revenue panel is **absent, not blank** — the gate decides
  what is queried, not just what renders.

### 5.3 Empty and zero states

With no orders, `/admin/analytics` should read as "nothing has happened yet",
never as broken:

- Revenue and average order show `$0.00`, with the note "No settled orders yet".
- Trends read "No comparable period", not "0%".
- Charts show an empty state, not an empty axis.
- Inventory reads **"No stock has been counted yet"** — this is the important
  one. It must not say 369 pieces are out of stock.

### 5.4 Currency separation

If you can create a settled order in a second currency, do. The reporting
currency figure must be unchanged, an amber note must appear naming how many
orders were excluded, and the currency selector must appear in the filter bar.
No figure anywhere should equal the sum of the two.

### 5.5 Accessibility spot-check

The charts were reviewed statically, not with a screen reader. Worth a real
check: each `<svg>` has `role="img"` and a summary label, and each is followed by
an `sr-only` table carrying the same numbers. Tab through the filter bar — every
control should have a visible focus ring and an associated `<label>`.

---

## 6. Rolling back

Code:

```bash
git checkout main
git branch -D phase-7-analytics
```

Database — the index is the only change, and dropping it is safe and instant:

```sql
DROP INDEX IF EXISTS "order_settled_paid_at";
```

Then remove `"order_settled_paid_at"` from the `INDEXES` array in
`scripts/verify-database.mjs`, or `db:verify` will report it missing.

The `business.timezone` setting row is harmless to leave in place; nothing else
reads it.

---

## 7. What Phase 7 deliberately did not do

- **No Paynow, S3, email provider or Redis.** Still deferred, still needing
  business decisions and credentials.
- **`/admin/inventory` remains `built: false`.** Phase 7 reports on stock; it
  does not manage it. Marking the section live would promise an editing surface
  that does not exist.
- **No enquiry-to-order conversion rate.** `CustomOrderInquiry` has no foreign
  key to `Order` and shares no key with it. Matching on email address would
  credit a commission enquiry with an unrelated shop order and miss every
  commission paid for by an organisation. The enquiry pipeline's own progression
  is reported instead, labelled for what it is. If the studio wants a real
  conversion figure, the fix is a nullable `orderId` on `CustomOrderInquiry` set
  when a commission converts — a small migration plus an admin action, not an
  analytics change.
- **No net-of-refund revenue.** Nothing in this repository writes a refund yet,
  so `SUM(Order.total)` is exact today. `hasRecordedRefunds()` watches the
  payment ledger and the UI will say the figure is gross the moment that stops
  being true.
