import "server-only";
import { db } from "@/lib/db";
import { resolveMediaUrl } from "@/lib/media";
import type { BannerValue } from "@/lib/admin/schemas";

export const BANNER_CONTENT_KEY = "marketing.banner";

export const DEFAULT_BANNER: BannerValue = {
  enabled: false,
  text: "",
  linkUrl: null,
  linkLabel: null,
  mediaId: null,
};

function parseBannerJson(value: unknown): Omit<BannerValue, "mediaId"> {
  if (typeof value !== "object" || value === null) {
    return { enabled: false, text: "", linkUrl: null, linkLabel: null };
  }
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    text: typeof record.text === "string" ? record.text : "",
    linkUrl: typeof record.linkUrl === "string" ? record.linkUrl : null,
    linkLabel: typeof record.linkLabel === "string" ? record.linkLabel : null,
  };
}

/** For the admin form: the raw stored value (or the honest empty default if the block has never been saved). */
export async function getBannerConfig(): Promise<BannerValue> {
  const block = await db.contentBlock.findUnique({
    where: { key: BANNER_CONTENT_KEY },
    select: { jsonValue: true, mediaId: true },
  });
  if (!block) return DEFAULT_BANNER;
  return { ...parseBannerJson(block.jsonValue), mediaId: block.mediaId };
}

export type PublicBanner = {
  text: string;
  linkUrl: string | null;
  linkLabel: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
};

/**
 * For the public site: only ever returns something when the banner is
 * explicitly enabled AND has text — a banner nobody has written cannot be
 * "on" by default the way a checkbox left unticked could accidentally be.
 * Returns null otherwise, and `<PromoBanner>` renders nothing at all in that
 * case (see components/site/promo-banner.tsx).
 */
export async function getPublicBanner(): Promise<PublicBanner | null> {
  const block = await db.contentBlock.findUnique({
    where: { key: BANNER_CONTENT_KEY },
    select: {
      jsonValue: true,
      mediaId: true,
    },
  });
  if (!block) return null;

  const parsed = parseBannerJson(block.jsonValue);
  if (!parsed.enabled || !parsed.text) return null;

  const media = block.mediaId
    ? await db.media.findUnique({
        where: { id: block.mediaId },
        select: {
          provider: true,
          storageKey: true,
          url: true,
          altText: true,
        },
      })
    : null;

  return {
    text: parsed.text,
    linkUrl: parsed.linkUrl,
    linkLabel: parsed.linkLabel,
    imageUrl: media ? resolveMediaUrl(media) : null,
    imageAlt: media?.altText ?? null,
  };
}