import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/media/inspect";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MediaValidationError,
  assertUploadAllowed,
  buildStorageKey,
} from "@/lib/media/types";
import {
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  isKnownSettingKey,
  isSettingTrue,
  settingDefinition,
  validateSettingValue,
} from "@/lib/admin/settings-registry";
import {
  CONTENT_DEFINITIONS,
  CONTENT_GROUPS,
  contentDefinition,
  contentDefinitionOrFallback,
  missingContentKeys,
} from "@/lib/admin/content-registry";

// --- Fixtures ----------------------------------------------------------------
// Real headers, minimally sized. Enough bytes for the parsers to reach the
// dimension fields.

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0xff, 0xd8], 0); // SOI
  bytes.set([0xff, 0xc0], 2); // SOF0
  bytes.set([0x00, 0x11], 4); // segment length
  bytes[6] = 8; // precision
  new DataView(bytes.buffer).setUint16(7, height);
  new DataView(bytes.buffer).setUint16(9, width);
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}

function avif(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x00, 0x00, 0x00, 0x20], 0);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  bytes.set([0x61, 0x76, 0x69, 0x66], 8); // "avif"
  return bytes;
}

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(Math.max(64, text.length));
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

/**
 * Upload type detection.
 *
 * This is the security test in the Phase 4 suite. The local media driver writes
 * into `public/`, which Next serves statically — so a file that is not really an
 * image, stored under an image's name, is served from our own origin. The
 * declared MIME type on a multipart upload is attacker-controlled, which is why
 * nothing downstream is allowed to trust it.
 */
describe("sniffImage", () => {
  it("identifies each accepted format from its bytes", () => {
    expect(sniffImage(png(800, 600))).toMatchObject({
      mimeType: "image/png",
      width: 800,
      height: 600,
    });
    expect(sniffImage(jpeg(1024, 768))).toMatchObject({
      mimeType: "image/jpeg",
      width: 1024,
      height: 768,
    });
    expect(sniffImage(webpVp8x(1200, 900))).toMatchObject({
      mimeType: "image/webp",
      width: 1200,
      height: 900,
    });
    expect(sniffImage(avif())).toMatchObject({ mimeType: "image/avif" });
  });

  it("refuses an SVG, however it is labelled", () => {
    // SVG can carry script and would be served from our origin.
    expect(sniffImage(ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
  });

  it("refuses HTML dressed as an image", () => {
    expect(sniffImage(ascii("<!DOCTYPE html><html><body><script>alert(1)</script>"))).toBeNull();
  });

  it("refuses other file types entirely", () => {
    expect(sniffImage(ascii("%PDF-1.7"))).toBeNull(); // PDF
    expect(sniffImage(ascii("GIF89a"))).toBeNull(); // GIF is not on the allow-list
    expect(sniffImage(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, ...new Array(60).fill(0)]))).toBeNull(); // PE executable
    expect(sniffImage(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, ...new Array(60).fill(0)]))).toBeNull(); // ELF
  });

  it("refuses input too short to identify", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });

  it("does not hang on a truncated JPEG with a hostile segment length", () => {
    const bytes = new Uint8Array(128);
    bytes.set([0xff, 0xd8], 0);
    bytes.set([0xff, 0xe0], 2);
    bytes.set([0x00, 0x00], 4); // length 0 — would loop forever if unguarded
    expect(sniffImage(bytes)).toMatchObject({ mimeType: "image/jpeg" });
  });

  it("identifies a JPEG even when no frame header is present", () => {
    const bytes = new Uint8Array(64);
    bytes.set([0xff, 0xd8], 0);
    const result = sniffImage(bytes);
    expect(result?.mimeType).toBe("image/jpeg");
    expect(result?.width).toBeUndefined();
  });
});

describe("upload constraints", () => {
  it("rejects a type outside the whitelist", () => {
    expect(() => assertUploadAllowed({ mimeType: "image/gif", sizeBytes: 100 })).toThrow(
      MediaValidationError,
    );
    expect(() => assertUploadAllowed({ mimeType: "image/svg+xml", sizeBytes: 100 })).toThrow();
  });

  it("rejects an oversized or empty file", () => {
    expect(() =>
      assertUploadAllowed({ mimeType: "image/png", sizeBytes: MAX_UPLOAD_BYTES + 1 }),
    ).toThrow();
    expect(() => assertUploadAllowed({ mimeType: "image/png", sizeBytes: 0 })).toThrow();
  });

  it("accepts every whitelisted type at a sane size", () => {
    for (const mimeType of ALLOWED_IMAGE_MIME_TYPES) {
      expect(() => assertUploadAllowed({ mimeType, sizeBytes: 1024 })).not.toThrow();
    }
  });

  it("never derives a storage key from the client's filename", () => {
    const key = buildStorageKey("image/png");
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    // Path traversal is impossible because the name is never an input.
    expect(key).not.toContain("..");
  });
});

