# Nnino Ceramics — Image-Generation Prompts for Admin → Media

## How to use this document

None of the images described here go into `/public/images/`. Every one is meant to be:

1. Generated with an image model of your choice, from the prompt text given.
2. Uploaded through **`/admin/media`** (see the Admin Guide, §6).
3. Attached to the relevant product, collection, or team profile from inside the admin (§7, §11), or left in the library as general content imagery for the About/homepage/story sections (§13).

Every collection and range named below comes from `prisma/seed/source-data.ts`, which was transcribed from the supplied Nnino source documents — nothing here is an invented range. Where a prompt is a **temporary placeholder**, its suggested alt text says so explicitly; replace it with real studio photography as soon as it exists, and delete the placeholder from Media once it's no longer attached anywhere (Admin Guide §6 — unused images can be deleted; in-use ones cannot until detached).

**Shared visual direction for every prompt below:** warm, African contemporary, tactile, quiet-luxury aesthetic; natural or softly diffused studio light; 4K, photorealistic; no text, no logos, no watermarks; no depiction of any specific existing Nnino product, so nothing here could be mistaken for real product photography of a numbered piece.

---

## A. Collection hero images

One mood-setting, editorial background image per real Nnino range — glaze colour, material, and pattern studies that evoke the range without depicting an actual finished piece. These are backgrounds, not product shots: a hero image sits behind a page title, so each prompt asks for open, uncluttered negative space (usually left- or right-weighted) rather than a centred, fully-detailed subject.

Every entry below: upload via `/admin/media` with the given alt text, then attach as the **Hero image** for that range at `/admin/collections/[range]` (Admin Guide §11). All are generic editorial assets, not placeholders standing in for a specific missing photograph — a hero image is atmospheric by design, so these are usable long-term.

### Safari and animal ranges

**1. Zebra Fusion** — `hero-zebra-fusion.png`
> Extreme close-up macro of hand-painted black-and-white zebra-stripe glaze on curved stoneware, stripes flowing and merging at different widths, glossy glaze catching soft studio light, shot at a shallow depth of field so only a narrow band is in crisp focus, warm neutral background, generous empty space to the right of frame.

**2. Zebra** — `hero-zebra.png`
> Wide, softly lit still life of a single unglazed zebra-striped ceramic fragment resting on raw ochre clay, dramatic side lighting, black and white stripe pattern bleeding into warm terracotta tones at the edges, shallow focus, large empty negative space above.

**3. Leopard** — `hero-leopard.png`
> Macro texture study of hand-painted leopard-rosette glaze pattern on a curved ceramic surface, warm gold and burnt-umber rosettes with black outlines, glossy glaze sheen, raking studio light, soft blur toward the frame edges, ample negative space to the left.

**4. Giraffe** — `hero-giraffe.png`
> Close, textural still life of giraffe-print glaze — warm ochre polygon patches outlined in deep brown on a pale stoneware ground, soft directional light emphasising the raised sculptural relief of the glaze, generous open space above the subject.

**5. Elephant** — `hero-elephant.png`
> Atmospheric material study evoking elephant hide: matte, deeply textured grey-brown stoneware surface with fine tool-carved creases, single warm side light, dust of raw clay visible at the base, wide empty space to the right.

**6. Rhino** — `hero-rhino.png`
> Close-up of thick, weighty grey stoneware glaze with a deliberately rough, armour-like sculpted texture, warm rim light catching the ridges, dark neutral backdrop, generous negative space.

**7. Hippo** — `hero-hippo.png`
> Soft material study of smooth, rounded grey-mauve glazed stoneware with a wet-look sheen, a single water droplet on the glaze surface for texture, muted studio background, wide open space to one side.

**8. Crocodile** — `hero-crocodile.png`
> Macro texture study of hand-sculpted crocodile-scale relief glaze in deep olive and bronze tones, dramatic low side light exaggerating the raised scale pattern, dark backdrop, large empty area for text overlay.

**9. Pangolin** — `hero-pangolin.png`
> Close-up of overlapping sculpted scale-like ceramic relief in warm bronze and sand tones, glossy glaze catching a single soft light source, shallow depth of field, ample negative space above.

