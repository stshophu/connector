/**
 * Shopify → BUYMA Product Exporter
 * For Siebentaschen (siebentaschen.com)
 *
 * Run:          node shopify-export.js
 * Dry run:      node shopify-export.js --dry-run
 */

const axios = require('axios');
require('dotenv').config();

const SHOPIFY_STORE  = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;
const BUYMA_SERVER   = process.env.BUYMA_SERVER_URL || 'http://localhost:4000';
const DELAY_MS       = 600;
const DRY_RUN        = process.argv.includes('--dry-run');

// ─── BUYMA Season ID map ──────────────────────────────────────────────────────
// Maps a year + season keyword → BUYMA season ID
// Used to auto-detect season from Shopify product tags (e.g. "SS2025", "AW2024")
const SEASON_MAP = {
  '2025 SS': 47, '2025SS': 47, 'SS2025': 47, 'SS 2025': 47,
  '2025 Cruise': 48, '2025Cruise': 48,
  '2024-25 AW': 46, '2024-2025 AW': 46, 'AW2024': 46, 'AW 2024': 46,
  '2024 SS': 44, '2024SS': 44, 'SS2024': 44,
  '2024 Cruise': 45,
  '2023-24 AW': 43, 'AW2023': 43,
  '2023 SS': 42, 'SS2023': 42,
  '2023 Cruise': 41,
  '2022-23 AW': 40, 'AW2022': 40,
  '2022 SS': 39, 'SS2022': 39,
};
const DEFAULT_SEASON = 0; // 0 = no specification

// ─── BUYMA Brand ID map ───────────────────────────────────────────────────────
const BRAND_MAP = {
  'A-Style': 1782,
  'Acne Studios': 618,
  'Add': 1266,
  'Adidas': 105,
  'Aeronautica Militare': 1643,
  'ALAIA': 2603, 'Alaïa': 2603,
  'ALANUI': 10868,
  'Alberta Ferretti': 109,
  'Alexander McQueen': 111,
  'Alexander Wang': 112,
  'Alexandre Vauthier': 10704,
  'ALYX': 8506,
  'AMBUSH': 8234,
  'Ami Paris': 4789,
  'Amina Muaddi': 15107,
  'AMIRI': 7729,
  'Andrea Pompilio': 4482,
  'ANIYE BY': 17219,
  'APPARIS': 11436,
  'Aquascutum': 634,
  'AQUAZZURA': 6749, 'Aquazzura': 6749,
  'ARIES': 10525,
  'Armani': 126,
  'Armani Exchange': 100, 'A/X Armani Exchange': 100,
  'Armani Jeans': 693,
  'AS65': 9383,
  'Asics': 127,
  'AT.P.CO': 14319,
  'Automobili Lamborghini': 16705,
  'AUTRY': 16891,
  'Axel Arigato': 10534,
  'BAGUTTA': 11630,
  'Balenciaga': 131,
  'BALLANTYNE': 930,
  'Bally': 132,
  'Balmain': 1046,
  'Bikkembergs': 1935,
  'Blauer': 13151,
  'Blumarine': 1050,
  'BMW': 10038,
  'Bottega Veneta': 146, 'BOTTEGA VENETA': 146,
  'Boutique Moschino': 14041,
  'BOYY': 7932,
  'Brioni': 1377,
  'Brunello Cucinelli': 1301,
  'Burberry': 150,
  'C.P. Company': 3819,
  'Calvin Klein': 152,
  'Canada Goose': 1297,
  'CANALI': 16902,
  'Carrera': 1443,
  'Casablanca': 12961,
  'CASADEI': 3271, 'Casadei': 3271,
  'Cavalli Class': 7109,
  'Celine': 466, 'CELINE': 466,
  'Chloe': 85, 'Chloé': 85,
  'Christian Louboutin': 164,
  "Church's": 935,
  'Coach': 167,
  'COCCINELLE': 168, 'Coccinelle': 168,
  'COLOMBO': 12756,
  'Comme Des Garcons': 170, 'Comme Des Garçons': 170,
  'CONVERSE': 395,
  'Coperni': 13113,
  'CORNELIANI': 3694,
  'Craig Green': 6252,
  'Cruciani': 937,
  'Custo Barcelona': 2002,
  'DANIELE ALESSANDRINI': 7719,
  'Denny Rose': 4904,
  'Desigual': 1057,
  'DIADORA': 2048,
  'Diesel': 177,
  'Dior': 163,
  'Dolce & Gabbana': 181,
  'DONDUP': 12669,
  'Dunhill': 476,
  'EASTPAK': 1181,
  'EBARRITO': 17546, 'ebarrito': 17546,
  'Eleventy': 1518,
  'Elisabetta Franchi': 4203,
  'Emporio Armani': 187,
  'Ermanno Scervino': 2519,
  'ETRO': 188, 'Etro': 188,
  'Fabiana Filippi': 9337,
  'Fear Of God': 4749, 'FEAR OF GOD': 4749,
  'Herno': 1240, 'HERNO': 1240,
  'Jacquemus': 7388, 'JACQUEMUS': 7388,
  'Lardini': 1799, 'LARDINI': 1799,
  'Hackett': 945,
  'Moschino': 3160,
  'NIALAYA': 1683,
  'Plein Sport': 12799,
  'Tom Ford': 1135, 'TOM FORD': 1135,
  'Versace': 481, 'VERSACE': 481,
};

// ─── BUYMA Category ID map ────────────────────────────────────────────────────
const CATEGORY_MAP = {
  // Ladies tops
  'Tops': { category_id: 3010 },
  'T-Shirts': { category_id: 3001 },
  'Shirts': { category_id: 3007 }, 'Blouses': { category_id: 3007 },
  'Knitwear': { category_id: 3004 }, 'Sweaters': { category_id: 3004 },
  'Hoodies': { category_id: 3005 }, 'Sweatshirts': { category_id: 3006 },
  'Cardigans': { category_id: 3065 }, 'Vests': { category_id: 3009 },
  // Ladies bottoms
  'Bottoms': { category_id: 3025 }, 'Pants': { category_id: 3022 },
  'Trousers': { category_id: 3022 }, 'Jeans': { category_id: 3024 },
  'Shorts': { category_id: 3023 }, 'Skirts': { category_id: 3020 },
  // Dresses
  'Dresses': { category_id: 3040 }, 'Dress': { category_id: 3040 },
  'Jumpsuits': { category_id: 3041 }, 'Sets': { category_id: 4103 },
  // Outerwear
  'Outerwear': { category_id: 3064 }, 'Jackets': { category_id: 3061 },
  'Coats': { category_id: 3060 }, 'Down Jackets': { category_id: 3062 },
  'Blazers': { category_id: 3061 }, 'Leather Jackets': { category_id: 4104 },
  'Trench Coats': { category_id: 4105 }, 'Fur Coats': { category_id: 4106 },
  // Shoes
  'Shoes': { category_id: 3083 }, 'Sneakers': { category_id: 3081 },
  'Pumps': { category_id: 3082 }, 'Sandals': { category_id: 3080 },
  'Mules': { category_id: 3080 }, 'Flat Shoes': { category_id: 3088 },
  'Loafers': { category_id: 4109 }, 'Slip-Ons': { category_id: 4108 },
  'Ballet Flats': { category_id: 4110 },
  // Boots
  'Boots': { category_id: 3087 }, 'Ankle Boots': { category_id: 3085 },
  'Long Boots': { category_id: 3084 }, 'Short Boots': { category_id: 3085 },
  // Bags
  'Bags': { category_id: 3101 }, 'Handbags': { category_id: 3101 },
  'Shoulder Bags': { category_id: 3105 }, 'Tote Bags': { category_id: 3100 },
  'Clutch Bags': { category_id: 3104 }, 'Backpacks': { category_id: 3107 },
  'Belt Bags': { category_id: 3104 }, 'Mini Bags': { category_id: 3105 },
  'Crossbody Bags': { category_id: 3105 },
  // Accessories
  'Accessories': { category_id: 3125 }, 'Jewellery': { category_id: 3125 },
  'Jewelry': { category_id: 3125 }, 'Necklaces': { category_id: 3120 },
  'Earrings': { category_id: 3121 }, 'Bracelets': { category_id: 3129 },
  'Rings': { category_id: 3122 }, 'Hair Accessories': { category_id: 3124 },
  // Eyewear
  'Sunglasses': { category_id: 3140 }, 'Eyewear': { category_id: 3142 },
  'Glasses': { category_id: 3141 },
  // Wallets & small leather goods
  'Wallets': { category_id: 3169 }, 'Small Leather Goods': { category_id: 3114 },
  'Card Holders': { category_id: 3113 }, 'Coin Purses': { category_id: 3112 },
  'Key Rings': { category_id: 3166 }, 'Pouches': { category_id: 3170 },
  // Fashion accessories
  'Scarves': { category_id: 3161 }, 'Belts': { category_id: 3164 },
  'Gloves': { category_id: 3163 }, 'Hats': { category_id: 4116 },
  'Caps': { category_id: 4117 }, 'Watches': { category_id: 3128 },
  // Men's
  "Men's Tops": { category_id: 3268 }, "Men's Jackets": { category_id: 3301 },
  "Men's Shoes": { category_id: 3324 }, "Men's Bags": { category_id: 3346 },
  "Men's Wallets": { category_id: 3408 }, "Men's Belts": { category_id: 3404 },
};

// ─── Default overrides ────────────────────────────────────────────────────────
// ⚠️ Corrected area codes and duty from BUYMA's official CSV spec:
//    Germany area code = 2003018 (confirmed in item.csv)
//    Duty = 0 (NOT included — BUYMA spec says "not included, add 0")

const DEFAULT_OVERRIDES = {
  buying_area_id:   '2003018',   // ✓ Germany (corrected from API docs)
  shipping_area_id: '2003018',   // ✓ Germany
  duty:             0,            // ✓ Not included (0 per BUYMA spec)
  control:          'draft',
  season:           DEFAULT_SEASON,
  shipping_methods: [{ shipping_method_id: parseInt(process.env.BUYMA_SHIPPING_METHOD_ID) || 888 }],
};

// ─── Detect season from Shopify product tags ──────────────────────────────────
function detectSeason(tags) {
  if (!tags) return DEFAULT_SEASON;
  const tagList = tags.split(',').map(t => t.trim());
  for (const tag of tagList) {
    if (SEASON_MAP[tag] !== undefined) return SEASON_MAP[tag];
  }
  return DEFAULT_SEASON;
}

// ─── Shopify helpers ──────────────────────────────────────────────────────────
const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE}/admin/api/2024-01`,
  headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
});

async function fetchAllShopifyProducts() {
  let products = [];
  let url = '/products.json?limit=250&status=active';
  let useFullUrl = false;
  console.log('📥  Fetching products from Shopify...');
  while (url) {
    // After first page, Shopify returns full URLs in Link header — use axios directly
    const res = useFullUrl
      ? await axios.get(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } })
      : await shopify.get(url);
    products = products.concat(res.data.products || []);
    process.stdout.write(`\r   ${products.length} products fetched...`);
    const nextMatch = (res.headers['link'] || '').match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      url = nextMatch[1]; // use the full URL as-is
      useFullUrl = true;
    } else {
      url = null;
    }
  }
  console.log(`\n   ✓ Total: ${products.length} products\n`);
  return products;
}

// ─── BUYMA sync ───────────────────────────────────────────────────────────────
async function syncProductToBUYMA(shopifyProduct) {
  const categoryOverrides = CATEGORY_MAP[shopifyProduct.product_type] || {};
  const brandId = BRAND_MAP[shopifyProduct.vendor] !== undefined ? BRAND_MAP[shopifyProduct.vendor] : 0;
  const season  = detectSeason(shopifyProduct.tags);

  const overrides = {
    ...DEFAULT_OVERRIDES,
    ...categoryOverrides,
    brand_id: brandId,
    season,
    ...(brandId === 0 ? { brand_name: shopifyProduct.vendor } : {}),
  };

  if (DRY_RUN) {
    const brandStatus = brandId > 0 ? `✓ ${brandId}` : `⚠ NOT FOUND — will use brand_name`;
    const catId       = categoryOverrides.category_id || 0;
    const catStatus   = catId > 0 ? `✓ ${catId}` : `⚠ NOT MAPPED — add to CATEGORY_MAP`;
    console.log(`  "${shopifyProduct.title}"`);
    console.log(`     Vendor:  ${shopifyProduct.vendor} → brand_id: ${brandStatus}`);
    console.log(`     Type:    "${shopifyProduct.product_type || '(none)'}" → category_id: ${catStatus}`);
    console.log(`     Season:  ${season === 0 ? 'not specified' : season}`);
    console.log(`     Images:  ${shopifyProduct.images?.length || 0}`);
    return { dryRun: true };
  }

  const res = await axios.post(`${BUYMA_SERVER}/sync/shopify-product`, {
    shopify_product: shopifyProduct,
    buyma_overrides: overrides,
  }, { headers: { 'Content-Type': 'application/json' } });

  return res.data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🛍️  Siebentaschen × BUYMA Product Sync');
  console.log('═'.repeat(50));
  console.log(`   Mode:   ${DRY_RUN ? 'DRY RUN — no changes will be made' : 'LIVE sync to BUYMA'}`);
  console.log(`   Server: ${BUYMA_SERVER}`);
  console.log(`   Store:  ${SHOPIFY_STORE}\n`);

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    console.error('❌  Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env');
    process.exit(1);
  }

  let products;
  try {
    products = await fetchAllShopifyProducts();
  } catch (err) {
    console.error('❌  Shopify fetch failed:', err.response?.data || err.message);
    process.exit(1);
  }

  let success = 0, failed = 0, skipped = 0;
  const errors = [], unmappedTypes = new Set(), unmappedBrands = new Set();

  for (let i = 0; i < products.length; i++) {
    const p   = products[i];
    const num = `[${i + 1}/${products.length}]`;

    if (!p.images || p.images.length === 0) {
      console.log(`${num} ⚠ SKIP (no images): "${p.title}"`);
      skipped++; continue;
    }

    if (!CATEGORY_MAP[p.product_type]) unmappedTypes.add(p.product_type || '(empty)');
    if (BRAND_MAP[p.vendor] === undefined) unmappedBrands.add(p.vendor);

    try {
      const result = await syncProductToBUYMA(p);
      if (!result.dryRun) console.log(`${num} ✓  "${p.title}" → UID: ${result.buyma_response?.request_uid || 'ok'}`);
      success++;
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data || err.message;
      console.log(`${num} ✗  FAILED: "${p.title}" — ${JSON.stringify(detail)}`);
      errors.push({ product: p.title, id: p.id, error: detail });
      failed++;
    }

    if (i < products.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`   ✓ Success: ${success}  ✗ Failed: ${failed}  ⚠ Skipped: ${skipped}`);

  if (unmappedTypes.size) {
    console.log('\n⚠️  Unmapped product types (add to CATEGORY_MAP):');
    unmappedTypes.forEach(t => console.log(`   • "${t}"`));
  }
  if (unmappedBrands.size) {
    console.log('\n⚠️  Unmapped vendors (add to BRAND_MAP):');
    unmappedBrands.forEach(b => console.log(`   • "${b}"`));
  }
  if (errors.length) {
    console.log('\n✗  Failed:');
    errors.forEach(e => console.log(`   • ${e.product}`));
  }
  if (!DRY_RUN) {
    console.log('\n✅  Products saved as DRAFT on BUYMA.');
    console.log('   Review at: https://www.buyma.com/my/items/');
  }
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
