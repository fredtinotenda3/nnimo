/**
 * ===========================================================================
 * Nnino Ceramics — one-off team profile update
 * ---------------------------------------------------------------------------
 * `prisma/seed.ts` intentionally will NOT overwrite an Artist row that already
 * exists (see `seedTeam()`) — that is what stops a re-seed from clobbering
 * real admin edits. The ten team rows already exist in production from the
 * original seed (names and roles only), so the newly-supplied profiles in
 * prisma/seed/source-data.ts (craft, bio, featured, corrected role/name) never
 * reach the database just by re-running `npm run db:seed`.
 *
 * This script is the one-time bridge: it reads the same TEAM array and pushes
 * role, craft, bio, sortOrder, featured and sourceNote onto the MATCHING
 * existing row, found by name (falling back to `previousName` for the one
 * spelling correction — "Eugene Nyahodza" → "Eugene Nyawodza").
 *
 * Deliberately NOT touched:
 *   - photoId    — photographs are attached by hand in the admin, from a Media
 *                  record uploaded through /admin/media. This script never
 *                  invents or guesses a photo attachment.
 *   - isActive   — visibility is an operator decision, not a data-import one.
 *
 * Idempotent: safe to run more than once. Each run reports created / updated /
 * unmatched so you can see exactly what happened.
 *
 * Run with:  npm run db:update-team
 * (wraps: dotenv -e .env -- tsx scripts/update-team-profiles.ts)
 *
 * Point DATABASE_URL at production first (see TEAM-UPDATE-GUIDE.md) — running
 * this against local/dev only updates your local database.
 * ===========================================================================
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { TEAM } from "../prisma/seed/source-data";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });

async function main() {
  console.log("Updating Nnino team profiles from prisma/seed/source-data.ts…\n");

  let updated = 0;
  let created = 0;

  for (const [index, member] of TEAM.entries()) {
    const candidateNames = [member.name, member.previousName].filter(
      (n): n is string => Boolean(n),
    );

    const existing = await db.artist.findFirst({
      where: { name: { in: candidateNames } },
      select: { id: true, name: true },
    });

    const data = {
      name: member.name,
      role: member.role,
      craft: member.craft ?? null,
      bio: member.bio ?? null,
      featured: member.featured ?? false,
      sourceNote: member.sourceNote ?? null,
      sortOrder: index,
    };

    if (existing) {
      await db.artist.update({ where: { id: existing.id }, data });
      const renamed = existing.name !== member.name;
      console.log(
        `  ✓ updated  ${member.name}${renamed ? `  (was "${existing.name}")` : ""}`,
      );
      updated += 1;
    } else {
      await db.artist.create({ data });
      console.log(`  + created  ${member.name}  (no existing row matched — check this)`);
      created += 1;
    }
  }

  console.log(`\n${updated} updated, ${created} created, ${TEAM.length} total.`);
  console.log("Photos were NOT touched — attach those in /admin/team as described");
  console.log("in TEAM-UPDATE-GUIDE.md.\n");
}

main()
  .catch((error) => {
    console.error("Team profile update failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
