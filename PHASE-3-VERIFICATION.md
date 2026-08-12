# Phase 3 — closing verification

## What I could and could not run

I have no database and no Prisma engine in my environment. Verified, not assumed:

| Check | Result |
|---|---|
| `docker`, `psql`, `postgres` binaries | none present |
| `binaries.prisma.sh` (Prisma engine download) | **HTTP 403** — not on the sandbox allow-list |
| `.env` | not present (yours is on your machine) |

So `prisma migrate`, `prisma generate` and anything that opens a connection
cannot execute here. Per your instruction I delivered these as code instead of
pretending. **Nothing in this package is claimed as database-verified.**

What I *did* verify statically, against your committed
`prisma/migrations/20260810152905_init/migration.sql`:

- Every column my SQL references exists with the expected name and type
  (`Inventory.onHand/reserved/lowStockThreshold`, `Order.subtotal/shippingTotal/
  total/fulfilmentMethod/deliveryAddress`, `OrderItem.quantity/unitPrice/lineTotal`).
- **Your database has 0 CHECK constraints and no `product_image_single_primary`
  index.** `0002_constraints.sql` has definitively never been applied.

---

## 1. Apply the database work

```bash
npm install
npm run db:generate
npx prisma migrate dev --name phase3_commerce
```

Then **paste both SQL files into the generated `migration.sql`** so they travel
with `migrate deploy` to every environment:

```
prisma/sql/0002_constraints.sql            <-- pending since Phase 1
prisma/sql/0003_order_number_sequence.sql  <-- REQUIRED for checkout
```

`0003` creates `nnino_order_number_seq`; order creation calls `nextval()` on it,
so without it **every checkout fails**.

Then confirm, rather than hoping:

```bash
npm run db:verify
```

That prints OK/MISSING for all 23 CHECK constraints, both indexes, the sequence,
the six new `Order` columns and the `CONFIRMED` enum value — and exits non-zero if
anything is missing. It uses the `pg` driver already in your dependencies, so it
needs no `psql` install on Windows.

**One migration caveat:** `Order.accessToken` is `String @unique` NOT NULL. With
existing order rows `migrate dev` will refuse. You have none, so it should be
clean; if it complains, either `npm run db:reset` (destroys seed data, re-seed
after) or add the column nullable, backfill `gen_random_uuid()`, then set NOT NULL.

## 2. Run the integration suite

```bash
createdb nnino_test
TEST_DATABASE_URL="postgresql://nnino:nnino@localhost:5432/nnino_test?schema=public" \
DATABASE_URL="postgresql://nnino:nnino@localhost:5432/nnino_test?schema=public" \
DIRECT_DATABASE_URL="postgresql://nnino:nnino@localhost:5432/nnino_test?schema=public" \
  npx prisma migrate deploy
# apply 0002 and 0003 to the test database too — several tests assert them
```

Add `TEST_DATABASE_URL` to `.env`, then:

```bash
npm run test:integration     # real Postgres
npm run verify:full          # typecheck + lint + unit + build + integration
```

The harness **refuses to run unless the database name contains "test"**. There is
no override — pointing it at your development database would delete orders.

## 3. Manual checkout walkthrough

Nothing is purchasable until a piece has a verified price. That is the design, not
a bug.

1. `/admin/products` → publish one of the 9 priced pieces (the $150 platters).
2. Product page → **Add to cart** appears. An unpriced piece shows *Request a
   price* instead.
3. Cart badge in the header → drawer → `/cart` → change quantity, remove a line.
4. `/checkout` → try **Collection** (fee genuinely $0) and **Delivery** (total
   marked as excluding delivery, `deliveryQuoteStatus = PENDING_QUOTE`).
5. Sandbox payment page → choose the outcome. **Marked as a test provider
   throughout; no payment network is contacted.**
6. Confirmation at `/orders/<accessToken>` — unguessable token, not the order
   number.
7. `/admin/orders` → open it → walk the status through the lifecycle.
8. Emails print to the **server console**; nothing is sent.

## What the integration suite covers

| Your requirement | File | Notes |
|---|---|---|
| Cart creation | `cart.integration.test.ts` | session-token addressable |
| Add/remove/update items | `cart.integration.test.ts` | incl. cascade + quantity CHECK |
| Server-side price revalidation | `cart.integration.test.ts` | proves `CartItem` stores no price |
| Purchasability validation | `orders.integration.test.ts` | unpriced, unpublished, out-of-stock |
| Order creation transaction | `orders.integration.test.ts` | snapshots, totals, rollback |
| Order number generation | `orders.integration.test.ts` | uniqueness + format |
| `Order.cartId` duplicate guard | `orders.integration.test.ts` | asserts exactly one order per cart |
| Inventory reservation | `inventory.integration.test.ts` | incl. a real concurrency race |
| Payment creation | `payments.integration.test.ts` | amount, currency, PENDING |
| Webhook idempotency | `payments.integration.test.ts` | incl. simultaneous duplicates |
| Order/payment consistency | `payments.integration.test.ts` | UNPAID until server verification |
| Admin status transitions | `admin-orders.integration.test.ts` | both paths + illegal moves |
| Audit log creation | `admin-orders.integration.test.ts` | attribution to the acting user |
| Database constraints | `constraints.integration.test.ts` | fails loudly if 0002/0003 missing |

## Product photography

The current imagery is **temporary placeholder catalogue imagery** and is treated
as such in code — see the header comment in `lib/brand-assets.ts`. The
PDF-extracted brochure images were deliberately never used: they are 230–267px
thumbnails, too low-resolution for production. No photograph is claimed to depict
a specific SKU, because the supplied files are unlabelled.

What is needed from Nnino, in priority order:

1. **10–15 priority products first** — ideally the 9 with verified prices, so
   checkout has something photographed behind it.
2. High-resolution originals (unedited camera files, not WhatsApp copies —
   WhatsApp recompresses and strips metadata).
3. Front / side / back / detail views where the piece warrants it.
4. Clean, consistent background.
5. For each piece: product name, SKU, dimensions, weight, price, availability.

Filenames matching the product name or SKU are what allows correct attachment.
Without that the mapping is guesswork and I will not guess.
