/**
 * Result models shared by the analytics query layer and the pages that render
 * them.
 *
 * Deliberately free of database imports so the UI, the pure calculators and the
 * unit tests can all name the same shapes. Money is carried as integer cents
 * (see lib/commerce/money.ts) with its currency attached — never as a bare
 * number, because a bare number is exactly what makes cross-currency addition
 * easy to do by accident.
 */

import type { Bucket, Granularity, ResolvedRange } from "@/lib/analytics/range";

/** Payment statuses that represent money actually received. */
export const SETTLED_PAYMENT_STATUSES = ["PAID", "PARTIALLY_REFUNDED"] as const;

/**
 * A monetary total in exactly one currency.
 *
 * There is no combined-total type on purpose. If the studio ever takes money in
 * two currencies, the only honest presentation is two rows.
 */
export type CurrencyTotal = {
  currency: string;
  cents: number;
  /** Orders (or lines) contributing to `cents`. */
  count: number;
};

/**
 * Money split by currency, with one currency singled out as the one the
 * headline figures are quoted in.
 */
export type CurrencySegmentation = {
  reportingCurrency: string;
  /** Always present. Zeroed rather than absent when there is nothing to show. */
  primary: CurrencyTotal;
  /** Every other currency, biggest first. Empty in the normal single-currency case. */
  others: CurrencyTotal[];
  isMixed: boolean;
  /** Orders excluded from `primary` because they are denominated elsewhere. */
  excludedCount: number;
};

export type TrendUnavailableReason =
  | "no_comparison"
  | "zero_base"
  | "currency_mismatch"
  | "unbounded_range";

/**
 * A period-on-period change.
 *
 * `direction: "none"` carries a reason so the UI can say why there is no
 * arrow instead of rendering a misleading zero. A dashboard that shows "0%"
 * when it means "we have nothing to compare against" is lying quietly.
 */
export type Trend = {
  direction: "up" | "down" | "flat" | "none";
  /** Percentage change to one decimal place. Null when direction is "none". */
  percent: number | null;
  reason: TrendUnavailableReason | null;
};

export type SeriesPoint = {
  key: string;
  label: string;
  /** Money in the series currency, in cents. */
  cents: number;
  count: number;
};

export type Series = {
  granularity: Granularity;
  currency: string;
  points: SeriesPoint[];
  /**
   * True when the points were not gap-filled — only for `all_time`, which has
   * no start date to enumerate buckets from.
   */
  ungapped: boolean;
};

/**
 * How much of a population a figure actually covers.
 *
 * Attached to any metric computed over a subset, so the UI can say "valued
 * across 9 of 369 pieces" rather than presenting a partial number as a total.
 * This is the type that keeps the incomplete Nnino catalogue honest.
 */
export type Coverage = {
  covered: number;
  total: number;
  /** 0–1, or null when `total` is 0. */
  ratio: number | null;
};

export type StatusCount = {
  status: string;
  label: string;
  count: number;
};

export type SalesKpis = {
  ordersPlaced: number;
  ordersSettled: number;
  ordersAwaitingPayment: number;
  ordersPaymentPending: number;
  ordersFailed: number;
  ordersCancelled: number;
  revenue: CurrencySegmentation;
  averageOrderValue: CurrencyTotal;
  revenueTrend: Trend;
  ordersTrend: Trend;
};

export type ProductPerformanceRow = {
  productId: string | null;
  name: string;
  slug: string | null;
  quantity: number;
  cents: number;
  /** Share of the currency-scoped revenue total, 0–1. Null when total is 0. */
  share: number | null;
};

export type CollectionPerformanceRow = {
  collectionId: string | null;
  name: string;
  slug: string | null;
  quantity: number;
  cents: number;
  share: number | null;
};

export type CatalogueComposition = {
  published: number;
  catalogueOnly: number;
  archived: number;
  priced: number;
  priceOnRequest: number;
  publishedWithoutPrice: number;
  withoutImages: number;
  total: number;
  pricedCoverage: Coverage;
};

export type CustomerKpis = {
  totalCustomers: number;
  newCustomers: number;
  customersWithSettledOrders: number;
  returningCustomers: number;
  /** Orders per customer who has ordered, to two decimal places. */
  ordersPerCustomer: number | null;
  averageCustomerValue: CurrencyTotal;
  ordersWithoutCustomer: number;
};

export type CustomerRow = {
  customerId: string | null;
  name: string;
  email: string | null;
  orders: number;
  cents: number;
};

/**
 * Inventory, with "not counted" as a first-class state.
 *
 * `productsWithoutRecord` is not the same as out of stock. Nnino has not
 * counted its studio stock yet, so nearly every piece has no Inventory row at
 * all — reporting those as zero on hand would be a fabricated number dressed
 * as a measurement.
 */
export type InventoryKpis = {
  trackedProducts: number;
  productsWithoutRecord: number;
  onHand: number;
  reserved: number;
  available: number;
  lowStock: number;
  outOfStock: number;
  /** One entry per currency in which stock could be valued. */
  value: CurrencyTotal[];
  valuationCoverage: Coverage;
};

export type EnquiryKpis = {
  totalCustomOrders: number;
  newCustomOrders: number;
  openCustomOrders: number;
  quotedCustomOrders: number;
  progressedCustomOrders: number;
  totalWholesale: number;
  newWholesale: number;
  statusDistribution: StatusCount[];
};

export type OperationsWorklist = {
  unpaidOrders: OrderLine[];
  awaitingFulfilment: OrderLine[];
  recentlyCompleted: OrderLine[];
  productsNeedingAttention: {
    id: string;
    name: string;
    slug: string;
    issues: string[];
  }[];
};

export type OrderLine = {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: Date;
  cents: number;
  currency: string;
  paymentStatus: string;
  fulfilmentStatus: string;
};

/** What the analytics pages need to render a range picker and its footnotes. */
export type AnalyticsHeader = {
  range: ResolvedRange;
  buckets: Bucket[];
  granularity: Granularity;
  reportingCurrency: string;
  /** Currencies actually present in settled orders, reporting currency first. */
  availableCurrencies: string[];
};

/**
 * A caveat to render beside a figure.
 *
 * The brief requires limitations to be explained in the UI rather than papered
 * over. Making them data rather than hard-coded copy means the same limitation
 * is stated identically everywhere it applies, and disappears on its own once
 * the underlying data arrives.
 */
export type DataNote = {
  id: string;
  severity: "info" | "warning";
  message: string;
};
