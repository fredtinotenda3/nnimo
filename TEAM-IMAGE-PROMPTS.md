# Team photos — assessment and polish prompts

All 12 supplied photos are real, on-site photographs of the actual team —
nothing here proposes generating or altering anyone's face or identity. The
prompts below are for cropping, lighting/background cleanup, and upscaling
the real photos only.

## Important limitation up front

Every photo in the ZIP is **1000×667 px (or 667×1000 px), around 0.55
megapixels**. That's a normal size for a phone photo shared over WhatsApp,
but it's small for a print-quality or large-format web hero. AI upscalers
(Gemini, Topaz, Magnific, etc.) can convincingly get these to ~2000–2500 px
on the long edge for team cards and mid-size web use. Pushing all the way to
true 4K (3840 px+) from this small a source starts to look synthetic — fine
detail like skin texture and fabric weave gets invented by the upscaler, not
recovered from the original. **If Marion has access to the original camera
files (not the compressed copies that went through WhatsApp/email), ask for
those instead of aggressively upscaling these** — it'll give a materially
better result for the same effort. The prompts below target 2400–3000 px on
the long edge, which is a realistic, honest ceiling for this source
material; treat "4K" as achievable but with real risk of artificial-looking
detail.

---

## Marion Moyo — which photo to use

Three photos exist. Recommendation: **`Marion-Moyo.jpeg`** (the desk
headshot — smiling, looking directly at camera, clear even lighting, plenty
of headroom to crop into a portrait ratio).

| File | 1000×667, landscape | Verdict |
|---|---|---|
| `Marion-Moyo.jpeg` | Seated at desk, smiling at camera | **Recommended.** Clearest face, best expression, good crop candidate. |
| `Marion Moyo - 1.jpeg` | Painting a large vase in the studio | Great action/editorial shot — keep this as a secondary image (e.g. "Marion at work") rather than the primary card photo. Doesn't need much polish. |
| `Marion Moyo - 2.jpeg` | Full-body, arranging pieces in the showroom | Face too small and turned away for a team-card headshot. Good general studio-atmosphere shot only. |

---

## Per-photo assessment

All are JPEG, RGB, no transparency issues.

| Person | File | Resolution | Orientation | Verdict |
|---|---|---|---|---|
| Marion Moyo | `Marion-Moyo.jpeg` | 1000×667 | Landscape | Needs crop + upscale |
| Marion Moyo (alt) | `Marion Moyo - 1.jpeg` | 1000×667 | Landscape | Good as-is (secondary use) |
| Sherry Jena | `Sherry Jena.jpeg` | 667×1000 | **Portrait** | Good as-is, upscale only |
| Nkosinathi Mabhena | `Nkosinathi Mabhena.jpeg` | 667×1000 | **Portrait** | Good as-is, upscale only |
| Pride Madzura | `Pride Madzura.jpeg` | 1000×667 | Landscape | Needs crop + upscale |
| Shelton Sibanda | `Shelton Sibanda.jpeg` | 667×1000 | **Portrait** | Good as-is, upscale only |
| Noel Ncube | `Noel Ncube.jpeg` | 1000×667 | Landscape | **Face not visible — see below** |
| Collin Mpofu | `Collin Mpofu.jpeg` | 667×1000 | **Portrait** | Good as-is, upscale only |
| Joseph Mpofu | `Joseph Mpofu.jpeg` | 1000×667 | Landscape | Needs crop + light fix + upscale |
| Nephat Muleya | `Nephat Muleya.jpeg` | 1000×667 | Landscape | Needs crop + declutter + upscale |
| Eugene Nyawodza | `Eugene Nyawodza.jpeg` | 1000×667 | Landscape | Needs crop + upscale |

The four already-portrait photos (Sherry, Nkosinathi, Shelton, Collin) are
well-composed, well-lit, and just need a resolution boost — no structural
edits needed.

---

## ⚠️ Noel Ncube — cannot be fixed by editing

His only supplied photo shows him wearing a respirator/dust mask while
spray-glazing — **his face is not visible**. No amount of upscaling or
editing can recover a face that isn't in the source image, and I won't
generate or guess one — that would mean using an AI-generated face for a
real, named person, which isn't something I'll do regardless of how it's
requested.

