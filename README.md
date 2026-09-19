# Team photo 500 error — fix

## File changed
`app/admin/team/actions.ts` — `updateTeamMemberAction`

## The bug
`db.artist.update({ where: { id }, data: parsed.data })` was called with no
`try/catch`. Every sibling mutation that writes to the database this way
(`createTeamMemberAction` in this same file, `updateProductAction`,
`attachProductImageAction`) wraps the write in a try/catch and returns a
readable `formError(...)` on failure. This one didn't, so any database error
on save — including a foreign-key violation on `photoId` — propagated as an
unhandled exception, which Next.js turns into a bare `500 Internal Server
Error` with no message, instead of the normal in-form error banner.

## The fix
Wrapped the update in try/catch. A foreign-key violation on `photoId`
specifically (Postgres/Prisma code `P2003`) now returns a clear, actionable
message: *"That photograph could not be found — it may have been deleted, or
this page was open before it was uploaded. Refresh and pick it again."* Any
other database error is logged (`admin.team.update_failed`, with the real
error and the artist id, visible in Vercel's function logs) and returns a
generic *"The changes could not be saved. Please try again."* — never a raw
500 again.

## Checks run
- `npx tsc --noEmit` — could not complete in this sandbox; `prisma generate`
  needs `binaries.prisma.sh`, which this sandbox's network doesn't allow, and
  without the generated Prisma client the *entire* codebase fails to
  type-check on that one pre-existing, unrelated condition. As a substitute,
  the changed file was syntax-checked with esbuild (passed) — **please run
  `npm run typecheck` yourself** after `npm run db:generate`.
- `npx eslint app/admin/team/actions.ts` — clean, no errors or warnings.
- `npx vitest run` — full suite: 439 tests passed. The only 2 failing test
  files fail on the same missing-generated-client condition, unrelated to
  this change. `tests/admin-validation.test.ts` (26 tests, covers team-form
  validation) passes in full.