describe("settings registry", () => {
  it("has unique keys", () => {
    const keys = SETTING_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts every setting in a declared group", () => {
    for (const definition of SETTING_DEFINITIONS) {
      expect(SETTING_GROUPS).toContain(definition.group);
    }
  });

  it("contains no credential-shaped key", () => {
    // The registry is the allow-list for what the settings page can display.
    // Nothing resembling a secret may enter it — those live in the environment.
    const forbidden = /secret|password|token|api[_-]?key|credential|private/i;
    for (const definition of SETTING_DEFINITIONS) {
      expect(forbidden.test(definition.key), definition.key).toBe(false);
      expect(forbidden.test(definition.label), definition.label).toBe(false);
    }
  });

  it("only recognises keys it defines", () => {
    expect(isKnownSettingKey("commerce.currency")).toBe(true);
    expect(isKnownSettingKey("paynow.integration_key")).toBe(false);
    expect(isKnownSettingKey("../../etc/passwd")).toBe(false);
    expect(settingDefinition("nonsense.key")).toBeNull();
  });

  it("keeps the keys the Phase 1 seed already writes", () => {
    // Dropping one would orphan a row the application still reads.
    for (const key of [
      "production.default_lead_time_days",
      "inventory.default_low_stock_threshold",
      "commerce.currency",
    ]) {
      expect(isKnownSettingKey(key), key).toBe(true);
    }
  });

  it("allows a blank value for every setting", () => {
    // "Not decided yet" is a real state — business hours and the delivery
    // policy are genuinely unknown, and the form must not force an invention.
    for (const definition of SETTING_DEFINITIONS) {
      const result = validateSettingValue(definition, "");
      expect(result.ok, definition.key).toBe(true);
    }
  });

  it("validates by kind", () => {
    const email = settingDefinition("business.contact_email");
    expect(email && validateSettingValue(email, "not-an-email").ok).toBe(false);
    expect(email && validateSettingValue(email, "studio@example.com").ok).toBe(true);

    const currency = settingDefinition("commerce.currency");
    expect(currency && validateSettingValue(currency, "usd")).toMatchObject({
      ok: true,
      value: "USD",
    });
    expect(currency && validateSettingValue(currency, "DOLLAR").ok).toBe(false);

    const leadTime = settingDefinition("production.default_lead_time_days");
    expect(leadTime && validateSettingValue(leadTime, "42")).toMatchObject({ ok: true, value: "42" });
    expect(leadTime && validateSettingValue(leadTime, "5000").ok).toBe(false);
    expect(leadTime && validateSettingValue(leadTime, "six weeks").ok).toBe(false);
  });

  it("normalises booleans", () => {
    const flag = settingDefinition("delivery.enabled");
    expect(flag && validateSettingValue(flag, "on")).toMatchObject({ ok: true, value: "true" });
    expect(flag && validateSettingValue(flag, "false")).toMatchObject({ ok: true, value: "false" });
    expect(isSettingTrue("true")).toBe(true);
    expect(isSettingTrue("false")).toBe(false);
    expect(isSettingTrue(null)).toBe(false);
  });
});

describe("content registry", () => {
  it("has unique keys in declared groups", () => {
    const keys = CONTENT_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const definition of CONTENT_DEFINITIONS) {
      expect(CONTENT_GROUPS).toContain(definition.group);
    }
  });

  it("covers every key the public pages actually read", () => {
    // These are read by app/(site) pages via getContentBlocks. A key the site
    // reads but the registry omits is copy nobody can edit.
    for (const key of [
      "homepage.hero.headline",
      "homepage.story.excerpt",
      "legacy.origin",
      "legacy.founder",
      "legacy.craft",
      "legacy.continuation",
      "about.products",
      "family.intro",
      "commissions.intro",
    ]) {
      expect(contentDefinition(key), key).not.toBeNull();
    }
  });

  it("describes where each block appears", () => {
    for (const definition of CONTENT_DEFINITIONS) {
      expect(definition.where.length, definition.key).toBeGreaterThan(10);
      expect(definition.label.length, definition.key).toBeGreaterThan(2);
    }
  });

  it("marks legal copy as needing review", () => {
    expect(contentDefinition("privacy.policy")?.needsReview).toBe(true);
    expect(contentDefinition("terms.of_sale")?.needsReview).toBe(true);
  });

  it("keeps an unregistered key editable rather than hiding it", () => {
    const fallback = contentDefinitionOrFallback("some.unknown.key", "RICH_TEXT");
    expect(fallback.group).toBe("other");
    expect(fallback.key).toBe("some.unknown.key");
  });

  it("reports which registry keys have no row yet", () => {
    const missing = missingContentKeys(["homepage.hero.headline"]);
    expect(missing).not.toContain("homepage.hero.headline");
    expect(missing).toContain("family.intro");
  });
});
