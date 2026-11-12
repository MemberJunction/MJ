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

import { GeminiDecision } from '../geminiDecision';

const API_KEY = 'AIza-test-key-no-network';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';

const STATE = {
  location: 'Breakroom counter',
  note: 'Breakroom counter check before the 9 AM client meeting. A brown puddle sits next to the sugar jar.',
};

/** The three question kinds from Google's announcement of the Decisions API. */
const QUESTIONS: DecisionParams['Questions'] = {
  has_spill: { Kind: 'Likelihood', Instructions: 'Is there an uncleaned liquid spill on the counter?' } as LikelihoodQuestion,
  next_action: {
    Kind: 'Choice',
    Instructions: 'Which cleanup action fits the scene?',
    Options: [
      { Value: 'wipe_with_cloth', Description: 'Small counter spill with a cloth nearby.' },
      { Value: 'dispatch_janitorial', Description: 'Large floor hazard, broken glass, or similar.' },
      { Value: 'ready_for_meeting', Description: 'Counter is clean and ready.' },
    ],
  } as ChoiceQuestion,
  severity: {
    Kind: 'Score',
    Instructions: 'Rate the severity of the counter mess.',
    Levels: ['Clean and ready.', 'Minor localized spill.', 'Major spill or safety hazard.'],
  } as ScoreQuestion,
};

/** The request the Gemini Decisions API documents: System One questions keyed by name, the state as `input`. */
const EXPECTED_REQUEST = {
  model: 'gemini-decision-1',
  input: JSON.stringify(STATE),
  questions: {
    has_spill: { type: 'noul', instructions: 'Is there an uncleaned liquid spill on the counter?' },
    next_action: {
      type: 'choice',
      instructions: 'Which cleanup action fits the scene?',
      criteria: {
        wipe_with_cloth: 'Small counter spill with a cloth nearby.',
        dispatch_janitorial: 'Large floor hazard, broken glass, or similar.',
        ready_for_meeting: 'Counter is clean and ready.',
      },
    },
    severity: {
      type: 'score',
      instructions: 'Rate the severity of the counter mess.',
      criteria: ['Clean and ready.', 'Minor localized spill.', 'Major spill or safety hazard.'],
    },
  },
};

