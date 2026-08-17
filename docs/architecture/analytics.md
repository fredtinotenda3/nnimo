# Analytics architecture

Phase 7. Server-side business intelligence built entirely from the existing
schema. Nothing here is projected, sampled, or inferred.

---

## 1. The shape of it

The layer is split along one hard line: **calculation is pure, querying is not.**

```
lib/analytics/
  range.ts       PURE  timezone-correct boundaries, presets, buckets, gap-filling
  compute.ts     PURE  currency segmentation, averages, trends, shares, coverage
  params.ts      PURE  search-parameter parsing
  sections.ts    PURE  route → permission table
  types.ts             shared result models
  context.ts     DB    reporting currency + timezone, resolved once per request
  sales.ts       DB    KPIs, series, status distribution, product/range revenue
  catalogue.ts   DB    catalogue composition, unsold pieces, inventory
  audience.ts    DB    customers, repeat counts, enquiries
  operations.ts  DB    worklists
  overview.ts    DB    composes the executive summary and derives its caveats
```

The split is not stylistic. `tests/stubs/db.ts` replaces `@/lib/db` with a proxy
that throws on any access, so **any module importing the database is untestable
in the unit suite**. Putting the arithmetic on the pure side is what makes 101
unit tests possible; the query modules do grouping and summing in Postgres and
derive nothing, so there is little left in them to unit-test.

`lib/admin/dashboard.ts` was refactored to delegate to these services. Its
exported names and types are unchanged. The reason is single-definition: the
dashboard and the analytics section must not each carry their own idea of what
"revenue" means.

---

## 2. Currency

**Nothing is ever summed across currencies.** 100 USD plus 100 ZWG is not 200 of
anything, and a warned-about wrong number on a dashboard is still a wrong number.

- Monetary aggregates group by `Order.currency` and return `CurrencyTotal[]`.
- `segmentByCurrency()` splits that into the reporting currency (`primary`) and
  everything else (`others`), and reports `excludedCount` so an order left out
  of the headline is visible rather than silently missing.
- Rankings — revenue by piece, by range, by customer — are **scoped to a single
  currency**, chosen with the `currency` parameter. Ordering products by a
  cross-currency total would be the same invalid arithmetic wearing a table.
- The currency selector renders only when settled orders exist in more than one
  currency.
- **No exchange rate is invented.** Converting would need a rate the business has
  not supplied, and a made-up rate is worse than an honest per-currency split.

The reporting currency comes from the `commerce.currency` setting.

---

## 3. Time

### Timezone

Every boundary and every bucket is computed against the `business.timezone`
setting, defaulting to `Africa/Harare` (CAT, UTC+2, no DST).

This is not decoration. `createdAt` and `paidAt` are `timestamptz`; truncating
them to a day under a UTC session — which is what a serverless function does —
puts every order placed between 00:00 and 02:00 in Bulawayo on the previous day.

The zone is applied twice and must agree both times:

1. In `range.ts`, to compute the half-open `[start, end)` instants that bound
   the query.
2. In SQL, via `AT TIME ZONE`, to bucket the rows inside it.

`zonedTimeToUtc()` uses a two-pass offset correction, so it stays correct for a
zone that observes DST even though Harare does not.

### Two axes, never conflated

| Measure | Anchored on | Answers |
|---|---|---|
| Revenue, average order value | `Order.paidAt` | income |
| Orders placed, status distribution | `Order.createdAt` | demand |
| New customers | `Customer.createdAt` | growth |
| Enquiries | `CustomOrderInquiry.createdAt` | interest |

An order placed in January and paid in February is January demand and February
income. Every page states which axis it is on.

### Ranges and buckets

Presets: today, last 7 days, last 30 days, this month, previous month, all time,
custom. Ranges are **half-open**, so consecutive periods tile without
double-counting an order placed exactly at midnight. All time is genuinely
unbounded (`start`/`end` are `null`), not a very wide window.

Custom ranges are capped at `MAX_CUSTOM_RANGE_DAYS` (1827). Reversed dates are
swapped; a half-filled or invalid custom range degrades to the default rather
than throwing.

Granularity is derived, not chosen: **day** up to 62 days, **month** beyond.
Buckets are generated from the range, not from the returned rows, so a day with
no orders renders as an empty bucket — a line that skips from Monday to Thursday
reads as three days of steady trade.

All time is the exception: with no start date there is nothing to enumerate, so
its series carries `ungapped: true` and the UI says so.

### Comparison periods

`previousRange()` compares against the period of the **same calendar shape**, not
merely the same length. The period before "this month" is the previous calendar
month, not the previous 31 days — comparing February against "the 28 days before
it" would straddle January.

A trend renders **only** when the arithmetic supports one. It is suppressed, with
a stated reason, when there is no previous period, when the previous period was
zero (a rise from nothing is not "infinity percent"), and when the two periods
are in different currencies.

---

## 4. Revenue basis, and its one limitation

Revenue is `SUM(Order.total)` over orders whose `paymentStatus` is `PAID` or
`PARTIALLY_REFUNDED` — the same definition `/admin` and `/admin/customers`
already used.

This is **exact today** because no code path in this repository writes a refund.
It becomes **gross rather than net** the moment one does. `hasRecordedRefunds()`
watches the `Payment` ledger for a `REFUNDED` row, and the UI raises a warning as
soon as one appears.

