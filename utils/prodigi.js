const { findProduct } = require('./checkout-validation');

const DEFAULT_PRODIGI_API_URL = 'https://api.sandbox.prodigi.com/v4.0';

async function createProdigiOrder(payload, productsDatabase) {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    return { ok: false, statusCode: 500, error: 'Prodigi print API is not configured on the server.' };
  }

  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, statusCode: 400, error: 'Invalid order structure: "items" must be a non-empty array.' };
  }

  const shipping = payload.shippingAddress || payload.address || {};
  const prodigiAddress = {
    line1: shipping.line1 || '',
    line2: shipping.line2 || '',
    townOrCity: shipping.city || shipping.townOrCity || '',
    stateOrCounty: shipping.state || shipping.stateOrCounty || '',
    postalOrZipCode: shipping.postal_code || shipping.postalOrZipCode || '',
    countryCode: shipping.country || shipping.countryCode || ''
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
        assets: [{ printArea: 'default', url: product.images.printImageUrl }]
      };
    });
  } catch (err) {
    return { ok: false, statusCode: 400, error: err.message };
  }

  const requestBody = {
    shippingMethod: payload.shippingMethod || 'Budget',
    recipient,
    items: prodigiItems
  };

  const baseUrl = process.env.PRODIGI_API_URL || DEFAULT_PRODIGI_API_URL;
  console.log(`Sending order request to Prodigi (${baseUrl})...`);

  try {
    const response = await fetch(`${baseUrl}/Orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Prodigi API returned an error:', data);
      return { ok: false, statusCode: response.status, error: 'Prodigi order creation failed', data };
    }

    console.log('Prodigi order created successfully:', data.order?.id);
    return { ok: true, statusCode: 201, data };
  } catch (err) {
    console.error('Error calling Prodigi API:', err);
    return { ok: false, statusCode: 500, error: err.message || 'Internal Server Error' };
  }
}

module.exports = { createProdigiOrder };
