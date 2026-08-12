"use client";

import { useActionState } from "react";
import { transitionOrderAction, type AdminActionState } from "@/app/admin/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: AdminActionState = { error: null };

/**
 * Only transitions the state machine actually permits are offered. The server
 * re-checks anyway — the filtered list is a courtesy, not the control.
 */
export function OrderStatusForm({
  orderId,
  allowed,
  labels,
  needsTracking,
  warnUnpaid,
}: {
  orderId: string;
  allowed: string[];
  labels: Record<string, string>;
  needsTracking: boolean;
  warnUnpaid: boolean;
}) {
  const [state, formAction, pending] = useActionState(transitionOrderAction, INITIAL);

  if (allowed.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        This order has reached a final state. No further changes are possible.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <Label htmlFor="to">Move to</Label>
        <select
          id="to"
          name="to"
          className="text-body-sm mt-2 h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground"
        >
          {allowed.map((status) => (
            <option key={status} value={status}>
              {labels[status] ?? status}
            </option>
          ))}
        </select>
      </div>

      {needsTracking ? (
        <div>
          <Label htmlFor="trackingRef">Tracking reference</Label>
          <Input id="trackingRef" name="trackingRef" className="mt-2" />
          <p className="text-metadata mt-1.5 text-muted-foreground">
            Optional — recorded on the order if supplied.
          </p>
        </div>
      ) : null}

      {warnUnpaid ? (
        <p className="text-body-sm border-l-2 border-ochre pl-3 text-muted-foreground">
          This order is not paid. Moving it forward is allowed but will be recorded
          in the audit log as an unpaid advance.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Updating…" : "Update status"}
        </Button>
      </div>
    </form>
  );
}
