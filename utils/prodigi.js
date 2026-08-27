const { findProduct } = require('./checkout-validation');

const DEFAULT_PRODIGI_API_URL = 'https://api.prodigi.com/v4.0';
const SANDBOX_PRODIGI_API_URL = 'https://api.sandbox.prodigi.com/v4.0';
const PRODIGI_TIMEOUT_MS = Number(process.env.PRODIGI_TIMEOUT_MS || 15000);

async function createProdigiOrder(payload, productsDatabase) {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { ok: false, statusCode: 500, error: 'Prodigi print API is not configured on the server.' };
  }

  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, statusCode: 400, error: 'Invalid order structure: "items" must be a non-empty array.' };
  }

  const shipping = payload.shippingAddress || payload.address || {};
  const trim = (v) => (v == null ? '' : String(v).trim());
  const line2 = trim(shipping.line2);
  // Prodigi's API rejects empty strings on optional fields like line2 — they
  // want the key omitted entirely when there's no value. Required fields are
  // always sent (empty string flags them as missing in Prodigi's validation,
  // which is what we want — better a clear validation error than silent drop).
  const prodigiAddress = {
    line1: trim(shipping.line1),
    townOrCity: trim(shipping.city || shipping.townOrCity),
    stateOrCounty: trim(shipping.state || shipping.stateOrCounty),
    postalOrZipCode: trim(shipping.postal_code || shipping.postalOrZipCode),
    countryCode: trim(shipping.country || shipping.countryCode),
    ...(line2 && { line2 })
  };

  const recipient = {
    name: payload.recipientName || payload.shippingName || payload.name || 'Valued Customer',
    email: payload.customerEmail || payload.email || '',
    address: prodigiAddress
  };

  let prodigiItems;
  try {
    prodigiItems = payload.items.map(item => {
      const productId = item.id || item.productId;
      if (!productId) {
        throw new Error(`Item with SKU "${item.sku}" is missing a product ID ("id" or "productId").`);
      }

      const product = findProduct(productsDatabase, productId);
      if (!product) {
        throw new Error(`Product with ID "${productId}" not found in products.json.`);
      }

      if (!product.images || !product.images.printImageUrl) {
        throw new Error(`Product "${productId}" is missing images.printImageUrl in products.json.`);
      }

      return {
        sku: item.sku,
        copies: parseInt(item.quantity || item.copies || 1, 10),
        sizing: 'fillPrintArea',
        assets: [{ printArea: 'default', url: product.images.printImageUrl }],
        // Echoed back on every callback. Without it a shipment notification
        // cannot say WHICH print shipped — a SKU like GLOBAL-PAP-12X18 is
        // shared by every 12x18 lustre print in the catalogue.
        merchantReference: productId
      };
    });
  } catch (err) {
    return { ok: false, statusCode: 400, error: err.message };
  }

  const requestBody = {
    shippingMethod: payload.shippingMethod || 'Standard',
    recipient,
    items: prodigiItems,
    // Our order reference, echoed back on Prodigi's side. Gives support a
    // shared key when reconciling, and makes an accidental duplicate obvious
    // instead of anonymous.
    ...(payload.merchantReference && { merchantReference: payload.merchantReference }),
    // Where Prodigi posts status changes and shipment notifications. Also
    // configurable account-wide in the Prodigi dashboard, which is the only
    // way to cover orders that were placed before this was set.
    ...(payload.callbackUrl && { callbackUrl: payload.callbackUrl })
  };

  const baseUrl = process.env.PRODIGI_API_URL || DEFAULT_PRODIGI_API_URL;
  const isSandbox = baseUrl.includes('sandbox');

  // A live order silently landing in the sandbox is invisible in the live
  // dashboard and never prints. Say which environment we are talking to on
  // every single order rather than leaving it to be inferred.
  if (isSandbox && process.env.NODE_ENV === 'production') {
    console.warn(
      '[PRODIGI] WARNING: NODE_ENV=production but PRODIGI_API_URL points at the ' +
        'SANDBOX. This order will not be printed or shipped. Set PRODIGI_API_URL=' +
        `${DEFAULT_PRODIGI_API_URL} and use your live key.`
    );
  }
  console.log(`Sending order request to Prodigi (${isSandbox ? 'SANDBOX' : 'LIVE'}: ${baseUrl})...`);

  let response;
  try {
    response = await fetch(`${baseUrl}/Orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(requestBody),
      // Node's fetch waits forever by default. An untimed call here used to
      // block the customer's confirmation email and run out Stripe's 30s
      // webhook budget, turning a slow print API into a failed delivery.
      signal: AbortSignal.timeout(PRODIGI_TIMEOUT_MS)
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError'
      ? `Prodigi did not respond within ${PRODIGI_TIMEOUT_MS}ms`
      : err.message || 'Internal Server Error';
    console.error('Error calling Prodigi API:', reason);
    // No statusCode: the caller treats a transport failure as retryable.
    return { ok: false, error: reason, environment: isSandbox ? 'sandbox' : 'live' };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error('Prodigi API returned an error:', data);
    return {
      ok: false,
      statusCode: response.status,
      error: `Prodigi order creation failed (HTTP ${response.status}): ${JSON.stringify(data)}`,
      data,
      environment: isSandbox ? 'sandbox' : 'live'
    };
  }

  console.log(`Prodigi order created successfully (${isSandbox ? 'SANDBOX' : 'LIVE'}):`, data?.order?.id);
  return { ok: true, statusCode: 201, data, environment: isSandbox ? 'sandbox' : 'live' };
}

/**
 * Fetch one order from Prodigi by its id.
 *
 * This is the trust anchor for callback handling. Prodigi's callbacks carry no
 * signature or auth header, so the callback body is treated purely as a hint
 * that something changed; every fact we act on is read back from the API using
 * our own key. A forged callback therefore cannot invent a shipment or
 * redirect a customer email.
 */
async function getProdigiOrder(orderId) {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { ok: false, statusCode: 500, error: 'Prodigi print API is not configured on the server.' };
  }
  if (!orderId || typeof orderId !== 'string') {
    return { ok: false, statusCode: 400, error: 'A Prodigi order id is required.' };
  }

  const baseUrl = process.env.PRODIGI_API_URL || DEFAULT_PRODIGI_API_URL;

  let response;
  try {
    response = await fetch(`${baseUrl}/Orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(PRODIGI_TIMEOUT_MS)
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError'
      ? `Prodigi did not respond within ${PRODIGI_TIMEOUT_MS}ms`
      : err.message || 'Internal Server Error';
    // No statusCode: transport failure, so the caller treats it as retryable.
    return { ok: false, error: reason };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      error: `Could not fetch Prodigi order ${orderId} (HTTP ${response.status})`,
      data
    };
  }

  if (!data || !data.order) {
    return { ok: false, statusCode: 502, error: `Prodigi returned no order body for ${orderId}` };
  }

  return { ok: true, statusCode: 200, order: data.order };
}

module.exports = {
  createProdigiOrder,
  getProdigiOrder,
  DEFAULT_PRODIGI_API_URL,
  SANDBOX_PRODIGI_API_URL
};
