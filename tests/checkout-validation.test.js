/**
 * Checkout validation tests.
 *
 * Targets the pure helpers used by both /api/checkout (Express) and the
 * Netlify create-checkout function. These exercise the server-side price
 * lookup that prevents client-side price tampering — no Stripe key,
 * no network, no environment setup required.
 *
 * Run: npm test (or: node --test tests/checkout-validation.test.js)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  findProduct,
  resolveLinePrice,
  buildLineItems,
} = require('../utils/checkout-validation');

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8')
);

// Pick a representative product from each bucket so the tests stay accurate
// even if products.json is reordered.
const standardProduct = (products.standard || []).find(
  (p) => p && p.pricing && Object.keys(p.pricing).length > 0
);
const panoramaProduct = (products.panoramas || []).find(
  (p) => p && p.pricing && Object.keys(p.pricing).length > 0
);
const aerialProduct = (products.aerial || []).find(
  (p) => p && p.pricing && Object.keys(p.pricing).length > 0
);

function firstMaterialAndSize(product) {
  const material = Object.keys(product.pricing)[0];
  const size = Object.keys(product.pricing[material])[0];
  return { material, size, price: product.pricing[material][size] };
}

test('findProduct: finds products across all three category buckets', () => {
  assert.ok(standardProduct, 'fixture: products.standard has no usable product');
  assert.ok(panoramaProduct, 'fixture: products.panoramas has no usable product');
  assert.ok(aerialProduct, 'fixture: products.aerial has no usable product');

  assert.equal(findProduct(products, standardProduct.id)?.id, standardProduct.id);
  assert.equal(findProduct(products, panoramaProduct.id)?.id, panoramaProduct.id);
  assert.equal(findProduct(products, aerialProduct.id)?.id, aerialProduct.id);
});

test('findProduct: returns null for unknown IDs and bad input', () => {
  assert.equal(findProduct(products, 'this-id-does-not-exist'), null);
  assert.equal(findProduct(products, ''), null);
  assert.equal(findProduct(products, null), null);
  assert.equal(findProduct(null, 'anything'), null);
});

test('resolveLinePrice: returns the configured price for a valid combo', () => {
  const { material, size, price } = firstMaterialAndSize(standardProduct);
  const result = resolveLinePrice(standardProduct, material, size);
  assert.equal(result.error, undefined);
  assert.equal(result.price, price);
});

test('resolveLinePrice: rejects an invalid material', () => {
  const { size } = firstMaterialAndSize(standardProduct);
  const result = resolveLinePrice(standardProduct, 'Holographic Vinyl', size);
  assert.equal(result.error, 'invalid_material');
});

test('resolveLinePrice: rejects an invalid size for a valid material', () => {
  const { material } = firstMaterialAndSize(standardProduct);
  const result = resolveLinePrice(standardProduct, material, '999x999');
  assert.equal(result.error, 'invalid_size');
});

test('buildLineItems: builds a Stripe line item from a valid cart', () => {
  const { material, size, price } = firstMaterialAndSize(standardProduct);
  const result = buildLineItems(products, [
    { id: standardProduct.id, material, size, quantity: 2, title: standardProduct.title },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.lineItems.length, 1);

  const line = result.lineItems[0];
  assert.equal(line.quantity, 2);
  assert.equal(line.price_data.currency, 'usd');
  assert.equal(line.price_data.unit_amount, Math.round(price * 100));
  assert.equal(line.price_data.product_data.metadata.productId, standardProduct.id);
  assert.equal(line.price_data.product_data.metadata.size, size);
  assert.equal(line.price_data.product_data.metadata.material, material);
});

test('buildLineItems: server-side price overrides any client-supplied price', () => {
  const { material, size, price } = firstMaterialAndSize(standardProduct);
  const tamperedCart = [
    {
      id: standardProduct.id,
      material,
      size,
      quantity: 1,
      price: 0.01,
      unit_amount: 1,
      amount: 1,
    },
  ];
  const result = buildLineItems(products, tamperedCart);
  assert.equal(result.ok, true);
  assert.equal(
    result.lineItems[0].price_data.unit_amount,
    Math.round(price * 100),
    'client-supplied price must be ignored'
  );
});

test('buildLineItems: rejects empty / missing cart', () => {
  for (const bad of [undefined, null, [], 'not an array', {}]) {
    const result = buildLineItems(products, bad);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
});

test('buildLineItems: rejects unknown product id', () => {
  const result = buildLineItems(products, [
    { id: 'ghost-product', material: 'Lustre Paper', size: '12x18', quantity: 1 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /Product not found/);
});

test('buildLineItems: rejects invalid material', () => {
  const { size } = firstMaterialAndSize(standardProduct);
  const result = buildLineItems(products, [
    { id: standardProduct.id, material: 'Velvet', size, quantity: 1 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /Invalid material/);
});

test('buildLineItems: rejects invalid size', () => {
  const { material } = firstMaterialAndSize(standardProduct);
  const result = buildLineItems(products, [
    { id: standardProduct.id, material, size: '1x1', quantity: 1 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /Invalid size/);
});

test('buildLineItems: rejects non-positive quantity', () => {
  const { material, size } = firstMaterialAndSize(standardProduct);
  for (const badQty of [0, -1, 'foo', null]) {
    const result = buildLineItems(products, [
      { id: standardProduct.id, material, size, quantity: badQty },
    ]);
    assert.equal(result.ok, false, `quantity=${badQty} should be rejected`);
    assert.equal(result.status, 400);
  }
});

test('buildLineItems: handles a mixed multi-item cart', () => {
  const a = firstMaterialAndSize(standardProduct);
  const b = firstMaterialAndSize(panoramaProduct);
  const result = buildLineItems(products, [
    { id: standardProduct.id, material: a.material, size: a.size, quantity: 1 },
    { id: panoramaProduct.id, material: b.material, size: b.size, quantity: 3 },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.lineItems.length, 2);
  assert.equal(result.lineItems[0].quantity, 1);
  assert.equal(result.lineItems[1].quantity, 3);
  assert.equal(result.lineItems[0].price_data.unit_amount, Math.round(a.price * 100));
  assert.equal(result.lineItems[1].price_data.unit_amount, Math.round(b.price * 100));
});
