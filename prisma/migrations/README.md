# Migrations

There is deliberately **no checked-in initial migration**.

`prisma migrate dev` generates the SQL by diffing the schema against a live
Postgres shadow database. Hand-writing ~700 lines of DDL and committing it
unverified would mean the first `migrate deploy` in staging is also the first
time anyone finds out whether it is correct.

## Creating the initial migration

```bash
# 1. Point DATABASE_URL and DIRECT_DATABASE_URL at a Postgres instance.
#    Locally: docker compose up -d  (see docs/architecture/local-development.md)

# 2. Generate the client (Prisma 7 no longer does this implicitly).
npm run db:generate

# 3. Create and apply the initial migration.
npx prisma migrate dev --name init
```

## Then add the extra constraints

`prisma/sql/0002_constraints.sql` holds the CHECK constraints and partial unique
indexes that `schema.prisma` cannot express. **Paste its contents onto the end of
the generated `migrations/<timestamp>_init/migration.sql`** so they travel with
`migrate deploy` and are applied on every environment automatically.

Applying them by hand instead works, but only until the first person deploys to
a new environment and forgets:

```bash
psql "$DIRECT_DATABASE_URL" -f prisma/sql/0002_constraints.sql
```

## Deploying

```bash
npm run db:deploy   # prisma migrate deploy — never `migrate dev` in production
```

Run migrations against `DIRECT_DATABASE_URL` (the unpooled connection). Pooled
connections (PgBouncer in transaction mode, which is what Neon and Supabase hand
out by default) cannot run the advisory locks and DDL that migrations need.
