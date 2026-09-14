// BodyCipher Practitioner Admin — Netlify Function
// Uses SUPABASE_URL, SUPABASE_SERVICE_KEY, and ADMIN_SECRET from Netlify env vars

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Auth check
  const adminSecret = event.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const supaHeaders = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  const { action, userId, email, expiryDate } = JSON.parse(event.body || '{}');

  try {
    if (action === 'list') {
      const res = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=100`, {
        headers: supaHeaders
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (action === 'set_expiry') {
      const res = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: supaHeaders,
        body: JSON.stringify({ user_metadata: { expires_at: expiryDate } })
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (action === 'create') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const expires = expiresAt.toISOString().split('T')[0];

      const res = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: supaHeaders,
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: { expires_at: expires }
        })
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ...data, expires_at: expires }) };
    }

    if (action === 'disable') {
      const res = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: supaHeaders,
        body: JSON.stringify({ ban_duration: '876600h' })
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
