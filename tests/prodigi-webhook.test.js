const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { getProdigiOrder } = require('../utils/prodigi');
const { sendCustomerShipmentNotification } = require('../utils/notifications');

test('getProdigiOrder fetches order details using GET and X-API-Key', async (t) => {
  const originalKey = process.env.PRODIGI_API_KEY;
  const originalFetch = global.fetch;
  process.env.PRODIGI_API_KEY = 'test_webhook_key';

  let capturedUrl = null;
  let capturedOpts = null;

  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return {
      ok: true,
      status: 200,
      json: async () => ({ order: { id: 'ord_12345678' } })
    };
  };

  t.after(() => {
    process.env.PRODIGI_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  const result = await getProdigiOrder('ord_12345678');
  assert.deepEqual(result, { order: { id: 'ord_12345678' } });
  assert.equal(capturedUrl, 'https://api.prodigi.com/v4.0/Orders/ord_12345678');
  assert.equal(capturedOpts.method, 'GET');
  assert.equal(capturedOpts.headers['X-API-Key'], 'test_webhook_key');
});

test('sendCustomerShipmentNotification generates a white-labeled email', async (t) => {
  const originalKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = ''; // Forces local logging fallback to capture HTML output

  t.after(() => {
    process.env.RESEND_API_KEY = originalKey;
  });

  const shipments = [
    {
      carrier: 'DHL Express',
      trackingNumber: 'DHL987654321',
      trackingUrl: 'https://dhl.com/track/987654321'
    }
  ];

  const dispatchResult = await sendCustomerShipmentNotification(
    'Kekoa Alana',
    'kekoa@example.com',
    'GLP-SANDBOX99',
    shipments
  );

  assert.equal(dispatchResult.id, 'simulated');
  assert.ok(dispatchResult.file, 'Should return the path of the simulated email file.');

  const emailBody = fs.readFileSync(dispatchResult.file, 'utf8');

  // Verify personalized content is rendered correctly
  assert.match(emailBody, /Kekoa Alana/, 'Should address the customer by name');
  assert.match(emailBody, /GLP-SANDBOX99/, 'Should display the correct order reference');
  assert.match(emailBody, /DHL Express/, 'Should list the carrier name');
  assert.match(emailBody, /DHL987654321/, 'Should display the tracking number');
  assert.match(emailBody, /https:\/\/dhl.com\/track\/987654321/, 'Should include the tracking url');

  // Verify white-labeling constraints
  assert.doesNotMatch(emailBody, /Prodigi/i, 'The email must not contain any reference to Prodigi (case-insensitive)');
  
  // Cleanup test file
  if (fs.existsSync(dispatchResult.file)) {
    fs.unlinkSync(dispatchResult.file);
  }
});
