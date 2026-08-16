import "server-only";

/**
 * Structured application logging.
 *
 * Deliberately dependency-free. Vercel, CloudWatch, Datadog and Grafana Loki all
 * ingest JSON lines from stdout; adding pino or winston would buy formatting we
 * do not need and a transport layer the platform already provides. What actually
 * matters — and what console.log scattered through the codebase does NOT give
 * us — is a consistent shape, a correlation id, and redaction that runs before
 * anything reaches the log.
 *
 * REDACTION IS THE POINT. Phase 5I forbids logging passwords, payment secrets,
 * API keys, session tokens and unnecessary PII. Relying on every call site to
 * remember that is how secrets end up in logs, so the redaction happens here,
 * structurally, on the way out. A caller that passes an entire provider payload
 * gets it redacted rather than leaked.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Keys whose values are never logged, matched case-insensitively as substrings.
 *
 * Substring matching is deliberate: providers are inconsistent about naming
 * ("integrationkey", "integration_key", "IntegrationKey") and an exact-match
 * list would miss the one spelling that matters. A false positive costs a
 * redacted field in a log; a false negative costs a leaked credential.
 */
const REDACT_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "integrationkey",
  "integration_key",
  "privatekey",
  "private_key",
  "signature",
  "hash",
  "accesskey",
  "access_key",
  "credential",
  "sessionid",
  "session_id",
  "pan",
  "cvv",
  "cvc",
  "cardnumber",
  "card_number",
  "iban",
];

/** Keys that hold PII we log only as a shape, never a value. */
const PII_KEY_PATTERNS = ["email", "phone", "address", "line1", "line2", "guestname", "customername"];

export const REDACTED = "[redacted]";

function keyMatches(key: string, patterns: string[]): boolean {
  const normalised = key.toLowerCase().replace(/[-\s_]/g, "");
  return patterns.some((pattern) => normalised.includes(pattern.replace(/[-_\s]/g, "")));
}

/**
 * Masks an email or phone so a log line stays useful for support ("which
 * customer?") without becoming a PII dump. `mary@example.com` → `m***@example.com`.
 */
function maskPii(value: string): string {
  const at = value.indexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    return `${local.slice(0, 1)}***${value.slice(at)}`;
  }
  if (value.length <= 4) return REDACTED;
  return `***${value.slice(-3)}`;
}

const MAX_DEPTH = 6;
const MAX_ARRAY = 25;
const MAX_STRING = 2000;

/**
 * Recursively redacts a value before it is serialised.
 *
 * Depth and breadth are bounded so a hostile or merely enormous provider payload
 * cannot produce a multi-megabyte log line or recurse forever on a cyclic
 * object.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated: depth]";

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // Stacks are kept for the operator but never returned to a user — see
      // lib/http/errors.ts, which is what shapes the client-facing response.
      ...(process.env.NODE_ENV === "production" ? {} : { stack: value.stack }),
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const items = value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1, seen));
    return value.length > MAX_ARRAY ? [...items, `…${value.length - MAX_ARRAY} more`] : items;
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (keyMatches(key, REDACT_KEY_PATTERNS)) {
        output[key] = REDACTED;
        continue;
      }
      if (keyMatches(key, PII_KEY_PATTERNS) && typeof item === "string") {
        output[key] = maskPii(item);
        continue;
      }
      output[key] = redact(item, depth + 1, seen);
    }
    return output;
  }

  return "[unserialisable]";
}

export type LogContext = Record<string, unknown> & {
  /** Correlates every line emitted while handling one request. */
  requestId?: string;
};

function emit(level: LogLevel, event: string, context: LogContext = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return;

  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...(redact(context) as Record<string, unknown>),
  };

  const serialised = JSON.stringify(line);

  // stderr for warn/error so platform log routing can split them.
  if (level === "error" || level === "warn") process.stderr.write(`${serialised}\n`);
  else process.stdout.write(`${serialised}\n`);
}

export const logger = {
  debug: (event: string, context?: LogContext) => emit("debug", event, context),
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),

  /** Returns a logger that stamps every line with the same correlation id. */
  child(bound: LogContext) {
    return {
      debug: (event: string, context?: LogContext) => emit("debug", event, { ...bound, ...context }),
      info: (event: string, context?: LogContext) => emit("info", event, { ...bound, ...context }),
      warn: (event: string, context?: LogContext) => emit("warn", event, { ...bound, ...context }),
      error: (event: string, context?: LogContext) => emit("error", event, { ...bound, ...context }),
    };
  },
};

export type Logger = typeof logger;
