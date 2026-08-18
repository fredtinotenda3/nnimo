import "server-only";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

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

const PII_KEY_PATTERNS = ["email", "phone", "address", "line1", "line2", "guestname", "customername"];

export const REDACTED = "[redacted]";

function keyMatches(key: string, patterns: string[]): boolean {
  const normalised = key.toLowerCase().replace(/[-\s_]/g, "");
  return patterns.some((pattern) => normalised.includes(pattern.replace(/[-_\s]/g, "")));
}

function maskPii(value: string): string {
  const at = value.indexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    return `${local.slice(0, 1)}***${value.slice(at)}`;
  }
  if (value.length <= 4) return REDACTED;
  return `***${value.slice(-3)}`;
}

const URI_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+)(?::([^/\s@]*))?@/gi;

export function scrubSecrets(value: string): string {
  return value.replace(URI_CREDENTIALS, (_match, scheme: string, user: string, password?: string) =>
    password === undefined ? `${scheme}${user}@` : `${scheme}${user}:${REDACTED}@`,
  );
}

const MAX_DEPTH = 6;
const MAX_ARRAY = 25;
const MAX_STRING = 2000;

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated: depth]";

  if (typeof value === "string") {
    const scrubbed = scrubSecrets(value);
    return scrubbed.length > MAX_STRING ? `${scrubbed.slice(0, MAX_STRING)}…[truncated]` : scrubbed;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubSecrets(value.message),
      ...(process.env.NODE_ENV === "production"
        ? {}
        : { stack: value.stack ? scrubSecrets(value.stack) : undefined }),
      ...(typeof (value as { code?: unknown }).code === "string"
        ? { code: (value as unknown as { code: string }).code }
        : {}),
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

  if (level === "error" || level === "warn") process.stderr.write(`${serialised}\n`);
  else process.stdout.write(`${serialised}\n`);
}

export const logger = {
  debug: (event: string, context?: LogContext) => emit("debug", event, context),
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),

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