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

import { SystemOneDecision, ToSystemOneURL } from '../models/systemOneDecision';

const ENV_VAR = SystemOneDecision.BASE_URL_ENV_VAR;

/** A Kev server's response to the three sample questions: bare, keyed like Jev's. */
const KEV_RESPONSE = {
  model: 'kev-latest',
  answers: {
    urgent: { type: 'noul', noul: 0.8673 },
    team: { type: 'choice', choice: 'technical', probabilities: { billing: 0.0699, technical: 0.8968, sales: 0.0333 }, confidence: 0.8452 },
    severity: {
      type: 'score',
      score: 2.5764,
      legend: { '0': 'No impact', '1': 'Minor', '2': 'Major', '3': 'Critical' },
      probabilities: { '0': 0.0153, '1': 0.0322, '2': 0.3134, '3': 0.6392 },
      confidence: 0.8588,
    },
  },
  usage: { input_tokens: 86, output_tokens: 192 },
  latency_ms: 41.5,
};

const QUESTIONS: DecisionParams['Questions'] = {
  urgent: { Kind: 'Likelihood', Instructions: 'Is this support request urgent?' } as LikelihoodQuestion,
  team: {
    Kind: 'Choice',
    Instructions: 'Which team should handle this request?',
    Options: [
      { Value: 'billing', Description: 'Payments, invoices, and refunds' },
      { Value: 'technical', Description: 'Outages, errors, and configuration' },
      { Value: 'sales', Description: 'Plans and upgrades' },
    ],
  } as ChoiceQuestion,
  severity: {
    Kind: 'Score',
    Instructions: 'How severe is the customer impact?',
    Levels: ['No impact', 'Minor', 'Major', 'Critical'],
  } as ScoreQuestion,
};

const STATE = 'Checkout has been failing for every customer for the last hour.';

interface Captured {
  Url: string;
  Init?: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeFetch(respond: () => Response): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ Url: String(url), Init: init });
    return respond();
  });
  return calls;
}

function params(overrides: Partial<DecisionParams> = {}): DecisionParams {
  return { Model: 'kev-latest', State: STATE, Questions: QUESTIONS, ...overrides };
}

