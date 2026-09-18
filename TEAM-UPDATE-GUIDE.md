# Team update guide

This covers three things: pushing the new bios into the database, uploading
the polished photos, and attaching each photo to the right person.

## 1. Push the new team profiles into the database (one-time)

The bios, crafts, roles and display order for all 10 team members have been
added to `prisma/seed/source-data.ts`. But your production database already
has these 10 people in it from the very first seed run (names and roles
only) — and `prisma/seed.ts` is deliberately written so re-running it will
**not** overwrite an existing row (that's what protects any edits your team
has already made in the admin). So just redeploying this code won't, by
itself, update the live bios.

A small one-off script does that instead: `scripts/update-team-profiles.ts`.
It finds each person by name (matching the corrected "Eugene Nyawodza"
spelling to the existing "Eugene Nyahodza" row automatically) and updates
their role, craft, bio, display order and featured flag. **It does not touch
photos or the "show on public site" setting** — those stay exactly as they
are.

**To run it against production:**

1. Pull your production database URL — either from Vercel
   (`vercel env pull .env.production.local`) or from your Postgres
   provider's dashboard.
2. From the project root, with that URL available as `DATABASE_URL`:
   ```
   DATABASE_URL="<your production connection string>" npx tsx scripts/update-team-profiles.ts
   ```
   Or, if you've put the production URL in `.env` temporarily:
   ```
   npm run db:update-team
   ```
3. You'll see one line per person — `✓ updated Marion Moyo`, etc. — and a
   summary count at the end. It's safe to run more than once.
4. **Double-check you're pointed at production, not local**, before running
   this — it's easy to accidentally run it against your local dev database
   by mistake if `.env` still has the local connection string in it.

After this runs, visit `/admin/team` and you should see every bio, craft and
role filled in as described below.

## 2. What changed for each person

| # | Name | Role | Craft | Featured |
|---|---|---|---|---|
| 1 | Marion Moyo | Team Leader, Production Manager and Artist | Potter | ✅ Yes (recommended — team leader) |
| 2 | Sherry Jena | Master, Moulding Section | Moulding | No |
| 3 | Nkosinathi Mabhena | Potter | — | No |
| 4 | Pride Madzura | Sculptor | — | No |
| 5 | Shelton Sibanda | Sculptor | — | No |
| 6 | Noel Ncube | Glazer, Packing and Kiln Operator | — | No |
| 7 | Collin Mpofu | Master Artist | — | No |
| 8 | Joseph Mpofu | Master Artist | — | No |
| 9 | Nephat Muleya | Artist | — | No |
| 10 | Eugene Nyawodza *(was "Eugene Nyahodza")* | Artist | — | No |

Bios were written using only what you and Marion supplied (age, family,
tenure, ceramics history) — nothing was invented. You can read or edit the
exact wording for anyone at `/admin/team/[their name]` at any time; nothing
here is locked.

**Marion's role/bio note:** the database already had a `sourceNote`
recording a conflict — the old catalogue called her "Artist," her business
card said "Production Manager." Marion's own supplied text says both are
true ("Production Manager and Artist... Artist and a Potter"), so the role
field now reflects that directly and the source note has been updated to
record that this resolves the earlier conflict — nothing was deleted, just
updated.

**Featured flag:** I set Marion to "Featured" as the team leader — that's a
recommendation, not something locked in. Toggle it for anyone at
`/admin/team/[id]` under "Visibility" → "Feature this person."

## 3. Save the polished photos with these filenames

Once you've run each photo through the prompts in
`TEAM-IMAGE-PROMPTS.md`, save the results as:

| Person | Save as |
|---|---|
| Marion Moyo | `marion-moyo.jpg` |
| Sherry Jena | `sherry-jena.jpg` |
| Nkosinathi Mabhena | `nkosinathi-mabhena.jpg` |
| Pride Madzura | `pride-madzura.jpg` |
| Shelton Sibanda | `shelton-sibanda.jpg` |
| Noel Ncube | *(hold off — see the note in TEAM-IMAGE-PROMPTS.md; his face isn't visible in the supplied photo)* |
| Collin Mpofu | `collin-mpofu.jpg` |
| Joseph Mpofu | `joseph-mpofu.jpg` |
| Nephat Muleya | `nephat-muleya.jpg` |
| Eugene Nyawodza | `eugene-nyawodza.jpg` |

These filenames aren't a technical requirement — the system stores every
upload under a random generated name internally — but using them makes the
Media Library's file list recognizable when you're attaching photos below.

## 4. Upload and attach each photo (manual, in the Admin)

This has to be done by hand in the browser — actually uploading a file isn't
something that can be scripted from here. For each person:

1. Go to **Admin → Media**.
2. Click **Upload**, choose the polished photo (e.g. `marion-moyo.jpg`).
3. In the **Alt text** field, enter something descriptive, e.g.
   `"Marion Moyo, Team Leader and Production Manager at Nnino Ceramics"`.
   This is what shows up for accessibility and in search.
4. Click **Save/Upload** and confirm it appears in the Media Library.
5. Go to **Admin → Team**, click into that person's profile
   (`/admin/team/[id]`).
6. Find the **Photo** field and use the media picker to select the file you
   just uploaded (it'll be at the top of the list, sorted newest first).
7. Click **Save changes**.
8. Repeat for each person.

**Do this only after the SSL/media fix in `VERCEL-SSL-FIX.md` is applied** —
if `MEDIA_DRIVER` is still misconfigured on Vercel, step 2 (upload) will
fail with an error, and nothing will appear in the Media Library to attach
in step 6.

## 5. Manual steps checklist

- [ ] Apply the Vercel environment variable changes in `VERCEL-SSL-FIX.md`
      (both the `MEDIA_DRIVER`/S3 fix and, optionally, the `sslmode` change)
      and redeploy.
- [ ] Run `scripts/update-team-profiles.ts` against the **production**
      database (see §1).
- [ ] Run each photo that needs it through the prompts in
      `TEAM-IMAGE-PROMPTS.md`.
- [ ] Get a replacement photo of Noel Ncube without a mask — his current
      photo can't be used as a headshot.
- [ ] Upload and attach each photo via Admin → Media → Admin → Team
      (§4 above).
- [ ] Spot-check `/family` (the public team page) once photos are attached.
- [ ] Confirm the display order and "Featured" flags read the way you want
      on `/admin/team` — Marion is currently the only one flagged as
      Featured.
