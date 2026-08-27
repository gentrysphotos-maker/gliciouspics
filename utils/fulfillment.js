/**
 * Post-payment fulfillment pipeline.
 *
 * Every stage (customer email, print submission, admin alert) runs
 * independently: one failing stage no longer takes the others down with it,
 * which is what previously left customers with no confirmation whenever the
 * print lab or Stripe's API hiccuped.
 *
 * IDEMPOTENCY
 * Stripe retries a failed webhook delivery for up to 3 days. Without a record
 * of what already happened, retry #2 places a second real print order and
 * sends a second confirmation email. We have no database, so completed stages
 * are recorded in the PaymentIntent's metadata: durable, survives redeploys,
 * shared across instances, and visible next to the payment in the dashboard.
 *
 * Sessions with no PaymentIntent (a 100%-off promotion code produces one)
 * fall back to an in-process map — degraded, but those orders take no money
 * and place no print.
 */

const { createProdigiOrder } = require('./prodigi');
const { prodigiCallbackUrl } = require('./shipping-notification');
const notifications = require('./notifications');

const STAGE_KEYS = {
  orderRef: 'glp_order_ref',
  customerEmail: 'glp_customer_email_at',
  adminEmail: 'glp_admin_email_at',
  // Which fulfillment outcome the seller was last told about. If a retry turns
  // a failure into a success, the seller must be told — otherwise they act on
  // the "place this manually" alert and a duplicate print gets made.
  adminEmailState: 'glp_admin_email_state',
  prodigiOrderId: 'glp_prodigi_order_id',
  prodigiError: 'glp_prodigi_error'
};

// Fallback store for sessions with no PaymentIntent. Process-local on purpose:
// it is a best-effort guard, not a durability claim.
const inMemoryState = new Map();

function truncate(value, max = 480) {
  const str = String(value == null ? '' : value);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

async function readState(stripe, record) {
  const pi = record.paymentIntentId;
  if (!pi) return { ...(inMemoryState.get(record.orderId) || {}) };

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(pi);
    return { ...(paymentIntent.metadata || {}) };
  } catch (error) {
    // If we cannot read prior state we must assume nothing has run. That risks
    // a duplicate, so say so loudly rather than failing silently either way.
    console.error(
      `[FULFILLMENT] Could not read fulfillment state for ${pi}: ${error.message}. ` +
        'Proceeding as if no stage has completed — duplicates are possible.'
    );
    return {};
  }
}

async function writeState(stripe, record, patch) {
  const pi = record.paymentIntentId;
  if (!pi) {
    const prev = inMemoryState.get(record.orderId) || {};
    inMemoryState.set(record.orderId, { ...prev, ...patch });
    return;
  }

  try {
    await stripe.paymentIntents.update(pi, { metadata: patch });
  } catch (error) {
    console.error(
      `[FULFILLMENT] Could not record fulfillment state on ${pi}: ${error.message}`
    );
  }
}

/**
 * Would retrying this failure plausibly succeed?
 *   - network errors / timeouts / 429 / 5xx  -> yes
 *   - 401 / 403                              -> yes: an unverified Resend domain
 *                                               or a not-yet-live API key starts
 *                                               working once you fix the config,
 *                                               and Stripe's retries will pick
 *                                               the order up automatically
 *   - other 4xx (bad address, bad SKU)       -> no: retrying cannot fix the data
 */
function isRetryable(statusCode) {
  if (!statusCode) return true; // no status == transport failure
  if (statusCode === 429 || statusCode >= 500) return true;
  if (statusCode === 401 || statusCode === 403) return true;
  return false;
}

/**
 * Out-of-band alert. Deliberately does NOT use Resend: the thing most likely
 * to be broken is email itself, and an alerting channel that shares a failure
 * mode with the thing it monitors is not an alerting channel.
 *
 * Two paths, both infra-free:
 *   1. A tagged stdout line you can attach a log alert to.
 *   2. An optional Slack/Discord-style webhook (ALERT_WEBHOOK_URL).
 * The webhook handler also returns a non-2xx on retryable failures, which
 * makes Stripe flag the endpoint and email you directly.
 */
