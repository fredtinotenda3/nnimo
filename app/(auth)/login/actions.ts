"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIdentity } from "@/lib/security/client-identity";
import { logger } from "@/lib/logger";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type LoginState = { error: string | null };

/**
 * Only ever returns a generic failure message. Distinguishing "no such account"
 * from "wrong password" would confirm which addresses have admin accounts.
 *
 * `redirectTo` is validated to be a local path so a crafted ?next= cannot turn
 * the login form into an open redirect.
 */
export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  /**
   * PHASE 5 FIX — login was completely unthrottled.
   *
   * Nothing bounded password guessing against the admin accounts. bcrypt cost 12
   * makes each attempt expensive for US, not for the attacker, so the cost of an
   * unthrottled endpoint is borne by our own CPU as well as by the accounts.
   *
   * This rule is the one that FAILS CLOSED (see lib/rate-limit.ts). If the
   * limiter backend is unreachable, login is refused rather than left open —
   * unlimited credential stuffing is a worse outcome than a temporary outage,
   * and this is the only endpoint where that trade goes that way.
   */
  const identity = await clientIdentity();
  const limit = await checkRateLimit("login", identity);
  if (!limit.allowed) {
    logger.warn("auth.login_rate_limited", { degraded: limit.degraded });
    return {
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  const requested = parsed.data.next ?? "/admin";
  const redirectTo =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/admin";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // The email is NOT logged. A failed-login log that records the attempted
      // address becomes a list of valid admin addresses the moment logs leak.
      logger.warn("auth.login_failed", { reason: error.type ?? "credentials" });
      return { error: "Those details did not match an active account." };
    }
    // signIn throws a redirect on success — let Next handle it.
    throw error;
  }

  return { error: null };
}
