/**
 * Tests for customer shipment notifications.
 *
 * The two properties that matter:
 *
 *   1. The customer is never told who prints their work. Prodigi callbacks
 *      carry the lab code, fulfilment location and per-item wholesale cost;
 *      none of it may reach a customer-facing email.
 *
 *   2. Exactly one email per shipment. Prodigi calls back on every stage
 *      change, so the same shipped shipment arrives many times over. An order
 *      that splits across parcels still gets one email per parcel.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatCarrier,
  selectShippedShipments,
  resolveShipmentItems,
  buildShipmentNotice,
  notifyShippedShipments,
  prodigiCallbackUrl,
  __testing
} = require('../utils/shipping-notification');
const notifications = require('../utils/notifications');

const PRODUCTS_DB = {
  standard: [
    { id: 'oahu-test', title: 'Koko Head Sunrise', images: { hero: 'https://example.com/hero.jpg', printImageUrl: 'https://example.com/p.jpg' } },
    { id: 'fuji-test', title: 'Mount Fuji from Honcho Street', images: { hero: 'https://example.com/hero2.jpg', printImageUrl: 'https://example.com/p2.jpg' } }
  ]
};

/** A Prodigi order as it comes back from GET /Orders/{id}, lab details and all. */
function prodigiOrder(overrides = {}) {
  return {
    id: 'ord_1469466',
    merchantReference: 'GLP-123456789',
    status: { stage: 'Complete', details: { shipping: 'Complete' } },
    charges: [{ totalCost: { amount: '95.00', currency: 'USD' } }],
    recipient: {
      name: 'Jane Doe',
      email: 'buyer@example.com',
      address: {
        line1: '1234 Makai Place',
        townOrCity: 'Honolulu',
        stateOrCounty: 'HI',
        postalOrZipCode: '96815',
        countryCode: 'US'
      }
    },
    items: [
      { id: 'ori_926887', merchantReference: 'oahu-test', sku: 'GLOBAL-PAP-12X18', copies: 2, recipientCost: { amount: '150.00' } }
    ],
    shipments: [
      {
        id: 'shp_456456',
        status: 'Shipped',
        carrier: { name: 'royalmail', service: 'Standard' },
        dispatchDate: '2026-08-27T11:51:01Z',
        items: [{ itemId: 'ori_926887' }],
        tracking: { url: 'https://tracking.example.com/1Z999AA10123456784', number: '1Z999AA10123456784' },
        fulfillmentLocation: { countryCode: 'GB', labCode: 'uk6' }
      }
    ],
    ...overrides
  };
}

/** Stripe stand-in whose PaymentIntent metadata persists, as the real one does. */
function fakeStripe(metadata = {}) {
  const store = { id: 'pi_live_123', metadata: { glp_order_ref: 'GLP-123456789', ...metadata } };
  return {
    store,
    paymentIntents: {
      search: async () => ({ data: [{ ...store, metadata: { ...store.metadata } }] }),
      update: async (_id, { metadata: patch }) => {
        Object.assign(store.metadata, patch);
        return store;
      }
    }
  };
}

function stubShippingEmail(t, { fails = false } = {}) {
  const sent = [];
  const real = notifications.sendShippingConfirmation;
  notifications.sendShippingConfirmation = async (notice) => {
    if (fails) {
      const e = new Error('resend exploded');
      e.statusCode = 500;
      throw e;
    }
    sent.push(notice);
    return { id: 'email_ship' };
  };
  t.after(() => { notifications.sendShippingConfirmation = real; });
  return sent;
}

test.beforeEach(() => __testing.recentlyNotified.clear());

// ── Selection ─────────────────────────────────────────────────────────────

test('only shipments that have actually shipped are selected', () => {
  const order = prodigiOrder({
    shipments: [
      { id: 'shp_1', status: 'Processing' },
      { id: 'shp_2', status: 'Shipped' },
      { id: 'shp_3', status: 'Cancelled' },
      { id: 'shp_4', status: 'shipped' } // casing must not matter
    ]
  });
  assert.deepEqual(selectShippedShipments(order).map((s) => s.id), ['shp_2', 'shp_4']);
});

test('an order still in production notifies nobody', async (t) => {
  const sent = stubShippingEmail(t);
  const order = prodigiOrder({
    status: { stage: 'InProgress' },
    shipments: [{ id: 'shp_1', status: 'Processing' }]
  });

  const result = await notifyShippedShipments({ stripe: fakeStripe(), order, productsDatabase: PRODUCTS_DB });

  assert.equal(sent.length, 0);
  assert.equal(result.reason, 'no_shipped_shipments');
});

// ── The customer must never learn who prints the work ─────────────────────

