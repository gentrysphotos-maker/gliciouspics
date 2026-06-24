/**
 * Pure, dependency-free helpers used by the checkout endpoint (and tests).
 *
 * The Stripe API call lives in the HTTP handler; everything here just turns
 * a (productsDatabase, cart) pair into either a validated set of Stripe
 * line_items or a structured error. That makes the price-validation logic
 * unit-testable without needing real Stripe keys.
 */

const PRODUCT_CATEGORIES = ['standard', 'panoramas', 'aerial'];

/**
 * Look up a product by id across every category bucket in products.json.
 * Returns the product object or null.
 */
function findProduct(productsDatabase, productId) {
  if (!productsDatabase || !productId) return null;
  for (const cat of PRODUCT_CATEGORIES) {
    const bucket = productsDatabase[cat];
    if (!Array.isArray(bucket)) continue;
    const match = bucket.find((p) => p && p.id === productId);
    if (match) return match;
  }
  return null;
}

/**
 * Resolve the authoritative price (in dollars) for a given product +
 * (material, size) combo. Returns a number when valid, otherwise an
 * object describing the failure. Does NOT trust any price the client
 * sends — only reads from products.json.
 */
function resolveLinePrice(product, material, size) {
  if (!product) {
    return { error: 'product_not_found' };
  }
  if (!product.pricing || typeof product.pricing !== 'object') {
    return { error: 'pricing_missing', productId: product.id };
  }
  const materialPricing = product.pricing[material];
  if (!materialPricing) {
    return { error: 'invalid_material', productId: product.id, material };
  }
  const price = materialPricing[size];
  if (price === undefined || price === null) {
    return { error: 'invalid_size', productId: product.id, material, size };
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return { error: 'invalid_price_value', productId: product.id, material, size, price };
  }
  return { price };
}

/**
 * Build the Stripe Checkout line_items array from a cart, validating every
 * item against products.json. Returns:
 *   - { ok: true, lineItems }              on success
 *   - { ok: false, status, error, detail } on validation failure
 *
 * `status` is the HTTP status the handler should use (400 for bad input,
 * 500 for server-side data issues).
 */
function buildLineItems(productsDatabase, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, error: 'Cart is empty or invalid.' };
  }

  const lineItems = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, status: 400, error: 'Invalid cart item.' };
    }

    const quantity = parseInt(item.quantity, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return {
        ok: false,
        status: 400,
        error: `Invalid quantity for ${item.title || item.id || 'item'}.`,
      };
    }

    const product = findProduct(productsDatabase, item.id);
    if (!product) {
      return {
        ok: false,
        status: 400,
        error: `Product not found: ${item.title || item.id}`,
        detail: { id: item.id },
      };
    }

    const result = resolveLinePrice(product, item.material, item.size);
    if (result.error) {
      const messages = {
        pricing_missing: `Pricing data missing for ${product.title}`,
        invalid_material: `Invalid material: ${item.material} for ${product.title}`,
        invalid_size: `Invalid size: ${item.size} for material ${item.material} of ${product.title}`,
        invalid_price_value: `Invalid price configured for ${product.title}`,
      };
      return {
        ok: false,
        status: result.error === 'pricing_missing' || result.error === 'invalid_price_value' ? 500 : 400,
        error: messages[result.error] || 'Invalid cart item.',
        detail: result,
      };
    }

    const unitAmountInCents = Math.round(result.price * 100);

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${product.title} (${item.size} / ${item.material})`,
          images: product.images && product.images.hero ? [product.images.hero] : [],
          description: product.description || '',
          metadata: {
            productId: product.id,
            size: item.size,
            material: item.material,
          },
        },
        unit_amount: unitAmountInCents,
      },
      quantity,
    });
  }

  return { ok: true, lineItems };
}

module.exports = {
  PRODUCT_CATEGORIES,
  findProduct,
  resolveLinePrice,
  buildLineItems,
};
