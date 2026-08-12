-- ===========================================================================
-- Phase 3 — order number sequence
--
-- Apply after `npx prisma migrate dev --name phase3_commerce`, or (preferred)
-- paste into the generated migration.sql so it travels with `migrate deploy`.
--
-- A sequence rather than a counter row: nextval() is atomic and lock-free, so
-- two simultaneous checkouts cannot collide and neither has to wait for the
-- other. Gaps (a failed checkout burning a number) are acceptable; reuse is not.
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS nnino_order_number_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- Phase 3 money invariants. The Phase 1 file (0002_constraints.sql) covers
-- Order/OrderItem/Payment amounts; these cover the columns Phase 3 introduced.
ALTER TABLE "Order"
  ADD CONSTRAINT "order_total_is_subtotal_plus_shipping"
    CHECK ("total" = "subtotal" + "shippingTotal");

-- A delivery order must carry an address; a collection order must not claim a
-- delivery fee it never incurred.
ALTER TABLE "Order"
  ADD CONSTRAINT "order_delivery_has_address"
    CHECK ("fulfilmentMethod" IS DISTINCT FROM 'DELIVERY' OR "deliveryAddress" IS NOT NULL),
  ADD CONSTRAINT "order_collection_has_no_shipping"
    CHECK ("fulfilmentMethod" IS DISTINCT FROM 'COLLECTION' OR "shippingTotal" = 0);

-- An unquoted delivery must not have a non-zero fee sitting on it.
ALTER TABLE "Order"
  ADD CONSTRAINT "order_pending_quote_has_no_fee"
    CHECK ("deliveryQuoteStatus" <> 'PENDING_QUOTE' OR "shippingTotal" = 0);
