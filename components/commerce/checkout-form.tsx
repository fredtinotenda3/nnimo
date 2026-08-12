"use client";

import * as React from "react";
import { useActionState } from "react";
import { CHECKOUT_IDLE, placeOrderAction, type CheckoutState } from "@/app/(site)/checkout/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-body-sm mt-1.5 text-destructive">{message}</p>;
}

export function CheckoutForm() {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    placeOrderAction,
    CHECKOUT_IDLE,
  );
  const [method, setMethod] = React.useState<"DELIVERY" | "COLLECTION">("DELIVERY");
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-10" noValidate>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="co-website">Website</label>
        <input id="co-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend className="text-heading-2">Your details</legend>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor="co-name">Full name</Label>
            <Input id="co-name" name="name" required autoComplete="name" className="mt-2" />
            <FieldError message={errors.name} />
          </div>
          <div>
            <Label htmlFor="co-email">Email</Label>
            <Input id="co-email" name="email" type="email" required autoComplete="email" className="mt-2" />
            <FieldError message={errors.email} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="co-phone">Phone or WhatsApp</Label>
            <Input id="co-phone" name="phone" required autoComplete="tel" className="mt-2" />
            <FieldError message={errors.phone} />
            <p className="text-metadata mt-1.5 text-muted-foreground">
              The studio uses this to confirm delivery and collection.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-heading-2">How would you like it?</legend>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(
            [
              {
                value: "COLLECTION" as const,
                title: "Collect from the studio",
                body: "25 Waverley Road, Thorngrove, Bulawayo. No charge.",
              },
              {
                value: "DELIVERY" as const,
                title: "Delivery",
                body: "The studio confirms the delivery cost with you separately.",
              },
            ]
          ).map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer flex-col gap-1.5 border p-5 transition-colors",
                method === option.value
                  ? "border-primary bg-surface"
                  : "border-border-strong hover:bg-surface-sunken",
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="fulfilmentMethod"
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value)}
                  className="accent-[var(--color-primary)]"
                />
                <span className="text-heading-3">{option.title}</span>
              </span>
              <span className="text-body-sm text-muted-foreground">{option.body}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {method === "DELIVERY" ? (
        <fieldset>
          <legend className="text-heading-2">Delivery address</legend>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="co-line1">Street address</Label>
              <Input id="co-line1" name="line1" autoComplete="address-line1" className="mt-2" />
              <FieldError message={errors.line1} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="co-line2">Apartment, suite, etc.</Label>
              <Input id="co-line2" name="line2" autoComplete="address-line2" className="mt-2" />
              <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
            </div>
            <div>
              <Label htmlFor="co-city">City</Label>
              <Input id="co-city" name="city" autoComplete="address-level2" className="mt-2" />
              <FieldError message={errors.city} />
            </div>
            <div>
              <Label htmlFor="co-country">Country</Label>
              <Input
                id="co-country"
                name="country"
                autoComplete="country-name"
                defaultValue="Zimbabwe"
                className="mt-2"
              />
              <FieldError message={errors.country} />
            </div>
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-heading-2">Anything else?</legend>
        <div className="mt-6">
          <Label htmlFor="co-notes">Notes for the studio</Label>
          <Textarea id="co-notes" name="notes" rows={4} className="mt-2" />
          <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
        </div>
        <label className="mt-6 flex items-start gap-3">
          <input
            type="checkbox"
            name="marketingConsent"
            className="mt-1 accent-[var(--color-primary)]"
          />
          <span className="text-body-sm text-muted-foreground">
            Email me occasionally about new collections. Not ticking this changes nothing
            about your order.
          </span>
        </label>
      </fieldset>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          {state.message}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Placing your order…" : "Place order"}
        </Button>
        <p className="text-metadata mt-3 text-muted-foreground">
          You will be taken to payment after the order is created.
        </p>
      </div>
    </form>
  );
}
