# Payment setup

## Architecture

Orders and checkout depend on the `PaymentProvider` interface
(`lib/payments/types.ts`) and never on a provider. Adding a gateway is a new file
implementing that interface plus one entry in `lib/payments/index.ts` — no change
to cart, order or checkout logic, and no migration, because `Payment.provider` is
a string column validated against the registry's keys.

```
checkout action
  └─ startPayment()                 lib/commerce/payment-service.ts
       └─ getActiveProvider()       lib/payments/index.ts
            └─ provider.createPayment()

provider callback  →  /api/payments/[provider]/callback
  └─ provider.parseWebhook()        authenticates; throws on failure
  └─ recordWebhookOnce()            UNIQUE key; at-most-once
  └─ verifyAndApplyPayment()        asks the provider what really happened
       └─ evaluateVerification()    amount + currency must match
       └─ commitOrderInventory()    only after a verified PAID
```

`lib/payments/registry.ts` was **deleted in Phase 5**. It was a dead second copy
of the registry that nothing imported, and its `getCheckoutPaymentProvider()`
fell back to the sandbox provider without checking `isConfigured()` — a
silently-active test gateway waiting for someone to wire it up.

## Providers

### `sandbox` — built in, development only

Exercises the entire lifecycle without a gateway. The tester chooses the outcome,
which is the point: it does not fake a *successful* payment, it makes the outcome
explicit.

It refuses to load in production unless `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION` is
`"true"`, **and** `lib/env.ts` refuses to boot production with
`PAYMENT_PROVIDER=sandbox` without that same flag.

Two limitations, both deliberate:

- Chosen outcomes are held in process memory, so a server restart loses them and
  `verifyPayment` throws rather than guessing. Guessing is the habit that causes
  real payment bugs.
- The sandbox page requires the order's access token in the query string. It used
  to accept an order number alone and hand out the token — see `docs/security.md`.

### `paynow` — 🚫 BLOCKED, adapter deliberately unimplemented

Every method throws and `isConfigured()` returns `false`, so checkout will not
offer it. This is intentional. Writing a speculative implementation would mean
shipping a hash scheme that has never been executed against the real endpoint,
which is worse than shipping nothing because it *looks* finished.

**⚠️ REQUIRES BUSINESS INPUT — the studio must supply:**

1. **Integration ID and Integration Key.** Paynow issues these per integration,
   and **USD and ZWG require separate integrations**. Commerce is USD-only, so
   one USD integration is enough for now.
2. **Integration style** — hosted redirect, or Express Checkout where the payment
   is initiated server-side and approved on the customer's handset. Different
   flows, different UX, different adapter.
3. **A production domain**, for the Return URL and Result URL.
4. **Refund handling confirmation.** Paynow has no automated refund API, so
   `order:refund` records a reconciliation rather than calling anything.

**⚠️ REQUIRES MANUAL CONFIGURATION — when implementing the adapter:**

- Paynow authenticates with a **concatenated-field SHA-512 hash**, not an HMAC
  header. `parseWebhook` must recompute it and throw `WebhookSignatureError` on
  mismatch. Compare it with `timingSafeEqualString` from
  `lib/security/tokens.ts`.
- Treat the status in the callback as a **hint only**. Always call the poll URL
  from `verifyPayment` server-side before moving an order to PAID. The framework
  already enforces this shape — do not work around it.
- Populate `amountCents` and `currency` in the `PaymentVerification` you return.
  Returning `null` for both is legal (the sandbox does) but it disables the
  mismatch checks that `evaluateVerification` performs, which is the strongest
  guard available against a mis-scoped integration.
- Set `PAYMENT_REDIRECT_ORIGIN` so the CSP `form-action` permits the redirect.
- Set `PAYNOW_RESULT_URL` to `https://<domain>/api/payments/paynow/callback`.
  **Not** `/api/payments/webhook` — that path does not exist and was wrong in the
  checkout action until Phase 5.

Add tests alongside the adapter: a valid signature, a tampered payload, a
replayed callback, and a callback whose amount disagrees with the order.

## Testing the flow with the sandbox

1. `PAYMENT_PROVIDER="sandbox"`, `NODE_ENV=development`.
2. Add a purchasable product to the cart and check out.
3. You are redirected to `/checkout/sandbox/<orderNumber>?token=<accessToken>`.
4. Choose "successful" or "failed".
5. Verify: order moves to PAID, a `Payment` row with `verifiedAt` is written, an
   audit `payment.verified` entry exists, stock is committed for stock-backed
   lines, and the confirmation email appears in the server log.
6. Re-submit the same outcome. Nothing should double-apply.

## Reconciliation

- `Payment` is append-only. Every attempt and transition is a new row; a PAID row
  is never updated in place.
- `PaymentWebhookEvent` keeps every authenticated callback verbatim, with
  `processedAt` set once handled. Events stuck with `processedAt IS NULL` are the
  ones needing attention — the partial index
  `payment_webhook_event_unprocessed` makes that query cheap.
- `payment_provider_ref_idx` supports matching a provider's settlement report
  against our records by reference.
- An amount or currency mismatch is logged at `error` as
  `payment.verification_mismatch` and recorded on the `Payment` row's
  `rawPayload`. Alert on that event.
