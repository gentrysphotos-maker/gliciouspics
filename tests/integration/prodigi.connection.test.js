/**
 * Prodigi sandbox connection test (integration — needs PRODIGI_API_KEY).
 *
 * Verifies that the sandbox API key is valid and the Prodigi sandbox is
 * reachable from CI. Uses a *read-only* endpoint (GET /Orders) so the test
 * never creates an actual sandbox order or charges anything.
 *
 * If PRODIGI_API_KEY is missing, the tests skip cleanly.
 *
 * SAFETY: This test hits api.sandbox.prodigi.com only — never production.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const KEY = process.env.PRODIGI_API_KEY || '';

// Catch the common mistake of pasting a documentation placeholder.
// Prodigi sandbox keys don't have a fixed prefix — they're just opaque
// strings — so we only filter out obvious placeholder shapes.
const LOOKS_LIKE_PLACEHOLDER = /[^\x20-\x7E]/.test(KEY) || /\.{3}|…/.test(KEY);
const HAS_KEY = KEY.length > 0 && !LOOKS_LIKE_PLACEHOLDER;

const skipMsg = !KEY
  ? 'PRODIGI_API_KEY not set — skipping Prodigi connection tests'
  : LOOKS_LIKE_PLACEHOLDER
  ? 'PRODIGI_API_KEY looks like a placeholder (contains "…" or "..."). Paste the real sandbox key from sandbox-beta-dashboard.pwinty.com.'
  : null;

const SANDBOX_BASE = 'https://api.sandbox.prodigi.com/v4.0';

test('Prodigi: API key is configured', { skip: skipMsg }, () => {
  assert.ok(HAS_KEY, 'PRODIGI_API_KEY must be set');
});

test('Prodigi: sandbox accepts the API key (GET /Orders)', { skip: skipMsg }, async () => {
  const response = await fetch(`${SANDBOX_BASE}/Orders?top=1`, {
    method: 'GET',
    headers: { 'X-API-Key': KEY },
  });

  assert.notEqual(
    response.status,
    401,
    'Prodigi returned 401 — sandbox API key is invalid or revoked'
  );
  assert.notEqual(
    response.status,
    403,
    'Prodigi returned 403 — API key lacks permission to list orders'
  );
  assert.ok(
    response.status >= 200 && response.status < 300,
    `Prodigi returned ${response.status} (expected 2xx)`
  );

  const body = await response.json();
  assert.ok(body, 'response body should be valid JSON');
});
