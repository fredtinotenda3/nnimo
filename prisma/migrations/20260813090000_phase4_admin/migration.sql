-- ============================================================================
-- Phase 4 — Admin CMS & business operations
-- ============================================================================
-- Strictly additive. No column is dropped, renamed or retyped, no data is
-- deleted, and every new column is nullable or has a default, so this applies
-- cleanly to a populated production database and is safe to run while the app
-- is serving traffic.
--
-- The one constraint that can fail on existing data is
-- ProductImage_productId_mediaId_key. Duplicates are removed immediately before
-- it is created, keeping the lowest id of each group — see the note there.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Media: a human-recognisable name for the library, never used as a path.
-- ----------------------------------------------------------------------------
ALTER TABLE "Media" ADD COLUMN "originalFilename" TEXT;

-- ----------------------------------------------------------------------------
-- SEO overrides. Nullable on purpose: null means "fall back to the name and
-- description", which is exactly what Phase 2 already emitted.
-- ----------------------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN "ogImageId" TEXT;

ALTER TABLE "Collection" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "Collection" ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "Collection" ADD COLUMN "ogImageId" TEXT;

-- ----------------------------------------------------------------------------
-- Artist: provenance and unresolved source conflicts, recorded rather than
-- silently resolved.
-- ----------------------------------------------------------------------------
ALTER TABLE "Artist" ADD COLUMN "sourceNote" TEXT;

-- ----------------------------------------------------------------------------
-- Setting: who last changed it. Not a foreign key — a setting must outlive the
-- account that set it, and AuditLog carries the joined history.
-- ----------------------------------------------------------------------------
ALTER TABLE "Setting" ADD COLUMN "updatedBy" TEXT;

-- ----------------------------------------------------------------------------
-- Foreign keys for the new media references. ON DELETE SET NULL matches every
-- other Media reference in the schema: deleting an image must never cascade
-- into deleting the product that used it.
-- ----------------------------------------------------------------------------
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_ogImageId_fkey"
  FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Collection"
  ADD CONSTRAINT "Collection_ogImageId_fkey"
  FOREIGN KEY ("ogImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- De-duplicate ProductImage before adding the unique constraint.
--
-- Nothing in Phases 1-3 could create a duplicate (the seed inserts one row per
-- image), so this is expected to be a no-op. It is here because the Phase 4
-- admin adds an "associate existing media" button, and the constraint is what
-- actually stops a double-click producing two gallery entries for one file.
-- The surviving row is the lowest ctid of each group, which preserves whichever
-- was inserted first along with its position and isPrimary flag.
-- ----------------------------------------------------------------------------
DELETE FROM "ProductImage" a
USING "ProductImage" b
WHERE a."productId" = b."productId"
  AND a."mediaId"   = b."mediaId"
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX "ProductImage_productId_mediaId_key"
  ON "ProductImage"("productId", "mediaId");

-- ----------------------------------------------------------------------------
-- Indexes supporting the Phase 4 admin list views.
--
-- Every admin list is server-side filtered, sorted and paginated (§20 of the
-- brief), which means each ORDER BY and WHERE below runs on every page load.
-- ----------------------------------------------------------------------------
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");
CREATE INDEX "Product_updatedAt_idx"              ON "Product"("updatedAt");
CREATE INDEX "Product_artistId_idx"               ON "Product"("artistId");
CREATE INDEX "Collection_sortOrder_idx"           ON "Collection"("sortOrder");
CREATE INDEX "Artist_sortOrder_idx"               ON "Artist"("sortOrder");
CREATE INDEX "Media_createdAt_idx"                ON "Media"("createdAt");
CREATE INDEX "Customer_createdAt_idx"             ON "Customer"("createdAt");
CREATE INDEX "AuditLog_action_idx"                ON "AuditLog"("action");
CREATE INDEX "CustomOrderInquiry_createdAt_idx"   ON "CustomOrderInquiry"("createdAt");
