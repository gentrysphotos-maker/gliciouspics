#!/usr/bin/env node
/**
 * Production preflight.
 *
 * Run this against the SAME environment variables the live server uses, before
 * and after any go-live change:
 *
 *   npm run preflight
 *
 * It checks the things that are checkable from outside the dashboards, and it
 * exists because the live launch failed on config that all looked correct:
 * every key was valid, every service was up, and no order was fulfilled.
 *
 * Checks:
 *   1. Stripe key mode (test vs live).
 *   2. A webhook endpoint exists IN THAT MODE, points at this site, and is
 *      subscribed to checkout.session.completed. Endpoints and their signing
 *      secrets are per-mode — a test-mode endpoint is invisible to live
 *      traffic, which is the single most likely cause of a paid order that
 *      never reaches email or the print lab.
 *   3. The Resend sending domain is actually VERIFIED (an unverified domain
 *      403s every send).
 *   4. Prodigi answers, and the environment matches the Stripe mode, so live
 *      orders cannot land silently in the sandbox.
 *
 * Exit code 0 = ready, 1 = something would break a real order.
 */

require('dotenv').config();

const SITE_URL = (process.env.SITE_URL || 'https://gliciouspics.com').replace(/\/+$/, '');
const WEBHOOK_PATH = '/api/webhooks/stripe';
const REQUIRED_EVENT = 'checkout.session.completed';

/**
 * Is the configured webhook URL actually alive?
 *
 * A registered endpoint URL proves nothing on its own. A real launch failed
 * with a perfectly well-formed URL on a Railway subdomain that no longer
 * resolved to the service: Stripe delivered, Railway's edge answered
 * "Application not found" with a 404, and the app never saw the request.
 *
 * An unsigned POST to a healthy listener is rejected at signature
 * verification with a 400 — which is exactly the proof of life we want, and
 * it cannot create or alter anything.
 */
async function probeWebhookUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000)
    });
    const body = (await response.text()).slice(0, 200);

    if (response.status === 400 && /signature/i.test(body)) {
      return { alive: true, detail: 'listener answered (400, missing signature) — healthy' };
    }
    if (response.status === 404) {
      const edge = /application not found/i.test(body)
        ? ' The host itself is not resolving to a running service — this is the platform edge answering, not your app.'
        : ' The host is up but nothing is listening on that path.';
      return { alive: false, detail: `HTTP 404 — Stripe would be unable to deliver.${edge}` };
    }
    return { alive: false, detail: `unexpected HTTP ${response.status}: ${body}` };
  } catch (error) {
    return { alive: false, detail: `unreachable: ${error.message}` };
  }
}

const results = [];
const record = (level, name, message) => results.push({ level, name, message });
const pass = (name, message) => record('pass', name, message);
const warn = (name, message) => record('warn', name, message);
const fail = (name, message) => record('fail', name, message);

