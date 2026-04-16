const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'bodycipher_salt_2025').digest('hex');
}

// Make HTTPS request helper
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

// Supabase request
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

// Stripe request
async function stripe(method, path, body) {
  const payload = body ? new URLSearchParams(body).toString() : null;
  const res = await httpsRequest({
    hostname: 'api.stripe.com',
    path: `/v1/${path}`,
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
    }
  }, payload);
  return { status: res.status, data: JSON.parse(res.body) };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { email, password, plan, paymentMethodId } = JSON.parse(event.body);

    if (!email || !password || !plan || !paymentMethodId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Check if user already exists
    const existing = await supabase('GET', `users?email=eq.${encodeURIComponent(email)}&select=id`);
    if (existing.data && existing.data.length > 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email already registered' }) };
    }

    // Plan to price ID mapping
    const PRICE_IDS = {
      basic: 'price_1THmxMLcrE1NbjqZhfOE1qRi',
      pro: 'price_1THmyPLcrE1NbjqZNkigkurm',
      annual: 'price_1THmzULcrE1NbjqZyH6PfRIE'
    };

    const priceId = PRICE_IDS[plan];
    if (!priceId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };

    // Create Stripe customer
    const customer = await stripe('POST', 'customers', { email, 'metadata[plan]': plan });
    if (customer.status !== 200) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Failed to create customer' }) };
    }
    const customerId = customer.data.id;

    // Attach payment method to customer
    await stripe('POST', `payment_methods/${paymentMethodId}/attach`, { customer: customerId });

    // Set as default payment method
    await stripe('POST', `customers/${customerId}`, {
      'invoice_settings[default_payment_method]': paymentMethodId
    });

    // Create subscription
    const subscription = await stripe('POST', 'subscriptions', {
      customer: customerId,
      'items[0][price]': priceId,
      'expand[]': 'latest_invoice.payment_intent'
    });

    if (subscription.status !== 200) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Failed to create subscription' }) };
    }

    const subData = subscription.data;
    const subStatus = subData.status;

    // Create user in Supabase
    const passwordHash = hashPassword(password);
    const newUser = await supabase('POST', 'users', {
      email,
      password_hash: passwordHash,
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subData.id,
      status: subStatus === 'active' ? 'active' : 'pending'
    });

    if (newUser.status !== 201) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Failed to create user account' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: { email, plan, status: subStatus },
        clientSecret: subData.latest_invoice?.payment_intent?.client_secret || null
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
