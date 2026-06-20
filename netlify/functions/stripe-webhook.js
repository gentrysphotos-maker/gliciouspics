/**
 * Netlify Function: Stripe Webhook
 * Listens for checkout.session.completed events from Stripe,
 * resolves product details from products.json, and submits order to Prodigi.
 */

const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
  console.error('Failed to load products.json in Stripe webhook function:', error);
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

// Helper to map material & size to standard Prodigi SKUs
function getProdigiSku(material, size) {
  let prefix = 'GLOBAL-PAP'; // Default fallback
  
  if (material) {
    const mat = material.toLowerCase();
    if (mat.includes('metal') || mat.includes('chromaluxe')) {
      prefix = 'GLOBAL-MET';
    } else if (mat.includes('matte')) {
      prefix = 'GLOBAL-FAP';
    } else if (mat.includes('lustre') || mat.includes('paper')) {
      prefix = 'GLOBAL-PAP';
    }
  }

  // Format size: uppercase, no spaces, replace lowercase 'x' with 'X'
  const formattedSize = (size || '12x18').toUpperCase().replace(/\s+/g, '');
  return `${prefix}-${formattedSize}`;
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

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Webhook Error: STRIPE_WEBHOOK_SECRET is not set.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Webhook Secret is not configured.' })
    };
  }

  let stripeEvent;
  try {
    // Local development bypass support for easy testing
    if (process.env.NODE_ENV !== 'production' && webhookSecret === 'whsec_placeholder' && (!sig || sig === 'mock')) {
      console.log('Bypassing webhook signature verification for local testing with whsec_placeholder');
      stripeEvent = JSON.parse(event.body);
    } else {
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
    }
  } catch (err) {
    console.error(`Stripe Webhook Signature Verification Failed: ${err.message}`);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Webhook Error: ${err.message}` })
    };
  }

  try {
    // Process only checkout.session.completed
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      console.log(`Processing Stripe session checkout completion: ${session.id}`);

      // Retrieve full line items with expanded product data
      const lineItemsResponse = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ['data.price.product']
      });

      const items = lineItemsResponse.data.map(lineItem => {
        const stripeProduct = lineItem.price && lineItem.price.product;
        const metadata = (stripeProduct && stripeProduct.metadata) ? stripeProduct.metadata : {};
        
        const productId = metadata.productId || 'unknown';
        const size = metadata.size || '12x18';
        const material = metadata.material || 'Lustre Paper';

        // Retrieve product from products.json to verify it exists
        const localProduct = findProduct(productId);
        if (!localProduct) {
          console.warn(`Product with ID "${productId}" not found in products.json.`);
        }

        const sku = getProdigiSku(material, size);

        return {
          id: productId,
          sku: sku,
          quantity: lineItem.quantity
        };
      });

      // Extract customer shipping details
      const shipping = session.shipping_details || {};
      const address = shipping.address || {};

      const prodigiOrderPayload = {
        customerEmail: session.customer_details ? session.customer_details.email : 'unknown@example.com',
        recipientName: shipping.name || (session.customer_details ? session.customer_details.name : 'Valued Customer'),
        shippingAddress: {
          line1: address.line1 || '',
          line2: address.line2 || '',
          city: address.city || '',
          state: address.state || '',
          postal_code: address.postal_code || '',
          country: address.country || ''
        },
        items: items
      };

      console.log('Sending internal request to create-prodigi-order handler...');
      console.log('Prodigi Order Payload:', JSON.stringify(prodigiOrderPayload, null, 2));

      // Import the create-prodigi-order handler function
      const createProdigiOrder = require('./create-prodigi-order').handler;

      const mockEvent = {
        httpMethod: 'POST',
        body: JSON.stringify(prodigiOrderPayload)
      };

      const prodigiResponse = await createProdigiOrder(mockEvent, {});
      console.log(`Internal create-prodigi-order response status: ${prodigiResponse.statusCode}`);
      console.log(`Internal create-prodigi-order response body: ${prodigiResponse.body}`);

      const parsedResponse = JSON.parse(prodigiResponse.body);
      if (prodigiResponse.statusCode !== 201) {
        console.error('Prodigi order creation failed via webhook processing:', parsedResponse.error);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Stripe webhook processed but Prodigi order creation failed',
            details: parsedResponse
          })
        };
      }

      console.log('Prodigi order successfully created!');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true })
    };

  } catch (error) {
    console.error('Error handling Stripe webhook event:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
