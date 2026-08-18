# APPLY — TASK 1: PRODUCTION CHECKOUT SAFETY / MANUAL SETTLEMENT

Applies the manual-settlement correction. Cart, checkout and order creation stay
open; production orders are created **UNPAID** and are marked paid only by a
studio operator recording that money actually arrived.

**No database migration is required.** No schema change was made.

---

## 1. What changed and why

### The defect

Production had **no safe configuration**. `lib/env.ts` refused to boot on
`NODE_ENV=production` with `PAYMENT_PROVIDER=sandbox` (the default), and the
error message suggested setting `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION="true"` to
get past it — which switches on the provider whose payment outcome is *chosen by
the caller*. `docs/production-readiness.md` recorded this as the intended
production configuration.

The consequence, as that document itself set out: a real customer could place an
order, open `/checkout/sandbox/<orderNumber>?token=<their own token>`, select
`PAID`, and receive a confirmed order with stock decremented and a confirmation
email sent. No money moves.

The design offered two ways out — site down, or test payments settling real
orders — and the convenient one was the dangerous one.

### The correction

A `manual` payment provider, implemented as a first-class `PaymentProvider`
behind the existing abstraction. Nothing was rewritten and no payment
architecture was removed.

**The property that matters: `manualProvider.verifyPayment()` has no code path
that returns `PAID`.** Not "returns PENDING unless configured" — there is no
input that produces a settlement. The safety guarantee is structural, not
conditional on an environment variable. `parseWebhook()` throws, because nothing
upstream could legitimately call it.

Money is recognised in exactly one place: `settlePaymentManually()`, which
requires an authenticated operator holding the new `order:settle` permission and
writes a `payment.manually_settled` audit entry naming them.

### Three independent guards

All read one predicate (`lib/payments/environment.ts`):

1. **Selection** — `getActiveProviderId()` resolves a `kind: "test"` provider
   down to `manual` on a production deployment.
2. **Configuration** — `sandboxProvider.isConfigured()` returns false there.
3. **Settlement** — `verifyAndApplyPayment()` refuses to apply a `PAID`
   verification from a test provider.

Guard 3 is not redundant. It covers an order *started* under a test provider and
verified later — a replayed callback, a reconciliation sweep, or a staging
database restored into production — which neither of the first two catches.

### Decisions taken (flagged for your review)

These were open questions; I proceeded with the recommended defaults.

| Decision | Taken | Reasoning |
|---|---|---|
| Boot on `PAYMENT_PROVIDER=sandbox` in production | **Resolve to `manual`, log at error. No longer throws.** | The fallback is the most conservative provider in the registry, so this fails *safe*, not open. It also removes the footgun where the only documented way to boot production was to enable sandbox settlement. |
| Distinguishing staging from production | **Added `DEPLOYMENT_ENV`.** Old flag honoured as deprecated. | `next build` sets `NODE_ENV=production` for staging and preview deployments, so `NODE_ENV` alone cannot express the distinction the safety rule turns on. |
| Who may record a payment | **New `order:settle`, OWNER and MANAGER only.** | Asserting money arrived is a finance decision, not an order-desk one. Deliberately does not follow `order:write` down to ORDER_MANAGER. See §5 to widen it. |

---

## 2. Manual steps

### 2.1 Set the production environment variables — REQUIRED

On the production deployment (Vercel project settings, or your host's
equivalent):

```
PAYMENT_PROVIDER="manual"
DEPLOYMENT_ENV="production"
```

Then **remove** `PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION` if it is set. It is
deprecated, and on the real shop it is the one setting that allows a payment
nobody made to be recorded as received.

The application will still run without these — `PAYMENT_PROVIDER=sandbox`
resolves to manual settlement automatically — but it logs
`config.sandbox_provider_in_production` at error level on every boot until set,
and an operator reading the environment should not have to know about the
downgrade to understand what the shop is doing.

**On staging**, if you want the sandbox payment flow to keep working:

```
DEPLOYMENT_ENV="staging"
PAYMENT_PROVIDER="sandbox"
```

**In local development** nothing needs to change.

### 2.2 Confirm who can record payments

`order:settle` is granted to **OWNER** and **MANAGER**. Check that whoever
handles the studio's money holds one of those roles in `/admin/team`. An
`ORDER_MANAGER` can move orders through fulfilment but will see a read-only note
on the payment panel instead of the form.

### 2.3 Regenerate the Prisma client before verifying

The verification gate below needs the generated client, which is gitignored:

```bash
npm run db:generate
```

### 2.4 Nothing to do for Paynow

