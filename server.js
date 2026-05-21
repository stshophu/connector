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

  const colorSet = new Set();
  const sizeSet  = new Set();
  (sp.variants || []).forEach(v => {
    if (v.option1) colorSet.add(v.option1);
    if (v.option2) sizeSet.add(v.option2);
  });

  const options = [];
  let pos = 1;
  sizeSet.forEach(s  => options.push({ type: 'size',  value: s, master_id: 0,  position: pos++ }));
  colorSet.forEach(c => options.push({ type: 'color', value: c, master_id: 99, position: pos++ }));

  const variants = (sp.variants || []).map(v => ({
    options: [
      v.option2 ? { type: 'size',  value: v.option2 } : null,
      v.option1 ? { type: 'color', value: v.option1 } : null,
    ].filter(Boolean),
    stock_type: v.inventory_quantity > 0 ? 'stock_in_hand' : 'purchase_for_order',
    stocks:     v.inventory_quantity > 0 ? v.inventory_quantity : null,
  }));

  const shopifyEur = parseFloat(sp.variants?.[0]?.price || 0);
  const categoryId = overrides.category_id || 0;
  const pricing    = calculatePricing(shopifyEur, categoryId);
  logPricing(sp.title, shopifyEur, pricing);

  // available_until: today + 89 days
  const d = new Date();
  d.setDate(d.getDate() + 89);
  const available = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

  return {
    reference_number: String(sp.id),
    control:          overrides.control || 'draft',
    name:             sp.title,
    comments:         sp.body_html ? sp.body_html.replace(/<[^>]+>/g, '').slice(0, 3000) : sp.title,
    brand_id:         overrides.brand_id   || 0,
    brand_name:       overrides.brand_name || (overrides.brand_id ? undefined : sp.vendor),
    category_id:      categoryId,
    price:            pricing.bmJpy,
    reference_price_type: 2,          // 2 = "with reference price" (shows discount)
    reference_price:  pricing.japanRrpJpy,
    available_until:  available,
    buying_area_id:   overrides.buying_area_id   || '2003018',
    shipping_area_id: overrides.shipping_area_id || '2003018',
    duty:             0,
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
    japan_retail_multiplier: JAPAN_RETAIL_MULTIPLIER,
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
  const { _pricing, ...productPayload } = buymaProduct; // strip internal field

  try {
    const data = await buymaPost('/api/v1/products.json', { product: productPayload });
    res.json({ success: true, buyma_response: data, pricing_summary: _pricing });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to sync.', detail: err.response?.data, pricing_summary: _pricing,
    });
  }
});

// ─── Shopify Webhook ──────────────────────────────────────────────────────────

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
    buying_area_id:   '2003018',
    shipping_area_id: '2003018',
    duty:             0,
    season:           0,
    shipping_methods: [{ shipping_method_id: parseInt(process.env.BUYMA_SHIPPING_METHOD_ID) || 888 }],
  };

  try {
    const buymaProduct          = mapShopifyToBuyma(sp, overrides);
    const { _pricing, ...payload } = buymaProduct;
    const result                = await buymaPost('/api/v1/products.json', { product: payload });
    console.log(`   ✓ Synced. UID: ${result.request_uid}  |  ¥${_pricing.bmJpy.toLocaleString()} (${_pricing.discountPct}% OFF ¥${_pricing.japanRrpJpy.toLocaleString()})`);
  } catch (err) {
    console.error('   ✗ Sync failed:', err.response?.data || err.message);
  }
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
