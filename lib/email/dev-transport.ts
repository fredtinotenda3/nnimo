import "server-only";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Development transport: writes the message to the server log instead of sending.
 *
 * Deliberately not a silent no-op — during development you need to see the exact
 * subject and body a customer would receive, and a swallowed email is a bug that
 * only surfaces in production.
 */
export const devTransport: EmailTransport = {
  id: "dev-log",
  isConfigured() {
    return true;
  },
  async send(message: EmailMessage) {
    console.info(
      [
        "",
        "──────── EMAIL (development transport — not sent) ────────",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        message.replyTo ? `Reply-To: ${message.replyTo}` : null,
        "",
        message.text,
        "─────────────────────────────────────────────────────────",
        "",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    );
    return { id: null };
  },
};
