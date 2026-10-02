import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionParams,
  LikelihoodAnswer,
  LikelihoodQuestion,
  ScoreAnswer,
  ScoreQuestion,
} from '@memberjunction/ai';

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (_target: unknown) => {},
  };
});

import { PerplexityDecision } from '../models/perplexityDecision';

const API_KEY = 'pplx-test-key-no-network';

/** The state of Perplexity's quickstart: one product review, as an object. */
const QUICKSTART_STATE = {
  title: 'Battery died after two weeks',
  review: 'The headphones sound great, but the battery stopped charging after two weeks.',
};

/** The quickstart's three questions, as MJ asks them. */
const QUICKSTART_QUESTIONS: DecisionParams['Questions'] = {
  defect: { Kind: 'Likelihood', Instructions: 'Does the review report a product defect?' } as LikelihoodQuestion,
  sentiment: {
    Kind: 'Choice',
    Instructions: 'What is the overall sentiment of the review?',
    Options: [
      { Value: 'positive', Description: 'Mostly satisfied' },
      { Value: 'mixed', Description: 'Praise and complaints in one review' },
      { Value: 'negative', Description: 'Mostly dissatisfied' },
    ],
  } as ChoiceQuestion,
  severity: {
    Kind: 'Score',
    Instructions: 'How severe is the reported problem?',
    Levels: ['Cosmetic', 'Inconvenient', 'Product unusable'],
  } as ScoreQuestion,
};

/** The request body the quickstart sends, verbatim (https://docs.perplexity.ai/docs/decisions/quickstart). */
const QUICKSTART_REQUEST = {
  model: 'pplx-decider-v1-27b',
  state: QUICKSTART_STATE,
  questions: {
    defect: { type: 'noul', instructions: 'Does the review report a product defect?' },
    sentiment: {
      type: 'choice',
      instructions: 'What is the overall sentiment of the review?',
      criteria: { positive: 'Mostly satisfied', mixed: 'Praise and complaints in one review', negative: 'Mostly dissatisfied' },
    },
    severity: { type: 'score', instructions: 'How severe is the reported problem?', criteria: ['Cosmetic', 'Inconvenient', 'Product unusable'] },
  },
};

/** The quickstart's response to that request, verbatim, as the API sent it. */
const QUICKSTART_RESPONSE_TEXT =
  '{"model":"pplx-decider-v1-27b","answers":{"defect":{"type":"noul","noul":0.9424522889347015},"sentiment":{"type":"choice","choice":"mixed","confidence":0.9255246944002182,"probabilities":{"positive":0.020649883775315993,"mixed":0.9503497962668123,"negative":0.02900031995787183}},"severity":{"type":"score","score":1.7838686319784252,"confidence":0.7838686319784252,"legend":{"0":"Cosmetic","1":"Inconvenient","2":"Product unusable"},"probabilities":{"0":0.008423954913615923,"1":0.199283458194343,"2":0.7922925868920411}}},"usage":{"input_tokens":367,"output_tokens":3}}';

interface Captured {
  Url: string;
  Init?: RequestInit;
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return textResponse(JSON.stringify(body), status);
}

function fakeFetch(respond: () => Response): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ Url: String(url), Init: init });
    return respond();
  });
  return calls;
}

function quickstartParams(overrides: Partial<DecisionParams> = {}): DecisionParams {
  return { Model: 'pplx-decider-v1-27b', State: QUICKSTART_STATE, Questions: QUICKSTART_QUESTIONS, ...overrides };
}

