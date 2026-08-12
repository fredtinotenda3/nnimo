import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * UNIT tests only — pure domain logic, no database, no network.
 *
 * `@/lib/db` and `server-only` are aliased to stubs so importing a domain module
 * cannot construct a PrismaClient. The db stub throws on any property access, so
 * a test that accidentally reaches for the database fails loudly instead of
 * passing against a silent mock.
 *
 * Integration tests live in tests/integration and use vitest.integration.config.ts;
 * they need a real migrated PostgreSQL database and are excluded here.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      // Order matters: specific aliases must precede the "@" prefix.
      "@/lib/db": fileURLToPath(new URL("./tests/stubs/db.ts", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
