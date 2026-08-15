import { describe, expect, it } from "vitest";
import {
  blockingGaps,
  collectionGaps,
  isPublishedButUnsellable,
  isSaleReady,
  productGaps,
  teamGaps,
} from "@/lib/admin/completeness";
import { isValidSlug, slugify, uniqueSlug, uniqueViolationTarget } from "@/lib/admin/slug";
import {
  buildQuery,
  hasActiveFilters,
  pageInfo,
  parseEnum,
  parsePagination,
  parseSearch,
} from "@/lib/admin/query";

const complete = {
  lifecycleStage: "PUBLISHED" as const,
  availability: "MADE_TO_ORDER" as const,
  price: "150.00",
  description: "A hand-thrown piece.",
  collectionId: "col_1",
  imageCount: 2,
  hasPrimaryImage: true,
};

describe("productGaps", () => {
  it("reports nothing for a complete piece", () => {
    expect(productGaps(complete)).toEqual([]);
    expect(isSaleReady(complete)).toBe(true);
  });

  it("treats a missing price as blocking and a missing photograph as advisory", () => {
    const gaps = productGaps({ ...complete, price: null, imageCount: 0, hasPrimaryImage: false });
    const price = gaps.find((gap) => gap.field === "price");
    const images = gaps.find((gap) => gap.field === "images");
    // The distinction is the whole point: an unpriced piece cannot be sold, an
    // unphotographed one renders as a catalogue card and sells fine.
    expect(price?.severity).toBe("blocking");
    expect(images?.severity).toBe("advisory");
  });

  it("only demands an availability once a piece is published", () => {
    expect(
      blockingGaps({ ...complete, lifecycleStage: "CATALOGUE", availability: null }).map(
        (gap) => gap.field,
      ),
    ).not.toContain("availability");

    expect(
      blockingGaps({ ...complete, availability: null }).map((gap) => gap.field),
    ).toContain("availability");
  });

  it("flags a piece that is live but cannot be bought", () => {
    expect(isPublishedButUnsellable({ ...complete, price: null })).toBe(true);
    expect(isPublishedButUnsellable({ ...complete, lifecycleStage: "CATALOGUE", price: null })).toBe(
      false,
    );
    expect(isPublishedButUnsellable(complete)).toBe(false);
  });

  it("notices images that exist but with no primary chosen", () => {
    const gaps = productGaps({ ...complete, hasPrimaryImage: false });
    expect(gaps.map((gap) => gap.label)).toContain("No primary image chosen");
  });

  it("treats a whitespace-only description as missing", () => {
    expect(productGaps({ ...complete, description: "   " }).map((gap) => gap.field)).toContain(
      "description",
    );
  });
});

describe("collectionGaps", () => {
  it("flags a published range with nothing published in it", () => {
    const gaps = collectionGaps({
      description: "A range.",
      hasHeroImage: true,
      publishedProductCount: 0,
      status: "PUBLISHED",
    });
    expect(gaps[0]?.severity).toBe("blocking");
  });

  it("does not flag an empty draft range", () => {
    const gaps = collectionGaps({
      description: "A range.",
      hasHeroImage: true,
      publishedProductCount: 0,
      status: "DRAFT",
    });
    expect(gaps).toEqual([]);
  });
});

describe("teamGaps", () => {
  it("never reports a blocking gap for a person", () => {
    // Ten real people were imported with names and roles only. That is the
    // correct record, not a defect.
    const gaps = teamGaps({ bio: null, hasPhoto: false, sourceNote: null });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((gap) => gap.severity === "advisory")).toBe(true);
  });

  it("surfaces a recorded source conflict", () => {
    const gaps = teamGaps({
      bio: "Written.",
      hasPhoto: true,
      sourceNote: "Catalogue says Artist; business card says Production Manager.",
    });
    expect(gaps.map((gap) => gap.field)).toContain("role");
  });
});