describe('PerplexityDecision', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it("POSTs the quickstart's three question kinds to https://api.perplexity.ai/v1/decisions with a bearer key", async () => {
      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      const controller = new AbortController();
      const result = await new PerplexityDecision(API_KEY).Decide(quickstartParams({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe('https://api.perplexity.ai/v1/decisions');
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual(QUICKSTART_REQUEST);
    });

    it('sends a string state as it is', async () => {
      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      await new PerplexityDecision(API_KEY).Decide(quickstartParams({ State: 'The battery stopped charging.' }));

      expect(JSON.parse(String(calls[0].Init?.body)).state).toBe('The battery stopped charging.');
    });

    it('asks pplx-decider-v1-27b when DecisionParams.Model is empty, and passes another APIName through', async () => {
      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      const driver = new PerplexityDecision(API_KEY);
      await driver.Decide(quickstartParams({ Model: '' }));
      await driver.Decide(quickstartParams({ Model: 'pplx-decider-v2' }));

      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('pplx-decider-v1-27b');
      expect(JSON.parse(String(calls[1].Init?.body)).model).toBe('pplx-decider-v2');
    });
  });

  describe('the response', () => {
    it("maps the quickstart's response, verbatim", async () => {
      fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      const result = await new PerplexityDecision(API_KEY).Decide(quickstartParams());

      expect(result.success).toBe(true);
      expect(result.ResolvedModel).toBe('pplx-decider-v1-27b');
      expect(result.Usage?.promptTokens).toBe(367);
      expect(result.Usage?.completionTokens).toBe(3);
      expect(result.Usage?.cost).toBeUndefined();

      expect(result.Answers['defect'] as LikelihoodAnswer).toEqual({ Kind: 'Likelihood', Probability: 0.9424522889347015 });

      const sentiment = result.Answers['sentiment'] as ChoiceAnswer;
      expect(sentiment.Kind).toBe('Choice');
      expect(sentiment.Value).toBe('mixed');
      expect(sentiment.Confidence).toBe(0.9255246944002182);
      expect(Object.keys(sentiment.Probabilities)).toEqual(['positive', 'mixed', 'negative']);
      expect(sentiment.Probabilities['positive']).toBeCloseTo(0.020649883775315993, 12);
      expect(sentiment.Probabilities['mixed']).toBeCloseTo(0.9503497962668123, 12);
      expect(sentiment.Probabilities['negative']).toBeCloseTo(0.02900031995787183, 12);

      const severity = result.Answers['severity'] as ScoreAnswer;
      expect(severity.Kind).toBe('Score');
      expect(severity.Value).toBe(1.7838686319784252);
      expect(severity.Confidence).toBe(0.7838686319784252);
      expect(Object.keys(severity.Probabilities)).toEqual(['Cosmetic', 'Inconvenient', 'Product unusable']);
      expect(severity.Probabilities['Cosmetic']).toBeCloseTo(0.008423954913615923, 12);
      expect(severity.Probabilities['Inconvenient']).toBeCloseTo(0.199283458194343, 12);
      expect(severity.Probabilities['Product unusable']).toBeCloseTo(0.7922925868920411, 12);
    });

    // Perplexity's API reference settles which keys a Score's probabilities carry: "Probability of each
    // level, keyed like `legend`", and `legend` is "Level index, as a string, mapped back to the
    // `criteria` entry it stands for". So they are read by index, never by level name.
    it("reads a Score's probabilities by level index, even when the level names are digits", async () => {
      fakeFetch(() => jsonResponse({
        model: 'pplx-decider-v1-27b',
        answers: {
          rating: {
            type: 'score',
            score: 1.6,
            confidence: 0.6,
            legend: { '0': '1', '1': '2', '2': '3' },
            probabilities: { '0': 0.1, '1': 0.2, '2': 0.7 },
          },
        },
        usage: { input_tokens: 40, output_tokens: 1 },
      }));
      const result = await new PerplexityDecision(API_KEY).Decide({
        Model: 'pplx-decider-v1-27b',
        State: 'Four stars, would buy again.',
        Questions: { rating: { Kind: 'Score', Instructions: 'How many stars?', Levels: ['1', '2', '3'] } as ScoreQuestion },
      });

      expect(result.success).toBe(true);
      // Index "0" is level '1', index "1" is level '2', index "2" is level '3'. A lookup by level name
      // would have read index "1" for level '1' and index "2" for level '2'.
      expect((result.Answers['rating'] as ScoreAnswer).Probabilities).toEqual({ '1': 0.1, '2': 0.2, '3': 0.7 });
    });
  });

  describe('the key and the endpoint', () => {
    it("sends a JSON credential's apiKey, not its JSON", async () => {
      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      const result = await new PerplexityDecision(JSON.stringify({ apiKey: 'pplx-from-credential' })).Decide(quickstartParams());

      expect(result.success).toBe(true);
      expect(calls[0].Url).toBe('https://api.perplexity.ai/v1/decisions');
      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer pplx-from-credential', 'Content-Type': 'application/json' });
    });

    it('sends a plain key as it is', async () => {
      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      await new PerplexityDecision('pplx-plain').Decide(quickstartParams());

      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer pplx-plain', 'Content-Type': 'application/json' });
    });

    it("prefers the constructor's endpoint over the credential's, and the credential's over the default", async () => {
      const credential = JSON.stringify({ apiKey: 'pplx-k', endpoint: 'https://credential.example.test/v1/decisions' });
      expect(new PerplexityDecision(credential, 'https://ctor.example.test/v1/decisions').EndpointURL).toBe('https://ctor.example.test/v1/decisions');
      expect(new PerplexityDecision(credential).EndpointURL).toBe('https://credential.example.test/v1/decisions');
      expect(new PerplexityDecision('pplx-k').EndpointURL).toBe(PerplexityDecision.DEFAULT_ENDPOINT);
      expect(new PerplexityDecision('pplx-k', '  ').EndpointURL).toBe(PerplexityDecision.DEFAULT_ENDPOINT);

      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      await new PerplexityDecision(credential, 'https://ctor.example.test/v1/decisions').Decide(quickstartParams());
      expect(calls[0].Url).toBe('https://ctor.example.test/v1/decisions');
    });

    it('removes trailing slashes, which the API answers with a 404', () => {
      expect(new PerplexityDecision('pplx-k', 'https://api.perplexity.ai/v1/decisions/').EndpointURL).toBe('https://api.perplexity.ai/v1/decisions');
    });
  });

  describe('a missing key', () => {
    it.each([
      ['an empty key', ''],
      ['a blank key', '   '],
      ['a JSON credential with no apiKey', JSON.stringify({ endpoint: 'https://api.perplexity.ai/v1/decisions' })],
      ['a JSON credential with an empty apiKey', JSON.stringify({ apiKey: '' })],
    ])('fails %s before any request, with a NoCredentials error that allows failover', async (_label, apiKey) => {
      const calls = fakeFetch(() => textResponse(QUICKSTART_RESPONSE_TEXT));
      const result = await new PerplexityDecision(apiKey).Decide(quickstartParams());

      expect(calls).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'API Key' credential");
      expect(result.errorMessage).toContain('AI_VENDOR_API_KEY__PERPLEXITYDECISION');
      expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
    });
  });

  describe('HTTP errors', () => {
    const run = async (body: unknown, status: number) => {
      fakeFetch(() => (typeof body === 'string' ? new Response(body, { status }) : jsonResponse(body, status)));
      return new PerplexityDecision(API_KEY).Decide(quickstartParams());
    };

    it("names Perplexity's 401 message and classifies it as a fatal authentication error", async () => {
      const result = await run({ error: { message: 'Invalid API key provided. You can find your API key at https://console.perplexity.ai.', type: 'invalid_api_key', code: 401 } }, 401);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Perplexity Decisions API returned HTTP 401: Invalid API key provided. You can find your API key at https://console.perplexity.ai.');
      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal', httpStatusCode: 401 });
    });

    it("names Perplexity's 429 message and makes it a failover-eligible rate limit", async () => {
      const result = await run({ error: { code: null, message: 'Request rate limit exceeded, please try again later.', param: null, type: 'too_many_requests' } }, 429);

      expect(result.errorMessage).toBe('Perplexity Decisions API returned HTTP 429: Request rate limit exceeded, please try again later.');
      expect(result.errorInfo).toMatchObject({ errorType: 'RateLimit', severity: 'Retriable', httpStatusCode: 429, canFailover: true });
    });

    it.each([
      [500, 'InternalServerError'],
      [502, 'InternalServerError'],
      [503, 'ServiceUnavailable'],
    ])('makes an empty-bodied %i failover-eligible as %s', async (status, errorType) => {
      const result = await run('', status);

      expect(result.errorMessage).toBe(`Perplexity Decisions API returned HTTP ${status}`);
      expect(result.errorInfo).toMatchObject({ errorType, httpStatusCode: status, canFailover: true });
    });

    it("keeps the start of a 504's HTML page, and makes it failover-eligible", async () => {
      const result = await run('<html><body><h1>504 Gateway Time-out</h1></body></html>', 504);

      expect(result.errorMessage).toBe('Perplexity Decisions API returned HTTP 504: <html><body><h1>504 Gateway Time-out</h1></body></html>');
      expect(result.errorInfo).toMatchObject({ httpStatusCode: 504, canFailover: true });
    });

    // ErrorAnalyzer maps no type to 413 and the message matches none of its patterns, so it is Unknown,
    // which allows failover: another model may take the input. MJ sends no images, so a body over
    // 32 MiB needs a state far beyond the model's 262,144-token limit.
    it("names a 413's message, and lets it fail over", async () => {
      const result = await run({ error: { code: null, message: 'request body exceeds the maximum allowed size of 33554432 bytes', param: null, type: 'invalid_request_error' } }, 413);

      expect(result.errorMessage).toBe('Perplexity Decisions API returned HTTP 413: request body exceeds the maximum allowed size of 33554432 bytes');
      expect(result.errorInfo).toMatchObject({ errorType: 'Unknown', severity: 'Transient', httpStatusCode: 413, canFailover: true });
    });

    it("names a 400's message", async () => {
      const message = "Invalid model 'pplx-decider-v1-27b-latest'. Permitted models can be found in the documentation at https://docs.perplexity.ai/docs/getting-started/models.";
      const result = await run({ error: { message, type: 'invalid_request_error', param: null, code: null } }, 400);

      expect(result.errorMessage).toBe(`Perplexity Decisions API returned HTTP 400: ${message}`);
      expect(result.errorInfo?.httpStatusCode).toBe(400);
    });
  });
});
