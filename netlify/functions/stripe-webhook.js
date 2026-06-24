/**
 * Netlify Function: Stripe Webhook
 * Listens for checkout.session.completed events from Stripe,
 * resolves product details from products.json, and submits order to Prodigi.
 */

const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const notifications = require('../../utils/notifications');
const { getProdigiSku } = require('../../utils/prodigi-sku');
const { findProduct } = require('../../utils/checkout-validation');

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

// Helper to notify photographer (Gentry) if automatic print fulfillment fails
async function sendManualFulfillmentAlert(session, payload, errorMsg) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = 'gentrysphotos@gmail.com';
  const subject = 'Order Fulfillment Failed - Action Needed';
  const fromEmail = 'onboarding@resend.dev';
  
  const itemsListHtml = payload.items.map(item => `
    <li><strong>SKU:</strong> ${item.sku} (Product ID: ${item.id}) &times; ${item.quantity}</li>
  `).join('');

  const htmlBody = `
    <h2>Automatic Print Fulfillment Failed</h2>
    <p>We received payment for Stripe Session <strong>${session.id}</strong>, but automatic submission to the Prodigi Print API failed.</p>
    
    <div style="background-color: #f8d7da; color: #721c24; padding: 15px; border: 1px solid #f5c6cb; border-radius: 4px; margin-bottom: 20px;">
      <strong>Error details:</strong><br>
      <code>${errorMsg}</code>
    </div>

    <h3>Action Required:</h3>
    <p>Please place this order manually through the print lab / Prodigi dashboard.</p>

    <h3>Customer Details:</h3>
    <ul>
      <li><strong>Name:</strong> ${payload.recipientName}</li>
      <li><strong>Email:</strong> ${payload.customerEmail}</li>
    </ul>

    <h3>Shipping Address:</h3>
    <p style="font-family: monospace;">
      ${payload.recipientName}<br>
      ${payload.shippingAddress.line1}<br>
      ${payload.shippingAddress.line2 ? payload.shippingAddress.line2 + '<br>' : ''}
      ${payload.shippingAddress.townOrCity}, ${payload.shippingAddress.stateOrCounty} ${payload.shippingAddress.postalOrZipCode}<br>
      ${payload.shippingAddress.countryCode}
    </p>

    <h3>Order Items:</h3>
    <ul>
      ${itemsListHtml}
    </ul>
  `;

  if (!apiKey) {
    console.warn('[EMAIL NOTIFICATION] RESEND_API_KEY is not defined. Email simulated to:', to);
    console.log('From:', fromEmail);
    console.log('Subject:', subject);
    console.log('Body:', htmlBody);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: to,
        subject: subject,
        html: htmlBody
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend API returned an error:', data);
    } else {
      console.log(`Manual fulfillment notification email sent to ${to}. Resend ID: ${data.id}`);
    }
  } catch (error) {
    console.error('Error calling Resend API:', error);
  }
}

exports.handler = async (event, context) => {
  try {
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
        const localProduct = findProduct(productsDatabase, productId);
        if (!localProduct) {
          console.warn(`Product with ID "${productId}" not found in products.json.`);
        }

        const sku = getProdigiSku(material, size);

        return {
          id: productId,
          sku: sku,
          quantity: lineItem.quantity,
          title: lineItem.description || (localProduct ? localProduct.title : 'Unknown Print'),
          size: size,
          material: material,
          price: lineItem.amount_total / lineItem.quantity // in cents
        };
      });

      // Extract customer shipping details
      const shippingDetails = session.shipping_details || (session.collected_information && session.collected_information.shipping_details) || {};
      const address = shippingDetails.address || {};
      const customerDetails = session.customer_details || {};

      const prodigiOrderPayload = {
        customerEmail: customerDetails.email || 'unknown@example.com',
        recipientName: shippingDetails.name || customerDetails.name || 'Valued Customer',
        shippingAddress: {
          line1: address.line1 || '',
          line2: address.line2 || '',
          postalOrZipCode: address.postal_code || '',
          countryCode: address.country || '',
          townOrCity: address.city || '',
          stateOrCounty: address.state || ''
        },
        items: items
      };

      console.log('Sending internal request to create-prodigi-order handler...');
      console.log('Prodigi Order Payload:', JSON.stringify(prodigiOrderPayload, null, 2));

      let prodigiSuccess = false;
      let prodigiResponseData = null;
      let prodigiError = null;

      try {
        const createProdigiOrder = require('./create-prodigi-order').handler;
        const mockEvent = {
          httpMethod: 'POST',
          body: JSON.stringify(prodigiOrderPayload)
        };

        const prodigiResponse = await createProdigiOrder(mockEvent, {});
        console.log(`Internal create-prodigi-order response status: ${prodigiResponse.statusCode}`);
        
        prodigiResponseData = JSON.parse(prodigiResponse.body || '{}');

        if (prodigiResponse.statusCode === 201) {
          prodigiSuccess = true;
          console.log(`Prodigi order created successfully. Prodigi Order ID: ${prodigiResponseData.order?.id}`);
        } else {
          prodigiError = new Error(prodigiResponseData.error || 'Unknown error');
        }
      } catch (err) {
        prodigiError = err;
      }

      if (!prodigiSuccess) {
        const errorMsg = prodigiError ? prodigiError.message : 'Unknown error';
        console.error(`\n==================================================`);
        console.error(`[PRODIGI ORDER FAILED]`);
        console.error(`Stripe Session ID: ${session.id}`);
        console.error(`Customer Email: ${prodigiOrderPayload.customerEmail}`);
        console.error(`Error details:`, prodigiError);
        console.error(`Attempted Payload:`, JSON.stringify(prodigiOrderPayload, null, 2));
        console.error(`==================================================\n`);

        // Send alert email for manual fulfillment
        try {
          await sendManualFulfillmentAlert(session, prodigiOrderPayload, errorMsg);
        } catch (emailErr) {
          console.error('Failed to send manual fulfillment email alert:', emailErr);
        }

        // Return a 200 status so Stripe doesn't keep retrying the webhook
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            received: true,
            warning: 'Prodigi order creation failed, manual fulfillment notification triggered.'
          })
        };
      }

      // If we reach here, Prodigi order creation succeeded
      const orderDetails = {
        orderId: session.id,
        paymentIntentId: session.payment_intent,
        customerName: shippingDetails.name || customerDetails.name || 'Valued Customer',
        customerEmail: customerDetails.email || 'unknown@example.com',
        customerPhone: customerDetails.phone || null,
        totalAmount: session.amount_total, // in cents
        currency: session.currency,
        shippingAddress: {
          line1: address.line1 || '',
          line2: address.line2 || '',
          city: address.city || '',
          state: address.state || '',
          postal_code: address.postal_code || '',
          country: address.country || ''
        },
        shippingName: shippingDetails.name || '',
        items: items,
        createdAt: new Date().toISOString()
      };

      try {
        console.log('Sending success email notifications...');
        await Promise.all([
          notifications.sendCustomerConfirmation(orderDetails).catch(err => {
            console.error(`Error sending customer email: ${err.message}`);
          }),
          notifications.sendAdminNotification(orderDetails).catch(err => {
            console.error(`Error sending admin email: ${err.message}`);
          })
        ]);
      } catch (emailErr) {
        console.error('Failed to send success notifications:', emailErr);
      }
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
