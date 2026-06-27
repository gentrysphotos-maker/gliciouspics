require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { getProdigiSku } = require('./utils/prodigi-sku');
const { buildLineItems, findProduct } = require('./utils/checkout-validation');
const { createProdigiOrder } = require('./utils/prodigi');
const {
  extractShippingDetails,
  extractCustomerDetails,
  formatOrderRef
} = require('./utils/stripe-session');

// Initialize Stripe (will fail gracefully if placeholder keys are still set)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey.startsWith('sk_') ? require('stripe')(stripeSecretKey) : null;

const app = express();
const PORT = process.env.PORT || 8080;

// Webhook route must come before express.json() to capture raw buffer for signature verification
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(500).send('Stripe is not configured.');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Webhook Error: STRIPE_WEBHOOK_SECRET is not set.');
    return res.status(500).send('Webhook Secret is not configured.');
  }

  let event;
  try {
    if (process.env.NODE_ENV !== 'production' && webhookSecret === 'whsec_placeholder' && (!sig || sig === 'mock')) {
      console.log('Bypassing webhook signature verification for local testing with whsec_placeholder');
      event = JSON.parse(req.body.toString());
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
  } catch (err) {
    console.error(`Webhook Error in signature verification: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      console.log(`Processing completed checkout session: ${session.id}`);

      // Fetch expanded line items to get the product metadata
      let items;
      try {
        const lineItemsResponse = await stripe.checkout.sessions.listLineItems(session.id, {
          expand: ['data.price.product']
        });

        items = lineItemsResponse.data.map(lineItem => {
          const product = lineItem.price && lineItem.price.product;
          const metadata = product && product.metadata ? product.metadata : {};
          const size = metadata.size || '12x18';
          const material = metadata.material || 'Lustre Paper';
          const productId = metadata.productId || 'unknown';
          const localProduct = findProduct(productsDatabase, productId);

          return {
            id: productId,
            sku: getProdigiSku(material, size),
            title: lineItem.description || (localProduct ? localProduct.title : 'Unknown Print'),
            size,
            material,
            quantity: lineItem.quantity,
            price: lineItem.amount_total / lineItem.quantity, // in cents
            thumbnailUrl: localProduct?.images?.hero || null
          };
        });
      } catch (stripeError) {
        // Fallback for local testing / mock checkout sessions
        if (process.env.NODE_ENV !== 'production' && (session.id.startsWith('cs_test_mock') || !stripeSecretKey.startsWith('sk_'))) {
          console.log('Stripe API call failed or is mocked, using fallback mock line items for testing');
          items = [
            {
              id: 'oahu-koko-head-landscape-fine-art-02',
              sku: getProdigiSku('Lustre Paper', '12x18'),
              title: 'Koko Head Sunrise',
              size: '12x18',
              material: 'Lustre Paper',
              quantity: 1,
              price: 15000, // $150.00
              thumbnailUrl: null
            },
            {
              id: 'japan-mount-fuji-honcho-street-photography',
              sku: getProdigiSku('Chromaluxe Metal', '16x24'),
              title: 'Mount Fuji from Honcho Street',
              size: '16x24',
              material: 'Chromaluxe Metal',
              quantity: 1,
              price: 35000, // $350.00
              thumbnailUrl: null
            }
          ];
        } else {
          throw stripeError;
        }
      }

      const shipping = extractShippingDetails(session);
      const customer = extractCustomerDetails(session);
      const recipientName = shipping.name || customer.name || 'Valued Customer';

      const prodigiOrderPayload = {
        customerEmail: customer.email || 'unknown@example.com',
        recipientName,
        shippingAddress: {
          line1: shipping.address.line1,
          line2: shipping.address.line2,
          postalOrZipCode: shipping.address.postal_code,
          countryCode: shipping.address.country,
          townOrCity: shipping.address.city,
          stateOrCounty: shipping.address.state
        },
        items
      };

      const prodigiResult = await createProdigiOrder(prodigiOrderPayload, productsDatabase);
      const prodigiSuccess = prodigiResult.ok;
      const prodigiResponseData = prodigiSuccess ? prodigiResult.data : null;
      const prodigiErrorMessage = prodigiSuccess ? null : (prodigiResult.error || 'Unknown error');

      if (prodigiSuccess) {
        console.log(`Prodigi order created successfully. Prodigi Order ID: ${prodigiResponseData.order?.id}`);
      }

      const orderDetails = {
        orderId: session.id,
        orderRef: formatOrderRef(session.id),
        paymentIntentId: session.payment_intent,
        customerName: recipientName,
        customerEmail: customer.email || 'unknown@example.com',
        customerPhone: customer.phone,
        totalAmount: session.amount_total, // in cents
        currency: session.currency,
        shippingAddress: shipping.address,
        shippingName: shipping.name,
        items,
        prodigiSuccess,
        prodigiOrderId: prodigiSuccess ? (prodigiResponseData.order?.id || null) : null,
        prodigiError: prodigiErrorMessage,
        createdAt: new Date().toISOString()
      };

      // Save order to a local JSON file (dev only — production filesystem is ephemeral on Railway)
      if (process.env.NODE_ENV !== 'production') {
        const ordersDir = path.join(__dirname, 'orders');
        if (!fs.existsSync(ordersDir)) {
          fs.mkdirSync(ordersDir, { recursive: true });
        }
        const orderFilePath = path.join(ordersDir, `order_${session.id}.json`);
        fs.writeFileSync(orderFilePath, JSON.stringify(orderDetails, null, 2), 'utf8');
        console.log(`Saved order record to: ${orderFilePath}`);
      }

      // Send notifications
      const notifications = require('./utils/notifications');
      
      await Promise.all([
        notifications.sendCustomerConfirmation(orderDetails).catch(err => {
          console.error(`Error sending customer email: ${err.message}`);
        }),
        notifications.sendAdminNotification(orderDetails).catch(err => {
          console.error(`Error sending admin email: ${err.message}`);
        })
      ]);

      console.log(`Successfully completed webhook processing for session: ${session.id}`);
    } catch (error) {
      console.error(`Error processing webhook event: ${error.message}`);
      return res.status(500).send(`Internal Server Error: ${error.message}`);
    }
  }

  res.json({ received: true });
});

// Parse JSON request bodies
app.use(express.json());

// 301 redirects for legacy product page URLs (previously handled by netlify.toml)
app.get('/pages/product-standard.html', (req, res) => res.redirect(301, '/pages/product.html'));
app.get('/pages/product-panorama.html', (req, res) => res.redirect(301, '/pages/product.html'));
app.get('/pages/product-aerial.html', (req, res) => res.redirect(301, '/pages/product.html'));

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

// POST /api/checkout - Create a Stripe Checkout Session
app.post('/api/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ 
      error: 'Stripe is not configured. Please set a valid STRIPE_SECRET_KEY in your .env file.' 
    });
  }

  const { items } = req.body;
  const validation = buildLineItems(productsDatabase, items);
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }
  const lineItems = validation.lineItems;

  try {
    const origin = req.headers.referer || req.headers.origin || `http://localhost:${PORT}`;

    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE', 'FR', 'DE', 'IT', 'ES', 'JP'], // Expand as needed
      },
      phone_number_collection: {
        enabled: true
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
