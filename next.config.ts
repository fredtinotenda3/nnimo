import type { NextConfig } from "next";

/**
 * SECURITY HEADER SPLIT (Phase 5)
 *
 * Headers now live in two places, deliberately:
 *
 *   proxy.ts        Everything that needs a per-request value — the CSP, whose
 *                   nonce cannot be static — plus the full set for HTML routes.
 *   next.config.ts  A minimal always-on subset for responses the proxy matcher
 *                   deliberately excludes: _next/static, _next/image, and files
 *                   under public/ such as locally-stored media.
 *
 * The subset here is the part that is meaningful on a static asset. A CSP on a
 * JPEG buys nothing; `nosniff` on one buys a great deal, because it is what stops
 * a browser deciding an uploaded file is HTML. Where both layers set the same
 * header the proxy wins, so there is no conflict — only coverage.
 */

function mediaRemotePattern() {
  const raw = process.env.MEDIA_S3_PUBLIC_URL;
  if (!raw) return [];

  try {
    const url = new URL(raw);
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        // Scoped to the configured path prefix rather than the whole host, so a
        // shared CDN domain cannot be used to proxy arbitrary remote images
        // through our optimiser.
        pathname: `${url.pathname.replace(/\/$/, "")}/**`,
      },
    ];
  } catch {
    // A malformed value must not take the build down silently — lib/env.ts
    // validates this variable and will fail fast with a clear message.
    return [];
  }
}

const nextConfig: NextConfig = {
  // Fail the production build on type errors rather than shipping them.
  //
  // There is deliberately no `eslint` key: Next.js 16 removed the `next lint`
  // command and `next build` no longer runs linting at all, so the option no
  // longer exists on NextConfig. Linting is a separate step — `npm run lint` —
  // and must be wired into CI, because nothing in the build will catch it now.
  typescript: { ignoreBuildErrors: false },

  // Never advertise the framework or its version.
  poweredByHeader: false,

  experimental: {
    serverActions: {
      // Next.js defaults the Server Actions request body to 1 MB, which is
      // far below what a real product photo needs. `lib/media/types.ts`
      // (MAX_UPLOAD_BYTES) already enforces the real 12 MB ceiling once the
      // body reaches that validation, so this only needs to be raised enough
      // that a legitimate 12 MB upload's multipart body — which carries some
      // encoding overhead on top of the raw file — is not rejected before it
      // ever reaches that check. 15 MB gives that headroom without changing
      // any upload validation, RBAC, or storage logic.
      bodySizeLimit: "15mb",
    },
  },

  images: {
    // Product photography is the visual hero; serve modern formats and only the
    // widths the layout actually uses.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [420, 640, 828, 1080, 1280, 1920, 2560],
    // Next.js keeps this list separate from deviceSizes because it is used for
    // the *fixed*-size cases (thumbnails, avatars) rather than viewport-relative
    // `fill` layouts. The gallery filmstrip and admin thumbnails render well
    // below the smallest deviceSize, so without these the optimiser would still
    // serve a 420w image down to a 96px slot — correct, but wasteful.
    imageSizes: [96, 128, 192, 256, 384],
    // Next.js 16 requires every quality value used by an <Image> to be
    // allow-listed here, or the optimiser 400s the request. 75 is the
    // framework default (kept for anything that doesn't set `quality`); 90 is
    // what MediaImage/ProductGallery/EditorialImage now request explicitly —
    // hand-painted glaze detail and fine linework need more headroom than the
    // 75 default gives before AVIF/WebP re-encoding starts to look soft.
    qualities: [75, 90, 100],
    remotePatterns: mediaRemotePattern(),
    // An SVG that reaches the optimiser is a script that reaches the origin.
    // Upload validation already rejects SVG (lib/media/inspect.ts recognises
    // only JPEG/PNG/WebP/AVIF); this is the second lock.
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },

  async redirects() {
    // Phase 1 shipped /legacy and /commissions in the navigation. Phase 2 renamed
    // them to /about and /custom, so anything already shared or bookmarked keeps
    // working instead of 404ing.
    return [
      { source: "/legacy", destination: "/about", permanent: true },
      { source: "/commissions", destination: "/custom", permanent: true },
      // Product URLs live under /products/[slug]; /shop/[slug] was the Phase 1
      // placeholder shape used by the old homepage links.
      { source: "/shop/:slug", destination: "/products/:slug", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Locally-stored uploads are served straight from public/media. Even
        // though only real images can be written there, an explicit CSP that
        // permits nothing means a hypothetical bypass still cannot execute.
        source: "/media/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
