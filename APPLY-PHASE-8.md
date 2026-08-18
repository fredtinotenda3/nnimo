# APPLY — Phase 8

Final launch hardening. **Additive and reversible**, with one exception that is
called out in step 0 because it can stop a deploy.

No feature was added, no route was removed, no schema change, no migration, no new
dependency. `package.json` and `package-lock.json` are untouched.

---

## 0. ⚠️ DO THIS FIRST — check one environment variable

**`NEXT_PUBLIC_SITE_URL` is now required in production, must be `https`, and must not
be a loopback host.** If it is missing or wrong, the build or the first render will
**fail** with a `SiteUrlConfigurationError`.

```
Vercel → your project → Settings → Environment Variables → Production
NEXT_PUBLIC_SITE_URL = https://nnino.vercel.app
```

(Substitute the real production origin.)

This is the intended behaviour, not a regression. Before Phase 8, three files each
fell back to `http://localhost:3000`, so an absent value silently published a
sitemap, canonical tags and a `robots.txt` full of localhost URLs — with no error and
no log line, and no symptom until the site had already indexed badly.

**If it is already set correctly, nothing changes for you.** Check anyway; it takes
ten seconds and it is the one thing in this phase that can break a working deploy.

---

## 1. Unpack

Extract the archive over the repository root, preserving paths.

**Nothing needs to be deleted this time.** Unlike Phase 5, no file was removed, so
there is no `rm` step.

The archive contains only created and modified files. `node_modules`, `.next`,
`.git`, `lib/generated/`, `package-lock.json` and every untouched Phase 1–7 file are
excluded.

> **Do not create `lib/generated/prisma/enums.ts` by hand.** A mechanically-derived
> stub was used inside the build sandbox to work around a blocked Prisma engine
> download; it is deliberately absent from this archive. `npx prisma generate`
> produces the real client.

---

## 2. Verify — in this order

```bash
npm ci
npx prisma generate
npx tsc --noEmit        # ← THE IMPORTANT ONE. See below.
npm run lint
npm run test
```

Expected:

| Command | Expected | Verified during Phase 8? |
|---|---|---|
| `npm ci` | clean | ✅ yes |
| `npx prisma generate` | client written to `lib/generated/prisma` | ❌ **no — blocked in sandbox** |
| `npx tsc --noEmit` | **zero errors** | ❌ **no — blocked in sandbox** |
| `npm run lint` | zero findings | ✅ yes |
| `npm run test` | **383 passing** (was 307) | ✅ yes |

### Why `tsc` is the one to watch

`npx prisma generate` could not run in the environment this phase was built in — the
Prisma engine download host returns 403. Without the generated client, `tsc` reports
80 errors, all of them cascading from the missing module rather than from the code.

**So TypeScript was never compiled against these changes.** Lint and the 383 tests
were genuinely executed; the typecheck was not. If `tsc` reports anything, it is a
real finding and I want to see it — the most likely candidates are the new
`requireMutationPermission` import in the ten admin action files and the `ref` types
in `components/layout/site-header.tsx`.

### Then, with a database

```bash
npm run build
npm run db:verify
```

Neither was run in the sandbox. `db:verify` should be unchanged from Phase 7 — this
phase added no migration and no database object.

---

## 3. Manual checks that automation cannot cover

After deploying, work through the smoke-test list in `docs/deployment.md`. Phase 8
extended it with items 16–23. The four worth doing immediately:

1. **`curl -s https://…/api/health`** → `200` and `{"status":"ok",…}`. This is the
   best single post-deploy check; it is the only one that proves the running app can
   reach Postgres.
2. **Visit a URL that does not exist** → branded Nnino 404, not the grey Next.js
   default. Do this twice: `/nonsense` and `/products/nonsense` hit two different
   files.
3. **Paste the homepage URL into a WhatsApp draft** → a preview card with an image
   should render. Before Phase 8 this was a blank grey panel.
4. **Open the mobile menu and press Tab repeatedly** → focus must stay in the drawer;
   `Escape` must close it and return focus to the hamburger.

**One check that must not be skipped and cannot be automated:** on the homepage hero,
run a contrast checker over the transparent-header navigation text against the
photograph behind it. The palette tokens are AA on the warm background, but the
over-hero state renders `warm-white/80` on whatever image is loaded, and that is a
per-photograph property.

---

## 4. Sign in and confirm nothing broke

`lib/auth.config.ts` now states the session cookie configuration explicitly instead
of inheriting it. **The cookie name is unchanged, so existing sessions survive** — no
operator is signed out by this deploy. Confirm anyway:

- Existing session still works at `/admin` without re-authenticating.
- Sign out, sign in again.
- Save something in `/admin/products` — this exercises the new
  `requireMutationPermission` path on a real write.

If sign-in breaks, the cause is in `lib/auth.config.ts` and reverting that one file
restores Phase 7 behaviour.

---

## 5. Rolling back

Every change is file-level and additive. There is no migration and no data change, so
rollback is reverting files.

| To undo | Revert | Effect |
|---|---|---|
| Everything | promote the previous Vercel deployment | Full Phase 7 behaviour |
| Site-URL strictness | `lib/site-url.ts`, `lib/env.ts`, `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts` | Back to the silent localhost fallback |
| Admin mutation limiting | `lib/session.ts` + the 10 action files | Rule returns to being defined-but-unused |
| Connection pool bound | `lib/db.ts` | Back to node-postgres' default of 10 per instance |
| `no-console` rule | `eslint.config.mjs` | Lint stops guarding the logger |

Deleting the new files (`app/not-found.tsx`, `app/**/error.tsx`,
`app/api/health/route.ts`, `app/opengraph-image.tsx`, `app/manifest.ts`) restores the
previous defaults with no side effects.

---

## 6. Still open after this phase

Three items, all documented rather than fixed:

1. **🚫 Checkout runs on the sandbox payment provider.** A customer can settle their
   own order without paying. **This needs your decision** — two costed options are in
   `docs/production-readiness.md`, blocker 0. Until it is decided, do not advertise
   the site as a shop.
2. **Nothing is cacheable** (`force-dynamic` everywhere). Deferred to Phase 8b; it
   needs the cart badge moved out of the server-rendered layout, which is the one
   change in the audit that cannot be made reversible.
3. **`/shop` shows at most 60 products** with no pagination, so published product 61+
   is unreachable from the UI while still being in `sitemap.xml`. Deferred with the
   above — same surface, same UX decision.
