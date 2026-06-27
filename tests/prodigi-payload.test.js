/**
 * Tests for the Prodigi payload shape — specifically the address mapping.
 *
 * Regression target: Prodigi's API rejects empty strings on optional fields
 * (e.g. line2). When a customer doesn't enter an apt/suite, we need to omit
 * the line2 key entirely rather than send "".
 *
 * We don't actually hit Prodigi here — we stub global.fetch and inspect the
 * request body our helper sends.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProdigiOrder } = require('../utils/prodigi');

const SAMPLE_PRODUCT = {
  id: 'oahu-test',
  title: 'Test Print',
  images: { printImageUrl: 'https://example.com/print.jpg' }
};
const PRODUCTS_DB = { standard: [SAMPLE_PRODUCT] };

function withProdigiStub(t, responder) {
  const originalKey = process.env.PRODIGI_API_KEY;
  const originalFetch = global.fetch;
  process.env.PRODIGI_API_KEY = 'test_key';
  let capturedBody = null;
  global.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return responder ? responder() : {
      ok: true,
      status: 201,
      json: async () => ({ order: { id: 'ord_test_123' } })
    };
  };
  t.after(() => {
    process.env.PRODIGI_API_KEY = originalKey;
    global.fetch = originalFetch;
  });
  return () => capturedBody;
}

test('omits line2 when shipping address has no apt/suite', async (t) => {
  const getBody = withProdigiStub(t);
  const payload = {
    customerEmail: 'a@b.com',
    recipientName: 'Jane Doe',
    shippingAddress: {
      line1: '1234 South Canal Street',
      line2: '', // <- empty, mimics Stripe sending null mapped to ""
      city: 'Chicago',
      state: 'IL',
      postal_code: '60607',
      country: 'US'
    },
    items: [{ id: 'oahu-test', sku: 'GLOBAL-PAP-12X18', quantity: 1 }]
  };

  const result = await createProdigiOrder(payload, PRODUCTS_DB);
  assert.equal(result.ok, true);

  const sent = getBody();
  assert.equal(sent.recipient.address.line1, '1234 South Canal Street');
  assert.equal(sent.recipient.address.townOrCity, 'Chicago');
  assert.equal(sent.recipient.address.countryCode, 'US');
  assert.equal('line2' in sent.recipient.address, false,
    'line2 must be omitted, not sent as empty string');
});

test('includes line2 when an apt/suite is provided', async (t) => {
  const getBody = withProdigiStub(t);
  const payload = {
    customerEmail: 'a@b.com',
    recipientName: 'Jane Doe',
    shippingAddress: {
      line1: '1234 South Canal Street',
      line2: 'Apt 5B',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60607',
      country: 'US'
    },
    items: [{ id: 'oahu-test', sku: 'GLOBAL-PAP-12X18', quantity: 1 }]
  };

  await createProdigiOrder(payload, PRODUCTS_DB);
  const sent = getBody();
  assert.equal(sent.recipient.address.line2, 'Apt 5B');
});

test('omits line2 when it is null', async (t) => {
  const getBody = withProdigiStub(t);
  const payload = {
    customerEmail: 'a@b.com',
    recipientName: 'Jane Doe',
    shippingAddress: {
      line1: '1234 South Canal Street',
      line2: null,
      city: 'Chicago',
      state: 'IL',
      postal_code: '60607',
      country: 'US'
    },
    items: [{ id: 'oahu-test', sku: 'GLOBAL-PAP-12X18', quantity: 1 }]
  };

  await createProdigiOrder(payload, PRODUCTS_DB);
  const sent = getBody();
  assert.equal('line2' in sent.recipient.address, false);
});

test('omits line2 when it is only whitespace', async (t) => {
  const getBody = withProdigiStub(t);
  const payload = {
    customerEmail: 'a@b.com',
    recipientName: 'Jane Doe',
    shippingAddress: {
      line1: '1234 South Canal Street',
      line2: '   ',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60607',
      country: 'US'
    },
    items: [{ id: 'oahu-test', sku: 'GLOBAL-PAP-12X18', quantity: 1 }]
  };

  await createProdigiOrder(payload, PRODUCTS_DB);
  const sent = getBody();
  assert.equal('line2' in sent.recipient.address, false);
});
