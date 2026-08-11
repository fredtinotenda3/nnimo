# Data model and lifecycles

Companion to `prisma/schema.prisma`. This file records *why* the schema looks the
way it does, so a future engineer changing it knows what they would be breaking.

---

## 1. The central decision: lifecycle and availability are separate

The brief's most important modelling instruction was not to reduce the product
states to an `inStock` boolean. Two independent enums do the work:

| Column | Enum | Answers |
|---|---|---|
| `Product.lifecycleStage` | `CATALOGUE \| PUBLISHED \| ARCHIVED` | Does the public site show this at all? |
| `Product.availability` | `IN_STOCK \| LOW_STOCK \| OUT_OF_STOCK \| MADE_TO_ORDER \| CUSTOM_ONLY \| COMING_SOON` (nullable) | If shown, how can it be bought? |

They are orthogonal on purpose. The six states named in the brief map onto
combinations rather than onto one column:

| Business concept | lifecycleStage | availability | Inventory row |
|---|---|---|---|
| Catalogue product | `CATALOGUE` | `null` | none |
| Published product | `PUBLISHED` | any non-null | depends |
| In-stock product | `PUBLISHED` | `IN_STOCK` / `LOW_STOCK` | yes, `onHand > reserved` |
| Made-to-order product | `PUBLISHED` | `MADE_TO_ORDER` | not required |
| Custom commission | `PUBLISHED` | `CUSTOM_ONLY` | none — goes via `CustomOrderInquiry` |
| Archived product | `ARCHIVED` | ignored | retained |

`availability` is nullable because a `CATALOGUE` product has no meaningful
answer to "how can this be bought". A non-null default would have forced a lie
onto every one of the ~300 imported rows.

**Why not one enum with nine values?** Because the two questions change for
different reasons and are answered by different people. Publishing is a
marketing decision; availability is an operations one. Collapsing them means
every stock movement risks unpublishing a product.

---

## 2. Entity map

```
User ──< AuditLog

Media ──< ProductImage >── Product
  │  ├──< Collection.heroImage
  │  ├──< Artist.photo
  │  ├──< Campaign.heroImage
  │  ├──< LandingPage.heroImage
  │  └──< CustomOrderInquiryImage >── CustomOrderInquiry

Collection ──< Product >── Category
                  │  └── Artist
                  ├──1 Inventory
                  ├──< InventoryMovement
                  ├──< CartItem >── Cart >── Customer
                  ├──< OrderItem >── Order
                  └──< CampaignProduct >── Campaign ──< LandingPage

Order ──< Payment
      ──< InventoryMovement
      ── Campaign        (attribution)
      ── LandingPage     (attribution)

Customer ──< Order
         ──< Cart

PaymentWebhookEvent      (standalone — deliberately not FK'd to Payment)
CustomOrderInquiry, WholesaleInquiry, ContentBlock, Setting  (standalone)
```

### Deletion behaviour

| Relation | On delete | Reason |
|---|---|---|
| `Product.collection` | `SetNull` | Deleting a range must not delete its pieces |
| `Product.artist` | `SetNull` | A maker leaving must not delete their work |
| `ProductImage.product` | `Cascade` | An image has no meaning without its product |
| `OrderItem.product` | `SetNull` | **Orders outlive products.** Name and price are snapshotted on `OrderItem` |
| `Order.customer` | `SetNull` | A deletion request must not destroy financial records |
| `AuditLog.user` | `SetNull` | The trail survives the account |
| `Inventory.product` | `Cascade` | Stock of a deleted product is meaningless |

`OrderItem.productNameSnapshot` and `skuSnapshot` exist because an order
confirmation from 2027 must still say what was bought, even if the product was
renamed or deleted. Historical documents never join to live data.

---

## 3. Order lifecycle — two status columns, never one

`Order.paymentStatus` and `Order.fulfilmentStatus` are independent columns. A
paid order that has not shipped and an unpaid order being produced on trust are
both real states, and a single `status` enum cannot express them.

