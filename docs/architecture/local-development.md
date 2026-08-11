# Local development

## Prerequisites

- Node.js 20.9+ (Next 16 requires it; 22 LTS recommended)
- Docker, for Postgres

## Setup

```bash
# 1. Dependencies
npm install

# 2. Environment
cp .env.example .env
npx auth secret          # writes AUTH_SECRET into .env
# then set SEED_OWNER_PASSWORD to something at least 12 characters

# 3. Postgres
docker compose up -d
# waits until healthy; data persists in the nnino-pgdata volume

# 4. Generate the Prisma Client
#    Prisma 7 no longer does this implicitly after migrate/db push.
npm run db:generate

# 5. Create and apply the initial migration
npx prisma migrate dev --name init

# 6. Add the constraints Prisma cannot express
#    Better: paste this file's contents into the generated migration.sql first.
#    See prisma/migrations/README.md.
psql "postgresql://nnino:nnino@localhost:5432/nnino" -f prisma/sql/0002_constraints.sql

# 7. Import the catalogue from the source documents
npm run db:seed

# 8. Run
npm run dev
```

Then sign in at `/login` with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` and
**change the password immediately**.

## Verification

```bash
npm run verify      # typecheck → lint → build
```

`next build` no longer runs ESLint in Next 16, so `npm run lint` must be its own
CI step. `npm run verify` chains all three.

## Production topology

| Concern | Choice | Note |
|---|---|---|
| Hosting | Vercel | App Router, `proxy.ts` deploys to the edge |
| Database | Neon or Supabase | Use the **pooled** URL for `DATABASE_URL` |
| Migrations | `DIRECT_DATABASE_URL` | Unpooled. PgBouncer in transaction mode cannot run migration advisory locks or DDL |
| Media | S3-compatible (R2 / S3 / B2) | `MEDIA_DRIVER=s3`; serve via CDN domain, keep the bucket private |
| Secrets | Vercel environment variables | `lib/env.ts` fails the boot if any are missing |

The local media driver writes to `public/media` and is **development only** — it
does not survive a redeploy on Vercel and cannot be shared between instances.
