import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
  BaseDecision,
  ChoiceAnswer,
  DecisionParams,
  DecisionResult,
  LikelihoodAnswer,
  ScoreAnswer,
} from '@memberjunction/ai';
import { OpenAIDecision, ToOpenAIDecisionsURL } from '../models/openAIDecision';

// No mocks of @memberjunction/global: the driver's own @RegisterClass runs against the real ClassFactory.

const API_KEY = 'sk-test-openai-decisions-key';

const QUESTIONS: DecisionParams['Questions'] = {
  urgent: { Kind: 'Likelihood', Instructions: 'Is this support request urgent?' },
  team: {
    Kind: 'Choice',
    Instructions: 'Which team should handle this request?',
    Options: [
      { Value: 'billing', Description: 'Payments, invoices, and refunds' },
      { Value: 'technical', Description: 'Outages, errors, and configuration' },
      { Value: 'sales', Description: 'Plans and upgrades' },
    ],
  },
  severity: { Kind: 'Score', Instructions: 'How severe is the customer impact?', Levels: ['No impact', 'Minor', 'Major', 'Critical'] },
};

const STATE = 'Checkout has been failing for every customer for the last hour.';

/** The request body the driver must send for QUESTIONS, in the shape of openai-node 7.30.0's DecisionCreateParams. */
const EXPECTED_QUESTIONS = [
  { type: 'predicate', name: 'urgent', instructions: 'Is this support request urgent?' },
  {
    type: 'choice',
    name: 'team',
    instructions: 'Which team should handle this request?',
    choices: [
      { value: 'billing', description: 'Payments, invoices, and refunds' },
      { value: 'technical', description: 'Outages, errors, and configuration' },
      { value: 'sales', description: 'Plans and upgrades' },
    ],
  },
  {
    type: 'score',
    name: 'severity',
    instructions: 'How severe is the customer impact?',
    levels: [{ label: 'No impact' }, { label: 'Minor' }, { label: 'Major' }, { label: 'Critical' }],
  },
];

/** Answers in the shapes of openai-node 7.30.0's Decision.AnswerResource* types. The Choice sums to 0.98. */
const PREDICATE_ANSWER = { type: 'predicate', name: 'urgent', probability: 0.91 };
const CHOICE_ANSWER = {
  type: 'choice',
  name: 'team',
  choice: 'technical',
  confidence: 0.9,
  probabilities: [
    { value: 'billing', probability: 0.02 },
    { value: 'technical', probability: 0.95 },
    { value: 'sales', probability: 0.01 },
  ],
};
const SCORE_ANSWER = {
  type: 'score',
  name: 'severity',
  score: 2.7,
  confidence: 0.8,
  probabilities: [
    { label: 'No impact', value: 0, probability: 0 },
    { label: 'Minor', value: 1, probability: 0.05 },
    { label: 'Major', value: 2, probability: 0.2 },
    { label: 'Critical', value: 3, probability: 0.75 },
  ],
};

/** A whole Decision response, as openai-node 7.30.0 types it. */
function sdkResponse(answers: unknown[] = [PREDICATE_ANSWER, CHOICE_ANSWER, SCORE_ANSWER]): Record<string, unknown> {
  return {
    model: 'gpt-6-luna',
    answers,
    usage: {
      input_tokens: 406,
      input_tokens_details: { cache_write_tokens: 0, cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 406,
    },
  };
}

/** One request the fetch fake received. */
interface CapturedRequest {
  Url: string;
  Init: RequestInit | undefined;
}

let captured: CapturedRequest[] = [];
let originalFetch: typeof globalThis.fetch;

/** Replaces fetch with a fake that records each request and answers with `status` and `body`. */
function respondWith(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ Url: String(url), Init: init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  });
}

function sentBody(index = 0): Record<string, unknown> {
  return JSON.parse(String(captured[index].Init?.body));
}

function sentHeaders(index = 0): Headers {
  return new Headers(captured[index].Init?.headers);
}

async function decide(driver: OpenAIDecision, overrides: Partial<DecisionParams> = {}): Promise<DecisionResult> {
  return driver.Decide({ Model: 'gpt-6-luna', State: STATE, Questions: QUESTIONS, ...overrides });
}

