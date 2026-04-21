// Minimal Gemini client with timing + usage capture.
// Uses Node 20 built-in fetch; no external deps.

import { performance } from 'node:perf_hooks';

const MODEL = process.env.AI_MODEL || 'gemini-3-flash-preview';
const API_KEY = process.env.AI_API_KEY;
if (!API_KEY) {
    throw new Error('AI_API_KEY env var required');
}

const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

export async function callGemini(prompt, { temperature = 0.1, json = true, retry = 2 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retry; attempt++) {
        const t0 = performance.now();
        try {
            const resp = await fetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature,
                        responseMimeType: json ? 'application/json' : 'text/plain',
                    },
                }),
            });
            const body = await resp.json();
            const t1 = performance.now();
            if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${JSON.stringify(body).slice(0, 400)}`);

            return {
                text: body.candidates?.[0]?.content?.parts?.[0]?.text || '',
                latencyMs: Math.round(t1 - t0),
                promptChars: prompt.length,
                inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
                outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
                attempt,
            };
        } catch (err) {
            lastErr = err;
            if (attempt < retry) {
                const backoff = 500 * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, backoff));
            }
        }
    }
    throw lastErr;
}

export function model() {
    return MODEL;
}
