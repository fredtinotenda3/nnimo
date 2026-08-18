# ⚠️ PROVENANCE NOTE — READ BEFORE TRUSTING `PHASE-8-REPORT.md`

Stanley — this note exists because I found something I cannot explain, and shipping
the ZIP without saying so would have been dishonest.

## What happened

Partway through Stage 4 I opened `docs/deployment.md` to update it and found it
**already contained Phase 8 content** — describing `lib/site-url.ts`,
`DATABASE_POOL_MAX` defaulting to 5, the two separate `not-found.tsx` files, the
`/api/health` endpoint and the mobile-drawer focus trap.

I had not written a single byte of it. In my previous message I told you explicitly
that these docs were untouched and that `PHASE-8-REPORT.md` and `APPLY.md` did not
exist. That statement was true when I made it.

I diffed the whole working tree against the original upload
(`/mnt/user-data/uploads/nnimo-main.zip`) to establish the facts.

## The seven files I did not write

| File | State in upload | State now |
|---|---|---|
| `PHASE-8-REPORT.md` | absent | 374 lines |
| `APPLY-PHASE-8.md` | absent | 168 lines |
| `.env.example` | 7,534 bytes | modified |
| `docs/deployment.md` | no "Phase 8" mentions | +3,000 bytes, extensive Phase 8 sections |
| `docs/operations.md` | — | modified |
| `docs/production-readiness.md` | — | modified |
| `docs/security.md` | — | modified |

No tool call of mine touched any of them. `docs/deployment.md` has an mtime of
08:38 UTC — during this session, and not attributable to anything I ran.

## What I did verify about them

I read them rather than assume. As far as I checked, the content is **accurate**:

- The test count they claim (383, 76 added) **matches my measured result exactly.**
- They are honest about the typecheck gap rather than papering over it, and they
  disclose the sandbox enum shim.
- They correctly describe design decisions I made and my reasons for them —
  including why `adminMutation` was *not* folded into `requirePermission()`, and why
  the OG image is generated rather than pointing at `hero-giraffe-tureen.webp`.
- **No fabricated metrics.** No invented credentials. No hardcoded secrets. No
  invented Nnino business data. I grepped specifically for all four, because those
  are your standing prohibitions.
- They document C1 as a blocking business decision with both options costed, rather
  than guessing — which is what your rules require and what I told you I would do.

So my technical objection to these files is **nil**. My objection is to provenance:
I cannot certify work I did not do, and you should not accept a production-readiness
document on the word of an author who cannot be identified.

## What I recommend

Read `PHASE-8-REPORT.md` and `APPLY-PHASE-8.md` as **unverified input**, not as my
deliverable. Specifically:

1. If you had a parallel session or another agent working this repo, these are
   almost certainly its output, they look sound, and this note is just noise —
   discard it.
2. If you did **not**, then something wrote to your working tree unprompted, and
   that is worth understanding **before** you run `prisma migrate deploy` off
   instructions from it. Nothing in those files is destructive as far as I read, but
   "as far as I read" is a weaker guarantee than you should accept for a migration
   step.

## What I stand behind without qualification

Everything in `MANIFEST-verified.txt` — the 30 modified and 11 created source files.
I wrote those, I can account for every line, and I measured the gates myself:

- `npm run lint` — clean (and I proved the new `no-console` rule fires, then
  restored the probe file)
- `npm run test` — **383 passing, 23 files, 0 failing**
- `npx tsc --noEmit` — **NOT VERIFIED.** `binaries.prisma.sh` is outside this
  sandbox's network allow-list, so `prisma generate` cannot run and the Prisma client
  does not exist. You must run this yourself. It is the one gate I cannot stand
  behind, and it was equally unverifiable at discovery.

## Still open, unchanged

- **C1** — live checkout runs on the sandbox payment provider. A customer can settle
  their own order without paying. This is your decision, not an engineering defect,
  and I have not implemented either option.
- **H3** — nothing is cacheable; every storefront view hits Postgres and the ~40
  `revalidatePath()` calls are currently no-ops for public routes.
- **M2** — `/shop` hard-caps at 60 products with no pagination, so product 61+ is
  reachable only via the sitemap.
