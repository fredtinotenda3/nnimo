/**
 * ===========================================================================
 * VERIFIED SOURCE DATA
 * ---------------------------------------------------------------------------
 * Every value in this file is transcribed from one of three supplied documents:
 *
 *   [BROCHURE] "Nnino Ceramics Brochure-1.pdf"  (88pp, June 2022)
 *   [CATALOGUE] "Nnimo.pdf"                     (39pp, April 2026)
 *   [PRICELIST] "Scan 15 Aug 24 17.40.50.pdf"   (11pp, Microsoft Lens scan)
 *
 * Rules this file obeys, from the project brief:
 *   - Source spelling is preserved, including where it is inconsistent
 *     ("Leapard Ivy", "Safari Extravanganza"). A cleaned-up display name is
 *     given separately where the source spelling is clearly a typo.
 *   - Nothing is invented. No prices, stock levels, biographies, dimensions or
 *     availability beyond what a document states.
 *   - A range appearing in the brochure proves it existed, not that it is in
 *     production today. Everything imports as DRAFT / CATALOGUE.
 * ===========================================================================
 */

export const SOURCES = {
  BROCHURE: "Nnino Ceramics Brochure-1.pdf",
  CATALOGUE: "Nnimo.pdf",
  PRICELIST: "Scan 15 Aug 24 17.40.50.pdf",
} as const;

// ---------------------------------------------------------------------------
// COLLECTIONS — every range named in [BROCHURE], in document order.
// ---------------------------------------------------------------------------

export type SeedCollection = {
  slug: string;
  /** Display name. */
  name: string;
  /** Source spelling, when it differs from `name`. */
  sourceName?: string;
};

export const COLLECTIONS: SeedCollection[] = [
  { slug: "zebra-fusion", name: "Zebra Fusion" },
  { slug: "zebra", name: "Zebra" },
  { slug: "leopard", name: "Leopard" },
  { slug: "giraffe", name: "Giraffe" },
  { slug: "elephant", name: "Elephant" },
  { slug: "rhino", name: "Rhino" },
  { slug: "hippo", name: "Hippo" },
  { slug: "crocodile", name: "Crocodile" },
  { slug: "pangolin", name: "Pangolin" },
  { slug: "gorilla", name: "Gorilla" },
  { slug: "guinea-fowl", name: "Guinea Fowl" },
  { slug: "flamingo", name: "Flamingo" },
  { slug: "big-5", name: "Big 5", sourceName: "BIG 5 Range" },
  { slug: "leopard-ivy", name: "Leopard Ivy", sourceName: "Leapard Ivy Range" },
  { slug: "botany", name: "Botany" },
  { slug: "olive", name: "Olive" },
  { slug: "lemon", name: "Lemon" },
  { slug: "watermelon", name: "Watermelon" },
  { slug: "arctic-white-protea", name: "Arctic White Protea" },
  { slug: "pink-protea", name: "Pink Protea" },
  { slug: "flame-lily", name: "Flame Lily" },
  { slug: "strelitzia", name: "Strelitzia" },
  { slug: "butterfly", name: "Butterfly" },
  { slug: "dragon-fly", name: "Dragon Fly" },
  { slug: "chilli", name: "Chilli" },
  { slug: "blue-feather", name: "Blue Feather" },
  { slug: "polka-dot", name: "Polka Dot" },
  { slug: "white-bow", name: "White Bow" },
  { slug: "black-matt", name: "Black Matt" },
  { slug: "white-and-gold", name: "White and Gold", sourceName: "White And Gold Range" },
  { slug: "bright-and-bold", name: "Bright and Bold" },
  { slug: "black-and-white", name: "Black and White" },
  { slug: "fashionista", name: "Fashionista" },
  { slug: "gallery-ware", name: "Gallery Ware" },
  { slug: "water-pitcher", name: "Water Pitcher" },
  { slug: "xmas", name: "Xmas" },
  { slug: "dinner-service", name: "Dinner Service" },
  { slug: "portrait", name: "Portrait" },
];

