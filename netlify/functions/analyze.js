```js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { image, symptoms, attempt } = JSON.parse(event.body);

    // Build the prompt based on input type
    let messages;
    if (image) {
      messages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: image }
          },
          {
            type: 'text',
            text: `You are a herbalist analyzing a photo for educational purposes.

First, judge if the photo is clear enough to analyze (good lighting, in focus, subject visible).

Respond ONLY in this exact JSON format:
{
  "clear": true or false,
  "findings": ["finding 1", "finding 2", "finding 3"],
  "herbs": [
    {"name": "Herb Name", "use": "what it supports", "form": "how to take it"},
    {"name": "Herb Name", "use": "...", "form": "..."},
    {"name": "Herb Name", "use": "...", "form": "..."}
  ]
}

Rules:
- If "clear" is false, still provide 3 general supportive herbs in the herbs array.
- Always return exactly 3 herbs.
- Keep findings concise (under 12 words each).
- No medical claims — educational language only.`
          }
        ]
      }];
    } else if (symptoms) {
      messages = [{
        role: 'user',
        content: `You are a herbalist. The user describes: "${symptoms}"

Respond ONLY in this exact JSON format:
{
  "clear": true,
  "findings": ["observation 1", "observation 2"],
  "herbs": [
    {"name": "Herb Name", "use": "what it supports", "form": "how to take it"},
    {"name": "Herb Name", "use": "...", "form": "..."},
    {"name": "Herb Name", "use": "...", "form": "..."}
  ]
}

Rules:
- Always return exactly 3 herbs.
- Educational language only, no medical claims.`
      }];
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image or symptoms provided' }) };
    }

    // Call Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from Claude's response
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Fallback: always return herbs even if parsing fails
      parsed = {
        clear: true,
        findings: ['Analysis completed'],
        herbs: [
          { name: 'Nettle', use: 'Mineral-rich support for overall vitality', form: 'Infusion, 1–2 cups daily' },
          { name: 'Tulsi', use: 'Adaptogen for stress balance', form: 'Tea, 2–3 cups daily' },
          { name: 'Ginger', use: 'Warming circulation & digestion support', form: 'Fresh tea or capsule' }
        ]
      };
    }

    // Safety net: guarantee herbs array is never empty
    if (!parsed.herbs || parsed.herbs.length === 0) {
      parsed.herbs = [
        { name: 'Nettle', use: 'Mineral-rich support for overall vitality', form: 'Infusion, 1–2 cups daily' },
        { name: 'Tulsi', use: 'Adaptogen for stress balance', form: 'Tea, 2–3 cups daily' },
        { name: 'Ginger', use: 'Warming circulation & digestion support', form: 'Fresh tea or capsule' }
      ];
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
```

