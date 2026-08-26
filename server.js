require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { buildLineItems } = require('./utils/checkout-validation');
const { buildOrderRecord, persistOrderRecord } = require('./utils/order-record');
const { fulfillOrder } = require('./utils/fulfillment');

// Initialize Stripe (will fail gracefully if placeholder keys are still set)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey.startsWith('sk_') ? require('stripe')(stripeSecretKey) : null;

const app = express();
const PORT = process.env.PORT || 8080;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SITE_URL = (process.env.SITE_URL || 'https://gliciouspics.com').replace(/\/+$/, '');

// ─────────────────────────────────────────────────────────────────────────
// Products database — loaded before any route can be served.
// ─────────────────────────────────────────────────────────────────────────
let productsDatabase = null;
try {
  productsDatabase = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8')
  );
  console.log('Successfully loaded products database.');
} catch (error) {
  console.error('Failed to load products.json:', error);
}

// ─────────────────────────────────────────────────────────────────────────
// Startup configuration check.
//
// The live launch failed because environment variables were valid-looking but
// pointed at the wrong Stripe mode / Prodigi environment. Nothing here can
// read your dashboard, but everything that IS checkable gets checked loudly at
// boot rather than discovered during a customer's checkout.
// ─────────────────────────────────────────────────────────────────────────
function checkConfiguration() {
  const problems = [];
  const warnings = [];

  if (!stripeSecretKey) problems.push('STRIPE_SECRET_KEY is not set — checkout is disabled.');
  if (!process.env.STRIPE_WEBHOOK_SECRET) problems.push('STRIPE_WEBHOOK_SECRET is not set — no order will ever be fulfilled.');
  if (!process.env.RESEND_API_KEY) problems.push('RESEND_API_KEY is not set — no confirmation emails will send.');
  if (!process.env.OWNER_EMAIL) problems.push('OWNER_EMAIL is not set — you will not be told when an order arrives.');
  if (!process.env.PRODIGI_API_KEY) problems.push('PRODIGI_API_KEY is not set — no order will reach the print lab.');

  const liveKey = stripeSecretKey.startsWith('sk_live_');
  const testKey = stripeSecretKey.startsWith('sk_test_');
  const sandboxProdigi = (process.env.PRODIGI_API_URL || '').includes('sandbox');

  if (IS_PRODUCTION && testKey) {
    warnings.push('NODE_ENV=production but STRIPE_SECRET_KEY is a TEST key — no real payments will be taken.');
  }
  // The mismatch that hides a live order in the sandbox dashboard.
  if (liveKey && sandboxProdigi) {
    warnings.push(
      'STRIPE_SECRET_KEY is LIVE but PRODIGI_API_URL points at the SANDBOX. Real orders ' +
        'will be accepted into the sandbox, never printed, and invisible at dashboard.prodigi.com. ' +
        'Set PRODIGI_API_URL=https://api.prodigi.com/v4.0 and use your live Prodigi key.'
    );
  }
  if (liveKey && !process.env.PRODIGI_API_URL) {
    warnings.push('PRODIGI_API_URL is unset — defaulting to LIVE Prodigi. Confirm PRODIGI_API_KEY is your live key.');
  }
  if (!IS_PRODUCTION) {
    warnings.push('NODE_ENV is not "production". Railway does not always set this — confirm it if this is the live service.');
  }

  for (const p of problems) console.error(`[CONFIG] MISSING: ${p}`);
  for (const w of warnings) console.warn(`[CONFIG] WARNING: ${w}`);
  if (!problems.length && !warnings.length) console.log('[CONFIG] All required environment variables are present.');

  return { problems, warnings };
}
const configReport = checkConfiguration();

// ─────────────────────────────────────────────────────────────────────────
// Stripe webhook.
// Must come before express.json() so the raw body is available for signature
// verification.
// ─────────────────────────────────────────────────────────────────────────

// Events that represent "money is captured, go fulfill this".
const FULFILLABLE_EVENTS = new Set([
  'checkout.session.completed',
  // Fires when a delayed payment method finally clears. Without this an order
  // paid by anything other than a card would silently never be fulfilled.
  'checkout.session.async_payment_succeeded'
]);

