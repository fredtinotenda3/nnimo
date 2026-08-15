/**
 * Reads the true type and pixel dimensions of an uploaded image from its bytes.
 *
 * Two reasons this exists rather than trusting the upload's declared type:
 *
 *  1. SECURITY. `File.type` in a multipart upload is attacker-controlled — it is
 *     whatever the client says it is. Phase 1's `assertUploadAllowed` checks that
 *     string against a whitelist, which stops an honest mistake but not a
 *     deliberate one: a request can declare `image/png` and send a polyglot,
 *     an SVG containing script, or an HTML file. Since the local driver writes
 *     into `public/`, where Next serves files statically, a file that is not
 *     really an image is a stored-XSS primitive. So the type is derived from the
 *     magic bytes and the declared value is used only to reject early.
 *
 *  2. CORRECTNESS. Media.width/height drive the aspect ratios the storefront
 *     renders. Reading them here means the gallery does not have to guess, and
 *     it costs one pass over a header we have already loaded into memory.
 *
 * Deliberately no image-processing dependency. sharp is a native module that
 * complicates the Vercel build, and everything needed here is a header read.
 * Bytes are never decoded or re-encoded — this only ever reads.
 */

export type SniffedImage = {
  /** The MIME type the bytes actually are, not the one that was claimed. */
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  width?: number;
  height?: number;
};

function readU16BE(bytes: Uint8Array, offset: number): number | null {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  if (a === undefined || b === undefined) return null;
  return (a << 8) | b;
}

function readU32BE(bytes: Uint8Array, offset: number): number | null {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  const d = bytes[offset + 3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function readU24LE(bytes: Uint8Array, offset: number): number | null {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  if (a === undefined || b === undefined || c === undefined) return null;
  return a | (b << 8) | (c << 16);
}

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

// --- PNG ---------------------------------------------------------------------
// 8-byte signature, then an IHDR chunk whose first two fields are width and
// height as big-endian 32-bit integers.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function sniffPng(bytes: Uint8Array): SniffedImage | null {
  if (!matches(bytes, 0, PNG_SIGNATURE)) return null;
  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  return {
    mimeType: "image/png",
    ...(width && height ? { width, height } : {}),
  };
}

// --- JPEG --------------------------------------------------------------------
// A chain of marker segments. Dimensions live in whichever SOFn frame header
// appears first; SOF4 (DHT), SOF8 and SOF12 are not frame headers despite the
// numbering, which is why they are excluded explicitly.
function sniffJpeg(bytes: Uint8Array): SniffedImage | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  // Bounded so a truncated or hostile file cannot spin here.
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) break;

    // Padding fill bytes and standalone markers carry no length field.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      const height = readU16BE(bytes, offset + 5);
      const width = readU16BE(bytes, offset + 7);
      return {
        mimeType: "image/jpeg",
        ...(width && height ? { width, height } : {}),
      };
    }

    const segmentLength = readU16BE(bytes, offset + 2);
    if (segmentLength === null || segmentLength < 2) break;
    offset += 2 + segmentLength;
  }

  // Valid JPEG signature but no frame header in the bytes we were given.
  // Still a JPEG; dimensions unknown.
  return { mimeType: "image/jpeg" };
}

// --- WebP --------------------------------------------------------------------
// RIFF container. Three sub-formats, each storing dimensions differently.
function sniffWebp(bytes: Uint8Array): SniffedImage | null {
  if (!matches(bytes, 0, [0x52, 0x49, 0x46, 0x46])) return null; // "RIFF"
  if (!matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return null; // "WEBP"

  const chunk = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );

  if (chunk === "VP8X") {
    const width = readU24LE(bytes, 24);
    const height = readU24LE(bytes, 27);
    return {
      mimeType: "image/webp",
      ...(width !== null && height !== null ? { width: width + 1, height: height + 1 } : {}),
    };
  }

  if (chunk === "VP8L") {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    if (b0 !== undefined && b1 !== undefined && b2 !== undefined && b3 !== undefined) {
      const packed = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
      const width = (packed & 0x3fff) + 1;
      const height = ((packed >> 14) & 0x3fff) + 1;
      return { mimeType: "image/webp", width, height };
    }
    return { mimeType: "image/webp" };
  }

  if (chunk === "VP8 ") {
    // Lossy: a 3-byte start code, then 14-bit width and height.
    const w = readU16BE(bytes, 26);
    const h = readU16BE(bytes, 28);
    if (w !== null && h !== null) {
      const width = (((w & 0xff) << 8) | (w >> 8)) & 0x3fff;
      const height = (((h & 0xff) << 8) | (h >> 8)) & 0x3fff;
      if (width > 0 && height > 0) return { mimeType: "image/webp", width, height };
    }
    return { mimeType: "image/webp" };
  }

  return { mimeType: "image/webp" };
}

// --- AVIF --------------------------------------------------------------------
// ISO-BMFF. Dimensions live in an `ispe` box inside nested metadata; rather than
// walking the box tree, the brand is confirmed and the dimensions left unknown.
// Next/Image handles an image without stored dimensions perfectly well — it is a
// missing optimisation, not a broken render — and a partial box-tree parser is
// more attack surface than the optimisation is worth.
function sniffAvif(bytes: Uint8Array): SniffedImage | null {
  if (!matches(bytes, 4, [0x66, 0x74, 0x79, 0x70])) return null; // "ftyp"
  const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
  if (brand !== "avif" && brand !== "avis") return null;
  return { mimeType: "image/avif" };
}

/**
 * Identifies an image from its leading bytes.
 *
 * Returns null for anything that is not one of the four accepted formats —
 * including SVG, GIF, PDF, HTML and a renamed executable. Callers must treat
 * null as "reject the upload", never as "assume what the client said".
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 16) return null;
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes) ?? sniffAvif(bytes);
}
