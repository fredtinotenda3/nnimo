# What changed

## `app/admin/media/actions.ts`

Removed one line:

```ts
export { IDLE_FORM_STATE };
```

`app/admin/media/actions.ts` has `"use server"` at the top, which means every export from the file must be an async function (or a type) — Next.js enforces this strictly at build time on Vercel, which is what produced:

```
Error: A "use server" file can only export async functions, found object.
POST /admin/media 500
```

`IDLE_FORM_STATE` is a plain object (`{ status: "idle", message: null }`, defined in `lib/admin/forms.ts`), not a function, so re-exporting it from this Server Actions file broke the rule.

**No import updates were needed.** I checked every place in the codebase that imports from `@/app/admin/media/actions` (just `components/admin/media-forms.tsx`) — it already imports `IDLE_FORM_STATE` directly from `@/lib/admin/forms`, not through this re-export. Nothing else in the app or the test suite imports `IDLE_FORM_STATE` from the media actions module either. So the re-export was dead code with no consumers, and deleting it is the entire fix — there was nowhere to "move" it to, because the value it pointed to already lives in a proper non-server module (`lib/admin/forms.ts`).

The unused `IDLE_FORM_STATE` import was also removed from this file's import block, since it was only there to support the deleted re-export.

All three async actions (`uploadMediaAction`, `updateMediaAction`, `deleteMediaAction`) and the `AdminFormState` type import are unchanged. Upload validation, RBAC (`requireMutationPermission`), rate limiting, S3/media storage calls, and the audit log calls are untouched.

## Checks run

- `npx eslint app/admin/media/actions.ts` — clean.
- `npm run lint` (whole repo) — clean, zero warnings.
- `npx tsc --noEmit` — no errors related to this file. The repo shows the same 138 pre-existing errors as before this change, all caused by the Prisma client not being generated in this sandbox (`Cannot find module '@/lib/generated/prisma/enums'` — this environment's network allowlist blocks `binaries.prisma.sh`). Unrelated to this fix.
- `npm run test` — **394 of 394 tests pass**, same as before this change. The 2 failing suites fail only for the same Prisma-generation reason above.

## One thing worth flagging (not changed, per the requested scope)

The same pattern — a `"use server"` actions file re-exporting `IDLE_FORM_STATE` as a plain object — also exists in:

- `app/admin/team/actions.ts`
- `app/admin/customers/actions.ts`
- `app/admin/content/actions.ts`
- `app/admin/settings/actions.ts`
- `app/admin/inquiries/actions.ts`

None of these were touched, since the request scoped the fix to `app/admin/media/actions.ts` and the live error was specific to `POST /admin/media`. But this is the same bug shape, and in each case (checked the same way) nothing actually imports `IDLE_FORM_STATE` from the actions file — every consuming component already imports it straight from `lib/admin/forms.ts`. If Vercel's stricter production build starts exercising those routes, they're likely to throw the identical 500. Worth the same one-line fix (delete the re-export) on each, whenever convenient.
