const https = require('https');

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'API key not configured' }); return; }

  const { system, messages } = req.body;

  const payload = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: messages?.[0]?.content || '' }
    ],
    temperature: 0.4,
    max_tokens: 8192,
    response_format: { type: 'json_object' }
  });

  const options = {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    }
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          res.status(500).json({ error: parsed.error.message || 'Groq API error' });
          return;
        }
        let text = parsed?.choices?.[0]?.message?.content || '';
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (match) text = match[0];
        JSON.parse(text);
        res.status(200).json({ content: [{ type: 'text', text }] });
      } catch(e) {
        res.status(500).json({ error: 'Parse error: ' + e.message, raw: data.slice(0, 500) });
      }
    });
  });

  apiReq.on('error', err => res.status(500).json({ error: err.message }));
  apiReq.write(payload);
  apiReq.end();
}
