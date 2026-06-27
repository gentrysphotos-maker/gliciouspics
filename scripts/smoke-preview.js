#!/usr/bin/env node
/**
 * Preview / production smoke test.
 *
 * Hits a deployed URL (Railway preview, production, or local) and confirms
 * the site is wired up end-to-end:
 *
 *   1. Homepage and key static pages return 200
 *   2. robots.txt and sitemap.xml are present
 *   3. POST /api/checkout with an empty cart returns 400 (validation works)
 *   4. POST /api/checkout with a known good item returns 200 + a Stripe
 *      session id — proves the deployed env has Stripe configured correctly
 *
 * Requires nothing client-side; Stripe test keys must be configured on the
 * deployed environment (Railway service variables), not in this process.
 *
 * Usage:
 *   BASE_URL=https://your-app.up.railway.app node scripts/smoke-preview.js
 *   node scripts/smoke-preview.js https://gliciouspics.com
 *
 * Exit codes:
 *   0  all checks passed
 *   1  one or more checks failed
 *   2  missing BASE_URL / fixture problem
 */

const fs = require('node:fs');
const path = require('node:path');

const RAW_URL = process.env.BASE_URL || process.argv[2];
if (!RAW_URL) {
  console.error('FATAL: BASE_URL is required.');
  console.error('  BASE_URL=https://<your-app>.up.railway.app node scripts/smoke-preview.js');
  process.exit(2);
}
const BASE_URL = RAW_URL.replace(/\/+$/, '');

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8')
);
const sampleProduct = (products.standard || []).find(
  (p) => p && p.pricing && Object.keys(p.pricing).length > 0
);
if (!sampleProduct) {
  console.error('FATAL: no usable product in products.json for smoke test.');
  process.exit(2);
}
const sampleMaterial = Object.keys(sampleProduct.pricing)[0];
const sampleSize = Object.keys(sampleProduct.pricing[sampleMaterial])[0];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? 'ok ' : 'FAIL';
  console.log(`  ${icon}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function expectStatus(name, urlPath, expectedStatus, opts = {}) {
  const url = BASE_URL + urlPath;
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body,
      redirect: 'manual',
    });
    if (res.status === expectedStatus) {
      record(name, true, `${opts.method || 'GET'} ${urlPath} → ${res.status}`);
      return res;
    }
    record(name, false, `${opts.method || 'GET'} ${urlPath} → ${res.status} (expected ${expectedStatus})`);
    return res;
  } catch (err) {
    record(name, false, `${opts.method || 'GET'} ${urlPath} threw ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`\nSmoke testing ${BASE_URL}\n`);

  await expectStatus('homepage loads', '/', 200);
  await expectStatus('cart page loads', '/pages/cart.html', 200);
  await expectStatus('faq page loads', '/pages/faq.html', 200);
  await expectStatus('returns page loads', '/pages/returns.html', 200);
  await expectStatus(
    'product page (sample) loads',
    `/pages/product.html?id=${sampleProduct.id}`,
    200
  );
  await expectStatus('robots.txt is served', '/robots.txt', 200);
  await expectStatus('sitemap.xml is served', '/sitemap.xml', 200);

  // Empty cart should reject with 400
  await expectStatus('POST /api/checkout rejects empty cart', '/api/checkout', 400, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  });

  // Bad product id should reject with 400
  await expectStatus('POST /api/checkout rejects bad product id', '/api/checkout', 400, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 'ghost-product', material: 'Lustre Paper', size: '12x18', quantity: 1 }],
    }),
  });

  // Valid cart should create a real Stripe Checkout Session
  const validRes = await expectStatus(
    'POST /api/checkout creates a Stripe session',
    '/api/checkout',
    200,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            id: sampleProduct.id,
            material: sampleMaterial,
            size: sampleSize,
            quantity: 1,
            title: sampleProduct.title,
          },
        ],
      }),
    }
  );

  if (validRes && validRes.ok) {
    try {
      const data = await validRes.json();
      const sessionOk = typeof data.id === 'string' && data.id.startsWith('cs_');
      const pubKeyOk =
        typeof data.publishableKey === 'string' && data.publishableKey.startsWith('pk_test_');
      record(
        'checkout response has cs_* session id',
        sessionOk,
        sessionOk ? data.id : JSON.stringify(data).slice(0, 80)
      );
      record(
        'checkout response has pk_test_* publishable key',
        pubKeyOk,
        pubKeyOk ? '(redacted)' : data.publishableKey || '(missing)'
      );
    } catch (err) {
      record('checkout response is JSON', false, err.message);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${passed}/${results.length} checks passed.`);

  if (failed > 0) {
    console.error(`\n${failed} smoke check(s) failed against ${BASE_URL}.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
