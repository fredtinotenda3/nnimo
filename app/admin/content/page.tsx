import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import {
  CONTENT_DEFINITIONS,
  CONTENT_GROUPS,
  CONTENT_GROUP_DESCRIPTION,
  CONTENT_GROUP_LABEL,
  contentDefinitionOrFallback,
  type ContentDefinition,
} from "@/lib/admin/content-registry";
import { PageHeader, AdminSection } from "@/components/admin/page-header";
import { ContentBlockForm } from "@/components/admin/content-block-form";
import { MediaSelect, mediaLabel } from "@/components/admin/media-fields";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

type BlockRow = {
  key: string;
  type: "TEXT" | "RICH_TEXT" | "IMAGE" | "JSON";
  value: string | null;
  mediaId: string | null;
  updatedAt: Date;
};

type MediaOption = { id: string; altText: string | null; originalFilename: string | null; createdAt: Date };

/**
 * Editable site copy, grouped by where it appears.
 *
 * The registry drives the page, not the database. Keys the registry knows about
 * are rendered whether or not a row exists — that is how the team fills in the
 * passages Phase 1 deliberately left unwritten. Keys the database has but the
 * registry does not are rendered too, in "Other", because copy that is live on
 * the site and uneditable in the admin is exactly the situation Phase 4 exists
 * to remove.
 */
export default async function AdminContentPage() {
  await requirePermission("content:write");

  const [blocks, media] = await Promise.all([
    db.contentBlock.findMany({
      orderBy: { key: "asc" },
      select: { key: true, type: true, value: true, mediaId: true, updatedAt: true },
    }),
    db.media.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, altText: true, originalFilename: true, createdAt: true },
    }),
  ]);

  const rows = blocks as BlockRow[];
  const mediaOptions = (media as MediaOption[]).map((item) => ({
    id: item.id,
    label: mediaLabel(item),
  }));
  const byKey = new Map(rows.map((row) => [row.key, row]));

  // Registry entries first, then anything the database has that the registry
  // does not know about.
  const registryKeys = new Set(CONTENT_DEFINITIONS.map((definition) => definition.key));
  const unregistered: ContentDefinition[] = rows
    .filter((row) => !registryKeys.has(row.key))
    .map((row) => contentDefinitionOrFallback(row.key, row.type));

  const allDefinitions = [...CONTENT_DEFINITIONS, ...unregistered];
  const written = allDefinitions.filter((definition) => {
    const row = byKey.get(definition.key);
    return Boolean(row?.value?.trim() || row?.mediaId);
  }).length;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="Editorial"
        title="Content"
        description={`${written} of ${allDefinitions.length} passages written. Blank blocks are left blank on the site rather than filled with placeholder copy.`}
      />

      {CONTENT_GROUPS.map((group) => {
        const definitions = allDefinitions.filter((definition) => definition.group === group);
        if (definitions.length === 0) return null;

        return (
          <AdminSection
            key={group}
            title={CONTENT_GROUP_LABEL[group]}
            description={CONTENT_GROUP_DESCRIPTION[group]}
          >
            <div className="flex flex-col gap-5">
              {definitions.map((definition) => {
                const row = byKey.get(definition.key);
                return (
                  <ContentBlockForm
                    key={definition.key}
                    blockKey={definition.key}
                    label={definition.label}
                    where={definition.where}
                    type={definition.type}
                    value={row?.value ?? ""}
                    guidance={definition.guidance}
                    needsReview={definition.needsReview}
                    updatedAt={row?.updatedAt ?? null}
                    mediaField={
                      definition.type === "IMAGE" ? (
                        <MediaSelect
                          name="mediaId"
                          value={row?.mediaId ?? null}
                          current={null}
                          emptyLabel="No image chosen"
                          options={mediaOptions}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </AdminSection>
        );
      })}
    </div>
  );
}
