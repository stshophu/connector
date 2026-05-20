/**
 * BUYMA Personal Shopper API — Integration Server
 * For Siebentaschen (siebentaschen.com)
 *
 * Handles OAuth 2.0 authentication and all BUYMA API endpoints.
 * Run: node server.js
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));

// ─── Config ─────────────────────────────────────────────────────────────────

const BUYMA_BASE =
  process.env.BUYMA_ENV === 'production'
    ? 'https://personal-shopper-api.buyma.com'
    : 'https://sandbox.personal-shopper-api.buyma.com';

const CLIENT_ID     = process.env.BUYMA_CLIENT_ID;
const CLIENT_SECRET = process.env.BUYMA_CLIENT_SECRET;
const REDIRECT_URI  = process.env.BUYMA_REDIRECT_URI || 'http://localhost:4000/auth/callback';

// In production, store this in a database per seller. For simplicity, we keep
// it in memory here — it will reset if the server restarts.
let ACCESS_TOKEN  = process.env.BUYMA_ACCESS_TOKEN  || null;
let REFRESH_TOKEN = process.env.BUYMA_REFRESH_TOKEN || null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buymaHeaders() {
  return { 'X-Buyma-Personal-Shopper-Api-Access-Token': ACCESS_TOKEN };
}

async function buymaGet(path, params = {}) {
  const res = await axios.get(`${BUYMA_BASE}${path}`, {
    headers: buymaHeaders(),
    params,
  });
  return res.data;
}

async function buymaPost(path, body = {}) {
  const res = await axios.post(`${BUYMA_BASE}${path}`, body, {
    headers: buymaHeaders(),
  });
  return res.data;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

/**
 * Step 1: Generate the authorization URL and redirect the seller's browser to it.
 * GET /auth/authorize
 */
