/**
 * Stand-in for lib/db in unit tests.
 *
 * The suites here cover pure domain logic — money arithmetic, purchasability,
 * the state machine, total derivation — none of which touch the database. But
 * those modules live alongside ones that do, so importing them would otherwise
 * construct a real PrismaClient and a pg Pool with no DATABASE_URL.
 *
 * Any property access throws, loudly. If a future test accidentally exercises a
 * database path, it fails with a clear message instead of silently passing
 * against a mock that does nothing.
 */
const fail = (): never => {
  throw new Error(
    "lib/db was called from a unit test. These suites cover pure logic only; " +
      "database behaviour belongs in an integration test against real Postgres.",
  );
};

export const db = new Proxy({} as Record<string, unknown>, {
  get: () => new Proxy({}, { get: () => fail }),
});