// ---------------------------------------------------------------------------
// THE NNINO FAMILY — names and roles as supplied.
//
// bio, craft, story and photograph are deliberately absent. The source gives a
// name and a role and nothing else; writing biographies for ten real people
// would be inventing facts about them. The admin fills these in.
// ---------------------------------------------------------------------------

export type SeedArtist = { name: string; role: string };

export const TEAM: SeedArtist[] = [
  { name: "Nkosinathi Mabhena", role: "Potter" },
  { name: "Shelton Sibanda", role: "Sculptor" },
  { name: "Pride Madzura", role: "Sculptor" },
  { name: "Marion Moyo", role: "Artist" },
  { name: "Joseph Mpofu", role: "Artist" },
  { name: "Collin Mpofu", role: "Artist" },
  { name: "Nephat Muleya", role: "Artist" },
  { name: "Eugene Nyahodza", role: "Artist" },
  { name: "Noel Ncube", role: "Kiln, glazing and packing" },
  { name: "Sherry Jena", role: "Moulder" },
];

// ---------------------------------------------------------------------------
// SIGNATURE PIECES — [CATALOGUE], the only products with measured dimensions.
//
// The catalogue does not say which range each belongs to, so collection is left
// unset rather than guessed. Weight is omitted where the page shows dimensions
// only.
// ---------------------------------------------------------------------------

export type SeedMeasuredProduct = {
  name: string;
  heightCm?: number;
  widthCm?: number;
  weightKg?: number;
};

export const MEASURED_PIECES: SeedMeasuredProduct[] = [
  { name: "3D New Collection Leopard Vase", heightCm: 31, widthCm: 35, weightKg: 5.75 },
  { name: "3D Small Tureen Giraffe Collection Vase", heightCm: 33, widthCm: 36, weightKg: 4.15 },
  { name: "3D King Cheetah Tureen", heightCm: 68, widthCm: 35, weightKg: 8.5 },
  { name: "3D Sable Collection Vase", heightCm: 64, widthCm: 33, weightKg: 10.35 },
  { name: "3D Monkey Statue", heightCm: 51.5, widthCm: 47 },
  { name: "3D Lion Tureen", heightCm: 32, widthCm: 43, weightKg: 5.6 },
  { name: "3D Kudu & Leopard Oval Bowl", heightCm: 29, widthCm: 50, weightKg: 5.9 },
  { name: "3D Crocodile Vase", heightCm: 47, widthCm: 47, weightKg: 8.3 },
  { name: "3D Chameleon Vase", heightCm: 50, widthCm: 35, weightKg: 9.9 },
  { name: "3D Buffalo Safari Bowl", heightCm: 25, widthCm: 58, weightKg: 8.55 },
  { name: "3D Big Five Master Piece", heightCm: 36, widthCm: 47, weightKg: 6.9 },
  { name: "3D Botanical Marion Vase Large", heightCm: 47, widthCm: 19 },
  { name: "3D Big Five Vase", heightCm: 48, widthCm: 35.5 },
  // Named in [CATALOGUE] with no measurements given.
  { name: "Lovely Square Story Set" },
  { name: "New Collection Dinner Set Plates" },
  { name: "Giraffe Set" },
  { name: "Elephant Set" },
  { name: "Leopard Set" },
];

// ---------------------------------------------------------------------------
// PRICED PIECES — [PRICELIST]. The only products with a real price.
//
// The scan is undated beyond its filename, so a price being listed is not taken
// as proof the piece is on sale today. These import with the price recorded and
// the lifecycle still CATALOGUE; the team publishes them when they confirm.
// ---------------------------------------------------------------------------

export type SeedPricedProduct = {
  name: string;
  priceUsd?: number;
  collectionSlug?: string;
};

