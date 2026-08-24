# What's in this ZIP

Three items, matching the three tasks:

## 1. `next.config.ts` (fixed)

Adds `experimental.serverActions.bodySizeLimit: "15mb"`. This is the only change. Next.js defaults the Server Actions request body to 1 MB, which is what was producing:

```
Error: Body exceeded 1 MB limit.
statusCode: 413
POST /admin/media 500 (Internal Server Error)
```

15 MB was chosen over the strict minimum of 12 MB to give headroom for multipart encoding overhead above the real 12 MB file-size ceiling already enforced in `lib/media/types.ts` (`MAX_UPLOAD_BYTES`). No business logic, validation, RBAC, S3, payments, analytics, or schema code was touched — only this one config key.

**Checks run:**
- `npx tsc --noEmit` — `next.config.ts` itself is clean. The rest of the repo shows pre-existing errors, all caused by the Prisma client not being generated (`Cannot find module '@/lib/generated/prisma/enums'`) — this sandbox's network allowlist doesn't include `binaries.prisma.sh`, so `prisma generate` can't complete here. Nothing in that list is related to the config change.
- `npm run lint` — clean, whole repository, zero warnings.
- `npm run test` — **394 of 394 tests pass.** The 2 failing suites (`tests/analytics-authorization.test.ts`, `tests/order-totals.test.ts`) fail for the same Prisma-generation reason above, not because of this change.

Recommended before deploying: run `npx prisma generate` in an environment with normal network access (or restore it from your existing build cache/CI), then re-run `npm run verify` once to confirm a fully clean pass end to end.

## 2. `docs/admin-operations-guide.md`

Plain-language walkthrough for Marion, written from the actual current admin routes, fields, and permissions in this codebase (not from general Next.js/CMS conventions). Covers sign-in and roles, the dashboard, publishing/unpublishing/archiving products, every product field, availability options, media upload, attaching/reordering/primary images, collection publishing and hero images, team profiles, content blocks, settings, enquiries, orders and fulfilment, recording a manual payment, the audit log, and analytics. Ends with an explicit note on which nav sections (Inventory editing, Campaigns, Landing pages) are not built yet, so nothing in the guide overstates what exists.

## 3. `docs/media-image-prompts.md`

Image-generation prompts for everything destined for `/admin/media`, grounded in `prisma/seed/source-data.ts` (the verified transcription of the supplied brochure/catalogue/price-list) and the `Nnimo.pdf` catalogue itself — every one of the 38 real collections gets a mood-setting hero prompt, plus broader category/range mood images, plus studio-process imagery. Team-member portraits are deliberately **not** included, with an explanation: every name on the real team list is a real person with no reference photo available to an image model, so any generated "portrait" would be a fabricated face attached to a real name — the document explains this and offers a safe non-figurative alternative instead.
