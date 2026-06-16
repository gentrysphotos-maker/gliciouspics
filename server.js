require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// Initialize Stripe (will fail gracefully if placeholder keys are still set)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey.startsWith('sk_') ? require('stripe')(stripeSecretKey) : null;

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON request bodies
app.use(express.json());

// Serve static files from the root of the project
app.use(express.static(path.join(__dirname)));

// Load products database
let productsDatabase = null;
try {
  const dataPath = path.join(__dirname, 'products.json');
  productsDatabase = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log('Successfully loaded products database.');
} catch (error) {
  console.error('Failed to load products.json:', error);
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

// POST /api/checkout - Create a Stripe Checkout Session
app.post('/api/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ 
      error: 'Stripe is not configured. Please set a valid STRIPE_SECRET_KEY in your .env file.' 
    });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty or invalid.' });
  }

  try {
    const lineItems = [];

    // Validate each cart item against products.json
    for (const item of items) {
      const product = findProduct(item.id);
      if (!product) {
        return res.status(400).json({ error: `Product not found: ${item.title}` });
      }

      // Check if the material and size combination exists in products.json pricing
      const materialPricing = product.pricing[item.material];
      if (!materialPricing) {
        return res.status(400).json({ error: `Invalid material: ${item.material} for ${product.title}` });
      }

      const verifiedPrice = materialPricing[item.size];
      if (verifiedPrice === undefined || verifiedPrice === null) {
        return res.status(400).json({ error: `Invalid size: ${item.size} for material ${item.material} of ${product.title}` });
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
          },
          unit_amount: unitAmountInCents,
        },
        quantity: item.quantity,
      });
    }

    // Determine the origin from the request headers
    const origin = req.headers.referer || req.headers.origin || `http://localhost:${PORT}`;

    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'FR', 'DE', 'IT', 'ES', 'JP'], // Expand as needed
      },
      success_url: `${origin.split('?')[0]}?checkout=success`,
      cancel_url: `${origin.split('?')[0]}?checkout=cancelled`,
    });

    res.json({ 
      id: session.id, 
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY 
    });
  } catch (error) {
    console.error('Error creating Stripe Checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback to serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
