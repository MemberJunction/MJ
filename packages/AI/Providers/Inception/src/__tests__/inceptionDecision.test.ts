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

import { InceptionDecision } from '../models/inceptionDecision';

const API_KEY = 'inception-test-key-no-network';

/** The state of Inception's "Create a decision" example (https://docs.inceptionlabs.ai, OpenAPI). */
const DOCS_STATE = { message: 'Please refund the duplicate charge on my account.' };

/**
 * The example's three questions, as MJ asks them. The example's `team` question has no instructions,
 * which Inception allows and MJ does not, so it gets some here.
 */
const DOCS_QUESTIONS: DecisionParams['Questions'] = {
  billing: { Kind: 'Likelihood', Instructions: 'Is this request about billing?' } as LikelihoodQuestion,
  team: {
    Kind: 'Choice',
    Instructions: 'Which team should handle this request?',
    Options: [
      { Value: 'billing', Description: 'Payments, charges, and refunds' },
      { Value: 'support', Description: 'Technical support and other requests' },
    ],
  } as ChoiceQuestion,
  urgency: {
    Kind: 'Score',
    Instructions: 'How urgent is this request?',
    Levels: ['Can wait', 'Needs attention soon', 'Needs immediate attention'],
  } as ScoreQuestion,
};

/** The request MJ sends for those questions: the System One body, as in the example. */
const EXPECTED_REQUEST = {
  model: 'mercury-decide',
  state: DOCS_STATE,
  questions: {
    billing: { type: 'noul', instructions: 'Is this request about billing?' },
    team: {
      type: 'choice',
      instructions: 'Which team should handle this request?',
      criteria: { billing: 'Payments, charges, and refunds', support: 'Technical support and other requests' },
    },
    urgency: { type: 'score', instructions: 'How urgent is this request?', criteria: ['Can wait', 'Needs attention soon', 'Needs immediate attention'] },
  },
};

/** The example's 200 response, verbatim from the OpenAPI document (as JSON). */
const DOCS_RESPONSE = {
  model: 'mercury-decide',
  answers: {
    billing: { type: 'noul', noul: 0.97 },
    team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.96, support: 0.04 }, confidence: 0.96 },
    urgency: {
      type: 'score',
      score: 1.1,
      legend: { '0': 'Can wait', '1': 'Needs attention soon', '2': 'Needs immediate attention' },
      probabilities: { '0': 0.1, '1': 0.7, '2': 0.2 },
      confidence: 0.7,
    },
  },
  usage: { input_tokens: 120, output_tokens: 3 },
};

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

function docsParams(overrides: Partial<DecisionParams> = {}): DecisionParams {
  return { Model: 'mercury-decide', State: DOCS_STATE, Questions: DOCS_QUESTIONS, ...overrides };
}

