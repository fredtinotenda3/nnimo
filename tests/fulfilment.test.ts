import { describe, expect, it } from "vitest";
import {
  FULFILMENT_LABEL,
  FULFILMENT_TRANSITIONS,
  canTransitionFulfilment,
  customerFacingStatus,
  isPaid,
} from "@/lib/commerce/fulfilment";

describe("fulfilment state machine", () => {
  it("follows the approved happy path", () => {
    const path = ["PENDING", "CONFIRMED", "IN_PRODUCTION", "READY", "SHIPPED", "DELIVERED"] as const;
    path.forEach((from, index) => {
      const to = path[index + 1];
      if (!to) return;
      expect(canTransitionFulfilment(from, to)).toBe(true);
    });
  });

  it("supports the collection path", () => {
    expect(canTransitionFulfilment("READY", "COLLECTED")).toBe(true);
  });

  it("refuses to skip backwards", () => {
    expect(canTransitionFulfilment("READY", "PENDING")).toBe(false);
    expect(canTransitionFulfilment("DELIVERED", "READY")).toBe(false);
  });

  it("refuses to jump straight from PENDING to dispatched", () => {
    expect(canTransitionFulfilment("PENDING", "SHIPPED")).toBe(false);
  });

  it("treats delivered, collected and cancelled as terminal", () => {
    for (const status of ["DELIVERED", "COLLECTED", "CANCELLED"] as const) {
      expect(FULFILMENT_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it("allows cancellation up to dispatch but not after", () => {
    for (const status of ["PENDING", "CONFIRMED", "IN_PRODUCTION", "READY"] as const) {
      expect(canTransitionFulfilment(status, "CANCELLED")).toBe(true);
    }
    expect(canTransitionFulfilment("SHIPPED", "CANCELLED")).toBe(false);
  });

  it("labels every state, so the UI can never render a raw enum", () => {
    for (const status of Object.keys(FULFILMENT_TRANSITIONS)) {
      expect(FULFILMENT_LABEL[status as keyof typeof FULFILMENT_LABEL]).toBeTruthy();
    }
  });

  it("presents SHIPPED as Dispatched without renaming the stored value", () => {
    expect(FULFILMENT_LABEL.SHIPPED).toBe("Dispatched");
  });
});

describe("payment helpers", () => {
  it("counts a partially refunded order as still paid", () => {
    expect(isPaid("PAID")).toBe(true);
    expect(isPaid("PARTIALLY_REFUNDED")).toBe(true);
    expect(isPaid("UNPAID")).toBe(false);
    expect(isPaid("PENDING")).toBe(false);
    expect(isPaid("FAILED")).toBe(false);
  });

  it("gives a customer-facing sentence for every combination it is asked for", () => {
    const message = customerFacingStatus({
      paymentStatus: "UNPAID",
      fulfilmentStatus: "PENDING",
    });
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });
});
