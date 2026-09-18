# Vercel upload error — investigation and fix

You asked whether the SSL warning in your Vercel logs is (a) a harmless
deprecation notice, or (b) the actual cause of image uploads failing.

**Both, sort of — but not connected to each other:**

- The SSL warning itself is **(a) harmless**. It is not why uploads fail.
- I found a **separate, real bug (b)** that almost certainly *is* why
  attaching Marion's photo failed. It's a media storage configuration issue,
  not a database issue.

Fix both below. Neither requires a code change — both are environment
variable changes on Vercel.

---

## 1. The SSL warning — harmless, cosmetic

```
Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and
'verify-ca' are treated as aliases for 'verify-full'...
```

This comes from `pg` (the Postgres driver Prisma uses under
`@prisma/adapter-pg`), not from your application code. It fires whenever
`DATABASE_URL` contains `sslmode=require` (the default Neon/Supabase pooled
connection string), and it's warning that a future version of `pg` will stop
treating `require` as equivalent to `verify-full` (full certificate
verification). It does not affect uploads, and it does not currently change
any connection behaviour — it's forward notice, not an error.

**To silence it now (optional, cosmetic only):**

Change `sslmode=require` to `sslmode=verify-full` in both connection strings.

1. In your Postgres provider's dashboard (Neon/Supabase), confirm the
   connection string supports `verify-full` — it should, since managed
   providers present a valid certificate chain by default.
2. On **Vercel** → Project → Settings → Environment Variables, update:
   - `DATABASE_URL` — change `?sslmode=require` to `?sslmode=verify-full`
     (keep everything else in the string the same)
   - `DIRECT_DATABASE_URL` — same change
3. Apply to Production (and Preview, if you use it).
4. Redeploy — env var changes need a new deployment to take effect on
   existing deployments.
5. **Important:** this must be set in Vercel's env vars, not just your local
   `.env`. Your local `.env` never reaches the deployed app; only what's
   configured in the Vercel dashboard (or via `vercel env add`) does.

If you'd rather leave it alone, that's fine too — it's a warning about a
future default, not a current problem.

---

## 2. The real cause of the upload failure

Look at `lib/media/local-driver.ts` in this codebase — it says, in its own
comment:

> Not for production. It does not survive a redeploy on Vercel (the
> filesystem is ephemeral) and it cannot be shared between instances.

`MEDIA_DRIVER` defaults to `"local"` when it isn't set at all (see
`lib/env.ts`). The local driver writes uploaded files to `public/media` on
disk (`lib/media/local-driver.ts`). **Vercel's serverless functions have a
read-only filesystem at runtime** (except `/tmp`, which isn't used here) — so
the moment someone tries to upload or attach an image in Admin → Media (or
attach a photo to a team member, which goes through the same upload path),
the write to `public/media` fails on Vercel's servers, even though it works
fine on your own machine or in local dev.

This matches your symptom exactly: it only shows up "when I try to attach an
image," not on every page load, and it has nothing to do with the SSL
warning showing up around the same time in the logs — they're two unrelated
things that happen to appear close together.

### The fix: switch to the S3 driver on Vercel

The codebase already has a working S3-compatible driver
(`lib/media/s3-driver.ts`) — it just needs to be turned on and given
credentials. This works with AWS S3, Cloudflare R2, or Backblaze B2.

**On Vercel → Project → Settings → Environment Variables (Production),
set:**

| Variable | Value |
|---|---|
| `MEDIA_DRIVER` | `s3` |
| `MEDIA_S3_BUCKET` | your bucket name |
| `MEDIA_S3_REGION` | your bucket's region (e.g. `auto` for R2) |
| `MEDIA_S3_ENDPOINT` | your S3-compatible endpoint URL |
| `MEDIA_S3_ACCESS_KEY_ID` | your access key |
| `MEDIA_S3_SECRET_ACCESS_KEY` | your secret key |
| `MEDIA_S3_PUBLIC_URL` | the public base URL that serves the bucket (a CDN domain, ideally) |

`lib/env.ts` enforces that **all five** `MEDIA_S3_*` variables are present
the moment `MEDIA_DRIVER=s3` is set — if even one is missing, the app will
refuse to boot with a clear error naming exactly which one, rather than
booting broken. So if you set `MEDIA_DRIVER=s3` and something is missing,
you'll know immediately from the Vercel deployment log, not from a customer
report later.

**The bucket itself should be private** (no public-read ACL) — the app signs
its own requests (`lib/media/sigv4.ts`) and serves images through
`MEDIA_S3_PUBLIC_URL`, which should point at a CDN in front of the bucket
(CloudFront, an R2 custom domain, or equivalent), not the bucket's raw
endpoint.

After setting these, redeploy, then retest attaching Marion's photo — see
`TEAM-UPDATE-GUIDE.md` for the exact admin steps.

### If you don't have an S3-compatible bucket yet

You'll need to create one before uploads can work on Vercel at all — there's
no way to make `MEDIA_DRIVER=local` durable on serverless hosting. Cloudflare
R2 is a reasonable low-cost option (S3-compatible API, generous free tier, no
egress fees). Whichever you choose, come back to this file for the exact
variable names above.

---

## 3. Confirming the other things you asked about

- **`MEDIA_DRIVER` set correctly on Vercel** — this is the actual bug (see
  above). It needs to be `s3` in Production, not left unset/`local`.
- **S3 credentials present if using s3** — `lib/env.ts` already guarantees
  this at boot time (see table above); if the app boots at all with
  `MEDIA_DRIVER=s3`, the credentials are present.
- **Server action body limit still 15mb** — confirmed unchanged in
  `next.config.ts` (`experimental.serverActions.bodySizeLimit: "15mb"`). This
  was not the problem here — the request body limit only matters if a file is
  large enough to be rejected before it reaches your validation code, and
  your team photos (~50–75 KB each) are nowhere near either the 15 MB body
  limit or the 12 MB `MAX_UPLOAD_BYTES` application limit
  (`lib/media/types.ts`). No change needed here.
