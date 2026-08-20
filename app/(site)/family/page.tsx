import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { getContentBlocks, getPublicTeam } from "@/lib/catalogue";
import { TEAM_PHOTO } from "@/lib/brand-assets";
import { resolveMediaUrl } from "@/lib/media";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "The Nnino Family",
  description:
    "The people behind Nnino Ceramics — potters, sculptors, painters, a moulder, and the kiln and glazing hands who finish every piece.",
  alternates: { canonical: "/family" },
  openGraph: { title: "The Nnino Family · Nnino Ceramics", url: "/family" },
};

export const dynamic = "force-dynamic";

/**
 * Names and roles are the only fields the source material establishes for the
 * team. A biography renders only when the studio has written one; a portrait
 * only when one has been uploaded. Nothing here is generated — writing a
 * plausible-sounding biography for a real, named colleague of Marion's would be
 * putting words in their mouth.
 *
 * The group photograph is used instead of individual portraits, and no one in it
 * is identified, because the photograph is unlabelled.
 */
export default async function FamilyPage() {
  const [team, copy] = await Promise.all([
    getPublicTeam(),
    getContentBlocks(["family.intro"]),
  ]);

  const intro = copy.get("family.intro");
  const withBio = team.filter((member) => member.bio?.trim());

  return (
    <>
      <section className="relative bg-charcoal">
        <div className="relative h-[46svh] min-h-[320px] w-full">
          <Image
            src={TEAM_PHOTO.src}
            alt={TEAM_PHOTO.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-charcoal/50" />
          <Container className="relative flex h-full flex-col justify-end pb-12">
            <p className="text-label text-ochre">The people</p>
            <h1 className="text-display mt-4 text-dark-foreground">The Nnino family</h1>
          </Container>
        </div>
      </section>

      <Section>
        <div className="max-w-2xl">
          <p className="text-body-lg text-muted-foreground">
            {intro ??
              `Nnino is a team of ${BRAND.teamSize}. Every piece passes through several pairs of hands — thrown or moulded, sculptured, painted, glazed, fired and packed — and is signed at the bottom.`}
          </p>
        </div>

        <div className="mt-16">
          {team.length === 0 ? (
            <EmptyState
              title="The team has not been added yet"
              description="Team members are managed from the admin."
            />
          ) : (
            <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((member) => (
                <li key={member.id}>
                  {member.photo ? (
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-sunken">
                      <Image
                        src={resolveMediaUrl(member.photo)}
                        alt={member.photo.altText?.trim() || member.name}
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    /* No portrait yet. A warm panel with the person's initials
                       reads as a considered placeholder rather than a broken
                       image, and no stock face stands in for a real person. */
                    <div className="flex aspect-[4/5] w-full items-center justify-center bg-surface-sunken">
                      <span className="text-display text-border-strong" aria-hidden="true">
                        {member.name
                          .split(" ")
                          .map((part: string) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                    </div>
                  )}

                  <div className="gallery-label mt-5">
                    <h2 className="text-heading-2">{member.name}</h2>
                    <p className="text-metadata mt-2 text-muted-foreground">
                      {member.role}
                    </p>
                    {member.craft ? (
                      <p className="text-body-sm mt-3 text-muted-foreground">
                        {member.craft}
                      </p>
                    ) : null}
                    {member.bio ? (
                      <p className="text-body-sm mt-3 text-muted-foreground">
                        {member.bio}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {team.length > 0 && withBio.length === 0 ? (
          <p className="text-body-sm mt-14 max-w-2xl border-l-2 border-ochre pl-4 text-muted-foreground">
            Biographies and portraits are still to come. They are written and uploaded by
            the studio from the admin, in each person&rsquo;s own words, rather than
            drafted for them.
          </p>
        ) : null}
      </Section>

      <Section tone="sunken">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-heading-1">Work made by these hands</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/shop">Browse the collection</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/custom">Commission a piece</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
