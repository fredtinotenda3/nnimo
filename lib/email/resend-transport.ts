import "server-only";
import { logger } from "@/lib/logger";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Production transactional email over an HTTP API.
 *
 * WHY HTTP AND NOT SMTP
 *
 * An SMTP transport needs nodemailer, which needs a TCP socket held open long
 * enough to complete a session. Serverless functions are a poor fit for that:
 * the connection cannot be pooled across invocations and a cold start pays the
 * TLS handshake every time. Resend, Postmark and SES all expose a plain
 * `POST /emails`, which is one fetch with no dependency and no socket lifecycle.
 *
 * WHY RESEND SPECIFICALLY
 *
 * It is the shape implemented, not a recommendation the business has agreed to.
 * The transport interface (lib/email/types.ts) is what the application depends
 * on; swapping to Postmark or SES is a second file implementing `EmailTransport`
 * and one registry entry. Nothing outside this file knows which provider sends.
 *
 * ⚠️ THIS CANNOT BE ENABLED WITHOUT A SENDING DOMAIN.
 *
 * Nnino's published addresses are Gmail. Sending "from" a gmail.com address
 * through a third-party provider fails DMARC alignment, and the mail is
 * quarantined or rejected outright — an order confirmation that silently
 * vanishes is worse than one that was never attempted. A domain with SPF, DKIM
 * and DMARC published is a hard prerequisite, not a formality. See
 * docs/email-setup notes in docs/operations.md. Until then EMAIL_TRANSPORT stays
 * "dev" and `isConfigured()` below returns false.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export const RESEND_TRANSPORT_ID = "resend";

export const resendTransport: EmailTransport = {
  id: RESEND_TRANSPORT_ID,

  isConfigured(): boolean {
    return Boolean(process.env.EMAIL_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
  },

  async send(message: EmailMessage): Promise<{ id: string | null }> {
    const apiKey = process.env.EMAIL_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();

    if (!apiKey || !from) {
      throw new Error("EMAIL_API_KEY and EMAIL_FROM are required for the production transport.");
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // The body can echo the recipient and provider-side detail. It goes to the
      // log — where lib/logger.ts redacts the api key if it ever appears — and
      // never to a caller.
      const detail = await response.text().catch(() => "");
      logger.error("email.send_failed", {
        transport: RESEND_TRANSPORT_ID,
        status: response.status,
        detail: detail.slice(0, 500),
      });
      throw new Error(`Email provider responded ${response.status}`);
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };

    // Subject only — never the body, which contains the customer's order detail.
    logger.info("email.sent", {
      transport: RESEND_TRANSPORT_ID,
      subject: message.subject,
      providerId: body.id ?? null,
    });

    return { id: body.id ?? null };
  },
};
