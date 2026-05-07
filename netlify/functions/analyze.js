exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { image, areas } = JSON.parse(event.body);

    if (!image) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
    }

    // ✅ Auto-detect image format (iPhone often sends PNG, not JPEG)
    let mediaType = 'image/jpeg';
    let cleanBase64 = image;
    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        mediaType = match[1];
        cleanBase64 = match[2];
      }
    }

    const areaContext = areas && areas.length
      ? `The user indicated the photo shows: ${areas.join(', ')}.`
      : 'The user did not specify what the photo shows.';

    const prompt = `You are a traditional herbalist trained in iridology, tongue diagnosis, nail analysis, and facial diagnosis. This is for educational wellness reference only.

${areaContext}

CRITICAL: Examine the photo with full attention. You MUST report any visible signs, including:

EYES: Yellow tint in whites (sclera) → liver/gallbladder concern. Red/bloodshot → inflammation. Cloudy → toxin buildup. Dark circles → kidney/adrenal fatigue. Pale conjunctiva → possible iron deficiency.

TONGUE: Pale → blood deficiency. Bright red → heat. Purple → circulation. Thick coating → digestive imbalance. Yellow coating → heat/infection. Cracks → dehydration. Scalloped edges → spleen weakness.

NAILS: White spots → mineral deficiency. Vertical ridges → aging. Horizontal lines → past stress. Yellow → fungal/liver. Pale → anemia. Blue → circulation.

SKIN/FACE: Yellow undertone → liver. Redness → inflammation. Acne by zone (forehead=digestion, cheeks=lungs, chin=hormones). Dryness, swelling, dark patches.

MANDATORY RULE: If you see ANY yellowing, discoloration, abnormal coating, lines, swelling, or unusual appearance, you MUST set "concerns_detected": true and describe the finding specifically. Do NOT say "looks healthy" unless the image truly shows zero traditional warning signs.

MANDATORY REMEDY RULE: Always return herbal remedies in the "herbs" array. Do not return pharmaceuticals, procedures, diagnoses, prescriptions, or non-herbal treatments. Every herb must include name, latin, what, how, and potency.

MANDATORY DISCLAIMER RULE: Always include the "disclaimer_banner" field exactly as shown so it can be displayed after every result.

Respond in EXACTLY this JSON (no extra text before or after):
{
  "clear": true,
  "findings": ["specific observation 1", "specific observation 2", "specific observation 3"],
  "concerns_detected": true,
  "suggested_conditions": ["liver", "digestive"],
  "herbs": [
    {"name": "Milk Thistle", "latin": "Silybum marianum", "what": "Traditional liver support", "how": "300mg standardized extract daily", "potency": "high"},
    {"name": "Dandelion Root", "latin": "Taraxacum officinale", "what": "Liver and digestive bitter", "how": "Tea or tincture, 2x daily", "potency": "moderate"},
    {"name": "Burdock Root", "latin": "Arctium lappa", "what": "Blood and lymph cleanser", "how": "Decoction, 1 cup daily", "potency": "moderate"}
  ],
  "disclaimer_banner": "Educational wellness information only. Not medical advice, diagnosis, treatment, or a substitute for care from a qualified healthcare provider. Consult a healthcare provider before using herbs, especially if pregnant, nursing, taking medication, managing a health condition, or under 18. Users under 18 should use BodyCipher only with parent or guardian consent and healthcare-provider guidance."
}

Set "clear": false ONLY if the photo is genuinely too blurry, too dark, or too cropped to observe anything. Otherwise, always provide observations.`;

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
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: cleanBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    
    // Debug: log full Claude response
    console.log('Claude raw response:', JSON.stringify(data));
    
    const text = data.content?.[0]?.text || '';
    console.log('Claude text:', text);

    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON found in Claude response');
      parsed = JSON.parse(match[0]);
    } catch (e) {
      // ✅ Smarter fallback: if Claude responded but we couldn't parse, return the raw text as a finding
      parsed = {
        clear: true,
        findings: text 
          ? ['Photo reviewed — see notes below', text.substring(0, 200)]
          : ['Photo could not be analyzed clearly'],
        concerns_detected: !!text, // if Claude said anything, assume something was noted
        suggested_conditions: ['general'],
        herbs: [
          { name: 'Nettle', latin: 'Urtica dioica', what: 'Broad mineral and vitality support', how: 'Infusion, 1–2 cups daily', potency: 'moderate' },
          { name: 'Dandelion Root', latin: 'Taraxacum officinale', what: 'Liver and digestive support', how: 'Tea or tincture, 2x daily', potency: 'moderate' },
          { name: 'Tulsi', latin: 'Ocimum sanctum', what: 'Adaptogen for stress and balance', how: 'Tea, 2–3 cups daily', potency: 'moderate' }
        ],
        disclaimer_banner: 'Educational wellness information only. Not medical advice, diagnosis, treatment, or a substitute for care from a qualified healthcare provider. Consult a healthcare provider before using herbs, especially if pregnant, nursing, taking medication, managing a health condition, or under 18. Users under 18 should use BodyCipher only with parent or guardian consent and healthcare-provider guidance.',
        _debug: { rawText: text, claudeResponse: data }
      };
    }

    if (!Array.isArray(parsed.herbs) || parsed.herbs.length === 0) {
      parsed.herbs = [
        { name: 'Nettle', latin: 'Urtica dioica', what: 'Traditional mineral-rich vitality support', how: 'Infusion, 1–2 cups daily', potency: 'moderate' },
        { name: 'Dandelion Root', latin: 'Taraxacum officinale', what: 'Traditional digestive and liver support', how: 'Tea or tincture, 1–2x daily', potency: 'moderate' },
        { name: 'Tulsi', latin: 'Ocimum sanctum', what: 'Traditional adaptogenic stress support', how: 'Tea, 1–3 cups daily', potency: 'moderate' }
      ];
    }

    parsed.disclaimer_banner = 'Educational wellness information only. Not medical advice, diagnosis, treatment, or a substitute for care from a qualified healthcare provider. Consult a healthcare provider before using herbs, especially if pregnant, nursing, taking medication, managing a health condition, or under 18. Users under 18 should use BodyCipher only with parent or guardian consent and healthcare-provider guidance.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    console.error('Function error:', err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: err.message, stack: err.stack }) 
    };
  }
};
