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

import { SubQDecision } from '../models/subqDecision';

const API_KEY = 'subq-test-key-no-network';

/** The state of SubQ's Decisions API example (https://docs.subq.ai, Decisions API, "Make a decision"). */
const DOCS_STATE =
  'Patient with asthma reports a sore throat, fever since yesterday, and shortness of breath walking to the kitchen this morning.';

/**
 * The example's three questions, as MJ asks them. MJ's Likelihood has no `criteria`, and MJ requires a
 * description for every Choice option, so the docs' `front_desk: null` gets one here.
 */
const DOCS_QUESTIONS: DecisionParams['Questions'] = {
  escalate: { Kind: 'Likelihood', Instructions: 'Should a nurse see this chat before the patient books anything?' } as LikelihoodQuestion,
  queue: {
    Kind: 'Choice',
    Instructions: 'Which team should own this chat?',
    Options: [
      { Value: 'nurse_line', Description: 'Needs a nurse to assess symptoms today' },
      { Value: 'primary_care', Description: "Book with the patient's own doctor" },
      { Value: 'pharmacy', Description: 'Refill or medication question only' },
      { Value: 'front_desk', Description: 'Scheduling or paperwork only' },
    ],
  } as ChoiceQuestion,
  acuity: {
    Kind: 'Score',
    Instructions: 'How soon should someone respond?',
    Levels: ['Within a week', 'Within a day', 'Within an hour'],
  } as ScoreQuestion,
};

/** The request MJ sends for those questions: the System One body, as in the docs' example. */
const EXPECTED_REQUEST = {
  model: 'subq-snap-preview',
  state: DOCS_STATE,
  questions: {
    escalate: { type: 'noul', instructions: 'Should a nurse see this chat before the patient books anything?' },
    queue: {
      type: 'choice',
      instructions: 'Which team should own this chat?',
      criteria: {
        nurse_line: 'Needs a nurse to assess symptoms today',
        primary_care: "Book with the patient's own doctor",
        pharmacy: 'Refill or medication question only',
        front_desk: 'Scheduling or paperwork only',
      },
    },
    acuity: { type: 'score', instructions: 'How soon should someone respond?', criteria: ['Within a week', 'Within a day', 'Within an hour'] },
  },
};

/** The docs' response to the example, verbatim (Decisions API, "Response"). */
const DOCS_RESPONSE_TEXT = `{
  "model": "subq-snap-preview",
  "answers": {
    "escalate": {
      "type": "noul",
      "noul": 0.92
    },
    "queue": {
      "type": "choice",
      "choice": "nurse_line",
      "probabilities": {
        "nurse_line": 1,
        "primary_care": 0,
        "pharmacy": 0,
        "front_desk": 0
      },
      "confidence": 1
    },
    "acuity": {
      "type": "score",
      "score": 1.86,
      "legend": {
        "0": "Within a week",
        "1": "Within a day",
        "2": "Within an hour"
      },
      "probabilities": {
        "0": 0,
        "1": 0.13,
        "2": 0.87
      },
      "confidence": 0.79
    }
  },
  "usage": {
    "input_tokens": 477,
    "output_tokens": 0
  }
}`;

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

function docsParams(overrides: Partial<DecisionParams> = {}): DecisionParams {
  return { Model: 'subq-snap-preview', State: DOCS_STATE, Questions: DOCS_QUESTIONS, ...overrides };
}