When refunds are implemented, net revenue should be derived from the append-only
`Payment` ledger rather than from `Order.total`.

---

## 5. Data limitations surfaced in the UI

Caveats are **derived from the fetched data**, not written into pages. Each one
states a limitation the figures genuinely have, and stops rendering on its own
when the underlying gap closes. See `buildNotes()` in `overview.ts`.

| Note | Condition |
|---|---|
| Mixed currency | Settled orders exist in more than one currency |
| Refunds recorded | Any `Payment` row with status `REFUNDED` |
| Price coverage | Any piece without a confirmed price |
| Stock uncounted | `Inventory` has no rows |
| Valuation coverage | Counted pieces exist that have no price |
| Orphan orders | Settled orders whose customer record was deleted |
| All-time series | The range is unbounded |

Three things are **deliberately not computed**:

- **Enquiry-to-order conversion.** `CustomOrderInquiry` has no foreign key to
  `Order` and shares no key with it. Matching on email would credit a commission
  enquiry with an unrelated shop order and miss every commission paid for by an
  organisation. The enquiry pipeline's own progression is reported instead.
- **Customer demographics.** The schema holds a name, email, phone and marketing
  consent. Location, age and segment are not in it.
- **Demand beyond units sold.** There is no view tracking, cart-abandonment
  record or wishlist, so "demand" means quantity sold and nothing else.

**Uncounted is not zero.** A piece with no `Inventory` row is *unknown*, not
empty. `productsWithoutRecord` is a separate figure from `outOfStock` throughout.
Nnino has never counted its studio stock, so today that is nearly the whole
catalogue.

---

## 6. Authorization

No new permission was introduced. The six existing ones already express the right
boundaries, and a parallel `analytics:read` would have to be kept in step with
six role mappings.

| Route | Permission |
|---|---|
| `/admin/analytics` | `dashboard:read` |
| `/admin/analytics/sales` | `order:read` |
| `/admin/analytics/products` | `product:read` |
| `/admin/analytics/customers` | `customer:read` |
| `/admin/analytics/inventory` | `inventory:read` |
| `/admin/analytics/enquiries` | `custom_order:read` |

The mapping lives in `lib/analytics/sections.ts` — extracted from the tab
component precisely so it can be tested without rendering React.

On the overview, **the permission gate decides what is queried**, not merely what
is rendered. A `MARKETING_MANAGER` never runs the revenue aggregate at all:
fetching a figure and hiding it in CSS is a slower page and a wider disclosure
surface for no benefit.

Every page calls `requirePermission()` for itself. The tab strip is presentation;
a URL typed into the address bar never passes through it.

---

## 7. Performance

- No N+1. Rankings aggregate in Postgres and hydrate labels in one bounded
  `findMany` — one query for the ranking, one for the names.
- No table loaded into memory for an aggregate. Every sum, count and grouping is
  computed by the database.
- Every list is bounded by `take`; charts are capped at `MAX_BUCKETS` (366).
- Concurrent fetches via `Promise.all` rather than sequential awaits.

### The one new index

```sql
CREATE INDEX "order_settled_paid_at"
  ON "Order" ("paidAt")
  WHERE "paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED');
```

`Order_paymentStatus_idx` has no date component and `Order_createdAt_idx` is on
the wrong column, so nothing existing serves a revenue range scan. Partial,
because the predicate matches the query exactly: the index holds only rows that
can ever contribute to revenue, so it stays small and inserting an unpaid order
at checkout does not touch it.

Registered in `scripts/verify-database.mjs`.

### Raw SQL

Four statements use `$queryRaw`, each for something Prisma's typed API cannot
express: `date_trunc` bucketing, a `HAVING`-based repeat-customer count, a
two-level `LEFT JOIN` for revenue by range, and `FILTER`-based inventory
aggregation.

In all four:

- The `date_trunc` unit and `to_char` pattern are parameters, but **never come
  from the URL** — they are derived from a closed two-value `Granularity`
  decided in code.
- Money is cast to `text` and parsed by `toCents`; counts are cast to `int`. This
  removes any dependence on how the driver maps `NUMERIC` and `BIGINT`.
- Nullable bounds (`$1 IS NULL OR ...`) let all-time share one statement with a
  bounded range. This costs the planner the chance to use the partial index on
  the unbounded path, which is correct — an all-time query reads every settled
  order anyway.

---

## 8. Testing

| Suite | Tests | Covers |
|---|---|---|
| `tests/analytics-range.test.ts` | 33 | timezone boundaries, DST, presets, comparison periods, granularity, gap-filling |
| `tests/analytics-compute.test.ts` | 38 | currency segmentation, averages, trends, shares, coverage, ranking |
| `tests/analytics-params.test.ts` | 17 | parameter validation, fallbacks, query round-trip |
| `tests/analytics-authorization.test.ts` | 13 | route→permission mapping, per-role reach |
| `tests/integration/analytics.integration.test.ts` | 14 | the raw SQL, against real Postgres |

The integration suite is where the SQL is actually verified. Its most important
assertion writes an order settled at 22:30 UTC and asserts it lands on the *next*
day's bucket.
