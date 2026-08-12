import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * INTEGRATION tests — require a real, migrated PostgreSQL database.
 *
 * Differences from the unit config that matter:
 *
 * - `@/lib/db` is NOT stubbed. The real Prisma Client is used, against
 *   TEST_DATABASE_URL (tests/integration/helpers.ts refuses to run unless that
 *   database's name contains "test").
 * - `server-only` still needs aliasing: the domain modules import it, and it
 *   throws outside a React Server Component. The guarantee it provides is a
 *   build-time one and is still enforced by `next build`.
 * - `fileParallelism: false` and `singleFork`. These tests contend for the same
 *   rows and exercise deliberate race conditions; running files in parallel would
 *   produce failures that are artefacts of the harness rather than the code.
 * - A longer timeout, because concurrency tests wait on real row locks.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