describe('OpenAIDecision', () => {
  beforeEach(() => {
    captured = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('registration', () => {
    it("resolves through the ClassFactory as 'OpenAIDecision'", () => {
      const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, 'OpenAIDecision', API_KEY);
      expect(driver).toBeInstanceOf(OpenAIDecision);
    });
  });

  describe('the request', () => {
    it('POSTs every question kind, in order and named by its key, with the bearer key and the state as input', async () => {
      respondWith(200, sdkResponse());
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect(captured).toHaveLength(1);
      expect(captured[0].Url).toBe('https://api.openai.com/v1/decisions');
      expect(captured[0].Init?.method).toBe('POST');
      expect(sentHeaders().get('Authorization')).toBe(`Bearer ${API_KEY}`);
      expect(sentHeaders().get('Content-Type')).toBe('application/json');
      expect(sentBody()).toEqual({ model: 'gpt-6-luna', input: STATE, questions: EXPECTED_QUESTIONS });
    });

    it('keeps the questions in the order the caller gave them', async () => {
      respondWith(200, sdkResponse([SCORE_ANSWER, PREDICATE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY), { Questions: { severity: QUESTIONS.severity, urgent: QUESTIONS.urgent } });

      expect(result.success).toBe(true);
      const questions = sentBody()['questions'] as Array<Record<string, unknown>>;
      expect(questions.map(q => q['name'])).toEqual(['severity', 'urgent']);
      expect(questions.map(q => q['type'])).toEqual(['score', 'predicate']);
    });

    it('sends an object state as JSON text', async () => {
      respondWith(200, sdkResponse());
      await decide(new OpenAIDecision(API_KEY), { State: { user: 'Alice', issue: 'App crashed on startup' } });

      expect(sentBody()['input']).toBe('{"user":"Alice","issue":"App crashed on startup"}');
    });

    it('defaults the model to gpt-6-luna when DecisionParams.Model is empty', async () => {
      respondWith(200, sdkResponse());
      await decide(new OpenAIDecision(API_KEY), { Model: '  ' });

      expect(sentBody()['model']).toBe(OpenAIDecision.DEFAULT_MODEL);
      expect(OpenAIDecision.DEFAULT_MODEL).toBe('gpt-6-luna');
    });

    it("passes the caller's cancellation signal to the request", async () => {
      respondWith(200, sdkResponse());
      const controller = new AbortController();
      await decide(new OpenAIDecision(API_KEY), { CancellationToken: controller.signal });

      expect(captured[0].Init?.signal).toBe(controller.signal);
    });
  });

  describe('the answers', () => {
    it('maps the SDK-documented answer shapes: probabilities keyed by option value and level label, renormalised', async () => {
      respondWith(200, sdkResponse());
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect(result.errorMessage).toBeUndefined();
      expect(result.ResolvedModel).toBe('gpt-6-luna');
      expect(result.Usage?.promptTokens).toBe(406);
      expect(result.Usage?.completionTokens).toBe(0);
      expect(result.Usage?.cost).toBeUndefined();

      const urgent = result.Answers['urgent'] as LikelihoodAnswer;
      expect(urgent).toEqual({ Kind: 'Likelihood', Probability: 0.91 });

      const team = result.Answers['team'] as ChoiceAnswer;
      expect(team.Kind).toBe('Choice');
      expect(team.Value).toBe('technical');
      expect(team.Confidence).toBe(0.9);
      expect(Object.keys(team.Probabilities)).toEqual(['billing', 'technical', 'sales']);
      expect(team.Probabilities['technical']).toBeCloseTo(0.95 / 0.98, 12);
      expect(team.Probabilities['billing'] + team.Probabilities['technical'] + team.Probabilities['sales']).toBeCloseTo(1, 12);

      const severity = result.Answers['severity'] as ScoreAnswer;
      expect(severity.Kind).toBe('Score');
      expect(severity.Value).toBeCloseTo(2.7, 12);
      expect(severity.Confidence).toBe(0.8);
      expect(severity.Probabilities).toEqual({ 'No impact': 0, Minor: 0.05, Major: 0.2, Critical: 0.75 });
    });

    it('matches answers by name when they come back out of order', async () => {
      respondWith(200, sdkResponse([SCORE_ANSWER, CHOICE_ANSWER, PREDICATE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect((result.Answers['urgent'] as LikelihoodAnswer).Probability).toBe(0.91);
      expect((result.Answers['team'] as ChoiceAnswer).Value).toBe('technical');
      expect((result.Answers['severity'] as ScoreAnswer).Value).toBeCloseTo(2.7, 12);
    });

    it('falls back to the position of an unnamed answer', async () => {
      const unnamed = [PREDICATE_ANSWER, CHOICE_ANSWER, SCORE_ANSWER].map(a => ({ ...a, name: null }));
      respondWith(200, sdkResponse(unnamed));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect((result.Answers['team'] as ChoiceAnswer).Value).toBe('technical');
    });

    it("never uses an answer named for another question, whatever its position", async () => {
      respondWith(200, sdkResponse([PREDICATE_ANSWER, { ...CHOICE_ANSWER, name: 'route' }, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Question 'team': the response has no answer for it");
      expect(result.errorInfo).toMatchObject({ errorType: 'ModelError', severity: 'Retriable', canFailover: true });
    });

    it("fails when an answer's type does not match its question", async () => {
      respondWith(200, sdkResponse([PREDICATE_ANSWER, { ...SCORE_ANSWER, name: 'team' }, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Question 'team': expected an answer of type 'choice', got 'score'");
    });

    it('maps a Score whose levels are valued 1 to n onto MJ positions 0 to n - 1', async () => {
      const oneBased = { ...SCORE_ANSWER, score: 3.7, probabilities: SCORE_ANSWER.probabilities.map(p => ({ ...p, value: p.value + 1 })) };
      respondWith(200, sdkResponse([PREDICATE_ANSWER, CHOICE_ANSWER, oneBased]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect((result.Answers['severity'] as ScoreAnswer).Value).toBeCloseTo(2.7, 12);
    });

    it("uses the expected level when the levels' values are missing", async () => {
      const unvalued = { ...SCORE_ANSWER, score: 99, probabilities: SCORE_ANSWER.probabilities.map(({ label, probability }) => ({ label, probability })) };
      respondWith(200, sdkResponse([PREDICATE_ANSWER, CHOICE_ANSWER, unvalued]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      // 0 * 0 + 1 * 0.05 + 2 * 0.2 + 3 * 0.75
      expect((result.Answers['severity'] as ScoreAnswer).Value).toBeCloseTo(2.7, 12);
    });

    it('takes the top probability as the confidence when the answer has none, and clamps a predicate', async () => {
      const { confidence: _dropped, ...noConfidence } = CHOICE_ANSWER;
      respondWith(200, sdkResponse([{ ...PREDICATE_ANSWER, probability: 1.2 }, noConfidence, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect((result.Answers['urgent'] as LikelihoodAnswer).Probability).toBe(1);
      expect((result.Answers['team'] as ChoiceAnswer).Confidence).toBeCloseTo(0.95 / 0.98, 12);
    });

    it('rejects a boolean choice: typed values only match string options', async () => {
      respondWith(200, sdkResponse([PREDICATE_ANSWER, { ...CHOICE_ANSWER, choice: true }, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Question 'team': the choice 'true' is not one of the options (billing, technical, sales)");
    });

    it('fails when a Choice distribution sums to 0', async () => {
      const zero = { ...CHOICE_ANSWER, probabilities: CHOICE_ANSWER.probabilities.map(p => ({ ...p, probability: 0 })) };
      respondWith(200, sdkResponse([PREDICATE_ANSWER, zero, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Question 'team': the Choice probabilities sum to 0");
    });

    it('fails when the response has no answers array', async () => {
      respondWith(200, { model: 'gpt-6-luna', answers: { urgent: PREDICATE_ANSWER } });
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('The OpenAI Decisions API response has no answers array');
    });
  });

  describe('refusals', () => {
    it('fails the result with an error that names the refused question and allows failover', async () => {
      respondWith(200, sdkResponse([PREDICATE_ANSWER, { type: 'refusal', name: 'team' }, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.Answers).toEqual({});
      expect(result.errorMessage).toBe("Question 'team': OpenAI declined to answer it (refusal)");
      expect(result.errorInfo).toMatchObject({ errorType: 'ModelError', severity: 'Retriable', canFailover: true });
    });

    it('fails on an unnamed refusal in the question’s position', async () => {
      respondWith(200, sdkResponse([{ type: 'refusal', name: null }, CHOICE_ANSWER, SCORE_ANSWER]));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Question 'urgent': OpenAI declined to answer it (refusal)");
      expect(result.errorInfo?.canFailover).toBe(true);
    });
  });

  describe('credentials', () => {
    it('sends a raw API key as the bearer token', async () => {
      respondWith(200, sdkResponse());
      await decide(new OpenAIDecision(API_KEY));

      expect(sentHeaders().get('Authorization')).toBe(`Bearer ${API_KEY}`);
    });

    it("sends an AI Credential's apiKey as the bearer token, not the credential's JSON", async () => {
      respondWith(200, sdkResponse());
      const result = await decide(new OpenAIDecision(JSON.stringify({ apiKey: API_KEY })));

      expect(result.success).toBe(true);
      expect(sentHeaders().get('Authorization')).toBe(`Bearer ${API_KEY}`);
    });

    it('fails before any request, failover allowed, when there is no API key', async () => {
      respondWith(200, sdkResponse());
      for (const key of ['', '   ', JSON.stringify({ endpoint: 'https://proxy.example.test/v1' })]) {
        const result = await decide(new OpenAIDecision(key));

        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('OpenAI Decisions API has no API key');
        expect(result.errorMessage).toContain('AI_VENDOR_API_KEY__OPENAIDECISION');
        expect(result.errorInfo).toMatchObject({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
      }
      expect(captured).toHaveLength(0);
    });

    it('fails before any request, without quoting it, when the key starts with "{" but is not JSON', async () => {
      respondWith(200, sdkResponse());
      const result = await decide(new OpenAIDecision('{"apiKey": "sk-truncated'));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('is not valid JSON');
      expect(result.errorMessage).not.toContain('sk-truncated');
      expect(result.errorInfo).toMatchObject({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
      expect(captured).toHaveLength(0);
    });
  });

  describe('the endpoint', () => {
    it('takes a constructor URL over the default', async () => {
      respondWith(200, sdkResponse());
      const driver = new OpenAIDecision(API_KEY, 'https://gateway.example.test/openai/v1/decisions');
      await decide(driver);

      expect(driver.EndpointURL).toBe('https://gateway.example.test/openai/v1/decisions');
      expect(captured[0].Url).toBe('https://gateway.example.test/openai/v1/decisions');
    });

    it("takes the credential's endpoint, appending /decisions to a base URL", async () => {
      respondWith(200, sdkResponse());
      const driver = new OpenAIDecision(JSON.stringify({ apiKey: API_KEY, endpoint: 'https://proxy.example.test/v1/' }));
      await decide(driver);

      expect(captured[0].Url).toBe('https://proxy.example.test/v1/decisions');
      expect(sentHeaders().get('Authorization')).toBe(`Bearer ${API_KEY}`);
    });

    it("prefers the constructor URL to the credential's endpoint", () => {
      const driver = new OpenAIDecision(JSON.stringify({ apiKey: API_KEY, endpoint: 'https://credential.example.test/v1' }), 'https://constructor.example.test/v1');
      expect(driver.EndpointURL).toBe('https://constructor.example.test/v1/decisions');
    });

    it('builds the URL from a base or a full endpoint', () => {
      expect(ToOpenAIDecisionsURL('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/decisions');
      expect(ToOpenAIDecisionsURL(' https://api.openai.com/v1/decisions// ')).toBe('https://api.openai.com/v1/decisions');
    });
  });

  describe('HTTP errors', () => {
    const openAIError = (message: string, type: string, code: string | null): Record<string, unknown> => ({ error: { message, type, param: null, code } });

    it("classifies a 401 as a fatal authentication error with OpenAI's message, as the other decision drivers do", async () => {
      respondWith(401, openAIError('Incorrect API key provided: sk-test-****-key. You can find your API key at https://platform.openai.com/account/api-keys.', 'invalid_request_error', 'invalid_api_key'));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('OpenAI Decisions API returned HTTP 401: Incorrect API key provided: sk-test-****-key. You can find your API key at https://platform.openai.com/account/api-keys.');
      expect(result.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal', httpStatusCode: 401 });
    });

    it('makes a 429 failover-eligible', async () => {
      respondWith(429, openAIError('Rate limit reached for gpt-6-luna in organization org-test on requests per min (RPM): Limit 500, Used 500, Requested 1.', 'requests', 'rate_limit_exceeded'));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('HTTP 429: Rate limit reached');
      expect(result.errorInfo).toMatchObject({ errorType: 'RateLimit', httpStatusCode: 429, canFailover: true });
    });

    it.each([
      [500, 'InternalServerError'],
      [502, 'InternalServerError'],
      [503, 'ServiceUnavailable'],
    ])('makes a %i failover-eligible', async (status, errorType) => {
      respondWith(status, openAIError('The server had an error while processing your request. Sorry about that!', 'server_error', null));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain(`HTTP ${status}`);
      expect(result.errorInfo).toMatchObject({ errorType, httpStatusCode: status, canFailover: true });
      expect(result.errorInfo?.severity).not.toBe('Fatal');
    });

    it('names the status and the start of a body that is not OpenAI JSON', async () => {
      respondWith(502, '<html>Bad gateway</html>');
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.errorMessage).toBe('OpenAI Decisions API returned HTTP 502: <html>Bad gateway</html>');
    });

    it('never puts the API key in an error message, even when the body echoes it', async () => {
      respondWith(400, openAIError(`Bad key ${API_KEY}`, 'invalid_request_error', null));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.errorMessage).toBe('OpenAI Decisions API returned HTTP 400: Bad key [redacted]');
      expect(result.errorMessage).not.toContain(API_KEY);
    });

    it('fails on a network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection reset by peer'));
      const result = await decide(new OpenAIDecision(API_KEY));

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/Connection reset by peer/);
    });
  });

  describe('the SendRequest seam', () => {
    it('is the only network call, so a subclass that overrides it stands in for the network', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch must not be called'));
      const seen: string[] = [];
      class ScriptedOpenAIDecision extends OpenAIDecision {
        protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
          seen.push(`${url} ${String(init.method)}`);
          return new Response(JSON.stringify(sdkResponse()), { status: 200 });
        }
      }
      const result = await decide(new ScriptedOpenAIDecision(API_KEY));

      expect(result.success).toBe(true);
      expect(seen).toEqual(['https://api.openai.com/v1/decisions POST']);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
