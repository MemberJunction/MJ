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

import { OpenRouterDecision } from '../models/openRouterDecision';

describe('OpenRouterDecision', () => {
  const apiKey = 'test-openrouter-key';
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const sampleResponse = {
    model: 'typesafe/jev-1.13-20260917',
    answers: {
      refund: {
        type: 'noul',
        noul: 0.05,
      },
      route: {
        type: 'choice',
        choice: 'technical',
        probabilities: {
          account: 0,
          billing: 0,
          technical: 1,
        },
        confidence: 1,
      },
      urgency: {
        type: 'score',
        score: 1.98,
        legend: {
          '0': 'cosmetic: an annoyance, work continues normally',
          '1': 'degraded: a workaround exists',
          '2': 'blocked: no workaround, work has stopped',
        },
        probabilities: {
          '0': 0,
          '1': 0.02,
          '2': 0.98,
        },
        confidence: 0.97,
      },
    },
    usage: {
      input_tokens: 438,
      output_tokens: 69,
      cost: 0.000018396,
    },
    id: 'gen-dec-1790635995-Ihwtb0ss3LKiMXAxSvrv',
    provider: 'TypeSafe',
  };

  const sampleQuestions: DecisionParams['Questions'] = {
    refund: {
      Kind: 'Likelihood',
      Instructions: 'Does the customer request a refund?',
    } as LikelihoodQuestion,
    route: {
      Kind: 'Choice',
      Instructions: 'Route the support ticket to the appropriate team',
      Options: [
        { Value: 'account', Description: 'Account access and credentials' },
        { Value: 'billing', Description: 'Invoices and payments' },
        { Value: 'technical', Description: 'Software errors and bug reports' },
      ],
    } as ChoiceQuestion,
    urgency: {
      Kind: 'Score',
      Instructions: 'Rate the urgency level of the ticket',
      Levels: [
        'cosmetic: an annoyance, work continues normally',
        'degraded: a workaround exists',
        'blocked: no workaround, work has stopped',
      ],
    } as ScoreQuestion,
  };

  describe('1. The request', () => {
    it('sends correct URL, method, auth header, default model, state, and question mappings', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify(sampleResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const driver = new OpenRouterDecision(apiKey);
      const params: DecisionParams = {
        Model: '',
        State: { user: 'Alice', issue: 'App crashed on startup' },
        Questions: sampleQuestions,
      };

      const result = await driver.Decide(params);
      expect(result.success).toBe(true);

      expect(capturedUrl).toBe(OpenRouterDecision.DEFAULT_ENDPOINT);
      expect(capturedInit?.method).toBe('POST');
      expect(capturedInit?.headers).toEqual({
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(String(capturedInit?.body));
      expect(body.model).toBe(OpenRouterDecision.DEFAULT_MODEL);
      expect(body.state).toEqual({ user: 'Alice', issue: 'App crashed on startup' });

      // Wire shape assertions
      expect(body.questions.refund).toEqual({
        type: 'noul',
        instructions: 'Does the customer request a refund?',
      });
      expect(body.questions.route).toEqual({
        type: 'choice',
        instructions: 'Route the support ticket to the appropriate team',
        criteria: {
          account: 'Account access and credentials',
          billing: 'Invoices and payments',
          technical: 'Software errors and bug reports',
        },
      });
      expect(body.questions.urgency).toEqual({
        type: 'score',
        instructions: 'Rate the urgency level of the ticket',
        criteria: [
          'cosmetic: an annoyance, work continues normally',
          'degraded: a workaround exists',
          'blocked: no workaround, work has stopped',
        ],
      });
    });

    it('uses custom model override and custom endpoint URL when provided', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify(sampleResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const customEndpoint = 'https://custom-openrouter.example.com/decisions';
      const driver = new OpenRouterDecision(apiKey, customEndpoint);
      expect(driver.EndpointURL).toBe(customEndpoint);

      const params: DecisionParams = {
        Model: 'typesafe/jev-override',
        State: 'plain text state',
        Questions: sampleQuestions,
      };

      const result = await driver.Decide(params);
      expect(result.success).toBe(true);
      expect(capturedUrl).toBe(customEndpoint);

      const body = JSON.parse(String(capturedInit?.body));
      expect(body.model).toBe('typesafe/jev-override');
      expect(body.state).toBe('plain text state');
    });
  });

  describe('2. The sample response', () => {
    it('correctly maps and validates answers from sample-response.json through Decide()', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sampleResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const params: DecisionParams = {
        Model: '',
        State: 'Customer reports login issue',
        Questions: sampleQuestions,
      };

      const result = await driver.Decide(params);

      // Must pass full BaseDecision validation
      expect(result.success).toBe(true);
      expect(result.errorMessage).toBeUndefined();

      // ResolvedModel
      expect(result.ResolvedModel).toBe('typesafe/jev-1.13-20260917');

      // Usage
      expect(result.Usage).toBeDefined();
      expect(result.Usage?.promptTokens).toBe(438);
      expect(result.Usage?.completionTokens).toBe(69);
      expect(result.Usage?.cost).toBe(0.000018396);
      expect(result.Usage?.costCurrency).toBe('USD');

      // Refund Likelihood
      const refundAnswer = result.Answers['refund'] as LikelihoodAnswer;
      expect(refundAnswer.Kind).toBe('Likelihood');
      expect(refundAnswer.Probability).toBe(0.05);

      // Route Choice
      const routeAnswer = result.Answers['route'] as ChoiceAnswer;
      expect(routeAnswer.Kind).toBe('Choice');
      expect(routeAnswer.Value).toBe('technical');
      expect(routeAnswer.Confidence).toBe(1);
      expect(routeAnswer.Probabilities).toEqual({
        account: 0,
        billing: 0,
        technical: 1,
      });

      // Urgency Score
      const urgencyAnswer = result.Answers['urgency'] as ScoreAnswer;
      expect(urgencyAnswer.Kind).toBe('Score');
      expect(urgencyAnswer.Value).toBe(1.98);
      expect(urgencyAnswer.Confidence).toBe(0.97);
      expect(urgencyAnswer.Probabilities).toEqual({
        'cosmetic: an annoyance, work continues normally': 0,
        'degraded: a workaround exists': 0.02,
        'blocked: no workaround, work has stopped': 0.98,
      });
    });
  });

  describe('3. Renormalisation', () => {
    it('renormalises ten choice options whose rounded probabilities sum to 0.97 to sum to 1', async () => {
      const tenOptions = Array.from({ length: 10 }, (_, i) => ({
        Value: `opt${i}`,
        Description: `Option ${i}`,
      }));

      // 10 options summing to 0.97
      const rawProbs: Record<string, number> = {
        opt0: 0.1,
        opt1: 0.1,
        opt2: 0.1,
        opt3: 0.1,
        opt4: 0.1,
        opt5: 0.1,
        opt6: 0.1,
        opt7: 0.1,
        opt8: 0.1,
        opt9: 0.07,
      };

      const responseWithDrift = {
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          choiceQ: {
            type: 'choice',
            choice: 'opt0',
            probabilities: rawProbs,
            confidence: 0.95,
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseWithDrift), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const params: DecisionParams = {
        Model: '',
        State: 'Test state',
        Questions: {
          choiceQ: {
            Kind: 'Choice',
            Instructions: 'Choose an option',
            Options: tenOptions,
          } as ChoiceQuestion,
        },
      };

      const result = await driver.Decide(params);
      expect(result.success).toBe(true);

      const answer = result.Answers['choiceQ'] as ChoiceAnswer;
      const sum = Object.values(answer.Probabilities).reduce((acc, p) => acc + p, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    });
  });

  describe('3b. Confidence', () => {
    it('uses the top probability when the API sends no confidence', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          model: 'typesafe/jev-1.13-20260917',
          answers: { route: { type: 'choice', choice: 'b', probabilities: { a: 0.3, b: 0.7 } } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'Test state',
        Questions: {
          route: { Kind: 'Choice', Instructions: 'Pick', Options: [{ Value: 'a', Description: 'A' }, { Value: 'b', Description: 'B' }] } as ChoiceQuestion,
        },
      });

      expect(result.success).toBe(true);
      expect((result.Answers['route'] as ChoiceAnswer).Confidence).toBeCloseTo(0.7);
    });
  });

  describe('4. Failures', () => {
    it('fails when a question key is missing from response answers', async () => {
      const responseMissingKey = {
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          refund: { type: 'noul', noul: 0.5 },
          // route and urgency missing
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseMissingKey), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: sampleQuestions,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/Question 'route': the response has no answer object for it/);
      // An unmappable response allows failover to another decision model.
      expect(result.errorInfo).toMatchObject({ errorType: 'ModelError', severity: 'Retriable', canFailover: true });
    });

    it('fails when Choice choice value is not one of the options', async () => {
      const responseInvalidChoice = {
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          route: {
            type: 'choice',
            choice: 'sales', // not an option
            probabilities: { account: 0.5, billing: 0.5, technical: 0 },
            confidence: 1,
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseInvalidChoice), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: { route: sampleQuestions.route },
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/is not one of the options/);
    });

    it('fails when wire Likelihood probability is non-numeric', async () => {
      const responseNonNumericNoul = {
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          refund: {
            type: 'noul',
            noul: 'probably', // non-numeric wire value
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseNonNumericNoul), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: { refund: sampleQuestions.refund },
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/finite number/i);
    });

    it('fails when probability distribution is all zeroes', async () => {
      const responseAllZeroProbs = {
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          route: {
            type: 'choice',
            choice: 'technical',
            probabilities: { account: 0, billing: 0, technical: 0 },
            confidence: 0,
          },
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseAllZeroProbs), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: { route: sampleQuestions.route },
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/probabilities sum to 0/i);
    });

    it('fails on HTTP 400 with error message naming the status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Bad Request: invalid payload structure', {
          status: 400,
          statusText: 'Bad Request',
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: sampleQuestions,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/400/);
    });

    it('fails on HTTP 429 and flags canFailover as true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Too Many Requests: rate limit exceeded', {
          status: 429,
          statusText: 'Too Many Requests',
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: sampleQuestions,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/429/);
      expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('fails on HTTP 503 and flags canFailover as true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        })
      );

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: sampleQuestions,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/503/);
      expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('fails when fetch throws a network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection reset by peer'));

      const driver = new OpenRouterDecision(apiKey);
      const result = await driver.Decide({
        Model: '',
        State: 'State',
        Questions: sampleQuestions,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/Connection reset by peer/);
    });
  });

  describe('5. Cancellation', () => {
    it('passes CancellationToken signal to fetch', async () => {
      let passedSignal: AbortSignal | undefined | null;

      globalThis.fetch = vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        passedSignal = init?.signal;
        return new Response(JSON.stringify(sampleResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const controller = new AbortController();
      const driver = new OpenRouterDecision(apiKey);

      await driver.Decide({
        Model: '',
        State: 'State',
        Questions: sampleQuestions,
        CancellationToken: controller.signal,
      });

      expect(passedSignal).toBe(controller.signal);
    });
  });
});
