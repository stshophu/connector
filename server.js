/**
 * BUYMA Personal Shopper API — Integration Server
 * For Siebentaschen (siebentaschen.com)
 * Run: node server.js
 */

const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const crypto  = require('crypto');
require('dotenv').config();

const app = express();
app.use('/webhook/shopify', express.raw({ type: 'application/json' }));
app.use('/buyma/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// ─── Config ───────────────────────────────────────────────────────────────────

const BUYMA_BASE = process.env.BUYMA_ENV === 'production'
  ? 'https://personal-shopper-api.buyma.com'
  : 'https://sandbox.personal-shopper-api.buyma.com';

const CLIENT_ID              = process.env.BUYMA_CLIENT_ID;
const CLIENT_SECRET          = process.env.BUYMA_CLIENT_SECRET;
const REDIRECT_URI           = process.env.BUYMA_REDIRECT_URI;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

let ACCESS_TOKEN  = process.env.BUYMA_ACCESS_TOKEN  || null;
let REFRESH_TOKEN = process.env.BUYMA_REFRESH_TOKEN || null;
let EUR_JPY_RATE  = parseFloat(process.env.EUR_JPY_RATE) || 185;

// ─────────────────────────────────────────────────────────────────────────────
// PRICING CONFIGURATION
// All values are configurable via environment variables.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PRICE_BUFFER (default: 1.08 = 8% extra on top)
 * Protects against EUR/JPY moves and unexpected costs.
 * Raise to 1.12 if you want more cushion.
 */
const PRICE_BUFFER = parseFloat(process.env.PRICE_BUFFER) || 1.08;

/**
 * JAPAN_RETAIL_MULTIPLIER (default: 1.5 = Japan RRP is 50% above EU retail)
 * Used to calculate the reference price shown on BUYMA (the "original price"
 * that creates the discount appearance).
 * Typical range: 1.4–1.6 for luxury fashion.
 * Sources: Japanese boutique prices are systematically higher due to
 * 10% consumption tax, import duties, and local retail margin.
 */
// JAPAN_RETAIL_MULTIPLIER is now tiered by price — see getJapanMultiplier() below
// This env var is kept as an override if set, otherwise the tiered logic applies.
const JAPAN_RETAIL_MULTIPLIER_OVERRIDE = parseFloat(process.env.JAPAN_RETAIL_MULTIPLIER) || 0;

/**
 * SHOPIFY_COST_MARGIN (default: 0.25 = 25%)
 * The margin you have built into Shopify prices above your cost.
 * Used only for the margin check log — does not affect BUYMA price.
 * Formula: cost = shopify_price / (1 + SHOPIFY_COST_MARGIN)
 */
const SHOPIFY_COST_MARGIN = parseFloat(process.env.SHOPIFY_COST_MARGIN) || 0.25;

/**
 * MINIMUM_MARGIN_PCT (default: 15)
 * The minimum acceptable net profit margin (%) over your cost of goods.
 * The server will log a warning if any product falls below this threshold.
 */
const MINIMUM_MARGIN_PCT = parseFloat(process.env.MINIMUM_MARGIN_PCT) || 15;

// ─── Real DHL Express Germany → Japan shipping tiers ─────────────────────────
// From your DHL screenshot (non-document rates, standard service)

const SHIPPING_TIERS = {
  'under_500g': 85.60,   // up to 0.5 kg  — small accessories, jewelry, wallets, scarves, belts, sunglasses
  'under_1kg':  88.10,   // up to 1 kg    — small bags, flat shoes, light clothing
  'under_2kg':  95.00,   // up to 2 kg    — medium bags, shoes, dresses, tops, bottoms
  'under_5kg':  117.70,  // up to 5 kg    — large bags, boots, heavy clothing
  'under_10kg': 177.60,  // up to 10 kg   — coats, jackets, fur items
};

// Maps BUYMA category_id → DHL weight tier
const CATEGORY_SHIPPING_TIER = {
  // under_500g: accessories, jewelry, eyewear, scarves, belts, wallets, hats
  3120: 'under_500g', 3121: 'under_500g', 3122: 'under_500g', 3123: 'under_500g',
  3124: 'under_500g', 3125: 'under_500g', 3129: 'under_500g', 3130: 'under_500g',
  4152: 'under_500g', 3259: 'under_500g',
  3140: 'under_500g', 3141: 'under_500g', 3142: 'under_500g',
  3161: 'under_500g', 3162: 'under_500g', 3163: 'under_500g', 3164: 'under_500g',
  3111: 'under_500g', 3112: 'under_500g', 3113: 'under_500g', 3114: 'under_500g',
  3166: 'under_500g', 3169: 'under_500g', 3170: 'under_500g',
  4113: 'under_500g', 4114: 'under_500g', 4115: 'under_500g',
  3360: 'under_500g', 3362: 'under_500g', 3363: 'under_500g', 3364: 'under_500g',
  3408: 'under_500g', 3419: 'under_500g', 3426: 'under_500g', 3427: 'under_500g',
  3126: 'under_500g', 3127: 'under_500g', 3128: 'under_500g',
  4204: 'under_500g', 4205: 'under_500g', 4206: 'under_500g',
  4116: 'under_500g', 4117: 'under_500g', 4118: 'under_500g',
  4119: 'under_500g', 4120: 'under_500g', 4121: 'under_500g', 4122: 'under_500g',
  // under_1kg: flat shoes, ballet flats, slip-ons, loafers, light tops
  3088: 'under_1kg', 4108: 'under_1kg', 4109: 'under_1kg', 4110: 'under_1kg',
  3001: 'under_1kg', 3007: 'under_1kg', 3008: 'under_1kg', 3009: 'under_1kg',
  3011: 'under_1kg', 4102: 'under_1kg',
  3260: 'under_1kg', 3261: 'under_1kg', 3263: 'under_1kg',
  // under_2kg: medium bags, shoes, dresses, tops, bottoms, jeans
  3080: 'under_2kg', 3081: 'under_2kg', 3082: 'under_2kg', 3083: 'under_2kg',
  3100: 'under_2kg', 3101: 'under_2kg', 3102: 'under_2kg', 3103: 'under_2kg',
  3104: 'under_2kg', 3105: 'under_2kg', 3106: 'under_2kg',
  3020: 'under_2kg', 3021: 'under_2kg', 3022: 'under_2kg', 3023: 'under_2kg',
  3024: 'under_2kg', 3025: 'under_2kg',
  3040: 'under_2kg', 3041: 'under_2kg', 3042: 'under_2kg', 4103: 'under_2kg',
  3004: 'under_2kg', 3005: 'under_2kg', 3006: 'under_2kg',
  3065: 'under_2kg', 4101: 'under_2kg',
  3010: 'under_2kg', 3264: 'under_2kg', 3265: 'under_2kg',
  3266: 'under_2kg', 3268: 'under_2kg', 3309: 'under_2kg',
  3281: 'under_2kg', 3282: 'under_2kg', 3285: 'under_2kg',
  3341: 'under_2kg', 3342: 'under_2kg', 3343: 'under_2kg',
  // under_5kg: large bags, boots, heavy dresses, men's shoes
  3107: 'under_5kg', 3108: 'under_5kg',
  3084: 'under_5kg', 3085: 'under_5kg', 3086: 'under_5kg',
  3087: 'under_5kg', 4112: 'under_5kg',
  3320: 'under_5kg', 3321: 'under_5kg', 3322: 'under_5kg',
  3323: 'under_5kg', 3324: 'under_5kg',
  3344: 'under_5kg', 3345: 'under_5kg', 3346: 'under_5kg',
  // under_10kg: coats, jackets, outerwear, fur
  3060: 'under_10kg', 3061: 'under_10kg', 3062: 'under_10kg', 3063: 'under_10kg',
  3064: 'under_10kg', 3066: 'under_10kg', 3067: 'under_10kg',
  4104: 'under_10kg', 4105: 'under_10kg', 4106: 'under_10kg', 3257: 'under_10kg',
  3300: 'under_10kg', 3301: 'under_10kg', 3302: 'under_10kg', 3303: 'under_10kg',
  3304: 'under_10kg', 3305: 'under_10kg', 3306: 'under_10kg', 3307: 'under_10kg',
  3308: 'under_10kg', 3312: 'under_10kg',
};

// ─── Category detection ───────────────────────────────────────────────────────

/**
 * Detect gender from Shopify product tags.
 * Returns 'women' | 'men' | 'unisex'
 */
function detectGender(tags) {
  const tagList = Array.isArray(tags)
    ? tags.map(t => t.toLowerCase())
    : String(tags || '').split(',').map(t => t.trim().toLowerCase());
  if (tagList.some(t => ['women', 'donna', 'femme', 'damen', 'woman'].includes(t))) return 'women';
  if (tagList.some(t => ['men', 'uomo', 'homme', 'herren', 'man'].includes(t)))   return 'men';
  return 'unisex';
}

/**
 * Map Shopify product_type + gender → BUYMA category_id.
 * Returns 0 if no mapping found (will be logged as warning).
 */
const BUYMA_CATEGORY_MAP = {
  // TOPS
  't-shirt women': 3001, 't-shirt men': 3260, 't-shirt unisex': 3260,
  'polo shirt women': 3008, 'polo shirt men': 3261,
  'blouse women': 3007, 'shirt women': 3007, 'shirt men': 3263, 'shirt unisex': 3263,
  'knitwear women': 3004, 'knitwear men': 3266, 'knitwear unisex': 3266,
  'sweater women': 3004, 'sweater men': 3266, 'sweater unisex': 3266,
  'crewneck women': 3004, 'crewneck men': 3266, 'crewneck unisex': 3266,
  'turtleneck women': 3004, 'turtleneck men': 3266, 'turtleneck unisex': 3266,
  'cashmere women': 3004, 'cashmere men': 3266, 'cashmere unisex': 3266,
  'knit women': 3004, 'knit men': 3266, 'knit unisex': 3266,
  'hoodie women': 3005, 'hoodie men': 3264, 'hoodie unisex': 3264,
  'sweatshirt women': 3006, 'sweatshirt men': 3265, 'sweatshirt unisex': 3265,
  'cardigan women': 3065, 'cardigan men': 3309, 'cardigan unisex': 3309,
  'vest women': 3009, 'vest men': 4201,
  'tank top women': 3011, 'tank top men': 3269,
  'camisole women': 4102,
  // BOTTOMS
  'skirt women': 3020, 'mini skirt women': 3021,
  'trousers women': 3022, 'trousers men': 9809,
  'pants women': 3022, 'pants men': 9809,
  'jeans women': 3024, 'jeans men': 3281, 'jeans unisex': 3281,
  'denim women': 3024, 'denim men': 3281,
  'shorts women': 3023, 'shorts men': 3282, 'shorts unisex': 3282,
  'leggings women': 3167, 'tights women': 3168,
  'cargo pants men': 9807, 'sweatpants men': 9808, 'chinos men': 9811,
  // DRESSES & JUMPSUITS
  'dress women': 3040, 'maxi dress women': 3040, 'mini dress women': 3040,
  'jumpsuit women': 3041, 'overall women': 3041,
  'set women': 4103, 'co-ord women': 4103, 'two-piece women': 4103,
  // OUTERWEAR
  'coat women': 3060, 'coat men': 3300, 'coat unisex': 3300,
  'jacket women': 3061, 'jacket men': 3301, 'jacket unisex': 3301,
  'leather jacket women': 4104, 'leather jacket men': 3305, 'leather jacket unisex': 3305,
  'down jacket women': 3062, 'down jacket men': 3302, 'down jacket unisex': 3302,
  'blouson women': 3063, 'blouson men': 3303,
  'trench coat women': 4105, 'trench coat men': 3308, 'trench coat unisex': 3308,
  'parka women': 3060, 'parka men': 9816,
  'fur coat women': 4106,
  'bomber jacket men': 9815, 'bomber jacket unisex': 9815,
  'denim jacket men': 9821, 'denim jacket unisex': 9821,
  'fleece women': 3257, 'fleece men': 4236,
  'down vest women': 3067, 'down vest men': 3311,
  'blazer women': 3061, 'blazer men': 3312,
  'suit women': 3240, 'suit jacket men': 3312,
  'poncho women': 3066,
  // SHOES
  'sneakers women': 3081, 'sneakers men': 3321, 'sneakers unisex': 3321,
  'trainers women': 3081, 'trainers men': 3321, 'trainers unisex': 3321,
  'sandals women': 3080, 'sandals men': 3320, 'sandals unisex': 3320,
  'pumps women': 3082, 'heels women': 3082,
  'loafers women': 4109, 'loafers men': 3322, 'loafers unisex': 3322,
  'oxford shoes men': 3322, 'dress shoes men': 3322,
  'ballet flats women': 4110, 'slip-ons women': 4108, 'slip-ons men': 3324,
  // BOOTS
  'boots women': 3087, 'boots men': 3323, 'boots unisex': 3323,
  'long boots women': 3084, 'ankle boots women': 3085,
  'chelsea boots women': 3085, 'chelsea boots men': 3323, 'chelsea boots unisex': 3323,
  'rain boots women': 3086, 'rain boots men': 3324,
  // BAGS
  'tote bag women': 3100, 'tote bag men': 3342, 'tote bag unisex': 3342,
  'handbag women': 3101,
  'shoulder bag women': 3105, 'shoulder bag men': 3341, 'shoulder bag unisex': 3341,
  'clutch women': 3104, 'clutch bag women': 3104,
  'backpack women': 3107, 'backpack men': 3344, 'backpack unisex': 3344,
  'boston bag women': 3106, 'boston bag men': 3343,
  'crossbody bag women': 3105, 'crossbody bag men': 3341,
  'mini bag women': 3105, 'belt bag women': 3108, 'belt bag men': 3346, 'belt bag unisex': 3346,
  'messenger bag men': 3341, 'business bag men': 3345, 'party bag women': 3255,
  // WALLETS & SMALL LEATHER
  'wallet women': 3114, 'wallet men': 3410, 'wallet unisex': 3410,
  'long wallet women': 3169, 'long wallet men': 3408,
  'bifold wallet women': 3111, 'bifold wallet men': 3419,
  'coin purse women': 3112, 'coin purse men': 3426,
  'card holder women': 3113, 'card holder men': 3411, 'card holder unisex': 3411,
  'key case women': 4114, 'key case men': 3427,
  'key ring women': 3166, 'key ring men': 3427,
  'pouch women': 3170, 'bag charm women': 4115,
  // ACCESSORIES
  'necklace women': 3120, 'necklace men': 3360, 'necklace unisex': 3360,
  'earrings women': 3121, 'earrings men': 4202,
  'ring women': 3122, 'ring men': 3363, 'ring unisex': 3363,
  'bracelet women': 3129, 'bracelet men': 3362, 'bracelet unisex': 3362,
  'bangle women': 3129, 'bangle men': 9813,
  'hair accessory women': 3124,
  'scarf women': 3161, 'scarf men': 3401, 'scarf unisex': 3401,
  'muffler women': 3162, 'muffler men': 3401,
  'stole women': 3162, 'stole men': 4235,
  'gloves women': 3163, 'gloves men': 3403, 'gloves unisex': 3403,
  'belt women': 3164, 'belt men': 3404, 'belt unisex': 3404,
  'hat women': 4116, 'hat men': 4117, 'hat unisex': 4117,
  'cap women': 4117, 'cap men': 4117, 'cap unisex': 4117,
  'beanie women': 4119, 'beanie men': 4119, 'beanie unisex': 4119,
  'sunglasses women': 3140, 'sunglasses men': 3414, 'sunglasses unisex': 3414,
  'glasses women': 3141, 'glasses men': 3417, 'glasses unisex': 3417,
  'socks women': 3168, 'socks men': 4216,
  // WATCHES
  'watch women': 3126, 'watch men': 4204, 'watch unisex': 4204,
  'analog watch women': 3126, 'analog watch men': 4204,
  'digital watch women': 3127, 'digital watch men': 4205,
  // JEWELRY
  'jewelry women': 3125, 'jewelry men': 3364, 'jewelry unisex': 3364,
  // FRAGRANCE
  'perfume women': 2305, 'perfume men': 2305, 'perfume unisex': 2305,
  'fragrance women': 2305, 'fragrance men': 2305, 'fragrance unisex': 2305,
  // SWIMWEAR
  'swimwear women': 4134, 'swimwear men': 4233, 'swimwear unisex': 4233,
  'swim trunks men': 4233, 'swim trunks unisex': 4233,
  'boardshorts men': 4233, 'boardshorts unisex': 4233,
  'bikini women': 4133,
  // SLIPPERS
  'slippers women': 3083, 'slippers men': 3324, 'slippers unisex': 3324,
  'slipper women': 3083, 'slipper men': 3324, 'slipper unisex': 3324,
};

function getBuymaCategory(productType, tags, title) {
  const gender = detectGender(tags);
  const pt = (productType || '').trim().toLowerCase();

  // Try exact match with gender
  let catId = BUYMA_CATEGORY_MAP[`${pt} ${gender}`];
  if (catId) return catId;

  // Try unisex fallback
  catId = BUYMA_CATEGORY_MAP[`${pt} unisex`];
  if (catId) return catId;

  // Try opposite gender as last resort
  const other = gender === 'women' ? 'men' : 'women';
  catId = BUYMA_CATEGORY_MAP[`${pt} ${other}`];
  if (catId) {
    console.warn(`   ⚠ Category fallback used for "${productType}" (${gender} → ${other})`);
    return catId;
  }

  // ── Title-keyword fallback ──────────────────────────────────────────────
  // product_type is often a generic Italian bucket ("abbigliamento",
  // "accessori") that doesn't map to a specific BUYMA category. The real
  // garment type is usually present as a word in the product title instead.
  catId = getBuymaCategoryFromTitle(title, gender);
  if (catId) {
    console.warn(`   ⚠ Category resolved from TITLE (not product_type) for "${title}"`);
    return catId;
  }

  console.warn(`   ⚠ NO BUYMA CATEGORY for product_type="${productType}" gender="${gender}" — product will be skipped`);
  return 0;
}

/**
 * Scan a product title for a known garment keyword and resolve it through
 * the same BUYMA_CATEGORY_MAP. Checked in order from most specific to most
 * generic phrase, so e.g. "down jacket" matches before bare "jacket".
 */
const TITLE_KEYWORDS = [
  // multi-word / specific first
  'down jacket', 'down vest', 'leather jacket', 'trench coat', 'denim jacket',
  'bomber jacket', 'chelsea boots', 'ankle boots', 'long boots', 'rain boots',
  'tote bag', 'shoulder bag', 'crossbody bag', 'clutch bag', 'boston bag',
  'belt bag', 'mini bag', 'business bag', 'messenger bag', 'party bag',
  'long wallet', 'bifold wallet', 'coin purse', 'card holder', 'key case',
  'key ring', 'bag charm', 'hair accessory', 'ballet flats', 'slip-ons',
  'oxford shoes', 'dress shoes', 'tank top', 'polo shirt', 'mini skirt',
  'mini dress', 'maxi dress', 'cargo pants', 'sweatpants', 'analog watch',
  'digital watch', 'two-piece', 'co-ord',
  // single-word / generic
  'swimwear', 'swim trunks', 'boardshorts', 'bikini', 'trousers', 'pants',
  'jeans', 'denim', 'shorts', 'leggings', 'tights', 'skirt', 'dress',
  'jumpsuit', 'overall', 'coat', 'jacket', 'blouson', 'parka', 'fleece',
  'blazer', 'suit', 'poncho', 'sneakers', 'trainers', 'sandals', 'slippers',
  'slipper', 'pumps', 'heels', 'loafers', 'boots', 'wallet', 'pouch',
  'necklace', 'earrings', 'ring', 'bracelet', 'bangle', 'scarf', 'muffler',
  'stole', 'gloves', 'belt', 'hat', 'cap', 'beanie', 'sunglasses', 'glasses',
  'socks', 'watch', 'jewelry', 'perfume', 'fragrance', 't-shirt', 'shirt',
  'blouse', 'knitwear', 'sweater', 'knit', 'crewneck', 'turtleneck', 'cashmere',
  'hoodie', 'sweatshirt', 'cardigan',
  'vest', 'camisole', 'backpack',
];

function getBuymaCategoryFromTitle(title, gender) {
  const t = (title || '').toLowerCase();
  for (const keyword of TITLE_KEYWORDS) {
    if (t.includes(keyword)) {
      let catId = BUYMA_CATEGORY_MAP[`${keyword} ${gender}`];
      if (catId) return catId;
      catId = BUYMA_CATEGORY_MAP[`${keyword} unisex`];
      if (catId) return catId;
      const other = gender === 'women' ? 'men' : 'women';
      catId = BUYMA_CATEGORY_MAP[`${keyword} ${other}`];
      if (catId) return catId;
    }
  }
  return 0;
}

// ─── BUYMA name length limit ──────────────────────────────────────────────
// BUYMA requires product names to be within 30 full-width characters OR
// 60 half-width characters. Full-width chars (most non-ASCII, incl. Japanese)
// count as 2 units; half-width (ASCII) chars count as 1 unit. Limit = 60 units.
function truncateBuymaName(name) {
  const MAX_UNITS = 60;
  let units = 0;
  let result = '';
  for (const ch of String(name || '')) {
    const isFullWidth = ch.codePointAt(0) > 0xFF; // rough ASCII vs non-ASCII check
    const w = isFullWidth ? 2 : 1;
    if (units + w > MAX_UNITS) break;
    units += w;
    result += ch;
  }
  return result.trim();
}

// ─── Pricing functions ────────────────────────────────────────────────────────

/**
 * Calculate BUYMA selling price, Japan RRP, and validate margin.
 *
 * Steps:
 *  1. Pick correct DHL tier by category
 *  2. BUYMA price = (Shopify EUR + DHL) ÷ 0.95 × buffer → JPY rounded ¥100
 *  3. Japan RRP   = Shopify EUR × japan_multiplier × EUR/JPY → JPY rounded ¥1,000
 *  4. Margin check: net profit over cost, warn if below minimum
 *  5. Return all values for logging and the API call
 */
/**
 * getJapanMultiplier — tiered Japan retail markup by price range.
 * Lower-priced items are marked up MORE in Japan (accessories, jewelry).
 * Higher-priced items converge closer to EU pricing.
 */
function getJapanMultiplier(shopifyEur) {
  if (JAPAN_RETAIL_MULTIPLIER_OVERRIDE > 0) return JAPAN_RETAIL_MULTIPLIER_OVERRIDE;
  if (shopifyEur < 300)  return 2.20; // accessories, jewelry, scarves, belts
  if (shopifyEur < 700)  return 1.85; // shoes, small bags, clothing
  if (shopifyEur < 1500) return 1.55; // medium bags, dresses, coats
  return 1.45;                        // large bags, jackets (Japan/EU gap narrows at top)
}

function calculatePricing(shopifyEur, categoryId) {
  const tier        = CATEGORY_SHIPPING_TIER[categoryId] || 'under_2kg';
  const dhlEur      = SHIPPING_TIERS[tier];

  // BUYMA selling price (what the buyer pays, free shipping included)
  const bmEurGross  = (shopifyEur + dhlEur) / (1 - 0.05) * PRICE_BUFFER;
  const bmJpy       = Math.round((bmEurGross * EUR_JPY_RATE) / 100) * 100;

  // Japan reference price — tiered multiplier ensures a real discount at all price points
  const japanMult   = getJapanMultiplier(shopifyEur);
  const japanRrpJpy = Math.round((shopifyEur * japanMult * EUR_JPY_RATE) / 1000) * 1000;

  // Discount percentage shown on BUYMA
  const discountPct = Math.round(((japanRrpJpy - bmJpy) / japanRrpJpy) * 100);

  // ── Margin check ──────────────────────────────────────────────────────────
  // Your estimated cost of goods (reversing the 25% Shopify margin)
  const costEur        = shopifyEur / (1 + SHOPIFY_COST_MARGIN);
  // What you actually receive after BUYMA's 5% commission (EUR equivalent)
  const netReceivedEur = (bmJpy / EUR_JPY_RATE) * (1 - 0.05);
  // Profit after cost of goods and DHL
  const profitEur      = netReceivedEur - costEur - dhlEur;
  // Margin over cost
  const marginPct      = Math.round((profitEur / costEur) * 100);
  const marginOk       = marginPct >= MINIMUM_MARGIN_PCT;

  return {
    bmJpy,
    japanRrpJpy,
    discountPct,
    dhlEur,
    tier,
    bmEurGross: Math.round(bmEurGross * 100) / 100,
    netReceivedEur: Math.round(netReceivedEur * 100) / 100,
    profitEur: Math.round(profitEur * 100) / 100,
    marginPct,
    marginOk,
  };
}

/**
 * Log a full pricing breakdown for a product.
 * Shows all numbers + a ✓/⚠ margin indicator.
 */
function logPricing(title, shopifyEur, pricing) {
  const {
    bmJpy, japanRrpJpy, discountPct, dhlEur, tier,
    profitEur, marginPct, marginOk
  } = pricing;

  const flag = marginOk ? '✓' : '⚠ LOW MARGIN';
  console.log(`   💰 ${title.slice(0,50)}`);
  console.log(`      Shopify:    €${shopifyEur.toFixed(2)}  |  DHL (${tier}): €${dhlEur.toFixed(2)}  |  Buffer: ×${PRICE_BUFFER}`);
  console.log(`      BUYMA:      ¥${bmJpy.toLocaleString()}  |  Japan RRP: ¥${japanRrpJpy.toLocaleString()}  |  Discount: ${discountPct}% OFF`);
  console.log(`      Margin:     €${profitEur.toFixed(2)} profit  (${marginPct}% over cost)  ${flag}`);
  if (!marginOk) {
    console.warn(`      ⚠ Margin ${marginPct}% is below minimum ${MINIMUM_MARGIN_PCT}%. Consider raising buffer or removing this product.`);
  }
}

// ─── Live EUR/JPY rate ────────────────────────────────────────────────────────

async function refreshEurJpyRate() {
  try {
    const res  = await axios.get('https://api.frankfurter.app/latest?from=EUR&to=JPY');
    const rate = res.data?.rates?.JPY;
    if (rate) {
      EUR_JPY_RATE = rate;
      console.log(`💱  EUR/JPY rate updated: ${rate.toFixed(2)}`);
    }
  } catch {
    console.log(`💱  Could not fetch live rate — using ${EUR_JPY_RATE}`);
  }
}
refreshEurJpyRate();
setInterval(refreshEurJpyRate, 6 * 60 * 60 * 1000);

// ─── BUYMA helpers ────────────────────────────────────────────────────────────

function buymaHeaders() {
  return { 'X-Buyma-Personal-Shopper-Api-Access-Token': ACCESS_TOKEN };
}
async function buymaGet(path, params = {}) {
  const res = await axios.get(`${BUYMA_BASE}${path}`, { headers: buymaHeaders(), params });
  return res.data;
}
async function buymaPost(path, body = {}) {
  const res = await axios.post(`${BUYMA_BASE}${path}`, body, { headers: buymaHeaders() });
  return res.data;
}

// ─── Shopify → BUYMA product mapper ──────────────────────────────────────────

function mapShopifyToBuyma(sp, overrides = {}) {
  const images = (sp.images || []).slice(0, 20).map((img, i) => ({
    path: img.src, position: i + 1,
  }));

  // ── Category detection ────────────────────────────────────────────────────
  const categoryId = overrides.category_id || getBuymaCategory(sp.product_type, sp.tags, sp.title);
  if (!categoryId) {
    console.warn(`   ✗ Skipping "${sp.title}" — no BUYMA category for product_type="${sp.product_type}"`);
    return null;
  }

  // ── Build deduplicated color/size sets from Shopify variants ─────────────
  // Shopify option1 = Color, option2 = Size (standard convention)
  const colorSet = new Set();
  const sizeSet  = new Set();
  (sp.variants || []).forEach(v => {
    if (v.option1) colorSet.add(v.option1);
    if (v.option2) sizeSet.add(v.option2);
  });

  const hasColor = colorSet.size > 0;
  const hasSize  = sizeSet.size > 0;
  const colors   = hasColor ? [...colorSet] : ['マルチカラー'];
  const sizes    = hasSize  ? [...sizeSet]  : ['ONE SIZE'];

  // Options array (BUYMA always requires both size and color)
  const options = [];
  let sizePos = 1;
  let colorPos = 1;
  sizes.forEach(s  => options.push({ type: 'size',  value: s, master_id: 0,  position: sizePos++ }));
  colors.forEach(c => options.push({ type: 'color', value: c, master_id: 99, position: colorPos++ }));

  // Stock lookup from Shopify
  const stockMap = {};
  (sp.variants || []).forEach(v => {
    const color = v.option1 || 'マルチカラー';
    const size  = v.option2 || 'ONE SIZE';
    stockMap[`${size}__${color}`] = v.inventory_quantity || 0;
  });

  // BUYMA requires the FULL cartesian product of all sizes × colors
  const variants = [];
  for (const size of sizes) {
    for (const color of colors) {
      const qty = stockMap[`${size}__${color}`] ?? 0;
      variants.push({
        options: [
          { type: 'size',  value: size  },
          { type: 'color', value: color },
        ],
        stock_type: qty > 0 ? 'stock_in_hand' : 'purchase_for_order',
        stocks:     qty > 0 ? qty : null,
      });
    }
  }

  const shopifyEur = parseFloat(sp.variants?.[0]?.price || 0);
  if (!shopifyEur || shopifyEur <= 0 || isNaN(shopifyEur)) {
    console.warn(`   ✗ Skipping "${sp.title}" — invalid/zero Shopify price (€${shopifyEur}). Check this product in Shopify.`);
    return null;
  }
  const pricing    = calculatePricing(shopifyEur, categoryId);
  logPricing(sp.title, shopifyEur, pricing);

  // available_until: today + 89 days
  const d = new Date();
  d.setDate(d.getDate() + 89);
  const available = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // ── Product description template ─────────────────────────────────────────
  const productDesc = sp.body_html ? sp.body_html.replace(/<[^>]+>/g, '').trim() : '';
  const rate = Math.round(EUR_JPY_RATE);
  const comments = `************************
【商品について / About this product】
・正規品・新品をお届けします。All products are 100% authentic and brand new.
・ドイツの正規取扱店より直接購入いたします。Purchased directly from authorized retailers in Germany.
・ショッピングバッグは付属しない場合があります。Shopping bags may not be included.
************************

${productDesc ? productDesc + '\n\n' : ''}************************
※【参考価格について】
日本での定価が不明な場合、参考価格は現地参考価格を1ユーロ＝${rate}円で換算したものです。
※The reference price is the local retail price converted at 1 euro = ${rate} yen.
************************

※【ご注意ください / Please note】
ご購入前に取引情報をよくお読みください。
Please read the transaction information carefully before purchasing.
世界各地よりご注文をいただくため、ご注文確定後に在庫切れとなる場合がございます。
As we receive orders from customers worldwide, items may occasionally sell out after your order is confirmed.
その場合、BUYMAより全額返金いたします。
In such cases, a full refund will be issued through BUYMA.

※【関税について / Customs duties】
海外からの発送となるため、関税が発生する場合があります。
Since shipment will be from overseas, customs duties may be charged.
関税額は事前にお知らせすることができません。
We cannot announce the customs amount in advance.
- 衣類（繊維製品）：約10〜12% / Clothing (textiles): approx. 10-12%
- バッグ・小物（革製品）：約15% / Bags & leather goods: approx. 15%
- 靴（革製）：約20% / Leather shoes: approx. 20%
- 靴（その他素材）：約10% / Shoes (other materials): approx. 10%

※【配送について / Shipping】
DHLエクスプレスにて発送いたします（追跡番号あり）。
Shipped via DHL Express with tracking number.
通常1〜5営業日以内に発送、到着まで4〜5日程度。
Usually dispatched within 1-5 business days, delivery takes approx. 4-5 days.
送料は無料です。Free shipping.

※【サイズ・カラーについて】
モニターの設定により、実際の色と異なって見える場合があります。
Colors may vary slightly depending on your screen settings.
サイズは目安です。ブランドや商品により異なります。
Sizes are approximate and vary by brand and product.
************************`.slice(0, 4000);

  return {
    reference_number: String(sp.id),
    control:          overrides.control || 'draft',
    name:             truncateBuymaName(sp.title),
    comments,
    brand_id:         overrides.brand_id   || 0,
    brand_name:       overrides.brand_name || (overrides.brand_id ? undefined : sp.vendor),
    category_id:      categoryId,
    price:            pricing.bmJpy,
    reference_price_type: 2,          // 2 = "with reference price" (shows discount)
    reference_price:  pricing.japanRrpJpy,
    available_until:  available,
    buying_area_id:   overrides.buying_area_id   || 2003018000,
    shipping_area_id: overrides.shipping_area_id || 2003018000,
    duty:             'included',
    season:           overrides.season || 0,
    images,
    options: options.length ? options : [{ type: 'size', value: 'ONE SIZE', master_id: 0, position: 1 }],
    shipping_methods: overrides.shipping_methods || [],
    variants: variants.length ? variants : [],
    // Pricing metadata (not sent to BUYMA, used for logging only)
    _pricing: pricing,

  };
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

app.get('/auth/authorize', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const url   = new URL(`${BUYMA_BASE}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id',     CLIENT_ID);
  url.searchParams.set('redirect_uri',  REDIRECT_URI);
  url.searchParams.set('state',         state);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No authorization code received.' });
  try {
    const response = await axios.post(`${BUYMA_BASE}/oauth/token`, {
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code', redirect_uri: REDIRECT_URI,
    });
    ACCESS_TOKEN  = response.data.access_token;
    REFRESH_TOKEN = response.data.refresh_token;
    console.log('✅  BUYMA OAuth successful.');
    console.log(`    BUYMA_ACCESS_TOKEN=${ACCESS_TOKEN}`);
    console.log(`    BUYMA_REFRESH_TOKEN=${REFRESH_TOKEN}`);
    res.json({ success: true, message: 'Connected to BUYMA!', access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });
  } catch (err) {
    res.status(500).json({ error: 'Failed to obtain access token.', detail: err.response?.data });
  }
});

app.get('/auth/status', (req, res) => {
  res.json({
    connected:    !!ACCESS_TOKEN,
    eur_jpy_rate: EUR_JPY_RATE,
    price_buffer: PRICE_BUFFER,
    japan_retail_multiplier: JAPAN_RETAIL_MULTIPLIER_OVERRIDE > 0 ? JAPAN_RETAIL_MULTIPLIER_OVERRIDE : "tiered (auto)",
  });
});

app.post('/auth/token', (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'access_token is required' });
  ACCESS_TOKEN  = access_token;
  REFRESH_TOKEN = refresh_token || null;
  res.json({ success: true });
});

app.post('/auth/revoke', async (req, res) => {
  try {
    await axios.post(`${BUYMA_BASE}/oauth/revoke`, { token: ACCESS_TOKEN }, { headers: buymaHeaders() });
    ACCESS_TOKEN = null; REFRESH_TOKEN = null;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Revoke failed.', detail: err.response?.data });
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────

app.post('/products', async (req, res) => {
  try {
    const data = await buymaPost('/api/v1/products.json', { product: req.body });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Failed.', detail: err.response?.data });
  }
});

app.delete('/products/:reference_number', async (req, res) => {
  try {
    const data = await buymaPost('/api/v1/products.json', {
      product: { control: 'delete', reference_number: req.params.reference_number },
    });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Failed.', detail: err.response?.data });
  }
});

// ─── Orders ───────────────────────────────────────────────────────────────────

app.get('/orders', async (req, res) => {
  try {
    const data = await buymaGet('/api/v1/orders.json', req.query);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Failed.', detail: err.response?.data });
  }
});

app.get('/orders/:order_id', async (req, res) => {
  try {
    const data = await buymaGet(`/api/v1/orders/${req.params.order_id}.json`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Not found.', detail: err.response?.data });
  }
});

app.post('/orders/:order_id/shipment', async (req, res) => {
  try {
    const data = await buymaPost(`/api/v1/orders/${req.params.order_id}/shipments.json`, { shipment: req.body });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Failed.', detail: err.response?.data });
  }
});

// ─── Sync ─────────────────────────────────────────────────────────────────────

app.post('/sync/shopify-product', async (req, res) => {
  const { shopify_product: sp, buyma_overrides = {} } = req.body;
  if (!sp) return res.status(400).json({ error: 'shopify_product is required' });

  const buymaProduct = mapShopifyToBuyma(sp, buyma_overrides);
  if (!buymaProduct) return res.status(422).json({ error: `No BUYMA category mapping for product_type="${sp.product_type}". Add it to BUYMA_CATEGORY_MAP in server.js.` });
  const { _pricing, ...productPayload } = buymaProduct; // strip internal field

  try {
    const data = await buymaPost('/api/v1/products.json', { product: productPayload });
    res.json({ success: true, buyma_response: data, pricing_summary: _pricing });
  } catch (err) {
    console.error('BUYMA error:', err.response?.status, JSON.stringify(err.response?.data), err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to sync.', detail: err.response?.data || err.message, status: err.response?.status, pricing_summary: _pricing,
    });
  }
});

// ─── Shopify Webhook ──────────────────────────────────────────────────────────


// ─── Simple webhook queue (prevent BUYMA 429) ─────────────────────────────────
const webhookQueue = [];
let webhookProcessing = false;
async function processWebhookQueue() {
  if (webhookProcessing) return;
  webhookProcessing = true;
  while (webhookQueue.length) {
    const fn = webhookQueue.shift();
    await fn();
    await new Promise(r => setTimeout(r, 2000));
  }
  webhookProcessing = false;
}

app.post('/webhook/shopify/product', async (req, res) => {
  if (SHOPIFY_WEBHOOK_SECRET) {
    const hmac   = req.headers['x-shopify-hmac-sha256'];
    const digest = crypto.createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
                         .update(req.body).digest('base64');
    if (hmac !== digest) {
      console.warn('⚠️  Webhook HMAC verification failed.');
return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  res.status(200).json({ received: true });

  let sp;
  try { sp = JSON.parse(req.body.toString()); } catch { return; }

  console.log(`\n🔔  Webhook: "${sp.title}" (ID: ${sp.id})`);

  if (!ACCESS_TOKEN) { console.warn('   ⚠ No BUYMA token. Complete OAuth first.'); return; }
  if (!sp.images?.length) { console.log('   ⚠ Skipping — no images.'); return; }
  if (sp.status !== 'active') { console.log(`   ⚠ Skipping — status: ${sp.status}`); return; }

  const overrides = {
    buying_area_id:   2003018000,
    shipping_area_id: 2003018000,
    duty:             'included',
    season:           0,
    shipping_methods: process.env.BUYMA_SHIPPING_METHOD_ID
      ? [{ shipping_method_id: parseInt(process.env.BUYMA_SHIPPING_METHOD_ID) }]
      : (() => { throw new Error('BUYMA_SHIPPING_METHOD_ID env var is not set. Log into buyma.com/my/shipping_methods and set it.'); })(),
  };

  webhookQueue.push(async () => {
  try {
    const buymaProduct          = mapShopifyToBuyma(sp, overrides);
    if (!buymaProduct) { console.log(`   ✗ Skipped — no category mapping.`); return; }
    const { _pricing, ...payload } = buymaProduct;
    const result                = await buymaPost('/api/v1/products.json', { product: payload });
    console.log(`   ✓ Synced. UID: ${result.request_uid}  |  ¥${_pricing.bmJpy.toLocaleString()} (${_pricing.discountPct}% OFF ¥${_pricing.japanRrpJpy.toLocaleString()})`);
  } catch (err) {
    console.error('   ✗ Sync failed:', err.response?.data || err.message);
  }
  });
  processWebhookQueue();
});

// ─── Pricing preview endpoint ─────────────────────────────────────────────────

/**
 * GET /pricing/preview?price_eur=500&category_id=3101
 * Returns full pricing breakdown for a product before syncing.
 */
app.get('/pricing/preview', (req, res) => {
  const { price_eur, category_id } = req.query;
  if (!price_eur) return res.status(400).json({ error: 'price_eur is required' });
  const eur     = parseFloat(price_eur);
  const catId   = parseInt(category_id) || 0;
  const pricing = calculatePricing(eur, catId);
  res.json({
    input: { price_eur: eur, category_id: catId },
    output: {
      buyma_price_jpy:     pricing.bmJpy,
      japan_rrp_jpy:       pricing.japanRrpJpy,
      discount_pct:        pricing.discountPct,
      dhl_shipping_eur:    pricing.dhlEur,
      weight_tier:         pricing.tier,
      your_profit_eur:     pricing.profitEur,
      margin_pct:          pricing.marginPct,
      margin_ok:           pricing.marginOk,
    },
    config: {
      eur_jpy_rate:            EUR_JPY_RATE,
      price_buffer:            PRICE_BUFFER,
      japan_retail_multiplier: JAPAN_RETAIL_MULTIPLIER,
      minimum_margin_pct:      MINIMUM_MARGIN_PCT,
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;
// ---- BUYMA → us webhook ----
app.post('/buyma/webhook', (req, res) => {
  const hmacHeader = req.get('X-Buyma-Hmac-Sha256') || '';
  const digest = crypto
.createHmac('sha256', process.env.BUYMA_CLIENT_SECRET || '')
    .update(req.body) // raw Buffer thanks to express.raw above
    .digest('base64');

  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch (e) { /* length mismatch etc. */ }

  if (!valid) return res.status(401).send('invalid signature');

  // Respond immediately (BUYMA requires 200 within 5s), process after
  res.sendStatus(200);

  const event = req.get('X-Buyma-Event');
  let payload = {};
  try { payload = JSON.parse(req.body.toString('utf8')); } catch (e) {}

  switch (event) {
    case 'product/fail_to_create':
    case 'product/fail_to_update':
      console.error(`[BUYMA] ${event} uid=${payload.request_uid}`, JSON.stringify(payload.errors));
      break;
    case 'order/create':
      console.log(`[BUYMA] NEW ORDER id=${payload.id} product=${payload.product?.reference_number} qty=${payload.amount}`);
      break;
    case 'order/update':
      console.log(`[BUYMA] order update id=${payload.id} status=${payload.status}`);
      break;
    default:
      console.log(`[BUYMA] event: ${event}`);
  }
});
app.listen(PORT, () => {
  console.log(`\n🛍️  BUYMA Integration Server`);
  console.log(`   Port:            ${PORT}`);
  console.log(`   Environment:     ${process.env.BUYMA_ENV || 'sandbox'}`);
  console.log(`   Connected:       ${!!ACCESS_TOKEN}`);
  console.log(`   EUR/JPY rate:    ${EUR_JPY_RATE}`);
  console.log(`   Price buffer:    ×${PRICE_BUFFER} (${((PRICE_BUFFER-1)*100).toFixed(0)}% extra)`);
  console.log(`   Japan RRP mult:  ×${JAPAN_RETAIL_MULTIPLIER_OVERRIDE > 0 ? JAPAN_RETAIL_MULTIPLIER_OVERRIDE : 'tiered (auto)'}`);
  console.log(`   Min margin:      ${MINIMUM_MARGIN_PCT}%`);
  console.log(`   Webhook URL:     ${process.env.BUYMA_SERVER_URL || 'https://buyma-integration.onrender.com'}/webhook/shopify/product\n`);
});
