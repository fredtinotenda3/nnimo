"use client";

import { useActionState } from "react";
import { submitContact } from "@/app/(site)/custom/actions";
import { IDLE_STATE } from "@/lib/inquiries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContact, IDLE_STATE);
  const errors = state.errors ?? {};

  if (state.status === "success") {
    return (
      <div role="status" className="border-l-2 border-secondary bg-surface p-8">
        <h2 className="text-heading-2">Message sent</h2>
        <p className="text-body mt-3 text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="c-name">Your name</Label>
          <Input
            id="c-name"
            name="customerName"
            required
            autoComplete="name"
            className="mt-2"
            aria-invalid={Boolean(errors.customerName)}
          />
          {errors.customerName ? (
            <p className="text-body-sm mt-1.5 text-destructive">{errors.customerName}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-2"
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? (
            <p className="text-body-sm mt-1.5 text-destructive">{errors.email}</p>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor="c-phone">Phone or WhatsApp</Label>
        <Input id="c-phone" name="phone" autoComplete="tel" className="mt-2" />
        <p className="text-metadata mt-1.5 text-muted-foreground">Optional</p>
      </div>

      <div>
        <Label htmlFor="c-message">Message</Label>
        <Textarea
          id="c-message"
          name="description"
          required
          rows={6}
          className="mt-2"
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description ? (
          <p className="text-body-sm mt-1.5 text-destructive">{errors.description}</p>
        ) : null}
      </div>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-body-sm border-l-2 border-destructive pl-3 text-destructive">
          {state.message}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
