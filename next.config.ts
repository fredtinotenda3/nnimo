import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fail the production build on type errors rather than shipping them.
  //
  // There is deliberately no `eslint` key: Next.js 16 removed the `next lint`
  // command and `next build` no longer runs linting at all, so the option no
  // longer exists on NextConfig. Linting is a separate step — `npm run lint` —
  // and must be wired into CI, because nothing in the build will catch it now.
  typescript: { ignoreBuildErrors: false },
  images: {
    // Product photography is the visual hero; serve modern formats and only the
    // widths the layout actually uses.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [420, 640, 828, 1080, 1280, 1920],
    remotePatterns: process.env.MEDIA_S3_PUBLIC_URL
      ? [{ protocol: "https", hostname: new URL(process.env.MEDIA_S3_PUBLIC_URL).hostname }]
      : [],
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
