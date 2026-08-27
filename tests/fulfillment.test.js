/**
 * Tests for the post-payment fulfillment pipeline.
 *
 * Regression targets — the two failure modes behind the failed live launch:
 *
 *   1. STAGE INDEPENDENCE. Prodigi, the customer email and the seller email
 *      used to share one try/catch, so a single failure took out all three and
 *      the customer heard nothing at all.
 *
 *   2. IDEMPOTENCY. Stripe redelivers a failed webhook for up to 3 days. With
 *      no record of completed stages, retry #2 placed a second real print
 *      order and sent a second confirmation email.
 *
 * Prodigi is exercised for real through a stubbed global.fetch; the email
 * layer is stubbed at the module boundary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { fulfillOrder, isRetryable, STAGE_KEYS } = require('../utils/fulfillment');
const notifications = require('../utils/notifications');

const PRODUCTS_DB = {
  standard: [{ id: 'oahu-test', title: 'Test Print', images: { printImageUrl: 'https://example.com/print.jpg' } }]
};

const RECORD = Object.freeze({
  orderId: 'cs_live_abc123456789',
  orderRef: 'GLP-123456789',
  paymentIntentId: 'pi_live_123',
  customerName: 'Jane Doe',
  customerEmail: 'buyer@example.com',
  shippingName: 'Jane Doe',
  shippingAddress: { line1: '1234 Makai Place', city: 'Honolulu', state: 'HI', postal_code: '96815', country: 'US' },
  items: [{ id: 'oahu-test', sku: 'GLOBAL-PAP-12X18', title: 'Test Print', size: '12x18', material: 'Lustre Paper', quantity: 1, price: 15000, lineTotal: 15000 }],
  subtotalAmount: 15000,
  taxAmount: 0,
  totalAmount: 15000
});

/** Fake Stripe whose PaymentIntent metadata persists across calls, like the real one. */
function fakeStripe(initialMetadata = {}) {
  const store = { ...initialMetadata };
  return {
    metadata: store,
    paymentIntents: {
      retrieve: async () => ({ metadata: { ...store } }),
      update: async (_id, { metadata }) => {
        Object.assign(store, metadata);
        return { metadata: { ...store } };
      }
    }
  };
}

/** Stub the email layer, recording every send. */
function stubEmails(t, { customerFails = false, adminFails = false } = {}) {
  const sent = { customer: 0, admin: 0, adminPayloads: [] };
  const realCustomer = notifications.sendCustomerConfirmation;
  const realAdmin = notifications.sendAdminNotification;

  notifications.sendCustomerConfirmation = async () => {
    if (customerFails) {
      const e = new Error('Resend API Error (Status 403): domain is not verified');
      e.statusCode = 403;
      throw e;
    }
    sent.customer += 1;
    return { id: 'email_1' };
  };
  notifications.sendAdminNotification = async (payload) => {
    if (adminFails) throw new Error('resend down');
    sent.admin += 1;
    sent.adminPayloads.push(payload);
    return { id: 'email_2' };
  };

  t.after(() => {
    notifications.sendCustomerConfirmation = realCustomer;
    notifications.sendAdminNotification = realAdmin;
  });
  return sent;
}

/** Stub Prodigi's HTTP layer, recording every submission. */
function stubProdigi(t, { status = 201, body = { order: { id: 'ord_123' } } } = {}) {
  const calls = [];
  const realKey = process.env.PRODIGI_API_KEY;
  const realFetch = global.fetch;
  process.env.PRODIGI_API_KEY = 'test_key';

  global.fetch = async (url, opts) => {
    // Ignore the optional alert webhook; only record order submissions.
    if (!String(url).includes('/Orders')) return { ok: true, status: 200, json: async () => ({}) };
    calls.push(JSON.parse(opts.body));
    return { ok: status < 400, status, json: async () => body };
  };

  t.after(() => {
    process.env.PRODIGI_API_KEY = realKey;
    global.fetch = realFetch;
  });
  return calls;
}

test('a Prodigi outage no longer suppresses the customer confirmation', async (t) => {
  const emails = stubEmails(t);
  stubProdigi(t, { status: 500, body: { message: 'upstream exploded' } });
  const stripe = fakeStripe();

  const result = await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });

  assert.equal(emails.customer, 1, 'customer must still be told their order was received');
  assert.equal(emails.admin, 1, 'seller must still be told, with manual-fulfillment instructions');
  assert.deepEqual(result.failures, ['prodigi']);
  assert.equal(result.retryable, true, 'a 5xx from Prodigi should be retried');
});

test('the seller alert reports the Prodigi failure so it can be placed by hand', async (t) => {
  const emails = stubEmails(t);
  stubProdigi(t, { status: 500, body: { message: 'upstream exploded' } });

  await fulfillOrder({ stripe: fakeStripe(), record: RECORD, productsDatabase: PRODUCTS_DB });

  const payload = emails.adminPayloads[0];
  assert.equal(payload.prodigiSuccess, false);
  assert.match(payload.prodigiError, /500/);
});

