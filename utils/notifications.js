const fs = require('fs');
const path = require('path');

const SITE_URL = (process.env.SITE_URL || 'https://gliciouspics.com').replace(/\/+$/, '');
const RESEND_TIMEOUT_MS = Number(process.env.RESEND_TIMEOUT_MS || 10000);

/**
 * Escape untrusted values before they go into email HTML. Names, titles and
 * address lines all originate from customer input via Stripe.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send one email through Resend.
 *
 * Throws an Error carrying `statusCode` so the caller can tell a transient
 * failure from a permanent one. It must NEVER resolve on failure — a silent
 * fallback here is what let a total email outage look like a healthy order.
 */
async function sendViaResend(to, subject, htmlBody) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = new Error('RESEND_API_KEY is missing');
    error.statusCode = 500;
    throw error;
  }

  // Prefer RESEND_FROM_EMAIL; default to the verified domain sender.
  // onboarding@resend.dev only works for the Resend account owner's inbox.
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || 'G.Licious Pics <orders@gliciouspics.com>';

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html: htmlBody }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS)
    });
  } catch (err) {
    // Network failure or timeout — no status code, so the caller treats it as
    // retryable.
    const error = new Error(`Resend request failed: ${err.message}`);
    throw error;
  }

  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`Resend API Error (Status ${response.status}): ${raw}`);
    error.statusCode = response.status;
    // The single most common production cause, called out by name so it is
    // obvious in the logs instead of buried in a JSON blob.
    if (response.status === 403 && /domain is not verified|not verified/i.test(raw)) {
      error.message +=
        ' — the sending domain is not verified in Resend. Verify gliciouspics.com ' +
        'under Resend > Domains (DNS records go on your registrar) before orders can send.';
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { id: 'unknown' };
  }
}

// Log email locally as a fallback
function logEmailLocally(to, subject, htmlBody) {
  const tempDir = path.join(__dirname, '..', 'temp_emails');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filename = `email_${Date.now()}_${subject.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
  const filePath = path.join(tempDir, filename);

  // Write content to a file
  fs.writeFileSync(filePath, htmlBody, 'utf8');

  console.log('\n==================================================');
  console.log(`[EMAIL DISPATCH - SIMULATED]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Preview File: file:///${filePath.replace(/\\/g, '/')}`);
  console.log('==================================================\n');

  return { id: 'simulated', file: filePath };
}

