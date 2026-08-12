// `server-only` throws by design when imported outside a React Server Component.
// Vitest runs plain Node, so it is aliased to this no-op (see vitest.config.ts).
// The guarantee it enforces is a build-time one and is still enforced by
// `next build`; this only stops it from breaking unit tests of pure functions.
export {};
