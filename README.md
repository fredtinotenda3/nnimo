# Nnino team update — delivery package

Only changed/new files are included here (no `node_modules`, `.next`,
generated Prisma client, or untouched files). Copy these into your project
at the matching paths, overwriting the existing versions.

## Files

- `prisma/seed/source-data.ts` — **modified.** Added craft/bio/role/featured
  for all 10 team members, corrected "Eugene Nyahodza" → "Eugene Nyawodza".
- `prisma/seed.ts` — **modified.** `seedTeam()` now writes the full profile
  (craft, bio, featured, sourceNote) when creating a team member on a fresh
  database. Existing rows are still never overwritten by this file, by
  design — see `scripts/update-team-profiles.ts` for updating your live data.
- `scripts/update-team-profiles.ts` — **new.** One-off script to push the new
  bios into your existing production database. Run once — see
  `TEAM-UPDATE-GUIDE.md` §1.
- `package.json` — **modified.** Added one script:
  `"db:update-team": "dotenv -e .env -- tsx scripts/update-team-profiles.ts"`.
- `TEAM-UPDATE-GUIDE.md` — how to run the script and attach photos in Admin.
- `TEAM-IMAGE-PROMPTS.md` — per-photo assessment and AI editing prompts.
- `VERCEL-SSL-FIX.md` — the SSL warning explained, plus the real upload bug
  and its fix.

## Checks run

- `npx tsc --noEmit` — **could not run to completion in this sandbox.** The
  project's generated Prisma client (`lib/generated/prisma`) is produced by
  `prisma generate`, which needs to download an engine binary from
  `binaries.prisma.sh` — a domain this sandbox's network doesn't allow.
  Without that generated client, the *entire* codebase fails to type-check on
  an unrelated, pre-existing condition (missing module), not because of
  anything changed here. **Please run `npm run db:generate && npm run
  typecheck` yourself before deploying** — it should be clean.
- As a substitute, every changed/new `.ts` file was syntax-checked with
  esbuild (catches malformed syntax without needing type resolution) — all
  three passed.
- `npm run lint` (ESLint) — run directly against the three changed/new files:
  **clean, no errors or warnings.**
- `npm run test` (Vitest) — ran the full suite: **439 tests passed.** Two
  test files failed, but both failures are the same pre-existing
  missing-generated-client issue described above (`Cannot find module
  '@/lib/generated/prisma/enums'`), unrelated to these changes — confirmed by
  running `tests/admin-validation.test.ts` (the suite that references team
  member data directly) in isolation: **26/26 passed.**

## What's still manual

Photo editing/upscaling, uploading files through Admin → Media, and
attaching them to each team member all require a human in the browser (and,
for the photos, an external AI image tool) — see `TEAM-UPDATE-GUIDE.md` for
the exact steps.
