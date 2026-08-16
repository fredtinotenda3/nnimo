# Media storage

## Drivers

One interface (`MediaDriver`), two implementations. Everything referencing an
image goes through the `Media` table, so switching driver is a config change plus
a one-off copy of the objects — no schema change.

`Media.url` is only a cache. URLs are resolved from `provider` + `storageKey` at
render time (`resolveMediaUrl`), so moving from disk to a bucket makes existing
rows resolve to CDN URLs without rewriting them.

### `local` — development only

Writes into `public/media`, which Next serves statically.

**Not for production.** The filesystem is ephemeral on Vercel: uploads disappear
on the next deploy and are invisible to other instances in the meantime.

### `s3` — production

Any S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2, MinIO.

Implemented in Phase 5. Requests are signed with AWS Signature Version 4 using
`node:crypto` and `fetch` (`lib/media/sigv4.ts`) rather than `@aws-sdk/client-s3`
— two operations do not justify ~2 MB of dependency and a cold-start cost on a
function that mostly serves pages. The signer is unit tested against AWS's own
published signing-key vector, so it is verified rather than assumed.

Not implemented, because nothing needs it: STS session tokens, multipart upload,
presigned URLs, the instance-metadata credential chain.

## Bucket setup

1. Create a **private** bucket. Do not enable public read.
2. Create an IAM user / API token with **only** `PutObject` and `DeleteObject`
   on `arn:aws:s3:::<bucket>/*`. Least privilege: the application never lists
   the bucket, never reads objects back, and never touches bucket configuration.
3. Put a CDN in front of it — CloudFront with Origin Access Control, or an R2
   custom domain. Serve reads from there.
4. Set `MEDIA_S3_PUBLIC_URL` to the CDN base URL.

Why private plus CDN rather than a public bucket: a publicly listable bucket lets
anyone enumerate every image ever uploaded, including ones detached from the site
but not yet deleted. Enumerating a private studio's asset library is a real
disclosure even though each individual object is "just a photo".

`MEDIA_S3_PUBLIC_URL` is load-bearing in three places — the CDN host is added to
`images.remotePatterns` and to the CSP `img-src`, as well as being the URL base.
Changing it requires a redeploy.

## Upload validation

In order, all server-side:

1. Size checked against the 12 MB cap before the file is read into memory.
2. Declared MIME type checked against the whitelist — a cheap early rejection,
   then **ignored**.
3. Bytes read and the true type derived from magic bytes
   (`lib/media/inspect.ts`). JPEG, PNG, WebP and AVIF only. SVG, GIF, PDF, HTML
   and a renamed executable all return null and are refused.
4. Pixel dimensions read from the header where the format allows.
5. Storage key derived as `uploads/YYYY/MM/<uuid>.<ext>`, extension from the
   **validated** type. The client filename never touches a path.
6. `Content-Type` set from the sniffed type, so a stored file cannot be served
   back as `text/html`.

The original filename is kept as a display string only, stripped of path
separators and control characters.

## Ordering, and why it differs between upload and delete

**Upload:** validate → write object → write row. If the row write fails, the
object is deleted. A row pointing at a missing object renders as a broken image;
an orphaned object is invisible and costs a few kilobytes.

**Delete:** delete row → delete object. If the object delete fails it is logged,
not surfaced — the row is gone and nothing references the file. Keeping the row
to stay in sync would mean a "delete" that visibly did not delete.

Deleting media that is still referenced is refused, with a message naming where
it is used.

## Migrating from local to S3

1. Provision the bucket and CDN.
2. Copy `public/media/**` into the bucket, preserving the key structure exactly
   (`uploads/YYYY/MM/<uuid>.<ext>`).
3. Set `MEDIA_DRIVER=s3` and the `MEDIA_S3_*` variables.
4. Update existing rows:
   ```sql
   UPDATE "Media" SET "provider" = 'S3' WHERE "provider" = 'LOCAL';
   ```
   `storageKey` does not change — that is the point of deriving URLs rather than
   storing them.
5. Redeploy, then spot-check images on the storefront and in the admin.

⚠️ Do this **before** taking real orders. After launch it needs a maintenance
window, because uploads landing between the copy and the switch would be lost.
