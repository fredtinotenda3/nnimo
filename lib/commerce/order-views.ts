import type {
  OrderFulfilmentStatus,
  OrderPaymentStatus,
} from "@/lib/generated/prisma/enums";

/**
 * Shapes for the order rows the admin and confirmation pages select.
 *
 * Declared once here rather than inferred at each call site: Prisma's `select`
 * inference is precise but verbose to restate, and these three screens must
 * agree about what an order looks like. `MoneyValue` is the structural form of
 * a Prisma Decimal — anything with a faithful toString() — which is all
 * lib/commerce/money needs to parse it exactly.
 */
export type MoneyValue = { toString(): string };

export type OrderItemView = {
  id: string;
  productNameSnapshot: string;
  skuSnapshot: string | null;
  quantity: number;
  unitPrice: MoneyValue;
  lineTotal: MoneyValue;
  requiresProduction: boolean;
  productId?: string | null;
};

export type PaymentView = {
  id: string;
  provider: string;
  providerRef: string | null;
  status: string;
  amount: MoneyValue;
  currency: string;
  createdAt: Date;
  verifiedAt: Date | null;
};

export type OrderSummaryView = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  currency: string;
  total: MoneyValue;
  paymentStatus: OrderPaymentStatus;
  fulfilmentStatus: OrderFulfilmentStatus;
  guestName: string | null;
  guestEmail: string | null;
  customer: { name: string; email: string } | null;
  _count: { items: number };
};

export type OrderDetailView = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  paidAt: Date | null;
  confirmedAt: Date | null;
  readyAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  currency: string;
  subtotal: MoneyValue;
  shippingTotal: MoneyValue;
  total: MoneyValue;
  paymentStatus: OrderPaymentStatus;
  fulfilmentStatus: OrderFulfilmentStatus;
  fulfilmentMethod: "DELIVERY" | "COLLECTION" | null;
  deliveryQuoteStatus: "NOT_REQUIRED" | "PENDING_QUOTE" | "QUOTED";
  deliveryAddress: unknown;
  trackingRef: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  campaign: { id: string; name: string } | null;
  landingPage: { id: string; title: string } | null;
  customer: { id: string; name: string; email: string; phone: string | null } | null;
  items: OrderItemView[];
  payments: PaymentView[];
};

export type AuditEntryView = {
  id: string;
  action: string;
  createdAt: Date;
  metadata: unknown;
};
