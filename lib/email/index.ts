import "server-only";
import { devTransport } from "@/lib/email/dev-transport";
import { resendTransport, RESEND_TRANSPORT_ID } from "@/lib/email/resend-transport";
import { logger } from "@/lib/logger";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Transport registry.
 *
 * PHASE 5 CHANGES
 *
 *   1. A production transport now exists (lib/email/resend-transport.ts). It is
 *      still not ENABLED, because enabling it needs a sending domain Nnino does
 *      not yet have — see the warning in that file. The code being present and
 *      unconfigured is the honest state: the integration is finished up to the
 *      point where a business decision and a DNS record are required.
 *
 *   2. EMAIL_TRANSPORT="none" now genuinely sends nothing. Previously "none"
 *      was accepted by lib/env.ts but had no entry here, so it fell through to
 *      the dev transport and kept writing messages to the log — a setting that
 *      silently did the opposite of what it said.
 *
 *   3. Selecting a transport that is not configured no longer falls back
 *      silently. It logs, then falls back, so an operator who sets
 *      EMAIL_TRANSPORT=resend without an API key finds out from the logs rather
 *      than from a customer who never got their confirmation.
 */

/** Sends nothing, deliberately. For environments that must not emit mail. */
const nullTransport: EmailTransport = {
  id: "none",
  isConfigured: () => true,
  async send(message) {
    logger.debug("email.suppressed", { subject: message.subject, transport: "none" });
    return { id: null };
  },
};

const TRANSPORTS: Record<string, EmailTransport> = {
  [devTransport.id]: devTransport,
  [RESEND_TRANSPORT_ID]: resendTransport,
  none: nullTransport,
};

function activeTransport(): EmailTransport {
  const preferred = process.env.EMAIL_TRANSPORT?.trim();
  if (!preferred) return devTransport;

  const transport = TRANSPORTS[preferred];
  if (!transport) {
    logger.warn("email.unknown_transport", { requested: preferred, fallback: devTransport.id });
    return devTransport;
  }

  if (!transport.isConfigured()) {
    logger.error("email.transport_not_configured", {
      requested: preferred,
      fallback: devTransport.id,
      detail:
        "The selected transport is missing its configuration; mail is being written to the log instead of sent.",
    });
    return devTransport;
  }

  return transport;
}

/**
 * Sends a transactional email.
 *
 * Never throws into the caller: an order must not fail because a confirmation
 * email could not be sent. Failures are logged with enough context to resend by
 * hand — which is the operational recovery path documented in
 * docs/operations.md.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const transport = activeTransport();
  try {
    await transport.send(message);
  } catch (error) {
    logger.error("email.delivery_failed", {
      transport: transport.id,
      subject: message.subject,
      // Redacted to a mask by lib/logger.ts — enough to identify the customer in
      // support, not enough to be a PII dump in a log aggregator.
      to: message.to,
      error,
    });
  }
}

export * from "@/lib/email/types";
