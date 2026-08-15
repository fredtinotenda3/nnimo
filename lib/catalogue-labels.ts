import type { ProductAvailability } from "@/lib/generated/prisma/enums";

export const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  IN_STOCK: "Available now",
  LOW_STOCK: "Only a few left",
  OUT_OF_STOCK: "Currently unavailable",
  MADE_TO_ORDER: "Made to order",
  CUSTOM_ONLY: "By commission",
  COMING_SOON: "Coming soon",
};

export function availabilityLabel(value: ProductAvailability | null): string | null {
  return value ? AVAILABILITY_LABEL[value] : null;
}