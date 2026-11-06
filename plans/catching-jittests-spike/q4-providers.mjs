// Q4 probe: construct each MJ provider class from a bare API key and make one call, with no database.
// Keys come from the environment only. A provider whose key is unset is skipped.
import { AnthropicLLM } from '@memberjunction/ai-anthropic';
import { OpenAILLM } from '@memberjunction/ai-openai';
import { GeminiLLM } from '@memberjunction/ai-gemini';

const ask = 'Reply with the single word Yes.';

async function probe(name, envVar, LLMClass, model, extra = {}) {
  const key = process.env[envVar];
  if (!key) {
    console.log(name, `| skipped: no ${envVar}`);
    return;
  }
  const llm = new LLMClass(key);
  const t0 = Date.now();
  let r;
  try {
    r = await llm.ChatCompletion({
      model, messages: [{ role: 'user', content: ask }], temperature: 0, maxOutputTokens: 5, ...extra,
    });
  } catch (e) {
    console.log(name, '| model:', model, '| threw:', e.status ?? '', e.message, '| ms:', Date.now() - t0);
    return;
  }
  const c = r.data?.choices?.[0];
  console.log(name, '| model:', model, '| success:', r.success, '| text:', JSON.stringify(c?.message?.content), '| usage:', r.data?.usage, '| ms:', Date.now() - t0);
  if (c?.logprobs) console.log(name, '| first token top_logprobs:', JSON.stringify(c.logprobs.content?.[0]?.top_logprobs));
  if (!r.success) console.log(name, '| statusText:', r.statusText, '| errorMessage:', r.errorMessage);
}

const models = {
  anthropic: process.env.Q4_ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
  openai: process.env.Q4_OPENAI_MODEL ?? 'gpt-4.1-mini',
  gemini: process.env.Q4_GEMINI_MODEL ?? 'gemini-3.5-flash-lite',
};

await probe('anthropic', 'ANTHROPIC_API_KEY', AnthropicLLM, models.anthropic);
await probe('openai', 'OPENAI_API_KEY', OpenAILLM, models.openai, { includeLogProbs: true, topLogProbs: 5 });
await probe('gemini', 'GEMINI_API_KEY', GeminiLLM, models.gemini);
