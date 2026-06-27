/**
 * Tests for the Stripe Checkout Session helpers.
 *
 * The Stripe API moved shipping_details under collected_information starting
 * in the 2026-05-27.dahlia API version. extractShippingDetails has to read
 * either shape, and it has to return safe empty strings so the email
 * templates never render the word "undefined".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractShippingDetails,
  extractCustomerDetails,
  formatOrderRef
} = require('../utils/stripe-session');

test('extractShippingDetails reads from collected_information (new API)', () => {
  const session = {
    collected_information: {
      shipping_details: {
        name: 'Jane Doe',
        address: {
          line1: '1234 Makai Pl',
          line2: 'Apt B',
          city: 'Honolulu',
          state: 'HI',
          postal_code: '96815',
          country: 'US'
        }
      }
    }
  };
  const result = extractShippingDetails(session);
  assert.equal(result.name, 'Jane Doe');
  assert.equal(result.address.line1, '1234 Makai Pl');
  assert.equal(result.address.city, 'Honolulu');
  assert.equal(result.address.postal_code, '96815');
  assert.equal(result.address.country, 'US');
});

test('extractShippingDetails falls back to legacy session.shipping_details', () => {
  const session = {
    shipping_details: {
      name: 'John Doe',
      address: { line1: '5 Lehua Ave', city: 'Kailua', state: 'HI', postal_code: '96734', country: 'US' }
    }
  };
  const result = extractShippingDetails(session);
  assert.equal(result.name, 'John Doe');
  assert.equal(result.address.line1, '5 Lehua Ave');
});

test('extractShippingDetails prefers new API over legacy when both present', () => {
  const session = {
    collected_information: { shipping_details: { name: 'New API', address: { line1: 'new' } } },
    shipping_details: { name: 'Legacy', address: { line1: 'old' } }
  };
  const result = extractShippingDetails(session);
  assert.equal(result.name, 'New API');
  assert.equal(result.address.line1, 'new');
});

test('extractShippingDetails returns empty strings, never undefined, when missing', () => {
  const result = extractShippingDetails({});
  assert.equal(result.name, '');
  assert.equal(result.address.line1, '');
  assert.equal(result.address.line2, '');
  assert.equal(result.address.city, '');
  assert.equal(result.address.state, '');
  assert.equal(result.address.postal_code, '');
  assert.equal(result.address.country, '');
});

test('extractShippingDetails tolerates null session', () => {
  const result = extractShippingDetails(null);
  assert.equal(result.name, '');
  assert.equal(result.address.line1, '');
});

test('extractCustomerDetails reads name, email, phone', () => {
  const session = {
    customer_details: { email: 'a@b.com', name: 'Jane Doe', phone: '+18085551212' }
  };
  const result = extractCustomerDetails(session);
  assert.equal(result.email, 'a@b.com');
  assert.equal(result.name, 'Jane Doe');
  assert.equal(result.phone, '+18085551212');
});

test('extractCustomerDetails prefers individual_name when name is missing', () => {
  const session = {
    customer_details: { email: 'a@b.com', individual_name: 'Jane Individual' }
  };
  assert.equal(extractCustomerDetails(session).name, 'Jane Individual');
});

test('extractCustomerDetails returns safe defaults when missing', () => {
  const result = extractCustomerDetails({});
  assert.equal(result.email, '');
  assert.equal(result.name, '');
  assert.equal(result.phone, null);
});

test('formatOrderRef produces a short, prefixed reference', () => {
  const ref = formatOrderRef('cs_test_a1xRqJamlNMcZVcdvYkFTPy0Rstgyr5GMS0XV0KsBA1kwnOT0HujFmeKvk');
  assert.equal(ref, 'GLP-HUJFMEKVK');
});

test('formatOrderRef returns GLP-UNKNOWN when id is missing or invalid', () => {
  assert.equal(formatOrderRef(undefined), 'GLP-UNKNOWN');
  assert.equal(formatOrderRef(null), 'GLP-UNKNOWN');
  assert.equal(formatOrderRef(''), 'GLP-UNKNOWN');
  assert.equal(formatOrderRef(12345), 'GLP-UNKNOWN');
});

test('formatOrderRef handles short ids gracefully', () => {
  const ref = formatOrderRef('cs_abc');
  // Last 9 chars uppercased; "_" is stripped.
  assert.match(ref, /^GLP-[A-Z0-9]+$/);
});