```
PAYMENT                                FULFILMENT
──────────────────────────────         ─────────────────────────────────────
UNPAID                                 PENDING
  │ payment initiated                    │
  ▼                                      ├── stock item ──► PROCESSING
PENDING                                  │                     │
  │ ┌── provider declines ──► FAILED     └── made to order ──► IN_PRODUCTION
  │ │                                                           │
  ▼ │  server-side verification only                            ▼
PAID ┘                                                        READY
  │                                                             │
  ├──► PARTIALLY_REFUNDED                            ┌──────────┴──────────┐
  └──► REFUNDED                                      ▼                     ▼
                                                  SHIPPED             COLLECTED
                                                     │
                                                     ▼
                                                 DELIVERED

CANCELLED is reachable from any fulfilment state before SHIPPED.
```

**Invariants** (to be enforced in `lib/orders.ts`, Phase 3):

- `fulfilmentStatus` may only leave `PENDING` once `paymentStatus = PAID`, unless
  an admin with `order:write` overrides it — which writes an `AuditLog` row.
- `SHIPPED` requires `fulfilmentMethod = DELIVERY`; `COLLECTED` requires
  `COLLECTION`.
- `DELIVERED` and `COLLECTED` are terminal. `CANCELLED` after `SHIPPED` is not a
  cancellation, it is a return, and gets a `RETURN` inventory movement.
- Reaching `PAID` triggers `commitReservation()` for every stock-backed item.
- Reaching `CANCELLED` or `FAILED` triggers `releaseReservation()`.

### Which items need production

`OrderItem.requiresProduction` is a snapshot taken at checkout, not a lookup of
the product's current availability. A piece sold from stock stays a stock sale
even if the last one sells and the product flips to `MADE_TO_ORDER` an hour
later. `OrderItem.productionStatus` (`PENDING → IN_PRODUCTION → READY`) then
tracks each item, because a mixed order can have one piece on the shelf and
another six weeks out.

---

## 4. Payment lifecycle — append-only

`Payment` rows are never updated in place. Each attempt and each transition is a
new row, so the true history is always reconstructable:

```
Order created
  └─ Payment(status=PENDING, provider="…", idempotencyKey=…)
       ├─ verification fails ─► Payment(status=FAILED, rawPayload=…)
       │                        (customer retries → another PENDING row)
       └─ verification succeeds ─► Payment(status=PAID, verifiedAt=NOW())
                                     └─ later ─► Payment(status=REFUNDED)
```

`Order.paymentStatus` is a denormalised read model of those rows, written only by
the server-side verification path.

**Never trusted:** anything the browser says about payment. The only transition
into `PAID` is a server-side call to the provider, and `verifiedAt` is set at
that moment and nowhere else.

`PaymentWebhookEvent` is deliberately *not* foreign-keyed to `Payment`. Inbound
webhooks arrive duplicated, out of order, and occasionally malformed or forged. A
raw log with a unique `idempotencyKey` lets a callback be recorded and rejected
without ever corrupting the payment record. Processing sets `processedAt`; a
replayed webhook with a key already present is a no-op.

**No provider is hard-coded.** `Payment.provider` is a string validated at the
application layer against an allow-list in code, so adding a provider is a code
change, not a migration.

---

## 5. Inventory lifecycle

```
              adjustStock(+n)                  adjustStock(-n)
                    │                                │
                    ▼                                ▼
              ┌──────────────────────────────────────────┐
              │  onHand                                  │
              │  reserved                                │
              │  available = onHand - reserved (DERIVED)  │
              └──────────────────────────────────────────┘
                    ▲                                │
   releaseReservation│                                │ reserveStock
      (cancel/fail)  │                                ▼
                     └──────────────────  reserved += qty
                                                      │
                                          commitReservation
                                        (payment verified)
                                                      ▼
                                    onHand -= qty AND reserved -= qty
```

`available` is never stored. Every movement writes an `InventoryMovement` row, so
the ledger explains the balance.

**Overselling is prevented by the database, not by application logic.** Every
reservation is a conditional UPDATE:

```sql
UPDATE "Inventory" SET reserved = reserved + $qty
 WHERE productId = $id AND onHand - reserved >= $qty
```