No Paynow code was touched. No credentials were fabricated. The adapter still
reports `isConfigured() === false` and still throws on every method. When
credentials arrive, implement the adapter and set `PAYMENT_PROVIDER="paynow"` —
manual settlement stays available alongside it for bank transfers and cash on
collection, which is not an edge case for a studio selling handmade work.

---

## 3. Verification

### 3.1 What I ran, and what I could not

| Check | Result |
|---|---|
| `npm run test` | **412 passed / 25 files** (baseline before changes: 383 / 23) |
| `npm run lint` | **clean** |
| `npx tsc --noEmit` | **Ran, but not authoritative — see below** |
| `npm run build` | **Not run** (per instruction: lightweight checks only) |
| Integration tests | **Not run** (no database available) |

**The typecheck caveat, stated plainly.** `prisma generate` cannot run in my
environment — `binaries.prisma.sh` is outside the permitted network policy — so
the generated client at `lib/generated/prisma/` does not exist. To get any
signal at all I hand-built two throwaway shims: an enums file generated
mechanically from `schema.prisma` (accurate), and a **loose** client shim whose
model delegates are typed `any`.

Consequence: **type errors inside `db.*` query shapes are not verified.** I
reviewed every new Prisma call by hand against `schema.prisma`, but that is
review, not proof.

Used differentially, the run is still meaningful. Baseline on the unmodified
repository: 69 errors, all shim-induced (`implicitly has an 'any' type` on query
results). After the changes: 70. The single new line is
`app/admin/orders/actions.ts(203,29)` — mapping `order.items`, the identical
shim artefact already present at `app/(site)/checkout/sandbox/actions.ts`.
**No new real type errors.**

The shims are **not** in the ZIP. Run the real gate yourself:

