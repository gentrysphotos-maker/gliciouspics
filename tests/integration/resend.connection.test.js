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
const HAS_KEY = KEY.startsWith('re_');
const skipMsg = !KEY
  ? 'RESEND_API_KEY not set — skipping Resend connection tests'
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
  assert.ok(
    Array.isArray(body.data),
    'expected body.data to be an array of domains (may be empty pre-verification)'
  );
});
