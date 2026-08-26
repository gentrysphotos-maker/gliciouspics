/**
 * Builds and persists the canonical record of a paid order.
 *
 * This runs BEFORE any fulfillment step (email, print lab) so that if a
 * downstream service is down we still have a durable copy of what the
 * customer paid for. Stripe should never be the only place an order exists.
 *
 * Durability note: Railway's container filesystem is ephemeral, so the
 * structured stdout line is the copy that actually survives a redeploy
 * (Railway retains logs). Point ORDER_STORE_DIR at a mounted volume — or
 * swap `persistOrderRecord` for a database write — to get a real store.
 */

const fs = require('fs');
const path = require('path');
const { getProdigiSku } = require('./prodigi-sku');
const { findProduct } = require('./checkout-validation');
const {
  extractShippingDetails,
  extractCustomerDetails,
  formatOrderRef
} = require('./stripe-session');

// Deliberately NOT inside the static-served tree — these records contain
// the customer's name, address, phone and email.
const ORDER_STORE_DIR =
  process.env.ORDER_STORE_DIR || path.join(__dirname, '..', '.order-records');

/**
 * Turn Stripe line items into our internal item shape.
 * Unit prices are taken from `amount_subtotal` (pre-tax) so that the figures
 * in the confirmation email match the prices shown on the product page.
 */
function buildItems(lineItems, productsDatabase) {
  return lineItems.map((lineItem) => {
    const product = lineItem.price && lineItem.price.product;
    const metadata = product && product.metadata ? product.metadata : {};
    const size = metadata.size || '12x18';
    const material = metadata.material || 'Lustre Paper';
    const productId = metadata.productId || 'unknown';
    const localProduct = findProduct(productsDatabase, productId);
    const quantity = lineItem.quantity || 1;
    const preTaxTotal =
      typeof lineItem.amount_subtotal === 'number'
        ? lineItem.amount_subtotal
        : lineItem.amount_total;

    return {
      id: productId,
      sku: getProdigiSku(material, size),
      title: lineItem.description || (localProduct ? localProduct.title : 'Unknown Print'),
      size,
      material,
      quantity,
      price: Math.round(preTaxTotal / quantity), // unit price in cents, pre-tax
      lineTotal: preTaxTotal, // in cents, pre-tax
      thumbnailUrl: localProduct?.images?.hero || null
    };
  });
}

/**
 * Assemble the full order record from a Checkout Session and its line items.
 * Pure — no I/O, so it can be unit-tested without Stripe.
 */
function buildOrderRecord(session, lineItems, productsDatabase) {
  const shipping = extractShippingDetails(session);
  const customer = extractCustomerDetails(session);
  const totals = session.total_details || {};

  return {
    orderId: session.id,
    orderRef: formatOrderRef(session.id),
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null,
    customerName: shipping.name || customer.name || 'Valued Customer',
    // No placeholder fallback: an order without a real email is a hard error,
    // not something to paper over by mailing unknown@example.com.
    customerEmail: customer.email || '',
    customerPhone: customer.phone,
    subtotalAmount: session.amount_subtotal ?? session.amount_total,
    taxAmount: totals.amount_tax ?? 0,
    shippingAmount: totals.amount_shipping ?? 0,
    discountAmount: totals.amount_discount ?? 0,
    totalAmount: session.amount_total,
    currency: session.currency,
    shippingAddress: shipping.address,
    shippingName: shipping.name,
    items: buildItems(lineItems, productsDatabase),
    createdAt: new Date().toISOString()
  };
}

/**
 * Persist the record: one structured stdout line (survives redeploys via the
 * platform log store) plus a JSON file (survives only if ORDER_STORE_DIR is a
 * mounted volume). Never throws — losing the archive copy must not abort a
 * fulfillment run that is otherwise fine.
 */
function persistOrderRecord(record) {
  // Single-line JSON so log search can pull a whole order back out by ref.
  console.log(`[ORDER_RECORD] ${JSON.stringify(record)}`);

  try {
    fs.mkdirSync(ORDER_STORE_DIR, { recursive: true });
    const filePath = path.join(ORDER_STORE_DIR, `order_${record.orderId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
    return { ok: true, filePath };
  } catch (error) {
    console.error(`[ORDER_RECORD] Could not write order file: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

module.exports = {
  ORDER_STORE_DIR,
  buildItems,
  buildOrderRecord,
  persistOrderRecord
};
