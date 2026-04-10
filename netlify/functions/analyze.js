exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // CORS headers — allows your app to call this function
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.parse(event.body);

    // Build the Claude API request — pass through model, messages, max_tokens
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // ← stored in Netlify env, never in HTML
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model || 'claude-opus-4-5',
        max_tokens: body.max_tokens || 600,
        messages: body.messages
      })
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.json().catch(() => ({}));
      return {
        statusCode: claudeResponse.status,
        headers,
        body: JSON.stringify({ error: err })
      };
    }

    const data = await claudeResponse.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
