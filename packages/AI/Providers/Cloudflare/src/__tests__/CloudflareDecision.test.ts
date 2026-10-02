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

import { CloudflareDecision } from '../models/cloudflareDecision';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const API_TOKEN = 'cf-test-token';
const COMPOUND_KEY = `${ACCOUNT_ID}:${API_TOKEN}`;
const CLEF_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/cloudflare/clef`;
const ENV_VARS = [CloudflareDecision.ACCOUNT_ID_ENV_VAR, CloudflareDecision.BASE_URL_ENV_VAR];

/** The System One response the model pages document, for the three sample questions. */
const BARE_RESPONSE = {
  model: 'clef',
  answers: {
    urgent: { type: 'noul', noul: 0.91 },
    team: {
      type: 'choice',
      choice: 'technical',
      probabilities: { billing: 0.02, technical: 0.95, sales: 0.01 },
      confidence: 0.9,
    },
    severity: {
      type: 'score',
      score: 2.7,
      legend: { '0': 'No impact', '1': 'Minor', '2': 'Major', '3': 'Critical' },
      probabilities: { '0': 0, '1': 0.05, '2': 0.2, '3': 0.75 },
      confidence: 0.8,
    },
  },
  usage: { input_tokens: 312, output_tokens: 0 },
};

/** The same response in Cloudflare's v4 REST envelope. */
const WRAPPED_RESPONSE = { result: BARE_RESPONSE, success: true, errors: [], messages: [] };

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

/** Replaces fetch with one that records each request and answers with `respond`. */
function fakeFetch(respond: () => Response): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ Url: String(url), Init: init });
    return respond();
  });
  return calls;
}

function params(overrides: Partial<DecisionParams> = {}): DecisionParams {
  return { Model: '@cf/cloudflare/clef', State: STATE, Questions: QUESTIONS, ...overrides };
}

describe('CloudflareDecision', () => {
  let originalFetch: typeof globalThis.fetch;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    savedEnv = Object.fromEntries(ENV_VARS.map(name => [name, process.env[name]]));
    for (const name of ENV_VARS) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const name of ENV_VARS) {
      if (savedEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    }
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('POSTs all three question kinds to the account-scoped Workers AI URL, with the token alone as the bearer', async () => {
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const controller = new AbortController();
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe(CLEF_URL);
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual({
        model: 'clef',
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

    it('takes the path from the APIName and the body model from its last segment, for Clef-flash', async () => {
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      await new CloudflareDecision(COMPOUND_KEY).Decide(params({ Model: '@cf/cloudflare/clef-flash', State: { order: 42 } }));

      expect(calls[0].Url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-flash`);
      const body = JSON.parse(String(calls[0].Init?.body));
      expect(body.model).toBe('clef-flash');
      expect(body.state).toEqual({ order: 42 });
      expect(body).not.toHaveProperty('images');
    });

    it('asks Clef when DecisionParams.Model is empty', async () => {
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      await new CloudflareDecision(COMPOUND_KEY).Decide(params({ Model: '' }));

      expect(calls[0].Url).toBe(CLEF_URL);
      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('clef');
    });
  });

  describe('the account ID', () => {
    it('reads it from CLOUDFLARE_ACCOUNT_ID when the key is the token alone', async () => {
      process.env[CloudflareDecision.ACCOUNT_ID_ENV_VAR] = 'env-account';
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const driver = new CloudflareDecision(API_TOKEN);
      const result = await driver.Decide(params());

      expect(result.success).toBe(true);
      expect(driver.AccountID).toBe('env-account');
      expect(calls[0].Url).toBe('https://api.cloudflare.com/client/v4/accounts/env-account/ai/run/@cf/cloudflare/clef');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' });
    });

    it('prefers the account the key names over CLOUDFLARE_ACCOUNT_ID', async () => {
      process.env[CloudflareDecision.ACCOUNT_ID_ENV_VAR] = 'env-account';
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const driver = new CloudflareDecision(COMPOUND_KEY);
      await driver.Decide(params());

      expect(driver.AccountID).toBe(ACCOUNT_ID);
      expect(calls[0].Url).toBe(CLEF_URL);
    });

    it('falls back to CLOUDFLARE_ACCOUNT_ID when the key has a colon but no account before it', async () => {
      process.env[CloudflareDecision.ACCOUNT_ID_ENV_VAR] = 'env-account';
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      await new CloudflareDecision(`:${API_TOKEN}`).Decide(params());

      expect(calls[0].Url).toContain('/accounts/env-account/');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' });
    });

    it('fails fatally, without a request, when neither the key nor the environment gives one', async () => {
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const result = await new CloudflareDecision(API_TOKEN).Decide(params());

      expect(calls).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'<accountId>:<apiToken>'");
      expect(result.errorMessage).toContain('CLOUDFLARE_ACCOUNT_ID');
      expect(result.errorInfo).toEqual({ errorType: 'Authentication', severity: 'Fatal', canFailover: false });
      expect(result.Answers).toEqual({});
    });

    it('fails fatally when the key names an account but no token', async () => {
      const calls = fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const result = await new CloudflareDecision(`${ACCOUNT_ID}:`).Decide(params());

      expect(calls).toHaveLength(0);
      expect(result.errorMessage).toMatch(/has no API token/);
      expect(result.errorInfo).toEqual({ errorType: 'Authentication', severity: 'Fatal', canFailover: false });
    });
  });

  describe('the base URL', () => {
    it('uses CLOUDFLARE_WORKERS_AI_BASE_URL, filling in the account ID', async () => {
      process.env[CloudflareDecision.BASE_URL_ENV_VAR] = 'https://gateway.ai.cloudflare.com/v1/{account_id}/my-gateway/workers-ai/';
      const calls = fakeFetch(() => jsonResponse(BARE_RESPONSE));
      await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(calls[0].Url).toBe(`https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/my-gateway/workers-ai/@cf/cloudflare/clef`);
    });

    it('prefers the constructor URL, which needs no account ID when it has no placeholder', async () => {
      process.env[CloudflareDecision.BASE_URL_ENV_VAR] = 'https://ignored.example.test';
      const calls = fakeFetch(() => jsonResponse(BARE_RESPONSE));
      const driver = new CloudflareDecision(API_TOKEN, 'https://gateway.example.test/v1/acct/gw/workers-ai');
      const result = await driver.Decide(params());

      expect(result.success).toBe(true);
      expect(driver.BaseURL).toBe('https://gateway.example.test/v1/acct/gw/workers-ai');
      expect(calls[0].Url).toBe('https://gateway.example.test/v1/acct/gw/workers-ai/@cf/cloudflare/clef');
    });
  });

  describe('the response', () => {
    for (const [shape, body] of [['wrapped', WRAPPED_RESPONSE], ['bare', BARE_RESPONSE]] as const) {
      it(`maps a ${shape} response`, async () => {
        fakeFetch(() => jsonResponse(body));
        const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

        expect(result.success).toBe(true);
        expect(result.ResolvedModel).toBe('clef');
        expect(result.Usage?.promptTokens).toBe(312);
        expect(result.Usage?.completionTokens).toBe(0);
        expect(result.Usage?.cost).toBeUndefined();
        expect(result.Answers['urgent'] as LikelihoodAnswer).toEqual({ Kind: 'Likelihood', Probability: 0.91 });
        expect((result.Answers['team'] as ChoiceAnswer).Value).toBe('technical');
        expect((result.Answers['severity'] as ScoreAnswer).Value).toBe(2.7);
      });
    }

    it('re-keys Score probabilities from level index to level name', async () => {
      fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      const severity = result.Answers['severity'] as ScoreAnswer;
      expect(severity.Probabilities).toEqual({ 'No impact': 0, Minor: 0.05, Major: 0.2, Critical: 0.75 });
      expect(severity.Confidence).toBe(0.8);
    });

    it('renormalises Choice probabilities that the API rounded', async () => {
      fakeFetch(() => jsonResponse(WRAPPED_RESPONSE));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      // 0.02 + 0.95 + 0.01 = 0.98 on the wire.
      const team = result.Answers['team'] as ChoiceAnswer;
      const sum = Object.values(team.Probabilities).reduce((total, p) => total + p, 0);
      expect(sum).toBeCloseTo(1, 10);
      expect(team.Probabilities['technical']).toBeCloseTo(0.95 / 0.98, 10);
      expect(team.Confidence).toBe(0.9);
    });

    it('fails, surfacing errors[].message, when the envelope reports success: false', async () => {
      fakeFetch(() => jsonResponse({ result: null, success: false, errors: [{ code: 5006, message: 'Error: oneOf at /questions/team not met' }], messages: [] }));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Cloudflare Workers AI reported a failure (HTTP 200): Error: oneOf at /questions/team not met');
      expect(result.Answers).toEqual({});
    });

    it('fails over when a wrapped success has no answers', async () => {
      fakeFetch(() => jsonResponse({ result: { model: 'clef' }, success: true, errors: [], messages: [] }));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('The Cloudflare Workers AI response has no answers object');
      expect(result.errorInfo).toMatchObject({ errorType: 'ModelError', canFailover: true });
    });
  });

  describe('HTTP errors', () => {
    const envelopeError = (code: number, message: string) => ({ result: null, success: false, errors: [{ code, message }], messages: [] });

    it('makes a 429 failover-eligible and names the envelope message', async () => {
      fakeFetch(() => jsonResponse(envelopeError(3040, 'Capacity temporarily exceeded, please try again.'), 429));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Cloudflare Workers AI returned HTTP 429: Capacity temporarily exceeded, please try again.');
      expect(result.errorInfo).toMatchObject({ errorType: 'RateLimit', httpStatusCode: 429, canFailover: true });
    });

    it('makes a 500 failover-eligible', async () => {
      fakeFetch(() => jsonResponse(envelopeError(3043, 'Internal server error'), 500));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.errorMessage).toBe('Cloudflare Workers AI returned HTTP 500: Internal server error');
      expect(result.errorInfo).toMatchObject({ errorType: 'InternalServerError', httpStatusCode: 500, canFailover: true });
    });

    it('classifies a 401 as a fatal authentication error', async () => {
      fakeFetch(() => jsonResponse(envelopeError(10000, 'Authentication error'), 401));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.errorMessage).toBe('Cloudflare Workers AI returned HTTP 401: Authentication error');
      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal', httpStatusCode: 401 });
    });

    it('quotes the body when an error response is not an envelope', async () => {
      fakeFetch(() => new Response('upstream connect error', { status: 502 }));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.errorMessage).toBe('Cloudflare Workers AI returned HTTP 502: upstream connect error');
      expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('fails when fetch throws a network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection reset by peer'));
      const result = await new CloudflareDecision(COMPOUND_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/Connection reset by peer/);
    });
  });
});
