# Gallery & Earth — design system

## Two layers of colour token

`app/globals.css` defines brand tokens and semantic tokens separately.

**Brand tokens** are the exact supplied hexes, never altered:
`--color-terracotta #B85C3A`, `--color-ochre #D4A96A`, `--color-clay #7A8B6F`,
`--color-stone #8A7E72`, `--color-warm-white #FAF7F2`,
`--color-charcoal #2C2C2C`. Use them for large fills, rules and decorative
surfaces — anything not carrying small text.

**Semantic tokens** are what components consume: `primary`, `secondary`,
`accent`, `background`, `surface`, `surface-sunken`, `foreground`,
`muted-foreground`, `border`, `border-strong`, `ring`, `destructive`.

### Why they differ: measured contrast

Three of the six brand colours fail WCAG 2.2 AA (4.5:1) for the text they would
carry. Measured:

| Pairing | Ratio | AA body text |
|---|---|---|
| Stone Grey `#8A7E72` on Warm White | 3.74:1 | fail |
| Warm White on Terracotta `#B85C3A` | 4.29:1 | fail |
| White on Clay Green `#7A8B6F` | 3.65:1 | fail |
| Charcoal on Ochre `#D4A96A` | 6.44:1 | **pass** — used as-is |

So where a brand colour carries small text, the semantic token is a
contrast-corrected variant of the same hue:

| Token | Value | Ratio | Replaces |
|---|---|---|---|
| `--color-muted-foreground` | `#6B6157` | 5.72:1 on Warm White | Stone Grey for body text |
| `--color-primary-foreground` | `#FFFFFF` | 4.54:1 on Terracotta | Warm White on buttons |
| `--color-secondary` | `#5F6F55` | 5.40:1 with white | Clay Green on buttons/badges |

The hue reads as the brand colour; the contrast is compliant. **This is a
deliberate deviation from the literal palette and needs sign-off.** The
alternative — shipping the exact hexes — means body copy and every button label
fail an accessibility audit on day one.

Never hard-code a hex in a component. Consume the semantic token.

## Typography roles

Seven roles from the brand direction, each a Tailwind v4 `@utility` so the scale
retunes in one place. Components reference the role name, never a font-size.

| Utility | Face | Notes |
|---|---|---|
| `text-display` | Playfair Display 400 | `clamp(2.5rem, 6vw, 4.75rem)`, tracking `-0.02em` |
| `text-heading-1` | Playfair Display 400 | `clamp(1.875rem, 3.5vw, 2.75rem)` |
| `text-heading-2` | Playfair Display 400 | `clamp(1.375rem, 2vw, 1.75rem)` |
| `text-heading-3` | **Inter** 500 | 1.0625rem — see below |
| `text-body-lg` / `text-body` / `text-body-sm` | Inter 400 | 1.125 / 1 / 0.875rem |
| `text-label` | Inter 500 | uppercase, tracking `0.12em` |
| `text-nav` | Inter 500 | uppercase, tracking `0.1em` |
| `text-price` | Cormorant Garamond 500 | tabular figures |
| `text-metadata` | Inter 500 | 0.6875rem, uppercase, tracking `0.14em` |
| `text-quote` | Cormorant Garamond 400 italic | pull quotes |

Three deliberate choices:

- **Playfair at 400, never bold.** Editorial restraint reads as a gallery; bold
  serif display reads as a shop banner.
- **`text-heading-3` switches to Inter.** Below ~1.25rem Playfair loses
  legibility, and small serif headings are where templates look cheap.
- **Prices are set in Cormorant.** A price on a one-off handmade piece should
  read like a gallery valuation, not a supermarket tag. Tabular figures so
  columns align in the admin.

Fonts are self-hosted at build time by `next/font` — no runtime request to
Google, no layout shift, and no third-party origin to allow in a future CSP.
Weights are enumerated rather than loading variable ranges the design never uses.

## The signature element

Every Nnino piece is one-off, hand-sculpted and signed underneath, so the
catalogue is closer to a gallery hang than a product grid. The recurring device
across the whole site is therefore a **museum wall label**: a 2.5rem hairline
terracotta rule, the piece name, then its physical facts in small caps.

`components/ui/gallery-label.tsx` plus the `gallery-label` utility. It is the one
place the design is allowed to be distinctive; everything around it stays quiet.

It **drops null facts rather than showing a placeholder**, because most of the
imported catalogue genuinely has no measured weight and inventing one would be
worse than omitting it.

## Restraint rules

- Radii are minimal: 2px / 4px / 6px. No pill cards.
- No gradients except the single charcoal hero field.
- No glassmorphism. The header uses a plain background with a 2px backdrop blur
  at most.
- Cards sit on `--color-surface` (paper white) so photography reads as a gallery
  print, not a tinted panel.
- Sections alternate `default` / `sunken` for rhythm, never colour blocking.

## Accessibility floor

Built in, not audited on later:

- `:focus-visible` gets a 2px terracotta outline everywhere; never removed.
- `prefers-reduced-motion: reduce` collapses all animation and transition
  durations in the base layer, so no component needs to remember.
- A skip link precedes the header and targets `#main`.
- The mobile drawer locks body scroll, closes on Escape, and sets
  `aria-expanded` / `aria-controls`.
- Tables use real `<table>` markup with `<caption>` and `scope="col"`.
- Active nav items carry `aria-current="page"`, not just a colour change.