// Generate shared editorial styling wrapper for emails
function getEmailWrapper(contentHtml) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      background-color: #0f0f0f;
      color: #e8e4dc;
      font-family: 'Georgia', 'Times New Roman', serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      background-color: #0f0f0f;
      width: 100%;
      padding: 40px 0;
    }
    .container {
      background-color: #1a1a1a;
      border: 1px solid #333333;
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 30px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .logo {
      color: #c8a96e;
      font-family: 'Georgia', serif;
      font-size: 24px;
      font-weight: 300;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 1px solid #333333;
      padding-bottom: 20px;
    }
    h1 {
      font-size: 22px;
      font-weight: 400;
      color: #c8a96e;
      letter-spacing: -0.01em;
      margin-top: 0;
      margin-bottom: 20px;
      font-style: italic;
    }
    p, td {
      font-size: 14px;
      line-height: 1.6;
      color: #e8e4dc;
    }
    .muted {
      color: #9a9a9a;
      font-size: 13px;
    }
    .order-table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
    }
    .order-table th {
      border-bottom: 1px solid #333333;
      text-align: left;
      padding: 10px 5px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #9a9a9a;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
    .order-table td {
      padding: 15px 5px;
      border-bottom: 1px solid #222222;
      vertical-align: top;
    }
    .order-item-title {
      font-weight: 600;
      color: #e8e4dc;
      margin-bottom: 4px;
    }
    .order-item-desc {
      font-size: 12px;
      color: #9a9a9a;
    }
    .order-summary {
      margin-top: 20px;
      border-top: 1px solid #333333;
      padding-top: 15px;
      width: 100%;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .summary-label {
      color: #9a9a9a;
      font-size: 13px;
    }
    .summary-value {
      font-weight: bold;
      color: #e8e4dc;
    }
    .summary-row.total {
      border-top: 1px solid #222222;
      padding-top: 8px;
      margin-top: 8px;
    }
    .summary-row.total .summary-value {
      color: #c8a96e;
      font-size: 16px;
    }
    .address-box {
      background-color: #242424;
      border: 1px solid #333333;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .address-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #c8a96e;
      margin-bottom: 8px;
      font-weight: bold;
    }
    .footer {
      border-top: 1px solid #333333;
      padding-top: 20px;
      margin-top: 30px;
      font-size: 12px;
      text-align: center;
      color: #9a9a9a;
    }
    .footer a {
      color: #c8a96e;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    .btn {
      display: inline-block;
      background-color: #c8a96e;
      color: #0f0f0f !important;
      text-decoration: none;
      font-weight: bold;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 12px 24px;
      margin: 15px 0;
      border-radius: 2px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo"><a href="${SITE_URL}" style="color: #c8a96e; text-decoration: none;">G.Licious Pics</a></div>
      ${contentHtml}
      <div class="footer">
        <p>&copy; 2026 G.Licious Pics. All rights reserved.</p>
        <p>Representing the natural wonders of Hawaiʻi and beyond.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate receipt items table helper
function getItemsTableHtml(items) {
  const tableRows = items.map(item => {
    const size = escapeHtml(item.size || 'Standard');
    const material = escapeHtml(item.material || 'Lustre Paper');
    const title = escapeHtml(item.title);
    const quantity = Number(item.quantity) || 1;
    const unitPrice = (item.price / 100).toFixed(2);
    // Prefer the pre-tax line total Stripe reported; fall back to unit x qty.
    const lineTotalCents =
      typeof item.lineTotal === 'number' ? item.lineTotal : item.price * quantity;
    const lineTotal = (lineTotalCents / 100).toFixed(2);
    const thumbnailCell = item.thumbnailUrl
      ? `<img src="${encodeURI(item.thumbnailUrl)}" alt="${title}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:3px;border:1px solid #333333;object-fit:cover;">`
      : `<div style="width:64px;height:64px;border-radius:3px;border:1px solid #333333;background:#242424;"></div>`;

    return `
      <tr>
        <td style="width: 80px; padding-right: 12px;">${thumbnailCell}</td>
        <td>
          <div class="order-item-title">${title}</div>
          <div class="order-item-desc">${size} / ${material}</div>
        </td>
        <td style="text-align: center;">${quantity}</td>
        <td style="text-align: right;">$${unitPrice}</td>
        <td style="text-align: right;">$${lineTotal}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="order-table">
      <thead>
        <tr>
          <th style="width: 80px;"></th>
          <th>Print Title</th>
          <th style="width: 15%; text-align: center;">Qty</th>
          <th style="width: 15%; text-align: right;">Price</th>
          <th style="width: 15%; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}

// Format a Stripe-style address object for display. Falls back to "—" lines
// rather than the word "undefined" if any field is missing.
function formatShippingAddressHtml(name, address) {
  const safe = (v) => escapeHtml((v && String(v).trim()) || '');
  const line1 = safe(address?.line1);
  const line2 = safe(address?.line2);
  const city = safe(address?.city);
  const state = safe(address?.state);
  const postal = safe(address?.postal_code);
  const country = safe(address?.country);
  const cityLine = [city, state].filter(Boolean).join(', ') + (postal ? ` ${postal}` : '');
  return [
    safe(name),
    line1,
    line2,
    cityLine.trim(),
    country
  ].filter(Boolean).join('<br>') || '<em style="color:#9a9a9a;">No shipping address on file</em>';
}

// Internal: send via Resend.
//
// Local development with no API key still writes a preview file, because
// that is a genuine dev convenience. Everywhere else a failure PROPAGATES:
// the caller records the failure, alerts, and lets Stripe retry. Silently
// writing an HTML file to an ephemeral container disk and reporting success
// is how an email outage stayed invisible.
async function dispatchEmail(to, subject, htmlBody, label) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error(
        `RESEND_API_KEY is not set — cannot send ${label} email to ${to}.`
      );
      error.statusCode = 500;
      throw error;
    }
    return logEmailLocally(to, subject, htmlBody);
  }

  console.log(`Attempting to send ${label} email to: ${to} via Resend...`);
  const result = await sendViaResend(to, subject, htmlBody);
  console.log(`Sent ${label} email to ${to} (Resend id: ${result.id || 'unknown'}).`);
  return result;
}

// Send Order Confirmation to Customer
async function sendCustomerConfirmation(orderDetails) {
  const {
    customerEmail, customerName, items, totalAmount,
    subtotalAmount, taxAmount, shippingAmount, discountAmount,
    shippingAddress, shippingName, orderRef
  } = orderDetails;

  const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
  const itemsTable = getItemsTableHtml(items);
  const deliveryHtml = formatShippingAddressHtml(shippingName || customerName, shippingAddress);

  // Every figure Stripe actually charged, itemised. Previously the tax-inclusive
  // total was labelled "Subtotal" and repeated as "Total Paid", so any taxed
  // order produced a receipt whose numbers did not add up.
  const summaryRows = [
    `<div class="summary-row"><span class="summary-label">Subtotal</span><span class="summary-value">${money(subtotalAmount)}</span></div>`,
    discountAmount
      ? `<div class="summary-row"><span class="summary-label">Discount</span><span class="summary-value" style="color: #6aab8a;">-${money(discountAmount)}</span></div>`
      : '',
    `<div class="summary-row"><span class="summary-label">Shipping</span><span class="summary-value"${shippingAmount ? '' : ' style="color: #6aab8a;"'}>${shippingAmount ? money(shippingAmount) : 'FREE'}</span></div>`,
    taxAmount
      ? `<div class="summary-row"><span class="summary-label">Tax</span><span class="summary-value">${money(taxAmount)}</span></div>`
      : '',
    `<div class="summary-row total"><span class="summary-label">Total Paid</span><span class="summary-value">${money(totalAmount)}</span></div>`
  ].filter(Boolean).join('\n      ');

  const contentHtml = `
    <h1>Mahalo Nui Loa for your order, ${escapeHtml(customerName)}</h1>
    <p>We have successfully received your payment. Your fine art prints are being prepared. Each order is checked for accuracy before printing and shipping. Aloha!</p>

    <p class="muted">Order Ref: <strong>${escapeHtml(orderRef)}</strong></p>

    ${itemsTable}

    <div class="order-summary">
      ${summaryRows}
    </div>

    <div class="address-box">
      <div class="address-title">Delivery Address</div>
      <p style="margin: 0; font-family: monospace; font-size: 13px; color: #d4b84a;">
        ${deliveryHtml}
      </p>
    </div>

    <p><strong>Timeline & Fulfillment:</strong> Standard production time is 2-4 days for Lustre Paper prints and 5-7 days for ChromaLuxe Metal prints. You will receive an email containing tracking details as soon as your artwork ships.</p>

    <p class="muted">Note: If you need to make corrections or request changes, please reply to this email within 6 hours of purchase.</p>

    <div style="text-align: center; margin: 35px 0 10px;">
      <a href="${SITE_URL}" class="btn">Keep Shopping</a>
      <p class="muted" style="margin-top: 12px;">Browse more fine art prints at <a href="${SITE_URL}" style="color: #c8a96e;">gliciouspics.com</a></p>
    </div>
  `;

  return dispatchEmail(
    customerEmail,
    `Order Confirmed: ${orderRef}`,
    getEmailWrapper(contentHtml),
    'customer confirmation'
  );
}

// Send Order Notification to Owner (Gentry)
async function sendAdminNotification(orderDetails) {
  const {
    customerEmail, customerName, customerPhone, items, totalAmount,
    shippingAddress, shippingName, orderRef, orderId
  } = orderDetails;

  const formattedSubtotal = (totalAmount / 100).toFixed(2);
  const itemsTable = getItemsTableHtml(items);
  const shippingHtml = formatShippingAddressHtml(shippingName || customerName, shippingAddress);
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    // Silently mailing a placeholder address means the seller never learns an
    // order arrived. Fail loudly so the caller alerts and Stripe retries.
    const error = new Error('OWNER_EMAIL is not set — cannot send the seller order alert.');
    error.statusCode = 500;
    throw error;
  }

  // Production instructions for photographer
  const labInstructions = items.map(item =>
    `<li><strong>${escapeHtml(item.title)}</strong>: size ${escapeHtml(item.size || 'Standard')}, material ${escapeHtml(item.material || 'Lustre Paper')} &times; ${Number(item.quantity) || 1} (ID: ${escapeHtml(item.id)})</li>`
  ).join('');

  // A retry that turned a failure into a success must say so unmistakably —
  // the seller has already received a "place this manually" alert.
  const resolvedBanner = orderDetails.resolvedAfterFailure
    ? `
      <div style="background-color: #2c2519; border: 2px solid #c8a96e; padding: 15px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; color: #e8e4dc;">
        <strong style="color: #c8a96e;">UPDATE — this order no longer needs manual action.</strong><br>
        An earlier alert for this order said fulfillment had failed. It has since
        gone through automatically. <strong>Do not place this order manually</strong> —
        doing so would produce a duplicate print.
      </div>
    `
    : '';

  const fulfillmentBlock = orderDetails.prodigiSuccess
    ? `
      <div style="background-color: #1b2e21; border: 1px solid #5a9e6f; padding: 15px; border-radius: 4px; margin-top: 20px; font-size: 13px; color: #e8e4dc;">
        <strong style="color: #5a9e6f;">Automated Print Fulfillment: SUCCESS</strong><br>
        The order has been automatically submitted to Prodigi.<br>
        <strong>Prodigi Order ID:</strong> <code>${escapeHtml(orderDetails.prodigiOrderId)}</code>
      </div>
    `
    : `
      <div style="background-color: #2e1b1b; border: 1px solid #e05c5c; padding: 15px; border-radius: 4px; margin-top: 20px; font-size: 13px; color: #e8e4dc;">
        <strong style="color: #e05c5c;">Automated Print Fulfillment: FAILED / ACTION REQUIRED</strong><br>
        The order could not be automatically submitted to Prodigi.<br>
        <strong>Error details:</strong> <code>${escapeHtml(orderDetails.prodigiError || 'Not attempted')}</code><br><br>
        <em>Please place this order manually through the print lab or Prodigi dashboard.</em>
      </div>
    `;

  const contentHtml = `
    ${resolvedBanner}
    <h1>New Order Received!</h1>
    <p>An order has been completed via Stripe. Here are the order details for print fulfillment.</p>

    <p class="muted">
      Order Ref: <strong>${escapeHtml(orderRef)}</strong><br>
      Stripe Session: <code style="font-size: 11px;">${escapeHtml(orderId)}</code>
    </p>

    <div class="address-box">
      <div class="address-title">Customer Details</div>
      <p style="margin: 0; line-height: 1.5;">
        <strong>Name:</strong> ${escapeHtml(customerName)}<br>
        <strong>Email:</strong> ${escapeHtml(customerEmail)}<br>
        <strong>Phone:</strong> ${escapeHtml(customerPhone || 'Not provided')}
      </p>
    </div>

    ${itemsTable}

    <div class="order-summary">
      <div class="summary-row total">
        <span class="summary-label">Amount Collected</span>
        <span class="summary-value">$${formattedSubtotal}</span>
      </div>
    </div>

    <div class="address-box">
      <div class="address-title">Shipping Address</div>
      <p style="margin: 0; font-family: monospace; font-size: 13px; color: #d4b84a;">
        ${shippingHtml}
      </p>
    </div>

    ${fulfillmentBlock}

    <div style="background-color: #2c2519; border: 1px dashed #c8a96e; padding: 15px; border-radius: 4px; margin-top: 20px;">
      <h3 style="margin-top:0; color: #c8a96e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Fulfillment Checklist</h3>
      <ul style="margin: 0; padding-left: 15px; font-size: 13px; line-height: 1.6;">
        ${labInstructions}
      </ul>
      <p style="margin: 10px 0 0; font-size: 12px; color: #9a9a9a; font-style: italic;">
        Instructions: Check your high-res files catalog for matching IDs and proceed with order placement at your preferred professional lab.
      </p>
    </div>
  `;

  const subjectPrefix = orderDetails.resolvedAfterFailure
    ? '[Resolved — no action needed]'
    : orderDetails.prodigiSuccess
    ? '[New Order]'
    : '[New Order — FULFILLMENT ACTION REQUIRED]';

  return dispatchEmail(
    ownerEmail,
    `${subjectPrefix} ${orderRef}`,
    getEmailWrapper(contentHtml),
    'admin notification'
  );
}

/**
 * Item list for a shipment. Deliberately price-free: the customer already has
 * a receipt, and shipment data carries no pricing we would want to restate.
 */
function getShippedItemsHtml(items) {
  const rows = items.map((item) => {
    const title = escapeHtml(item.title);
    const detail = [item.size, item.material].filter(Boolean).map(escapeHtml).join(' / ');
    const quantity = Number(item.quantity) || 1;
    const thumbnailCell = item.thumbnailUrl
      ? `<img src="${encodeURI(item.thumbnailUrl)}" alt="${title}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:3px;border:1px solid #333333;object-fit:cover;">`
      : `<div style="width:64px;height:64px;border-radius:3px;border:1px solid #333333;background:#242424;"></div>`;

    return `
      <tr>
        <td style="width: 80px; padding-right: 12px;">${thumbnailCell}</td>
        <td>
          <div class="order-item-title">${title}</div>
          ${detail ? `<div class="order-item-desc">${detail}</div>` : ''}
        </td>
        <td style="text-align: right;">&times; ${quantity}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="order-table">
      <thead>
        <tr>
          <th style="width: 80px;"></th>
          <th>In This Delivery</th>
          <th style="width: 15%; text-align: right;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Tell the customer their prints are on the way.
 *
 * Everything here is customer-facing brand surface: the print lab is never
 * named, and the only logistics detail shown is the carrier actually carrying
 * the parcel. See utils/shipping-notification.js for how the payload is built
 * and why it is deliberately narrow.
 */
async function sendShippingConfirmation(notice) {
  const {
    customerEmail, customerName, orderRef, items,
    carrier, trackingNumber, trackingUrl,
    shippingName, shippingAddress, isPartialShipment
  } = notice;

  const greetingName = customerName ? `, ${escapeHtml(customerName)}` : '';
  const deliveryHtml = formatShippingAddressHtml(shippingName || customerName, shippingAddress);
  const itemsTable = items && items.length ? getShippedItemsHtml(items) : '';

  const partialNote = isPartialShipment
    ? `<p class="muted">Your order is arriving in more than one delivery, so some
       pieces may travel separately. We will email you for each one.</p>`
    : '';

  const trackingRows = [
    carrier
      ? `<p style="margin: 0 0 6px;"><span class="muted">Carrier:</span> <strong>${escapeHtml(carrier)}</strong></p>`
      : '',
    trackingNumber
      ? `<p style="margin: 0; font-family: monospace; font-size: 13px; color: #d4b84a;">${escapeHtml(trackingNumber)}</p>`
      : ''
  ].filter(Boolean).join('\n      ');

  const trackingBlock = (trackingNumber || trackingUrl || carrier)
    ? `
    <div class="address-box">
      <div class="address-title">Tracking</div>
      ${trackingRows || '<p class="muted" style="margin:0;">Tracking details will follow shortly.</p>'}
    </div>
    ${trackingUrl ? `
    <div style="text-align: center; margin: 30px 0 10px;">
      <a href="${encodeURI(trackingUrl)}" class="btn">Track Your Delivery</a>
    </div>` : ''}
  `
    : '';

  const contentHtml = `
    <h1>Your prints are on their way${greetingName}</h1>
    <p>Your order has left our hands and is now with the carrier. Each piece was
       checked by eye before it was packed, and wrapped to travel safely.</p>

    ${orderRef ? `<p class="muted">Order Ref: <strong>${escapeHtml(orderRef)}</strong></p>` : ''}
    ${partialNote}

    ${itemsTable}

    ${trackingBlock}

    <div class="address-box">
      <div class="address-title">Delivering To</div>
      <p style="margin: 0; font-family: monospace; font-size: 13px; color: #d4b84a;">
        ${deliveryHtml}
      </p>
    </div>

    <p><strong>When it arrives:</strong> unwrap your print with clean, dry hands and
       handle it by the edges. If anything has not travelled well, reply to this
       email with a photo and we will put it right.</p>

    <div style="text-align: center; margin: 35px 0 10px;">
      <p class="muted" style="margin-top: 12px;">Browse more fine art prints at
        <a href="${SITE_URL}" style="color: #c8a96e;">gliciouspics.com</a></p>
    </div>
  `;

  const subject = orderRef
    ? `${isPartialShipment ? 'Part of your order has shipped' : 'Your order has shipped'}: ${orderRef}`
    : (isPartialShipment ? 'Part of your order has shipped' : 'Your order has shipped');

  return dispatchEmail(
    customerEmail,
    subject,
    getEmailWrapper(contentHtml),
    'shipping confirmation'
  );
}

module.exports = {
  sendCustomerConfirmation,
  sendAdminNotification,
  sendShippingConfirmation,
  getShippedItemsHtml,
  escapeHtml,
  getItemsTableHtml,
  formatShippingAddressHtml
};
