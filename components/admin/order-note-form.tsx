"use client";

import { useActionState } from "react";
import { saveInternalNoteAction, type AdminActionState } from "@/app/admin/orders/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const INITIAL: AdminActionState = { error: null };

export function OrderNoteForm({
  orderId,
  initialValue,
}: {
  orderId: string;
  initialValue: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveInternalNoteAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <Label htmlFor="internalNotes" className="sr-only">
        Internal notes
      </Label>
      <Textarea
        id="internalNotes"
        name="internalNotes"
        rows={5}
        defaultValue={initialValue ?? ""}
        placeholder="Not visible to the customer."
      />
      {state.error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
      </div>
    </form>
  );
}
