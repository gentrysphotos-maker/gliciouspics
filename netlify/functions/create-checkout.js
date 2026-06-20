/**
 * Netlify Function: Create Checkout Session
 * Validates cart items against products.json and creates a Stripe Checkout Session
 * with shipping address, phone number collection, and customer email configuration.
 */

const fs = require('fs');
const path = require('path');
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

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
  console.error('Failed to load products.json in create-checkout function:', error);
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

  if (!stripe) {
    console.error('Stripe Configuration Error: STRIPE_SECRET_KEY is not defined.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Stripe is not configured. Please set a valid STRIPE_SECRET_KEY.'
      })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Cart is empty or invalid.' })
      };
    }

    const lineItems = [];

    // Validate each cart item against products.json
    for (const item of items) {
      const product = findProduct(item.id);
      if (!product) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Product not found: ${item.title}` })
        };
      }

      // Check if the material and size combination exists in products.json pricing
      const materialPricing = product.pricing[item.material];
      if (!materialPricing) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Invalid material: ${item.material} for ${product.title}` })
        };
      }

      const verifiedPrice = materialPricing[item.size];
      if (verifiedPrice === undefined || verifiedPrice === null) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Invalid size: ${item.size} for material ${item.material} of ${product.title}` })
        };
      }

      // Stripe unit amount is in cents
      const unitAmountInCents = Math.round(verifiedPrice * 100);

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${product.title} (${item.size} / ${item.material})`,
            images: product.images && product.images.hero ? [product.images.hero] : [],
            description: product.description || '',
            metadata: {
              productId: product.id,
              size: item.size,
              material: item.material
            }
          },
          unit_amount: unitAmountInCents,
        },
        quantity: item.quantity,
      });
    }

    // Determine the origin from the request headers
    const origin = event.headers.referer || event.headers.origin || 'http://localhost:8080';

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'JP'],
      },
      phone_number_collection: {
        enabled: true
      },
      success_url: `${origin.split('?')[0]}?checkout=success`,
      cancel_url: `${origin.split('?')[0]}?checkout=cancelled`,
    };

    // Make sure customer_email is collected/populated if provided in the body
    const email = body.customerEmail || body.email;
    if (email) {
      sessionParams.customer_email = email;
    }

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      })
    };

  } catch (error) {
    console.error('Error creating Stripe Checkout session:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
