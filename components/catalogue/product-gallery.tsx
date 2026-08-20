"use client";

/**
 * Added Phase 9 — replaces a static hero image + four dead thumbnails
 * (clicking one did nothing; the main image never changed) with a working
 * gallery: click or arrow-key through the set, open a fullscreen view,
 * swipe on touch. Purchasing logic, product data and image URLs are
 * untouched — this only changes how the existing `product.images` array is
 * presented.
 *
 * IMPORTANT: this is a Client Component, so it must NOT import `@/lib/media`
 * or any server-only module. The server page resolves image URLs and passes
 * them in as plain strings.
 */

import * as React from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { cn } from "@/lib/utils";

type GalleryImage = {
  id: string;
  url: string;
  altText?: string | null;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const [active, setActive] = React.useState(0);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const count = images.length;

  const go = React.useCallback(
    (direction: 1 | -1) => {
      if (count === 0) return;
      setActive((current) => (current + direction + count) % count);
    },
    [count],
  );

  const current = images[active];
  const alt =
    current?.altText?.trim() || `${productName}, view ${active + 1} of ${count}`;

  const dialogRef = React.useRef<HTMLDivElement>(null);
  const openerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!lightboxOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxOpen(false);
        return;
      }
      if (event.key === "ArrowRight") {
        go(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        go(-1);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxOpen, go]);

  React.useEffect(() => {
    if (!lightboxOpen) openerRef.current?.focus();
  }, [lightboxOpen]);

  const touchStartX = React.useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? 1 : -1);
  };

  if (count === 0 || !current) return null;

  return (
    <div>
      <div
        className="group relative aspect-[4/5] w-full overflow-hidden bg-surface-sunken"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          key={current.id}
          src={current.url}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 58vw, 100vw"
          priority={active === 0}
          className="object-cover transition-opacity duration-300 motion-reduce:transition-none"
        />

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-surface/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:flex"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-surface/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:flex"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}

        <button
          ref={openerRef}
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center bg-surface/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:opacity-0"
          aria-label="View full screen"
        >
          <Expand className="h-4 w-4" aria-hidden="true" />
        </button>

        {count > 1 ? (
          <p className="text-metadata absolute bottom-3 left-3 bg-surface/90 px-2 py-1 text-muted-foreground lg:hidden">
            {active + 1} / {count}
          </p>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`View photo ${index + 1} of ${count}`}
                aria-current={index === active}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden bg-surface-sunken outline-offset-2 transition-opacity",
                  index === active
                    ? "opacity-100 ring-1 ring-inset ring-primary"
                    : "opacity-70 hover:opacity-100",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="(min-width: 1024px) 14vw, 20vw"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {lightboxOpen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} — full screen photo`}
          className="fixed inset-0 z-[70] flex flex-col bg-dark-surface"
        >
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-metadata text-dark-muted-foreground">
              {active + 1} / {count}
            </p>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center text-dark-foreground"
              aria-label="Close full screen photo"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div
            className="relative flex-1"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Image
              key={current.id}
              src={current.url}
              alt={alt}
              fill
              sizes="100vw"
              className="object-contain"
            />

            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-dark-foreground sm:left-5"
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-dark-foreground sm:right-5"
                >
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}