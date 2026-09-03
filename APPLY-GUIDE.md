# Apply Guide — Real Photography + Image Pipeline Fix

This package is additive on top of your existing `nnimo-main` codebase.
Nothing here touches the database schema, Prisma, auth, commerce, or
anything outside the image-rendering path and the editorial placeholder
files.

## What's in this ZIP

```
IMAGE-MAPPING.md                        Full inspection + where every real photo belongs
IMAGE-EDIT-PROMPTS.md                   Per-image AI upscale/cleanup prompts
DELETED-FILES.txt                       List of placeholder files to delete
APPLY-GUIDE.md                          This file
real-photography-ready-to-upload/       Mario's 6 images, cleaned filenames, high-quality JPEG
code-changes/                           Every modified source file, same folder structure as the repo
```

## Step 1 — Apply the code changes

Copy each file under `code-changes/` into the matching path in your
`nnimo-main` working copy, overwriting the existing file:

- `next.config.ts`
- `components/catalogue/media-image.tsx`
- `components/catalogue/product-gallery.tsx`
- `components/site/editorial-image.tsx`
- `app/(site)/page.tsx`
- `app/(site)/custom/page.tsx`
- `app/(site)/c/[slug]/page.tsx`
- `app/(site)/family/page.tsx`
- `app/(site)/about/page.tsx`
- `app/(site)/collections/[slug]/page.tsx`

**What changed and why:**

1. **`next.config.ts`** — Next.js 16 requires every image `quality` value to
   be explicitly allow-listed (`images.qualities`) or the optimiser rejects
   the request. This was missing, so every image on the site silently fell
   back to the framework default of 75 — soft for hand-painted glaze detail.
   Added `qualities: [75, 90, 100]`, widened `deviceSizes` up to 2560 for
   large desktop displays, and added an explicit `imageSizes` list so small
   slots (thumbnails, filmstrip) don't get served from the 420px floor.

2. **`components/catalogue/media-image.tsx`** — the shared component behind
   every product card, collection card, and product detail image. Added a
   `quality` prop defaulting to **90** (was implicitly 75).

3. **`components/catalogue/product-gallery.tsx`** — main gallery image and
   thumbnails now request quality 90; the fullscreen lightbox (where
   softness is most visible) requests quality **100**.

4. **`components/site/editorial-image.tsx`** — same fix, quality 90, for
   any future editorial/atmospheric photography placed in `public/images/`.

5. **Page-level `<Image>` usages** (homepage, about, custom, family,
   campaign landing pages, collection detail) — added explicit `quality`
   props (90 for standard content images, 95–100 for hero/lightbox-style
   full-bleed images) everywhere a bare `next/image` call existed outside
   `MediaImage`/`EditorialImage`.

No `sizes`, `object-fit`, or layout values were changed — those were
already correct. The bug was specifically the missing quality allow-list
plus the framework's low default.

## Step 2 — Delete the placeholder editorial images

Delete the files listed in `DELETED-FILES.txt` from your `public/images/`
folder. This requires **no other code change** — `EditorialImage` already
falls back to an honest "Studio photography coming soon" panel when a
slot's file is absent (that's the intended, designed behaviour of that
component, described in `public/images/README.md`).

Do **not** touch anything under `public/brand/` — none of that was changed
or should be removed.

## Step 3 — Upload the real photography via Admin → Media

Files are in `real-photography-ready-to-upload/`. Follow the mapping in
`IMAGE-MAPPING.md` exactly — two are exact product-name matches, the rest
need your confirmation since I can't see your live database from here:

1. `double-handle-serving-platter-monstera.jpg` → attach to product
   **"Double Handle Serving Platter — Monstera"**
2. `double-handle-serving-platter-zebra-fusion.jpg` → attach to product
   **"Double Handle Serving Platter — Zebra Fusion"** (this is almost
   certainly the platter currently showing low-res at
   `/products/double-handle-surving-plater`)
3. `zebra-fusion-collection-range-group-shot.jpg` → upload as the
   **Zebra Fusion collection hero image** (Admin → Collections → Zebra Fusion)
4. `double-handle-serving-platter-flame-lily.jpg` → use as the
   **Flame Lily collection hero**, or attach to a new product if you add one
5. `zebra-fusion-tea-set.jpg` → secondary gallery image on the Zebra Fusion
   collection page, or attach to a new "Zebra Fusion Tea Set" product
6. `antipasto-platter-round-zebra-black-white.jpg` → hold back until a
   matching "Antipasto Platter Round — Zebra" product is added, or add it
   now if you're ready to sell that piece

For best results, run the images needing cleanup through the prompts in
`IMAGE-EDIT-PROMPTS.md` first (mainly: removing the visible display stands,
and upscaling images 1, 5 and 6 before they're used at large display sizes).

## Step 4 — Verify

After deploying:
- `/products/double-handle-surving-plater` should show the real Zebra Fusion
  platter at full sharpness once its Media is updated in Admin.
- Homepage hero, About "process" strip, Contact "inside and out", and the
  Collections banner will now show the clean "coming soon" panel instead of
  the AI-generated placeholder photography, until real studio/team photos
  are uploaded.
- Any newly uploaded product/collection/team image should render
  noticeably sharper than before, since it now requests quality 90–100
  instead of the previous default of 75.

## What was intentionally left alone

- Database schema, Prisma, seed data — untouched.
- `/public/brand/` — untouched, per instruction.
- Loading states, spacing, responsive layout, and object-fit/crop
  behaviour — these were already correctly built (Phase 9 gallery,
  skeleton loading states, `aspect-*` containers); the actual defect was
  narrowly the missing quality allow-list plus the AI placeholder images,
  both addressed above. No other UI/UX changes were made, to keep this
  patch minimal and easy to review.
