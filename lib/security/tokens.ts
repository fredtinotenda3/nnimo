import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of two secrets.
 *
 * `a === b` on a string short-circuits at the first differing byte, and it also
 * returns immediately when the lengths differ. Both leak information through
 * response timing. That is only worth caring about where the comparison is
 * reachable by an attacker who can measure it and iterate — which describes
 * every one of the call sites here: the guest order access token, the sandbox
 * payment token, and provider webhook signatures.
 *
 * WHY HASH FIRST
 *
 * `crypto.timingSafeEqual` throws if the two buffers differ in length, so
 * calling it directly would require a length check — which is itself the leak we
 * are trying to close. Hashing both inputs to a fixed 32 bytes first removes the
 * length dependency entirely: every comparison does identical work regardless of
 * what was supplied. SHA-256 is used as a length equaliser here, not as a
 * security primitive in its own right.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
