# PHASE 7 IMPLEMENTATION REPORT
## Analytics, Business Intelligence & Internal Operations

**Date:** 16 August 2026
**Baseline:** Phase 5 complete, 206 unit tests passing
**Result:** 307 unit tests passing, TypeScript clean, ESLint clean

---

## 1. Executive summary

Phase 7 turns the existing commerce, catalogue, customer, order, enquiry and
inventory data into a server-side business intelligence system, built entirely
from the current schema. Nothing is projected, sampled or inferred.

Delivered:

- A pure, fully unit-tested analytics calculation layer (`lib/analytics/`).
- Six analytics routes under `/admin/analytics`, gated by the existing RBAC.
- Currency-aware financial aggregation that never sums across currencies.
- Timezone-correct date handling anchored on a new editable `business.timezone`
  setting.
- One new database index, justified by an actual query pattern.
- **101 new unit tests** (206 → 307) and 14 new integration tests.
- `lib/admin/dashboard.ts` refactored to delegate, public API unchanged.

**Verification status:** `tsc --noEmit`, `eslint` and the full unit suite were
**executed successfully in the build sandbox**. `npm run build` and
`npm run db:verify` were **not run**, per instruction — manual steps are in
`APPLY.md`.

Paynow, S3, a real email provider and Redis remain deliberately unimplemented.

---

## 2. Discovery findings

### Reused rather than duplicated

| Existing asset | How Phase 7 uses it |
|---|---|
| `lib/admin/dashboard.ts` | Refactored to delegate; API unchanged |
| `lib/commerce/money.ts` | All money is integer cents via `toCents`/`formatCents` |
| `lib/admin/query.ts` | `params.ts` extends its parsing discipline |
| `lib/admin/completeness.ts` | `productGaps` drives "needs attention" |
| `lib/inventory.ts` | Its `available` and low-stock rules, reproduced in SQL |
| `lib/commerce/fulfilment.ts` | `PAYMENT_LABEL`, `FULFILMENT_LABEL` |
| `lib/rbac.ts`, `lib/session.ts` | Every gate; no new permission added |
| Admin UI primitives | `PageHeader`, `AdminSection`, `StatGrid`, `StatTile`, `Table`, `EmptyState`, `LoadingState` |

### Gaps found

1. **No time dimension anywhere.** Every existing aggregate was all-time.
2. **No timezone.** UTC bucketing misfiles orders placed 00:00–02:00 CAT.
3. **`Order.paidAt` unindexed.** Revenue range scans had no supporting index.
4. **Two time axes never distinguished** — `createdAt` vs `paidAt`.
5. **No refund write path exists.** `REFUNDED` is currently unreachable.
6. **`OrderItem.productId` is nullable** (`SetNull`), so deleted products would
   silently vanish from revenue.
7. **Prisma `groupBy` cannot `date_trunc`.** Raw SQL required.
8. **Unit tests stub `@/lib/db`**, forcing the pure/query split.
9. **`Inventory` has 0 rows.** "Uncounted" must be a first-class state.
10. **Inventory value mostly uncomputable** — 9 of 369 pieces have prices.
11. **Guest orders are NOT a blind spot** — checkout upserts a `Customer`
    (`orders.ts:237`), so `customerId` is always set.

---

## 3. Files created (29)

**Analytics layer**
```
lib/analytics/range.ts        PURE  timezone, presets, buckets, gap-filling
lib/analytics/compute.ts      PURE  currency segmentation, averages, trends
lib/analytics/params.ts       PURE  search-parameter parsing
lib/analytics/sections.ts     PURE  route → permission table
lib/analytics/types.ts              shared result models
lib/analytics/context.ts      DB    currency + timezone resolution
lib/analytics/sales.ts        DB    KPIs, series, distributions, breakdowns
lib/analytics/catalogue.ts    DB    composition, unsold, inventory
lib/analytics/audience.ts     DB    customers, enquiries
lib/analytics/operations.ts   DB    worklists
lib/analytics/overview.ts     DB    executive summary + derived caveats
```

**UI**
```
components/admin/analytics-shell.tsx    tabs, range picker, notes, breakdown
components/admin/analytics-charts.tsx   server-rendered SVG + sr-only tables
app/admin/analytics/page.tsx            overview
app/admin/analytics/sales/page.tsx
app/admin/analytics/products/page.tsx
app/admin/analytics/customers/page.tsx
app/admin/analytics/inventory/page.tsx
app/admin/analytics/enquiries/page.tsx
app/admin/analytics/loading.tsx
```

