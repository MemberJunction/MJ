/**
 * Live smoke tests against the real Gemini API — old and new models.
 *
 * Opt-in: these make paid API calls, so they run only when BOTH are set:
 *   GEMINI_LIVE_TESTS=1
 *   AI_VENDOR_API_KEY__GeminiLLM=<key>   (the same variable MJAPI reads)
 *
 *   GEMINI_LIVE_TESTS=1 AI_VENDOR_API_KEY__GeminiLLM=... npx vitest run src/__tests__/gemini.live.test.ts
 *
 * Every call sets temperature / topP / topK / effortLevel, so each model proves it accepts what the
 * driver sends. The real `fetch` is wrapped to record each request body, so the tests also assert
 * what actually went on the wire: sampling fields before Gemini 3.6, none from 3.6 on, and never a
 * thinkingConfig.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GeminiLLM } from '../index';
import type { ChatParams, ChatResult } from '@memberjunction/ai';

const apiKey = process.env.AI_VENDOR_API_KEY__GeminiLLM;
const runLive = process.env.GEMINI_LIVE_TESTS === '1' && !!apiKey;

/**
 * Text chat models MJ ships for GeminiLLM, oldest first. `sampling` = still receives temperature/topP/topK.
 * Not listed (both return 404, checked 2026-10-06): gemini-2.5-flash-lite ("no longer available to new
 * users") and gemini-3-pro-preview ("no longer available"; replaced by gemini-3.1-pro-preview).
 */
const MODELS: ReadonlyArray<{ model: string; sampling: boolean }> = [
  { model: 'gemini-2.5-flash', sampling: true },
  { model: 'gemini-2.5-pro', sampling: true },
  { model: 'gemini-3-flash-preview', sampling: true },
  { model: 'gemini-3.1-flash-lite', sampling: true },
  { model: 'gemini-3.1-pro-preview', sampling: true },
  { model: 'gemini-3.5-flash-lite', sampling: true },
  { model: 'gemini-3.5-flash', sampling: true },
  { model: 'gemini-3.6-flash', sampling: false },
  { model: 'gemini-3.7-flash', sampling: false },
  { model: 'gemini-3.8-flash', sampling: false },
];

const TIMEOUT_MS = 180_000;

type GenerationConfig = Record<string, unknown>;

describe.skipIf(!runLive)('GeminiLLM — live API', () => {
  const realFetch = globalThis.fetch;
  /** Request bodies' generationConfig, keyed by model id parsed from the URL. */
  const sent = new Map<string, GenerationConfig[]>();

  beforeAll(() => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const model = /models\/([^:/?]+):/.exec(url)?.[1];
      if (model && typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as { generationConfig?: GenerationConfig };
        const list = sent.get(model) ?? [];
        list.push(body.generationConfig ?? {});
        sent.set(model, list);
      }
      return realFetch(input, init);
    };
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  const sampling: Pick<ChatParams, 'temperature' | 'topP' | 'topK' | 'effortLevel'> = {
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    effortLevel: '50',
  };

  const expectWireShape = (model: string, keepsSampling: boolean): void => {
    const configs = sent.get(model) ?? [];
    expect(configs.length, `no request recorded for ${model}`).toBeGreaterThan(0);
    for (const config of configs) {
      expect(config).not.toHaveProperty('thinkingConfig');
      if (keepsSampling) {
        expect(config).toMatchObject({ temperature: 0.2, topP: 0.9, topK: 40 });
      } else {
        expect(config).not.toHaveProperty('temperature');
        expect(config).not.toHaveProperty('topP');
        expect(config).not.toHaveProperty('topK');
      }
    }
  };

  const describeFailure = (result: ChatResult): string =>
    `${result.errorMessage ?? 'unknown error'}${result.exception ? ` — ${String(result.exception)}` : ''}`;

  describe.each(MODELS)('$model', ({ model, sampling: keepsSampling }) => {
    it.concurrent('answers a non-streaming request', async () => {
      const llm = new GeminiLLM(apiKey as string);
      const result = await llm.ChatCompletion({
        model,
        ...sampling,
        messages: [
          { role: 'system', content: 'You are a calculator. Reply with the number only.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
      });
      expect(result.success, describeFailure(result)).toBe(true);
      expect(result.data.choices[0].message.content).toContain('4');
    }, TIMEOUT_MS);

    it.concurrent('answers a streaming request', async () => {
      const llm = new GeminiLLM(apiKey as string);
      let streamed = '';
      const result = await llm.ChatCompletion({
        model,
        ...sampling,
        streaming: true,
        streamingCallbacks: { OnContent: (chunk: string) => { streamed += chunk; } },
        messages: [{ role: 'user', content: 'Name the capital of France in one word.' }],
      });
      expect(result.success, describeFailure(result)).toBe(true);
      expect(`${streamed} ${result.data.choices[0].message.content}`.toLowerCase()).toContain('paris');
    }, TIMEOUT_MS);

    it.concurrent('returns valid JSON for responseFormat JSON', async () => {
      const llm = new GeminiLLM(apiKey as string);
      const result = await llm.ChatCompletion({
        model,
        ...sampling,
        responseFormat: 'JSON',
        messages: [{ role: 'user', content: 'Return {"answer": <the sum of 3 and 4>} as JSON.' }],
      });
      expect(result.success, describeFailure(result)).toBe(true);
      const parsed = JSON.parse(result.data.choices[0].message.content) as { answer: number | string };
      expect(Number(parsed.answer)).toBe(7);
    }, TIMEOUT_MS);

    it('sent the expected fields on the wire', () => {
      expectWireShape(model, keepsSampling);
    });
  });
});
