import { describe, expect, it } from "vitest";
import { encodeS3Key, rfc3986Encode, signS3Request, signingKey } from "@/lib/media/sigv4";

/**
 * Tests for the hand-rolled SigV4 signer that replaced the S3 driver stub.
 *
 * Writing request signing by hand is only defensible if it is verified against
 * something authoritative rather than against itself. The first test below pins
 * the derived signing key to AWS's own published worked example from the
 * Signature Version 4 documentation — same secret, same date, same region, same
 * service. If the derivation is wrong, that value cannot match by luck.
 */
describe("signingKey", () => {
  it("reproduces AWS's documented signing-key derivation", () => {
    // The example credential set from AWS's SigV4 documentation.
    const key = signingKey({
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      dateStamp: "20150830",
      region: "us-east-1",
      service: "iam",
    });

    expect(key.toString("hex")).toBe(
      "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
    );
  });

  it("derives a different key for a different date, region or service", () => {
    const base = {
      secretAccessKey: "secret",
      dateStamp: "20260815",
      region: "eu-west-1",
      service: "s3",
    };
    const original = signingKey(base).toString("hex");

    expect(signingKey({ ...base, dateStamp: "20260816" }).toString("hex")).not.toBe(original);
    expect(signingKey({ ...base, region: "us-east-1" }).toString("hex")).not.toBe(original);
    expect(signingKey({ ...base, service: "iam" }).toString("hex")).not.toBe(original);
  });
});

describe("rfc3986Encode", () => {
  /**
   * encodeURIComponent leaves these five unescaped; AWS requires them escaped.
   * A single mismatched byte produces SignatureDoesNotMatch.
   */
  it("escapes the characters encodeURIComponent leaves alone", () => {
    expect(rfc3986Encode("!")).toBe("%21");
    expect(rfc3986Encode("'")).toBe("%27");
    expect(rfc3986Encode("(")).toBe("%28");
    expect(rfc3986Encode(")")).toBe("%29");
    expect(rfc3986Encode("*")).toBe("%2A");
  });

  it("leaves unreserved characters alone", () => {
    expect(rfc3986Encode("abcXYZ019-_.~")).toBe("abcXYZ019-_.~");
  });
});

describe("encodeS3Key", () => {
  it("preserves path separators between segments", () => {
    expect(encodeS3Key("uploads/2026/08/abc.jpg")).toBe("uploads/2026/08/abc.jpg");
  });

  it("encodes within a segment without encoding the separator", () => {
    expect(encodeS3Key("uploads/a b/c.jpg")).toBe("uploads/a%20b/c.jpg");
  });
});

describe("signS3Request", () => {
  const credentials = {
    region: "eu-west-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  };
  const now = new Date("2026-08-15T09:15:00.000Z");

  it("produces a deterministic signature for identical inputs", () => {
    const args = {
      method: "PUT" as const,
      endpoint: "https://nnino-media.s3.eu-west-1.amazonaws.com",
      key: "uploads/2026/08/photo.jpg",
      body: Buffer.from("bytes"),
      now,
      ...credentials,
    };
    expect(signS3Request(args).headers.authorization).toBe(
      signS3Request(args).headers.authorization,
    );
  });

  it("changes the signature when the body changes", () => {
    const args = {
      method: "PUT" as const,
      endpoint: "https://nnino-media.s3.eu-west-1.amazonaws.com",
      key: "uploads/photo.jpg",
      now,
      ...credentials,
    };
    const a = signS3Request({ ...args, body: Buffer.from("one") }).headers.authorization;
    const b = signS3Request({ ...args, body: Buffer.from("two") }).headers.authorization;
    expect(a).not.toBe(b);
  });

  it("sets the payload hash and date headers S3 requires", () => {
    const signed = signS3Request({
      method: "PUT",
      endpoint: "https://nnino-media.s3.eu-west-1.amazonaws.com",
      key: "uploads/photo.jpg",
      body: Buffer.alloc(0),
      now,
      ...credentials,
    });

    // SHA-256 of the empty string — the documented value for an empty payload.
    expect(signed.headers["x-amz-content-sha256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(signed.headers["x-amz-date"]).toBe("20260815T091500Z");
  });

  it("names every signed header in the authorization header", () => {
    const signed = signS3Request({
      method: "PUT",
      endpoint: "https://nnino-media.s3.eu-west-1.amazonaws.com",
      key: "uploads/photo.jpg",
      body: Buffer.from("x"),
      headers: { "content-type": "image/jpeg" },
      now,
      ...credentials,
    });

    expect(signed.headers.authorization).toContain("AWS4-HMAC-SHA256");
    expect(signed.headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date");
    expect(signed.headers.authorization).toContain(`Credential=${credentials.accessKeyId}/20260815/eu-west-1/s3/aws4_request`);
  });

  it("builds a path-style URL for a custom endpoint (R2, B2, MinIO)", () => {
    const signed = signS3Request({
      method: "DELETE",
      endpoint: "https://account.r2.cloudflarestorage.com/nnino-media",
      key: "uploads/2026/08/photo.jpg",
      now,
      ...credentials,
    });

    expect(signed.url).toBe(
      "https://account.r2.cloudflarestorage.com/nnino-media/uploads/2026/08/photo.jpg",
    );
  });
});