test('a broken email provider does not stop the print order', async (t) => {
  const emails = stubEmails(t, { customerFails: true });
  const prodigiCalls = stubProdigi(t);

  const result = await fulfillOrder({ stripe: fakeStripe(), record: RECORD, productsDatabase: PRODUCTS_DB });

  assert.equal(prodigiCalls.length, 1, 'the print must still be submitted');
  assert.equal(emails.admin, 1);
  assert.deepEqual(result.failures, ['customer_email']);
  assert.equal(result.retryable, true, 'an unverified Resend domain can self-heal, so retry');
});

test('redelivery does not place a second print order or resend a confirmation', async (t) => {
  const emails = stubEmails(t, { adminFails: true }); // force a retryable failure
  const prodigiCalls = stubProdigi(t);
  const stripe = fakeStripe();

  const first = await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });
  assert.equal(first.retryable, true, 'admin email failure should ask Stripe to retry');
  assert.equal(prodigiCalls.length, 1);
  assert.equal(emails.customer, 1);

  // Stripe redelivers the same event.
  const second = await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });

  assert.equal(prodigiCalls.length, 1, 'MUST NOT submit a second real print order');
  assert.equal(emails.customer, 1, 'MUST NOT send a second confirmation email');
  assert.deepEqual(second.failures, ['admin_email'], 'only the failed stage is retried');
});

test('a successful run records every completed stage on the PaymentIntent', async (t) => {
  stubEmails(t);
  stubProdigi(t);
  const stripe = fakeStripe();

  const result = await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });

  assert.deepEqual(result.failures, []);
  assert.equal(result.retryable, false);
  assert.equal(stripe.metadata[STAGE_KEYS.prodigiOrderId], 'ord_123');
  assert.equal(stripe.metadata[STAGE_KEYS.orderRef], 'GLP-123456789');
  assert.ok(stripe.metadata[STAGE_KEYS.customerEmail], 'customer email timestamp recorded');
  assert.ok(stripe.metadata[STAGE_KEYS.adminEmail], 'admin email timestamp recorded');
});

test('a rejected address is permanent — Stripe should not retry it forever', async (t) => {
  stubEmails(t);
  stubProdigi(t, { status: 400, body: { message: 'invalid postal code' } });

  const result = await fulfillOrder({ stripe: fakeStripe(), record: RECORD, productsDatabase: PRODUCTS_DB });

  assert.deepEqual(result.failures, ['prodigi']);
  assert.equal(result.retryable, false, 'retrying cannot fix bad address data');
});

test('an order with no customer email is reported rather than mailed to a placeholder', async (t) => {
  const emails = stubEmails(t);
  const prodigiCalls = stubProdigi(t);

  const result = await fulfillOrder({
    stripe: fakeStripe(),
    record: { ...RECORD, customerEmail: '' },
    productsDatabase: PRODUCTS_DB
  });

  assert.equal(emails.customer, 0);
  assert.ok(result.failures.includes('customer_email'));
  assert.equal(prodigiCalls.length, 1, 'the rest of the order still proceeds');
});

test('a retry that fixes Prodigi tells the seller to stand down', async (t) => {
  const emails = stubEmails(t);
  const stripe = fakeStripe();

  // Attempt 1: Prodigi is down. The seller is told to place it by hand.
  const restore = stubProdigi(t, { status: 500, body: { message: 'down' } });
  await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });
  assert.equal(emails.adminPayloads[0].prodigiSuccess, false);
  assert.equal(stripe.metadata[STAGE_KEYS.adminEmailState], 'failed');

  // Attempt 2 (Stripe redelivery): Prodigi is back.
  global.fetch = async (url, opts) => {
    if (!String(url).includes('/Orders')) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 201, json: async () => ({ order: { id: 'ord_recovered' } }) };
  };
  const second = await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });

  assert.deepEqual(second.failures, []);
  assert.equal(emails.admin, 2, 'seller MUST get a follow-up, or they print a duplicate by hand');
  assert.equal(emails.adminPayloads[1].resolvedAfterFailure, true);
  assert.equal(emails.adminPayloads[1].prodigiOrderId, 'ord_recovered');
  assert.equal(emails.customer, 1, 'customer still gets exactly one confirmation');

  // Attempt 3: nothing changed, so nothing is re-sent.
  await fulfillOrder({ stripe, record: RECORD, productsDatabase: PRODUCTS_DB });
  assert.equal(emails.admin, 2, 'no further duplicate seller emails');
});

test('retry classification', () => {
  assert.equal(isRetryable(undefined), true, 'transport failure');
  assert.equal(isRetryable(500), true);
  assert.equal(isRetryable(429), true);
  assert.equal(isRetryable(403), true, 'unverified domain / wrong-mode key can be fixed then retried');
  assert.equal(isRetryable(400), false);
  assert.equal(isRetryable(422), false);
});
