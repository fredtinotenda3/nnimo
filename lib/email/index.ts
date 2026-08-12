import "server-only";
import { devTransport } from "@/lib/email/dev-transport";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Transport registry.
 *
 * Only the development transport exists. A production transport needs two things
 * that are not available yet:
 *
 *   1. A provider (Resend, SES, Postmark) and its API key.
 *   2. A SENDING DOMAIN. Nnino's addresses are Gmail, so there is no domain to
 *      publish SPF/DKIM/DMARC records against. Transactional mail sent as
 *      "@gmail.com" through a third-party provider fails authentication and lands
 *      in spam or is rejected outright. This is a real prerequisite, not a
 *      formality — order confirmations that silently vanish are worse than none.
 *
 * When a domain exists: add a transport implementing EmailTransport, register it
 * here, and set EMAIL_TRANSPORT. Nothing else changes.
 */
const TRANSPORTS: Record<string, EmailTransport> = {
  [devTransport.id]: devTransport,
};

function activeTransport(): EmailTransport {
  const preferred = process.env.EMAIL_TRANSPORT?.trim();
  if (preferred && TRANSPORTS[preferred]) return TRANSPORTS[preferred]!;
  return devTransport;
}

/**
 * Sends a transactional email.
 *
 * Never throws into the caller: an order must not fail because a confirmation
 * email could not be sent. Failures are logged for the operator.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await activeTransport().send(message);
  } catch (error) {
    console.error("[email] failed to send", message.subject, error);
  }
}

export * from "@/lib/email/types";
