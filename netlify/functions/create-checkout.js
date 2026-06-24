/**
 * Netlify Function: Create Checkout Session
 * Validates cart items against products.json and creates a Stripe Checkout Session
 * with shipping address, phone number collection, and customer email configuration.
 */

const fs = require('fs');
const path = require('path');
const { buildLineItems } = require('../../utils/checkout-validation');
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

    const validation = buildLineItems(productsDatabase, items);
    if (!validation.ok) {
      return {
        statusCode: validation.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: validation.error })
      };
    }
    const lineItems = validation.lineItems;

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