describe('SystemOneDecision', () => {
  let originalFetch: typeof globalThis.fetch;
  let savedEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    savedEnv = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedEnv === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = savedEnv;
    }
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('POSTs all three question kinds to {base}/v1/systemone with no Authorization header for an open server', async () => {
      process.env[ENV_VAR] = 'http://127.0.0.1:8080';
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      const controller = new AbortController();
      const result = await new SystemOneDecision('').Decide(params({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe('http://127.0.0.1:8080/v1/systemone');
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual({
        model: 'kev-latest',
        state: STATE,
        questions: {
          urgent: { type: 'noul', instructions: 'Is this support request urgent?' },
          team: {
            type: 'choice',
            instructions: 'Which team should handle this request?',
            criteria: {
              billing: 'Payments, invoices, and refunds',
              technical: 'Outages, errors, and configuration',
              sales: 'Plans and upgrades',
            },
          },
          severity: {
            type: 'score',
            instructions: 'How severe is the customer impact?',
            criteria: ['No impact', 'Minor', 'Major', 'Critical'],
          },
        },
      });
    });

    it('sends a raw API key as a bearer token', async () => {
      process.env[ENV_VAR] = 'https://acme--kev-api.modal.run';
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      await new SystemOneDecision('kev-secret').Decide(params());

      expect(calls[0].Url).toBe('https://acme--kev-api.modal.run/v1/systemone');
      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer kev-secret', 'Content-Type': 'application/json' });
    });

    it('asks kev-latest when DecisionParams.Model is empty, and passes another APIName through', async () => {
      process.env[ENV_VAR] = 'http://127.0.0.1:8080';
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      const driver = new SystemOneDecision('');
      await driver.Decide(params({ Model: '' }));
      await driver.Decide(params({ Model: 'jev-latest' }));

      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('kev-latest');
      expect(JSON.parse(String(calls[1].Init?.body)).model).toBe('jev-latest');
    });
  });

  describe('the endpoint and the credential', () => {
    it('reads the endpoint and token from a JSON credential (API Key with Endpoint)', async () => {
      process.env[ENV_VAR] = 'http://ignored.example.test';
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      const driver = new SystemOneDecision(JSON.stringify({ apiKey: 'tok-1', endpoint: 'https://kev-9b.example.test/' }));
      const result = await driver.Decide(params());

      expect(result.success).toBe(true);
      expect(driver.EndpointURL).toBe('https://kev-9b.example.test/v1/systemone');
      expect(calls[0].Url).toBe('https://kev-9b.example.test/v1/systemone');
      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer tok-1', 'Content-Type': 'application/json' });
    });

    it('sends no Authorization header for a JSON credential with an empty apiKey', async () => {
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      await new SystemOneDecision(JSON.stringify({ apiKey: '', endpoint: 'http://10.0.0.5:8080' })).Decide(params());

      expect(calls[0].Url).toBe('http://10.0.0.5:8080/v1/systemone');
      expect(calls[0].Init?.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('falls back to SYSTEMONE_BASE_URL when the credential has no endpoint', async () => {
      process.env[ENV_VAR] = 'http://localhost:8008/';
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      await new SystemOneDecision(JSON.stringify({ apiKey: 'tok-2' })).Decide(params());

      expect(calls[0].Url).toBe('http://localhost:8008/v1/systemone');
      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer tok-2', 'Content-Type': 'application/json' });
    });

    it('prefers the constructor URL over the credential endpoint and the environment', () => {
      process.env[ENV_VAR] = 'http://env.example.test';
      const driver = new SystemOneDecision(JSON.stringify({ apiKey: 'k', endpoint: 'http://credential.example.test' }), 'http://ctor.example.test');
      expect(driver.EndpointURL).toBe('http://ctor.example.test/v1/systemone');
    });

    it('appends the route once, whatever the base URL already ends with', () => {
      expect(ToSystemOneURL('https://typesafe.example.test')).toBe('https://typesafe.example.test/v1/systemone');
      expect(ToSystemOneURL('https://typesafe.example.test/')).toBe('https://typesafe.example.test/v1/systemone');
      expect(ToSystemOneURL('https://typesafe.example.test/v1')).toBe('https://typesafe.example.test/v1/systemone');
      expect(ToSystemOneURL('https://typesafe.example.test/v1/systemone/')).toBe('https://typesafe.example.test/v1/systemone');
      expect(ToSystemOneURL(' http://127.0.0.1:8080/v1/systemone ')).toBe('http://127.0.0.1:8080/v1/systemone');
    });

    it('fails without a request, allowing failover, when no base URL is configured', async () => {
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      const driver = new SystemOneDecision('tok');
      const result = await driver.Decide(params());

      expect(driver.EndpointURL).toBeUndefined();
      expect(calls).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'API Key with Endpoint'");
      expect(result.errorMessage).toContain('SYSTEMONE_BASE_URL');
      expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
    });

    it('sends nothing to SYSTEMONE_BASE_URL when the credential starts with { but is not JSON', async () => {
      // Before, the whole text, key and intended endpoint included, went to the variable's host as the token.
      process.env[ENV_VAR] = 'http://env.example.test';
      const calls = fakeFetch(() => jsonResponse(KEV_RESPONSE));
      const result = await new SystemOneDecision('{"apiKey":"sk-123","endpoint":"https://s1.example",}').Decide(params());

      expect(calls).toHaveLength(0);
      expect(result.errorMessage).toContain('is not valid JSON');
      expect(result.errorMessage).not.toContain('sk-123');
      expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
    });
  });

  describe('the response', () => {
    it('maps a bare System One response, re-keying Score probabilities and renormalising Choice', async () => {
      process.env[ENV_VAR] = 'http://127.0.0.1:8080';
      fakeFetch(() => jsonResponse(KEV_RESPONSE));
      const result = await new SystemOneDecision('').Decide(params());

      expect(result.success).toBe(true);
      expect(result.ResolvedModel).toBe('kev-latest');
      expect(result.Usage?.promptTokens).toBe(86);
      expect(result.Usage?.completionTokens).toBe(192);
      expect(result.Usage?.cost).toBeUndefined();
      expect(result.Answers['urgent'] as LikelihoodAnswer).toEqual({ Kind: 'Likelihood', Probability: 0.8673 });

      const team = result.Answers['team'] as ChoiceAnswer;
      expect(team.Value).toBe('technical');
      expect(team.Confidence).toBe(0.8452);
      expect(Object.values(team.Probabilities).reduce((t, p) => t + p, 0)).toBeCloseTo(1, 10);

      const severity = result.Answers['severity'] as ScoreAnswer;
      expect(severity.Value).toBe(2.5764);
      expect(Object.keys(severity.Probabilities)).toEqual(['No impact', 'Minor', 'Major', 'Critical']);
      expect(severity.Probabilities['Critical']).toBeCloseTo(0.6392 / 1.0001, 10);
    });
  });

  describe('HTTP errors', () => {
    const run = async (body: unknown, status: number) => {
      process.env[ENV_VAR] = 'http://127.0.0.1:8080';
      fakeFetch(() => (typeof body === 'string' ? new Response(body, { status }) : jsonResponse(body, status)));
      return new SystemOneDecision('tok').Decide(params());
    };

    it("names Kev's 401 detail and classifies it as a fatal authentication error", async () => {
      const result = await run({ detail: 'missing or invalid API key; send Authorization: Bearer <KEV_API_KEY>' }, 401);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('System One endpoint returned HTTP 401: missing or invalid API key; send Authorization: Bearer <KEV_API_KEY>');
      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal', httpStatusCode: 401 });
    });

    it("names a 422's detail list", async () => {
      const result = await run({ detail: [{ loc: ['body', 'questions'], msg: 'Questions should have at least 1 item' }] }, 422);

      expect(result.errorMessage).toBe('System One endpoint returned HTTP 422: Questions should have at least 1 item');
      expect(result.errorInfo?.httpStatusCode).toBe(422);
    });

    it("names llama.cpp's error.message", async () => {
      const result = await run({ error: { code: 501, message: 'the model is not a decision model', type: 'not_supported_error' } }, 501);

      expect(result.errorMessage).toBe('System One endpoint returned HTTP 501: the model is not a decision model');
    });

    it('makes a 503 failover-eligible', async () => {
      const result = await run({ detail: 'the server is stopping' }, 503);

      expect(result.errorInfo).toMatchObject({ errorType: 'ServiceUnavailable', httpStatusCode: 503, canFailover: true });
    });

    it('makes a 429 failover-eligible', async () => {
      const result = await run('', 429);

      expect(result.errorMessage).toBe('System One endpoint returned HTTP 429');
      expect(result.errorInfo).toMatchObject({ errorType: 'RateLimit', httpStatusCode: 429, canFailover: true });
    });
  });
});