describe('SubQDecision', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('POSTs all three question kinds to https://api.subq.ai/v1/systemone with a bearer key', async () => {
      const calls = fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      const controller = new AbortController();
      const result = await new SubQDecision(API_KEY).Decide(docsParams({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe('https://api.subq.ai/v1/systemone');
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual(EXPECTED_REQUEST);
    });

    it('asks subq-snap-preview when DecisionParams.Model is empty, and passes another APIName through', async () => {
      const calls = fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      const driver = new SubQDecision(API_KEY);
      await driver.Decide(docsParams({ Model: '' }));
      await driver.Decide(docsParams({ Model: 'subq-snap' }));

      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('subq-snap-preview');
      expect(JSON.parse(String(calls[1].Init?.body)).model).toBe('subq-snap');
    });
  });

  describe('the response', () => {
    it("maps the docs' response, verbatim", async () => {
      fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      const result = await new SubQDecision(API_KEY).Decide(docsParams());

      expect(result.success).toBe(true);
      expect(result.ResolvedModel).toBe('subq-snap-preview');
      expect(result.Usage?.promptTokens).toBe(477);
      expect(result.Usage?.completionTokens).toBe(0);
      expect(result.Usage?.cost).toBeUndefined();

      expect(result.Answers['escalate'] as LikelihoodAnswer).toEqual({ Kind: 'Likelihood', Probability: 0.92 });
      expect(result.Answers['queue'] as ChoiceAnswer).toEqual({
        Kind: 'Choice',
        Value: 'nurse_line',
        Confidence: 1,
        Probabilities: { nurse_line: 1, primary_care: 0, pharmacy: 0, front_desk: 0 },
      });

      const acuity = result.Answers['acuity'] as ScoreAnswer;
      expect(acuity.Kind).toBe('Score');
      expect(acuity.Value).toBe(1.86);
      expect(acuity.Confidence).toBe(0.79);
      expect(Object.keys(acuity.Probabilities)).toEqual(['Within a week', 'Within a day', 'Within an hour']);
      expect(acuity.Probabilities['Within a week']).toBe(0);
      expect(acuity.Probabilities['Within a day']).toBeCloseTo(0.13, 12);
      expect(acuity.Probabilities['Within an hour']).toBeCloseTo(0.87, 12);
    });
  });

  describe('the key and the endpoint', () => {
    it("sends a JSON credential's apiKey, not its JSON", async () => {
      const calls = fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      const result = await new SubQDecision(JSON.stringify({ apiKey: 'subq-from-credential' })).Decide(docsParams());

      expect(result.success).toBe(true);
      expect(calls[0].Url).toBe('https://api.subq.ai/v1/systemone');
      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer subq-from-credential', 'Content-Type': 'application/json' });
    });

    it('sends a plain key as it is', async () => {
      const calls = fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      await new SubQDecision('subq-plain').Decide(docsParams());

      expect(calls[0].Init?.headers).toEqual({ Authorization: 'Bearer subq-plain', 'Content-Type': 'application/json' });
    });

    it("prefers the constructor's endpoint over the credential's, and the credential's over the default", async () => {
      const credential = JSON.stringify({ apiKey: 'subq-k', endpoint: 'https://credential.example.test/v1/systemone/' });
      expect(new SubQDecision(credential, 'https://ctor.example.test/v1/systemone').EndpointURL).toBe('https://ctor.example.test/v1/systemone');
      expect(new SubQDecision(credential).EndpointURL).toBe('https://credential.example.test/v1/systemone');
      expect(new SubQDecision('subq-k').EndpointURL).toBe(SubQDecision.DEFAULT_ENDPOINT);
      expect(new SubQDecision('subq-k', '  ').EndpointURL).toBe(SubQDecision.DEFAULT_ENDPOINT);

      const calls = fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      await new SubQDecision(credential, 'https://ctor.example.test/v1/systemone').Decide(docsParams());
      expect(calls[0].Url).toBe('https://ctor.example.test/v1/systemone');
    });
  });

  describe('a missing key', () => {
    it.each([
      ['an empty key', ''],
      ['a blank key', '   '],
      ['a JSON credential with no apiKey', JSON.stringify({ endpoint: 'https://api.subq.ai/v1/systemone' })],
      ['a JSON credential with an empty apiKey', JSON.stringify({ apiKey: '' })],
    ])('fails %s before any request, with a NoCredentials error that allows failover', async (_label, apiKey) => {
      const calls = fakeFetch(() => textResponse(DOCS_RESPONSE_TEXT));
      const result = await new SubQDecision(apiKey).Decide(docsParams());

      expect(calls).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'API Key' credential");
      expect(result.errorMessage).toContain('AI_VENDOR_API_KEY__SUBQDECISION');
      expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
    });
  });

  describe('HTTP errors', () => {
    const run = async (body: unknown, status: number) => {
      fakeFetch(() => (typeof body === 'string' ? new Response(body, { status }) : jsonResponse(body, status)));
      return new SubQDecision(API_KEY).Decide(docsParams());
    };

    it("names the docs' 422 detail object, error_type first, and lets it fail over as a vendor validation error", async () => {
      const result = await run({ detail: { error_type: 'validation_error', message: "questions/queue: must have required property 'criteria'" } }, 422);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("SubQ Decisions API returned HTTP 422: validation_error: questions/queue: must have required property 'criteria'");
      expect(result.errorInfo).toMatchObject({ errorType: 'VendorValidationError', severity: 'Retriable', canFailover: true, httpStatusCode: 422 });
    });

    // ErrorAnalyzer alone would read this 422 as a fatal InvalidRequest (no validation word in the
    // message), which stops Default Decision's failover loop. The error_type here is hypothetical: SubQ
    // documents only validation_error.
    it('lets a 422 whose message names no validation word fail over too', async () => {
      const result = await run({ detail: { error_type: 'unsupported_model', message: 'subq-preview is not a decision model.' } }, 422);

      expect(result.errorMessage).toBe('SubQ Decisions API returned HTTP 422: unsupported_model: subq-preview is not a decision model.');
      expect(result.errorInfo).toMatchObject({ errorType: 'VendorValidationError', severity: 'Retriable', canFailover: true });
    });

    it('makes a 402 (no credits) a NoCredit error that allows failover', async () => {
      const result = await run({ detail: { error_type: 'insufficient_credits', message: 'Insufficient credits.' } }, 402);

      expect(result.errorMessage).toBe('SubQ Decisions API returned HTTP 402: insufficient_credits: Insufficient credits.');
      expect(result.errorInfo).toMatchObject({ errorType: 'NoCredit', severity: 'Retriable', canFailover: true, httpStatusCode: 402 });
    });

    // The message is hypothetical: ErrorAnalyzer alone would read "unauthorized" as a fatal
    // Authentication error and stop the failover loop.
    it('makes a 403 (the key cannot use the model) an Authentication error that still allows failover', async () => {
      const result = await run({ detail: { error_type: 'permission_denied', message: 'Unauthorized: this API key cannot use subq-snap-preview.' } }, 403);

      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Retriable', canFailover: true, httpStatusCode: 403 });
    });

    it('keeps a 401 a fatal authentication error, as for every other driver', async () => {
      const result = await run({ detail: { error_type: 'invalid_api_key', message: 'Missing or invalid credentials.' } }, 401);

      expect(result.errorMessage).toBe('SubQ Decisions API returned HTTP 401: invalid_api_key: Missing or invalid credentials.');
      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal', httpStatusCode: 401 });
    });

    it.each([
      [429, { detail: { error_type: 'rate_limit_exceeded', message: 'Rate limit exceeded.' } }, 'RateLimit'],
      [503, { detail: { error_type: 'service_unavailable', message: 'Service temporarily unavailable.' } }, 'ServiceUnavailable'],
      [503, '', 'ServiceUnavailable'],
    ])('lets a %i fail over as %s', async (status, body, errorType) => {
      const result = await run(body, status);

      expect(result.errorInfo).toMatchObject({ errorType, severity: 'Retriable', httpStatusCode: status, canFailover: true });
    });
  });
});
