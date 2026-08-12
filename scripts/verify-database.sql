-- ===========================================================================
-- Phase 3 database verification
--
--   psql "$DIRECT_DATABASE_URL" -f scripts/verify-database.sql
--
-- Read-only. Prints one row per required object with PRESENT or *** MISSING ***.
-- Every MISSING row is something the application depends on.
-- ===========================================================================

\echo '=== Order-number sequence (0003) — REQUIRED, checkout fails without it ==='
SELECT
  'nnino_order_number_seq' AS object,
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname = 'nnino_order_number_seq' AND relkind = 'S')
       THEN 'PRESENT' ELSE '*** MISSING ***' END AS status;

\echo ''
\echo '=== CHECK constraints (0002 + 0003) ==='
WITH required(name) AS (
  VALUES
    ('inventory_on_hand_non_negative'),
    ('inventory_reserved_non_negative'),
    ('inventory_reserved_within_on_hand'),
    ('inventory_threshold_non_negative'),
    ('product_price_non_negative'),
    ('order_subtotal_non_negative'),
    ('order_shipping_non_negative'),
    ('order_total_non_negative'),
    ('order_item_quantity_positive'),
    ('order_item_unit_price_non_negative'),
    ('order_item_line_total_non_negative'),
    ('payment_amount_non_negative'),
    ('cart_item_quantity_positive'),
    ('product_height_positive'),
    ('product_width_positive'),
    ('product_weight_positive'),
    ('product_lead_time_positive'),
    ('campaign_dates_ordered'),
    ('order_has_contact'),
    ('order_total_is_subtotal_plus_shipping'),
    ('order_delivery_has_address'),
    ('order_collection_has_no_shipping'),
    ('order_pending_quote_has_no_fee')
)
SELECT
  required.name AS constraint_name,
  CASE WHEN c.conname IS NULL THEN '*** MISSING ***' ELSE 'PRESENT' END AS status
FROM required
LEFT JOIN pg_constraint c ON c.conname = required.name
ORDER BY status DESC, constraint_name;

\echo ''
\echo '=== Indexes (0002) ==='
WITH required(name) AS (
  VALUES ('product_image_single_primary'), ('inventory_low_stock')
)
SELECT
  required.name AS index_name,
  CASE WHEN i.indexname IS NULL THEN '*** MISSING ***' ELSE 'PRESENT' END AS status
FROM required
LEFT JOIN pg_indexes i ON i.indexname = required.name;

\echo ''
\echo '=== Phase 3 columns and enum values ==='
SELECT 'Order.accessToken' AS object,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'Order' AND column_name = 'accessToken')
            THEN 'PRESENT' ELSE '*** MISSING ***' END AS status
UNION ALL
SELECT 'Order.cartId',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'Order' AND column_name = 'cartId')
            THEN 'PRESENT' ELSE '*** MISSING ***' END
UNION ALL
SELECT 'Order.deliveryQuoteStatus',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'Order' AND column_name = 'deliveryQuoteStatus')
            THEN 'PRESENT' ELSE '*** MISSING ***' END
UNION ALL
SELECT 'Order.paidAt / confirmedAt / readyAt',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                  WHERE table_name = 'Order'
                    AND column_name IN ('paidAt', 'confirmedAt', 'readyAt')) = 3
            THEN 'PRESENT' ELSE '*** MISSING ***' END
UNION ALL
SELECT 'OrderFulfilmentStatus.CONFIRMED',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'OrderFulfilmentStatus' AND e.enumlabel = 'CONFIRMED')
            THEN 'PRESENT' ELSE '*** MISSING ***' END;

\echo ''
\echo '=== Commercial data sanity (no invented values) ==='
SELECT
  count(*) FILTER (WHERE "price" IS NOT NULL) AS pieces_with_verified_price,
  count(*) FILTER (WHERE "price" IS NULL)     AS pieces_awaiting_price,
  count(*) FILTER (WHERE "lifecycleStage" = 'PUBLISHED') AS published,
  count(*) AS total_catalogue
FROM "Product";

SELECT count(*) AS inventory_rows FROM "Inventory";