app.get('/auth/authorize', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  // In production: save `state` in a session/DB to verify later
  const url = new URL(`${BUYMA_BASE}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

/**
 * Step 3 & 4: BUYMA redirects back here with ?code=...&state=...
 * We exchange the code for an access token.
 * GET /auth/callback
 */
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No authorization code received.' });
  }

  try {
    const response = await axios.post(`${BUYMA_BASE}/oauth/token`, {
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'authorization_code',
      redirect_uri:  REDIRECT_URI,
    });

    ACCESS_TOKEN  = response.data.access_token;
    REFRESH_TOKEN = response.data.refresh_token;

    console.log('✅  BUYMA OAuth successful. Access token stored.');
    console.log('    Save these to your .env to persist across restarts:');
    console.log(`    BUYMA_ACCESS_TOKEN=${ACCESS_TOKEN}`);
    console.log(`    BUYMA_REFRESH_TOKEN=${REFRESH_TOKEN}`);

    res.json({
      success: true,
      message: 'Connected to BUYMA successfully!',
      access_token:  ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
    });
  } catch (err) {
    console.error('OAuth token exchange failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to obtain access token.', detail: err.response?.data });
  }
});

/**
 * Check connection status
 * GET /auth/status
 */
app.get('/auth/status', (req, res) => {
  res.json({ connected: !!ACCESS_TOKEN });
});

/**
 * Set token manually (if you already have one)
 * POST /auth/token  { access_token, refresh_token }
 */
app.post('/auth/token', (req, res) => {
  const { access_token, refresh_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'access_token is required' });
  ACCESS_TOKEN  = access_token;
  REFRESH_TOKEN = refresh_token || null;
  res.json({ success: true, message: 'Token saved.' });
});

/**
 * Revoke token
 * POST /auth/revoke
 */
app.post('/auth/revoke', async (req, res) => {
  try {
    await axios.post(
      `${BUYMA_BASE}/oauth/revoke`,
      { token: ACCESS_TOKEN },
      { headers: buymaHeaders() }
    );
    ACCESS_TOKEN  = null;
    REFRESH_TOKEN = null;
    res.json({ success: true, message: 'Disconnected from BUYMA.' });
  } catch (err) {
    res.status(500).json({ error: 'Revoke failed.', detail: err.response?.data });
  }
});

// ─── Products ────────────────────────────────────────────────────────────────

/**
 * Create or update a product on BUYMA.
 * POST /products
 *
 * Body: the full product object as per BUYMA spec.
 * See README.md for a full field reference.
 */
app.post('/products', async (req, res) => {
  try {
    const data = await buymaPost('/api/v1/products.json', { product: req.body });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to create/update product.',
      detail: err.response?.data,
    });
  }
});

/**
 * Delete a product on BUYMA.
 * DELETE /products/:reference_number
 */
app.delete('/products/:reference_number', async (req, res) => {
  try {
    const data = await buymaPost('/api/v1/products.json', {
      product: {
        control: 'delete',
        reference_number: req.params.reference_number,
      },
    });
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to delete product.',
      detail: err.response?.data,
    });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────

/**
 * Get a list of orders.
 * GET /orders?status=open&ordered_at_min=2024-01-01
 *
 * Supported query params: status, ordered_at_min, ordered_at_max,
 * shipped_at_min, shipped_at_max, received_at_min, received_at_max,
 * page, per_page
 */
app.get('/orders', async (req, res) => {
  try {
    const data = await buymaGet('/api/v1/orders.json', req.query);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to fetch orders.',
      detail: err.response?.data,
    });
  }
});

/**
 * Get a single order by ID.
 * GET /orders/:order_id
 */
app.get('/orders/:order_id', async (req, res) => {
  try {
    const data = await buymaGet(`/api/v1/orders/${req.params.order_id}.json`);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Order not found.',
      detail: err.response?.data,
    });
  }
});

// ─── Shipments ───────────────────────────────────────────────────────────────

/**
 * Register shipment for an order.
 * POST /orders/:order_id/shipment
 *
 * Body: {
 *   shipping_method_id: 888,
 *   tracking_number: "XX123456789JP",
 *   message: "Thank you for your order!"
 * }
 */
app.post('/orders/:order_id/shipment', async (req, res) => {
  try {
    const data = await buymaPost(
      `/api/v1/orders/${req.params.order_id}/shipments.json`,
      { shipment: req.body }
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to register shipment.',
      detail: err.response?.data,
    });
  }
});

// ─── Shopify → BUYMA Product Sync ───────────────────────────────────────────

/**
 * A helper endpoint: POST a Shopify product (in Shopify's JSON format)
 * and this will transform + push it to BUYMA.
 *
 * POST /sync/shopify-product
 * Body: { shopify_product: {...}, buyma_overrides: { brand_id, category_id, buying_area_id, shipping_area_id, ... } }
 */
app.post('/sync/shopify-product', async (req, res) => {
  const { shopify_product: sp, buyma_overrides = {} } = req.body;

  if (!sp) return res.status(400).json({ error: 'shopify_product is required' });

  // Map Shopify product → BUYMA product format
  const images = (sp.images || []).slice(0, 20).map((img, i) => ({
    path: img.src,
    position: i + 1,
  }));

  // Build options (colors and sizes) from Shopify variants
  const colorSet = new Set();
  const sizeSet  = new Set();

  (sp.variants || []).forEach((v) => {
    if (v.option1) colorSet.add(v.option1);
    if (v.option2) sizeSet.add(v.option2);
  });

  const options = [];
  let pos = 1;
  sizeSet.forEach((s)  => options.push({ type: 'size',  value: s, master_id: 0, position: pos++ }));
  colorSet.forEach((c) => options.push({ type: 'color', value: c, master_id: 99, position: pos++ }));

  // Build variants
  const variants = (sp.variants || []).map((v) => ({
    options: [
      v.option2 ? { type: 'size',  value: v.option2 } : null,
      v.option1 ? { type: 'color', value: v.option1 } : null,
    ].filter(Boolean),
    stock_type: v.inventory_quantity > 0 ? 'stock_in_hand' : 'purchase_for_order',
    stocks: v.inventory_quantity > 0 ? v.inventory_quantity : null,
  }));

  // Price: Shopify stores prices as strings (e.g. "1250.00")
  const price = Math.round(parseFloat(sp.variants?.[0]?.price || 0));

  // Calculate available_until: today + 90 days (BUYMA maximum)
  const availableUntil = new Date();
  availableUntil.setDate(availableUntil.getDate() + 89);
  const dateStr = `${String(availableUntil.getMonth() + 1).padStart(2,'0')}/${String(availableUntil.getDate()).padStart(2,'0')}/${availableUntil.getFullYear()}`;

  const buymaProduct = {
    reference_number: String(sp.id),
    control: 'draft', // start as draft; change to 'publish' to go live
    name: sp.title,
    comments: sp.body_html
      ? sp.body_html.replace(/<[^>]+>/g, '').slice(0, 3000)
      : sp.title,
    brand_id:         buyma_overrides.brand_id        || 0,
    brand_name:       buyma_overrides.brand_name      || sp.vendor || undefined,
    category_id:      buyma_overrides.category_id     || 0,
    price,
    available_until:  dateStr,
    buying_area_id:   buyma_overrides.buying_area_id  || '2003018',   // Germany
    shipping_area_id: buyma_overrides.shipping_area_id|| '2003018',
    duty:             buyma_overrides.duty             || 0,
    images,
    options: options.length ? options : [
      { type: 'size', value: 'ONE SIZE', master_id: 0, position: 1 }
    ],
    shipping_methods: buyma_overrides.shipping_methods || [],
    variants: variants.length ? variants : [],
    ...buyma_overrides,
  };

  try {
    const data = await buymaPost('/api/v1/products.json', { product: buymaProduct });
    res.json({ success: true, buyma_response: data, buyma_product: buymaProduct });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: 'Failed to sync product to BUYMA.',
      detail: err.response?.data,
      buyma_product: buymaProduct,
    });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🛍️  BUYMA Integration Server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.BUYMA_ENV || 'sandbox'}`);
  console.log(`   Connected: ${!!ACCESS_TOKEN}\n`);
  console.log('   Endpoints:');
  console.log(`   GET  /auth/authorize       → Start OAuth flow`);
  console.log(`   GET  /auth/callback        → OAuth callback (auto)`);
  console.log(`   GET  /auth/status          → Check connection`);
  console.log(`   POST /products             → Create/update product`);
  console.log(`   DELETE /products/:ref      → Delete product`);
  console.log(`   GET  /orders               → List orders`);
  console.log(`   GET  /orders/:id           → Single order`);
  console.log(`   POST /orders/:id/shipment  → Register shipment`);
  console.log(`   POST /sync/shopify-product → Shopify → BUYMA sync\n`);
});
