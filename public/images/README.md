# Editorial image slots (Phase 9)

This folder is where real Nnino photography goes once it exists. It is
separate from `/public/brand/` (the existing, already-populated set of
supplied product and team photographs referenced by `lib/brand-assets.ts`)
and from the `Media` database table (product/collection photography the team
uploads through the admin).

This folder is for **atmospheric and editorial** imagery only — the kind the
Phase 9 brief calls out separately from product photography: clay texture,
hands at work, the studio interior, material studies. Nothing in here is
ever presented as an actual product photograph.

## How it works

Every slot is declared once in `lib/editorial-images.ts` with an expected
file path and the alt text it should carry. `<EditorialImage slot="..." />`
(`components/site/editorial-image.tsx`) checks at request time whether that
file exists on disk:

- **File present** → renders it as a `next/image`, using the alt text from
  the registry.
- **File absent** (the current state of every slot) → renders the same
  "coming soon" panel style already used for unphotographed products
  (`components/catalogue/media-image.tsx`), so an empty slot looks like a
  deliberate design choice rather than a broken image.

## Adding a photograph

1. Drop the file at the path named in `lib/editorial-images.ts` for that
   slot (e.g. `studio-interior` expects `/public/images/studio/interior.webp`).
2. That's it — no component code changes. The next request picks it up.

## Folders

| Folder | Use |
|---|---|
| `hero/` | Homepage/section hero crops, when a slot needs a different image than the existing brand hero |
| `brand/` | Supplementary brand/identity imagery beyond what's in `/public/brand/` |
| `craft/` | Process: clay, tools, hands, glazing, the kiln |
| `studio/` | The studio space itself — interior, exterior, light |
| `custom/` | Commission-specific atmosphere (not to be confused with real commissioned-piece photography, which belongs in `/public/brand/` or the `Media` table once taken) |
| `editorial/` | General magazine-style material/texture imagery not tied to a specific page |
| `collection-atmosphere/` | Mood imagery for collection landing pages |
| `about/` | About page editorial imagery |
| `family/` | Family/team page editorial imagery (individual portraits still belong in the `Media` table via the admin, so they can be attached to a named team member) |
| `contact/` | Contact/visit-the-studio page imagery |

Prefer `.webp`. Keep originals reasonably sized — this directory is served
statically and bundled with every deploy, unlike `Media` table uploads.