export const PRICED_PIECES: SeedPricedProduct[] = [
  { name: "Antipasto Platter Round — Buffalo", priceUsd: 150 },
  { name: "Antipasto Platter Round — Cheetah", priceUsd: 150 },
  { name: "Antipasto Platter Round — Lioness", priceUsd: 150 },
  { name: "Antipasto Platter Round — Rhino", priceUsd: 150, collectionSlug: "rhino" },
  { name: "Antipasto Platter Round — Botanical Birds", priceUsd: 150 },
  { name: "Double Handle Serving Platter — Watermelon", priceUsd: 150, collectionSlug: "watermelon" },
  { name: "Double Handle Serving Platter — Botanical Birds", priceUsd: 150 },
  { name: "Double Handle Serving Platter — Zebra Fusion", priceUsd: 150, collectionSlug: "zebra-fusion" },
  { name: "Double Handle Serving Platter — Monstera", priceUsd: 150 },
  // Shown in [PRICELIST] with no price printed.
  { name: "Flamingo Candle Stand 3D", collectionSlug: "flamingo" },
  { name: "Meerkat Candle Stand 3D" },
];

// ---------------------------------------------------------------------------
// RANGE ITEMS — [BROCHURE]. The item names printed beneath each range's photos.
//
// Item names repeat across ranges ("Standard Spoon Rest" appears in Hippo,
// Gorilla and Chilli), which is why product slugs are prefixed with the range
// slug — see buildProductSlug() in seed.ts.
// ---------------------------------------------------------------------------

