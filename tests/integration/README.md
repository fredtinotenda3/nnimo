# Integration tests

These run against a **real PostgreSQL database**. They are destructive and
therefore refuse to start unless `TEST_DATABASE_URL` is set and the database name
contains `test`.

## Setup

```bash
# 1. A separate database — never your development one.
createdb nnino_test          # or: docker exec -it nnino-postgres createdb -U nnino nnino_test

# 2. Apply the schema to it.
TEST_DATABASE_URL="postgresql://nnino:nnino@localhost:5432/nnino_test?schema=public" \
DATABASE_URL="postgresql://nnino:nnino@localhost:5432/nnino_test?schema=public" \
DIRECT_DATABASE_URL="postgresql://nnino:nnino@localhost:5432/nnino_test?schema=public" \
  npx prisma migrate deploy

# 3. The constraints and the order-number sequence are REQUIRED.
#    Several tests assert behaviour that only exists once these are applied.
psql "postgresql://nnino:nnino@localhost:5432/nnino_test" -f prisma/sql/0002_constraints.sql
psql "postgresql://nnino:nnino@localhost:5432/nnino_test" -f prisma/sql/0003_order_number_sequence.sql
```

## Run

```bash
npm run test:integration
```

Or everything:

```bash
npm run verify:full
```

## What is covered

| Area | File |
|---|---|
| Cart create / add / update / remove, quantity validation | `cart.integration.test.ts` |
| Price revalidation, purchasability, unpriced pieces | `checkout-validation.integration.test.ts` |
| Order creation transaction, snapshots, order numbers, duplicate guard | `orders.integration.test.ts` |
| Stock reservation atomicity and oversell prevention | `inventory.integration.test.ts` |
| Payment creation, verification, webhook idempotency | `payments.integration.test.ts` |
| Fulfilment transitions and audit-log writes | `admin-orders.integration.test.ts` |
| Database constraints from 0002/0003 | `constraints.integration.test.ts` |

Each test cleans up the rows it created. A failed run may leave rows behind;
they are all prefixed `piece_`, `sess_` or `t_` and are safe to delete.
