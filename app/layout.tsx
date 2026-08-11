import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted at build time by next/font — no runtime request to
 * Google, no layout shift, and no third-party origin in the CSP.
 *
 * Weights are enumerated rather than loaded as variable ranges we do not use:
 * Playfair only ever appears at 400/500, Inter at 400/500/600, Cormorant at
 * 400/500. Loading everything would cost real bytes on the mobile-first traffic
 * this site is built for.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Nnino Ceramics — Made By Hand, With Heart",
    template: "%s · Nnino Ceramics",
  },
  description:
    "Handcrafted ceramics and sculpture from Bulawayo, Zimbabwe. Every piece is individually designed, hand sculptured, hand painted and signed.",
  openGraph: {
    type: "website",
    siteName: "Nnino Ceramics",
    locale: "en_ZW",
    url: siteUrl,
    title: "Nnino Ceramics — Made By Hand, With Heart",
    description:
      "Handcrafted ceramics and sculpture from Bulawayo, Zimbabwe. Every piece is individually designed, hand sculptured, hand painted and signed.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-ZW"
      className={`${playfair.variable} ${inter.variable} ${cormorant.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
