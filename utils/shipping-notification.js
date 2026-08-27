/**
 * Customer-facing shipment notifications.
 *
 * Turns a Prodigi order (fetched from their API — never a raw callback body)
 * into "your order has shipped" emails, one per shipment.
 *
 * TWO RULES GOVERN THIS FILE
 *
 * 1. The customer never learns the print lab exists. Nothing from the order's
 *    fulfilmentLocation, labCode, item costs, or the word "Prodigi" may reach
 *    the email. Only the parcel's carrier, tracking and contents do.
 *
 * 2. One email per shipment, ever. Prodigi calls back on every stage change,
 *    so an order that ships will trigger the same "Shipped" shipment many
 *    times over. Without deduplication the customer is mailed on every one.
 *    Orders can also split across several parcels, each of which genuinely
 *    warrants its own email — so dedupe is keyed on shipment id, not order id.
 */

const { findProduct } = require('./checkout-validation');
const { describeProdigiSku } = require('./prodigi-sku');
const notifications = require('./notifications');

const NOTIFIED_KEY = 'glp_shipped_notified';
// Our own order references are the only thing we interpolate into a Stripe
// search query, so they are validated rather than escaped.
const ORDER_REF_PATTERN = /^GLP-[A-Z0-9]{1,32}$/;

// Best-effort guard against duplicate emails when two callbacks for the same
// shipment land close enough together to race the durable check. Process-local
// and bounded — a backstop, not the mechanism.
const recentlyNotified = new Set();
const RECENT_LIMIT = 500;

function rememberRecent(key) {
  if (recentlyNotified.size >= RECENT_LIMIT) {
    recentlyNotified.delete(recentlyNotified.values().next().value);
  }
  recentlyNotified.add(key);
}

// Carrier codes come back lowercase and unspaced ("royalmail"). Customers
// should see the name they will recognise on the tracking page.
const CARRIER_NAMES = {
  royalmail: 'Royal Mail',
  dhl: 'DHL',
  dhlgm: 'DHL',
  dhlexpress: 'DHL Express',
  fedex: 'FedEx',
  ups: 'UPS',
  usps: 'USPS',
  dpd: 'DPD',
  evri: 'Evri',
  hermes: 'Evri',
  tnt: 'TNT',
  australiapost: 'Australia Post',
  canadapost: 'Canada Post',
  yodel: 'Yodel',
  gls: 'GLS',
  parcelforce: 'Parcelforce'
};

function formatCarrier(carrier) {
  const raw = carrier && carrier.name ? String(carrier.name).trim() : '';
  if (!raw) return null;
  const known = CARRIER_NAMES[raw.toLowerCase().replace(/[\s_-]/g, '')];
  if (known) return known;
  // Unknown code: title-case it rather than showing a raw slug.
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Describe the prints inside one shipment.
 *
 * Item titles depend on the per-item merchantReference we set at order
 * creation. Orders placed before that existed resolve to nothing, so callers
 * must treat an empty array as "don't show an item list" rather than an error.
 */
function resolveShipmentItems(shipment, order, productsDatabase) {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const shipmentItemIds = (Array.isArray(shipment.items) ? shipment.items : [])
    .map((entry) => (entry && entry.itemId) || null)
    .filter(Boolean);

  // A shipment with no explicit item list is the whole order.
  const included = shipmentItemIds.length
    ? orderItems.filter((item) => shipmentItemIds.includes(item.id))
    : orderItems;

  return included
    .map((item) => {
      const product = findProduct(productsDatabase, item.merchantReference);
      if (!product) return null;
      const { size, material } = describeProdigiSku(item.sku);
      return {
        title: product.title,
        size,
        material,
        quantity: Number(item.copies) || 1,
        thumbnailUrl: product.images?.hero || null
      };
    })
    .filter(Boolean);
}

/**
 * Every shipment on the order that has actually gone out.
 * Prodigi shipment status is one of Processing, Cancelled or Shipped.
 */
function selectShippedShipments(order) {
  const shipments = Array.isArray(order.shipments) ? order.shipments : [];
  return shipments.filter(
    (shipment) =>
      shipment &&
      shipment.id &&
      String(shipment.status || '').toLowerCase() === 'shipped'
  );
}

/**
 * Assemble everything the email template needs from one shipment.
 * Pure, so the redaction rules above are unit-testable.
 */
function buildShipmentNotice(order, shipment, productsDatabase) {
  const recipient = order.recipient || {};
  const address = recipient.address || {};

  return {
    orderRef: order.merchantReference || null,
    shipmentId: shipment.id,
    customerEmail: recipient.email || '',
    customerName: recipient.name || '',
    carrier: formatCarrier(shipment.carrier),
    trackingNumber: shipment.tracking?.number || null,
    trackingUrl: shipment.tracking?.url || null,
    dispatchDate: shipment.dispatchDate || null,
    items: resolveShipmentItems(shipment, order, productsDatabase),
    // Re-mapped to the shape the existing email helpers already render.
    shippingName: recipient.name || '',
    shippingAddress: {
      line1: address.line1 || '',
      line2: address.line2 || '',
      city: address.townOrCity || '',
      state: address.stateOrCounty || '',
      postal_code: address.postalOrZipCode || '',
      country: address.countryCode || ''
    },
    isPartialShipment: selectShippedShipments(order).length > 1
  };
}

// ── Durable dedupe, backed by the payment's metadata ───────────────────────
// Same store as order fulfillment: no database, but durable across redeploys
// and shared between instances. Located by our order ref, which Prodigi echoes
// back as the order's merchantReference.

async function findPaymentIntent(stripe, orderRef) {
  if (!stripe || !orderRef || !ORDER_REF_PATTERN.test(orderRef)) return null;
  try {
    const result = await stripe.paymentIntents.search({
      query: `metadata['glp_order_ref']:'${orderRef}'`,
      limit: 1
    });
    return result.data[0] || null;
  } catch (error) {
    console.error(`[SHIPPING] Could not look up payment for ${orderRef}: ${error.message}`);
    return null;
  }
}

function parseNotified(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Persist the full list of notified shipment ids.
 *
 * Takes the running list rather than re-reading the PaymentIntent, because the
 * object we hold is a snapshot from the initial search: re-reading it for a
 * second parcel would see stale metadata and overwrite the first parcel's
 * record, re-notifying it after the next restart.
 */
async function persistNotified(stripe, paymentIntent, notified) {
  if (!paymentIntent) return;

  const joined = notified.join(',');
  // Stripe caps a metadata value at 500 characters. Shipment ids are short and
  // orders rarely split more than a few ways, but drop the oldest rather than
  // let the write fail and re-notify everything.
  const trimmed = joined.length > 480
    ? joined.slice(joined.length - 480).replace(/^[^,]*,/, '')
    : joined;

  try {
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: { [NOTIFIED_KEY]: trimmed }
    });
  } catch (error) {
    console.error(
      `[SHIPPING] Could not record notified shipments (${joined}): ${error.message}. ` +
        'A later callback may re-send these emails.'
    );
  }
}

