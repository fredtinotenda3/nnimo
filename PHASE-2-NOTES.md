# Round 2 — Removing the AI-Generated public/brand/ Images

## What was wrong

The first pass (round 1) correctly identified and removed the AI-generated
files in `public/images/` (hero, craft, studio, atmosphere placeholders),
but left `public/brand/` alone — the previous developer's code comments
explicitly claimed those were "REAL NNINO ASSETS... no stock images, no
placeholders and no generated imagery anywhere." You confirmed that claim
was wrong: several of those files are also AI-generated.

## What I checked, and what I found

I opened each file in `public/brand/` and looked for the tells that
distinguish Mario's real photography (visible acrylic display stands,
natural JPEG compression, slightly imperfect studio lighting, plain white
seamless backgrounds) from AI generation (unnaturally perfect "3D render"
lighting, dark vignette backdrops, hyper-uniform repeated texture, glossy
CGI-style surfaces):

| File | Verdict | Reasoning |
|---|---|---|
| `antelope-vase.png` | **AI-generated** | Repeated/duplicated antelope poses (a classic diffusion-model artifact), unnaturally perfect studio lighting |
| `hero-giraffe-tureen.png`, `giraffe-tureen-front.png`, `giraffe-tureen-side.png`, `giraffe-tureen-floral.png`, `giraffe-tureen-detail.png` | **AI-generated** | Dark vignette "product render" backdrop, glossy CGI-style glaze rendering inconsistent with a real photograph |
| `custom-hero-big-five.png` | **AI-generated** | Same render style as the tureens |
| `range-leopard.png`, `range-sable.png`, `range-elephant.png` | **AI-generated** | Photorealistic fur/skin texture that's far more detailed and uniform than a hand-painted ceramic surface could actually be — hand-painted glaze doesn't render individual fur strands |
| `nnino-team.png` | **Genuine** | Real people in branded polo shirts, real shelving, real product table, natural lighting and imperfections — nothing about this reads as generated |
| `nnino-wordmark.png`, `nnino-tagline.png`, `nnino-motif.png`, `nnino-motif_4K_upscaled.png` | **Genuine brand artwork** | These are logo/wordmark/pattern graphics, not photographs of a ceramic piece, so the "AI product photo" concern doesn't apply |

**Ten files were deleted.** The team photo and the four graphic-design
assets were kept — see `DELETED-FILES-ROUND-2.txt` for the exact list.

## How the code was fixed

`lib/brand-assets.ts` previously exported `HERO_PIECE`, `CUSTOM_HERO_PIECE`,
`ANTELOPE_VASE`, and `COLLECTION_HIGHLIGHTS` (four more images) — all
pointing at the now-deleted files. Rather than leaving those exports dangling
or replacing them with more static images, I rewired every page that used
them to pull a **real, currently-published product photo from your live
catalogue** instead, via the existing `getFeaturedProducts()` data fetcher
and the `MediaImage` component:

- **Homepage** — "Craftsmanship" section image and the four-tile "range
  variety" grid under "The Nnino legacy" now show your first few featured
  products' real photos (whatever's actually published in Admin), not a
  fixed static image.
- **About page** — same "Craftsmanship" section, same treatment.
- **Custom (commissions) page** — the hero image and the four-tile
  "glimpse of a few collections" grid now show real featured products too.

This has a real benefit beyond just being honest: these sections now
**update automatically** as you publish new products in Admin, instead of
being frozen to whatever static file was checked into the repo. If a
featured product doesn't have a photo yet, the tile shows the same clean
"Studio photography coming soon" panel used everywhere else on the site —
never a broken image, never a placeholder photo.

## One thing to know: the homepage hero

All six of Mario's real photos are **portrait** product shots (taller than
wide). The homepage hero is a nearly full-screen, wide banner. Cropping a
portrait photo to fill that banner with a plain `object-cover` would have
chopped off most of the image (imagine cropping the Zebra Fusion range
photo down to a thin vertical sliver).

Instead of shipping that bad crop, I added a **"framed" display mode** to
both `MediaImage` and `EditorialImage`:
- A soft, blurred, darkened version of the same photo fills the full banner
  as an ambient backdrop.
- The complete, uncropped photo sits centred on top of it.

This is the same visual pattern high-end e-commerce sites use for portrait
photography in a landscape hero slot — no detail is lost, and it looks
intentional rather than badly cropped. I used your Zebra Fusion range group
shot for the homepage hero as a placeholder using this treatment; it lives
at `public/images/hero/main.png` (see `static-files-to-add/`).

**If you have a proper wide/landscape hero photograph** (or want one taken),
that will look even better here — just replace that same file. The "framed"
mode will still apply gracefully to any future portrait photo dropped into
the same slot, so this isn't a dead end either way.

## The Custom-page hero: one honesty caveat

The Custom (commissions) page hero now shows your first featured product's
real photo, captioned "Have a piece made for you." That photo is genuinely
one of your pieces, but it isn't literally an example of a *custom*
commission — it's whatever happens to be first in your featured-products
list. This is far better than the AI-generated "Big Five" image it replaced,
but if you have (or take) an actual photo of a genuine one-off commission
piece, that would be a more accurate hero for that specific page. Worth
keeping in mind as you get more commission photography over time.
