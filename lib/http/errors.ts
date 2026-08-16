import "server-only";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * The boundary between "what went wrong" and "what the caller is told".
 *
 * Phase 5H requires that users receive safe errors while operators keep enough
 * to diagnose. Those two requirements conflict unless something correlates them,
 * which is what the reference id does: the customer sees an opaque id, the log
 * line carries the same id plus the real cause, and support can join the two
 * without the error message ever containing a stack trace, a table name, a
 * connection string or a provider response.
 */

/**
 * An error whose message was written FOR the user.
 *
 * This is the distinction Phase 5H asks for between expected business errors and
 * unexpected failures. `CheckoutValidationError`, `FulfilmentTransitionError` and
 * `MediaUploadError` are all of this kind: their messages are deliberately
 * customer- or operator-facing and are safe to show verbatim. Anything that is
 * NOT one of these is treated as unexpected and replaced with a generic message.
 */
export class SafeError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "bad_request",
  ) {
    super(message);
    this.name = "SafeError";
  }
}

/** Errors whose `message` has been vetted as safe to display. */
const SAFE_ERROR_NAMES = new Set([
  "SafeError",
  "CheckoutValidationError",
  "FulfilmentTransitionError",
  "MediaUploadError",
  "MediaValidationError",
  "InsufficientStockError",
  "PaymentProviderNotConfiguredError",
]);

export function isSafeError(error: unknown): boolean {
  return error instanceof Error && SAFE_ERROR_NAMES.has(error.name);
}

export function newRequestId(): string {
  return randomUUID();
}

/**
 * Extracts a correlation id from the platform's tracing headers, falling back to
 * a fresh one.
 *
 * Vercel sets `x-vercel-id`; most proxies set `x-request-id`. Reusing the
 * platform's id means our log lines join to the platform's own request log
 * rather than sitting in a parallel universe.
 */
export function requestIdFrom(headers: Headers): string {
  return (
    headers.get("x-request-id")?.slice(0, 200) ??
    headers.get("x-vercel-id")?.slice(0, 200) ??
    newRequestId()
  );
}

export type SafeErrorResponse = {
  message: string;
  code: string;
  status: number;
  requestId: string;
};

const GENERIC_MESSAGE =
  "Something went wrong on our side. Please try again — if it keeps happening, quote the reference below.";

/**
 * Logs the real error and returns only what is safe to send back.
 *
 * Never swallows: every call produces a log line. That is the difference between
 * this and a bare try/catch that returns a friendly string — the friendly string
 * is what the user sees, and the log line is what makes the failure findable.
 */
export function toSafeError(
  error: unknown,
  context: { event: string; requestId?: string } & Record<string, unknown>,
): SafeErrorResponse {
  const requestId = context.requestId ?? newRequestId();
  const { event, ...rest } = context;

  if (isSafeError(error)) {
    const safe = error as SafeError;
    logger.warn(event, { ...rest, requestId, outcome: "rejected", reason: safe.message });
    return {
      message: safe.message,
      code: typeof safe.code === "string" ? safe.code : "bad_request",
      status: typeof safe.status === "number" ? safe.status : 400,
      requestId,
    };
  }

  logger.error(event, { ...rest, requestId, outcome: "failed", error });
  return { message: GENERIC_MESSAGE, code: "internal_error", status: 500, requestId };
}

/** JSON body for a route handler. Shape is stable so clients can rely on it. */
export function errorBody(safe: SafeErrorResponse) {
  return { error: { message: safe.message, code: safe.code, requestId: safe.requestId } };
}