**Recommendation:** ask Marion for a different photo of Noel without the
mask on (even a quick phone photo works — it'll go through the same
upscaling pass as everyone else). Until then, either leave his photo slot
blank in the admin, or use this photo with a caption that reflects the work
he's doing rather than presenting it as a headshot.

---

## Polish prompts

Use these with Gemini, Midjourney, Topaz, or a similar photo-editing/
upscaling tool. Feed the **original photo** as the input image in every case
— these are editing instructions, not generation prompts from scratch.

### Marion Moyo (`Marion-Moyo.jpeg`)
> Using the attached photo of this specific person, do not alter her face,
> skin tone, expression, or identity in any way. Crop to a 4:5 portrait
> aspect ratio, centered on her face and upper body, removing the blinds and
> excess desk clutter on the left and right edges. Gently reduce visual
> noise and sharpen fine detail (hair, cap logo text) without smoothing or
> "beautifying" her skin. Balance the exposure slightly — the right side of
> her face is a touch brighter than the left. Output at approximately
> 2400×3000 px, 4:5 aspect ratio.

### Pride Madzura (`Pride Madzura.jpeg`)
> Using the attached photo of this specific person, do not alter his face or
> identity. Crop to a 3:4 portrait aspect ratio, keeping his face and
> shoulders as the focal point and cropping in from the left to reduce the
> amount of background clutter (shelving, calendar) visible. Increase
> clarity/sharpness slightly, as the original is a little soft. Output at
> approximately 2250×3000 px, 3:4 aspect ratio.

### Joseph Mpofu (`Joseph Mpofu.jpeg`)
> Using the attached photo of this specific person, do not alter his face or
> identity. Crop to a 3:4 portrait aspect ratio centered on his face and
> upper body. The original lighting is harsh and directional (bright hot
> spot on his forehead/cap, shadow under the brim) — gently balance the
> exposure so the harsh highlight and shadow are softened, without
> flattening his features or changing his skin tone. Output at approximately
> 2250×3000 px, 3:4 aspect ratio.

### Nephat Muleya (`Nephat Muleya.jpeg`)
> Using the attached photo of this specific person, do not alter his face or
> identity. Crop to a 3:4 portrait aspect ratio, centering on his face and
> shoulders and cropping out most of the cluttered shelving of paint bottles
> in the background. If possible, apply a mild background blur (shallow
> depth-of-field look) to the remaining background so he stands out more
> clearly, keeping the foreground pottery piece he's holding sharp. Output at
> approximately 2250×3000 px, 3:4 aspect ratio.

### Eugene Nyawodza (`Eugene Nyawodza.jpeg`)
> Using the attached photo of this specific person, do not alter his face or
> identity. Crop to a 3:4 portrait aspect ratio, centered on his face and
> upper body, tightening in from both sides to reduce the amount of
> background workshop visible. Output at approximately 2250×3000 px, 3:4
> aspect ratio.

### Everyone else — Sherry Jena, Nkosinathi Mabhena, Shelton Sibanda, Collin Mpofu
Already good compositions in portrait orientation — only upscaling is
needed:
> Using the attached photo of this specific person, do not alter his face,
> expression, or identity in any way — this is a real person and the result
> must remain instantly recognizable as him. Upscale the image, recovering
> natural fine detail (skin texture, fabric weave, facial hair) without
> introducing plastic/smoothed "AI skin" or altering his features. Keep the
> existing 4:5 crop and composition unchanged. Output at approximately
> 2400×3000 px.

### Marion Moyo — secondary action shot (`Marion Moyo - 1.jpeg`)
Optional, if you want to use this as a second photo on her profile or the
family page:
> Using the attached photo of this specific person, do not alter her face or
> identity. No crop needed — keep the full landscape composition as-is.
> Upscale to approximately 2400×1600 px, recovering natural detail without
> smoothing skin or altering her expression.

---

## After polishing

Save each result using the filenames in `TEAM-UPDATE-GUIDE.md` before
uploading, so they're easy to find and match in the Media Library.
