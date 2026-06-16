#!/usr/bin/env python3
"""
BUYMA Category Mapping for Siebentaschen
Maps Shopify product_type + gender tag → BUYMA category_id

Usage: import this mapping into your buyma-integration service.
The get_buyma_category_id(product_type, gender) function is the main entry point.

gender: 'women' | 'men' | 'unisex' | None
  → unisex/None defaults to women's category where available

If no mapping is found, returns None and the integration should SKIP
the product and log a warning rather than sending a wrong category.
"""

# ──────────────────────────────────────────────
# CORE MAPPING TABLE
# Format: (shopify_product_type_lowercase, gender) → buyma_category_id
# gender: 'women' | 'men' | 'unisex'
# ──────────────────────────────────────────────

CATEGORY_MAP = {

    # ── TOPS ──────────────────────────────────
    ("t-shirt", "women"): 3001,
    ("t-shirt", "men"): 3260,
    ("t-shirt", "unisex"): 3260,
    ("polo shirt", "women"): 3008,
    ("polo shirt", "men"): 3261,
    ("blouse", "women"): 3007,
    ("shirt", "women"): 3007,
    ("shirt", "men"): 3263,
    ("shirt", "unisex"): 3263,
    ("knitwear", "women"): 3004,
    ("knitwear", "men"): 3266,
    ("knitwear", "unisex"): 3266,
    ("sweater", "women"): 3004,
    ("sweater", "men"): 3266,
    ("sweater", "unisex"): 3266,
    ("knit", "women"): 3004,
    ("knit", "men"): 3266,
    ("knit", "unisex"): 3266,
    ("hoodie", "women"): 3005,
    ("hoodie", "men"): 3264,
    ("hoodie", "unisex"): 3264,
    ("sweatshirt", "women"): 3006,
    ("sweatshirt", "men"): 3265,
    ("sweatshirt", "unisex"): 3265,
    ("cardigan", "women"): 3065,
    ("cardigan", "men"): 3309,
    ("cardigan", "unisex"): 3309,
    ("vest", "women"): 3009,
    ("vest", "men"): 4201,
    ("tank top", "women"): 3011,
    ("tank top", "men"): 3269,
    ("camisole", "women"): 4102,

    # ── BOTTOMS ──────────────────────────────
    ("skirt", "women"): 3020,
    ("mini skirt", "women"): 3021,
    ("trousers", "women"): 3022,
    ("trousers", "men"): 9809,
    ("pants", "women"): 3022,
    ("pants", "men"): 9809,
    ("jeans", "women"): 3024,
    ("jeans", "men"): 3281,
    ("jeans", "unisex"): 3281,
    ("denim", "women"): 3024,
    ("denim", "men"): 3281,
    ("shorts", "women"): 3023,
    ("shorts", "men"): 3282,
    ("shorts", "unisex"): 3282,
    ("leggings", "women"): 3167,
    ("tights", "women"): 3168,
    ("cargo pants", "men"): 9807,
    ("sweatpants", "men"): 9808,
    ("chinos", "men"): 9811,

    # ── DRESSES & JUMPSUITS ───────────────────
    ("dress", "women"): 3040,
    ("maxi dress", "women"): 3040,
    ("mini dress", "women"): 3040,
    ("jumpsuit", "women"): 3041,
    ("overall", "women"): 3041,
    ("set", "women"): 4103,
    ("co-ord", "women"): 4103,
    ("two-piece", "women"): 4103,

    # ── OUTERWEAR ────────────────────────────
    ("coat", "women"): 3060,
    ("coat", "men"): 3300,
    ("jacket", "women"): 3061,
    ("jacket", "men"): 3301,
    ("leather jacket", "women"): 4104,
    ("leather jacket", "men"): 3305,
    ("leather jacket", "unisex"): 3305,
    ("down jacket", "women"): 3062,
    ("down jacket", "men"): 3302,
    ("down jacket", "unisex"): 3302,
    ("blouson", "women"): 3063,
    ("blouson", "men"): 3303,
    ("trench coat", "women"): 4105,
    ("trench coat", "men"): 3308,
    ("trench coat", "unisex"): 3308,
    ("parka", "women"): 3060,
    ("parka", "men"): 9816,
    ("fur coat", "women"): 4106,
    ("bomber jacket", "men"): 9815,
    ("bomber jacket", "unisex"): 9815,
    ("denim jacket", "men"): 9821,
    ("denim jacket", "unisex"): 9821,
    ("fleece", "women"): 3257,
    ("fleece", "men"): 4236,
    ("down vest", "women"): 3067,
    ("down vest", "men"): 3311,
    ("blazer", "women"): 3061,
    ("blazer", "men"): 3312,
    ("suit", "women"): 3240,
    ("suit jacket", "men"): 3312,
    ("poncho", "women"): 3066,

    # ── SHOES ─────────────────────────────────
    ("sneakers", "women"): 3081,
    ("sneakers", "men"): 3321,
    ("sneakers", "unisex"): 3321,
    ("trainers", "women"): 3081,
    ("trainers", "men"): 3321,
    ("trainers", "unisex"): 3321,
    ("sandals", "women"): 3080,
    ("sandals", "men"): 3320,
    ("sandals", "unisex"): 3320,
    ("pumps", "women"): 3082,
    ("heels", "women"): 3082,
    ("loafers", "women"): 4109,
    ("loafers", "men"): 3322,
    ("loafers", "unisex"): 3322,
    ("oxford shoes", "men"): 3322,
    ("dress shoes", "men"): 3322,
    ("ballet flats", "women"): 4110,
    ("slip-ons", "women"): 4108,
    ("slip-ons", "men"): 3324,

    # ── BOOTS ─────────────────────────────────
    ("boots", "women"): 3087,
    ("boots", "men"): 3323,
    ("boots", "unisex"): 3323,
    ("long boots", "women"): 3084,
    ("ankle boots", "women"): 3085,
    ("chelsea boots", "women"): 3085,
    ("chelsea boots", "men"): 3323,
    ("chelsea boots", "unisex"): 3323,
    ("rain boots", "women"): 3086,
    ("rain boots", "men"): 3324,

    # ── BAGS ─────────────────────────────────
    ("tote bag", "women"): 3100,
    ("tote bag", "men"): 3342,
    ("tote bag", "unisex"): 3342,
    ("handbag", "women"): 3101,
    ("shoulder bag", "women"): 3105,
    ("shoulder bag", "men"): 3341,
    ("shoulder bag", "unisex"): 3341,
    ("clutch", "women"): 3104,
    ("clutch bag", "women"): 3104,
    ("backpack", "women"): 3107,
    ("backpack", "men"): 3344,
    ("backpack", "unisex"): 3344,
    ("boston bag", "women"): 3106,
    ("boston bag", "men"): 3343,
    ("crossbody bag", "women"): 3105,
    ("crossbody bag", "men"): 3341,
    ("mini bag", "women"): 3105,
    ("belt bag", "women"): 3108,
    ("belt bag", "men"): 3346,
    ("belt bag", "unisex"): 3346,
    ("messenger bag", "men"): 3341,
    ("business bag", "men"): 3345,
    ("party bag", "women"): 3255,

    # ── WALLETS & SMALL LEATHER ───────────────
    ("wallet", "women"): 3114,
    ("wallet", "men"): 3410,
    ("wallet", "unisex"): 3410,
    ("long wallet", "women"): 3169,
    ("long wallet", "men"): 3408,
    ("bifold wallet", "women"): 3111,
    ("bifold wallet", "men"): 3419,
    ("coin purse", "women"): 3112,
    ("coin purse", "men"): 3426,
    ("card holder", "women"): 3113,
    ("card holder", "men"): 3411,
    ("card holder", "unisex"): 3411,
    ("key case", "women"): 4114,
    ("key case", "men"): 3427,
    ("key ring", "women"): 3166,
    ("key ring", "men"): 3427,
    ("pouch", "women"): 3170,
    ("bag charm", "women"): 4115,

    # ── ACCESSORIES ──────────────────────────
    ("necklace", "women"): 3120,
    ("necklace", "men"): 3360,
    ("necklace", "unisex"): 3360,
    ("earrings", "women"): 3121,
    ("earrings", "men"): 4202,
    ("ring", "women"): 3122,
    ("ring", "men"): 3363,
    ("ring", "unisex"): 3363,
    ("bracelet", "women"): 3129,
    ("bracelet", "men"): 3362,
    ("bracelet", "unisex"): 3362,
    ("bangle", "women"): 3129,
    ("bangle", "men"): 9813,
    ("hair accessory", "women"): 3124,
    ("scarf", "women"): 3161,
    ("muffler", "women"): 3162,
    ("scarf", "men"): 3401,
    ("muffler", "men"): 3401,
    ("scarf", "unisex"): 3401,
    ("stole", "women"): 3162,
    ("stole", "men"): 4235,
    ("gloves", "women"): 3163,
    ("gloves", "men"): 3403,
    ("gloves", "unisex"): 3403,
    ("belt", "women"): 3164,
    ("belt", "men"): 3404,
    ("belt", "unisex"): 3404,
    ("hat", "women"): 4116,
    ("hat", "men"): 4117,
    ("cap", "women"): 4117,
    ("cap", "men"): 4117,
    ("cap", "unisex"): 4117,
    ("beanie", "women"): 4119,
    ("beanie", "men"): 4119,
    ("beanie", "unisex"): 4119,
    ("sunglasses", "women"): 3140,
    ("sunglasses", "men"): 3414,
    ("sunglasses", "unisex"): 3414,
    ("glasses", "women"): 3141,
    ("glasses", "men"): 3417,
    ("glasses", "unisex"): 3417,
    ("socks", "women"): 3168,
    ("socks", "men"): 4216,

    # ── WATCHES ──────────────────────────────
    ("watch", "women"): 3126,
    ("watch", "men"): 4204,
    ("watch", "unisex"): 4204,
    ("analog watch", "women"): 3126,
    ("analog watch", "men"): 4204,
    ("digital watch", "women"): 3127,
    ("digital watch", "men"): 4205,

    # ── JEWELRY (no gender split) ─────────────
    ("jewelry", "women"): 3125,
    ("jewelry", "men"): 3364,
    ("jewelry", "unisex"): 3364,

    # ── LINGERIE / UNDERWEAR ─────────────────
    ("underwear", "women"): 3200,
    ("underwear", "men"): 3421,
    ("bra", "women"): 3202,
    ("boxer shorts", "men"): 3423,
    ("briefs", "men"): 3422,
    ("swimwear", "women"): 4134,
    ("swimwear", "men"): 4233,
    ("swimwear", "unisex"): 4233,

    # ── FRAGRANCE / BEAUTY ───────────────────
    ("perfume", "women"): 2305,
    ("perfume", "men"): 2305,
    ("fragrance", "women"): 2305,
    ("fragrance", "men"): 2305,
    ("fragrance", "unisex"): 2305,
}


