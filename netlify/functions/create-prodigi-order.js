/**
 * Netlify Function: Create Prodigi Order
 * Sends order data to the Prodigi Print API sandbox environment.
 * 
 * Expected request body:
 * {
 *   "customerEmail": "customer@example.com",
 *   "recipientName": "Jane Doe",
 *   "shippingAddress": {
 *     "line1": "1234 Makai Place",
 *     "line2": "Apt B",
 *     "city": "Honolulu",
 *     "state": "HI",
 *     "postal_code": "96815",
 *     "country": "US"
 *   },
 *   "items": [
 *     {
 *       "sku": "GLOBAL-CAN-12X18",
 *       "imageUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
 *       "quantity": 1
 *     }
 *   ]
 * }
 */

const fs = require('fs');
const path = require('path');

// Load products database
let productsDatabase = null;
try {
  let dataPath = path.join(__dirname, '../../products.json');
  if (!fs.existsSync(dataPath)) {
    dataPath = path.join(process.cwd(), 'products.json');
  }
  productsDatabase = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log('Successfully loaded products database.');
} catch (error) {
  console.error('Failed to load products.json in Netlify function:', error);
}

// Helper to find a product in any of the categories
function findProduct(productId) {
  if (!productsDatabase) return null;
  const categories = ['standard', 'panoramas', 'aerial'];
  for (const cat of categories) {
    if (productsDatabase[cat]) {
      const product = productsDatabase[cat].find(p => p.id === productId);
      if (product) return product;
    }
  }
  return null;
}

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // Ensure Prodigi API key is configured
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) {
    console.error('Prodigi Configuration Error: PRODIGI_API_KEY is not defined.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Prodigi print API is not configured on the server.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Basic request body validation
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid order structure: "items" must be a non-empty array.' })
      };
    }

    // Map shipping address to Prodigi format
    const shipping = body.shippingAddress || body.address || {};
    const prodigiAddress = {
      line1: shipping.line1 || '',
      line2: shipping.line2 || '',
      townOrCity: shipping.city || shipping.townOrCity || '',
      stateOrCounty: shipping.state || shipping.stateOrCounty || '',
      postalOrZipCode: shipping.postal_code || shipping.postalOrZipCode || '',
      countryCode: shipping.country || shipping.countryCode || ''
    };

    // Map recipient details
    const recipient = {
      name: body.recipientName || body.shippingName || body.name || 'Valued Customer',
      email: body.customerEmail || body.email || '',
      address: prodigiAddress
    };

    // Map ordered items
    const prodigiItems = body.items.map(item => {
      // Find the product by its id or productId
      const productId = item.id || item.productId;
      if (!productId) {
        throw new Error(`Item with SKU "${item.sku}" is missing a product ID ("id" or "productId").`);
      }

      const product = findProduct(productId);
      if (!product) {
        throw new Error(`Product with ID "${productId}" not found in products.json.`);
      }

      if (!product.images || !product.images.printImageUrl) {
        throw new Error(`Product "${productId}" is missing images.printImageUrl in products.json.`);
      }

      const assetUrl = product.images.printImageUrl;

      return {
        sku: item.sku,
        copies: parseInt(item.quantity || item.copies || 1, 10),
        sizing: 'fillPrintArea',
        assets: [
          {
            printArea: 'default',
            url: assetUrl
          }
        ]
      };
    });

    // Build complete Prodigi API request body
    const prodigiRequestBody = {
      shippingMethod: body.shippingMethod || 'Budget',
      recipient: recipient,
      items: prodigiItems
    };

    console.log('Sending order request to Prodigi Sandbox...');
    
    // Call Prodigi Sandbox API
    const response = await fetch('https://api.sandbox.prodigi.com/v4.0/Orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(prodigiRequestBody)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Prodigi API returned an error:', responseData);
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Prodigi order creation failed',
          details: responseData
        })
      };
    }

    console.log('Prodigi order created successfully:', responseData.order?.id);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('Error in create-prodigi-order function:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
