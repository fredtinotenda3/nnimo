import { ImageResponse } from "next/og";

/**
 * PHASE 8 (finding M6). The default social preview image.
 *
 * THE BUG THIS FIXES
 *
 * app/layout.tsx declared `twitter: { card: "summary_large_image" }` and a full
 * `openGraph` block, but no image anywhere in the tree. A large-image card with no
 * image is worse than no card declaration at all: the platform reserves the space
 * and renders a blank grey panel with the text beneath it. Every link to this site
 * shared on WhatsApp — which is how a Bulawayo studio's work actually circulates —
 * looked broken.
 *
 * WHY GENERATED RATHER THAN A PHOTOGRAPH
 *
 * The obvious move is to point at public/brand/hero-giraffe-tureen.webp. Three
 * reasons not to:
 *
 *   1. It is a .webp. OG/Twitter support for WebP is inconsistent, and WhatsApp in
 *      particular has historically failed to render it — the exact channel that
 *      matters most here.
 *   2. It is not 1200×630. Platforms centre-crop to that ratio, and a centre crop
 *      of a tall vessel decapitates it.
 *   3. It puts one specific piece on every share of every page. Each Nnino piece is
 *      a one-off; a card promising a giraffe tureen on a link to /about is a small
 *      untruth.
 *
 * So the card is typographic, in the brand palette, and says only what is already
 * established: the studio name, the existing tagline from the root metadata, and the
 * location from lib/brand.ts. NOTHING IS INVENTED — no award, no founding year, no
 * claim that is not already in the repository.
 *
 * A per-product OG image (piece name over its own photograph) would be a genuine
 * improvement and is noted in PHASE-8-REPORT.md as deferred: it needs a real
 * photograph per piece, and most of the catalogue does not have one yet.
 *
 * FONTS: the system stack, deliberately. next/font self-hosts Playfair for the site,
 * but ImageResponse cannot read those; using it here would mean fetching a font file
 * at render time, and this phase adds no external calls. Satori's default serif
 * carries the intent without the network dependency.
 */
export const alt = "Nnino Ceramics — handcrafted ceramics and sculpture from Bulawayo, Zimbabwe";

/** The ratio every platform crops to. Producing it directly avoids being cropped. */
export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Warm White and Rich Charcoal, the exact values from app/globals.css.
          backgroundColor: "#faf7f2",
          color: "#2c2c2c",
          padding: "72px 80px",
        }}
      >
        {/*
          The gallery wall label — the site's signature device (see the
          @utility gallery-label block in app/globals.css): a short terracotta
          hairline above the name. Reproduced here so a shared link is recognisably
          the same object as the page it points to.
        */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ width: 96, height: 3, backgroundColor: "#b85c3a" }} />
          <div
            style={{
              marginTop: 28,
              fontSize: 26,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#6b6157",
            }}
          >
            Bulawayo · Zimbabwe
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 104,
              lineHeight: 1.05,
              letterSpacing: -2,
              fontFamily: "serif",
            }}
          >
            Nnino Ceramics
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 40,
              lineHeight: 1.3,
              color: "#6b6157",
              fontFamily: "serif",
              fontStyle: "italic",
            }}
          >
            Made By Hand, With Heart
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            borderTop: "1px solid #e7dfd4",
            paddingTop: 28,
            fontSize: 26,
            color: "#6b6157",
          }}
        >
          <span>Handcrafted ceramics and sculpture</span>
          <span style={{ color: "#d4a96a" }}>·</span>
          <span>Every piece individually designed and signed</span>
        </div>
      </div>
    ),
    size,
  );
}
