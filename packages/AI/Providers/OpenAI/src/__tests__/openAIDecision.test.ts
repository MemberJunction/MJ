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

import { OpenAIDecision } from '../models/openAIDecision';

const API_KEY = 'sk-test-key-no-network';

const STATE = {
  title: 'Battery died after two weeks',
  review: 'The headphones sound great, but the battery stopped charging after two weeks.',
};

const QUESTIONS: DecisionParams['Questions'] = {
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

/** The request OpenAI's Decisions API documents for these three question kinds. */
const EXPECTED_REQUEST = {
  model: 'gpt-6-luna',
  input: JSON.stringify(STATE),
  questions: [
    { type: 'predicate', name: 'defect', instructions: 'Does the review report a product defect?' },
    {
      type: 'choice',
      name: 'sentiment',
      instructions: 'What is the overall sentiment of the review?',
      choices: [
        { value: 'positive', description: 'Mostly satisfied' },
        { value: 'mixed', description: 'Praise and complaints in one review' },
        { value: 'negative', description: 'Mostly dissatisfied' },
      ],
    },
    {
      type: 'score',
      name: 'severity',
      instructions: 'How severe is the reported problem?',
      levels: [
        { label: 'Cosmetic', description: 'Cosmetic' },
        { label: 'Inconvenient', description: 'Inconvenient' },
        { label: 'Product unusable', description: 'Product unusable' },
      ],
    },
  ],
};

/** A response in the documented shape: an answers array keyed by `name`, distributions as arrays. */
const RESPONSE = {
  model: 'gpt-6-luna-2026-10-06',
  answers: [
    { type: 'predicate', name: 'defect', probability: 0.94 },
    {
      type: 'choice',
      name: 'sentiment',
      choice: 'mixed',
      probabilities: [
        { value: 'positive', probability: 0.02 },
        { value: 'mixed', probability: 0.95 },
        { value: 'negative', probability: 0.03 },
      ],
      confidence: 0.93,
    },
    {
      type: 'score',
      name: 'severity',
      score: 1.78,
      probabilities: [
        { value: 0, label: 'Cosmetic', probability: 0.01 },
        { value: 1, label: 'Inconvenient', probability: 0.2 },
        { value: 2, label: 'Product unusable', probability: 0.79 },
      ],
      confidence: 0.78,
    },
  ],
  usage: { input_tokens: 312, output_tokens: 0 },
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
  return { Model: 'gpt-6-luna', State: STATE, Questions: QUESTIONS, ...overrides };
}

describe('OpenAIDecision', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('the request', () => {
    it('POSTs the three question kinds to https://api.openai.com/v1/decisions with a bearer key', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      const controller = new AbortController();
      const result = await new OpenAIDecision(API_KEY).Decide(params({ CancellationToken: controller.signal }));

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].Url).toBe('https://api.openai.com/v1/decisions');
      expect(calls[0].Init?.method).toBe('POST');
      expect(calls[0].Init?.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' });
      expect(calls[0].Init?.signal).toBe(controller.signal);
      expect(JSON.parse(String(calls[0].Init?.body))).toEqual(EXPECTED_REQUEST);
    });

    it('sends a string state as the input unchanged', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      await new OpenAIDecision(API_KEY).Decide(params({ State: 'The battery stopped charging.' }));

      expect(JSON.parse(String(calls[0].Init?.body)).input).toBe('The battery stopped charging.');
    });

    it('asks gpt-6-luna when DecisionParams.Model is empty', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      await new OpenAIDecision(API_KEY).Decide(params({ Model: '' }));

      expect(JSON.parse(String(calls[0].Init?.body)).model).toBe('gpt-6-luna');
    });

    it('uses an endpoint passed to the constructor, then one from the credential', async () => {
      const calls = fakeFetch(() => jsonResponse(RESPONSE));
      await new OpenAIDecision(API_KEY, 'https://eu.api.openai.com/v1/decisions').Decide(params());
      await new OpenAIDecision(JSON.stringify({ apiKey: API_KEY, endpoint: 'https://proxy.example/v1/decisions' })).Decide(params());

      expect(calls[0].Url).toBe('https://eu.api.openai.com/v1/decisions');
      expect(calls[1].Url).toBe('https://proxy.example/v1/decisions');
      expect(calls[1].Init?.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' });
    });
  });

  describe('the response', () => {
    it('maps every answer kind and records the dated model and usage', async () => {
      fakeFetch(() => jsonResponse(RESPONSE));
      const result = await new OpenAIDecision(API_KEY).Decide(params());

      expect(result.success).toBe(true);
      expect(result.ResolvedModel).toBe('gpt-6-luna-2026-10-06');
      expect(result.Usage?.promptTokens).toBe(312);

      const defect = result.Answers['defect'] as LikelihoodAnswer;
      expect(defect).toEqual({ Kind: 'Likelihood', Probability: 0.94 });

      const sentiment = result.Answers['sentiment'] as ChoiceAnswer;
      expect(sentiment.Kind).toBe('Choice');
      expect(sentiment.Value).toBe('mixed');
      expect(sentiment.Confidence).toBe(0.93);
      expect(sentiment.Probabilities['mixed']).toBeCloseTo(0.95, 6);
      expect(Object.values(sentiment.Probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);

      const severity = result.Answers['severity'] as ScoreAnswer;
      expect(severity.Kind).toBe('Score');
      expect(severity.Value).toBe(1.78);
      expect(Object.keys(severity.Probabilities)).toEqual(['Cosmetic', 'Inconvenient', 'Product unusable']);
      expect(severity.Probabilities['Product unusable']).toBeCloseTo(0.79, 6);
    });

    it('fails, allowing failover, when a question is refused', async () => {
      const refused = { ...RESPONSE, answers: [RESPONSE.answers[1], RESPONSE.answers[2], { type: 'refusal', name: 'defect' }] };
      fakeFetch(() => jsonResponse(refused));
      const result = await new OpenAIDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'refusal'");
      expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('fails when an answer is missing', async () => {
      fakeFetch(() => jsonResponse({ ...RESPONSE, answers: RESPONSE.answers.slice(1) }));
      const result = await new OpenAIDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("'defect'");
    });

    it('fails when the response has no answers array', async () => {
      fakeFetch(() => jsonResponse({ model: 'gpt-6-luna' }));
      const result = await new OpenAIDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('no answers object');
    });

    it('classifies an HTTP 429 as failover-eligible', async () => {
      fakeFetch(() => jsonResponse({ error: { message: 'Rate limit reached' } }, 429));
      const result = await new OpenAIDecision(API_KEY).Decide(params());

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('OpenAI Decisions API returned HTTP 429');
      expect(result.errorInfo?.canFailover).toBe(true);
    });
  });
});
