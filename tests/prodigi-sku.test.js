/**
 * Prodigi SKU mapping tests.
 *
 * The webhook and Prodigi handlers turn (material, size) into a Prodigi
 * SKU like GLOBAL-MET-16X24. If this mapping silently changes, real orders
 * get submitted with the wrong product, so these are guardrail tests.
 *
 * Run: npm test (or: node --test tests/prodigi-sku.test.js)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { getProdigiSku } = require('../utils/prodigi-sku');

test('metal materials map to GLOBAL-MET', () => {
  assert.equal(getProdigiSku('Chromaluxe Metal', '12x18'), 'GLOBAL-MET-12X18');
  assert.equal(getProdigiSku('chromaluxe metal', '12x18'), 'GLOBAL-MET-12X18');
  assert.equal(getProdigiSku('Metal', '16x24'), 'GLOBAL-MET-16X24');
});

test('lustre / paper materials map to GLOBAL-PAP', () => {
  assert.equal(getProdigiSku('Lustre Paper', '12x18'), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('lustre', '8x10'), 'GLOBAL-PAP-8X10');
  assert.equal(getProdigiSku('Photo Paper', '12x18'), 'GLOBAL-PAP-12X18');
});

test('matte materials map to GLOBAL-FAP', () => {
  assert.equal(getProdigiSku('Matte', '12x18'), 'GLOBAL-FAP-12X18');
  assert.equal(getProdigiSku('Matte Fine Art', '16x24'), 'GLOBAL-FAP-16X24');
});

test('size formatting: uppercases the X and strips whitespace', () => {
  assert.equal(getProdigiSku('Lustre Paper', '12x18'), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('Lustre Paper', '12X18'), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('Lustre Paper', '12 x 18'), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('Lustre Paper', '  12x18  '), 'GLOBAL-PAP-12X18');
});

test('panorama sizes (e.g. 8x24, 12x36) round-trip correctly', () => {
  assert.equal(getProdigiSku('Lustre Paper', '8x24'), 'GLOBAL-PAP-8X24');
  assert.equal(getProdigiSku('Chromaluxe Metal', '12x36'), 'GLOBAL-MET-12X36');
});

test('missing size defaults to 12X18 (matches webhook fallback behavior)', () => {
  assert.equal(getProdigiSku('Lustre Paper', undefined), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('Lustre Paper', null), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('Lustre Paper', ''), 'GLOBAL-PAP-12X18');
});

test('missing material defaults to GLOBAL-PAP', () => {
  assert.equal(getProdigiSku(undefined, '12x18'), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku(null, '12x18'), 'GLOBAL-PAP-12X18');
  assert.equal(getProdigiSku('', '12x18'), 'GLOBAL-PAP-12X18');
});

test('unknown material falls back to GLOBAL-PAP rather than throwing', () => {
  assert.equal(getProdigiSku('Holographic Vinyl', '12x18'), 'GLOBAL-PAP-12X18');
});

test('every (material, size) combo in products.json produces a non-empty SKU', () => {
  const products = require('../products.json');
  const all = [
    ...(products.standard || []),
    ...(products.panoramas || []),
    ...(products.aerial || []),
  ];
  for (const product of all) {
    for (const [material, sizes] of Object.entries(product.pricing || {})) {
      for (const size of Object.keys(sizes)) {
        const sku = getProdigiSku(material, size);
        assert.match(
          sku,
          /^GLOBAL-(MET|PAP|FAP)-[A-Z0-9]+X[A-Z0-9]+$/,
          `${product.id} ${material}/${size} produced unexpected SKU "${sku}"`
        );
      }
    }
  }
});