describe('InceptionDecision', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('POSTs all three question kinds to https://api.inceptionlabs.ai/v1/decisions with a bearer key', async () => {
      const calls = fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      const controller = new AbortController();
      const result = await new InceptionDecision(API_KEY).Decide(docsParams({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe('https://api.inceptionlabs.ai/v1/decisions');
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual(EXPECTED_REQUEST);
    });

    it('asks mercury-decide when DecisionParams.Model is empty, and passes another APIName through', async () => {
      const calls = fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      const driver = new InceptionDecision(API_KEY);
      await driver.Decide(docsParams({ Model: '' }));
      await driver.Decide(docsParams({ Model: 'mercury-decide-2' }));

      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('mercury-decide');
      expect(JSON.parse(String(calls[1].Init?.body)).model).toBe('mercury-decide-2');
    });
  });

  describe('the response', () => {
    it("maps the example's response", async () => {
      fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      const result = await new InceptionDecision(API_KEY).Decide(docsParams());

      expect(result.success).toBe(true);
      expect(result.ResolvedModel).toBe('mercury-decide');
      expect(result.Usage?.promptTokens).toBe(120);
      expect(result.Usage?.completionTokens).toBe(3);
      expect(result.Usage?.cost).toBeUndefined();

      expect(result.Answers['billing'] as LikelihoodAnswer).toEqual({ Kind: 'Likelihood', Probability: 0.97 });
      const team = result.Answers['team'] as ChoiceAnswer;
      expect(team.Value).toBe('billing');
      expect(team.Confidence).toBe(0.96);
      expect(team.Probabilities['billing']).toBeCloseTo(0.96, 12);
      expect(team.Probabilities['support']).toBeCloseTo(0.04, 12);

      const urgency = result.Answers['urgency'] as ScoreAnswer;
      expect(urgency.Value).toBe(1.1);
      expect(urgency.Confidence).toBe(0.7);
      expect(Object.keys(urgency.Probabilities)).toEqual(['Can wait', 'Needs attention soon', 'Needs immediate attention']);
      expect(urgency.Probabilities['Can wait']).toBeCloseTo(0.1, 12);
      expect(urgency.Probabilities['Needs attention soon']).toBeCloseTo(0.7, 12);
      expect(urgency.Probabilities['Needs immediate attention']).toBeCloseTo(0.2, 12);
    });
  });

  describe('the key and the endpoint', () => {
    it("sends a JSON credential's apiKey, not its JSON", async () => {
      const calls = fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      const result = await new InceptionDecision(JSON.stringify({ apiKey: 'inception-from-credential' })).Decide(docsParams());

      expect(result.success).toBe(true);
      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer inception-from-credential', 'Content-Type': 'application/json' });
    });

    it('sends a plain key as it is', async () => {
      const calls = fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      await new InceptionDecision('inception-plain').Decide(docsParams());

      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer inception-plain', 'Content-Type': 'application/json' });
    });

    it("prefers the constructor's endpoint over the credential's, and the credential's over the default", async () => {
      const credential = JSON.stringify({ apiKey: 'inception-k', endpoint: 'https://credential.example.test/v1/decisions/' });
      expect(new InceptionDecision(credential, 'https://ctor.example.test/v1/decisions').EndpointURL).toBe('https://ctor.example.test/v1/decisions');
      expect(new InceptionDecision(credential).EndpointURL).toBe('https://credential.example.test/v1/decisions');
      expect(new InceptionDecision('inception-k').EndpointURL).toBe(InceptionDecision.DEFAULT_ENDPOINT);
      expect(new InceptionDecision('inception-k', '  ').EndpointURL).toBe(InceptionDecision.DEFAULT_ENDPOINT);

      const calls = fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      await new InceptionDecision(credential).Decide(docsParams());
      expect(calls[0].Url).toBe('https://credential.example.test/v1/decisions');
    });
  });

  describe('a missing key', () => {
    it.each([
      ['an empty key', ''],
      ['a blank key', '   '],
      ['a JSON credential with no apiKey', JSON.stringify({ endpoint: 'https://api.inceptionlabs.ai/v1/decisions' })],
    ])('fails %s before any request, with a NoCredentials error that allows failover', async (_label, apiKey) => {
      const calls = fakeFetch(() => jsonResponse(DOCS_RESPONSE));
      const result = await new InceptionDecision(apiKey).Decide(docsParams());

      expect(calls).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'API Key' credential");
      expect(result.errorMessage).toContain('AI_VENDOR_API_KEY__INCEPTIONDECISION');
      expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
    });
  });

  // Every body below is the OpenAPI document's example for its status.
  describe('HTTP errors', () => {
    const run = async (body: unknown, status: number) => {
      fakeFetch(() => jsonResponse(body, status));
      return new InceptionDecision(API_KEY).Decide(docsParams());
    };

    it("names a 401's error.message and keeps it a fatal authentication error, as for every other driver", async () => {
      const result = await run({ error: { message: 'Incorrect API key provided', type: 'authentication_error', param: null, code: 'invalid_api_key' } }, 401);

      expect(result.errorMessage).toBe('Inception Decisions API returned HTTP 401: Incorrect API key provided');
      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal', httpStatusCode: 401 });
    });

    it('makes a 402 (billing inactive or quota exceeded) a NoCredit error that allows failover', async () => {
      const result = await run({ error: { code: 'account_error', type: 'invalid_request_error', message: 'Account access is unavailable.' } }, 402);

      expect(result.errorMessage).toBe('Inception Decisions API returned HTTP 402: Account access is unavailable.');
      expect(result.errorInfo).toMatchObject({ errorType: 'NoCredit', severity: 'Retriable', canFailover: true, httpStatusCode: 402 });
    });

    it("names a 422's FastAPI detail[].msg, and lets it fail over as a vendor validation error", async () => {
      const result = await run({ detail: [{ loc: ['body', 'questions'], msg: 'Field required', type: 'missing' }] }, 422);

      expect(result.errorMessage).toBe('Inception Decisions API returned HTTP 422: Field required');
      expect(result.errorInfo).toMatchObject({ errorType: 'VendorValidationError', severity: 'Retriable', canFailover: true, httpStatusCode: 422 });
    });

    // ErrorAnalyzer alone reads this one as a fatal InvalidRequest, which stops Default Decision's
    // failover loop, though another candidate could answer.
    it("lets a 422 upstream error fail over too", async () => {
      const result = await run({ error: { code: 'upstream_error', type: 'invalid_request_error', message: 'Decision service could not complete the request.' } }, 422);

      expect(result.errorMessage).toBe('Inception Decisions API returned HTTP 422: Decision service could not complete the request.');
      expect(result.errorInfo).toMatchObject({ errorType: 'VendorValidationError', severity: 'Retriable', canFailover: true });
    });

    it.each([
      [404, { error: { code: 'model_not_found', type: 'invalid_request_error', message: 'Decision model not found.' } }, 'ModelError'],
      [413, { error: { code: 'request_too_large', type: 'invalid_request_error', message: 'Request body is too large.' } }, 'Unknown'],
      [429, { error: { code: 'rate_limit_exceeded', type: 'rate_limit_error', message: 'Request or spending limit exceeded.' } }, 'RateLimit'],
      [500, { error: { message: 'Internal server error', type: 'server_error', param: null, code: 'server_error' } }, 'InternalServerError'],
      [502, { error: { code: 'upstream_error', type: 'server_error', message: 'Decision service returned an invalid response.' } }, 'InternalServerError'],
      [503, { error: { code: 'upstream_error', type: 'server_error', message: 'Decision service could not complete the request.' } }, 'ServiceUnavailable'],
      [504, { error: { code: 'upstream_timeout', type: 'server_error', message: 'Decision service timed out.' } }, 'InternalServerError'],
    ])('leaves a %i to ErrorAnalyzer, which reads it as %s and allows failover', async (status, body, errorType) => {
      const result = await run(body, status);

      expect(result.errorMessage).toBe(`Inception Decisions API returned HTTP ${status}: ${body.error.message}`);
      expect(result.errorInfo).toMatchObject({ errorType, httpStatusCode: status, canFailover: true });
      expect(result.errorInfo?.severity).not.toBe('Fatal');
    });
  });
});
