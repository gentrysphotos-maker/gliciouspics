const http = require('http');

const mockEvent = {
  id: 'evt_test_webhook',
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_mock_12345',
      payment_intent: 'pi_mock_12345',
      customer_details: {
        email: 'customer@example.com',
        name: 'Jane Doe',
        phone: '+18085550199'
      },
      shipping_details: {
        name: 'Jane Doe',
        address: {
          line1: '1234 Makai Place',
          line2: 'Apt B',
          city: 'Honolulu',
          state: 'HI',
          postal_code: '96815',
          country: 'US'
        }
      },
      amount_total: 50000,
      currency: 'usd'
    }
  }
};

const postData = JSON.stringify(mockEvent);

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/webhooks/stripe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'stripe-signature': 'mock',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Sending mock Stripe webhook to localhost:8080...');

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Response: ${responseData}`);
    if (res.statusCode === 200) {
      console.log('Mock webhook sent successfully!');
    } else {
      console.error('Failed to send mock webhook.');
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  console.error('Make sure the Express server is running first (npm start / npm run dev).');
});

req.write(postData);
req.end();