async function checkStripe() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key.startsWith('sk_')) {
    fail('Stripe key', 'STRIPE_SECRET_KEY is missing or not a secret key.');
    return null;
  }

  const mode = key.startsWith('sk_live_') ? 'live' : 'test';
  pass('Stripe key', `${mode.toUpperCase()} mode secret key.`);

  const stripe = require('stripe')(key);

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    fail('Webhook secret', 'STRIPE_WEBHOOK_SECRET is not set — every delivery will be rejected.');
  } else if (!process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    fail('Webhook secret', 'STRIPE_WEBHOOK_SECRET does not look like a signing secret (expected whsec_…).');
  }

  // The check that would have caught the failed launch.
  let endpoints;
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 100 });
    endpoints = list.data;
  } catch (error) {
    warn('Webhook endpoint', `Could not list webhook endpoints (${error.message}). Check the dashboard by hand.`);
    return { stripe, mode };
  }

  const expected = `${SITE_URL}${WEBHOOK_PATH}`;
  const enabled = endpoints.filter((e) => e.status === 'enabled');
  const match = enabled.find((e) => e.url === expected);

  if (!enabled.length) {
    fail(
      'Webhook endpoint',
      `NO enabled webhook endpoint exists in ${mode.toUpperCase()} mode. Paid orders will ` +
        `never be fulfilled. Create one pointing at ${expected} and subscribe ${REQUIRED_EVENT}.`
    );
  } else if (!match) {
    fail(
      'Webhook endpoint',
      `No ${mode.toUpperCase()}-mode endpoint points at ${expected}. Found: ` +
        `${enabled.map((e) => e.url).join(', ')}. Point the endpoint at your custom ` +
        'domain — platform-generated subdomains can be regenerated or retired, and a ' +
        'stale one 404s every delivery.'
    );
  } else if (!match.enabled_events.includes(REQUIRED_EVENT) && !match.enabled_events.includes('*')) {
    fail(
      'Webhook endpoint',
      `Endpoint ${expected} exists but is not subscribed to ${REQUIRED_EVENT}. ` +
        `Subscribed to: ${match.enabled_events.join(', ')}`
    );
  } else {
    pass('Webhook endpoint', `${mode.toUpperCase()}-mode endpoint at ${expected} is enabled and subscribed.`);
    if (!match.enabled_events.includes('checkout.session.async_payment_succeeded') && !match.enabled_events.includes('*')) {
      warn(
        'Webhook endpoint',
        'Not subscribed to checkout.session.async_payment_succeeded. Only needed if you ' +
          'enable delayed payment methods later.'
      );
    }
  }

  // Prove the registered URL is actually serving, whatever it is.
  for (const endpoint of enabled) {
    const probe = await probeWebhookUrl(endpoint.url);
    if (probe.alive) {
      pass('Webhook reachability', `${endpoint.url} — ${probe.detail}`);
    } else {
      fail(
        'Webhook reachability',
        `${endpoint.url} is NOT reachable: ${probe.detail} Every paid order sent here is lost.`
      );
    }
  }

  // And prove our own canonical URL works, so there is a known-good value to
  // paste into the dashboard.
  if (!enabled.some((e) => e.url === expected)) {
    const probe = await probeWebhookUrl(expected);
    if (probe.alive) {
      warn('Webhook reachability', `${expected} IS live and healthy — use this URL for the endpoint.`);
    }
  }

  return { stripe, mode };
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY || '';
  if (!key.startsWith('re_')) {
    fail('Resend key', 'RESEND_API_KEY is missing or malformed.');
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'G.Licious Pics <orders@gliciouspics.com>';
  const sendingDomain = (from.match(/@([^>\s]+)/) || [])[1];
  if (!sendingDomain) {
    fail('Resend sender', `Could not read a domain out of RESEND_FROM_EMAIL ("${from}").`);
    return;
  }

  let response;
  try {
    response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    fail('Resend', `Could not reach Resend: ${error.message}`);
    return;
  }

  if (!response.ok) {
    fail('Resend key', `Resend returned HTTP ${response.status} listing domains — key is invalid or revoked.`);
    return;
  }

  const body = await response.json();
  const domains = Array.isArray(body.data) ? body.data : [];
  const domain = domains.find((d) => d.name === sendingDomain);

  if (!domain) {
    fail(
      'Resend domain',
      `Sending from @${sendingDomain} but that domain is not in this Resend account. ` +
        'Every order email will fail. Add it under Resend > Domains.'
    );
  } else if (domain.status !== 'verified') {
    fail(
      'Resend domain',
      `${sendingDomain} is "${domain.status}", not "verified". Resend rejects every send ` +
        'from an unverified domain — customers and seller both get nothing. Finish the DNS records.'
    );
  } else {
    pass('Resend domain', `${sendingDomain} is verified — order email can send.`);
  }

  if (!process.env.OWNER_EMAIL) {
    fail('Seller alerts', 'OWNER_EMAIL is not set — you will never be told an order arrived.');
  } else {
    pass('Seller alerts', `Order alerts go to ${process.env.OWNER_EMAIL}.`);
  }
}

/**
 * Shipment-notification callback. Not required to take an order, so a missing
 * secret is a warning — but a configured-but-unreachable callback is a failure,
 * because customers would silently never learn their order shipped.
 */
