/**
 * Catalog integrity tests.
 *
 * Validates that products.json, the gallery HTML pages, and sitemap.xml
 * all describe the same set of products. These are pure file-reads — no
 * network, no secrets — so they're safe to run in CI on every commit.
 *
 * Run: npm test (or: node --test tests/catalog.test.js)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));

// Maps standard `category` field -> gallery HTML filename in pages/.
// Top-level buckets (panoramas, aerial) use their own gallery files.
const GALLERY_PAGE_BY_CATEGORY = {
  underwater: 'underwater.html',
  landscapes: 'landscapes.html',
  'flora-fauna': 'flora-fauna.html',
  nightscapes: 'nightscapes.html',
  travel: 'travel.html',
  aerial: 'aerial.html',
  panoramas: 'panoramas.html',
};

function allProducts() {
  return [
    ...(products.standard || []),
    ...(products.panoramas || []),
    ...(products.aerial || []),
  ];
}

function productsByCategory(category) {
  if (category === 'panoramas') return products.panoramas || [];
  if (category === 'aerial') return products.aerial || [];
  return (products.standard || []).filter((p) => p.category === category);
}

test('products.json: every product has the required fields', () => {
  for (const product of allProducts()) {
    assert.ok(product.id, `product missing id: ${JSON.stringify(product).slice(0, 80)}`);
    assert.ok(product.title, `product ${product.id} missing title`);
    assert.ok(product.category, `product ${product.id} missing category`);
    assert.ok(product.images, `product ${product.id} missing images`);
    assert.ok(product.images.hero, `product ${product.id} missing images.hero`);
    assert.ok(
      product.images.printImageUrl,
      `product ${product.id} missing images.printImageUrl (Prodigi cannot fulfill)`
    );
    assert.equal(
      typeof product.startingPrice,
      'number',
      `product ${product.id} startingPrice must be a number`
    );
    assert.ok(
      product.startingPrice > 0,
      `product ${product.id} startingPrice must be > 0`
    );
    assert.ok(product.pricing, `product ${product.id} missing pricing`);
    assert.ok(
      Object.keys(product.pricing).length > 0,
      `product ${product.id} has empty pricing`
    );
  }
});

test('products.json: pricing entries are positive numbers', () => {
  for (const product of allProducts()) {
    for (const [material, sizes] of Object.entries(product.pricing)) {
      for (const [size, price] of Object.entries(sizes)) {
        assert.equal(
          typeof price,
          'number',
          `${product.id} ${material}/${size}: price must be a number, got ${typeof price}`
        );
        assert.ok(
          Number.isFinite(price) && price > 0,
          `${product.id} ${material}/${size}: price must be > 0, got ${price}`
        );
      }
    }
  }
});

test('products.json: startingPrice matches the cheapest configured price', () => {
  for (const product of allProducts()) {
    const allPrices = Object.values(product.pricing)
      .flatMap((sizes) => Object.values(sizes))
      .filter((n) => typeof n === 'number');
    if (allPrices.length === 0) continue;
    const min = Math.min(...allPrices);
    assert.ok(
      product.startingPrice <= min + 0.001,
      `${product.id}: startingPrice (${product.startingPrice}) is higher than the cheapest price (${min})`
    );
  }
});

test('products.json: no duplicate product IDs', () => {
  const seen = new Map();
  for (const product of allProducts()) {
    if (seen.has(product.id)) {
      assert.fail(
        `Duplicate product id "${product.id}" (also in ${seen.get(product.id)})`
      );
    }
    seen.set(product.id, product.category);
  }
});

test('gallery HTML pages exist for every category in products.json', () => {
  const categoriesInUse = new Set(allProducts().map((p) => p.category));
  for (const category of categoriesInUse) {
    const file = GALLERY_PAGE_BY_CATEGORY[category];
    assert.ok(
      file,
      `No gallery page mapping for category "${category}". Add it to GALLERY_PAGE_BY_CATEGORY.`
    );
    const fullPath = path.join(ROOT, 'pages', file);
    assert.ok(fs.existsSync(fullPath), `Missing gallery page: pages/${file}`);
  }
});

test('every product is linked from its gallery HTML page', () => {
  const missing = [];
  for (const [category, fileName] of Object.entries(GALLERY_PAGE_BY_CATEGORY)) {
    const categoryProducts = productsByCategory(category);
    if (categoryProducts.length === 0) continue;
    const html = fs.readFileSync(path.join(ROOT, 'pages', fileName), 'utf8');
    for (const product of categoryProducts) {
      const link = `product.html?id=${product.id}`;
      if (!html.includes(link)) {
        missing.push(`${fileName} is missing link to ${product.id}`);
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Gallery/products.json drift:\n  - ${missing.join('\n  - ')}`
  );
});

test('sitemap.xml contains an entry for every product', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const missing = [];
  for (const product of allProducts()) {
    const url = `product.html?id=${product.id}`;
    if (!sitemap.includes(url)) {
      missing.push(product.id);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `sitemap.xml is missing ${missing.length} product URL(s):\n  - ${missing.join('\n  - ')}`
  );
});

test('sitemap.xml contains all gallery + static pages', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const required = [
    '/pages/underwater.html',
    '/pages/landscapes.html',
    '/pages/flora-fauna.html',
    '/pages/nightscapes.html',
    '/pages/aerial.html',
    '/pages/travel.html',
    '/pages/panoramas.html',
    '/pages/faq.html',
    '/pages/privacy.html',
    '/pages/terms.html',
    '/pages/returns.html',
  ];
  for (const urlSuffix of required) {
    assert.ok(
      sitemap.includes(urlSuffix),
      `sitemap.xml missing entry for ${urlSuffix}`
    );
  }
});
