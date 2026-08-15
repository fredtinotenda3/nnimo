# Applying Phase 4

64 files. 54 new, 10 modified, nothing deleted, **zero new dependencies**
(`package.json` is untouched).

The archive mirrors your project structure — extracting it over the project root
puts every file where it belongs.

---

## Before you start

```bash
git checkout -b phase-4-admin
git status            # confirm clean
```

The 10 modified files are listed at the bottom. If you have local changes to any
of them, resolve that first.

---

## 1. Extract

```bash
unzip nnino-phase4.zip -d /tmp/phase4
cp -R /tmp/phase4/nnino-phase4/. /path/to/your/project/
```

Then check the diff before doing anything else:

```bash
git status
git diff prisma/schema.prisma lib/rbac.ts lib/audit.ts
```

`PHASE-4-REPORT.md` and this file land at the project root — move or delete them
if you keep docs elsewhere.

---

## 2. Regenerate the Prisma client

```bash
npm run db:generate
```

**Do this before anything else.** The schema gained columns and relations; until
you regenerate, `tsc` will report errors on the new SEO and `sourceNote` fields
that are not real.

---

## 3. Apply the migration

The migration is hand-written to match your existing migration style. It is
strictly additive — no column is dropped, renamed or retyped, and no data is
deleted.

**Back up first anyway:**

```bash
pg_dump "$DATABASE_URL" > backup-before-phase4.sql
```

Then:

```bash
npx prisma migrate deploy     # production
# or, in development:
npm run db:migrate
```

### What it does

- Adds nullable columns to `Product`, `Collection`, `Artist`, `Media`, `Setting`
- Adds two foreign keys for the new OG image references, both `ON DELETE SET NULL`
- **De-duplicates `ProductImage` on `(productId, mediaId)`, then adds a unique
  index.** Expected to be a no-op — nothing in Phases 1–3 could create a
  duplicate. It is there because Phase 4 adds an "associate existing media"
  button, and the constraint is what makes a double-click harmless. It keeps the
  lowest `ctid` of each group, preserving whichever row was inserted first along
  with its `position` and `isPrimary` flag
- Adds nine indexes supporting the new server-side list queries

To see exactly what will run:

```bash
cat prisma/migrations/20260813090000_phase4_admin/migration.sql
```

### While you are in there

Your Phase 1 constraints are still missing from the database —
`prisma/sql/0002_constraints.sql` was never pasted into the Phase 1 migration, so
the CHECK constraints and partial unique indexes do not exist. Unrelated to Phase
4, but it means the database currently permits states the application assumes
cannot occur. Worth applying in the same maintenance window.

---

## 4. Verify

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
npm run db:verify
```

**Expected: `npm run test` reports 140 passing across 8 files** (was 38 across 4).

`tsc`, `lint` and `test` were verified clean in the build sandbox. `build` and
`db:verify` were **not** — the sandbox's Turbopack binary segfaults on a single
CPU, which I confirmed reproduces on your untouched Phase 1–3 code, and there was
no Postgres instance. Those two gates are genuinely on you.

If `npm run build` fails, the likely causes in order:

1. `npm run db:generate` was skipped (step 2)
2. The migration has not been applied, so a query references a column that does
   not exist yet
3. A real bug — send me the output

---

## 5. Click through

Log in as an `OWNER` and confirm:

- [ ] `/admin` — figures are real. With no orders, everything reads zero
- [ ] `/admin/products` — filter by **"Published but not purchasable"**. This is the most useful view in the whole build: live pieces nobody can buy
- [ ] Open a piece — the purchasability panel should agree with what
      `/products/<slug>` actually shows a customer
- [ ] `/admin/media` — upload a JPEG. Then rename a `.txt` to `.jpg` and try
      again; it must be **refused** by content, not extension
- [ ] `/admin/team` — Marion Moyo's record shows the source conflict banner
- [ ] `/admin/settings` — no secret appears anywhere. The credentials panel shows
      configured/not-configured only
- [ ] `/admin/audit` — entries appear for everything you just did

Then log in as a non-OWNER and confirm `/admin/audit` is **not** in the
navigation and that typing the URL directly is refused.

Finally, check the public site is untouched: `/`, `/shop`, `/collections`,
`/products/<slug>`, `/about`, `/family`, `/custom`, `/contact`.

---

## 6. Before launch

`MEDIA_DRIVER=local` writes into `public/media`, which **does not survive a
Vercel redeploy** — uploaded images vanish. The media page says so in the UI.

Switching is configuration only, no code change:

```
MEDIA_DRIVER=s3
MEDIA_S3_BUCKET=…
MEDIA_S3_REGION=…
MEDIA_S3_ACCESS_KEY_ID=…
MEDIA_S3_SECRET_ACCESS_KEY=…
MEDIA_S3_PUBLIC_URL=https://…
```

`lib/env.ts` refuses to boot on a half-configured bucket rather than failing
mid-upload. Note that `next.config.ts` derives its image `remotePatterns` from
`MEDIA_S3_PUBLIC_URL`, so that variable must be present at **build** time, not
just runtime.

---

## Rolling back

Code:

```bash
git checkout main && git branch -D phase-4-admin
```

Database — the migration is additive, so the old code runs fine against the new
schema and you can usually leave it. If you must reverse it, the unique index is
the only piece that cannot be recreated identically afterwards (the de-dup is not
reversible):

```sql
DROP INDEX "ProductImage_productId_mediaId_key";
ALTER TABLE "Product"    DROP CONSTRAINT "Product_ogImageId_fkey";
ALTER TABLE "Collection" DROP CONSTRAINT "Collection_ogImageId_fkey";
ALTER TABLE "Product"    DROP COLUMN "seoTitle", DROP COLUMN "seoDescription", DROP COLUMN "ogImageId";
ALTER TABLE "Collection" DROP COLUMN "seoTitle", DROP COLUMN "seoDescription", DROP COLUMN "ogImageId";
ALTER TABLE "Artist"     DROP COLUMN "sourceNote";
ALTER TABLE "Media"      DROP COLUMN "originalFilename";
ALTER TABLE "Setting"    DROP COLUMN "updatedBy";
-- indexes drop with the columns; the nine standalone ones can stay harmlessly
```

---

## The 10 modified files

Everything else in the archive is new.

| File | Change |
|---|---|
| `prisma/schema.prisma` | New columns, one unique constraint, nine indexes. Additive |
| `lib/rbac.ts` | Added `customer:write`; granted to OWNER, MANAGER, ORDER_MANAGER |
| `lib/audit.ts` | 17 actions added to the closed union |
| `lib/admin-sections.ts` | Phase 4 sections marked `built: true`; `/admin/inquiries` and `/admin/audit` added |
| `app/admin/page.tsx` | Rewritten as the dashboard |
| `app/admin/products/page.tsx` | Rewritten — search, filters, pagination |
| `app/admin/collections/page.tsx` | Rewritten |
| `app/admin/team/page.tsx` | Rewritten |
| `app/admin/orders/page.tsx` | **Pagination added.** Previously capped at 100 rows, making the rest unreachable |
| `app/admin/publish-actions.ts` | **Bug fix.** Recorded `product.publish` against a `Collection` entity; now records `collection.published` / `collection.unpublished` |

No public route, public query or commerce logic was modified.