test('no lab, location or wholesale cost data reaches the notice', () => {
  const order = prodigiOrder();
  const notice = buildShipmentNotice(order, order.shipments[0], PRODUCTS_DB);
  const serialised = JSON.stringify(notice).toLowerCase();

  for (const forbidden of ['prodigi', 'labcode', 'uk6', 'fulfillmentlocation', 'recipientcost', '95.00', '150.00', 'ord_1469466']) {
    assert.ok(!serialised.includes(forbidden), `notice must not contain "${forbidden}"`);
  }
});

test('the rendered email never names the print lab', async (t) => {
  const captured = [];
  const realKey = process.env.RESEND_API_KEY;
  const realFetch = global.fetch;
  process.env.RESEND_API_KEY = 're_test_key';
  global.fetch = async (_url, opts) => {
    captured.push(JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => '{"id":"e1"}' };
  };
  t.after(() => {
    if (realKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = realKey;
    global.fetch = realFetch;
  });

  const order = prodigiOrder();
  await notifications.sendShippingConfirmation(buildShipmentNotice(order, order.shipments[0], PRODUCTS_DB));

  const html = captured[0].html.toLowerCase();
  for (const forbidden of ['prodigi', 'uk6', 'labcode', 'fulfillment', 'pwinty']) {
    assert.ok(!html.includes(forbidden), `email must not mention "${forbidden}"`);
  }
  assert.match(captured[0].subject, /Your order has shipped: GLP-123456789/);
  assert.match(captured[0].html, /Koko Head Sunrise/);
  assert.match(captured[0].html, /Royal Mail/);
  assert.match(captured[0].html, /1Z999AA10123456784/);
  assert.match(captured[0].html, /Track Your Delivery/);
});

// ── Idempotency ───────────────────────────────────────────────────────────

test('repeated callbacks for the same shipment send exactly one email', async (t) => {
  const sent = stubShippingEmail(t);
  const stripe = fakeStripe();
  const order = prodigiOrder();

  const first = await notifyShippedShipments({ stripe, order, productsDatabase: PRODUCTS_DB });
  const second = await notifyShippedShipments({ stripe, order, productsDatabase: PRODUCTS_DB });
  const third = await notifyShippedShipments({ stripe, order, productsDatabase: PRODUCTS_DB });

  assert.equal(sent.length, 1, 'Prodigi calls back on every stage change — only one email may go out');
  assert.deepEqual(first.sent, ['shp_456456']);
  assert.deepEqual(second.skipped, ['shp_456456']);
  assert.deepEqual(third.skipped, ['shp_456456']);
  assert.equal(stripe.store.metadata.glp_shipped_notified, 'shp_456456');
});

test('dedupe survives a restart, because it is stored on the payment', async (t) => {
  const sent = stubShippingEmail(t);
  // Simulates a fresh process: in-memory guard empty, durable record present.
  const stripe = fakeStripe({ glp_shipped_notified: 'shp_456456' });

  const result = await notifyShippedShipments({ stripe, order: prodigiOrder(), productsDatabase: PRODUCTS_DB });

  assert.equal(sent.length, 0, 'a redeploy must not re-notify shipments already emailed');
  assert.deepEqual(result.skipped, ['shp_456456']);
});

test('a split order sends one email per parcel, and only once each', async (t) => {
  const sent = stubShippingEmail(t);
  const stripe = fakeStripe();
  const order = prodigiOrder({
    items: [
      { id: 'ori_1', merchantReference: 'oahu-test', sku: 'GLOBAL-PAP-12X18', copies: 1 },
      { id: 'ori_2', merchantReference: 'fuji-test', sku: 'GLOBAL-MET-16X24', copies: 1 }
    ],
    shipments: [
      { id: 'shp_a', status: 'Shipped', carrier: { name: 'usps' }, items: [{ itemId: 'ori_1' }], tracking: { number: 'AAA' } },
      { id: 'shp_b', status: 'Shipped', carrier: { name: 'fedex' }, items: [{ itemId: 'ori_2' }], tracking: { number: 'BBB' } }
    ]
  });

  const first = await notifyShippedShipments({ stripe, order, productsDatabase: PRODUCTS_DB });
  assert.equal(sent.length, 2);
  assert.deepEqual(first.sent, ['shp_a', 'shp_b']);

  // Each parcel lists only its own contents.
  assert.deepEqual(sent[0].items.map((i) => i.title), ['Koko Head Sunrise']);
  assert.deepEqual(sent[1].items.map((i) => i.title), ['Mount Fuji from Honcho Street']);
  assert.equal(sent[0].isPartialShipment, true, 'customer should be told more is coming');

  // Both parcels must be in the DURABLE record, not just the in-process guard:
  // recording only the last one would re-notify the first after a restart.
  assert.equal(stripe.store.metadata.glp_shipped_notified, 'shp_a,shp_b');

  const second = await notifyShippedShipments({ stripe, order, productsDatabase: PRODUCTS_DB });
  assert.equal(sent.length, 2, 'no duplicates on the next callback');
  assert.deepEqual(second.skipped, ['shp_a', 'shp_b']);

  // Simulate a redeploy: in-process guard gone, only the durable record left.
  __testing.recentlyNotified.clear();
  const afterRestart = await notifyShippedShipments({ stripe, order, productsDatabase: PRODUCTS_DB });
  assert.equal(sent.length, 2, 'a restart must not re-notify either parcel');
  assert.deepEqual(afterRestart.skipped, ['shp_a', 'shp_b']);
});

test('a failed send is not recorded, so the next callback retries it', async (t) => {
  const stripe = fakeStripe();
  const failing = stubShippingEmail(t, { fails: true });

  const result = await notifyShippedShipments({ stripe, order: prodigiOrder(), productsDatabase: PRODUCTS_DB });

  assert.equal(failing.length, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].shipmentId, 'shp_456456');
  assert.ok(!stripe.store.metadata.glp_shipped_notified, 'must not mark a failed send as done');
});

