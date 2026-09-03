# Edit / Enhancement Prompts

None of Mario's six images are broken or unusable, but all of them are on
the low side of resolution for a full-bleed hero or a zoomed lightbox view,
and most show the acrylic/ceramic photography stand under the piece. Below
is a specific prompt for each image that needs work, for an AI image editor
(Gemini "Nano Banana" / Midjourney editor / Topaz Gigapixel / Photoshop
Generative Fill — any of these can follow written instructions like these).

General note: **do not regenerate or reinterpret the ceramic piece itself.**
Every prompt below is scoped to background/stand cleanup, lighting, and
resolution — never to the glaze pattern, shape, or paintwork, which must stay
exactly as photographed. If a tool's output changes the actual design of the
plate, discard it and use the original.

---

### 1. `antipasto-platter-round-zebra-black-white.jpg`
**Exact issue:** Lowest resolution of the six (667×1000); acrylic display
stand and its shadow are visible at the base of the plate; overall image
reads slightly flat/grey.
**Desired result:** A crisp, upscaled product shot with the stand removed
and the plate appearing to float/rest naturally, background kept pure
seamless white.
**Target resolution:** 2000×3000 px minimum (matches the plate's existing 2:3 aspect ratio).
**Aspect ratio / crop:** Keep the existing 2:3 portrait crop; do not crop tighter — this is used at both card and full-bleed sizes.

Prompt:
> Upscale this product photograph of a round ceramic plate to at least 2000×3000px, preserving all existing detail, edges and colours exactly as photographed — do not alter the zebra-stripe pattern or plate shape. Remove the clear acrylic display stand and its shadow from underneath the plate. Keep the background a clean, seamless, evenly lit white/light-grey studio backdrop, matching the existing lighting direction. Do not add any new objects, reflections, or text.

---

### 2. `double-handle-serving-platter-monstera.jpg`
**Exact issue:** Small ceramic stand pegs visible under the platter; resolution good but not retina-sharp above ~1000px display.
**Desired result:** Stand removed, platter appears to rest flat on the surface; light sharpening for retina displays.
**Target resolution:** 1800×2400 px minimum.
**Aspect ratio / crop:** Keep existing crop (roughly 5:6.5) — do not crop into the handles.

Prompt:
> Upscale this ceramic platter product photograph to at least 1800×2400px while preserving the exact hand-painted monstera leaf design, glaze texture and platter shape. Remove the small stand/pegs visible underneath the platter so it appears to sit flat. Keep the white studio background clean and seamless. Apply only mild sharpening — do not smooth or "beautify" the surface texture.

---

### 3. `double-handle-serving-platter-flame-lily.jpg`
**Exact issue:** Same stand-peg issue as #2; slightly warm colour cast.
**Desired result:** Stand removed, neutral white balance corrected so the platter reads true white rather than warm/cream.
**Target resolution:** 1800×2400 px minimum.
**Aspect ratio / crop:** Keep existing crop.

Prompt:
> Upscale this ceramic platter photograph to at least 1800×2400px, preserving the exact flame lily painted design and platter shape. Remove the small stand pegs visible underneath. Correct the white balance so the ceramic body reads neutral white rather than warm/yellow, without shifting the red/orange/yellow tones of the painted flower. Keep the background seamless white.

---

### 4. `double-handle-serving-platter-zebra-fusion.jpg`
**Exact issue:** Softest focus of the platter shots; this is the piece that will replace the current low-quality image on the live product page, so it's the highest-priority image to fix.
**Desired result:** Sharpened, upscaled hero-quality shot suitable for the product gallery's full-bleed and lightbox views.
**Target resolution:** 2000×3000 px minimum.
**Aspect ratio / crop:** Keep existing 2:3 crop.

Prompt:
> Upscale this ceramic platter product photograph to at least 2000×3000px. Preserve the exact zebra-stripe rim pattern, rainbow accent stripe and black center glaze exactly as photographed — do not alter the design. Increase sharpness and micro-contrast so fine brushwork is crisp at full-screen zoom, without introducing haloing or artificial edges. Keep the plain white studio background exactly as-is, seamless and evenly lit.

---

### 5. `zebra-fusion-collection-range-group-shot.jpg`
**Exact issue:** Slight glare/reflection on the glossy square plate in the top-left corner; used as a collection hero, so it will be displayed very wide (21:9-ish crop on desktop).
**Desired result:** Glare reduced, and enough resolution/detail at the edges to support a wide crop without the corners looking soft.
**Target resolution:** 2400×2800 px minimum (crop room needed for the wide hero banner).
**Aspect ratio / crop:** Supply the full frame — the collection hero component crops centrally to roughly 21:9 on desktop and 4:3 on mobile, so keep the whole group visible with a little headroom on all sides.

Prompt:
> Upscale this photograph of a full ceramic tableware collection (plates, teapot, cups, honeypot, napkin rings) to at least 2400×2800px, preserving every piece's design and arrangement exactly as photographed. Reduce the glare/reflection on the glossy square plate in the top-left corner without flattening its glaze shine elsewhere. Keep the white studio background clean and consistent across the frame. Do not crop, rearrange, or remove any pieces.

---

### 6. `zebra-fusion-tea-set.jpg`
**Exact issue:** Flatter, dimmer lighting than the rest of the set — the teapot and cups read slightly grey rather than bright white.
**Desired result:** Brightness/contrast correction to match the lighting of the other five images, plus an upscale.
**Target resolution:** 1800×2700 px minimum.
**Aspect ratio / crop:** Keep existing 2:3 crop.

Prompt:
> Upscale this photograph of a ceramic teapot and tea cup set to at least 1800×2700px, preserving the exact zebra-stripe pattern and rainbow accent colours on each piece. Brighten the overall exposure and increase contrast slightly so the white ceramic base reads clean white rather than grey, matching bright, even studio lighting. Keep the background plain and seamless. Do not alter the shapes, handles, or painted design of any piece.

---

## After editing
Re-run the images back through the same filenames in
`real-photography-ready-to-upload/` (or upload the edited versions directly
in Admin → Media) — no code changes are needed on your end beyond what's
already in this package, since the rendering pipeline fix applies uniformly
to whatever image is attached to a product, collection, or team member.