```bash
npm run db:generate
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

### 3.2 Manual verification — production behaviour

Simulate a production deployment locally:

```bash
DEPLOYMENT_ENV=production PAYMENT_PROVIDER=sandbox npm run build && npm start
```

1. **Boot log.** Expect `config.sandbox_provider_in_production` at error level,
   and `payment.test_provider_downgraded_to_manual` on the first checkout.
2. **Admin → Settings → Credentials.** "Payment provider" must read
   *"Manual settlement — orders are placed unpaid and confirmed by the studio"*.
   It reports the **resolved** provider, not the requested one.
3. **Sandbox page is gone.** `/checkout/sandbox/<anything>` must return 404.
4. **Place an order.** Cart → checkout → place order must all work. The checkout
   sidebar must say you will not be charged on that page.
5. **Confirmation page.** Must show *"Your order has been received. The studio
   will confirm availability, delivery, and payment with you."* and a payment
   badge reading **"Awaiting studio confirmation"**.
6. **Database.** The order row must be `paymentStatus = UNPAID` — **not**
   `PENDING`.
7. **Confirmation email** (in the log under `EMAIL_TRANSPORT=dev`) must carry the
   same sentence and must **not** invite the customer to complete a payment.

### 3.3 Manual verification — recording a payment

8. As OWNER or MANAGER, open `/admin/orders/<id>`. A **Payment** section offers
   the settlement form.
9. Submit **without** ticking the confirmation box — must be rejected.
10. Tick it and submit. Expect: order `PAID` with `paidAt` set; a `Payment` row
    with provider `manual` and your reference; a `payment.manually_settled`
    audit entry naming you; a "Payment confirmed" email to the customer; and any
    reserved stock committed.
11. Submit again — must be a no-op. No second Payment row, no second email.
12. Sign in as an `ORDER_MANAGER` — the form must be replaced by a read-only
    note.

### 3.4 Manual verification — development is unchanged

13. `npm run dev` — the sandbox flow must work exactly as before: redirect to
    the sandbox page, choose an outcome, order settles.

---

## 4. Known limitations

### 4.1 A manual settlement cannot be reversed from the admin

**The most important limitation here.** `Payment` is an append-only log by
design, and reversing a settlement would also have to release committed stock —
neither is a safe thing to half-build against a live checkout.

If an operator marks an order paid in error, the correction today is:

1. Record what happened in the order's internal notes.
2. Correct the stock by hand via `/admin/products` inventory adjustment (which
   is itself audited).
3. The `payment.manually_settled` audit entry stays — it is a record of what was
   asserted and by whom, which is exactly what you want during a reconciliation.

The admin form states in the confirmation label that this cannot be undone. If
you want a supported reversal path, it is a scoped piece of follow-up work: a
corrective `Payment` row, an inventory release, and an audited status change.

### 4.2 The staging/production switch is a single predicate

All three guards read `lib/payments/environment.ts`. That is deliberate — three
copies of a safety rule is three chances for them to disagree — but it does mean
that setting `DEPLOYMENT_ENV="staging"` on the real shop would re-enable test
payments. There is no defence against a deliberate misconfiguration of that
variable; the mitigations are that it must be set explicitly, that an unset
production build defaults to `production`, and that
`config.test_payments_enabled` is logged at warn level on every boot when test
payments are live.

### 4.3 Manual settlement makes the shop honest, not automated

No real payment can be taken until the Paynow adapter is written. Every order
requires a human to confirm receipt. That is a real operational load on the
studio, and it is the trade Option B always carried — recorded in
`docs/production-readiness.md`.

### 4.4 Not verified by a running application

No build, no integration tests, no database, no browser. Sections 3.2–3.4 are
the manual steps that close that gap and should be run before this reaches
customers.

---

## 5. If you want to change a decision

**Let the order desk record payments.** In `lib/rbac.ts`, add `"order:settle"`
to the `ORDERS` bundle, and update the assertion in `tests/rbac.test.ts` that
currently pins it to OWNER and MANAGER. The test failing is the point — it makes
widening a decision rather than a drift.

**Make production refuse to boot instead of downgrading.** In `lib/env.ts`,
replace the `logger.error("config.sandbox_provider_in_production", …)` block
with a `throw`. Be aware this reinstates the failure mode where a missed
environment variable takes the whole storefront down.

**Change the customer-facing wording.** `MANUAL_SETTLEMENT_MESSAGE` in
`lib/commerce/fulfilment.ts` is the single source for the page and the email, so
they cannot drift apart. `tests/manual-settlement.test.ts` asserts its content.

---

## 6. Files in this ZIP

### New — Task 1

| File | Purpose |
|---|---|
| `lib/payments/environment.ts` | The deployment-environment predicate. One copy of the safety rule. |
| `lib/payments/manual-provider.ts` | The manual settlement provider. Cannot report payment. |
| `components/admin/manual-settlement-form.tsx` | Admin form for recording a received payment. |
| `tests/payment-environment.test.ts` | 10 tests pinning environment resolution. |
| `tests/manual-settlement.test.ts` | 18 tests — provider behaviour, customer messaging, provider resolution. |

### Modified — Task 1

| File | Change |
|---|---|
| `lib/payments/types.ts` | Added `kind` and `settlementModeOf()` to the contract. |
| `lib/payments/index.ts` | Registered `manual`; safe provider resolution; settlement-mode helpers. |
| `lib/payments/sandbox-provider.ts` | `kind: "test"`; delegates to the shared predicate. |
| `lib/payments/paynow-provider.ts` | `kind: "live"`. No behavioural change. |
| `lib/commerce/payment-service.ts` | Settlement guard; manual mode leaves orders UNPAID; `settlePaymentManually()`. |
| `lib/commerce/fulfilment.ts` | `MANUAL_SETTLEMENT_MESSAGE`; settlement-aware labels and status. |
| `lib/rbac.ts` | New `order:settle` permission. |
| `lib/audit.ts` | New `payment.manually_settled` action. |
| `lib/env.ts` | `DEPLOYMENT_ENV`; `manual` provider; boot throw replaced with logging. |
| `lib/email/types.ts` | New `payment.confirmed_by_studio` email kind. |
| `lib/email/order-emails.ts` | Settlement-aware templates. |
| `app/(site)/checkout/actions.ts` | Passes settlement mode to the confirmation email. |
| `app/(site)/checkout/page.tsx` | Truthful payment copy. |
| `app/(site)/checkout/sandbox/actions.ts` | Three outcomes — a blocked settlement sends no email. |
| `app/(site)/orders/[accessToken]/page.tsx` | Required message; settlement-aware badge. |
| `app/admin/orders/actions.ts` | `settleOrderPaymentAction` and customer notification. |
| `app/admin/orders/[id]/page.tsx` | Payment settlement panel. |
| `app/admin/settings/page.tsx` | Reports the resolved provider truthfully. |
| `tests/rbac.test.ts` | Pins `order:settle` to OWNER and MANAGER. |
| `.env.example` | Documents `DEPLOYMENT_ENV` and `manual`; deprecates the old flag. |
| `docs/payment-setup.md` | Documents the manual provider and the three guards. |
| `docs/deployment.md` | Corrects the boot behaviour and the variable table. |
| `docs/production-readiness.md` | Blocker 0 marked resolved via Option B. |

### Task 2

| File | Purpose |
|---|---|
| `PHASE9-DESIGN-AUDIT.md` | Discovery deliverable. **No Phase 9 code was written.** |

Unzip over the repository root. No files need deleting.
