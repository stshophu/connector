# BUYMA Integration Server — Siebentaschen

Connect siebentaschen.com to BUYMA's Personal Shopper API to list luxury products and manage orders on Japan's largest personal shopping marketplace.

---

## What this does

| Feature | Description |
|---|---|
| 🔐 OAuth 2.0 | Securely connects your BUYMA seller account |
| 📦 Product Sync | Push products from Shopify → BUYMA (draft or published) |
| 🛒 Order Management | Read all BUYMA orders with full customer & shipping details |
| 🚚 Shipment Registration | Mark orders as shipped with tracking numbers |

---

## Before you start — what you need

1. **A BUYMA seller account** — sign up at [buyma.com](https://www.buyma.com)
2. **BUYMA Partners access** — email BUYMA support at [buyer-support@buyma.com](mailto:buyer-support@buyma.com) and request a Partners account
3. **A registered application** — once you have Partners access, create an app at [partners.buyma.com/apps](https://partners.buyma.com/apps) to get your `Client ID` and `Client Secret`

> **Tip:** Start in the **sandbox** environment (the default) to test without affecting your real BUYMA store. Switch to production only when everything works.

---

## Setup

### 1. Install dependencies

You need [Node.js](https://nodejs.org) (version 18 or higher) installed.

```bash
npm install
```

### 2. Configure your credentials

Copy the example environment file:

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
BUYMA_CLIENT_ID=your_client_id_from_partners
BUYMA_CLIENT_SECRET=your_client_secret_from_partners
BUYMA_REDIRECT_URI=http://localhost:4000/auth/callback
BUYMA_ENV=sandbox
```

### 3. Register your Callback URL in BUYMA Partners

In your BUYMA Partners app settings, set the **Callback Redirect URL** to:
```
http://localhost:4000/auth/callback
```

For production deployment, use your real server URL instead.

### 4. Start the server

```bash
npm start
```

You should see:
```
🛍️  BUYMA Integration Server running on http://localhost:4000
   Environment: sandbox
   Connected: false
```

### 5. Connect your BUYMA seller account (OAuth)

Open your browser and go to:
```
http://localhost:4000/auth/authorize
```

You'll be redirected to BUYMA to log in and authorize your app. After clicking "Install", you'll be redirected back and see your tokens. **Copy the `access_token` and `refresh_token` into your `.env` file** so you don't need to re-authorize every time the server restarts.

---

## API Reference

All endpoints run on `http://localhost:4000` (or your deployed URL).

### Authentication

| Method | Path | Description |
|---|---|---|
| GET | `/auth/authorize` | Start OAuth — opens BUYMA login |
| GET | `/auth/callback` | OAuth callback (auto-handled) |
| GET | `/auth/status` | Check if connected |
| POST | `/auth/token` | Set token manually |
| POST | `/auth/revoke` | Disconnect |

### Products

| Method | Path | Description |
|---|---|---|
| POST | `/products` | Create or update a product |
| DELETE | `/products/:reference_number` | Delete a product |

**Minimal product example:**
```json
POST /products
{
  "reference_number": "SIEBT-001",
  "control": "draft",
  "name": "Bottega Veneta Intrecciato Wallet",
  "comments": "Authentic Bottega Veneta wallet, purchased directly from the boutique in Milan.",
  "brand_id": 203,
  "category_id": 3064,
  "price": 85000,
  "available_until": "09/30/2025",
  "buying_area_id": "2003004001",
  "shipping_area_id": "2003004001",
  "duty": "included",
  "images": [
    { "path": "https://cdn.shopify.com/your-image.jpg", "position": 1 }
  ],
  "options": [
    { "type": "color", "value": "Dark Brown", "master_id": 99, "position": 1 },
    { "type": "size", "value": "ONE SIZE", "master_id": 0, "position": 1 }
  ],
  "shipping_methods": [{ "shipping_method_id": 888 }],
  "variants": [
    {
      "options": [{ "type": "color", "value": "Dark Brown" }, { "type": "size", "value": "ONE SIZE" }],
      "stock_type": "stock_in_hand",
      "stocks": 1
    }
  ]
}
```

**Control values:**
- `draft` — save as private draft
- `publish` — list publicly on BUYMA
- `suspend` — temporarily hide (once published, cannot go back to draft)
- `delete` — remove listing

### Orders

| Method | Path | Description |
|---|---|---|
| GET | `/orders` | List orders (filterable) |
| GET | `/orders/:id` | Get single order |

**Filter orders:**
```
GET /orders?status=new
GET /orders?status=open
GET /orders?ordered_at_min=2025-01-01&ordered_at_max=2025-12-31
```

**Order statuses:** `new`, `product_sent`, `canceled`, `product_received`, `waiting_on_payment`, `forcibly_canceled`

### Shipments

| Method | Path | Description |
|---|---|---|
| POST | `/orders/:id/shipment` | Register shipment tracking |

```json
POST /orders/771829/shipment
{
  "shipping_method_id": 888,
  "tracking_number": "RR123456789DE",
  "message": "Your order has been shipped from Germany. Thank you!"
}
```

### Shopify → BUYMA Sync

| Method | Path | Description |
|---|---|---|
| POST | `/sync/shopify-product` | Auto-convert and push a Shopify product to BUYMA |

```json
POST /sync/shopify-product
{
  "shopify_product": { ...your Shopify product JSON... },
  "buyma_overrides": {
    "brand_id": 203,
    "category_id": 3064,
    "buying_area_id": "2003004001",
    "shipping_area_id": "2003004001",
    "shipping_methods": [{ "shipping_method_id": 888 }],
    "control": "draft"
  }
}
```

---

## Getting BUYMA Master Data IDs

BUYMA uses numeric IDs for brands, categories, colors, sizes, and areas. Download the reference CSV files from [partners.buyma.com/downloads](https://partners.buyma.com/downloads):

| File | What it contains |
|---|---|
| `brands.csv` | Brand IDs (e.g. Bottega Veneta = 203) |
| `categories.csv` | Category IDs |
| `areas.csv` | Buying/shipping area IDs |
| `colors.csv` | Color master IDs |
| `sizes.csv` | Size master IDs (depend on category) |
| `shipping_methods.csv` | Your registered shipping method IDs |

**Germany area ID:** `2003004001` (used for both buying and shipping area)

---

## Deploying to production

To run this server online (not just on your local computer), you can deploy it for free or low cost on:

- **[Railway](https://railway.app)** — easiest, deploy from GitHub
- **[Render](https://render.com)** — also free tier available
- **[Heroku](https://heroku.com)** — classic option

After deploying, update your `.env` values and your BUYMA Partners callback URL to use your live server address (e.g. `https://your-app.railway.app/auth/callback`).

---

## Questions?

BUYMA support: [buyer-support@buyma.com](mailto:buyer-support@buyma.com)
