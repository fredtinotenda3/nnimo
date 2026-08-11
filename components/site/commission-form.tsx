"use client";

import { useActionState } from "react";
import { submitCommission } from "@/app/(site)/custom/actions";
import { IDLE_STATE, REQUEST_TYPES } from "@/lib/inquiries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const selectClass =
  "text-body-sm h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-body-sm mt-1.5 text-destructive">
      {message}
    </p>
  );
}

export function CommissionForm({ piece }: { piece?: string }) {
  const [state, formAction, pending] = useActionState(submitCommission, IDLE_STATE);
  const errors = state.errors ?? {};

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="border-l-2 border-secondary bg-surface p-8"
      >
        <h2 className="text-heading-2">Enquiry sent</h2>
        <p className="text-body mt-3 text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {/* Honeypot — visually and programmatically hidden from real users. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {piece ? (
        <p className="text-body-sm border-l-2 border-primary/40 pl-4 text-muted-foreground">
          Enquiring about <span className="text-foreground">{piece}</span>. Mention any
          changes you would like in the description below.
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="customerName">Your name</Label>
          <Input
            id="customerName"
            name="customerName"
            required
            autoComplete="name"
            className="mt-2"
            aria-invalid={Boolean(errors.customerName)}
            aria-describedby={errors.customerName ? "err-customerName" : undefined}
          />
          <FieldError id="err-customerName" message={errors.customerName} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-2"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "err-email" : undefined}
          />
          <FieldError id="err-email" message={errors.email} />
        </div>
        <div>
          <Label htmlFor="phone">Phone or WhatsApp</Label>
          <Input id="phone" name="phone" autoComplete="tel" className="mt-2" />
          <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
        </div>
        <div>
          <Label htmlFor="organisation">Organisation</Label>
          <Input
            id="organisation"
            name="organisation"
            autoComplete="organization"
            className="mt-2"
          />
          <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
        </div>
        <div>
          <Label htmlFor="requestType">What do you need?</Label>
          <select
            id="requestType"
            name="requestType"
            defaultValue={REQUEST_TYPES[0]}
            className={cn(selectClass, "mt-2")}
          >
            {REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            inputMode="numeric"
            className="mt-2"
          />
          <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
        </div>
        <div>
          <Label htmlFor="desiredDate">Needed by</Label>
          <Input id="desiredDate" name="desiredDate" type="date" className="mt-2" />
          <p className="text-metadata mt-1.5 text-muted-foreground">
            Handmade pieces take about five to six weeks
          </p>
        </div>
        <div>
          <Label htmlFor="budget">Budget</Label>
          <Input id="budget" name="budget" className="mt-2" placeholder="A range is fine" />
          <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
        </div>
      </div>

      <div>
        <Label htmlFor="description">What would you like made?</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={6}
          className="mt-2"
          placeholder="Shapes, animals, colours, sizes, how it will be used, anything you have seen that you liked."
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "err-description" : undefined}
        />
        <FieldError id="err-description" message={errors.description} />
      </div>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          {state.message}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send enquiry"}
        </Button>
      </div>
    </form>
  );
}
