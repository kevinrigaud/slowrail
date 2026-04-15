const https = require('https');

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'API key not configured' }); return; }

  const { system, messages } = req.body;
  const userContent = messages?.[0]?.content || '';

  // Instruct Gemini very firmly to return only JSON
  const fullPrompt = `${system}

CRITICAL INSTRUCTION: Your response must contain ONLY the JSON object. No markdown, no backticks, no explanation before or after. Start your response with { and end with }. Nothing else.

${userContent}`;

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4000
    }
  });

  const path = `/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    }
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);

        // Check for API errors
        if (parsed.error) {
          res.status(500).json({ error: parsed.error.message || 'Gemini API error' });
          return;
        }

        let text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Strip any markdown fences if present despite instructions
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        // Extract JSON object if surrounded by text
        const match = text.match(/\{[\s\S]*\}/);
        if (match) text = match[0];

        // Validate it's parseable JSON before returning
        JSON.parse(text); // throws if invalid

        // Return in Anthropic-compatible format so frontend works unchanged
        res.status(200).json({
          content: [{ type: 'text', text }]
        });

      } catch(e) {
        res.status(500).json({ error: 'Parse error: ' + e.message, raw: data.slice(0, 500) });
      }
    });
  });

  apiReq.on('error', err => res.status(500).json({ error: err.message }));
  apiReq.write(payload);
  apiReq.end();
}