async function checkProdigiCallback() {
  const secret = process.env.PRODIGI_CALLBACK_SECRET;
  if (!secret) {
    warn(
      'Shipping emails',
      'PRODIGI_CALLBACK_SECRET is not set — customers will not be emailed when their order ' +
        'ships. Orders are still placed and fulfilled normally.'
    );
    return;
  }

  const url = `${SITE_URL}/api/webhooks/prodigi/${encodeURIComponent(secret)}`;

  // An empty body with the right secret must come back 400 ("no order id"):
  // proof the route exists AND the deployed secret matches this one, without
  // touching a real order.
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000)
    });

    if (response.status === 400) {
      pass('Shipping emails', 'Callback endpoint is live and the deployed secret matches.');
    } else if (response.status === 403) {
      fail(
        'Shipping emails',
        'The callback endpoint rejected this secret — PRODIGI_CALLBACK_SECRET here does not ' +
          'match the one deployed. Shipment emails would never send.'
      );
    } else if (response.status === 503) {
      fail('Shipping emails', 'The deployed server has no PRODIGI_CALLBACK_SECRET set.');
    } else if (response.status === 404) {
      fail('Shipping emails', `Callback endpoint not found at ${SITE_URL} — is the latest build deployed?`);
    } else {
      warn('Shipping emails', `Callback endpoint returned an unexpected HTTP ${response.status}.`);
    }
  } catch (error) {
    fail('Shipping emails', `Could not reach the callback endpoint: ${error.message}`);
  }

  console.log(
    `\n  Set this as the callback URL in the Prodigi dashboard (Integrations):\n    ${url}\n`
  );
}

async function checkProdigi(stripeMode) {
  const key = process.env.PRODIGI_API_KEY || '';
  if (!key) {
    fail('Prodigi key', 'PRODIGI_API_KEY is not set — no order will reach the print lab.');
    return;
  }

  const baseUrl = process.env.PRODIGI_API_URL || 'https://api.prodigi.com/v4.0';
  const isSandbox = baseUrl.includes('sandbox');

  if (stripeMode === 'live' && isSandbox) {
    fail(
      'Prodigi environment',
      'Stripe is LIVE but PRODIGI_API_URL points at the SANDBOX. Real orders would be ' +
        'accepted into the sandbox, never printed, and invisible at dashboard.prodigi.com. ' +
        'Set PRODIGI_API_URL=https://api.prodigi.com/v4.0 with your live key.'
    );
  } else if (stripeMode === 'test' && !isSandbox) {
    warn('Prodigi environment', 'Stripe is in TEST mode but Prodigi is LIVE — a test checkout would place a real, billable print order.');
  } else {
    pass('Prodigi environment', `${isSandbox ? 'SANDBOX' : 'LIVE'}, matching the Stripe ${String(stripeMode).toUpperCase()} key.`);
  }

  try {
    const response = await fetch(`${baseUrl}/Orders?top=1`, {
      headers: { 'X-API-Key': key },
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 401 || response.status === 403) {
      fail('Prodigi key', `Prodigi returned HTTP ${response.status} — the key is not valid for ${isSandbox ? 'sandbox' : 'live'}.`);
    } else if (!response.ok) {
      warn('Prodigi', `Prodigi returned HTTP ${response.status} on a read-only call.`);
    } else {
      pass('Prodigi key', 'Accepted by the Prodigi API.');
    }
  } catch (error) {
    fail('Prodigi', `Could not reach Prodigi: ${error.message}`);
  }
}

(async () => {
  console.log(`\nPreflight for ${SITE_URL}\n${'─'.repeat(60)}`);

  const stripeResult = await checkStripe();
  await checkResend();
  await checkProdigi(stripeResult ? stripeResult.mode : null);
  await checkProdigiCallback();

  const icon = { pass: '  ok  ', warn: ' warn ', fail: ' FAIL ' };
  for (const r of results) {
    console.log(`[${icon[r.level]}] ${r.name}: ${r.message}`);
  }

  const failures = results.filter((r) => r.level === 'fail');
  const warnings = results.filter((r) => r.level === 'warn');
  console.log('─'.repeat(60));

  if (failures.length) {
    console.log(`${failures.length} blocking problem(s). A real order would not be fulfilled.\n`);
    process.exit(1);
  }
  console.log(`Ready. ${warnings.length} warning(s).\n`);
})();
