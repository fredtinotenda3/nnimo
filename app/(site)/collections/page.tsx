import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCollections } from "@/lib/catalogue";
import { breadcrumbJsonLd } from "@/lib/seo";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CollectionCard } from "@/components/catalogue/collection-card";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "The Nnino Ceramics ranges — hand-sculpted and hand-painted collections from the Bulawayo studio.",
  alternates: { canonical: "/collections" },
  openGraph: { title: "Collections · Nnino Ceramics", url: "/collections" },
};

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await getPublicCollections();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Collections", path: "/collections" },
            ]),
          ),
        }}
      />

      <Section className="pt-32 lg:pt-40">
        <p className="text-label text-muted-foreground">Ranges</p>
        <h1 className="text-display mt-4 max-w-3xl">Collections</h1>
        <p className="text-body-lg mt-8 max-w-2xl text-muted-foreground">
          Each range is developed as a family of pieces — the same hand, the same
          palette, worked across tableware, vessels and sculpture.
        </p>

        <div className="mt-16">
          {collections.length === 0 ? (
            <EmptyState
              title="No collections are published yet"
              description="Every range documented in the Nnino brochure has been imported, but each one is still a draft. A range appearing in the brochure shows it existed, not that it is in production now — so publishing is a decision for the studio."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/collections">Open collections in admin</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((collection, index) => (
                <li key={collection.id}>
                  <CollectionCard collection={collection} priority={index < 3} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}
