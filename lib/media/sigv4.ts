import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 request signing.
 *
 * WHY THIS EXISTS RATHER THAN @aws-sdk/client-s3
 *
 * The media driver needs exactly two operations — PutObject and DeleteObject.
 * `@aws-sdk/client-s3` brings a command layer, a middleware stack, a retry
 * strategy, a credential-provider chain and a paginator to deliver them, at
 * roughly 2 MB installed and a measurable cold-start cost on a serverless
 * function that mostly serves pages. Phase 5T rule 3 says not to add
 * dependencies without justification, and "two authenticated PUTs" does not
 * justify that.
 *
 * SigV4 itself is a documented, stable, fully deterministic algorithm built from
 * SHA-256 and HMAC, both already in node:crypto. It is about 80 lines. Critically
 * it is also TESTABLE without network access or credentials: AWS publishes
 * canonical test vectors, and tests/sigv4.test.ts checks this implementation
 * against the published `AWS4-HMAC-SHA256` derivation for a known key, date and
 * region. An implementation that reproduces the documented signing key exactly is
 * not guesswork.
 *
 * WHAT IS DELIBERATELY NOT IMPLEMENTED
 *
 * Session tokens (STS), multipart upload, presigned URLs and the instance
 * metadata credential chain. None are needed: the bucket takes a long-lived
 * access key pair from the environment, and every object is a single image well
 * under the 5 GB single-PUT limit. Adding them speculatively would be the same
 * mistake as pulling in the SDK.
 *
 * Reference: AWS "Signature Version 4 signing process", Authorization header
 * variant, for service `s3`.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

function sha256Hex(payload: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * Percent-encodes per RFC 3986, which is stricter than encodeURIComponent.
 *
 * encodeURIComponent leaves `!`, `'`, `(`, `)` and `*` unescaped. AWS requires
 * them escaped in the canonical request, and a single mismatched byte produces a
 * SignatureDoesNotMatch that is miserable to debug — so this is not pedantry.
 */
export function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Encodes an object key for use in a URI path.
 *
 * Each path segment is encoded separately so that `/` between segments survives
 * — S3 keys are hierarchical and encoding the separator would create a key with
 * a literal `%2F` in the name.
 */
export function encodeS3Key(key: string): string {
  return key.split("/").map(rfc3986Encode).join("/");
}

/** Derives the date-scoped signing key. This is the part the tests pin. */
export function signingKey(params: {
  secretAccessKey: string;
  dateStamp: string;
  region: string;
  service: string;
}): Buffer {
  const kDate = hmac(`AWS4${params.secretAccessKey}`, params.dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, params.service);
  return hmac(kService, "aws4_request");
}

export type SignedRequest = {
  url: string;
  headers: Record<string, string>;
};

export type SignParams = {
  method: "PUT" | "DELETE" | "GET" | "HEAD";
  /** Absolute endpoint including the bucket, e.g. https://bucket.s3.eu-west-1.amazonaws.com */
  endpoint: string;
  /** Object key, unencoded. */
  key: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Raw body bytes. Empty for DELETE. */
  body?: Buffer | Uint8Array;
  /** Extra headers to sign, e.g. content-type. Lower-cased by this function. */
  headers?: Record<string, string>;
  /** Injectable for deterministic tests. */
  now?: Date;
  service?: string;
};

/**
 * Signs a request and returns the URL plus every header that must be sent.
 *
 * All signed headers are returned, including the ones this function generated
 * (`x-amz-date`, `x-amz-content-sha256`, `host`). Sending a signed header with a
 * different value than was signed — or omitting one — invalidates the signature,
 * so the caller must send exactly what comes back and nothing that alters them.
 */
export function signS3Request(params: SignParams): SignedRequest {
  const service = params.service ?? "s3";
  const now = params.now ?? new Date();

  // 20260815T091500Z / 20260815
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const endpoint = new URL(params.endpoint);
  const canonicalUri = `${endpoint.pathname.replace(/\/$/, "")}/${encodeS3Key(params.key)}`;

  const body = params.body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(body);

  // S3 requires the payload hash header on every SigV4 request.
  const headers: Record<string, string> = {
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  for (const [name, value] of Object.entries(params.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }

  // Canonical headers must be sorted by name, values trimmed, one per line.
  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${headers[name]!.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    params.method,
    canonicalUri,
    "", // no query string on any request this driver makes
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${params.region}/${service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const key = signingKey({
    secretAccessKey: params.secretAccessKey,
    dateStamp,
    region: params.region,
    service,
  });
  const signature = createHmac("sha256", key).update(stringToSign, "utf8").digest("hex");

  headers.authorization =
    `${ALGORITHM} Credential=${params.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `${endpoint.origin}${canonicalUri}`,
    headers,
  };
}
