import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { getContentBlocks, getPublicTeam } from "@/lib/catalogue";
import { ANTELOPE_VASE, TEAM_PHOTO } from "@/lib/brand-assets";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EditorialImage } from "@/components/site/editorial-image";

export const metadata: Metadata = {
  title: "About",
  description:
    "Nnino Ceramics was established by Mary Filannino in Bulawayo, Zimbabwe. Every piece is individually designed and handcrafted, exposing local talent in sculpture and art.",
  alternates: { canonical: "/about" },
  openGraph: { title: "About · Nnino Ceramics", url: "/about" },
};

export const dynamic = "force-dynamic";

/**
 * Every paragraph of substance on this page comes from a ContentBlock seeded
 * verbatim (or lightly tightened for grammar) from the supplied documents.
 *
 * Where a block is empty, the section is simply not rendered. There is no
 * invented founding narrative, no "since 1987", no awards and no claimed
 * partnerships — the source material does not establish any of that, and a
 * fabricated history is the one thing that would damage the brand it is meant to
 * promote.
 */
export default async function AboutPage() {
  const [copy, team] = await Promise.all([
    getContentBlocks([
      "legacy.origin",
      "about.products",
      "legacy.founder",
      "legacy.craft",
      "legacy.continuation",
      "family.intro",
    ]),
    getPublicTeam(),
  ]);

  const origin = copy.get("legacy.origin");
  const products = copy.get("about.products");
  const founder = copy.get("legacy.founder");
  const craft = copy.get("legacy.craft");
  const continuation = copy.get("legacy.continuation");

  return (
    <>
      <section className="bg-charcoal">
        <Container>
          <div className="max-w-3xl pb-20 pt-32 lg:pb-28 lg:pt-44">
            <p className="text-label text-ochre">The Nnino legacy</p>
            <h1 className="text-display mt-6 text-dark-foreground">{BRAND.tagline}</h1>
            {origin ? (
              <p className="text-body-lg mt-8 text-dark-muted-foreground">{origin}</p>
            ) : null}
          </div>
        </Container>
      </section>

      {/* Editorial atmosphere break, directly under the hero — see
          public/images/about/atmosphere.png in lib/editorial-images.ts. */}
      <Section contained={false} className="py-0">
        <div className="relative aspect-[21/9] w-full overflow-hidden">
          <EditorialImage slot="about-atmosphere" caption="The Nnino studio" sizes="100vw" />
        </div>
      </Section>

      {products ? (
        <Section>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <p className="text-label text-muted-foreground">Handmade</p>
              <h2 className="text-heading-1 mt-3">Every piece, by hand</h2>
            </div>
            <div className="lg:col-span-7">
              <p className="text-body-lg text-muted-foreground">{products}</p>
              <dl className="mt-10 grid gap-8 sm:grid-cols-3">
                <div className="gallery-label">
                  <dt className="text-metadata text-muted-foreground">Studio</dt>
                  <dd className="text-heading-3 mt-1">
                    {BRAND.city}, {BRAND.country}
                  </dd>
                </div>
                <div className="gallery-label">
                  <dt className="text-metadata text-muted-foreground">The team</dt>
                  <dd className="text-heading-3 mt-1">{BRAND.teamSize} people</dd>
                </div>
                <div className="gallery-label">
                  <dt className="text-metadata text-muted-foreground">Each piece</dt>
                  <dd className="text-heading-3 mt-1">5–6 weeks</dd>
                </div>
              </dl>
            </div>
          </div>
        </Section>
      ) : null}

      <Section tone="sunken">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <Image
                src={ANTELOPE_VASE.src}
                alt={ANTELOPE_VASE.alt}
                fill
                sizes="(min-width: 1024px) 45vw, 90vw"
                className="object-cover"
              />
            </div>
          </div>
          <div className="lg:col-span-6">
            <p className="text-label text-muted-foreground">Craftsmanship</p>
            <h2 className="text-heading-1 mt-3">Sculptured, painted, signed</h2>
            <p className="text-body-lg mt-6 text-muted-foreground">
              Pieces are thrown and moulded, then sculptured and hand painted before
              firing. Drying is weather-dependent: winter takes longer, summer is
              quicker, which is why the studio quotes five to six weeks rather than a
              fixed date.
            </p>
            {craft ? (
              <p className="text-body mt-5 text-muted-foreground">{craft}</p>
            ) : null}
          </div>
        </div>
      </Section>

      {/* The process, in three steps — see public/images/craft/ in
          lib/editorial-images.ts (clay, hands, kiln). */}
      <Section tone="sunken">
        <p className="text-label text-muted-foreground">The process</p>
        <h2 className="text-heading-1 mt-3">Clay, hand and kiln</h2>
        <ul className="mt-12 grid gap-3 sm:grid-cols-3">
          <li className="relative aspect-[3/4] overflow-hidden">
            <EditorialImage
              slot="craft-clay"
              caption="Clay"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
          </li>
          <li className="relative aspect-[3/4] overflow-hidden">
            <EditorialImage
              slot="craft-hands"
              caption="Hands at work"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
          </li>
          <li className="relative aspect-[3/4] overflow-hidden">
            <EditorialImage
              slot="craft-kiln"
              caption="The kiln"
              sizes="(min-width: 640px) 33vw, 100vw"
            />
          </li>
        </ul>
      </Section>

      {founder ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <p className="text-label text-muted-foreground">The founder</p>
            <h2 className="text-heading-1 mt-3">{BRAND.founder}</h2>
            <p className="text-body-lg mt-6 text-muted-foreground">{founder}</p>
          </div>
        </Section>
      ) : null}

      <Section tone={founder ? "sunken" : "default"}>
        <div className="relative aspect-[3/2] w-full overflow-hidden">
          <Image
            src={TEAM_PHOTO.src}
            alt={TEAM_PHOTO.alt}
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="text-label text-muted-foreground">The people</p>
            <h2 className="text-heading-1 mt-3">The Nnino family</h2>
          </div>
          <div className="lg:col-span-7">
            <p className="text-body-lg text-muted-foreground">
              Nnino is {BRAND.teamSize} people: potters, sculptors, painters, a moulder,
              and the hands that run the kiln, glaze and pack. The work carries their
              names.
            </p>
            {team.length > 0 ? (
              <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {team.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-baseline justify-between gap-4 border-b border-border py-2"
                  >
                    <span className="text-body-sm font-medium">{member.name}</span>
                    <span className="text-metadata text-muted-foreground">
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild variant="link" className="mt-8">
              <Link href="/family">Meet the family</Link>
            </Button>
          </div>
        </div>
      </Section>

      {continuation ? (
        <Section>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-quote text-foreground">{continuation}</p>
          </div>
        </Section>
      ) : null}

      <section className="bg-charcoal">
        <Container>
          <div className="flex flex-col items-start gap-8 py-20 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-heading-1 max-w-xl text-dark-foreground">
              Come and see the work
            </h2>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg">
                <Link href="/shop">Browse the collection</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-dark-border text-dark-foreground hover:bg-dark-foreground/10"
              >
                <Link href="/contact">Visit the studio</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
