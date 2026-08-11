-- ===========================================================================
-- Constraints Prisma cannot express in schema.prisma.
--
-- Apply once, immediately after the initial migration:
--   psql "$DIRECT_DATABASE_URL" -f prisma/sql/0002_constraints.sql
--
-- Or (preferred) paste the statements into the generated migration file so they
-- travel with `prisma migrate deploy` and run automatically on every
-- environment. Keeping them in a separate file that someone must remember to
-- run is how production ends up without them.
-- ===========================================================================

-- 1. Inventory arithmetic can never go negative or over-reserve.
--    lib/inventory.ts already guards every write with a conditional UPDATE;
--    these are the backstop for anything that bypasses it — a manual psql
--    session, a future code path, a bug.
ALTER TABLE "Inventory"
  ADD CONSTRAINT "inventory_on_hand_non_negative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_reserved_within_on_hand" CHECK ("reserved" <= "onHand"),
  ADD CONSTRAINT "inventory_threshold_non_negative" CHECK ("lowStockThreshold" >= 0);

-- 2. Money is never negative.
ALTER TABLE "Product"
  ADD CONSTRAINT "product_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "order_subtotal_non_negative" CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "order_shipping_non_negative" CHECK ("shippingTotal" >= 0),
  ADD CONSTRAINT "order_total_non_negative" CHECK ("total" >= 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "order_item_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_item_unit_price_non_negative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "order_item_line_total_non_negative" CHECK ("lineTotal" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "cart_item_quantity_positive" CHECK ("quantity" > 0);

-- 3. Exactly one primary image per product.
--    A partial unique index is the only way to say "unique among the rows where
--    isPrimary is true". Prisma's @@unique cannot express the WHERE clause, and
--    @@unique([productId, isPrimary]) would wrongly forbid a second non-primary
--    image.
CREATE UNIQUE INDEX "product_image_single_primary"
  ON "ProductImage" ("productId")
  WHERE "isPrimary" = true;

-- 4. Physical measurements are positive when recorded.
ALTER TABLE "Product"
  ADD CONSTRAINT "product_height_positive" CHECK ("heightCm" IS NULL OR "heightCm" > 0),
  ADD CONSTRAINT "product_width_positive" CHECK ("widthCm" IS NULL OR "widthCm" > 0),
  ADD CONSTRAINT "product_weight_positive" CHECK ("weightKg" IS NULL OR "weightKg" > 0),
  ADD CONSTRAINT "product_lead_time_positive"
    CHECK ("productionLeadTimeDays" IS NULL OR "productionLeadTimeDays" > 0);

-- 5. A campaign's window must make sense.
ALTER TABLE "Campaign"
  ADD CONSTRAINT "campaign_dates_ordered"
    CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");

-- 6. An order must identify its customer somehow: either a Customer row or
--    guest contact details. Neither means nobody can be told their piece shipped.
ALTER TABLE "Order"
  ADD CONSTRAINT "order_has_contact"
    CHECK ("customerId" IS NOT NULL OR "guestEmail" IS NOT NULL);

-- 7. Speed up the two queries the admin runs constantly: low-stock alerts and
--    the audit trail for one entity. Partial index keeps it small.
CREATE INDEX "inventory_low_stock"
  ON "Inventory" ("productId")
  WHERE "onHand" - "reserved" <= "lowStockThreshold";
