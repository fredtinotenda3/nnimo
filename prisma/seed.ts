/**
 * ===========================================================================
 * Nnino Ceramics — database seed
 * ---------------------------------------------------------------------------
 * Imports only what the supplied documents establish. See
 * prisma/seed/source-data.ts for the transcription and its provenance.
 *
 * Idempotent: every write is an upsert keyed on a natural unique column, so
 * running it twice changes nothing. Safe to run against a database that already
 * has real business edits — it will not overwrite a published product's stage or
 * a price the team has since set, because those fields are only written on
 * create (see `create` vs `update` in each upsert).
 *
 * Run with:  npm run db:seed
 * ===========================================================================
 */

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  COLLECTIONS,
  CONTENT_BLOCKS,
  MEASURED_PIECES,
  PRICED_PIECES,
  RANGE_ITEMS,
  SETTINGS,
  SOURCES,
  TEAM,
} from "./seed/source-data";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });

/** Slug from a display name: lowercase, alphanumerics and hyphens only. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Product slugs are globally unique in the schema, but item names repeat across
 * ranges — "Standard Spoon Rest" appears in three. Prefixing with the range slug
 * keeps them unique and gives readable URLs (/shop/hippo-standard-spoon-rest).
 */
function buildProductSlug(collectionSlug: string | null, name: string): string {
  const base = slugify(name);
  return collectionSlug ? `${collectionSlug}-${base}` : base;
}

async function seedOwner(): Promise<string | null> {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.SEED_OWNER_NAME?.trim();
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!email || !name || !password) {
    console.warn(
      "  ! Skipping owner account: set SEED_OWNER_EMAIL, SEED_OWNER_NAME and SEED_OWNER_PASSWORD to create it.",
    );
    return null;
  }
  if (password.length < 12) {
    throw new Error("SEED_OWNER_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // The password is only set on create. Re-running the seed must never silently
  // reset a password the owner has since changed.
  const user = await db.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "OWNER" },
    update: { name },
    select: { id: true },
  });

  console.log(`  ✓ Owner account: ${email}`);
  return user.id;
}

async function seedCollections(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const [index, collection] of COLLECTIONS.entries()) {
    const sourceNote = collection.sourceName
      ? `${SOURCES.BROCHURE} — printed as "${collection.sourceName}"`
      : `${SOURCES.BROCHURE} — range page`;

    const record = await db.collection.upsert({
      where: { slug: collection.slug },
      create: {
        slug: collection.slug,
        name: collection.name,
        // DRAFT, not PUBLISHED: the brochure proves the range existed in 2022,
        // not that it is in production now. Publishing is the team's decision.
        status: "DRAFT",
        sortOrder: index,
        story: sourceNote,
      },
      // Only ordering is refreshed. Name, status and story may have been edited
      // by the team and must survive a re-seed.
      update: { sortOrder: index },
      select: { id: true },
    });

    ids.set(collection.slug, record.id);
  }

  console.log(`  ✓ ${COLLECTIONS.length} collections (all DRAFT)`);
  return ids;
}

async function seedTeam(): Promise<void> {
  for (const [index, member] of TEAM.entries()) {
    const slug = slugify(member.name);
    const existing = await db.artist.findFirst({
      where: { name: member.name },
      select: { id: true },
    });

    if (existing) {
      await db.artist.update({
        where: { id: existing.id },
        data: { sortOrder: index },
      });
      continue;
    }

    await db.artist.create({
      data: {
        name: member.name,
        role: member.role,
        sortOrder: index,
        // craft, bio, story and photo stay null on purpose. The source gives a
        // name and a role; inventing a biography for a real person is not on.
      },
    });
    void slug;
  }

  console.log(`  ✓ ${TEAM.length} team members (names and roles only, no biographies)`);
}

type ProductSeed = {
  slug: string;
  name: string;
  collectionId: string | null;
  heightCm?: number;
  widthCm?: number;
  weightKg?: number;
  priceUsd?: number;
  sourceNote: string;
};