async function raiseAlert(record, stage, message) {
  console.error(
    `[FULFILLMENT_ALERT] ${JSON.stringify({
      stage,
      orderRef: record.orderRef,
      orderId: record.orderId,
      customerEmail: record.customerEmail,
      message: truncate(message)
    })}`
  );

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Order ${record.orderRef} — ${stage} FAILED: ${truncate(message, 300)}`
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    console.error(`[FULFILLMENT_ALERT] Alert webhook failed: ${error.message}`);
  }
}

/**
 * Run one stage unless it already completed on a previous delivery attempt.
 * Returns { ran, ok, retryable }.
 */
async function runStage(name, alreadyDone, fn) {
  if (alreadyDone) {
    console.log(`[FULFILLMENT] Skipping ${name} — already completed.`);
    return { ran: false, ok: true, retryable: false };
  }

  try {
    await fn();
    console.log(`[FULFILLMENT] ${name} completed.`);
    return { ran: true, ok: true, retryable: false };
  } catch (error) {
    const retryable = isRetryable(error.statusCode);
    console.error(
      `[FULFILLMENT] ${name} failed (${retryable ? 'retryable' : 'permanent'}): ${error.message}`
    );
    return { ran: true, ok: false, retryable, error };
  }
}

/**
 * Fulfill a paid order.
 *
 * Stage order is deliberate: the customer's confirmation goes out before the
 * print lab is contacted, so a Prodigi outage can never again mean the
 * customer hears nothing. The admin alert goes last because it reports the
 * Prodigi result.
 *
 * Returns { retryable } — true when the caller should hand Stripe a non-2xx
 * so the event is redelivered.
 */
async function fulfillOrder({ stripe, record, productsDatabase }) {
  const state = await readState(stripe, record);
  const failures = [];
  let retryable = false;

  const note = (stageName, result) => {
    if (result.ok) return;
    failures.push(stageName);
    if (result.retryable) retryable = true;
  };

  if (!state[STAGE_KEYS.orderRef]) {
    await writeState(stripe, record, { [STAGE_KEYS.orderRef]: record.orderRef });
  }

  // ── Stage 1: customer confirmation ──────────────────────────────────────
  if (!record.customerEmail) {
    await raiseAlert(record, 'customer_email', 'Session carried no customer email address.');
    failures.push('customer_email');
  } else {
    const result = await runStage(
      'Customer confirmation email',
      state[STAGE_KEYS.customerEmail],
      async () => {
        await notifications.sendCustomerConfirmation(record);
        await writeState(stripe, record, {
          [STAGE_KEYS.customerEmail]: new Date().toISOString()
        });
      }
    );
    if (!result.ok) await raiseAlert(record, 'customer_email', result.error.message);
    note('customer_email', result);
  }

  // ── Stage 2: print fulfillment ──────────────────────────────────────────
  let prodigiOrderId = state[STAGE_KEYS.prodigiOrderId] || null;
  let prodigiError = state[STAGE_KEYS.prodigiOrderId] ? null : state[STAGE_KEYS.prodigiError] || null;

  const prodigiResult = await runStage(
    'Prodigi order submission',
    Boolean(prodigiOrderId),
    async () => {
      const response = await createProdigiOrder(
        {
          // Lets Prodigi surface our reference on their side, and gives support
          // a shared key when reconciling a duplicate.
          merchantReference: record.orderRef,
          // Where Prodigi posts shipment updates, so the customer can be told
          // their prints are on the way. Null when no secret is configured,
          // in which case the key is simply omitted from the order.
          callbackUrl: prodigiCallbackUrl(),
          customerEmail: record.customerEmail,
          recipientName: record.shippingName || record.customerName,
          shippingAddress: record.shippingAddress,
          items: record.items
        },
        productsDatabase
      );

      if (!response.ok) {
        const err = new Error(response.error || 'Prodigi order creation failed');
        err.statusCode = response.statusCode;
        throw err;
      }

      prodigiOrderId = response.data?.order?.id || null;
      prodigiError = null;
      await writeState(stripe, record, {
        [STAGE_KEYS.prodigiOrderId]: truncate(prodigiOrderId || 'unknown'),
        [STAGE_KEYS.prodigiError]: ''
      });
    }
  );

  if (!prodigiResult.ok) {
    prodigiError = prodigiResult.error.message;
    await writeState(stripe, record, { [STAGE_KEYS.prodigiError]: truncate(prodigiError) });
    await raiseAlert(record, 'prodigi', prodigiError);
    note('prodigi', prodigiResult);
  }

  // ── Stage 3: seller notification ────────────────────────────────────────
  // Sent even when Prodigi failed — that is exactly when the seller needs it,
  // because the email carries the manual-fulfillment instructions.
  //
  // Not a plain "already sent, skip": the seller is notified again if a retry
  // changed the fulfillment outcome. Being told an order needs placing by hand
  // and never being told it resolved itself is how you end up printing twice.
  const prodigiState = prodigiOrderId ? 'success' : 'failed';
  const lastReported = state[STAGE_KEYS.adminEmailState];
  const alreadyToldCurrentState =
    Boolean(state[STAGE_KEYS.adminEmail]) &&
    // Records written before this field existed count as reported-as-is.
    (lastReported === prodigiState || lastReported === undefined);
  const isFollowUp = Boolean(state[STAGE_KEYS.adminEmail]) && !alreadyToldCurrentState;

  const adminResult = await runStage(
    isFollowUp ? 'Admin follow-up email (fulfillment outcome changed)' : 'Admin notification email',
    alreadyToldCurrentState,
    async () => {
      await notifications.sendAdminNotification({
        ...record,
        prodigiSuccess: Boolean(prodigiOrderId),
        prodigiOrderId,
        prodigiError,
        // Lets the email say "this resolved itself, do NOT place it manually".
        resolvedAfterFailure: isFollowUp && prodigiState === 'success'
      });
      await writeState(stripe, record, {
        [STAGE_KEYS.adminEmail]: new Date().toISOString(),
        [STAGE_KEYS.adminEmailState]: prodigiState
      });
    }
  );
  if (!adminResult.ok) await raiseAlert(record, 'admin_email', adminResult.error.message);
  note('admin_email', adminResult);

  return {
    retryable,
    failures,
    prodigiOrderId,
    prodigiError
  };
}

module.exports = { STAGE_KEYS, isRetryable, fulfillOrder };