export const RANGE_ITEMS: Record<string, string[]> = {
  "zebra-fusion": [
    "Rimless Dinner Plate",
    "Espresso Cup & Saucer",
    "Rimless Side Plate",
    "Rimless Fish Plate",
    "Multipurpose Bowl Size 4",
  ],
  zebra: [
    "Sushi Platter Skin",
    "3D Safari Sculptured Tea Pot - Round",
    "Geometric Plate Square",
    "Sushi Platter Peanut Bowl",
    "Standard Square Deep Bowl",
    "3D Candle Holder",
    "Standard Safari Tapered Vase",
    "Rectangular Snack Platter",
  ],
  leopard: [
    "Figure Ndlovugazi Tea Light Holder",
    "Decorative Vase",
    "Wide Portrait Rim Bowl",
    "3D Sculptured Spaghetti Bowl",
    "3D Sculptured Safari Oil & Vinegar",
    "Combi Cup & Saucer",
    "3D Safari Sculptured Round Teapot",
    "3D NN Sculptured Mug - Large",
  ],
  giraffe: [
    "3D Safari Tea Light Candle Holder",
    "3D Safari Yogurt Bowl",
    "Standard - Coffee Mug",
    "Large - V Mug Skin",
    "3D Safari Spaghetti Bowl",
    "3D Safari Gravy Jug Large",
    "3D Serviette Ring Holder",
    "3D Standard Relief Cruet Set",
    "3D Safari Curvy Platter",
  ],
  elephant: [
    "3D Sculptured Safari Serviette Ring Holder",
    "3D Sculptured Peanut Bowl",
    "3D Sculptured Safari Tea Light Holder",
    "3D Safari Sculptured Egg Cup",
    "3D Oval Flat Relief Cruet Set",
    "3D Bon Bon Bowl with Handle",
    "3D Safari Simple Lines Water Jug",
    "Sushi Platter Peanut Plate",
  ],
  rhino: [
    "Standard Wrap Mug Portrait",
    "Standard 3D V Mug Relief",
    "Standard Spoon Rest",
    "Standard Espresso Cup & Saucer",
    "Round Coaster Portrait",
    "Rectangular Snack Platter Portrait",
    "3D Sculptured Safari Serviette Ring Holder",
    "3D Sculptured Safari Cruet Set",
  ],
  hippo: [
    "Standard Spoon Rest",
    "3D Sculptured Serviette Ring",
    "3D Sculptured Cruet Set",
    "3D Sculptured Toothpick Holder",
    "3D Sculptured Tea Light Holder",
    "Sushi Platter",
    "Rectangular Snack Platter",
    "Standard Wrap Mug",
  ],
  crocodile: [
    "3D Sculptured Fragrance Burner",
    "3D Serviette Ring Holder",
    "3D Sundae Bowl",
    "3D Yogurt Bowl",
    "3D Serviette Holder",
    "3D Water Jug",
    "3D Spaghetti Bowl",
    "3D Sculptured Beer Mug",
    "3D Egg Relief Sculptured Cruet Set",
    "3D Cruet Set Sculptured",
    "3D Garlic Platter",
    "3D Curvy Platter",
  ],
  pangolin: [
    "Wave Snack & Dip Bowl",
    "Standard Simple Lines Vase Square",
    "Standard NN Cruet Set Skin",
    "3D Sculptured Safari Serviette Ring Holder",
    "3D Sculptured Cruet Set",
    "3D Sculptured Tea Light Holder",
    "Multipurpose Bowl Size 2 Skin",
    "3D Sculptured Safari Fragrance Burner",
  ],
  gorilla: [
    "Standard Garlic Platter",
    "3D Egg Relief Cruet Set",
    "3D Sculptured Tea Light Holder",
    "3D Sculptured Trinket Box - Round",
    "3D Wrap Relief Mug",
    "STD Wrap Mug",
    "Spoon Rest",
    "Standard Shot Glass",
  ],
  "guinea-fowl": [
    "Standard Square Trinket Box",
    "Round Trinket Box",
    "Standard Spaghetti Bowl",
    "Simple Lines Espresso Cup & Saucer",
    "Rimless Dinner Plate",
    "Fish Plate",
    "Side Plate",
    "3D Sculptured Fragrance Burner",
    "3D Sculptured Safari Tea Light Candle",
    "Toothpick Holder",
    "Serviette Ring Holder",
    "Deco Bowl - Large",
    "Oval Garlic Platter",
  ],
  flamingo: [
    "Tapered Vase",
    "Ginger Jar - Large",
    "Rimless Dinner Plate",
    "Side Plate",
    "Standard Square Peanut Bowl",
    "30s Cup & Saucer",
    "Ball Tea Light Candle Holder Large",
    "Deep Oval Bowl",
    "Pavlova Platter",
  ],
  "big-5": [
    "Elephant Portrait",
    "Leopard Portrait",
    "Buffalo Portrait",
    "Lion Portrait",
    "Rhino Portrait",
    "Trio Sauce Bowls",
    "3D Relief Wrap Mug",
    "3D V Relief Mug",
    "3D Relief Shot Glass",
    "Std Shot Glass",
    "Round Coaster",
  ],
  "leopard-ivy": [
    "Spice Jar",
    "Ball Vase Double",
    "Rimless Fruit Bowl",
    "Ball Vase",
    "Cathy Bowl - Large",
  ],
  botany: [
    "Dinner Plate",
    "Fish Plate",
    "Side Plate",
    "Cathy Bowl Large",
    "3D Medium Leaf Platter",
    "Tapered Vase",
    "Standard Mega Round",
    "Standard Sarmi Rectangular Platter",
    "Standard Spice Jar",
    "Palm Turkish Platters - Bark",
    "Cylinder Vase - Extra Large",
    "Deco Bowl - Large",
    "3D Monstero Leaf Platter",
    "Simple Lines Square Vase",
    "Sushi Platter",
    "Std NN Round Tea Pot",
    "Sugar Basin",
    "Milk Jug",
    "Std Spaghetti Bowl",
    "Std Wrap Relief Mug",
    "Std Cake Lifter",
    "Bendy Bowl Size 4",
  ],
  olive: ["Rimless Fruit Bowl"],
  lemon: [
    "STD - Wrap Mug",
    "Tapered Lemon Vase",
    "Simple Lines Cereal Bowl",
    "Model Tall Round Vase - Size 6",
    "3D Leaf Platter Oval",
    "Soap Dish & Toothbrush Holder",
    "Combi Cup & Saucer",
    "3D Sculptured Cruet Set",
  ],
  watermelon: [
    "STD - Wrap Mug",
    "Standard Jug",
    "French Garlic Platter",
    "Standard Spaghetti Bowl",
    "Rimless Fruit Bowl",
    "3D - Sculptured Cruet Set",
  ],
  "arctic-white-protea": [
    "NN - Standard Cruet Set",
    "3D Sculptured Tooth Pick Holder",
    "Gravy Boat with Spout",
    "3D Relief NN Mug Small",
    "Standard Water Jug",
    "Fruit Bowl with Handle",
    "STD - Shot Glass",
    "Off Centre Flare Bowl - Large",
  ],
  "pink-protea": [
    "3D Double Snack Bowl",
    "Wide Rim Platter 32cm",
    "Rimless Dinner Plate",
    "Rimless Side Plate",
    "Sushi Platter",
    "Cylinder Vase X Large",
    "3D Sculptured Spaghetti Bowl",
    "3D Sculptured Water Jug",
    "Wave Snack & Dip Platter",
  ],
  "flame-lily": [
    "Model Round Tall Vase - 6",
    "Standard V Mug",
    "Salad Bowl",
    "Double Handle Serving Platter",
    "30s Teapot",
    "Multi Purpose Bowl Size 7",
    "Bush Pot with Lid",
    "Rectangular Snack Platter",
  ],
  strelitzia: [
    "NN - Standard Cruet Set",
    "Standard Spaghetti Bowl",
    "Round Coaster",
    "Dinner Plate",
    "3D Relief Yogurt Bowl",
    "3D Relief Water Jug",
    "STD - V Mug",
    "Standard Serviette Ring Holder",
  ],
  butterfly: [
    "STD - Water Jug",
    "Mega Round Platter",
    "Mega Round Platter 31cm",
    "Standard Cake Stand",
    "3D - Bendy Bowl Size 4",
    "3D Sculptured Cookie Jar",
    "3D Water Pitcher",
    "Double Handled Platter",
  ],
  "dragon-fly": [
    "3D Sculptured Serviette Ring Holder",
    "Gravy Boat with Spout",
    "Standard Yogurt Bowl",
    "Standard Square Peanut Bowl",
    "Simple Lines Tea Pot",
    "30s Sugar Basin",
    "30s Milk Jug",
    "Gravy Boat & Saucer",
    "3 Division Square Snack Dip Bowl",
    "Oval Garlic Platter",
  ],
  chilli: [
    "Double Spoon Rest",
    "Standard Spoon Rest",
    "Standard Trinket Box - Round",
    "Flat Bowl Cereal Size 4",
    "Double Handle Platter",
    "Antipasto Platter",
    "Sushi Platter",
    "Turkish Platter",
  ],
  "blue-feather": [
    "Square Tall Vase",
    "Dinner Rimless Plate",
    "Fish Rimless Plate",
    "Side Rimless Plate",
    "Wrap Mug",
    "Standard Cake Stand",
    "Square Story Plate Size 4",
    "Deco Bowl - Large",
    "Large Cathy Bowl",
  ],
  "polka-dot": [
    "3D Cookie Jar",
    "3D Water Jug",
    "3D Multipurpose Bowl Size 5 - Bow",
    "Bow 3D Platter",
    "3D Espresso Cup",
    "Bow 3D NN Mug Small",
    "Bow - 3D Tea Pot",
    "3D Tripled Joined Snack Bowl - Straight",
    "3D Tea Light Holder",
    "3D Sugar Basin",
    "3D Milk Jug",
    "Std Rimless Side Plate",
    "Std Oval Garlic Platter",
  ],
  "white-bow": [
    "3D Spaghetti Bowl",
    "3D Jenny Bowl Bow",
    "3D Cb Vase Bow",
    "3D NN Mug Small - Bow",
    "3D Simple Lines Square Vase Bow",
    "3D Tall Model Vase - Bow",
    "3D Cup & Saucer NN Espresso - Bow",
    "3D Oriental Bowl Bow",
  ],
  "black-matt": [
    "Wide Rim Platter with Bows 32cm",
    "Sculptured Dinner Plate",
    "Demi Dinner Plate",
    "Rimless Dinner Plate",
    "Fish Rimless Plate",
    "Multipurpose Bowl - Size 4",
    "Side Rimless Plate",
    "Simple Lines Square Vase",
    "3D Combi Cup with Spoon Holder",
    "Trio Sauce Bowls",
  ],
  "white-and-gold": [
    "3D Bow Sculptured Mini Butter Dish",
    "3D Combi Cup & Saucer",
    "3D Sculptured Chain Water Jug",
    "3D Sculptured Gold Chain Combo Cup & Saucer",
    "Espresso Cup & Saucer",
    "3D Water Jug Bow",
    "3D NN Tea Pot Bow",
    "3D Espresso Cup with Bow",
    "3D NN Milk Jug",
    "Sugar Basin with Bow",
  ],
  "bright-and-bold": [
    "Bright Leopard Cathy Bowl - Large",
    "Confetti Leopard Square Mega Platter",
    "Mega Round Platter",
    "Safari Skin Mega Platter",
    "Sunflower Mega Platter",
    "Sunflower Mega Platter Zebra",
    "Safari Extravanganza Kay Bowl",
    "Bright Lion Cathy Bowl - Large",
    "Safari Orange Palm Rimless Dinner Plate",
    "Orange Leopard - Zebra Kay Bowl",
    "Bright Orange/Zebra Narrow Garlic Platter",
  ],
  "black-and-white": [
    "Cathy Bowl - Large",
    "Canisters S/M/L",
    "Sculptured Tea Pot",
    "3D NN Garlic Platter",
    "Square Story Size 3",
    "Square Story Size 1",
    "3D NN Cruet Set with Bow",
    "3D Spaghetti Bowl with Bow",
    "Wide Rim Bowl with Bow",
    "Thai - Medium Bowl with Bow",
  ],
  fashionista: [
    "3D Sculptured Accessory Make Up Brush Holder",
    "3D Sculptured Safari Shoe Accessory",
    "3D Sculptured Accessory Vase Container",
    "Sculptured Safari Make Up Brush Holder or Vase Accessory",
    "3D Sculptured Cruet Set",
    "3D Sculptured Safari Accessory",
    "3D Sculptured Safari Cruet Set",
  ],
  "gallery-ware": [
    "3D Safari Sculptured Candelabra",
    "3D Safari Sculptured Cookie Jar",
    "3D Triple Safari Candle Holder",
    "3D Safari Sculptured Fashion Teapot",
    "Floral Zebra Cathy Bowl - Large",
    "Floral Elephant Cathy Bowl - Large",
    "Sculptured Designer Nnino Teapot",
  ],
  "water-pitcher": [
    "3D Safari Sculptured 1",
    "3D Safari Sculptured 2",
    "3D Safari Sculptured 3",
    "3D Safari Sculptured 4",
    "3D Sculptured Bird 1",
    "3D Sculptured Bird 2",
    "3D Sculptured Bird 3",
    "3D Sculptured Bird 4",
  ],
  xmas: [
    "3D Sculptured Rudolph - Small Tea Light Holder",
    "Santa Wide Rim Platter",
    "Square Story Size 1, 2 & 3 with Bow",
    "Snowmen Snack Platter",
    "3D Rudolph Mug",
    "Sami Platter with Bow",
    "Square Story Size 2 Zebra Platter with Bow",
    "3D Green Xmas Trees",
    "3D Rudolph Sculptured Large Tea Light Holder",
    "Christmas Tree Snack Platter",
    "Red Ribbon Rimless Dinner Plate",
    "Red Ribbon Christmas Tree Snack Platter",
    "3D Cruet Set",
    "Red Ribbon Star Snack Platter",
    "Red Ribbon Wave Snack",
    "Std Egg Cruet Set",
    "Star Snack Platter",
  ],
  "dinner-service": [
    "Dragon Fly",
    "Giraffe",
    "Bold and Bright",
    "Botany",
    "Gold Bow",
    "Zebra",
    "Black Matt",
    "Pink Protea",
  ],
  // Portrait commissions of public figures, as listed in [BROCHURE]. Recorded as
  // catalogue history only — no claim of endorsement or current availability.
  portrait: [
    "President Mandela",
    "President Mnangagwa",
    "President Ramaphosa 1",
    "President Ramaphosa 2",
    "Ed Sheeran",
    "Her Majesty the Queen",
  ],
};

