"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";

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
      return { error: "Those details did not match an active account." };
    }
    // signIn throws a redirect on success — let Next handle it.
    throw error;
  }

  return { error: null };
}
