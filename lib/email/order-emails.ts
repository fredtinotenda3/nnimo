import "server-only";
import { BRAND, whatsappLink } from "@/lib/brand";
import { sendEmail } from "@/lib/email";
import type { OrderEmailKind } from "@/lib/email/types";

export type OrderEmailContext = {
  orderNumber: string;
  accessToken: string;
  customerName: string;
  customerEmail: string;
  totalLabel: string;
  currency: string;
  fulfilmentMethod: "DELIVERY" | "COLLECTION" | null;
  deliveryPendingQuote: boolean;
  lines: { name: string; quantity: number; lineTotalLabel: string }[];
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function orderUrl(context: OrderEmailContext): string {
  // The token, not the order number: order numbers are sequential and therefore
  // enumerable. The page reads this from the path segment ([accessToken]), not
  // a query param.
  return `${siteUrl}/orders/${encodeURIComponent(context.accessToken)}`;
}

function itemLines(context: OrderEmailContext): string {
  return context.lines
    .map((line) => `  ${line.quantity} x ${line.name} — ${line.lineTotalLabel}`)
    .join("\n");
}

function signature(): string {
  return [
    "",
    BRAND.name,
    BRAND.addressLines.join(", "),
    `Tel ${BRAND.telephone}`,
    `WhatsApp ${BRAND.whatsapp}`,
    BRAND.emails.general,
  ].join("\n");
}

/**
 * Templates for the seven lifecycle emails.
 *
 * Plain text on purpose at this stage: it renders everywhere, cannot break, and
 * carries no tracking pixels. Delivery is described as "confirmed separately"
 * wherever a fee would normally appear, because no rate card exists.
 */
const TEMPLATES: Record<
  OrderEmailKind,
  (context: OrderEmailContext) => { subject: string; text: string }
> = {
  "order.received": (context) => ({
    subject: `We have your order ${context.orderNumber}`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `Thank you — your order ${context.orderNumber} has reached the studio.`,
      "",
      itemLines(context),
      "",
      `Total: ${context.totalLabel}`,
      context.deliveryPendingQuote
        ? "Delivery is not included in this total. The studio will confirm the delivery cost with you before anything is dispatched."
        : "Collection from the studio, at no charge.",
      "",
      "Payment has not been completed yet. You can pick up where you left off here:",
      orderUrl(context),
      signature(),
    ].join("\n"),
  }),

  "payment.successful": (context) => ({
    subject: `Payment received for ${context.orderNumber}`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `Your payment for order ${context.orderNumber} has been received and verified.`,
      "",
      itemLines(context),
      "",
      `Total paid: ${context.totalLabel}`,
      context.deliveryPendingQuote
        ? "Delivery is charged separately and the studio will confirm it with you."
        : "",
      "",
      "Each piece is made by hand. Where a piece is made to order the studio needs around five to six weeks, depending on drying conditions.",
      "",
      orderUrl(context),
      signature(),
    ].join("\n"),
  }),

  "payment.failed": (context) => ({
    subject: `Payment could not be completed for ${context.orderNumber}`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `The payment for order ${context.orderNumber} did not go through. Nothing has been charged.`,
      "",
      "Your order is being held, so you can try again here:",
      orderUrl(context),
      "",
      `If it keeps failing, message the studio on WhatsApp: ${whatsappLink()}`,
      signature(),
    ].join("\n"),
  }),

  "order.confirmed": (context) => ({
    subject: `Order ${context.orderNumber} confirmed`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `The studio has confirmed order ${context.orderNumber} and work is scheduled.`,
      "",
      itemLines(context),
      "",
      orderUrl(context),
      signature(),
    ].join("\n"),
  }),

  "order.ready": (context) => ({
    subject: `Order ${context.orderNumber} is ready`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `Order ${context.orderNumber} is finished and ready.`,
      "",
      context.fulfilmentMethod === "COLLECTION"
        ? `You can collect it from ${BRAND.addressLines.slice(0, 2).join(", ")}. Please message ahead so someone is expecting you.`
        : "The studio will be in touch to arrange delivery and confirm the delivery cost.",
      "",
      orderUrl(context),
      signature(),
    ].join("\n"),
  }),

  "order.dispatched": (context) => ({
    subject: `Order ${context.orderNumber} has been dispatched`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `Order ${context.orderNumber} is on its way.`,
      "",
      orderUrl(context),
      signature(),
    ].join("\n"),
  }),

  "order.delivered": (context) => ({
    subject: `Order ${context.orderNumber} — delivered`,
    text: [
      `Hello ${context.customerName},`,
      "",
      `Order ${context.orderNumber} has been marked as delivered. We hope you love it.`,
      "",
      "Every piece is hand painted and signed underneath. To keep it that way, wash by hand rather than in a dishwasher.",
      "",
      `If anything is not right, reply to this email or message ${BRAND.whatsapp}.`,
      signature(),
    ].join("\n"),
  }),
};

export async function sendOrderEmail(
  kind: OrderEmailKind,
  context: OrderEmailContext,
): Promise<void> {
  const template = TEMPLATES[kind](context);
  await sendEmail({
    to: context.customerEmail,
    subject: template.subject,
    text: template.text,
    replyTo: BRAND.emails.general,
  });
}

export const ORDER_EMAIL_KINDS = Object.keys(TEMPLATES) as OrderEmailKind[];