Postgres evaluates the predicate under a row lock, so two simultaneous checkouts
for the last piece cannot both succeed — one gets `0 rows affected` and raises
`InsufficientStockError`. A read-then-write would let both pass their check
before either wrote. A `CHECK (reserved <= onHand)` constraint is the backstop.

---

## 6. Product lifecycle

```
    import from source documents
                │
                ▼
          CATALOGUE ◄──────────────┐
       (availability = null)       │ unpublish
                │                  │
     publish (needs price +        │
      at least one image)          │
                ▼                  │
           PUBLISHED ──────────────┘
        availability ∈ {IN_STOCK, LOW_STOCK, OUT_OF_STOCK,
                        MADE_TO_ORDER, CUSTOM_ONLY, COMING_SOON}
                │
                │ archive
                ▼
            ARCHIVED  (retained for reference; excluded from public queries)
```

`IN_STOCK`, `LOW_STOCK` and `OUT_OF_STOCK` are *derived* from the inventory row
by `deriveAvailability()`. `MADE_TO_ORDER`, `CUSTOM_ONLY` and `COMING_SOON` are
business decisions the admin sets, and stock arithmetic must not overwrite them —
which is exactly what `deriveAvailability()` checks first.

`ARCHIVED` is not a soft delete. Nothing in this schema hard-deletes a product
that has ever been ordered; the FK is `SetNull` precisely so that archiving is
always the right move.

---

## 7. Custom order lifecycle

```
NEW ─► REVIEWING ─► QUOTED ─► APPROVED ─► PAYMENT ─► IN_PRODUCTION
                       │          │                        │
                       │          └──► CLOSED (declined)   ▼
                       └──► CLOSED (no response)       COMPLETED
                                                            │
                                                            ▼
                                                        DELIVERED ─► CLOSED
```

Separate from `Order` on purpose. A commission has no price until someone quotes
it, no product until it is made, and no stock at any point. Forcing it through
the e-commerce tables would mean inventing a `Product` row for every enquiry.

`WholesaleInquiry` follows a shorter version (`NEW → REVIEWING → QUOTED →
APPROVED → CLOSED`) with no production tracking, because a wholesale deal
becomes a normal order once terms are agreed. **No wholesale pricing is
modelled** — the brief said not to assume it, so there is no discount column to
guess at.

---

## 8. Indexes

Every `@@index` earns its place against a query the application actually runs:

| Index | Query it serves |
|---|---|
| `Product(lifecycleStage)` | public shop listing |
| `Product(availability)` | filtering by stock state |
| `Product(collectionId)` | collection detail page |
| `Product(featured)` | homepage |
| `Collection(status)`, `Collection(featured)` | published/featured ranges |
| `Order(paymentStatus)`, `Order(fulfilmentStatus)` | admin order queues |
| `Order(createdAt)` | admin list, newest first |
| `AuditLog(entityType, entityId)` | "history of this order" |
| `InventoryMovement(productId)` | stock ledger for one piece |

Indexes that merely duplicated a `UNIQUE` constraint were **removed** — Postgres
already indexes unique columns, and the duplicate only costs write throughput.
That affected `Collection.slug`, `Product.slug`, `Campaign.slug`,
`LandingPage.slug`, `Order.orderNumber`, `Customer.email`, `ContentBlock.key` and
`Inventory.productId`.

Two partial indexes live in `prisma/sql/0002_constraints.sql` because Prisma
cannot express a `WHERE` clause: one unique index enforcing a single primary
image per product, and one covering the low-stock alert query.

---

## 9. Auth tables: what is deliberately absent

There is no `Account`, `Session` or `VerificationToken` table. Phase 1 admin
identity lives in our own `User` table with a bcrypt hash, and sessions are JWTs,
so the Auth.js adapter tables would be dead weight.

They will be needed in Phase 3 for customer accounts. The migration is additive —
`Customer` and `User` are separate models precisely so that customer identity can
gain OAuth without touching admin auth.

The cost of JWT sessions is that a token stays valid until it expires, so
deactivating a user would not take effect immediately. `lib/session.ts`
compensates by re-reading the `User` row on every admin request and treating the
database — never the token — as authoritative for `role` and `isActive`. That is
one indexed primary-key lookup per request, which is the right price for
immediate revocation.
