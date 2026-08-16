import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Derives the bucket key a rate limiter counts against.
 *
 * WHICH HEADER TO TRUST
 *
 * `x-forwarded-for` is a client-settable header. Anything behind a proxy that
 * does not overwrite it can be spoofed by sending your own value, which would
 * let an attacker land every request in a different bucket and defeat the
 * limiter entirely.
 *
 * On Vercel the platform sets `x-forwarded-for` itself and strips whatever the
 * client sent, and the LEFTMOST entry is the real client. That is only true
 * because Vercel terminates the connection — behind a different proxy the
 * correct entry may be the rightmost, or a different header entirely. The
 * `TRUSTED_PROXY_HEADER` escape hatch exists for that case rather than assuming
 * one topology is universal.
 *
 * WHY IT IS HASHED
 *
 * An IP address is personal data under GDPR and Zimbabwe's Data Protection Act.
 * The limiter only needs a stable, unique bucket — it never needs to know which
 * address. Hashing with a server-side salt gives the first and denies the
 * second, so a leaked rate-limit store is not a list of visitor IPs.
 */

function salt(): string {
  // AUTH_SECRET is already required, already high-entropy and already
  // server-only. Reusing it avoids a second secret nobody would rotate.
  return process.env.AUTH_SECRET ?? "nnino-unsalted-development-only";
}

export function hashIdentity(raw: string): string {
  return createHash("sha256").update(`${salt()}:${raw}`).digest("hex").slice(0, 32);
}

/** Extracts the client address from a Headers instance (route handlers). */
export function clientAddressFrom(headerList: Headers): string {
  const configured = process.env.TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  if (configured) {
    const value = headerList.get(configured);
    if (value) return value.split(",")[0]?.trim() || "unknown";
  }

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return headerList.get("x-real-ip")?.trim() || "unknown";
}

/** Hashed client identity, for use inside a server action or server component. */
export async function clientIdentity(): Promise<string> {
  const headerList = await headers();
  return hashIdentity(clientAddressFrom(headerList));
}

/** Hashed client identity from an explicit Headers instance. */
export function clientIdentityFrom(headerList: Headers): string {
  return hashIdentity(clientAddressFrom(headerList));
}
