/**
 * Tests for the order record built from a Stripe Checkout Session.
 *
 * Regression targets:
 *   - Unit prices must be PRE-tax. They were taken from `amount_total`, which
 *     with automatic_tax enabled is tax-inclusive, so receipts disagreed with
 *     the prices shown on the product page.
 *   - Tax / shipping / discount must be carried through separately instead of
 *     being folded into one number labelled both "Subtotal" and "Total Paid".
 *   - A missing customer email must stay empty, not become a placeholder that
 *     gets mailed and shipped to.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderRecord } = require('../utils/order-record');

const PRODUCTS_DB = {
  standard: [
    {
      id: 'oahu-test',
      title: 'Koko Head Sunrise',
      images: { hero: 'https://example.com/hero.jpg', printImageUrl: 'https://example.com/print.jpg' }
    }
  ]
};

function sessionFixture(overrides = {}) {
  return {
    id: 'cs_live_abc123456789',
    payment_intent: 'pi_live_123',
    payment_status: 'paid',
    currency: 'usd',
    amount_subtotal: 30000,
    amount_total: 31463,
    total_details: { amount_tax: 1463, amount_shipping: 0, amount_discount: 0 },
    customer_details: { email: 'buyer@example.com', name: 'Jane Doe', phone: '+18085550199' },
    collected_information: {
      shipping_details: {
        name: 'Jane Doe',
        address: { line1: '1234 Makai Place', city: 'Honolulu', state: 'HI', postal_code: '96815', country: 'US' }
      }
    },
    ...overrides
  };
}

function lineItemsFixture() {
  return [
    {
      description: 'Koko Head Sunrise (12x18 / Lustre Paper)',
      quantity: 2,
      amount_subtotal: 30000,
      amount_total: 31463,
      price: { product: { metadata: { productId: 'oahu-test', size: '12x18', material: 'Lustre Paper' } } }
    }
  ];
}

test('unit price is pre-tax, not the tax-inclusive total', () => {
  const record = buildOrderRecord(sessionFixture(), lineItemsFixture(), PRODUCTS_DB);
  const item = record.items[0];

  assert.equal(item.price, 15000, 'unit price should be amount_subtotal / quantity');
  assert.equal(item.lineTotal, 30000, 'line total should be the pre-tax subtotal');
  assert.notEqual(item.price, Math.round(31463 / 2), 'must not derive unit price from amount_total');
});

test('tax, shipping and discount are carried separately from the total', () => {
  const record = buildOrderRecord(sessionFixture(), lineItemsFixture(), PRODUCTS_DB);

  assert.equal(record.subtotalAmount, 30000);
  assert.equal(record.taxAmount, 1463);
  assert.equal(record.totalAmount, 31463);
  assert.equal(record.subtotalAmount + record.taxAmount, record.totalAmount, 'figures must reconcile');
});

test('discounted order keeps the discount visible', () => {
  const session = sessionFixture({
    amount_subtotal: 30000,
    amount_total: 27000,
    total_details: { amount_tax: 0, amount_shipping: 0, amount_discount: 3000 }
  });
  const record = buildOrderRecord(session, lineItemsFixture(), PRODUCTS_DB);

  assert.equal(record.discountAmount, 3000);
  assert.equal(record.subtotalAmount - record.discountAmount, record.totalAmount);
});

test('missing customer email stays empty rather than becoming a placeholder', () => {
  const session = sessionFixture({ customer_details: { name: 'Jane Doe' } });
  const record = buildOrderRecord(session, lineItemsFixture(), PRODUCTS_DB);

  assert.equal(record.customerEmail, '');
  assert.doesNotMatch(record.customerEmail, /example\.com/);
});

test('resolves shipping from the newer collected_information shape', () => {
  const record = buildOrderRecord(sessionFixture(), lineItemsFixture(), PRODUCTS_DB);

  assert.equal(record.shippingName, 'Jane Doe');
  assert.equal(record.shippingAddress.city, 'Honolulu');
  assert.equal(record.orderRef, 'GLP-123456789');
});

test('carries the SKU and print thumbnail resolved from the local catalog', () => {
  const record = buildOrderRecord(sessionFixture(), lineItemsFixture(), PRODUCTS_DB);

  assert.equal(record.items[0].sku, 'GLOBAL-PAP-12X18');
  assert.equal(record.items[0].thumbnailUrl, 'https://example.com/hero.jpg');
});

test('expands the payment intent id when Stripe returns an object', () => {
  const record = buildOrderRecord(
    sessionFixture({ payment_intent: { id: 'pi_live_expanded' } }),
    lineItemsFixture(),
    PRODUCTS_DB
  );
  assert.equal(record.paymentIntentId, 'pi_live_expanded');
});