**Database, docs, tests**
```
prisma/migrations/20260816090000_phase7_analytics_indexes/migration.sql
docs/architecture/analytics.md
tests/analytics-range.test.ts                    33 tests
tests/analytics-compute.test.ts                  38 tests
tests/analytics-params.test.ts                   17 tests
tests/analytics-authorization.test.ts            13 tests
tests/integration/analytics.integration.test.ts  12 tests
PHASE-7-REPORT.md
APPLY.md
```

## 4. Files modified (6)

| File | Change |
|---|---|
| `lib/admin/dashboard.ts` | Delegates to `lib/analytics/`. **Exported names and types unchanged**; `app/admin/page.tsx` untouched |
| `lib/admin/settings-registry.ts` | New `timezone` kind + `business.timezone` definition |
| `lib/admin-sections.ts` | Analytics nav entry; comment on why Inventory stays `built: false` |
| `components/admin/list-controls.tsx` | Additive optional `trend` prop on `StatTile` |
| `prisma/seed/source-data.ts` | Seeds `business.timezone` = `Africa/Harare` |
| `scripts/verify-database.mjs` | Registers `order_settled_paid_at` |

No file was deleted. `app/admin/page.tsx` was **not** modified.

---

## 5. Architecture

Split along one hard line: **calculation is pure, querying is not.**

`tests/stubs/db.ts` replaces `@/lib/db` with a proxy that throws on any access,
so any module importing the database is untestable in the unit suite. Putting
the arithmetic on the pure side is what makes 101 unit tests possible. The query
modules aggregate in Postgres and derive nothing.

Routes are tabs, not a client-side tab component, so each page runs only its own
queries, every view is bookmarkable, and the whole section works without
JavaScript — consistent with the Phase 4 list views.

Full detail in `docs/architecture/analytics.md`.

---

## 6. Metrics implemented

**Sales** — orders placed / settled / awaiting payment / pending / failed /
cancelled; revenue; average order value; revenue over time; orders over time;
revenue by range; revenue by piece; payment and fulfilment status distributions;
period-on-period trends.

**Products** — catalogue composition (published / catalogue-only / archived,
priced vs price-on-request, published-but-unsellable, without photograph);
best sellers by settled revenue with correct shares; pieces sold; published
pieces with no sales; all pieces with no sales.

**Customers** — total; new over time; customers who bought; returning (two or
more settled orders); orders per buying customer; average customer value;
highest-spending customers; orders with no customer record.

**Inventory** — pieces counted; on hand; reserved; available (derived, never
stored); low stock; out of stock; **uncounted pieces**; stock value per currency
with coverage; restocking worklist.

**Enquiries** — commission enquiries received; new; quoted; progressed past
quote; still open; wholesale totals; enquiries over time; full pipeline
distribution; most recent.

**Operations** — awaiting payment (oldest first); paid but awaiting fulfilment;
recently completed; published pieces that cannot be bought. **Deliberately not
date-filtered**: an order unpaid since March is more urgent than one from
yesterday, not less visible.

### Currency correctness

Nothing is ever summed across currencies. Aggregates group by `Order.currency`;
`segmentByCurrency()` splits reporting currency from the rest and reports
`excludedCount` so an excluded order is visible. Rankings are scoped to one
currency. No exchange rate is invented.

### Trends

A trend renders only when the arithmetic holds. It is suppressed with a stated
reason when there is no previous period, when the previous period was zero, and
when the currencies differ. Comparison periods use the **same calendar shape** —
the period before "this month" is the previous calendar month, not 31 days.

---

## 7. Limitations caused by current data

| Limitation | Handling |
|---|---|
| 9 of 369 pieces priced | Coverage stated in UI; unpriced pieces absent from revenue, never counted as zero |
| `Inventory` has 0 rows | "Uncounted" is a distinct state from "out of stock"; empty state explains it |
| Inventory value | Computed only where quantity *and* price exist; coverage stated |
| No refund path | Revenue is exact today; ledger watched, warning raised on first refund |
| No enquiry→order link | **Conversion rate not reported.** Pipeline progression reported instead |
| No customer demographics | Not reported |
| No view/cart telemetry | "Demand" means units sold only |
| Deleted products | Explicit "no longer in the catalogue" row, so other shares stay correct |
| Deleted customers | `ordersWithoutCustomer` counted and explained |

