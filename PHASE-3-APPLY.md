# Phase 3 — apply these steps after unzipping

Everything below has been typechecked, linted, tested and built. Two steps need
running on your machine because they touch the database.

## 1. Migrate

```bash
npm install                     # picks up vitest
npm run db:generate
npx prisma migrate dev --name phase3_commerce
```

The schema changes are all **additive** — no column is dropped or retyped, so
this is safe against your existing seeded data:

| Change | Purpose |
|---|---|
| `OrderFulfilmentStatus += CONFIRMED` | Your approved lifecycle |
| `DeliveryQuoteStatus` (new enum) | Explicit "fee not known yet" state |
| `Order.deliveryQuoteStatus` | Defaults to `NOT_REQUIRED` |
| `Order.cartId` unique | Duplicate-order prevention |
| `Order.accessToken` unique | Unguessable confirmation URL |
| `Order.paidAt / confirmedAt / readyAt` | Lifecycle timestamps |

**`accessToken` is `String @unique` and NOT NULL.** If your `Order` table already
has rows, `migrate dev` will fail on the not-null column. You have no orders yet,
so the clean path is to let it recreate — but if it does complain, either
`npm run db:reset` (destroys seeded data; re-seed after) or add the column
nullable, backfill with `gen_random_uuid()`, then set NOT NULL.

## 2. Apply the SQL that Prisma cannot express

**Paste both files into the generated `migration.sql`** before it runs, so they
travel with `migrate deploy` to every environment:

```
prisma/sql/0002_constraints.sql            <-- STILL PENDING from Phase 1
prisma/sql/0003_order_number_sequence.sql  <-- new, REQUIRED
```

`0003` is **not optional**: it creates `nnino_order_number_seq`, and order
creation calls `nextval()` on it. Without it every checkout fails.

Or apply by hand:

```bash
psql "$DIRECT_DATABASE_URL" -f prisma/sql/0002_constraints.sql
psql "$DIRECT_DATABASE_URL" -f prisma/sql/0003_order_number_sequence.sql
```

## 3. Environment

Add to `.env` (see `.env.example` for the full annotated block):

```
PAYMENT_PROVIDER="sandbox"
EMAIL_TRANSPORT="dev"
EMAIL_FROM="Nnino Ceramics <orders@example.com>"
```

## 4. Verify and walk the flow

```bash
npm run verify     # typecheck -> lint -> test -> build
npm run dev
```

Nothing is purchasable until a piece has a **verified price**. To see checkout:

1. `/admin/products` → publish one of the 9 priced pieces (the $150 platters).
2. Open it on the storefront → **Add to cart** appears.
   An unpriced piece shows *Request a price* instead — by design.
3. `/cart` → `/checkout` → choose collection or delivery.
4. The sandbox provider renders a payment page where you choose the outcome.
   Nothing contacts a payment network.
5. Confirmation lands at `/orders/<accessToken>`.
6. `/admin/orders` → open it → move the status through the lifecycle.

Emails are written to the **server console**, not sent.
