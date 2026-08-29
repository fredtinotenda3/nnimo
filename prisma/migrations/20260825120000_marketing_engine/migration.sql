-- ============================================================================
-- Marketing Engine phase
-- ============================================================================
-- Strictly additive. `Campaign`, `CampaignProduct` and `LandingPage` already
-- existed in the schema from an earlier phase with no admin or public surface
-- built against them yet — this migration only extends them and adds the
-- attribution columns and the one new table (NewsletterSubscriber) this phase
-- needs. No column is dropped, renamed or retyped, no data is deleted, and
-- every new column is nullable or has a default, so this applies cleanly to a
-- populated production database.
--
-- NOTE ON HOW THIS FILE WAS PRODUCED
--
-- `prisma migrate dev` normally generates this by diffing schema.prisma
-- against a live shadow database (see prisma/migrations/README.md). That
-- workflow needs network access to fetch Prisma's schema-engine binary, which
-- this build environment's network allowlist does not include (the same
-- restriction hit `next.config.ts`'s earlier fix in this project's history).
-- This file was therefore hand-written to match schema.prisma exactly, in the
-- same style as this folder's other hand-authored files
-- (prisma/sql/0002_constraints.sql). It has NOT been run against a real
-- database. Before deploying: run `npx prisma migrate dev` against a local
-- Postgres instance to let Prisma confirm this file (or its own regenerated
-- equivalent) actually applies, then `npm run db:deploy` in each environment.
-- See MARKETING-REPORT.md, "Remaining blockers".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Order: two more attribution columns. utmSource / utmMedium / utmCampaign /
-- campaignId / landingPageId already existed from the earlier phase that
-- created the Campaign/LandingPage models; utm_term and utm_content were
-- simply never added alongside them.
-- ----------------------------------------------------------------------------
ALTER TABLE "Order" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "Order" ADD COLUMN "utmContent" TEXT;

-- ----------------------------------------------------------------------------
-- CustomOrderInquiry: the full attribution set, added from scratch — this
-- table had none of it. Same shape as Order, so a campaign's performance can
-- be measured the same way across both order and enquiry traffic.
-- ----------------------------------------------------------------------------
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "CustomOrderInquiry" ADD COLUMN "landingPageId" TEXT;

ALTER TABLE "CustomOrderInquiry"
  ADD CONSTRAINT "CustomOrderInquiry_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomOrderInquiry"
  ADD CONSTRAINT "CustomOrderInquiry_landingPageId_fkey"
  FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Campaign / LandingPage: a button label to go with the existing `cta` link,
-- and two more UTM defaults on LandingPage to match utm_term / utm_content.
-- ----------------------------------------------------------------------------
ALTER TABLE "Campaign" ADD COLUMN "ctaLabel" TEXT;

ALTER TABLE "LandingPage" ADD COLUMN "ctaLabel" TEXT;
ALTER TABLE "LandingPage" ADD COLUMN "defaultUtmTerm" TEXT;
ALTER TABLE "LandingPage" ADD COLUMN "defaultUtmContent" TEXT;

-- ----------------------------------------------------------------------------
-- NewsletterSubscriber: new table.
-- ----------------------------------------------------------------------------
CREATE TABLE "NewsletterSubscriber" (
  "id"             TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "consent"        BOOLEAN NOT NULL DEFAULT true,
  "source"         TEXT,
  "utmSource"      TEXT,
  "utmMedium"      TEXT,
  "utmCampaign"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unsubscribedAt" TIMESTAMP(3),

  CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
CREATE INDEX "NewsletterSubscriber_unsubscribedAt_idx" ON "NewsletterSubscriber"("unsubscribedAt");
