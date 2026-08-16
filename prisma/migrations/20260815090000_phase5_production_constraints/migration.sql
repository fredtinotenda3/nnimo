-- ============================================================================
-- Phase 5 — production constraints, sequence and reconciliation indexes
-- ============================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- prisma/sql/0002_constraints.sql and prisma/sql/0003_order_number_sequence.sql
-- were written in Phases 1 and 3 with an instruction to paste them into the
-- generated migration. That never happened: neither file's statements appear in
-- 20260810152905_init, 20260812080704_phase3_commerce or
-- 20260813090000_phase4_admin. They were applied by hand to the development
-- database instead.
--
-- The consequence is that `prisma migrate deploy` against a FRESH database —
-- exactly what a first Vercel + Neon production deploy does — produces a schema
-- with no CHECK constraints, no partial unique index on ProductImage, and no
-- `nnino_order_number_seq`. lib/commerce/orders.ts calls
-- `SELECT nextval('nnino_order_number_seq')` inside the checkout transaction, so
-- on that database EVERY CHECKOUT FAILS with "relation does not exist".
--
-- This migration makes the SQL files' contents part of migration history so they
-- travel with the deploy, and `npm run db:verify` passes on a fresh database.
--
-- IDEMPOTENCY
--
-- Every statement is guarded, because this must apply cleanly to BOTH:
--   a) a fresh database, where none of these objects exist, and
--   b) the existing development/production database, where they were applied by
--      hand and already exist.
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so each constraint is wrapped
-- in a DO block that checks pg_constraint first. Indexes use IF NOT EXISTS.
--
-- Nothing here is destructive: no column is dropped, renamed or retyped and no
-- row is deleted. If existing data violated one of these invariants the ALTER
-- would fail loudly, which is the correct outcome — it would mean the data is
-- already wrong.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Order-number sequence (was prisma/sql/0003)
--    Checkout cannot run without this.
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS nnino_order_number_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- ----------------------------------------------------------------------------
-- 2. CHECK constraints (was prisma/sql/0002 + the Phase 3 additions in 0003)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  stmt   text;
  target text;
  cname  text;
  specs  text[][] := ARRAY[
    -- Inventory arithmetic. lib/inventory.ts guards every write with a
    -- conditional UPDATE; these are the backstop for anything that bypasses it.
    ['Inventory',  'inventory_on_hand_non_negative',        '"onHand" >= 0'],
    ['Inventory',  'inventory_reserved_non_negative',       '"reserved" >= 0'],
    ['Inventory',  'inventory_reserved_within_on_hand',     '"reserved" <= "onHand"'],
    ['Inventory',  'inventory_threshold_non_negative',      '"lowStockThreshold" >= 0'],

    -- Money is never negative.
    ['Product',    'product_price_non_negative',            '"price" IS NULL OR "price" >= 0'],
    ['Order',      'order_subtotal_non_negative',           '"subtotal" >= 0'],
    ['Order',      'order_shipping_non_negative',           '"shippingTotal" >= 0'],
    ['Order',      'order_total_non_negative',              '"total" >= 0'],
    ['OrderItem',  'order_item_quantity_positive',          '"quantity" > 0'],
    ['OrderItem',  'order_item_unit_price_non_negative',    '"unitPrice" >= 0'],
    ['OrderItem',  'order_item_line_total_non_negative',    '"lineTotal" >= 0'],
    ['Payment',    'payment_amount_non_negative',           '"amount" >= 0'],
    ['CartItem',   'cart_item_quantity_positive',           '"quantity" > 0'],

    -- Physical measurements are positive when recorded.
    ['Product',    'product_height_positive',               '"heightCm" IS NULL OR "heightCm" > 0'],
    ['Product',    'product_width_positive',                '"widthCm" IS NULL OR "widthCm" > 0'],
    ['Product',    'product_weight_positive',               '"weightKg" IS NULL OR "weightKg" > 0'],
    ['Product',    'product_lead_time_positive',            '"productionLeadTimeDays" IS NULL OR "productionLeadTimeDays" > 0'],

    -- A campaign window must make sense.
    ['Campaign',   'campaign_dates_ordered',                '"startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"'],

    -- An order must identify its customer somehow.
    ['Order',      'order_has_contact',                     '"customerId" IS NOT NULL OR "guestEmail" IS NOT NULL'],

    -- Phase 3 money invariants.
    ['Order',      'order_total_is_subtotal_plus_shipping', '"total" = "subtotal" + "shippingTotal"'],
    ['Order',      'order_delivery_has_address',            '"fulfilmentMethod" IS DISTINCT FROM ''DELIVERY'' OR "deliveryAddress" IS NOT NULL'],
    ['Order',      'order_collection_has_no_shipping',      '"fulfilmentMethod" IS DISTINCT FROM ''COLLECTION'' OR "shippingTotal" = 0'],
    ['Order',      'order_pending_quote_has_no_fee',        '"deliveryQuoteStatus" <> ''PENDING_QUOTE'' OR "shippingTotal" = 0']
  ];
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    target := specs[i][1];
    cname  := specs[i][2];

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
      stmt := format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)',
        target, cname, specs[i][3]
      );
      EXECUTE stmt;
    END IF;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. Partial indexes Prisma cannot express (was prisma/sql/0002)
--
--    A partial unique index is the only way to say "unique among the rows where
--    isPrimary is true". @@unique([productId, isPrimary]) would wrongly forbid a
--    second non-primary image.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "product_image_single_primary"
  ON "ProductImage" ("productId")
  WHERE "isPrimary" = true;

CREATE INDEX IF NOT EXISTS "inventory_low_stock"
  ON "Inventory" ("productId")
  WHERE "onHand" - "reserved" <= "lowStockThreshold";

-- ----------------------------------------------------------------------------
-- 4. Phase 5 additions — reconciliation and webhook sweep support.
--
--    Two operational queries introduced in Phase 5 that would otherwise be
--    sequential scans:
--
--    a) The webhook replay sweep looks for authenticated events that were
--       recorded but never processed (processedAt IS NULL). A partial index
--       keeps it to the handful of rows that are actually stuck.
--    b) Payment reconciliation lists payments by provider reference when
--       matching a provider's settlement report against our records. Without
--       this, reconciling a day of payments scans the whole table.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "payment_webhook_event_unprocessed"
  ON "PaymentWebhookEvent" ("createdAt")
  WHERE "processedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "payment_provider_ref_idx"
  ON "Payment" ("provider", "providerRef");
