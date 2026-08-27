/**
 * Resend connection test (integration — needs RESEND_API_KEY).
 *
 * Verifies that the Resend API key is valid by hitting a read-only endpoint
 * (GET /domains). Does NOT actually send any emails — sending real test
 * emails belongs in manual / local QA, not CI.
 *
 * If RESEND_API_KEY is missing, the tests skip cleanly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const KEY = process.env.RESEND_API_KEY || '';

// Catch the common mistake of pasting a documentation placeholder.
const LOOKS_LIKE_PLACEHOLDER = /[^\x20-\x7E]/.test(KEY) || /\.{3}|…/.test(KEY);
const HAS_KEY = KEY.startsWith('re_') && !LOOKS_LIKE_PLACEHOLDER;

const skipMsg = !KEY
  ? 'RESEND_API_KEY not set — skipping Resend connection tests'
  : LOOKS_LIKE_PLACEHOLDER
  ? 'RESEND_API_KEY looks like a placeholder (contains "…" or "..."). Paste the real key from resend.com/api-keys.'
  : !HAS_KEY
  ? 'RESEND_API_KEY does not look like a Resend key (expected re_*) — skipping'
  : null;

test('Resend: API key is configured', { skip: skipMsg }, () => {
  assert.ok(HAS_KEY, 'RESEND_API_KEY must start with re_');
});

test('Resend: API key is accepted (GET /domains)', { skip: skipMsg }, async () => {
  const response = await fetch('https://api.resend.com/domains', {
    method: 'GET',
    headers: { Authorization: `Bearer ${KEY}` },
  });

  assert.notEqual(
    response.status,
    401,
    'Resend returned 401 — API key is invalid or revoked'
  );
  assert.notEqual(
    response.status,
    403,
    'Resend returned 403 — API key lacks permission to list domains'
  );
  assert.ok(
    response.status >= 200 && response.status < 300,
    `Resend returned ${response.status} (expected 2xx)`
  );

  const body = await response.json();
  assert.ok(body, 'response body should be valid JSON');
  assert.ok(Array.isArray(body.data), 'expected body.data to be an array of domains');
});

/**
 * The check that a valid-key test cannot make.
 *
 * Resend rejects EVERY send from an unverified domain with a 403, so a key
 * that authenticates perfectly still delivers nothing. That is indistinguishable
 * from a healthy account until a real customer is waiting on a confirmation,
 * which is exactly how it slipped into production.
 */
test('Resend: the sending domain is verified', { skip: skipMsg }, async () => {
  const from = process.env.RESEND_FROM_EMAIL || 'G.Licious Pics <orders@gliciouspics.com>';
  const sendingDomain = (from.match(/@([^>\s]+)/) || [])[1];
  assert.ok(sendingDomain, `could not read a domain out of RESEND_FROM_EMAIL ("${from}")`);

  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const body = await response.json();
  const domains = Array.isArray(body.data) ? body.data : [];
  const domain = domains.find((d) => d.name === sendingDomain);

  assert.ok(
    domain,
    `sending from @${sendingDomain}, but that domain is not in this Resend account ` +
      `(found: ${domains.map((d) => d.name).join(', ') || 'none'}). Every order email will fail.`
  );
  assert.equal(
    domain.status,
    'verified',
    `${sendingDomain} is "${domain.status}", not "verified" — Resend will reject every ` +
      'order email until the DNS records are in place.'
  );
});
