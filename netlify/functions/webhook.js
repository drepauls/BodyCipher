const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const headers = {
  'Content-Type': 'application/json'
};

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function supabase(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const url = new URL(SUPABASE_URL);
  const res = await httpsRequest({
    hostname: url.hostname,
    path: `/rest/v1/${path}`,
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
    }
  }, payload);
  return { status: res.status, data: JSON.parse(res.body) };
}

// Verify Stripe webhook signature
function verifyStripeSignature(payload, sig, secret) {
  const parts = sig.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const signature = parts.find(p => p.startsWith('v1=')).split('=')[1];
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const sig = event.headers['stripe-signature'];
    const payload = event.body;

    // Verify webhook signature
    if (!verifyStripeSignature(payload, sig, WEBHOOK_SECRET)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
    }

    const stripeEvent = JSON.parse(payload);
    const data = stripeEvent.data.object;

    switch (stripeEvent.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const customerId = data.customer;
        const status = data.status === 'active' ? 'active' : 'inactive';
        await supabase('PATCH', `users?stripe_customer_id=eq.${customerId}`, {
          status,
          stripe_subscription_id: data.id
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = data.customer;
        await supabase('PATCH', `users?stripe_customer_id=eq.${customerId}`, {
          status: 'cancelled',
          plan: 'free'
        });
        break;
      }

      case 'invoice.payment_failed': {
        const customerId = data.customer;
        await supabase('PATCH', `users?stripe_customer_id=eq.${customerId}`, {
          status: 'payment_failed'
        });
        break;
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
