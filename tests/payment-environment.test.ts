import { describe, expect, it } from "vitest";
import {
  isProductionSettlement,
  resolveDeploymentEnv,
  testPaymentsAllowed,
  usesDeprecatedSandboxFlag,
  type PaymentEnvSource,
} from "@/lib/payments/environment";

/**
 * The predicate that decides whether a caller-chosen payment outcome may touch a
 * real order.
 *
 * These assertions encode a safety decision rather than current behaviour. The
 * one that matters most is the last: an unlabelled production build is treated
 * as the real shop. Every other default in this codebase can be argued about;
 * that one cannot, because getting it wrong means a payment nobody made is
 * recorded as received.
 */
const env = (source: PaymentEnvSource): PaymentEnvSource => source;

describe("deployment environment resolution", () => {
  it("takes DEPLOYMENT_ENV over everything else", () => {
    expect(resolveDeploymentEnv(env({ DEPLOYMENT_ENV: "staging", NODE_ENV: "production" }))).toBe(
      "staging",
    );
    expect(
      resolveDeploymentEnv(env({ DEPLOYMENT_ENV: "production", NODE_ENV: "development" })),
    ).toBe("production");
  });

  it("ignores an unrecognised DEPLOYMENT_ENV rather than trusting it", () => {
    // A typo must not silently become a permissive environment.
    expect(resolveDeploymentEnv(env({ DEPLOYMENT_ENV: "prod", NODE_ENV: "production" }))).toBe(
      "production",
    );
    expect(resolveDeploymentEnv(env({ DEPLOYMENT_ENV: "", NODE_ENV: "production" }))).toBe(
      "production",
    );
  });

  it("accepts case and whitespace variation in DEPLOYMENT_ENV", () => {
    expect(resolveDeploymentEnv(env({ DEPLOYMENT_ENV: "  Staging " }))).toBe("staging");
  });

  it("treats any non-production build as development", () => {
    expect(resolveDeploymentEnv(env({ NODE_ENV: "development" }))).toBe("development");
    expect(resolveDeploymentEnv(env({ NODE_ENV: "test" }))).toBe("development");
    expect(resolveDeploymentEnv(env({}))).toBe("development");
  });

  it("still honours the deprecated staging flag", () => {
    expect(
      resolveDeploymentEnv(
        env({ NODE_ENV: "production", PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: "true" }),
      ),
    ).toBe("staging");
  });

  it("lets DEPLOYMENT_ENV override the deprecated flag", () => {
    expect(
      resolveDeploymentEnv(
        env({
          DEPLOYMENT_ENV: "production",
          NODE_ENV: "production",
          PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: "true",
        }),
      ),
    ).toBe("production");
  });

  it("defaults an unlabelled production build to production", () => {
    // The single most important line in this file.
    expect(resolveDeploymentEnv(env({ NODE_ENV: "production" }))).toBe("production");
    expect(
      resolveDeploymentEnv(
        env({ NODE_ENV: "production", PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: "false" }),
      ),
    ).toBe("production");
  });
});

describe("test payment permission", () => {
  it("forbids test payments only on the real shop", () => {
    expect(testPaymentsAllowed(env({ NODE_ENV: "development" }))).toBe(true);
    expect(testPaymentsAllowed(env({ DEPLOYMENT_ENV: "staging" }))).toBe(true);
    expect(testPaymentsAllowed(env({ NODE_ENV: "production" }))).toBe(false);
  });

  it("is the exact inverse of production settlement", () => {
    for (const source of [
      { NODE_ENV: "development" },
      { NODE_ENV: "production" },
      { DEPLOYMENT_ENV: "staging", NODE_ENV: "production" },
      {},
    ] satisfies PaymentEnvSource[]) {
      expect(isProductionSettlement(source)).toBe(!testPaymentsAllowed(source));
    }
  });
});

describe("deprecated flag reporting", () => {
  it("reports the flag only when it is actually doing the work", () => {
    expect(
      usesDeprecatedSandboxFlag(
        env({ NODE_ENV: "production", PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: "true" }),
      ),
    ).toBe(true);

    // Superseded by an explicit DEPLOYMENT_ENV — not the thing deciding.
    expect(
      usesDeprecatedSandboxFlag(
        env({
          DEPLOYMENT_ENV: "staging",
          NODE_ENV: "production",
          PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: "true",
        }),
      ),
    ).toBe(false);

    // Irrelevant outside a production build.
    expect(
      usesDeprecatedSandboxFlag(
        env({ NODE_ENV: "development", PAYMENTS_ALLOW_SANDBOX_IN_PRODUCTION: "true" }),
      ),
    ).toBe(false);
  });
});