**10. Gorilla** — `hero-gorilla.png`
> Moody material study of deep charcoal-black matte stoneware glaze with a subtle hand-tooled ridged texture, single warm rim light, dark studio backdrop, wide empty space to the left.

**11. Guinea Fowl** — `hero-guinea-fowl.png`
> Macro pattern study of small white polka-dot glaze markings scattered over a deep charcoal-grey ceramic ground, soft even studio light, shallow focus, generous negative space to the right.

**12. Flamingo** — `hero-flamingo.png`
> Soft-focus still life of glossy coral-pink glaze pooling and catching the light along a curved stoneware edge, pale warm background, delicate and airy mood, wide empty space above.

**13. Big 5** — `hero-big-5.png`
> Wide editorial still life combining small unglazed clay fragments in muted khaki, warm grey and ochre tones arranged loosely on a linen surface, soft directional studio light, restrained and dignified mood, generous open space to one side.

**14. Leopard Ivy** — `hero-leopard-ivy.png`
> Close still life pairing leopard-rosette glaze texture with trailing hand-painted green ivy leaves along a curved stoneware rim, warm soft light, shallow depth of field, negative space to the left.

### Botanical and colour ranges

**15. Botany** — `hero-botany.png`
> Soft editorial still life of hand-painted botanical leaf motifs in sage green and cream on a pale stoneware surface, natural window light, a few real dried leaves placed alongside for texture, generous empty space above.

**16. Olive** — `hero-olive.png`
> Warm, muted still life of matte olive-green glazed stoneware beside a small dish of real olives and a sprig of olive leaves on raw linen, soft natural light, wide open negative space.

**17. Lemon** — `hero-lemon.png`
> Bright, fresh still life of glossy lemon-yellow glazed stoneware beside a halved lemon and a citrus leaf on a pale linen surface, crisp natural daylight, generous negative space to the right.

**18. Watermelon** — `hero-watermelon.png`
> Playful still life pairing deep pink and green glazed stoneware with a fresh watermelon slice on a warm linen surface, bright natural light, shallow depth of field, open space above.

**19. Arctic White Protea** — `hero-arctic-white-protea.png`
> Elegant still life of a single white protea flower beside pale ivory matte-glazed stoneware, soft diffused light, quiet and minimal composition, large empty space to one side.

**20. Pink Protea** — `hero-pink-protea.png`
> Soft romantic still life of a blush-pink protea flower against a warm blush-glazed ceramic surface, gentle window light, shallow focus, generous negative space above.

