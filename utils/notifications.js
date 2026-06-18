const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to send email via Resend API
async function sendViaResend(to, subject, htmlBody) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing');
  }

  // Use a verified Resend domain or onboarding email if it's test mode
  const fromEmail = apiKey.startsWith('re_') ? 'G.Licious Pics <onboarding@resend.dev>' : 'orders@gliciouspics.com';
  // Note: Resend onboarding API keys can only send to the email linked to the account.
  // In production, user will verify a domain.
  
  const postData = JSON.stringify({
    from: fromEmail,
    to: [to],
    subject: subject,
    html: htmlBody
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let responseBody = '';
        res.on('data', (d) => { responseBody += d; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseBody));
          } else {
            reject(new Error(`Resend API Error (Status ${res.statusCode}): ${responseBody}`));
          }
        });
      }
    );

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
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
      <div class="logo">G.Licious Pics</div>
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
  let tableRows = items.map(item => {
    const size = item.size || 'Standard';
    const material = item.material || 'Lustre Paper';
    const unitPrice = (item.price / 100).toFixed(2);
    const lineTotal = ((item.price * item.quantity) / 100).toFixed(2);
    
    return `
      <tr>
        <td>
          <div class="order-item-title">${item.title}</div>
          <div class="order-item-desc">${size} / ${material}</div>
        </td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">$${unitPrice}</td>
        <td style="text-align: right;">$${lineTotal}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="order-table">
      <thead>
        <tr>
          <th style="width: 55%;">Print Title</th>
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

// Send Order Confirmation to Customer
async function sendCustomerConfirmation(orderDetails) {
  const { customerEmail, customerName, items, totalAmount, shippingAddress, shippingName, orderId } = orderDetails;
  
  const formattedSubtotal = (totalAmount / 100).toFixed(2);
  const itemsTable = getItemsTableHtml(items);
  
  const contentHtml = `
    <h1>Thank you for your order, ${customerName}</h1>
    <p>We have successfully received your payment. Gentry is preparing your fine art prints. Each order is individually checked for exact color and print quality before shipping.</p>
    
    <p class="muted">Order Ref: <strong>${orderId}</strong></p>
    
    ${itemsTable}
    
    <div class="order-summary">
      <div class="summary-row">
        <span class="summary-label">Subtotal</span>
        <span class="summary-value">$${formattedSubtotal}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Shipping</span>
        <span class="summary-value" style="color: #6aab8a;">FREE</span>
      </div>
      <div class="summary-row total">
        <span class="summary-label">Total Paid</span>
        <span class="summary-value">$${formattedSubtotal}</span>
      </div>
    </div>
    
    <div class="address-box">
      <div class="address-title">Delivery Address</div>
      <p style="margin: 0; font-family: monospace; font-size: 13px; color: #d4b84a;">
        ${shippingName || customerName}<br>
        ${shippingAddress.line1}${shippingAddress.line2 ? '<br>' + shippingAddress.line2 : ''}<br>
        ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postal_code}<br>
        ${shippingAddress.country}
      </p>
    </div>
    
    <p><strong>Timeline & Fulfillment:</strong> Standard production time is 2-4 days for Lustre Paper prints and 5-7 days for ChromaLuxe Metal prints. You will receive an email containing tracking details as soon as your artwork ships.</p>
    
    <p class="muted">Note: If you need to make corrections or request changes, please reply to this email within 6 hours of purchase.</p>
  `;

  const htmlBody = getEmailWrapper(contentHtml);
  const subject = `Order Confirmed: ${orderId}`;
  
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      console.log(`Attempting to send customer confirmation email to: ${customerEmail} via Resend...`);
      return await sendViaResend(customerEmail, subject, htmlBody);
    } catch (error) {
      console.error('Failed sending customer email via Resend, falling back to local file logging:', error.message);
      return logEmailLocally(customerEmail, subject, htmlBody);
    }
  } else {
    return logEmailLocally(customerEmail, subject, htmlBody);
  }
}

// Send Order Notification to Owner (Gentry)
async function sendAdminNotification(orderDetails) {
  const { customerEmail, customerName, customerPhone, items, totalAmount, shippingAddress, shippingName, orderId } = orderDetails;
  
  const formattedSubtotal = (totalAmount / 100).toFixed(2);
  const itemsTable = getItemsTableHtml(items);
  const ownerEmail = process.env.OWNER_EMAIL || 'gentrysphotos@example.com';
  
  // Production instructions for photographer
  const labInstructions = items.map(item => {
    return `<li><strong>${item.title}</strong>: size ${item.size || 'Standard'}, material ${item.material || 'Lustre Paper'} &times; ${item.quantity} (ID: ${item.id})</li>`;
  }).join('');

  const contentHtml = `
    <h1>New Order Received!</h1>
    <p>An order has been completed via Stripe. Here are the order details for print fulfillment.</p>
    
    <p class="muted">Order ID: <strong>${orderId}</strong></p>
    
    <div class="address-box">
      <div class="address-title">Customer Details</div>
      <p style="margin: 0; line-height: 1.5;">
        <strong>Name:</strong> ${customerName}<br>
        <strong>Email:</strong> ${customerEmail}<br>
        <strong>Phone:</strong> ${customerPhone || 'Not provided'}
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
        ${shippingName || customerName}<br>
        ${shippingAddress.line1}${shippingAddress.line2 ? '<br>' + shippingAddress.line2 : ''}<br>
        ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postal_code}<br>
        ${shippingAddress.country}
      </p>
    </div>

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

  const htmlBody = getEmailWrapper(contentHtml);
  const subject = `[New Order Alert] Ref: ${orderId}`;
  
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      console.log(`Attempting to send admin order alert to: ${ownerEmail} via Resend...`);
      return await sendViaResend(ownerEmail, subject, htmlBody);
    } catch (error) {
      console.error('Failed sending admin email via Resend, falling back to local file logging:', error.message);
      return logEmailLocally(ownerEmail, subject, htmlBody);
    }
  } else {
    return logEmailLocally(ownerEmail, subject, htmlBody);
  }
}

module.exports = {
  sendCustomerConfirmation,
  sendAdminNotification
};
