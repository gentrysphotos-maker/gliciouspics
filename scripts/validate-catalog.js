#!/usr/bin/env node
/**
 * Catalog drift validator — exits 1 if anything is out of sync.
 *
 * Promoted from the one-off scratch/check_missing_*.js scripts. Wire this
 * into CI (or pre-deploy) so launches never go out with gallery/JSON drift.
 *
 * What it checks:
 *   1. products.json — required fields, positive prices, unique IDs
 *   2. Gallery HTML  — every product is linked from its category page
 *   3. sitemap.xml   — every product URL is listed
 *
 * Usage:
 *   node scripts/validate-catalog.js        # human-readable output
 *   npm run validate                        # same, via package.json
 *
 * Exit codes:
 *   0  catalog is clean
 *   1  one or more validation errors were found
 *   2  file I/O / unexpected error
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const GALLERY_PAGE_BY_CATEGORY = {
  underwater: 'underwater.html',
  landscapes: 'landscapes.html',
  'flora-fauna': 'flora-fauna.html',
  nightscapes: 'nightscapes.html',
  travel: 'travel.html',
  aerial: 'aerial.html',
  panoramas: 'panoramas.html',
};

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

let products;
try {
  products = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
} catch (err) {
  console.error('FATAL: could not read products.json -', err.message);
  process.exit(2);
}

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

// ─── 1. products.json structure ────────────────────────────────────────────
const seenIds = new Map();
for (const product of allProducts()) {
  const label = product.id || JSON.stringify(product).slice(0, 60);

  if (!product.id) fail(`product missing id: ${label}`);
  if (!product.title) fail(`${label}: missing title`);
  if (!product.category) fail(`${label}: missing category`);
  if (!product.images || !product.images.hero) fail(`${label}: missing images.hero`);
  if (!product.images || !product.images.printImageUrl) {
    fail(`${label}: missing images.printImageUrl (Prodigi cannot fulfill)`);
  }
  if (typeof product.startingPrice !== 'number' || product.startingPrice <= 0) {
    fail(`${label}: invalid startingPrice (${product.startingPrice})`);
  }
  if (!product.pricing || Object.keys(product.pricing).length === 0) {
    fail(`${label}: empty pricing`);
  } else {
    for (const [material, sizes] of Object.entries(product.pricing)) {
      for (const [size, price] of Object.entries(sizes)) {
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
          fail(`${label} ${material}/${size}: invalid price (${price})`);
        }
      }
    }

    const allPrices = Object.values(product.pricing)
      .flatMap((sizes) => Object.values(sizes))
      .filter((n) => typeof n === 'number');
    if (allPrices.length > 0) {
      const min = Math.min(...allPrices);
      if (product.startingPrice > min + 0.001) {
        warn(
          `${label}: startingPrice (${product.startingPrice}) is higher than cheapest configured price (${min})`
        );
      }
    }
  }

  if (product.id) {
    if (seenIds.has(product.id)) {
      fail(
        `duplicate product id "${product.id}" (also seen in category "${seenIds.get(product.id)}")`
      );
    } else {
      seenIds.set(product.id, product.category);
    }
  }
}

// ─── 2. Gallery HTML coverage ──────────────────────────────────────────────
for (const [category, fileName] of Object.entries(GALLERY_PAGE_BY_CATEGORY)) {
  const categoryProducts = productsByCategory(category);
  if (categoryProducts.length === 0) continue;

  const galleryPath = path.join(ROOT, 'pages', fileName);
  if (!fs.existsSync(galleryPath)) {
    fail(`gallery page missing: pages/${fileName}`);
    continue;
  }
  const html = fs.readFileSync(galleryPath, 'utf8');
  for (const product of categoryProducts) {
    if (!html.includes(`product.html?id=${product.id}`)) {
      fail(`pages/${fileName}: missing link to product "${product.id}"`);
    }
  }
}

// ─── 3. sitemap.xml coverage ───────────────────────────────────────────────
const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  fail('sitemap.xml is missing — run `npm run build:sitemap`');
} else {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  for (const product of allProducts()) {
    if (!sitemap.includes(`product.html?id=${product.id}`)) {
      fail(`sitemap.xml: missing entry for product "${product.id}"`);
    }
  }
  const staticPages = [
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
  for (const page of staticPages) {
    if (!sitemap.includes(page)) {
      fail(`sitemap.xml: missing entry for ${page}`);
    }
  }
}

// ─── Report ────────────────────────────────────────────────────────────────
const totalProducts = allProducts().length;
console.log(`Catalog validator — scanned ${totalProducts} product(s).`);

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  ! ' + w);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error('  x ' + e);
  console.error('\nCatalog is NOT ready for deploy. Fix the errors above.');
  process.exit(1);
}

console.log('\nCatalog is clean.');
process.exit(0);