// ── Item resolution ───────────────────────────────────────────────────────

test('items are resolved to catalogue titles with size and material', () => {
  const order = prodigiOrder();
  const items = resolveShipmentItems(order.shipments[0], order, PRODUCTS_DB);

  assert.deepEqual(items, [{
    title: 'Koko Head Sunrise',
    size: '12x18',
    material: 'Lustre Paper',
    quantity: 2,
    thumbnailUrl: 'https://example.com/hero.jpg'
  }]);
});

test('a legacy order without item references still notifies, just without a list', async (t) => {
  const sent = stubShippingEmail(t);
  // Orders placed before per-item merchantReference existed.
  const order = prodigiOrder({
    items: [{ id: 'ori_926887', sku: 'GLOBAL-PAP-12X18', copies: 1 }]
  });

  await notifyShippedShipments({ stripe: fakeStripe(), order, productsDatabase: PRODUCTS_DB });

  assert.equal(sent.length, 1, 'the customer must still be told their order shipped');
  assert.deepEqual(sent[0].items, []);
  assert.equal(sent[0].trackingNumber, '1Z999AA10123456784');
});

test('a shipment with no explicit item list is treated as the whole order', () => {
  const order = prodigiOrder({
    shipments: [{ id: 'shp_x', status: 'Shipped', carrier: { name: 'ups' } }]
  });
  const items = resolveShipmentItems(order.shipments[0], order, PRODUCTS_DB);
  assert.equal(items.length, 1);
});

// ── Odds and ends ─────────────────────────────────────────────────────────

test('carrier codes are shown as customers would recognise them', () => {
  assert.equal(formatCarrier({ name: 'royalmail' }), 'Royal Mail');
  assert.equal(formatCarrier({ name: 'FedEx' }), 'FedEx');
  assert.equal(formatCarrier({ name: 'usps' }), 'USPS');
  assert.equal(formatCarrier({ name: 'hermes' }), 'Evri');
  assert.equal(formatCarrier({ name: 'some-new-courier' }), 'Some-New-Courier');
  assert.equal(formatCarrier({}), null);
  assert.equal(formatCarrier(null), null);
});

test('an order with no recipient email is reported, not crashed on', async (t) => {
  const sent = stubShippingEmail(t);
  const order = prodigiOrder({
    recipient: { name: 'Jane Doe', address: {} }
  });

  const result = await notifyShippedShipments({ stripe: fakeStripe(), order, productsDatabase: PRODUCTS_DB });

  assert.equal(sent.length, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /no recipient email/);
});

test('the callback URL carries the secret and is omitted without one', () => {
  const realSecret = process.env.PRODIGI_CALLBACK_SECRET;
  const realSite = process.env.SITE_URL;
  process.env.SITE_URL = 'https://gliciouspics.com';

  delete process.env.PRODIGI_CALLBACK_SECRET;
  assert.equal(prodigiCallbackUrl(), null, 'no secret means no callback URL on the order');

  process.env.PRODIGI_CALLBACK_SECRET = 's3cr3t token/value';
  assert.equal(
    prodigiCallbackUrl(),
    'https://gliciouspics.com/api/webhooks/prodigi/s3cr3t%20token%2Fvalue',
    'secret must be URL-encoded into the path'
  );

  if (realSecret === undefined) delete process.env.PRODIGI_CALLBACK_SECRET;
  else process.env.PRODIGI_CALLBACK_SECRET = realSecret;
  if (realSite === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = realSite;
});
