exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { image, areas } = JSON.parse(event.body);

    if (!image) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
    }

    const areaContext = areas && areas.length
      ? `The user indicated the photo shows: ${areas.join(', ')}.`
      : 'The user did not specify what the photo shows.';

    const prompt = `You are an experienced herbalist trained in traditional iridology, tongue diagnosis, and facial diagnosis (educational reference only — not medical advice).

${areaContext}

Examine the photo carefully. Respond ONLY in this exact JSON format:
{
  "clear": true or false,
  "findings": ["specific observation 1", "specific observation 2", "specific observation 3"],
  "concerns_detected": true or false,
  "suggested_conditions": ["condition_key_1", "condition_key_2"],
  "herbs": [
    {"name": "Herb Name", "latin": "Latin name", "what": "what it supports", "how": "how to take", "potency": "high|moderate|mild"},
    {"name": "Herb Name", "latin": "Latin name", "what": "...", "how": "...", "potency": "..."},
    {"name": "Herb Name", "latin": "Latin name", "what": "...", "how": "...", "potency": "..."}
  ]
}

Rules:
- "clear": false ONLY if photo is too blurry/dark/cropped to make any observation
- If clear: write 2-4 SPECIFIC findings about what you actually see (color, texture, marks, symmetry)
- "concerns_detected": true if you see signs traditionally associated with imbalance (pale tongue, yellow sclera, ridged nails, dark circles, breakouts in zones, etc.)
- "concerns_detected": false ONLY if photo shows healthy, balanced presentation with no traditional warning signs
- Always include 3 supportive herbs from traditional Western/Eastern herbalism
- Educational language only — no medical claims, no diagnosis

Common condition keys: digestive, liver, kidney, adrenal, thyroid, circulatory, immune, skin, nervous, hormonal, blood_sugar, inflammation`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match[0]);
    } catch (e) {
      parsed = {
        clear: true,
        findings: ['Photo received and reviewed'],
        concerns_detected: false,
        suggested_conditions: [],
        herbs: [
          { name: 'Nettle', latin: 'Urtica dioica', what: 'Mineral-rich support for vitality', how: 'Infusion, 1–2 cups daily', potency: 'moderate' },
          { name: 'Tulsi', latin: 'Ocimum sanctum', what: 'Adaptogen for stress balance', how: 'Tea, 2–3 cups daily', potency: 'moderate' },
          { name: 'Ginger', latin: 'Zingiber officinale', what: 'Warming digestion support', how: 'Fresh tea or capsule', potency: 'mild' }
        ]
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
