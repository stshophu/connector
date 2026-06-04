const https = require('https');
const axios = require('axios');
require('dotenv').config();

const SHOPIFY_STORE  = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;
const BUYMA_SERVER   = process.env.BUYMA_SERVER_URL || 'http://localhost:4000';
const DELAY_MS       = 600;
const DRY_RUN        = process.argv.includes('--dry-run');

function shopifyGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ data: JSON.parse(data), headers: res.headers }));
    }).on('error', reject);
  });
}

async function fetchAllShopifyProducts() {
  let products = [];
  let url = `https://${SHOPIFY_STORE}/admin/api/2025-01/products.json?limit=250&status=active`;
  console.log('📥  Fetching products from Shopify...');
  while (url) {
    const res = await shopifyGet(url);
    if (res.data.errors) throw res.data;
    products = products.concat(res.data.products || []);
    process.stdout.write(`\r   ${products.length} products fetched...`);
    const m = (res.headers['link'] || '').match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  console.log(`\n   ✓ Total: ${products.length} products\n`);
  return products;
}

async function main() {
  console.log('\n🛍️  Siebentaschen × BUYMA Product Sync');
  console.log('══════════════════════════════════════════════════');
  console.log(`   Mode:   ${DRY_RUN ? 'DRY RUN — no changes will be made' : 'LIVE sync to BUYMA'}`);
  console.log(`   Store:  ${SHOPIFY_STORE}\n`);

  const products = await fetchAllShopifyProducts();
  console.log(`✓ Successfully fetched ${products.length} products`);
  console.log(`\nFirst product: "${products[0]?.title}" — vendor: "${products[0]?.vendor}" — type: "${products[0]?.product_type}"`);
  console.log(`Last product:  "${products[products.length-1]?.title}"`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