**21. Flame Lily** — `hero-flame-lily.png`
> Vivid still life of a single flame lily bloom (Zimbabwe's national flower, red and gold petals) beside warm terracotta glazed stoneware, dramatic warm light, rich saturated colour, open space to the left.

**22. Strelitzia** — `hero-strelitzia.png`
> Bold still life of a single strelitzia (bird-of-paradise) flower in orange and blue against a warm neutral ceramic surface, strong directional light, dramatic shadow, generous negative space.

**23. Butterfly** — `hero-butterfly.png`
> Delicate still life of hand-painted butterfly motifs in soft pastel glaze tones on a pale stoneware surface, airy natural light, a real pressed leaf or petal for texture, wide open space above.

**24. Dragon Fly** — `hero-dragon-fly.png`
> Light, airy still life evoking dragonfly wings — iridescent blue-green glaze catching soft light along a fine ceramic edge, shallow depth of field, pale neutral background, negative space to the right.

**25. Chilli** — `hero-chilli.png`
> Vibrant still life of glossy red glazed stoneware beside fresh red chillies on a warm wooden surface, strong warm directional light, saturated colour, generous open space above.

**26. Blue Feather** — `hero-blue-feather.png`
> Soft still life of a single blue-grey feather resting against pale glazed stoneware, gentle diffused light, muted cool-warm palette, wide negative space to one side.

### Pattern and finish ranges

**27. Polka Dot** — `hero-polka-dot.png`
> Clean macro pattern study of raised white 3D dot relief on a soft ivory glazed stoneware surface, soft even studio light, shallow focus, playful and refined mood, generous negative space.

**28. White Bow** — `hero-white-bow.png`
> Elegant close-up of a sculpted ceramic bow detail in glossy white glaze, soft studio light with gentle shadow, quiet and refined, ample empty space above.

**29. Black Matt** — `hero-black-matt.png`
> Moody, minimal material study of deep matte black stoneware glaze with a single soft rim light tracing its curved edge, dramatic dark background, generous negative space for text.

**30. White and Gold** — `hero-white-and-gold.png`
> Refined still life of glossy white glazed stoneware with a fine hand-painted gold chain-link relief detail catching warm light, soft neutral backdrop, quiet luxury mood, open space to the right.

**31. Bright and Bold** — `hero-bright-and-bold.png`
> Energetic still life combining saturated orange, yellow and leopard-print glazed fragments arranged loosely on a warm surface, strong directional light, vivid colour, generous open space above.

**32. Black and White** — `hero-black-and-white.png`
> Graphic, high-contrast still life of glossy black and white glazed stoneware fragments arranged with a sculpted bow detail, crisp studio light, bold minimal composition, wide negative space.

**33. Fashionista** — `hero-fashionista.png`
> Playful editorial still life of small sculpted ceramic accessory-style objects (a brush holder silhouette, a dish) in a warm animal-print glaze, soft vanity-table lighting, generous negative space to one side.

**34. Gallery Ware** — `hero-gallery-ware.png`
> Refined, gallery-style still life of a single sculpted ceramic form lit dramatically against a dark neutral backdrop, museum-quality lighting, strong shadow, wide empty space for text.

**35. Water Pitcher** — `hero-water-pitcher.png`
> Soft still life of a curved glazed stoneware silhouette catching water-like reflections of light, cool neutral tones, gentle studio light, generous negative space above.

### Seasonal and occasion ranges

**36. Xmas** — `hero-xmas.png`
> Warm festive still life of red-and-white glazed stoneware fragments beside a sprig of real pine and a red ribbon on a dark wooden surface, soft warm candlelight-style lighting, generous negative space above.

**37. Dinner Service** — `hero-dinner-service.png`
> Clean, elegant flat-lay of table linen, a folded napkin and soft natural window light with wide open negative space in the centre, evoking a table setting without showing any specific plate design.

**38. Portrait** — `hero-portrait.png`
> Quiet studio still life of a sculptor's modelling tools (wire loop tools, a wooden rib, a damp cloth) resting beside a small unformed clay bust silhouette with no facial features visible, soft raking light, muted neutral background, generous negative space. (No likeness of any person, real or invented, appears in this image — see the note on portraits at the end of this document.)

---

## B. Product category / range mood images

Broader than a single range — these read as section or "shop by type" atmosphere images spanning several ranges at once, drawn from the real product types named in `RANGE_ITEMS` in `source-data.ts` (vases, platters, cups and teapots, and so on), not from any single collection. Upload via `/admin/media` and use as general Media-library atmosphere assets — for a category landing area, a "shop the range" section, or wherever the site needs type-level imagery rather than a single range's hero. All generic editorial assets.

**39. Vases and tureens** — `range-vases-tureens.png`
> Wide editorial still life of several unglazed clay vase forms of varying heights and silhouettes, arranged loosely on a raw linen surface, soft natural side light, warm neutral palette, shallow depth of field.

**40. Platters and serving ware** — `range-platters.png`
> Overhead flat-lay of stacked matte stoneware discs of varying size (evoking platters without any specific glaze pattern), soft even overhead light, warm neutral tones, generous negative space at one edge.

**41. Cups, mugs and teapots** — `range-cups-teapots.png`
> Soft still life of a simple unglazed teapot silhouette and stacked cups on a wooden tray, gentle steam wisp for atmosphere, warm morning light, shallow focus.

**42. Bowls and cruet sets** — `range-bowls-cruets.png`
> Close still life of small nested stoneware bowl forms and a simple salt-and-pepper pair silhouette, soft directional light, warm neutral linen backdrop, gentle shadow play.

**43. Trinket boxes and candle holders** — `range-trinket-candles.png`
> Warm evening-mood still life of small rounded ceramic lidded box forms and a lit candle in a simple stoneware holder, soft warm glow, shallow depth of field, cosy quiet-luxury feel.

**44. Dinner plates and place settings** — `range-place-settings.png`
> Clean overhead flat-lay of a stack of plain stoneware plate silhouettes with linen napkin and cutlery, soft natural light, generous negative space, minimal and elegant.

---

## C. Studio process and material images

General-purpose content for the About page, product story sections, and anywhere the site wants to show the craft rather than a specific piece. Upload via `/admin/media`; use as general content imagery (not attached to any one product). All generic editorial assets.

**45. Raw clay** — `process-raw-clay.png`
> Close-up of raw grey-brown stoneware clay, freshly wedged, with visible hand-pressed texture and a few water droplets, soft natural window light, shallow depth of field, warm and tactile mood.

**46. Hands shaping clay** — `process-hands-shaping.png`
> Close-up of a potter's hands shaping wet clay on a wheel, motion blur on the spinning form, warm natural studio light, focus on hands and clay, face not shown.

**47. Glaze application** — `process-glaze-application.png`
> Close-up of a paintbrush applying vivid coloured glaze to a bisque-fired ceramic surface, warm directional light catching wet glaze pigment, shallow depth of field, hand and brush only, no face.

**48. Kiln and firing** — `process-kiln-firing.png`
> Wide shot of a loaded brick kiln interior glowing with warm firing light, shelves of unglazed bisque ceramic pieces visible, dramatic warm atmosphere, soft haze, no people.

**49. Brushes and tools** — `process-brushes-tools.png`
> Overhead flat-lay of ceramic sculpting and painting tools — wire loop tools, sponges, fine brushes with dried glaze pigment — arranged on a worn wooden workbench, soft natural light, warm tactile mood.

**50. Workbench** — `process-workbench.png`
> Wide shot of a worn wooden studio workbench scattered with clay dust, a few unglazed ceramic forms drying, natural window light streaming in, warm and lived-in atmosphere, no people.

---

## D. Team and artist portraits — deliberately not provided

The brief asks for prompts here only "if appropriate," and it isn't, for one direct reason: every name on the Nnino team list (`prisma/seed/source-data.ts` → `TEAM`) is a real, named person — Nkosinathi Mabhena, Shelton Sibanda, Pride Madzura, Marion Moyo, Joseph Mpofu, Collin Mpofu, Nephat Muleya, Eugene Nyahodza, Noel Ncube, and Sherry Jena. An image model has no reference photograph of any of them, so any "portrait" it produced would be an invented face presented under a real person's name — a fabricated likeness, not a placeholder. That is true even labelled as temporary, and it doesn't get safer by being temporary: a wrong face attached to a real name is the kind of thing that outlives the "temporary" label once it's live on a public team page.

What to do instead, for the **Team** section (`/admin/team`, Admin Guide §12):

- Leave **Photo** unset on a profile until a real photograph exists. The admin already handles this gracefully — the Team list simply flags who still "needs a photograph," which is an honest, correct state, not an error.
- If a generic, non-representational image is wanted for a team member's card in the meantime, use a **non-figurative** placeholder instead of a face — e.g. a close-up of hands at work (see **#46** above) or a simple silhouette with no facial detail — and mark it clearly in its alt text as a temporary stand-in, e.g. *"Placeholder image — not a photograph of [Name]; hands-at-work stand-in until a real portrait is uploaded."* That keeps the honesty property the rest of the admin already has (§12's blank-biography convention) without ever putting an invented face next to a real name.

---

## Summary table

| # | Range / asset | Filename | Type |
|---|---|---|---|
| 1–14 | Safari & animal collection heroes | `hero-*.png` | Generic editorial |
| 15–26 | Botanical & colour collection heroes | `hero-*.png` | Generic editorial |
| 27–35 | Pattern & finish collection heroes | `hero-*.png` | Generic editorial |
| 36–38 | Seasonal / occasion collection heroes | `hero-*.png` | Generic editorial |
| 39–44 | Category / range mood images | `range-*.png` | Generic editorial |
| 45–50 | Studio process & material images | `process-*.png` | Generic editorial |
| — | Team portraits | *(not provided — see §D)* | — |
