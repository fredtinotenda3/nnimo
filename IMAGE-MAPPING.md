# Mario's Real Photography — Inspection & Mapping

Source: `zebra.rar` (6 images). All were re-saved as high-quality JPEG
(quality 95, EXIF-orientation corrected, no resizing) and renamed for
clarity. Ready-to-upload files are in `real-photography-ready-to-upload/`.

## 1. Full inspection

| # | Ready-to-upload filename | Shows | Dimensions | File size | Format | Production quality |
|---|---|---|---|---|---|---|
| 1 | `antipasto-platter-round-zebra-black-white.jpg` | Round platter, black-and-white zebra-stripe rim, kaleidoscope of zebras at center, on a clear acrylic display stand | 667 × 1000 px | 96 KB | JPEG | **Usable as-is for cards/thumbnails.** Too low-res for a full-bleed hero or aggressive lightbox zoom — recommend upscaling (prompt below) before using above ~800px display width. Acrylic stand is visible and should ideally be cropped/removed. |
| 2 | `double-handle-serving-platter-monstera.jpg` | Oval two-handled platter, hand-painted green monstera leaf, on a small ceramic stand | 825 × 1080 px | 51 KB | JPEG | **Good — usable as-is.** Clean, even white background, sharp focus, well composed. Minor: plastic stand pegs visible under the platter. |
| 3 | `double-handle-serving-platter-flame-lily.jpg` | Oval two-handled platter, hand-painted flame lily (red/yellow), on a stand | 892 × 1080 px | 53 KB | JPEG | **Good — usable as-is.** Same notes as #2 (stand visible, otherwise clean). |
| 4 | `double-handle-serving-platter-zebra-fusion.jpg` | Oval two-handled platter, zebra-stripe rim with rainbow accent, black center | 667 × 1000 px | 48 KB | JPEG | **Good — usable as-is**, though slightly softer focus than #2/#3. This appears to be **the exact platter shown on the currently-broken product page** (`/products/double-handle-surving-plater`). |
| 5 | `zebra-fusion-collection-range-group-shot.jpg` | Full range group shot: square "story" plate, rectangular sushi plate, honeypot, teapot, cups & saucers, spoon rest, 3D napkin holders | 932 × 1080 px | 163 KB | JPEG | **Good, best of the six.** Ideal as a collection hero/atmosphere shot — shows range breadth in one frame. Slight glare/reflection on the glossy plates in the top-left, otherwise strong. |
| 6 | `zebra-fusion-tea-set.jpg` | Zebra-stripe teapot + 6 cups & saucers | 667 × 1000 px | 75 KB | JPEG | **Good — usable as-is.** Slightly dim/flat lighting compared to the others; would benefit from a brightness/contrast pass. |

None of the six are broken, mis-encoded, or unusably low quality — they're
all real studio product shots on clean backgrounds. The main limitation
across all of them is **resolution**: 667–932 px on the short edge is fine
for grid thumbnails and product cards, but soft once displayed above
roughly 1000–1200 px (a full-width hero, or the gallery lightbox at
`quality={100}`). See `IMAGE-EDIT-PROMPTS.md` for upscaling guidance.

## 2. Where each image belongs

I cross-checked these against the verified source data in
`prisma/seed/source-data.ts` (the brochure/catalogue/price-list transcription
the whole catalogue is seeded from). Two images are exact name matches;
the rest need a judgement call, flagged below — **please confirm in
Admin before publishing**, since I can't query your live production
database from here to see what's actually been added or edited since seed.

| Image | Destination | Confidence | Action |
|---|---|---|---|
| `double-handle-serving-platter-monstera.jpg` | Product: **"Double Handle Serving Platter — Monstera"** | Exact name match in source data | Admin → Media → upload → attach as primary product photo |
| `double-handle-serving-platter-zebra-fusion.jpg` | Product: **"Double Handle Serving Platter — Zebra Fusion"** (collection: Zebra Fusion) | Exact name match, and matches the platter currently shown (badly) at `/products/double-handle-surving-plater` | Admin → Media → upload → attach as primary product photo, replacing whatever low-res image is there now |
| `double-handle-serving-platter-flame-lily.jpg` | Collection: **"Flame Lily"** (`flame-lily` slug exists) | No product row named "Double Handle Serving Platter — Flame Lily" exists in the seeded catalogue yet — only the collection itself | Use as the **Flame Lily collection hero image** for now. If this platter is meant to be a sellable product, add it as a new product under the Flame Lily collection in Admin → Products, then attach this photo to it instead. |
| `zebra-fusion-collection-range-group-shot.jpg` | Collection: **"Zebra Fusion"** hero image | Strong fit — shows the full range | Admin → Collections → Zebra Fusion → upload as the collection hero (`heroImage`). This is the image that will render full-bleed at the top of `/collections/zebra-fusion`. |
| `zebra-fusion-tea-set.jpg` | Product: closest is **"Espresso Cup & Saucer"** within the Zebra Fusion range items, OR a secondary/gallery image on the Zebra Fusion collection page | Approximate — the photo shows a full teapot + 6 cups/saucers; no product row is named exactly "Tea Set" | Recommend attaching as a **secondary gallery image on the Zebra Fusion collection page** (alongside the range group shot) rather than forcing it onto a single mismatched product. If you do sell this as a set, consider adding a "Zebra Fusion Tea Set" product row and attaching it there. |
| `antipasto-platter-round-zebra-black-white.jpg` | No matching product row | No fit — the seeded "Antipasto Platter Round" line only lists Buffalo, Cheetah, Lioness, Rhino and Botanical Birds; no Zebra variant exists in the current catalogue | Two options: (a) add a new product **"Antipasto Platter Round — Zebra"** in Admin and attach this photo, or (b) hold it back until that product is confirmed to exist. Do not attach it to an unrelated product. |

### Team / studio / process imagery
Mario's ZIP contained **no team portraits and no studio/process photography**
— all six images are product shots. That means the "coming soon" panels on
the About, Family, Contact, Craft and Custom pages (see section 3 below)
should stay empty until that photography exists; nothing in this ZIP should
be forced into those slots.

## 3. Static editorial placeholders — removed

The following AI-generated placeholder images have been **deleted** from
`public/images/` (code required zero changes — `EditorialImage` already
renders an honest "Studio photography coming soon" panel when a slot's file
is absent, by design):

- `public/images/hero/main.png` and `hero/alternate.png` / `.jfif` (homepage hero)
- `public/images/craft/clay.png`, `craft/hands.png`, `craft/kiln.png` (About page process strip)
- `public/images/studio/interior.png`, `studio/exterior.png` (Contact page)
- `public/images/collection-atmosphere/default.png` (Collections list/detail fallback banner)
- `public/images/about/atmosphere.png`, `family/atmosphere.png`, `contact/atmosphere.png`, `custom/atmosphere.png` (full-bleed section breaks)
- `public/images/editorial/texture.png` (homepage material break)

**`/public/brand/` was left completely untouched**, as instructed — those
are your existing supplied brand/product photography (giraffe tureen,
antelope vase, range motifs, team photo, wordmark, etc.) and remain in use
across the homepage, About, Custom and Family pages via `lib/brand-assets.ts`.

## 4. Product page mismatch note

`/products/double-handle-surving-plater` (note the "surving" typo in the
slug) is almost certainly the same platter as
`double-handle-serving-platter-zebra-fusion.jpg` — the design (zebra stripes,
rainbow-striped rim, black center) matches exactly. Once you upload the real
photo to that product's Media in Admin, its rendering will also benefit from
the `next.config.ts`/quality fixes below.
