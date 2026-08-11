# Files to DELETE after unzipping

Two of these are important; the zip cannot delete files for you.

## 1. `app/page.tsx` — MUST be deleted

This is the leftover create-next-app scaffold page (the one with the Next.js
logo and "Welcome To Nnimo Ceramics"). It resolves to `/`, and so does
`app/(site)/page.tsx`.

That collision is why the real homepage never appeared in Phase 1: `/` was
serving the boilerplate, not the Nnino homepage. It also hid a second bug — the
footer crashed on render, which nobody saw because the footer was never reached.

```bash
rm app/page.tsx
```

## 2. Unused scaffold SVGs — optional

```bash
rm -f public/next.svg public/vercel.svg public/file.svg public/globe.svg public/window.svg
```

Nothing references them now that `app/page.tsx` is gone.
