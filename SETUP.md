# BUYMA Integration — Full Setup Guide
## Siebentaschen × BUYMA Personal Shopper API

---

## Part 1 — Shopify Setup

### Step 1: Create a Shopify Admin API token

You need an API token so the export script can read your products.

1. Go to your Shopify Admin → **Settings** → **Apps and sales channels**
2. Click **Develop apps** (top right)
3. Click **Create an app** → name it "BUYMA Integration"
4. Go to the **Configuration** tab → click **Configure Admin API scopes**
5. Check these two boxes:
   - ✅ `read_products`
   - ✅ `read_inventory`
6. Click **Save**, then go to **API credentials** tab
7. Click **Install app**, then **Install**
8. Copy the **Admin API access token** (starts with `shpat_...`)
   ⚠️ You can only see this once — copy it now and paste it into your `.env` file

### Step 2: Add your Shopify credentials to .env

Open your `.env` file and fill in:

```
SHOPIFY_STORE=siebentaschen.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_your_token_here
```

### Step 3: Fill in BUYMA brand and category IDs

This is the most important manual step. Download the reference files from
[partners.buyma.com/downloads](https://partners.buyma.com/downloads) once you have Partners access:

| File | What to look up |
|---|---|
| `brands.csv` | Find your brand names (Dolce & Gabbana, Louboutin, etc.) → get their IDs |
| `categories.csv` | Find the right category for each product type (Bags, Shoes, etc.) → get IDs |
| `areas.csv` | Germany = `2003004001` (already set as default) |

Then open `shopify-export.js` and fill in the two maps at the top:

```javascript
// Map Shopify vendor name → BUYMA brand ID
const BRAND_MAP = {
  'Dolce & Gabbana':     123,  // ← look up in brands.csv
  'Christian Louboutin': 456,
  'Bottega Veneta':      789,
  // ... etc
};

// Map Shopify product type → BUYMA category ID
const CATEGORY_MAP = {
  'Bags':        { category_id: 3064 },  // ← look up in categories.csv
  'Shoes':       { category_id: 3100 },
  'Clothing':    { category_id: 3200 },
  // ... etc
};
```

### Step 4: Run a dry run first (no products are actually sent)

```bash
node shopify-export.js --dry-run
```

This shows you exactly what would be synced and which brand/category IDs would be used.
Check the output carefully before the real sync.

### Step 5: Do the real sync

```bash
node shopify-export.js
```

All products are created as **draft** on BUYMA. Review them at
[buyma.com/my/items](https://www.buyma.com/my/items/) before publishing any of them.

---

## Part 2 — Deploy to Railway (go online in ~5 minutes)

Railway is the easiest way to put your server online so BUYMA can reach it.
It has a free tier and takes less than 5 minutes to set up.

### Step 1: Put your code on GitHub

If you haven't already, create a free account at [github.com](https://github.com).

Then create a new repository:
1. Go to github.com → click **+** (top right) → **New repository**
2. Name it `buyma-integration` → click **Create repository**
3. Upload all your files (server.js, package.json, railway.toml, shopify-export.js)
   - Click **uploading an existing file** on the repository page
   - Drag all files in (don't upload .env — that has your secrets)
4. Click **Commit changes**

### Step 2: Deploy on Railway

1. Go to [railway.app](https://railway.app) → **Sign up with GitHub** (free)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `buyma-integration` repository
4. Railway will detect it's a Node.js app and deploy automatically (takes ~1 minute)
5. Once deployed, click on your project → **Settings** tab → **Domains**
6. Click **Generate Domain** — you'll get a URL like `https://buyma-integration-production.up.railway.app`
   **Copy this URL** — this is your live server address

### Step 3: Add your environment variables to Railway

In Railway → your project → **Variables** tab, add each of these:

| Variable | Value |
|---|---|
| `BUYMA_CLIENT_ID` | your BUYMA client ID |
| `BUYMA_CLIENT_SECRET` | your BUYMA client secret |
| `BUYMA_REDIRECT_URI` | `https://YOUR-RAILWAY-URL/auth/callback` |
| `BUYMA_ENV` | `sandbox` (change to `production` when ready) |
| `BUYMA_ACCESS_TOKEN` | leave blank for now |
| `BUYMA_REFRESH_TOKEN` | leave blank for now |
| `BUYMA_SHIPPING_METHOD_ID` | your shipping method ID |
| `SHOPIFY_STORE` | `siebentaschen.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | your Shopify admin token |
| `BUYMA_SERVER_URL` | `https://YOUR-RAILWAY-URL` |
| `FRONTEND_URL` | `*` |

Railway will automatically redeploy after you save variables.

### Step 4: Update your BUYMA Partners callback URL

Go back to [partners.buyma.com/apps](https://partners.buyma.com/apps) → your app → edit the
**Callback Redirect URL** to match your Railway URL:

```
https://YOUR-RAILWAY-URL/auth/callback
```

### Step 5: Authorize BUYMA (OAuth)

Open this URL in your browser to connect your BUYMA seller account:

```
https://YOUR-RAILWAY-URL/auth/authorize
```

After authorizing, you'll see your `access_token` and `refresh_token` in the browser.
Copy them into Railway's Variables tab:
- `BUYMA_ACCESS_TOKEN` = the access_token value
- `BUYMA_REFRESH_TOKEN` = the refresh_token value

Railway will redeploy and your server is now fully connected.

### Step 6: Run the product sync

Now update your local `.env` to point to your live server:

```
BUYMA_SERVER_URL=https://YOUR-RAILWAY-URL
```

Then run the sync from your computer:

```bash
node shopify-export.js --dry-run   # check first
node shopify-export.js             # then sync for real
```

---

## FAQ

**Do I need to leave my computer on?**
No — once deployed to Railway, the server runs 24/7 in the cloud.

**What does "draft" mean on BUYMA?**
Draft products are saved but not visible to buyers. You can review and publish
them one by one in BUYMA's seller dashboard at buyma.com/my/items/.

**My brand isn't in brands.csv — what do I do?**
Set `brand_id: 0` and add the brand name as `brand_name` in the overrides.
BUYMA will list it under the custom brand name.

**The sync failed for some products — what do I do?**
Check the error output. Common causes:
- Missing required field (usually brand_id or category_id being 0)
- Invalid image URL (must be publicly accessible)
- Price is 0

Fix the BRAND_MAP / CATEGORY_MAP values and re-run — already-synced products
will update (not duplicate) because we use the Shopify product ID as reference_number.

**How do I sync new products added after the first sync?**
Just re-run `node shopify-export.js`. Products that already exist on BUYMA
will be updated; new ones will be created.

---

Questions? BUYMA support: buyer-support@buyma.com
