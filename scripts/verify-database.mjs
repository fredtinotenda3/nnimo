/**
 * Phase 3 database verification.
 *
 *   npm run db:verify
 *
 * Read-only. Reports whether every object the commerce engine depends on is
 * actually present in the database.
 *
 * Uses the `pg` driver already in dependencies rather than shelling out to
 * `psql`, so it works on Windows without a Postgres client install. The
 * equivalent psql script is scripts/verify-database.sql.
 */
import { Client } from "pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_DATABASE_URL / DATABASE_URL is not set. Run via `npm run db:verify`.");
  process.exit(1);
}

const CHECK_CONSTRAINTS = [
  "inventory_on_hand_non_negative",
  "inventory_reserved_non_negative",
  "inventory_reserved_within_on_hand",
  "inventory_threshold_non_negative",
  "product_price_non_negative",
  "order_subtotal_non_negative",
  "order_shipping_non_negative",
  "order_total_non_negative",
  "order_item_quantity_positive",
  "order_item_unit_price_non_negative",
  "order_item_line_total_non_negative",
  "payment_amount_non_negative",
  "cart_item_quantity_positive",
  "product_height_positive",
  "product_width_positive",
  "product_weight_positive",
  "product_lead_time_positive",
  "campaign_dates_ordered",
  "order_has_contact",
  "order_total_is_subtotal_plus_shipping",
  "order_delivery_has_address",
  "order_collection_has_no_shipping",
  "order_pending_quote_has_no_fee",
];

const INDEXES = [
  "product_image_single_primary",
  "inventory_low_stock",
  // Phase 5 — reconciliation support.
  "payment_webhook_event_unprocessed",
  "payment_provider_ref_idx",
  // Phase 7 — revenue is measured on paidAt, which nothing else indexes.
  "order_settled_paid_at",
];
const ORDER_COLUMNS = ["accessToken", "cartId", "deliveryQuoteStatus", "paidAt", "confirmedAt", "readyAt"];

const client = new Client({ connectionString: url });
let missing = 0;

const report = (label, ok, note = "") => {
  if (!ok) missing += 1;
  console.log(`  ${ok ? "OK      " : "MISSING "} ${label}${note ? `  ${note}` : ""}`);
};

try {
  await client.connect();

  console.log("\nOrder-number sequence (0003) — checkout fails without it");
  const seq = await client.query(
    "SELECT 1 FROM pg_class WHERE relname = 'nnino_order_number_seq' AND relkind = 'S'",
  );
  report("nnino_order_number_seq", seq.rowCount > 0);

  console.log("\nCHECK constraints (0002 + 0003)");
  const cons = await client.query("SELECT conname FROM pg_constraint WHERE conname = ANY($1)", [
    CHECK_CONSTRAINTS,
  ]);
  const present = new Set(cons.rows.map((r) => r.conname));
  for (const name of CHECK_CONSTRAINTS) report(name, present.has(name));

  console.log("\nIndexes (0002)");
  const idx = await client.query("SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)", [INDEXES]);
  const idxPresent = new Set(idx.rows.map((r) => r.indexname));
  for (const name of INDEXES) report(name, idxPresent.has(name));

  console.log("\nPhase 3 schema");
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Order' AND column_name = ANY($1)`,
    [ORDER_COLUMNS],
  );
  const colPresent = new Set(cols.rows.map((r) => r.column_name));
  for (const name of ORDER_COLUMNS) report(`Order.${name}`, colPresent.has(name));

  const enumValue = await client.query(
    `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'OrderFulfilmentStatus' AND e.enumlabel = 'CONFIRMED'`,
  );
  report("OrderFulfilmentStatus.CONFIRMED", enumValue.rowCount > 0);

  // Commercial-data sanity. These are counts, not assertions: the point is that
  // unpriced pieces stay unpriced and no stock has been invented.
  console.log("\nCommercial data (nothing here should be fabricated)");
  const data = await client.query(`
    SELECT
      count(*) FILTER (WHERE "price" IS NOT NULL) AS priced,
      count(*) FILTER (WHERE "price" IS NULL)     AS unpriced,
      count(*) FILTER (WHERE "lifecycleStage" = 'PUBLISHED') AS published,
      count(*) AS total
    FROM "Product"
  `);
  const row = data.rows[0];
  console.log(
    `  ${row.priced} of ${row.total} pieces have a verified price; ${row.unpriced} awaiting the studio; ${row.published} published`,
  );

  const inv = await client.query('SELECT count(*) AS n FROM "Inventory"');
  console.log(`  ${inv.rows[0].n} inventory rows (expected 0 until real stock is counted)`);

  const orders = await client.query('SELECT count(*) AS n FROM "Order"');
  console.log(`  ${orders.rows[0].n} orders`);

  console.log(
    missing === 0
      ? "\nAll required database objects are present.\n"
      : `\n${missing} required object(s) MISSING. Apply prisma/sql/0002_constraints.sql and prisma/sql/0003_order_number_sequence.sql.\n`,
  );
  process.exitCode = missing === 0 ? 0 : 1;
} catch (error) {
  console.error("\nVerification could not run:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
