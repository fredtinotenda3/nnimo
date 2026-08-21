# Nnino Ceramics — Editorial Image Wiring (changed files only)

This ZIP contains only the files that changed. Copy each one over the
matching path in your project (overwriting the existing file) — nothing
else in the project was touched.

## Files in this package

1. `lib/editorial-images.ts` — all 12 slot paths switched from `.webp` to `.png`
2. `public/images/README.md` — documentation updated with a wiring table
3. `app/(site)/page.tsx` — homepage: added `hero-alternate` and `editorial-texture` breaks
4. `app/(site)/about/page.tsx` — added `about-atmosphere` break and `craft-clay` / `craft-hands` / `craft-kiln` process strip
5. `app/(site)/custom/page.tsx` — added `custom-atmosphere` break
6. `app/(site)/contact/page.tsx` — added `contact-atmosphere` break and `studio-interior` / `studio-exterior` gallery
7. `app/(site)/family/page.tsx` — added `family-atmosphere` break
8. `app/(site)/collections/page.tsx` — added `collection-atmosphere` banner
9. `app/(site)/collections/[slug]/page.tsx` — added `collection-atmosphere` fallback (only shows when a range has no `heroImage` of its own)

## What was NOT changed

No business logic, payments, RBAC, analytics, S3, or database schema files
were touched. No product, collection, or team data was modified. The
`components/site/editorial-image.tsx` component and its "coming soon"
fallback panel were not touched — they already existed and already worked
correctly; this package only wires them into pages and points them at
`.png` paths.

## Current state after applying this package

Every one of the 12 slots is now wired into a real page, but **no image
files have been placed** in `public/images/` yet (see the placement summary
in the main reply — every one of Marion's photos failed the 4K/quality bar
and needs to be enhanced or regenerated first). Until files exist at the
paths below, each slot renders a plain "coming soon" panel — the site will
not look broken, just unfinished in those specific spots.

| Slot | Expected file |
|---|---|
| hero-alternate | public/images/hero/alternate.png |
| craft-clay | public/images/craft/clay.png |
| craft-hands | public/images/craft/hands.png |
| craft-kiln | public/images/craft/kiln.png |
| studio-interior | public/images/studio/interior.png |
| studio-exterior | public/images/studio/exterior.png |
| custom-atmosphere | public/images/custom/atmosphere.png |
| editorial-texture | public/images/editorial/texture.png |
| collection-atmosphere | public/images/collection-atmosphere/default.png |
| about-atmosphere | public/images/about/atmosphere.png |
| family-atmosphere | public/images/family/atmosphere.png |
| contact-atmosphere | public/images/contact/atmosphere.png |

Once you generate/enhance an image (see prompts in the main reply) and
drop the `.png` file at the matching path, it appears on the live site on
the next request — no further code changes needed.
