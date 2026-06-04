/**
 * Quick Shopify pagination test
 * Run: node test-shopify.js
 */

const https = require('https');
require('dotenv').config();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

function get(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: JSON.parse(data),
        });
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Store:', STORE);
  console.log('Token:', TOKEN ? TOKEN.slice(0, 10) + '...' : 'MISSING');

  // Try different API versions
  const versions = ['2025-01', '2025-04', '2024-10', '2024-07'];

  for (const v of versions) {
    const url = `https://${STORE}/admin/api/${v}/products.json?limit=3&status=active`;
    console.log(`\nTrying API version ${v}...`);
    try {
      const res = await get(url);
      console.log(`  Status: ${res.status}`);
      console.log(`  Products returned: ${res.body.products?.length ?? 'error'}`);
      console.log(`  Link header: ${res.headers['link']?.slice(0, 150) || 'none'}`);

      if (res.body.products?.length > 0 && res.headers['link']) {
        // Try fetching page 2 with the link URL
        const nextMatch = res.headers['link'].match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          const nextUrl = nextMatch[1];
          console.log(`  Fetching page 2: ${nextUrl.slice(0, 150)}`);
          const res2 = await get(nextUrl);
          console.log(`  Page 2 status: ${res2.status}`);
          console.log(`  Page 2 products: ${res2.body.products?.length ?? JSON.stringify(res2.body)}`);
          console.log(`\n✅  API version ${v} works with pagination!`);
          return v;
        }
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
