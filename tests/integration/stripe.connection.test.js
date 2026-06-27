/**
 * Stripe connection test (integration — needs STRIPE_SECRET_KEY in test mode).
 *
 * Verifies:
 *   1. STRIPE_SECRET_KEY is a test-mode key (`sk_test_*`) — never a live key in CI
 *   2. The key is accepted by the Stripe API
 *   3. We can construct a real Stripe Checkout Session from a known cart
 *      using our shared buildLineItems() helper — i.e. the full /api/checkout
 *      code path works without going through HTTP
 *
 * If STRIPE_SECRET_KEY is missing, the tests skip cleanly. That way the same
 * file can run locally without secrets, in a fork PR (no secrets), or in a
 * CI job that does have the secret.
 *
 * SAFETY: This test refuses to run with a live key. Keep secrets in test mode.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildLineItems } = require('../../utils/checkout-validation');

const KEY = process.env.STRIPE_SECRET_KEY || '';

// Catch the common mistake of pasting a documentation placeholder (e.g.
// "sk_test_51..." or "sk_test_51…") instead of a real key.
const LOOKS_LIKE_PLACEHOLDER = /[^\x20-\x7E]/.test(KEY) || /\.{3}|…/.test(KEY);
const HAS_TEST_KEY = KEY.startsWith('sk_test_') && !LOOKS_LIKE_PLACEHOLDER;
const HAS_LIVE_KEY = KEY.startsWith('sk_live_');

const skipMsg = !KEY
  ? 'STRIPE_SECRET_KEY not set — skipping Stripe connection tests'
  : LOOKS_LIKE_PLACEHOLDER
  ? 'STRIPE_SECRET_KEY looks like a placeholder (contains "…" or "..."). Paste the real key from dashboard.stripe.com/test/apikeys.'
  : !HAS_TEST_KEY
  ? 'STRIPE_SECRET_KEY is not a test-mode key — skipping (refuse to use live keys in tests)'
  : null;

if (HAS_LIVE_KEY) {
  console.error('\n!! Refusing to run integration tests with a live Stripe key (sk_live_*). Use sk_test_* only.\n');
}

test('Stripe: key format is sk_test_*', { skip: skipMsg }, () => {
  assert.ok(HAS_TEST_KEY, 'STRIPE_SECRET_KEY must be a test-mode key');
});

test('Stripe: API key is accepted (balance.retrieve)', { skip: skipMsg }, async () => {
  const stripe = require('stripe')(KEY);
  const balance = await stripe.balance.retrieve();
  assert.equal(balance.object, 'balance');
  assert.ok(Array.isArray(balance.available));
});

test('Stripe: products.list works (read scope)', { skip: skipMsg }, async () => {
  const stripe = require('stripe')(KEY);
  const result = await stripe.products.list({ limit: 1 });
  assert.equal(result.object, 'list');
  assert.ok(Array.isArray(result.data));
});

test(
  'Stripe: creates a real Checkout Session from a validated cart',
  { skip: skipMsg },
  async () => {
    const products = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'products.json'), 'utf8')
    );
    const sample = (products.standard || []).find(
      (p) => p && p.pricing && Object.keys(p.pricing).length > 0
    );
    assert.ok(sample, 'fixture: no usable product in products.standard');

    const material = Object.keys(sample.pricing)[0];
    const size = Object.keys(sample.pricing[material])[0];

    const validation = buildLineItems(products, [
      { id: sample.id, material, size, quantity: 1, title: sample.title },
    ]);
    assert.equal(validation.ok, true);

    const stripe = require('stripe')(KEY);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: validation.lineItems,
      mode: 'payment',
      shipping_address_collection: { allowed_countries: ['US'] },
      success_url: 'https://example.com/?checkout=success',
      cancel_url: 'https://example.com/?checkout=cancelled',
      metadata: { source: 'ci-connection-test' },
    });

    assert.ok(session.id.startsWith('cs_'), 'session id should start with cs_');
    assert.ok(
      session.url && session.url.startsWith('https://checkout.stripe.com/'),
      'session.url should be a Stripe checkout URL'
    );
    assert.equal(session.mode, 'payment');
    assert.equal(session.status, 'open');
  }
);
