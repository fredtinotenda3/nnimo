"use client";

import { useActionState } from "react";
import { settleOrderPaymentAction, type AdminActionState } from "@/app/admin/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: AdminActionState = { error: null };

/**
 * Recording a payment the studio received outside the application.
 *
 * DESIGN NOTES
 *
 * The confirmation checkbox is required by the server, not just by this form.
 * Marking an order paid is currently irreversible in the product — Payment is an
 * append-only log and reversing a settlement would have to release committed
 * stock — so the interaction is deliberately one step slower than a single
 * click.
 *
 * The reference and method fields are optional and free text. A dropdown of
 * payment methods would be the application asserting which channels the business
 * accepts, which is not something this codebase gets to decide on the studio's
 * behalf.
 *
 * The warning below states plainly what will happen: the customer is emailed and
 * stock is committed. An operator should not have to discover either afterwards.
 */
export function ManualSettlementForm({
  orderId,
  totalLabel,
}: {
  orderId: string;
  totalLabel: string;
}) {
  const [state, formAction, pending] = useActionState(settleOrderPaymentAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <Label htmlFor="settlement-method">How the payment arrived</Label>
        <Input
          id="settlement-method"
          name="method"
          className="mt-2"
          maxLength={120}
          placeholder="Bank transfer, cash on collection, mobile money…"
        />
        <p className="text-metadata mt-1.5 text-muted-foreground">
          Optional. Recorded on the payment and in the audit log.
        </p>
      </div>

      <div>
        <Label htmlFor="settlement-reference">Reference</Label>
        <Input
          id="settlement-reference"
          name="reference"
          className="mt-2"
          maxLength={120}
          placeholder="Transaction or deposit reference"
        />
        <p className="text-metadata mt-1.5 text-muted-foreground">
          Optional, but worth filling in — it is what makes this settlement
          reconcilable against a bank statement later.
        </p>
      </div>

      <div>
        <Label htmlFor="settlement-note">Note</Label>
        <Input id="settlement-note" name="note" className="mt-2" maxLength={1000} />
      </div>

      <div className="flex items-start gap-3 border-l-2 border-ochre pl-3">
        <input
          type="checkbox"
          id="settlement-confirm"
          name="confirm"
          className="mt-1 h-4 w-4 shrink-0 rounded-[var(--radius-sm)] border-border-strong text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label htmlFor="settlement-confirm" className="text-body-sm cursor-pointer">
          I confirm the studio has received {totalLabel} in full for this order.
          <span className="text-metadata mt-1 block text-muted-foreground">
            This marks the order paid, emails the customer to confirm, and commits any
            reserved stock. It cannot be undone from the admin.
          </span>
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Recording…" : "Record payment received"}
        </Button>
      </div>
    </form>
  );
}
