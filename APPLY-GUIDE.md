# Apply Guide (Round 2)

This package is additive on top of `nnimo-main` **and** on top of the round
1 patch you already applied (image quality fixes + `public/images/`
placeholder removal). If you haven't applied round 1 yet, do that first —
this package doesn't repeat those files unless they needed a further edit.

## What's in this ZIP

```
PHASE-2-NOTES.md                        Full explanation of what was found and fixed
DELETED-FILES-ROUND-2.txt               Files to delete from public/brand/
APPLY-GUIDE.md                          This file
code-changes/                           Every modified/new source file, same folder structure as the repo
static-files-to-add/                    public/images/hero/main.png — real photo, framed hero treatment
real-photography-ready-to-upload/       Mario's 6 images again, for reference (you've likely already uploaded these)
```

## Step 1 — Delete the AI-generated brand images

Delete the ten files listed in `DELETED-FILES-ROUND-2.txt` from
`public/brand/`. Leave `nnino-team.png`, `nnino-wordmark.png`,
`nnino-tagline.png`, `nnino-motif.png`, and `nnino-motif_4K_upscaled.png` —
those are genuine.

## Step 2 — Apply the code changes

Copy each file under `code-changes/` into the matching path in your working
copy, overwriting the existing file:

- `lib/brand-assets.ts` — rewritten; only exports `WORDMARK`, `TAGLINE_MARK`,
  `MOTIF`, `TEAM_PHOTO` now. `HERO_PIECE`, `CUSTOM_HERO_PIECE`,
  `ANTELOPE_VASE`, `COLLECTION_HIGHLIGHTS` are gone.
- `lib/editorial-images.ts` — `hero-main` now has real alt text since that
  slot is filled (see step 3).
- `components/catalogue/media-image.tsx` — added a `fit="framed"` option
  (see PHASE-2-NOTES.md).
- `components/site/editorial-image.tsx` — same `fit="framed"` option, plus
  the homepage hero now uses it.
- `components/catalogue/product-gallery.tsx` — unchanged since round 1,
  included here again only because your round-1 apply may not be in place
  yet; safe to skip if already applied.
- `next.config.ts` — unchanged since round 1; same note as above.
- `app/(site)/page.tsx` — Craftsmanship image and the four-tile range grid
  now use real featured-product photos instead of static AI images; hero
  now uses `fit="framed"`.
- `app/(site)/about/page.tsx` — same Craftsmanship-image fix.
- `app/(site)/custom/page.tsx` — hero and four-tile grid now use real
  featured-product photos.
- `app/(site)/c/[slug]/page.tsx`, `app/(site)/family/page.tsx`,
  `app/(site)/collections/[slug]/page.tsx` — unchanged since round 1,
  included for completeness.

## Step 3 — Add the real hero image

Copy `static-files-to-add/public/images/hero/main.png` into your repo at
the same path (`public/images/hero/main.png`). This is Mario's Zebra Fusion
range group shot, shown "framed" (blurred backdrop + full uncropped photo)
so nothing is cropped out.

**If you'd rather use a different photo for this slot** — including the
upscaled version of this same image, or a proper wide/landscape shot —
just replace this file with yours at the same path. No code change needed
either way.

## Step 4 — Verify

- Homepage hero should now show the Zebra Fusion range photo, softly
  framed rather than harshly cropped.
- Homepage "Craftsmanship" section and the four-tile grid under "The Nnino
  legacy" should show your real featured products (whatever's published in
  Admin right now) — this updates automatically as your catalogue changes,
  no further deploys needed for new products to appear here.
- About page "Craftsmanship" section — same real-photo behaviour.
- Custom page hero and four-tile grid — same.
- `public/brand/` should contain only: `nnino-team.png`,
  `nnino-wordmark.png`, `nnino-tagline.png`, `nnino-motif.png`,
  `nnino-motif_4K_upscaled.png`.

## What's still a placeholder, honestly

If you haven't published at least one featured product with a photo in
Admin yet, the Craftsmanship/legacy/custom sections above will show the
clean "Studio photography coming soon" panel instead of a real photo —
that's the intended, honest behaviour, not a bug. Once you mark a product
as featured with a photo attached, it'll appear automatically.