async function fetchLineItems(session) {
  try {
    const response = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ['data.price.product']
    });
    return response.data;
  } catch (stripeError) {
    // Fallback for local testing / mock checkout sessions only.
    if (!IS_PRODUCTION && (session.id.startsWith('cs_test_mock') || !stripeSecretKey.startsWith('sk_'))) {
      console.log('Stripe API call failed or is mocked, using fallback mock line items for testing');
      return [
        {
          description: 'Koko Head Sunrise',
          quantity: 1,
          amount_subtotal: 15000,
          amount_total: 15000,
          price: { product: { metadata: { productId: 'oahu-koko-head-landscape-fine-art-02', size: '12x18', material: 'Lustre Paper' } } }
        },
        {
          description: 'Mount Fuji from Honcho Street',
          quantity: 1,
          amount_subtotal: 35000,
          amount_total: 35000,
          price: { product: { metadata: { productId: 'japan-mount-fuji-honcho-street-photography', size: '16x24', material: 'Chromaluxe Metal' } } }
        }
      ];
    }
    throw stripeError;
  }
}

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
    if (!IS_PRODUCTION && webhookSecret === 'whsec_placeholder' && (!sig || sig === 'mock')) {
      console.log('Bypassing webhook signature verification for local testing with whsec_placeholder');
      event = JSON.parse(req.body.toString());
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
  } catch (err) {
    // The most common cause is a signing secret from the wrong Stripe mode:
    // test-mode and live-mode endpoints each have their own whsec_.
    console.error(
      `Webhook Error in signature verification: ${err.message}. ` +
        'Check that STRIPE_WEBHOOK_SECRET matches the signing secret of the endpoint ' +
        `in the ${stripeSecretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'} mode Stripe dashboard.`
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Acknowledge anything we do not act on, so Stripe does not retry it.
  if (!FULFILLABLE_EVENTS.has(event.type)) {
    return res.json({ received: true, handled: false });
  }

  const session = event.data.object;

  // `checkout.session.completed` can fire before the money is actually
  // captured. Fulfilling an unpaid session ships a print for free.
  if (session.payment_status === 'unpaid') {
    console.log(
      `Session ${session.id} completed but payment_status=unpaid — waiting for ` +
        'checkout.session.async_payment_succeeded before fulfilling.'
    );
    return res.json({ received: true, handled: false, reason: 'payment_pending' });
  }

  try {
    console.log(`Processing ${event.type} for session: ${session.id} (event ${event.id})`);

    const lineItems = await fetchLineItems(session);
    const record = buildOrderRecord(session, lineItems, productsDatabase);

    // Durable copy FIRST — before any step that can fail. Even a total
    // downstream outage now leaves a complete record of what was bought.
    persistOrderRecord(record);

    const result = await fulfillOrder({ stripe, record, productsDatabase });

    if (result.failures.length) {
      console.error(
        `Order ${record.orderRef} completed with failures: ${result.failures.join(', ')} ` +
          `(retryable: ${result.retryable})`
      );
      if (result.retryable) {
        // Non-2xx makes Stripe redeliver. Completed stages are recorded, so a
        // redelivery only retries what actually failed — and a persistently
        // failing endpoint triggers Stripe's own email alert to you.
        return res.status(500).json({
          received: true,
          error: `Fulfillment incomplete: ${result.failures.join(', ')}`
        });
      }
      // Permanent failure: retrying cannot help, so stop the retry loop and
      // rely on the alert. Do not let Stripe hammer a doomed order.
      return res.json({ received: true, handled: true, failures: result.failures });
    }

    console.log(`Successfully completed webhook processing for session: ${session.id}`);
    return res.json({ received: true, handled: true });
  } catch (error) {
    console.error(`Error processing webhook event ${event.id}: ${error.message}`);
    return res.status(500).send(`Internal Server Error: ${error.message}`);
  }
});

// Parse JSON request bodies (everything below the webhook)
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────

// Operational health check: reports configuration problems without exposing
// any secret values. Point Railway's healthcheck or an uptime monitor here.
app.get('/api/health', (req, res) => {
  const healthy = configReport.problems.length === 0;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'misconfigured',
    problems: configReport.problems,
    warnings: configReport.warnings,
    catalogLoaded: Boolean(productsDatabase)
  });
});

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
    const hasMetal = Array.isArray(items) && items.some(item => item.material === 'Chromaluxe Metal');
    const allowedCountries = hasMetal
      ? ['US']
      : [
          'US', 'MX',
          'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'PT', 'IE', 'PL', 'CZ', 'HU', 'RO', 'GR',
          'CA', 'AU', 'JP'
        ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: allowedCountries },
      phone_number_collection: { enabled: true },
      // Built from our own configured site URL, never from a client-supplied
      // Referer header — that let a crafted request point the post-payment
      // redirect at an arbitrary origin.
      success_url: `${SITE_URL}/pages/cart.html?checkout=success`,
      cancel_url: `${SITE_URL}/pages/cart.html?checkout=cancelled`
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

// ─────────────────────────────────────────────────────────────────────────
// Static assets.
//
// Explicit allowlist. Serving the whole project root previously exposed
// node_modules, package.json, the scratch scripts, and — most seriously —
// the orders/ and temp_emails/ directories this app writes customer names,
// addresses, phone numbers and emails into.
// ─────────────────────────────────────────────────────────────────────────

// 301 redirects for legacy product page URLs (previously handled by netlify.toml)
app.get('/pages/product-standard.html', (req, res) => res.redirect(301, '/pages/product.html'));
app.get('/pages/product-panorama.html', (req, res) => res.redirect(301, '/pages/product.html'));
app.get('/pages/product-aerial.html', (req, res) => res.redirect(301, '/pages/product.html'));

const STATIC_DIRS = ['css', 'js', 'pages'];
for (const dir of STATIC_DIRS) {
  app.use(`/${dir}`, express.static(path.join(__dirname, dir)));
}

const PUBLIC_ROOT_FILES = [
  'index.html',
  '404.html',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  'products.json'
];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
for (const file of PUBLIC_ROOT_FILES) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
}

// Unknown routes get a real 404 rather than a 200 page of index.html, which
// search engines read as a soft 404.
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