// ---------------------------------------------------------------------------
// CONTENT BLOCKS — editable site copy.
//
// Only two blocks carry text, because only two sentences of marketing copy are
// actually supported by the documents (both quoted below). Every other block is
// created empty so the team can fill it rather than inheriting invented prose.
// ---------------------------------------------------------------------------

export type SeedContentBlock = {
  key: string;
  type: "TEXT" | "RICH_TEXT" | "IMAGE" | "JSON";
  value: string | null;
  note: string;
};

export const CONTENT_BLOCKS: SeedContentBlock[] = [
  {
    key: "homepage.hero.headline",
    type: "TEXT",
    value: "Made By Hand, With Heart",
    note: `Tagline, [BROCHURE] and every page of [CATALOGUE].`,
  },
  {
    key: "legacy.origin",
    type: "RICH_TEXT",
    value:
      "Nnino Ceramics was established by Mary Filannino in Bulawayo, Zimbabwe. Each piece is individually designed and handcrafted with passion and style to create a unique product, exposing the local talent in sculpture and art.",
    note: `Verbatim from [BROCHURE] p.1.`,
  },
  {
    key: "about.products",
    type: "RICH_TEXT",
    value:
      "Each and every piece is individually designed, handmade, hand sculptured and hand painted, signed at the bottom of each piece. We are a team of 10 people. Each piece, from creating to a finished product, takes about 5 to 6 weeks depending on the weather: in winter it takes longer to dry, in summer it dries quicker.",
    note: `Condensed from [CATALOGUE] p.2. Wording tightened for grammar; no facts added.`,
  },
  { key: "homepage.hero.image", type: "IMAGE", value: null, note: "Awaiting a rights-cleared crop." },
  { key: "homepage.story.excerpt", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "legacy.founder", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "legacy.craft", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "legacy.continuation", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "family.intro", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "commissions.intro", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "wholesale.intro", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "shipping.policy", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "care.instructions", type: "RICH_TEXT", value: null, note: "For the team to write." },
  { key: "privacy.policy", type: "RICH_TEXT", value: null, note: "Needs legal review." },
  { key: "terms.of_sale", type: "RICH_TEXT", value: null, note: "Needs legal review." },
];

// ---------------------------------------------------------------------------
// SETTINGS — configurable business rules.
// ---------------------------------------------------------------------------

export const SETTINGS: { key: string; value: string; note: string }[] = [
  {
    key: "production.default_lead_time_days",
    value: "42",
    note: `5–6 weeks per [CATALOGUE] p.2; 42 days is the upper bound. Weather-dependent, so the team can change it.`,
  },
  {
    key: "inventory.default_low_stock_threshold",
    value: "2",
    note: "Operational default. Pieces are one-offs, so 2 is deliberately low.",
  },
  {
    key: "commerce.currency",
    value: "USD",
    note: `[PRICELIST] quotes prices in US dollars.`,
  },
];