# ──────────────────────────────────────────────
# LOOKUP FUNCTION
# ──────────────────────────────────────────────

def get_buyma_category_id(product_type: str, gender: str = None) -> int | None:
    """
    Returns BUYMA category_id for a given Shopify product_type and gender.

    Args:
        product_type: Shopify product_type string (English, any case)
        gender: 'women' | 'men' | 'unisex' | None
                None and 'unisex' both try (type, 'unisex') first,
                then fall back to men's, then women's.

    Returns:
        int category_id, or None if no mapping exists.
        When None, the calling code should SKIP the product and log:
        f"No BUYMA category for product_type={product_type!r} gender={gender!r}"
    """
    key_type = product_type.strip().lower()

    if gender in ("women", "men"):
        result = CATEGORY_MAP.get((key_type, gender))
        if result:
            return result
        # Try unisex fallback
        return CATEGORY_MAP.get((key_type, "unisex"))

    # gender is None or 'unisex'
    result = CATEGORY_MAP.get((key_type, "unisex"))
    if result:
        return result
    # Try men's then women's as fallback
    result = CATEGORY_MAP.get((key_type, "men"))
    if result:
        return result
    return CATEGORY_MAP.get((key_type, "women"))


# ──────────────────────────────────────────────
# QUICK TEST
# ──────────────────────────────────────────────
if __name__ == "__main__":
    tests = [
        ("Shoulder Bag", "women"),
        ("Sneakers", "men"),
        ("Sneakers", "unisex"),
        ("Watch", None),
        ("Trench Coat", "women"),
        ("Wallet", "men"),
        ("Sunglasses", "unisex"),
        ("Unknown Thing", "women"),
        ("Jacket", "men"),
        ("Perfume", "unisex"),
    ]
    print(f"{'Product Type':<25} {'Gender':<10} {'BUYMA ID'}")
    print("-" * 50)
    for pt, g in tests:
        cat_id = get_buyma_category_id(pt, g)
        print(f"{pt:<25} {str(g):<10} {cat_id if cat_id else '❌ NO MAPPING'}")
