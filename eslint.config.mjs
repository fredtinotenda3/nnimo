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
];

export default eslintConfig;
