/**
 * Live smoke tests against Vertex AI — old and new Gemini models through VertexLLM.
 *
 * Opt-in: these make paid API calls, so they run only when all are set:
 *   VERTEX_LIVE_TESTS=1
 *   VERTEX_PROJECT_ID=<gcp project id>
 *   VERTEX_SERVICE_ACCOUNT_KEY_PATH=<path to the service account JSON key>
 *   VERTEX_LIVE_LOCATION=<region>   (optional, default 'global')
 *
 * The location defaults to 'global' because Vertex serves Gemini 3.x models only there; in
 * us-central1 every 3.x model returns 404 (checked 2026-10-06). Gemini 2.5 works in both.
 *
 * Every call sets temperature / topP / topK / effortLevel, so each model proves it accepts what the
 * driver sends. The real `fetch` is wrapped to record each request body, so the tests also assert
 * what actually went on the wire: sampling fields before Gemini 3.6, none from 3.6 on, and never a
 * thinkingConfig.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VertexLLM } from '../models/vertexLLM';
import type { ChatParams, ChatResult } from '@memberjunction/ai';

const projectId = process.env.VERTEX_PROJECT_ID;
const keyFilePath = process.env.VERTEX_SERVICE_ACCOUNT_KEY_PATH;
const location = process.env.VERTEX_LIVE_LOCATION || 'global';
const runLive = process.env.VERTEX_LIVE_TESTS === '1' && !!projectId && !!keyFilePath;

/**
 * Text chat models MJ ships for VertexLLM, oldest first. `sampling` = still receives temperature/topP/topK.
 * Not listed (404 in both us-central1 and global, checked 2026-10-06): gemini-3-pro-preview (retired)
 * and the Gemma 4 models (not served as Vertex publisher models on this project).
 */
const MODELS: ReadonlyArray<{ model: string; sampling: boolean }> = [
  { model: 'gemini-2.5-flash-lite', sampling: true },
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

describe.skipIf(!runLive)(`VertexLLM — live API (${location})`, () => {
  const realFetch = globalThis.fetch;
  /** Request bodies' generationConfig, keyed by model id parsed from the URL. */
  const sent = new Map<string, GenerationConfig[]>();

  const newLLM = (): VertexLLM =>
    new VertexLLM(JSON.stringify({ project: projectId, location, keyFilePath }));

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
      const result = await newLLM().ChatCompletion({
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
      let streamed = '';
      const result = await newLLM().ChatCompletion({
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
      const result = await newLLM().ChatCompletion({
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
