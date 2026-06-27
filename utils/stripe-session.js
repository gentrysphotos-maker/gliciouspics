/**
 * Helpers for reading data out of a Stripe Checkout Session in a way that
 * tolerates both the legacy session shape and the 2026-05-27.dahlia API version,
 * which moved shipping details under `collected_information`.
 */

const EMPTY_ADDRESS = Object.freeze({
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: ''
});

function extractShippingDetails(session) {
  const raw = session?.collected_information?.shipping_details
    || session?.shipping_details
    || {};
  return {
    name: raw.name || '',
    address: { ...EMPTY_ADDRESS, ...(raw.address || {}) }
  };
}

function extractCustomerDetails(session) {
  const raw = session?.customer_details || {};
  return {
    email: raw.email || '',
    name: raw.name || raw.individual_name || raw.business_name || '',
    phone: raw.phone || null
  };
}

/**
 * Short, human-readable order reference derived from the Stripe session id.
 * `cs_test_a1xRqJamlNMcZVcdvYkFTPy0Rstgyr5GMS0XV0KsBA1kwnOT0HujFmeKvk`
 *   becomes `GLP-HUJFMEKVK` — short enough to read on the phone, unique
 *   enough to look up against the full id in the admin dashboard.
 */
function formatOrderRef(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return 'GLP-UNKNOWN';
  const suffix = sessionId.slice(-9).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `GLP-${suffix || 'UNKNOWN'}`;
}

module.exports = {
  extractShippingDetails,
  extractCustomerDetails,
  formatOrderRef
};