describe("slugify", () => {
  it("produces a URL-safe slug", () => {
    expect(slugify("Giraffe Tureen")).toBe("giraffe-tureen");
    expect(slugify("3D Big Five Master Piece")).toBe("3d-big-five-master-piece");
  });

  it("strips accents rather than dropping the character", () => {
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });

  it("removes apostrophes without leaving a gap", () => {
    expect(slugify("Potter's Wheel")).toBe("potters-wheel");
    expect(slugify("Potter’s Wheel")).toBe("potters-wheel");
  });

  it("collapses runs of punctuation and trims the ends", () => {
    expect(slugify("  --Hello,,, World!!  ")).toBe("hello-world");
  });

  it("returns an empty string for input with nothing usable", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("never ends in a hyphen after truncation", () => {
    const slug = slugify("a".repeat(78) + " word");
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts well-formed slugs", () => {
    for (const slug of ["a", "giraffe-tureen", "3d-vase", "a1-b2-c3"]) {
      expect(isValidSlug(slug), slug).toBe(true);
    }
  });

  it("rejects malformed slugs", () => {
    for (const slug of ["", "-a", "a-", "a--b", "A", "a_b", "a b", "a".repeat(81)]) {
      expect(isValidSlug(slug), slug).toBe(false);
    }
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", async () => {
    expect(await uniqueSlug("Giraffe Tureen", async () => false)).toBe("giraffe-tureen");
  });

  it("appends a counter until one is free", async () => {
    const taken = new Set(["giraffe-tureen", "giraffe-tureen-2"]);
    expect(await uniqueSlug("Giraffe Tureen", async (candidate) => taken.has(candidate))).toBe(
      "giraffe-tureen-3",
    );
  });

  it("falls back to something usable rather than throwing", async () => {
    const slug = await uniqueSlug("Vase", async () => true, 3);
    expect(slug.startsWith("vase-")).toBe(true);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("does not produce an empty slug from unusable input", async () => {
    expect(await uniqueSlug("!!!", async () => false)).toBe("item");
  });
});

describe("uniqueViolationTarget", () => {
  it("identifies the colliding column", () => {
    expect(uniqueViolationTarget({ code: "P2002", meta: { target: ["slug"] } })).toBe("slug");
    expect(uniqueViolationTarget({ code: "P2002", meta: { target: "sku" } })).toBe("sku");
  });

  it("ignores unrelated errors", () => {
    expect(uniqueViolationTarget(new Error("boom"))).toBeNull();
    expect(uniqueViolationTarget({ code: "P2025" })).toBeNull();
    expect(uniqueViolationTarget(null)).toBeNull();
  });
});

describe("list query parsing", () => {
  it("clamps absurd and hostile page numbers instead of trusting them", () => {
    // The URL is user input reaching an OFFSET. Page 0, -3 and 10^9 must all
    // become something the planner can serve.
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-3" }).page).toBe(1);
    expect(parsePagination({ page: "abc" }).page).toBe(1);
    expect(parsePagination({ page: "999999999" }).page).toBe(10_000);
  });

  it("caps the page size", () => {
    expect(parsePagination({}, 5000).pageSize).toBe(100);
    expect(parsePagination({}, 0).pageSize).toBe(1);
  });

  it("computes skip from the page", () => {
    const pagination = parsePagination({ page: "3" }, 25);
    expect(pagination.skip).toBe(50);
    expect(pagination.take).toBe(25);
  });

  it("caps the search term length", () => {
    expect(parseSearch({ q: "x".repeat(500) }).length).toBe(120);
    expect(parseSearch({ q: "  hello  " })).toBe("hello");
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseSearch({ q: ["first", "second"] })).toBe("first");
  });

  it("degrades an unknown enum filter to no filter rather than throwing", () => {
    const allowed = ["DRAFT", "PUBLISHED"] as const;
    expect(parseEnum({ status: "PUBLISHED" }, "status", allowed)).toBe("PUBLISHED");
    expect(parseEnum({ status: "'; DROP TABLE" }, "status", allowed)).toBeNull();
    expect(parseEnum({}, "status", allowed)).toBeNull();
  });

  it("reports page boundaries correctly", () => {
    const info = pageInfo(parsePagination({ page: "2" }, 25), 60);
    expect(info).toMatchObject({
      page: 2,
      totalPages: 3,
      hasPrevious: true,
      hasNext: true,
      from: 26,
      to: 50,
    });
  });

  it("handles an empty result set without dividing by zero", () => {
    const info = pageInfo(parsePagination({}, 25), 0);
    expect(info).toMatchObject({ page: 1, totalPages: 1, from: 0, to: 0, hasNext: false });
  });

  it("pins the page to the last real one when the URL overshoots", () => {
    expect(pageInfo(parsePagination({ page: "99" }, 25), 30).page).toBe(2);
  });

  it("preserves active filters when changing page", () => {
    const query = buildQuery({ q: "vase", stage: "PUBLISHED", page: "1" }, { page: 2 });
    expect(query).toContain("q=vase");
    expect(query).toContain("stage=PUBLISHED");
    expect(query).toContain("page=2");
  });

  it("drops a parameter set to null", () => {
    expect(buildQuery({ q: "vase", page: "3" }, { page: null })).toBe("?q=vase");
  });

  it("detects whether any filter is active", () => {
    expect(hasActiveFilters({ q: "vase" }, ["q", "stage"])).toBe(true);
    expect(hasActiveFilters({ q: "  " }, ["q", "stage"])).toBe(false);
    expect(hasActiveFilters({}, ["q"])).toBe(false);
  });
});
