const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'bodycipher_salt_2025').digest('hex');
}

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
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
    }
  }, payload);
  return { status: res.status, data: JSON.parse(res.body) };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password required' }) };
    }

    const passwordHash = hashPassword(password);

    // Look up user
    const result = await supabase('GET', `users?email=eq.${encodeURIComponent(email)}&select=*`);

    if (!result.data || result.data.length === 0) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid email or password' }) };
    }

    const user = result.data[0];

    // Check password
    if (user.password_hash !== passwordHash) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid email or password' }) };
    }

    // Check subscription status
    if (user.status !== 'active') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Your subscription is not active. Please check your billing.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: {
          email: user.email,
          plan: user.plan,
          status: user.status
        }
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