Caveats are **derived from fetched data**, not hard-coded, so each disappears on
its own when the underlying gap closes.

---

## 8. Verification results

### Executed in the build sandbox

| Command | Result |
|---|---|
| `npm ci` | ✅ 641 packages |
| `npx prisma generate` | ✅ (see note) |
| `npx tsc --noEmit` | ✅ **clean** |
| `npx eslint .` | ✅ **clean** |
| `npx vitest run` | ✅ **307/307 passing, 19 files** |

**Note on `prisma generate`:** `binaries.prisma.sh` is blocked by the sandbox
egress proxy (`x-deny-reason: host_not_allowed`), so the schema-engine download
fails. Setting `PRISMA_SCHEMA_ENGINE_BINARY` to a stub path bypasses it —
generation does not need the engine. **This is a sandbox artefact only.** On your
machine `npm run db:generate` works normally; do not adopt the workaround.

### NOT run — per instruction

| Command | Why |
|---|---|
| `npm run build` | Needs a real `.env`; heavy |
| `npm run db:verify` | Needs a live PostgreSQL connection |
| `npm run test:integration` | Needs `TEST_DATABASE_URL` |

Manual steps in `APPLY.md` §3.

### Test count

| | Files | Tests |
|---|---|---|
| Baseline (Phase 5) | 15 | 206 |
| **After Phase 7** | **19** | **307** |
| Added | +4 | **+101** |
| Removed | 0 | **0** |

Plus 12 integration tests (separate config, not in the 307).

### Honest caveat

The unit suite proves the calculation layer. It does **not** execute the four raw
SQL statements — those are covered by `tests/integration/analytics.integration.test.ts`,
which has not run here because there is no PostgreSQL in this sandbox. **Until
you run the integration suite, treat the raw SQL as reviewed, not verified.**
Running it is step 4 of `APPLY.md`.

---

## 9. Database changes

One migration, `20260816090000_phase7_analytics_indexes`, adding one index:

```sql
CREATE INDEX IF NOT EXISTS "order_settled_paid_at"
  ON "Order" ("paidAt")
  WHERE "paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED');
```

Justified because revenue is measured on `paidAt`, and neither
`Order_paymentStatus_idx` (no date component) nor `Order_createdAt_idx` (wrong
column) serves that scan. Partial, so it holds only rows that can contribute to
revenue and checkout inserts do not touch it — matching the pattern set by
`inventory_low_stock` in Phase 5. Partial indexes cannot be expressed in the
Prisma schema, hence raw SQL.

Idempotent, non-destructive, no column added, renamed or dropped, no row
touched. **No schema.prisma change, so no `prisma migrate dev` is required** —
`prisma migrate deploy` applies it.

One new setting row: `business.timezone` = `Africa/Harare` (via seed upsert, or
add it in `/admin/settings`).

---

## 10. Remaining blockers

**None introduced by Phase 7.** Carried forward from Phase 5, all
business/external:

| # | Blocker | Status |
|---|---|---|
| 1 | Paynow credentials | 🚫 business decision (Phase 6) |
| 2 | S3 bucket | ⚠️ external service |
| 3 | Sending domain + SPF/DKIM/DMARC | 🚫 business decision |
| 4 | Redis rate-limit credentials | ⚠️ external service |
| 5 | Backups not restore-tested | ⚠️ manual configuration |

**New, and worth scheduling:**

| # | Item | Why |
|---|---|---|
| 6 | Count studio stock | Inventory analytics is empty until it happens. A data-entry task, not an engineering one |
| 7 | Confirm prices for the remaining ~360 pieces | Most of the catalogue cannot appear in revenue analytics |
| 8 | Net revenue from the `Payment` ledger | Only needed once refunds are implemented; the UI warns automatically |

---

## 11. What was NOT done, deliberately

- **Paynow** — Phase 6.
- **Real S3, email provider, Redis** — deferred external integrations.
- **`/admin/inventory`** — stays `built: false`. Phase 7 reports on stock; it
  does not manage it. Marking it live would promise an editing surface that does
  not exist.
- **`analytics:read` permission** — the six existing permissions already express
  the right boundaries.
- **Charting library** — two shapes do not justify a client-side runtime and a
  hydration boundary in an otherwise fully server-rendered admin.
- **Conversion rate, demographics, demand proxies** — the schema does not
  support them, and a guess rendered as a percentage is indistinguishable from a
  measurement once it is on a dashboard.
