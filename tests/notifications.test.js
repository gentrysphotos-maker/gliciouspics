/**
 * Tests for the email layer.
 *
 * Regression targets:
 *   - A Resend failure used to be swallowed: the code wrote an HTML file to an
 *     ephemeral container disk and returned a success-shaped object, so a total
 *     email outage was indistinguishable from a healthy order.
 *   - Customer-supplied values went into email HTML unescaped.
 *   - The receipt labelled one tax-inclusive figure as both "Subtotal" and
 *     "Total Paid", with a hardcoded "FREE" shipping row and no tax line.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sendCustomerConfirmation,
  sendAdminNotification,
  escapeHtml,
  getItemsTableHtml
} = require('../utils/notifications');

const ORDER = Object.freeze({
  orderId: 'cs_live_abc123456789',
  orderRef: 'GLP-123456789',
  customerName: 'Jane Doe',
  customerEmail: 'buyer@example.com',
  customerPhone: '+18085550199',
  shippingName: 'Jane Doe',
  shippingAddress: { line1: '1234 Makai Place', city: 'Honolulu', state: 'HI', postal_code: '96815', country: 'US' },
  items: [{ id: 'oahu-test', title: 'Koko Head Sunrise', size: '12x18', material: 'Lustre Paper', quantity: 2, price: 15000, lineTotal: 30000 }],
  subtotalAmount: 30000,
  taxAmount: 1463,
  shippingAmount: 0,
  discountAmount: 0,
  totalAmount: 31463
});

/** Capture what would be sent to Resend without hitting the network. */
function stubResend(t, { status = 200, body = '{"id":"email_1"}' } = {}) {
  const captured = [];
  const realKey = process.env.RESEND_API_KEY;
  const realOwner = process.env.OWNER_EMAIL;
  const realFetch = global.fetch;
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.OWNER_EMAIL = 'seller@example.com';

  global.fetch = async (_url, opts) => {
    captured.push(JSON.parse(opts.body));
    return { ok: status < 400, status, text: async () => body };
  };

  t.after(() => {
    process.env.RESEND_API_KEY = realKey;
    if (realOwner === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = realOwner;
    global.fetch = realFetch;
  });
  return captured;
}

test('a Resend failure throws instead of reporting a fake success', async (t) => {
  stubResend(t, { status: 403, body: '{"message":"The gliciouspics.com domain is not verified."}' });

  await assert.rejects(
    () => sendCustomerConfirmation(ORDER),
    (err) => {
      assert.equal(err.statusCode, 403, 'status must survive so the caller can classify the failure');
      assert.match(err.message, /not verified/i);
      return true;
    }
  );
});

test('an unverified sending domain is named explicitly in the error', async (t) => {
  stubResend(t, { status: 403, body: '{"message":"domain is not verified"}' });

  await assert.rejects(
    () => sendCustomerConfirmation(ORDER),
    /Verify gliciouspics\.com|domain is not verified in Resend/i
  );
});

test('a missing API key in production is a hard error, not a local file', async (t) => {
  const realKey = process.env.RESEND_API_KEY;
  const realEnv = process.env.NODE_ENV;
  delete process.env.RESEND_API_KEY;
  process.env.NODE_ENV = 'production';
  t.after(() => {
    if (realKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = realKey;
    if (realEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = realEnv;
  });

  await assert.rejects(() => sendCustomerConfirmation(ORDER), /RESEND_API_KEY is not set/);
});

test('a missing OWNER_EMAIL fails loudly instead of mailing a placeholder', async (t) => {
  stubResend(t);
  const realOwner = process.env.OWNER_EMAIL;
  delete process.env.OWNER_EMAIL;
  t.after(() => { if (realOwner !== undefined) process.env.OWNER_EMAIL = realOwner; });

  await assert.rejects(() => sendAdminNotification(ORDER), /OWNER_EMAIL is not set/);
});

test('receipt itemises subtotal, tax and total so the figures reconcile', async (t) => {
  const captured = stubResend(t);
  await sendCustomerConfirmation(ORDER);
  const html = captured[0].html;

  assert.match(html, /Subtotal[\s\S]{0,120}\$300\.00/, 'subtotal is the pre-tax figure');
  assert.match(html, /Tax[\s\S]{0,120}\$14\.63/, 'tax gets its own line');
  assert.match(html, /Total Paid[\s\S]{0,120}\$314\.63/, 'total is what Stripe actually charged');
  assert.doesNotMatch(html, /Subtotal[\s\S]{0,120}\$314\.63/, 'must not label the taxed total "Subtotal"');
});

test('a zero-tax order omits the tax row and still shows free shipping', async (t) => {
  const captured = stubResend(t);
  await sendCustomerConfirmation({
    ...ORDER, taxAmount: 0, subtotalAmount: 30000, totalAmount: 30000
  });
  const html = captured[0].html;

  assert.doesNotMatch(html, />Tax</);
  assert.match(html, /FREE/);
});

test('customer-supplied values are escaped before entering email HTML', async (t) => {
  const captured = stubResend(t);
  await sendCustomerConfirmation({
    ...ORDER,
    customerName: '<script>alert(1)</script>',
    shippingAddress: { ...ORDER.shippingAddress, line1: '<img src=x onerror=alert(1)>' }
  });
  const html = captured[0].html;

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;script&gt;/);
});

test('escapeHtml covers the characters that break out of HTML context', () => {
  assert.equal(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('item rows use the pre-tax line total Stripe reported', () => {
  const html = getItemsTableHtml(ORDER.items);
  assert.match(html, /\$150\.00/, 'unit price');
  assert.match(html, /\$300\.00/, 'line total for quantity 2');
});

test('a resolved order tells the seller not to place it manually', async (t) => {
  const captured = stubResend(t);
  await sendAdminNotification({
    ...ORDER, prodigiSuccess: true, prodigiOrderId: 'ord_recovered', resolvedAfterFailure: true
  });

  assert.match(captured[0].subject, /Resolved — no action needed/);
  assert.match(captured[0].html, /Do not place this order manually/);
  assert.match(captured[0].html, /duplicate print/);
});

test('the seller subject line flags orders needing manual fulfillment', async (t) => {
  const captured = stubResend(t);

  await sendAdminNotification({ ...ORDER, prodigiSuccess: true, prodigiOrderId: 'ord_1' });
  assert.match(captured[0].subject, /^\[New Order\] GLP-/);

  await sendAdminNotification({ ...ORDER, prodigiSuccess: false, prodigiError: 'boom' });
  assert.match(captured[1].subject, /ACTION REQUIRED/);
});
