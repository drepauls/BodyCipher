// BodyCipher — Stripe Webhook
// Triggers on: checkout.session.completed
// Creates Supabase account + sends invite email to the customer
// Env vars needed: STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Verify Stripe signature ──────────────────────────────────────────────
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!verifyStripeSignature(event.body, sig, webhookSecret)) {
    console.error('Stripe signature verification failed');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ── Handle checkout completed ────────────────────────────────────────────
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    // Get customer email
    const email = session.customer_email || session.customer_details?.email;
    if (!email) {
      console.error('No email found in Stripe session');
      return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'no email' }) };
    }

    // Determine access duration from amount paid (in cents)
    // Basic $7.99 = 799  |  Pro $14.99 = 1499  |  Pro Annual $124.99 = 12499
    const amount = session.amount_total || 0;
    const daysToAdd = amount >= 10000 ? 365 : 31; // annual = 365 days, monthly = 31 days
    const plan = amount >= 10000 ? 'pro_annual' : amount >= 1200 ? 'pro' : 'basic';

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToAdd);
    const expires = expiresAt.toISOString().split('T')[0];

    console.log(`New subscriber: ${email} | plan: ${plan} | expires: ${expires}`);

    // ── Create Supabase account via invite ───────────────────────────────
    // Supabase invite sends an email with a magic link to set their password
    const SUPA_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    const res = await fetch(`${SUPA_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        data: {
          expires_at: expires,
          plan,
          stripe_session_id: session.id
        }
      })
    });

    const result = await res.json();

    if (result.error) {
      // User may already exist — update their expiry instead
      if (result.error.message?.includes('already been registered') || res.status === 422) {
        console.log(`User ${email} already exists — updating expiry`);
        await updateExistingUser(SUPA_URL, SERVICE_KEY, email, expires, plan);
      } else {
        console.error('Supabase invite error:', JSON.stringify(result));
      }
    } else {
      console.log(`Invited ${email} successfully, expires ${expires}`);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

// ── Update expiry for an existing user ──────────────────────────────────────
async function updateExistingUser(SUPA_URL, SERVICE_KEY, email, expires, plan) {
  const supaHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  // Find user by email
  const listRes = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: supaHeaders
  });
  const { users } = await listRes.json();
  const user = users?.find(u => u.email === email);

  if (!user) {
    console.error(`Could not find user ${email} to update`);
    return;
  }

  // Unban + update expiry
  await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: supaHeaders,
    body: JSON.stringify({
      ban_duration: 'none',
      user_metadata: { expires_at: expires, plan }
    })
  });

  console.log(`Updated existing user ${email} — new expiry: ${expires}`);
}

// ── Stripe HMAC-SHA256 signature verification (no Stripe library needed) ────
function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [key, val] = part.split('=');
    if (key && val) acc[key.trim()] = val.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    console.error('Stripe webhook timestamp too old');
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    return false;
  }
}
