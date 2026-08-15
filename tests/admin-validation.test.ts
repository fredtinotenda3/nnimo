import { describe, expect, it } from "vitest";
import {
  collectionSchema,
  customerSchema,
  inquiryUpdateSchema,
  productSchema,
  teamSchema,
} from "@/lib/admin/schemas";

/**
 * Validation rules.
 *
 * The theme running through all of these is that blank must stay blank. Nnino's
 * whole data model rests on the difference between "the studio has not decided
 * yet" and "the studio decided zero" — an empty price is not free, an empty
 * biography is not an empty biography, it is an unwritten one. A coercion that
 * turns "" into 0 or "" would quietly destroy that distinction across the
 * entire catalogue, so it is tested field by field.
 */

const productBase = {
  name: "Giraffe Tureen",
  slug: "",
  sku: "",
  collectionId: "",
  categoryId: "",
  artistId: "",
  description: "",
  story: "",
  material: "",
  careInstructions: "",
  heightCm: "",
  widthCm: "",
  weightKg: "",
  price: "",
  currency: "USD",
  availability: "",
  productionLeadTimeDays: "",
  featured: undefined,
  sourceNote: "",
};

describe("productSchema", () => {
  it("accepts a piece with nothing but a name", () => {
    const result = productSchema.safeParse(productBase);
    expect(result.success).toBe(true);
  });

  it("keeps a blank price as null, never zero", () => {
    const result = productSchema.parse(productBase);
    expect(result.price).toBeNull();
    // The distinction the whole purchasability rule depends on.
    expect(result.price).not.toBe(0);
    expect(result.price).not.toBe("0");
  });

  it("keeps every blank optional field as null rather than an empty string", () => {
    const result = productSchema.parse(productBase);
    for (const key of [
      "sku",
      "description",
      "story",
      "material",
      "careInstructions",
      "collectionId",
      "artistId",
      "heightCm",
      "widthCm",
      "weightKg",
      "productionLeadTimeDays",
      "availability",
      "sourceNote",
    ] as const) {
      expect(result[key], `${key} should be null when blank`).toBeNull();
    }
  });

  it("accepts a price as a string and does not convert it to a number", () => {
    const result = productSchema.parse({ ...productBase, price: "149.99" });
    // Passing through a JS float is how 149.99 becomes 149.98999999999998 in a
    // NUMERIC(10,2) column.
    expect(result.price).toBe("149.99");
    expect(typeof result.price).toBe("string");
  });

  it("rejects a price with more than two decimal places rather than rounding it", () => {
    const result = productSchema.safeParse({ ...productBase, price: "10.005" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    for (const price of ["free", "$40", "40,00", "-5"]) {
      expect(productSchema.safeParse({ ...productBase, price }).success, price).toBe(false);
    }
  });

  it("requires a name", () => {
    expect(productSchema.safeParse({ ...productBase, name: "" }).success).toBe(false);
    expect(productSchema.safeParse({ ...productBase, name: "A" }).success).toBe(false);
  });

  it("accepts a valid slug and rejects a malformed one", () => {
    expect(productSchema.parse({ ...productBase, slug: "giraffe-tureen" }).slug).toBe(
      "giraffe-tureen",
    );
    for (const slug of ["Giraffe Tureen", "giraffe_tureen", "-leading", "trailing-", "a--b"]) {
      expect(productSchema.safeParse({ ...productBase, slug }).success, slug).toBe(false);
    }
  });

  it("upper-cases the currency and rejects anything that is not three letters", () => {
    expect(productSchema.parse({ ...productBase, currency: "usd" }).currency).toBe("USD");
    expect(productSchema.safeParse({ ...productBase, currency: "US" }).success).toBe(false);
    expect(productSchema.safeParse({ ...productBase, currency: "DOLLARS" }).success).toBe(false);
  });

  it("treats an absent checkbox as false and a present one as true", () => {
    expect(productSchema.parse(productBase).featured).toBe(false);
    expect(productSchema.parse({ ...productBase, featured: "on" }).featured).toBe(true);
  });

  it("accepts every real availability value and rejects invented ones", () => {
    for (const availability of ["IN_STOCK", "MADE_TO_ORDER", "CUSTOM_ONLY", "COMING_SOON"]) {
      expect(productSchema.safeParse({ ...productBase, availability }).success, availability).toBe(
        true,
      );
    }
    expect(productSchema.safeParse({ ...productBase, availability: "PROBABLY" }).success).toBe(
      false,
    );
  });

  it("bounds the lead time", () => {
    expect(productSchema.parse({ ...productBase, productionLeadTimeDays: "42" })
      .productionLeadTimeDays).toBe(42);
    expect(
      productSchema.safeParse({ ...productBase, productionLeadTimeDays: "9999" }).success,
    ).toBe(false);
  });
});

const collectionBase = {
  name: "Zebra Range",
  slug: "",
  description: "",
  story: "",
  heroImageId: "",
  status: "DRAFT",
  featured: undefined,
  sortOrder: "",
  seoTitle: "",
  seoDescription: "",
  ogImageId: "",
};

describe("collectionSchema", () => {
  it("defaults a blank sort order to zero", () => {
    expect(collectionSchema.parse(collectionBase).sortOrder).toBe(0);
  });

  it("accepts a negative sort order so a range can be pinned first", () => {
    expect(collectionSchema.parse({ ...collectionBase, sortOrder: "-10" }).sortOrder).toBe(-10);
  });

  it("rejects a non-numeric sort order", () => {
    expect(collectionSchema.safeParse({ ...collectionBase, sortOrder: "first" }).success).toBe(
      false,
    );
  });

  it("only accepts real statuses", () => {
    for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
      expect(collectionSchema.safeParse({ ...collectionBase, status }).success, status).toBe(true);
    }
    expect(collectionSchema.safeParse({ ...collectionBase, status: "LIVE" }).success).toBe(false);
  });
});

describe("teamSchema", () => {
  const base = {
    name: "Marion Moyo",
    role: "Artist",
    craft: "",
    bio: "",
    photoId: "",
    featured: undefined,
    isActive: undefined,
    sortOrder: "",
    sourceNote: "",
  };

  it("accepts a person with only a name and a role", () => {
    expect(teamSchema.safeParse(base).success).toBe(true);
  });

  it("leaves an unwritten biography null rather than empty", () => {
    // Ten real people were imported with no biography. Null is the honest
    // record; "" would look written and read blank.
    expect(teamSchema.parse(base).bio).toBeNull();
  });

  it("accepts any role wording the studio uses", () => {
    for (const role of ["Potter", "Production Manager", "Kiln, glazing and packing", "Moulder"]) {
      expect(teamSchema.safeParse({ ...base, role }).success, role).toBe(true);
    }
  });

  it("requires both a name and a role", () => {
    expect(teamSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(teamSchema.safeParse({ ...base, role: "" }).success).toBe(false);
  });

  it("records a source conflict without resolving it", () => {
    const note = "Listed as Artist in the catalogue; business card states Production Manager.";
    const result = teamSchema.parse({ ...base, sourceNote: note });
    expect(result.sourceNote).toBe(note);
    expect(result.role).toBe("Artist");
  });
});

describe("customerSchema", () => {
  it("has no email field, so a crafted POST cannot change one", () => {
    const parsed = customerSchema.parse({
      name: "A Customer",
      phone: "",
      marketingConsent: undefined,
      notes: "",
      email: "attacker@example.invalid",
    } as Record<string, unknown>);
    expect("email" in parsed).toBe(false);
  });

  it("defaults marketing consent to false when the box is not ticked", () => {
    const parsed = customerSchema.parse({
      name: "A Customer",
      phone: "",
      marketingConsent: undefined,
      notes: "",
    });
    expect(parsed.marketingConsent).toBe(false);
  });
});

describe("inquiryUpdateSchema", () => {
  it("accepts the existing Phase 1 lifecycle values", () => {
    for (const status of ["NEW", "REVIEWING", "QUOTED", "APPROVED", "PAYMENT", "IN_PRODUCTION", "COMPLETED", "DELIVERED", "CLOSED"]) {
      const result = inquiryUpdateSchema.safeParse({
        id: "abc123",
        status,
        quote: "",
        internalNotes: "",
      });
      expect(result.success, status).toBe(true);
    }
  });

  it("rejects a status invented by the brief but absent from the schema", () => {
    // The brief suggested ACCEPTED and DECLINED; the schema models the same
    // journey with APPROVED / CLOSED plus states the suggestion lacked.
    for (const status of ["ACCEPTED", "DECLINED"]) {
      expect(
        inquiryUpdateSchema.safeParse({ id: "abc", status, quote: "", internalNotes: "" }).success,
        status,
      ).toBe(false);
    }
  });

  it("keeps an unquoted enquiry null", () => {
    const parsed = inquiryUpdateSchema.parse({
      id: "abc",
      status: "NEW",
      quote: "",
      internalNotes: "",
    });
    expect(parsed.quote).toBeNull();
  });
});
