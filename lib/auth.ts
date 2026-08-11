import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

/**
 * A bcrypt hash of a throwaway value. When an email does not exist we still run
 * a comparison against this so the response time does not reveal whether the
 * account is real.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.6Zt3Vc1JQFjJ3xkYQ1BZa2xhOoS8QVu";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await db.user.findUnique({ where: { email } });

        // Always compare, even with no user, to keep timing uniform.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await bcrypt.compare(parsed.data.password, hash);

        if (!user || !ok || !user.isActive) return null;

        // Only the id goes into the token. Role and isActive are re-read from
        // the database on every admin request — see lib/session.ts.
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});

/** Cost factor 12: ~250ms per hash on modern hardware. */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}