/**
 * Send a shipping email for every shipment on this order that has gone out and
 * has not been emailed about already.
 *
 * Returns { sent, skipped, failures } — the caller decides the HTTP status.
 */
async function notifyShippedShipments({ stripe, order, productsDatabase }) {
  const shipped = selectShippedShipments(order);
  const orderRef = order.merchantReference || null;

  if (!shipped.length) {
    return { sent: [], skipped: [], failures: [], reason: 'no_shipped_shipments' };
  }

  const paymentIntent = await findPaymentIntent(stripe, orderRef);
  // Running list: seeded from the durable record, then extended in place as
  // each parcel is notified so a split order records every one of them.
  const notified = parseNotified(paymentIntent?.metadata?.[NOTIFIED_KEY]);

  if (!paymentIntent) {
    // Either a legacy order with no merchantReference, or Stripe is unreachable.
    // Fall back to the in-process guard: a duplicate email is a far smaller
    // failure than a customer never being told their order shipped.
    console.warn(
      `[SHIPPING] No durable dedupe record for order ref "${orderRef}" — ` +
        'relying on the in-process guard only; a redeploy could re-send.'
    );
  }

  const sent = [];
  const skipped = [];
  const failures = [];

  for (const shipment of shipped) {
    const guardKey = `${order.id}:${shipment.id}`;
    if (notified.includes(shipment.id) || recentlyNotified.has(guardKey)) {
      skipped.push(shipment.id);
      continue;
    }

    const notice = buildShipmentNotice(order, shipment, productsDatabase);
    if (!notice.customerEmail) {
      console.error(`[SHIPPING] Shipment ${shipment.id} has no recipient email — cannot notify.`);
      failures.push({ shipmentId: shipment.id, error: 'no recipient email on the order' });
      continue;
    }

    try {
      // Claim it first: if the send throws after the provider already accepted
      // it, a retry would mail the customer twice.
      rememberRecent(guardKey);
      await notifications.sendShippingConfirmation(notice);
      notified.push(shipment.id);
      await persistNotified(stripe, paymentIntent, notified);
      sent.push(shipment.id);
      console.log(`[SHIPPING] Notified ${notice.customerEmail} about shipment ${shipment.id}.`);
    } catch (error) {
      recentlyNotified.delete(guardKey);
      console.error(`[SHIPPING] Failed to notify about shipment ${shipment.id}: ${error.message}`);
      failures.push({ shipmentId: shipment.id, error: error.message, statusCode: error.statusCode });
    }
  }

  return { sent, skipped, failures };
}

/**
 * The URL Prodigi should post status changes to, or null when no secret is
 * configured. The secret sits in the path because Prodigi callbacks carry no
 * signature — an unguessable URL is the only thing standing between the
 * endpoint and the open internet, which is also why the handler re-fetches
 * the order rather than trusting whatever was posted to it.
 */
function prodigiCallbackUrl() {
  const secret = process.env.PRODIGI_CALLBACK_SECRET;
  if (!secret) return null;
  const site = (process.env.SITE_URL || 'https://gliciouspics.com').replace(/\/+$/, '');
  return `${site}/api/webhooks/prodigi/${encodeURIComponent(secret)}`;
}

module.exports = {
  NOTIFIED_KEY,
  prodigiCallbackUrl,
  formatCarrier,
  resolveShipmentItems,
  selectShippedShipments,
  buildShipmentNotice,
  notifyShippedShipments,
  __testing: { recentlyNotified }
};
