import * as React from "react";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { controlClass } from "@/components/admin/field";

export type AdminMediaRef = {
  id: string;
  provider: "LOCAL" | "S3";
  storageKey: string;
  url?: string | null;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

/**
 * A square thumbnail for the admin.
 *
 * Fixed pixel dimensions rather than `fill`: admin thumbnails sit in tables and
 * grids at a known size, and `fill` would need a positioned wrapper at every
 * call site. The URL still comes from `resolveMediaUrl`, so a move from local
 * disk to S3 changes nothing here.
 */
export function MediaThumb({
  media,
  size = 64,
  className,
  label,
}: {
  media: AdminMediaRef | null;
  size?: number;
  className?: string;
  /** Used as alt text when the image has none of its own. */
  label?: string;
}) {
  if (!media) {
    return (
      <div
        style={{ width: size, height: size }}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-border-strong bg-surface-sunken",
          className,
        )}
      >
        <span className="text-metadata text-muted-foreground/70">—</span>
      </div>
    );
  }

  return (
    <Image
      src={resolveMediaUrl(media)}
      // An image with no alt text is a real state in this admin — the media
      // library exists partly so the team can add it. Empty alt would hide the
      // gap; the filename-free label at least says which image this is.
      alt={media.altText?.trim() || label || "Uploaded image"}
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded-[var(--radius-sm)] border border-border object-cover",
        className,
      )}
    />
  );
}

/**
 * Choosing one image for a field inside a larger form.
 *
 * A native `<select>` rather than a modal picker. It is a form control that
 * submits with everything else, it is keyboard-navigable and screen-reader
 * announced for free, and it needs no JavaScript — which matters because these
 * sit inside forms that must survive a failed hydration. The thumbnail beside it
 * answers "which one is currently chosen", which is the only thing the select
 * itself cannot show.
 *
 * The multi-image product gallery is a different problem and gets a different
 * control — see ProductImageManager.
 */
export function MediaSelect({
  name,
  value,
  options,
  current,
  emptyLabel = "No image",
  describedBy,
}: {
  name: string;
  value: string | null;
  options: { id: string; label: string }[];
  current: AdminMediaRef | null;
  emptyLabel?: string;
  describedBy?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <MediaThumb media={current} size={56} />
      <select
        id={`field-${name}`}
        name={name}
        defaultValue={value ?? ""}
        aria-describedby={describedBy}
        className={controlClass}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A human label for a media row.
 *
 * Alt text first because it is what the team actually wrote; the original
 * filename next; the storage key never — it is a random uuid and tells nobody
 * anything.
 */
export function mediaLabel(media: {
  id: string;
  altText?: string | null;
  originalFilename?: string | null;
  createdAt?: Date;
}): string {
  const named = media.altText?.trim() || media.originalFilename?.trim();
  if (named) return named.length > 70 ? `${named.slice(0, 67)}…` : named;
  const when = media.createdAt ? media.createdAt.toISOString().slice(0, 10) : "";
  return when ? `Untitled image · ${when}` : "Untitled image";
}
