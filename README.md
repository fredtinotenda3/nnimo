# "use server" invalid export — fix

## The bug

Next.js requires that every top-level export of a `"use server"` file be
either an async function or a type. Five files under `app/admin/` were
re-exporting `IDLE_FORM_STATE` — an object, not a function — as a convenience
so a couple of call sites could import it from the actions file instead of
`@/lib/admin/forms`:

```ts
export { IDLE_FORM_STATE };
```

This is exactly the bug already fixed in `media/actions.ts` and
`team/actions.ts` in an earlier pass — except `team/actions.ts` still had it
(that earlier fix only addressed the try/catch bug in
`updateTeamMemberAction`, not this export). Four more files had the same
pattern.

## Files fixed (5)

- `app/admin/team/actions.ts`
- `app/admin/customers/actions.ts`
- `app/admin/content/actions.ts`
- `app/admin/settings/actions.ts`
- `app/admin/inquiries/actions.ts`

In each: removed `export { IDLE_FORM_STATE };`, and removed `IDLE_FORM_STATE`
from the import list from `@/lib/admin/forms` (confirmed unused elsewhere in
every one of these files — each had exactly two occurrences, the import and
the re-export, before this change).

## Confirmed safe

Every component that uses `IDLE_FORM_STATE` alongside these actions
(`team-form.tsx`, `customer-form.tsx`, `content-block-form.tsx`,
`settings-form.tsx`, `inquiry-form.tsx`, and all the others across the admin)
already imports it directly from `@/lib/admin/forms`, not from any actions
file — checked across every `.ts`/`.tsx` file in the project. No other file
imports `IDLE_FORM_STATE` from any of these five action files, so removing
the re-export breaks nothing.

Also swept every other `"use server"` file under `app/admin/` (14 total) for
the same pattern — no other file had a non-async, non-type export. The only
other non-function export anywhere in these files is
`export type AdminActionState = { error: string | null };` in
`app/admin/orders/actions.ts`, which is a type export and is explicitly
allowed by Next.js's "use server" rule — left untouched, as instructed.

No business logic, RBAC, S3, payments, analytics, or schema code was
touched — only the export statement and its now-unused import in each file.

## Checks run

- `npx tsc --noEmit` — could not complete in this sandbox for the same
  reason as the last two rounds: `prisma generate` needs
  `binaries.prisma.sh`, which this sandbox's network doesn't allow, so the
  generated Prisma client (`lib/generated/prisma`) doesn't exist here and the
  whole codebase fails to type-check on that one pre-existing, unrelated
  condition. As a substitute, all five changed files were syntax-checked
  with esbuild — all passed. **Please run `npm run db:generate && npm run
  typecheck` yourself** before deploying; this class of bug (an invalid
  "use server" export) is exactly the kind of thing `tsc`/Next's build step
  would have caught, so it's worth confirming clean.
- `npx eslint <the five files>` — clean, no errors or warnings.
- `npx vitest run` — full suite: 439 tests passed. The same 2 pre-existing
  test files fail on the missing-generated-client condition above, unrelated
  to this change.