/** A response in the documented `CreateDecisionResponse` shape. */
const RESPONSE = {
  answers: {
    has_spill: { type: 'noul', noul: 0.95, confidence: 0.95 },
    next_action: {
      type: 'choice',
      choice: 'wipe_with_cloth',
      probabilities: { wipe_with_cloth: 0.98, dispatch_janitorial: 0.015, ready_for_meeting: 0.005 },
      confidence: 0.98,
    },
    severity: {
      type: 'score',
      score: 1.19,
      probabilities: { '0': 0.03, '1': 0.75, '2': 0.22 },
      legend: { '0': 'Clean and ready.', '1': 'Minor localized spill.', '2': 'Major spill or safety hazard.' },
      confidence: 0.75,
    },
  },
  usage: { total_input_tokens: 418, total_output_tokens: 0, total_tokens: 418 },
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

function params(overrides: Partial<DecisionParams> = {}): DecisionParams {
  return { Model: 'gemini-decision-1', State: STATE, Questions: QUESTIONS, ...overrides };
}

describe('GeminiDecision', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('POSTs the three question kinds to the v1beta decisions endpoint with an x-goog-api-key header', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      const controller = new AbortController();
      const result = await new GeminiDecision(API_KEY).Decide(params({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe(ENDPOINT);
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual(EXPECTED_REQUEST);
    });

    it('sends a string state as the input unchanged, and never a state field', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      await new GeminiDecision(API_KEY).Decide(params({ State: 'A brown puddle next to the sugar jar.' }));

      const body = JSON.parse(String(calls[0].Init?.body));
      expect(body.input).toBe('A brown puddle next to the sugar jar.');
      expect(body).not.toHaveProperty('state');
    });

    it('asks gemini-decision-1 when DecisionParams.Model is empty', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      await new GeminiDecision(API_KEY).Decide(params({ Model: '' }));

      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('gemini-decision-1');
    });

    it('uses an endpoint passed to the constructor, then one from the credential', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      await new GeminiDecision(API_KEY, 'https://gateway.example/v1beta/decisions/').Decide(params());
      await new GeminiDecision(JSON.stringify({ apiKey: API_KEY, endpoint: 'https://proxy.example/v1beta/decisions' })).Decide(params());

      expect(calls[0].Url).toBe('https://gateway.example/v1beta/decisions');
      expect(calls[1].Url).toBe('https://proxy.example/v1beta/decisions');
      expect(calls[1].Init?.headers).toEqual({ 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' });
    });

    it('fails before any request, allowing failover, when there is no API key', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      const result = await new GeminiDecision('').Decide(params());

      expect(calls).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.errorInfo?.errorType).toBe('NoCredentials');
      expect(result.errorInfo?.canFailover).toBe(true);
      expect(result.errorMessage).toContain('AI_VENDOR_API_KEY__GEMINIDECISION');
    });
  });

  describe('the response', () => {
    it('maps every answer kind and records usage', async () => {
      fakeFetch(() => jsonResponse(RESPONSE));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(true);
      expect(result.Usage?.promptTokens).toBe(418);
      expect(result.Usage?.completionTokens).toBe(0);

      const spill = result.Answers['has_spill'] as LikelihoodAnswer;
      expect(spill).toEqual({ Kind: 'Likelihood', Probability: 0.95 });

      const action = result.Answers['next_action'] as ChoiceAnswer;
      expect(action.Kind).toBe('Choice');
      expect(action.Value).toBe('wipe_with_cloth');
      expect(action.Confidence).toBe(0.98);
      expect(action.Probabilities['wipe_with_cloth']).toBeCloseTo(0.98, 6);
      expect(Object.values(action.Probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);

      const severity = result.Answers['severity'] as ScoreAnswer;
      expect(severity.Kind).toBe('Score');
      expect(severity.Value).toBe(1.19);
      expect(severity.Confidence).toBe(0.75);
      expect(Object.keys(severity.Probabilities)).toEqual(['Clean and ready.', 'Minor localized spill.', 'Major spill or safety hazard.']);
      expect(severity.Probabilities['Minor localized spill.']).toBeCloseTo(0.75, 6);
    });

    it('records the resolved model when the response names one', async () => {
      fakeFetch(() => jsonResponse({ ...RESPONSE, model: 'gemini-decision-1-2026-11' }));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.ResolvedModel).toBe('gemini-decision-1-2026-11');
    });

    it('fails, allowing failover, with the reason when the input filter blocks the request', async () => {
      fakeFetch(() => jsonResponse({ prompt_feedback: { block_reason: 'safety', block_reason_message: 'Unsafe image' } }));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.Answers).toEqual({});
      expect(result.errorMessage).toBe('Gemini Decisions API blocked the input: safety (Unsafe image)');
      expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('fails when an answer is missing', async () => {
      const { has_spill: _dropped, ...rest } = RESPONSE.answers;
      fakeFetch(() => jsonResponse({ ...RESPONSE, answers: rest }));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'has_spill'");
    });

    it('fails when the response has no answers object', async () => {
      fakeFetch(() => jsonResponse({ usage: RESPONSE.usage }));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('no answers object');
    });

    it("reads Google's error envelope and classifies an HTTP 429 as failover-eligible", async () => {
      fakeFetch(() => jsonResponse({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }, 429));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Gemini Decisions API returned HTTP 429: Resource has been exhausted (e.g. check quota).');
      expect(result.errorInfo?.canFailover).toBe(true);
    });

    it.each([
      [400, 'INVALID_ARGUMENT', `API key not valid. Please pass a valid API key. (${API_KEY})`],
      [400, 'INVALID_ARGUMENT', 'questions: at most 1000 questions are allowed.'],
      [403, 'PERMISSION_DENIED', 'Generative Language API has not been used in project 123 before or it is disabled.'],
    ])('classifies a %i %s as a failover-eligible ModelError, naming the cause and never the key', async (status, googleStatus, message) => {
      fakeFetch(() => jsonResponse({ error: { code: status, message, status: googleStatus } }, status));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorInfo?.errorType).toBe('ModelError');
      expect(result.errorInfo?.severity).toBe('Retriable');
      expect(result.errorInfo?.canFailover).toBe(true);
      expect(result.errorMessage).toContain(`Gemini Decisions API returned HTTP ${status}`);
      expect(result.errorMessage).not.toContain(API_KEY);
    });

    it('keeps a 401 a fatal Authentication error, as for every decision driver', async () => {
      fakeFetch(() => jsonResponse({ error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } }, 401));
      const result = await new GeminiDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorInfo?.errorType).toBe('Authentication');
    });
  });
});
