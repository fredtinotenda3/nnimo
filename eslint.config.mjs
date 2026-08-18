import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat config, imported directly.
 *
 * Next.js 16 ships @next/eslint-plugin-next as flat config by default, so the
 * FlatCompat shim from the older `.eslintrc` era is not needed — and in fact
 * throws ("Converting circular structure to JSON") when pointed at an already-flat
 * config. Both entry points export a Linter.Config[] that spreads straight in.
 *
 * Note also that `next build` no longer runs linting in v16, so this must be its
 * own CI step. See `npm run verify`.
 */
const eslintConfig = [
  {
    ignores: [
      // Generated Prisma Client — regenerated, never edited, never linted.
      "lib/generated/**",
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,

  /**
   * PHASE 8 (finding H4). `console.*` is banned in application code.
   *
   * Thirteen `console.error(..., error)` calls had accumulated across the admin
   * server actions, lib/admin/media.ts and lib/audit.ts. Each one bypassed
   * lib/logger.ts, which means each one bypassed key-based redaction, PII
   * masking, credential scrubbing, the level filter and the correlation id. They
   * were replaced by hand — but a fix that relies on nobody adding the fourteenth
   * is not a fix, so this rule is the actual regression test. It is the one
   * "security fix with a regression test" in this phase that cannot be expressed
   * as a Vitest case, because what is being asserted is the absence of a call
   * across the whole tree.
   *
   * Scoped to app/, components/ and lib/ so the allowances below are narrow and
   * each one is justified rather than blanket.
   */
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },
  {
    /**
     * lib/logger.ts is the sink itself — it writes to process.stdout/stderr
     * directly rather than through console, so it needs no exemption. This entry
     * covers the two places where writing to the console IS the intended
     * behaviour:
     *
     *   lib/email/dev-transport.ts  the "dev" EMAIL_TRANSPORT deliberately prints
     *                               the message instead of sending it, and it is
     *                               meant to be readable in a terminal rather
     *                               than shaped as JSON.
     */
    files: ["lib/email/dev-transport.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    /**
     * Scripts and the seed are operator-facing CLI tools. Their whole output
     * contract is human-readable console text, and they never run inside a
     * request, so there is no correlation id to carry and no platform log to
     * pollute.
     */
    files: ["scripts/**/*.{ts,mjs,js}", "prisma/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
