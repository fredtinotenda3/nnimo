import { Decimal, type DecimalLike } from "@/lib/money";
import { DeliveryQuoteStatus, FulfilmentMethod } from "@/lib/generated/prisma/enums";

export type DeliveryQuote = {
  fulfilmentMethod: FulfilmentMethod;
  shippingTotal: Decimal;
  deliveryFeeStatus: DeliveryQuoteStatus;
};

export function quoteDelivery(method: FulfilmentMethod): DeliveryQuote {
  if (method === FulfilmentMethod.COLLECTION) {
    return {
      fulfilmentMethod: method,
      shippingTotal: new Decimal(0),
      deliveryFeeStatus: DeliveryQuoteStatus.NOT_REQUIRED,
    };
  }
  return {
    fulfilmentMethod: method,
    shippingTotal: new Decimal(0),
    deliveryFeeStatus: DeliveryQuoteStatus.PENDING_QUOTE,
  };
}

export const DELIVERY_METHOD_LABEL: Record<FulfilmentMethod, string> = {
  COLLECTION: "Collect from the Nnino studio",
  DELIVERY: "Deliver to an address",
};

export const DELIVERY_FEE_STATUS_LABEL: Record<DeliveryQuoteStatus, string> = {
  NOT_REQUIRED: "No delivery fee — collection",
  PENDING_QUOTE: "Delivery fee to be confirmed by the studio",
  QUOTED: "Delivery fee confirmed",
};

export function deliveryLineLabel(status: DeliveryQuoteStatus, shippingTotal: DecimalLike): string {
  if (status === DeliveryQuoteStatus.NOT_REQUIRED) return "Free — collection";
  if (status === DeliveryQuoteStatus.PENDING_QUOTE) return "To be confirmed";
  return shippingTotal.toString();
}

export type DeliveryAddressInput = {
  address: string;
  city: string;
  country: string;
  notes?: string | null;
};

export function buildDeliveryAddressJson(input: DeliveryAddressInput) {
  return {
    address: input.address.trim(),
    city: input.city.trim(),
    country: input.country.trim(),
    notes: input.notes?.trim() || null,
  };
}