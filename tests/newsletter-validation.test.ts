import { describe, expect, it } from "vitest";
import { newsletterSignupSchema } from "@/lib/marketing/newsletter";

describe("newsletterSignupSchema", () => {
  it("accepts a valid email with consent ticked", () => {
    const result = newsletterSignupSchema.safeParse({ email: "friend@example.com", consent: "on" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("friend@example.com");
      expect(result.data.consent).toBe(true);
    }
  });

  it("lower-cases and trims the email", () => {
    const result = newsletterSignupSchema.safeParse({ email: "  Friend@Example.com  ", consent: "on" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("friend@example.com");
  });

  it("rejects an invalid email", () => {
    const result = newsletterSignupSchema.safeParse({ email: "not-an-email", consent: "on" });
    expect(result.success).toBe(false);
  });

  it("rejects when consent is not ticked — an email address alone is not permission to send mail", () => {
    const missing = newsletterSignupSchema.safeParse({ email: "friend@example.com" });
    expect(missing.success).toBe(false);

    const explicitlyOff = newsletterSignupSchema.safeParse({ email: "friend@example.com", consent: undefined });
    expect(explicitlyOff.success).toBe(false);
  });

  it("only 'on'/'true'/'1' count as ticked, matching the admin checkbox convention", () => {
    for (const value of ["on", "true", "1"]) {
      expect(newsletterSignupSchema.safeParse({ email: "a@b.com", consent: value }).success).toBe(true);
    }
    for (const value of ["off", "false", "0", "no"]) {
      expect(newsletterSignupSchema.safeParse({ email: "a@b.com", consent: value }).success).toBe(false);
    }
  });

  it("rejects a filled honeypot at the schema level, same as commissionSchema/contactSchema", () => {
    // z.string().max(0) only accepts an empty string — a real bot filling
    // this field fails validation before submitToNewsletterAction's own
    // `if (parsed.data.website)` branch is ever reached, matching the
    // identical `website` field in lib/inquiries.ts.
    const filled = newsletterSignupSchema.safeParse({ email: "a@b.com", consent: "on", website: "spam" });
    expect(filled.success).toBe(false);

    const empty = newsletterSignupSchema.safeParse({ email: "a@b.com", consent: "on", website: "" });
    expect(empty.success).toBe(true);
  });
});
