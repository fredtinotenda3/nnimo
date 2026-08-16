# APPLY — Phase 5

How to apply this archive to your working copy, verify it, and deploy.

⚠️ **The verification gate in §3 was NOT run when this patch was produced** — the
build environment had no `node_modules` and no database, and the instruction for
this phase was to skip heavy commands. Every change is reviewed and reasoned, not
compiler-checked. **Run §3 yourself and do not skip it.**

---

## 1. What is in this archive

Only files created or modified in Phase 5. Untouched Phase 1–4 files,
`node_modules`, `.next`, `.git` and the generated Prisma client are excluded.

```
PHASE-5-REPORT.md                 this phase's full report
APPLY.md                          this file
.env.example                      + Phase 5 variables
next.config.ts                    header split, image hardening
proxy.ts                          CSP nonce + security headers
scripts/verify-database.mjs       + two new indexes
docs/                             6 documents
lib/                              11 new + 9 modified
app/                              16 modified
tests/                            7 new suites
prisma/migrations/20260815090000_phase5_production_constraints/
```

This archive replaces the Phase 3/4 `APPLY.md` at the repository root. Keep the
old one if you still need it for reference before overwriting.

---

## 2. Applying it

### 2.1 Back up first

```bash
git status                 # commit or stash anything outstanding
git checkout -b phase-5-production-hardening
```

If your working copy is not a git repository, copy it somewhere safe before
proceeding — step 2.3 deletes a file.

### 2.2 Unzip over the repository root

```bash
unzip -o nnino-phase-5.zip -d /path/to/nnimo-main
```

`-o` overwrites. Every file in the archive is intended to replace its
counterpart.

### 2.3 Delete one file — the zip cannot do this for you

```bash
rm lib/payments/registry.ts
```

**This is required, not optional.** It was a dead second copy of the provider
registry that nothing imported, and its `getCheckoutPaymentProvider()` fell back
to the sandbox payment provider *without* checking `isConfigured()`. Leaving it
in place leaves a silently-active test gateway waiting for someone to wire up.

Confirm nothing references it:

```bash
grep -rn "payments/registry" app lib components   # expect no output
```

### 2.4 Review the diff

```bash
git diff --stat
git diff
```

Pay particular attention to `lib/commerce/payment-service.ts`, `proxy.ts` and
`app/(site)/checkout/actions.ts` — those carry the behavioural fixes.

---

## 3. Verification gate

Run in this order. **Stop at the first failure.**

```bash
npm install
npm run db:generate
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Expected from `npm run test`: **206 tests passing** (140 baseline + 66 new).
Anything below 140 means something was lost — investigate before continuing.

### 3.1 Then the database

The migration is idempotent and additive, so it is safe against your existing
development database where these objects were created by hand.

```bash
npx prisma migrate deploy
npm run db:verify
```

`db:verify` must report **no `MISSING` lines**. It now also checks the two
indexes this phase adds.

### 3.2 If tsc or lint fails

Likely causes, in order of probability:

- **Missing generated Prisma client** — run `npm run db:generate` first. The two
  `@/lib/generated/prisma/*` imports do not resolve until you do.
- **`otherCurrencyOrders`** — added to `CommerceKpis` and rendered in
  `app/admin/page.tsx`. If you have a second dashboard consumer, it needs the
  field.
- **`orderAccessToken`** — added as a required field on `PaymentIntentRequest`.
  Any provider adapter written outside this archive must accept it.
- **`rateLimit` is async** — it always returned a value the existing call sites
  awaited, but a synchronous call site added since would now need `await`.

---

## 4. Manual verification of the three critical fixes

These need a database and cannot be unit tested. Do them before deploying.

### C-1 — the order access token no longer leaks

```bash
# Place a sandbox order, note its orderNumber and accessToken.
# Then, WITHOUT the token:
curl -si "http://localhost:3000/checkout/sandbox/NN-2026-00001" | head -1
```

**Expect 404.** Before this patch it returned 200 with the customer's access
token embedded in the page — and that token opens `/orders/<token>`, which shows
their name, email, phone and delivery address.

Then confirm the correct token still works and a wrong one does not:

```bash
curl -si "http://localhost:3000/checkout/sandbox/NN-2026-00001?token=<real>"   # 200
curl -si "http://localhost:3000/checkout/sandbox/NN-2026-00001?token=wrong"    # 404
```

### C-2 — inventory now commits and releases

Requires a product with real stock (`availability = IN_STOCK`,
`Inventory.onHand > 0`).

1. Note `onHand` and `reserved`.
2. Place an order for 1 → `reserved` +1, `onHand` unchanged.
3. Complete the sandbox payment as **PAID** → `reserved` −1 **and** `onHand` −1,
   with a `SALE` row in `InventoryMovement`.
4. Place another order, complete as **FAILED** → `reserved` returns to baseline,
   with a `RESERVATION_RELEASE` row.
5. Place another, then cancel it in `/admin/orders` → same release behaviour.
6. Re-submit a completed payment → **no** second `SALE` row (idempotency).

### C-3 — a fresh database is now correct

The important one. Against a **scratch** database, not your development one:

```bash
createdb nnino_fresh_test
DATABASE_URL="postgresql://…/nnino_fresh_test" \
DIRECT_DATABASE_URL="postgresql://…/nnino_fresh_test" \
  npx prisma migrate deploy

DIRECT_DATABASE_URL="postgresql://…/nnino_fresh_test" \
  node scripts/verify-database.mjs
```

**Every line must read `OK`.** Before this patch, `nnino_order_number_seq` and
all 23 CHECK constraints were `MISSING` on a fresh database, and every checkout
would have failed with "relation does not exist".

Drop the scratch database afterwards.

---

## 5. Recommended integration tests to add

The three critical fixes have no automated coverage because they need a database.
Add these to `tests/integration/` when convenient — they are the regressions most
worth catching:

- `sandbox-access.integration.test.ts` — the sandbox page 404s without a token,
  404s with a wrong token, and `completeSandboxPayment` refuses a mismatched
  token.
- `inventory-lifecycle.integration.test.ts` — commit on PAID, release on FAILED,
  release on cancellation, and idempotency of each.
- extend `constraints.integration.test.ts` — assert `nnino_order_number_seq`
  exists and that each CHECK constraint actually rejects a violating row.

---

## 6. Before you take a real order

In order:

1. Verification gate green (§3).
2. Manual checks green (§4).
3. `MEDIA_DRIVER=s3` with a real bucket — otherwise every uploaded image is lost
   on the next deploy. See `docs/media-storage.md`.
4. `RATE_LIMIT_REDIS_*` set — otherwise the limiter is per-instance and does not
   hold across Vercel instances. See `docs/deployment.md`.
5. Paynow adapter implemented. **🚫 Blocked on credentials and the integration
   style decision** — `docs/payment-setup.md` lists exactly what the studio must
   supply.
6. Sending domain with SPF/DKIM/DMARC — otherwise no customer receives an email.
   See `docs/operations.md`.
7. Backups enabled **and a restore tested**.
8. The 15 smoke tests in `docs/deployment.md`.

---

## 7. Rolling back this patch

```bash
git checkout main            # or: git revert the merge commit
```

The migration does **not** need reverting. It is additive and idempotent, so the
pre-Phase-5 application runs fine against the migrated schema — that is
deliberate, so a bad deploy is undone by reverting the application alone.

If you must remove the database objects (you almost certainly should not — they
are correctness constraints the application has always assumed), drop them
individually by name. **Do not drop the sequence:** checkout depends on it.