async function seedProducts(collectionIds: Map<string, string>): Promise<number> {
  const seeds: ProductSeed[] = [];
  const seen = new Set<string>();

  const push = (seed: ProductSeed) => {
    if (seen.has(seed.slug)) return; // a name repeated within one range
    seen.add(seed.slug);
    seeds.push(seed);
  };

  // 1. Range items from the brochure.
  for (const [collectionSlug, items] of Object.entries(RANGE_ITEMS)) {
    const collectionId = collectionIds.get(collectionSlug) ?? null;
    for (const name of items) {
      push({
        slug: buildProductSlug(collectionSlug, name),
        name,
        collectionId,
        sourceNote: `${SOURCES.BROCHURE} — ${collectionSlug} range page`,
      });
    }
  }

  // 2. Signature pieces with measured dimensions. Range is not stated in the
  //    catalogue, so collection is left unset rather than guessed.
  for (const piece of MEASURED_PIECES) {
    push({
      slug: buildProductSlug(null, piece.name),
      name: piece.name,
      collectionId: null,
      heightCm: piece.heightCm,
      widthCm: piece.widthCm,
      weightKg: piece.weightKg,
      sourceNote: `${SOURCES.CATALOGUE} — measured piece`,
    });
  }

  // 3. Priced pieces from the price list.
  for (const piece of PRICED_PIECES) {
    const collectionId = piece.collectionSlug
      ? collectionIds.get(piece.collectionSlug) ?? null
      : null;
    push({
      slug: buildProductSlug(piece.collectionSlug ?? null, piece.name),
      name: piece.name,
      collectionId,
      priceUsd: piece.priceUsd,
      sourceNote: `${SOURCES.PRICELIST}${piece.priceUsd ? " — price listed" : " — no price printed"}`,
    });
  }

  for (const seed of seeds) {
    await db.product.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug,
        name: seed.name,
        collectionId: seed.collectionId,
        heightCm: seed.heightCm ?? null,
        widthCm: seed.widthCm ?? null,
        weightKg: seed.weightKg ?? null,
        price: seed.priceUsd ?? null,
        currency: "USD",
        // CATALOGUE, and availability null. The piece is known to exist; whether
        // it can be bought is a separate decision nobody has made yet.
        lifecycleStage: "CATALOGUE",
        availability: null,
        sourceNote: seed.sourceNote,
        // sku, description, story, material, careInstructions and artistId are
        // all null: the documents do not supply them.
      },
      // Measurements and provenance are refreshed from source; price, stage,
      // availability and any copy the team has written are left alone.
      update: {
        heightCm: seed.heightCm ?? null,
        widthCm: seed.widthCm ?? null,
        weightKg: seed.weightKg ?? null,
        sourceNote: seed.sourceNote,
      },
    });
  }

  const withPrice = seeds.filter((s) => s.priceUsd !== undefined).length;
  const withDimensions = seeds.filter((s) => s.heightCm !== undefined).length;
  console.log(
    `  ✓ ${seeds.length} products (all CATALOGUE) — ${withPrice} with a real price, ${withDimensions} with measurements`,
  );
  return seeds.length;
}

async function seedContent(): Promise<void> {
  for (const block of CONTENT_BLOCKS) {
    await db.contentBlock.upsert({
      where: { key: block.key },
      create: { key: block.key, type: block.type, value: block.value },
      // Never overwrite copy the team has written.
      update: {},
    });
  }

  const withCopy = CONTENT_BLOCKS.filter((b) => b.value).length;
  console.log(
    `  ✓ ${CONTENT_BLOCKS.length} content blocks — ${withCopy} with source-backed copy, ${CONTENT_BLOCKS.length - withCopy} empty for the team`,
  );
}

async function seedSettings(): Promise<void> {
  for (const setting of SETTINGS) {
    await db.setting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, value: setting.value },
      update: {},
    });
  }
  console.log(`  ✓ ${SETTINGS.length} settings`);
}

async function main() {
  console.log("Seeding Nnino Ceramics from the supplied source documents…\n");

  await seedOwner();
  const collectionIds = await seedCollections();
  await seedTeam();
  await seedProducts(collectionIds);
  await seedContent();
  await seedSettings();

  console.log("\nNot seeded, deliberately: stock levels, orders, customers,");
  console.log("reviews, testimonials, sales figures and artist biographies.");
  console.log("None of these are established by the source material.\n");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });