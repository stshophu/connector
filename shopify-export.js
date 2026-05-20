/**
 * Shopify → BUYMA Product Exporter
 * For Siebentaschen (siebentaschen.com)
 *
 * Fetches all products from your Shopify store and syncs them
 * to BUYMA one by one via your integration server.
 *
 * Run: node shopify-export.js
 * Or to do a dry run (no actual BUYMA sync): node shopify-export.js --dry-run
 */

const axios = require('axios');
require('dotenv').config();

// ─── Config ──────────────────────────────────────────────────────────────────

const SHOPIFY_STORE   = process.env.SHOPIFY_STORE;    // e.g. siebentaschen.myshopify.com
const SHOPIFY_TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN; // Admin API access token
const BUYMA_SERVER    = process.env.BUYMA_SERVER_URL || 'http://localhost:4000';
const DELAY_MS        = 600; // pause between products (be polite to both APIs)
const DRY_RUN         = process.argv.includes('--dry-run');

// ─── BUYMA overrides — customize these per brand/category ────────────────────
// These are the IDs BUYMA uses that Shopify doesn't have.
// You'll need to look them up in the CSV files from BUYMA Partners downloads.
//
// For now, set sensible defaults for Siebentaschen's main categories.
// You can override per-product in the PRODUCT_OVERRIDES map below.

const DEFAULT_OVERRIDES = {
  buying_area_id:   '2003004001', // Germany
  shipping_area_id: '2003004001', // Germany
  duty:             'included',
  control:          'draft',      // Always start as draft — review before publishing
  shipping_methods: [{ shipping_method_id: parseInt(process.env.BUYMA_SHIPPING_METHOD_ID) || 888 }],

  // Set your most common brand/category here, then override per-product below
  brand_id:    0,   // ← replace with your brand ID from brands.csv
  category_id: 0,   // ← replace with your category ID from categories.csv
};

// ─── Per-product overrides ────────────────────────────────────────────────────
// Map Shopify product type → BUYMA brand_id + category_id
// Find the right IDs in the CSV files from BUYMA Partners → Downloads
//
// Example:
//   'Handbags': { brand_id: 203, category_id: 3064 }
//
const CATEGORY_MAP = {
  // 'Shopify product type': { brand_id: X, category_id: Y }
  // Fill these in from your BUYMA category/brand CSV files:
  'Bags':        { category_id: 0 },
  'Shoes':       { category_id: 0 },
  'Clothing':    { category_id: 0 },
  'Accessories': { category_id: 0 },
  'Sunglasses':  { category_id: 0 },
};

// Map Shopify vendor → BUYMA brand_id
// Look up your brand IDs in brands.csv from BUYMA Partners
const BRAND_MAP = {
  // 'Vendor Name': brand_id (number)
  'Dolce & Gabbana':    0, // ← replace with real ID
  'Christian Louboutin':0,
  'Bottega Veneta':     0,
  'Jacquemus':          0,
  'Alexander Wang':     0,
  'Tom Ford':           0,
  'Herno':              0,
};

// ─── Shopify API helpers ──────────────────────────────────────────────────────

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE}/admin/api/2024-01`,
  headers: {
    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    'Content-Type': 'application/json',
  },
});

/**
 * Fetch all products from Shopify (handles pagination automatically).
 * Returns an array of all product objects.
 */
async function fetchAllShopifyProducts() {
  let products = [];
  let url = '/products.json?limit=250&status=active';

  console.log('📥  Fetching products from Shopify...');

  while (url) {
    const res = await shopify.get(url);
    products = products.concat(res.data.products || []);
    process.stdout.write(`\r   ${products.length} products fetched...`);

    // Shopify uses Link header for pagination
    const linkHeader = res.headers['link'] || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      // Extract just the path+query from the full URL
      const nextUrl = new URL(nextMatch[1]);
      url = nextUrl.pathname + nextUrl.search;
    } else {
      url = null;
    }
  }

  console.log(`\n   ✓ Total: ${products.length} products\n`);
  return products;
}

/**
 * Fetch products filtered by a specific collection (optional).
 * Use this if you only want to sync products from a particular collection.
 *
 * Example: fetchProductsByCollection('luxury-bags')
 */
async function fetchProductsByCollection(collectionHandle) {
  // First find the collection ID
  const colRes = await shopify.get(`/custom_collections.json?handle=${collectionHandle}`);
  const collections = colRes.data.custom_collections || [];
  if (!collections.length) {
    throw new Error(`Collection "${collectionHandle}" not found.`);
  }
  const collectionId = collections[0].id;

  // Then fetch products in that collection
  let products = [];
  let url = `/products.json?collection_id=${collectionId}&limit=250&status=active`;

  while (url) {
    const res = await shopify.get(url);
    products = products.concat(res.data.products || []);
    const linkHeader = res.headers['link'] || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? new URL(nextMatch[1]).pathname + new URL(nextMatch[1]).search : null;
  }

  return products;
}

// ─── BUYMA sync ───────────────────────────────────────────────────────────────

async function syncProductToBUYMA(shopifyProduct) {
  // Build overrides by merging defaults + category map + brand map
  const categoryOverrides = CATEGORY_MAP[shopifyProduct.product_type] || {};
  const brandId = BRAND_MAP[shopifyProduct.vendor] || DEFAULT_OVERRIDES.brand_id;

  const overrides = {
    ...DEFAULT_OVERRIDES,
    ...categoryOverrides,
    brand_id: brandId,
    // If brand not in BRAND_MAP, use vendor name as brand_name with brand_id: 0
    ...(brandId === 0 ? { brand_name: shopifyProduct.vendor } : {}),
  };

  const payload = {
    shopify_product: shopifyProduct,
    buyma_overrides: overrides,
  };

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would sync: "${shopifyProduct.title}" (ID: ${shopifyProduct.id})`);
    console.log(`            Brand: ${shopifyProduct.vendor} → brand_id: ${overrides.brand_id}`);
    console.log(`            Category: ${shopifyProduct.product_type} → category_id: ${overrides.category_id}`);
    return { dryRun: true };
  }

  const res = await axios.post(`${BUYMA_SERVER}/sync/shopify-product`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  return res.data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🛍️  Siebentaschen × BUYMA Product Sync');
  console.log('═'.repeat(45));
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE sync'}`);
  console.log(`   BUYMA Server: ${BUYMA_SERVER}`);
  console.log(`   Shopify Store: ${SHOPIFY_STORE}`);
  console.log('');

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    console.error('❌  Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in your .env file.');
    console.error('   See the Setup section in README.md for instructions.');
    process.exit(1);
  }

  let products;
  try {
    products = await fetchAllShopifyProducts();
  } catch (err) {
    console.error('❌  Failed to fetch from Shopify:', err.response?.data || err.message);
    process.exit(1);
  }

  // ── Sync loop ──
  let success = 0, failed = 0, skipped = 0;
  const errors = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const num = `[${i + 1}/${products.length}]`;

    // Skip products with no images (can't list on BUYMA without an image)
    if (!p.images || p.images.length === 0) {
      console.log(`${num} ⚠  SKIP (no images): "${p.title}"`);
      skipped++;
      continue;
    }

    // Skip products with no active variants
    const activeVariants = (p.variants || []).filter(v => v.inventory_quantity > 0 || true);
    if (!activeVariants.length) {
      console.log(`${num} ⚠  SKIP (no variants): "${p.title}"`);
      skipped++;
      continue;
    }

    try {
      const result = await syncProductToBUYMA(p);
      if (!result.dryRun) {
        console.log(`${num} ✓  "${p.title}" → UID: ${result.buyma_response?.request_uid || 'accepted'}`);
      }
      success++;
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data || err.message;
      console.log(`${num} ✗  FAILED: "${p.title}"`);
      console.log(`       ${JSON.stringify(detail)}`);
      errors.push({ product: p.title, id: p.id, error: detail });
      failed++;
    }

    // Pause between requests to respect API rate limits
    if (i < products.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(45));
  console.log('📊  Sync Complete');
  console.log(`   ✓ Synced:  ${success}`);
  console.log(`   ✗ Failed:  ${failed}`);
  console.log(`   ⚠ Skipped: ${skipped}`);
  console.log(`   Total:     ${products.length}`);

  if (errors.length) {
    console.log('\n⚠️  Failed products:');
    errors.forEach(e => console.log(`   • ${e.product} (ID: ${e.id})`));
    console.log('\n   Fix the issues above, then re-run to retry only failed products.');
  }

  if (DRY_RUN) {
    console.log('\n💡  This was a dry run. To actually sync, run: node shopify-export.js');
  } else {
    console.log('\n✅  All synced products are saved as DRAFT on BUYMA.');
    console.log('   Review them at https://www.buyma.com/my/items/ before publishing.');
  }
}

main().catch(err => {
  console.error('\n❌  Unexpected error:', err.message);
  process.exit(1);
});
