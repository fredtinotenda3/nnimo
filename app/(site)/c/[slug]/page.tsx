import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicLandingPageBySlug } from "@/lib/marketing/public";
import { resolveMediaUrl } from "@/lib/media";
import { absoluteUrl } from "@/lib/seo";
import { AttributionCapture } from "@/app/(site)/attribution-capture";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EditorialImage } from "@/components/site/editorial-image";
import { ShareLinks } from "@/components/site/share-links";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * Advertising landing pages, at /c/{slug}.
 *
 * DRAFT PROTECTION: getPublicLandingPageBySlug composes PUBLIC_LANDING_PAGE_WHERE
 * (lib/marketing/public.ts), which only ever matches status PUBLISHED. A
 * draft or archived page 404s here — the same "nothing at this URL for a
 * visitor" rule the collection and product pages already follow — rather than
 * redirecting or showing a "coming soon" placeholder that would leak that a
 * page exists at all.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicLandingPageBySlug(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };

  const description = page.message?.trim() || `${page.title} · Nnino Ceramics`;

  return {
    title: page.title,
    description,
    alternates: { canonical: `/c/${page.slug}` },
    // A landing page built for a specific ad push is not evergreen content —
    // it should not compete with the product/collection pages it promotes in
    // search results once the campaign has ended.
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      title: `${page.title} · Nnino Ceramics`,
      description,
      url: `/c/${page.slug}`,
      ...(page.heroImage ? { images: [{ url: resolveMediaUrl(page.heroImage) }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} · Nnino Ceramics`,
      description,
      ...(page.heroImage ? { images: [resolveMediaUrl(page.heroImage)] } : {}),
    },
  };
}

function resolveCta(page: NonNullable<Awaited<ReturnType<typeof getPublicLandingPageBySlug>>>) {
  const href = page.cta || page.campaign?.cta || null;
  const label = page.ctaLabel || page.campaign?.ctaLabel || "Shop now";
  return href ? { href, label } : null;
}

export default async function LandingPage({ params }: Params) {
  const { slug } = await params;
  const page = await getPublicLandingPageBySlug(slug);
  if (!page) notFound();

  const cta = resolveCta(page);
  const isExternalCta = cta ? /^https?:\/\//.test(cta.href) : false;

  return (
    <>
      {/* Generic capture in the layout already covers most cases; this
          instance additionally knows this page's own campaign/landing ids and
          UTM defaults, which the layout's instance cannot — see
          AttributionCapture's own comment for why both exist. */}
      <AttributionCapture
        campaignId={page.campaign?.id ?? null}
        landingPageId={page.id}
        fallbackUtm={{
          utmSource: page.defaultUtmSource,
          utmMedium: page.defaultUtmMedium,
          utmCampaign: page.defaultUtmCampaign,
          utmTerm: page.defaultUtmTerm,
          utmContent: page.defaultUtmContent,
        }}
      />

      {page.heroImage ? (
        <section className="relative h-[60svh] min-h-[400px] w-full bg-charcoal">
          <Image
            src={resolveMediaUrl(page.heroImage)}
            alt={page.heroImage.altText?.trim() || page.title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-charcoal/50" />
          <Container className="relative flex h-full flex-col justify-end pb-14">
            {page.campaign ? <p className="text-label text-ochre">{page.campaign.name}</p> : null}
            <h1 className="text-display mt-4 max-w-2xl text-dark-foreground">{page.title}</h1>
            {page.message ? (
              <p className="text-body-lg mt-4 max-w-xl text-dark-foreground/85">{page.message}</p>
            ) : null}
            {cta ? (
              <div className="mt-8">
                <Button asChild size="lg">
                  {isExternalCta ? (
                    <a href={cta.href} target="_blank" rel="noreferrer">
                      {cta.label}
                    </a>
                  ) : (
                    <Link href={cta.href}>{cta.label}</Link>
                  )}
                </Button>
              </div>
            ) : null}
          </Container>
        </section>
      ) : (
        <>
          <Section contained={false} className="relative h-[60svh] min-h-[400px] py-0">
            <EditorialImage
              slot="campaign-atmosphere"
              caption={page.title}
              sizes="100vw"
              className="absolute inset-0"
              priority
            />
          </Section>
          <Section className="pt-10">
            {page.campaign ? <p className="text-label text-muted-foreground">{page.campaign.name}</p> : null}
            <h1 className="text-display mt-4 max-w-2xl">{page.title}</h1>
            {page.message ? <p className="text-body-lg mt-4 max-w-xl text-muted-foreground">{page.message}</p> : null}
            {cta ? (
              <div className="mt-8">
                <Button asChild size="lg">
                  {isExternalCta ? (
                    <a href={cta.href} target="_blank" rel="noreferrer">
                      {cta.label}
                    </a>
                  ) : (
                    <Link href={cta.href}>{cta.label}</Link>
                  )}
                </Button>
              </div>
            ) : null}
          </Section>
        </>
      )}

      {page.storyContent ? (
        <Section className="max-w-2xl">
          <div className="text-body whitespace-pre-line text-foreground/90">{page.storyContent}</div>
        </Section>
      ) : null}

      <Section className="pt-0">
        <ShareLinks url={absoluteUrl(`/c/${page.slug}`)} title={page.title} />
      </Section>
    </>
  );
}
