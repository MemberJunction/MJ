import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    BaseSystemOneDecision,
    CreateSystemOneHTTPError,
    IsSystemOneWireObject,
    ParseSystemOneCredential,
    SystemOneConfigurationError,
} from '../generic/baseSystemOneDecision';
import {
    ChoiceAnswer,
    ChoiceQuestion,
    DecisionParams,
    LikelihoodAnswer,
    LikelihoodQuestion,
    ScoreAnswer,
    ScoreQuestion,
} from '../generic/decision.types';

/** One request the driver sent. */
interface SentRequest {
    Url: string;
    Init: RequestInit;
    Body: Record<string, unknown>;
}

/**
 * A minimal System One driver: every hook it can leave alone stays at the base's default, and the
 * network is the scripted {@link Responder}.
 */
class TestSystemOneDecision extends BaseSystemOneDecision {
    public Sent: SentRequest[] = [];
    public Responder: () => Response = () => jsonResponse(SAMPLE_RESPONSE);

    constructor(apiKey = 'test-key') {
        super(apiKey);
    }

    protected get ServiceName(): string {
        return 'Test Decisions API';
    }

    protected get DefaultModel(): string {
        return 'vendor/default-model';
    }

    protected GetEndpointURL(model: string): string {
        return `https://decisions.example.test/run/${model}`;
    }

    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        this.Sent.push({ Url: url, Init: init, Body: JSON.parse(String(init.body)) });
        return this.Responder();
    }
}

/** A driver whose configuration check fails, as one whose credential lacks a part it needs. */
class MisconfiguredSystemOneDecision extends TestSystemOneDecision {
    protected GetConfigurationError(): SystemOneConfigurationError | undefined {
        return { Message: 'Test Decisions API has no endpoint', ErrorType: 'NoCredentials' };
    }
}

/** Exercises the response and model hooks: a vendor that wraps the response and uses a short model name. */
class WrappingSystemOneDecision extends TestSystemOneDecision {
    protected GetWireModelName(model: string): string {
        return model.split('/').pop() ?? model;
    }

    protected GetRequestHeaders(model: string): Record<string, string> {
        return { 'X-Test-Model': model, 'Content-Type': 'application/json' };
    }

    protected UnwrapResponse(body: unknown, status: number): unknown {
        if (IsSystemOneWireObject(body) && body['ok'] === false) {
            throw CreateSystemOneHTTPError(`Test Decisions API reported a failure (HTTP ${status})`, status);
        }
        return IsSystemOneWireObject(body) ? body['result'] : undefined;
    }

    protected DescribeHTTPError(status: number, bodyText: string): string {
        return `wrapped ${status} [${bodyText.length} chars]`;
    }
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SAMPLE_RESPONSE = {
    model: 'vendor/model-20261001',
    answers: {
        refund: { type: 'noul', noul: 0.05 },
        route: { type: 'choice', choice: 'technical', probabilities: { account: 0, billing: 0.01, technical: 0.98 }, confidence: 0.96 },
        urgency: { type: 'score', score: 1.98, legend: { '0': 'low', '1': 'medium', '2': 'high' }, probabilities: { '0': 0, '1': 0.02, '2': 0.98 }, confidence: 0.97 },
    },
    usage: { input_tokens: 438, output_tokens: 69, cost: 0.0000184 },
};

const QUESTIONS: DecisionParams['Questions'] = {
    refund: { Kind: 'Likelihood', Instructions: 'Does the customer ask for a refund?' } as LikelihoodQuestion,
    route: {
        Kind: 'Choice',
        Instructions: 'Which team handles this ticket?',
        Options: [
            { Value: 'account', Description: 'Account access' },
            { Value: 'billing', Description: 'Invoices and payments' },
            { Value: 'technical', Description: 'Errors and outages' },
        ],
    } as ChoiceQuestion,
    urgency: { Kind: 'Score', Instructions: 'How urgent is it?', Levels: ['low', 'medium', 'high'] } as ScoreQuestion,
};

function params(overrides: Partial<DecisionParams> = {}): DecisionParams {
    return { Model: '', State: 'The app crashes on startup.', Questions: QUESTIONS, ...overrides };
}

describe('BaseSystemOneDecision', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('the request', () => {
        it('POSTs the System One body for all three question kinds, with bearer auth, to the hook URL for the default model', async () => {
            const driver = new TestSystemOneDecision('secret-key');
            const controller = new AbortController();
            const result = await driver.Decide(params({ State: { ticket: 'App crashed' }, CancellationToken: controller.signal }));

            expect(result.success).toBe(true);
            expect(driver.Sent).toHaveLength(1);
            const [sent] = driver.Sent;
            expect(sent.Url).toBe('https://decisions.example.test/run/vendor/default-model');
            expect(sent.Init.method).toBe('POST');
            expect(sent.Init.headers).toEqual({ Authorization: 'Bearer secret-key', 'Content-Type': 'application/json' });
            expect(sent.Init.signal).toBe(controller.signal);
            expect(sent.Body).toEqual({
                model: 'vendor/default-model',
                state: { ticket: 'App crashed' },
                questions: {
                    refund: { type: 'noul', instructions: 'Does the customer ask for a refund?' },
                    route: {
                        type: 'choice',
                        instructions: 'Which team handles this ticket?',
                        criteria: { account: 'Account access', billing: 'Invoices and payments', technical: 'Errors and outages' },
                    },
                    urgency: { type: 'score', instructions: 'How urgent is it?', criteria: ['low', 'medium', 'high'] },
                },
            });
        });

        it('uses the trimmed DecisionParams.Model, and the model and header hooks', async () => {
            const driver = new WrappingSystemOneDecision();
            driver.Responder = () => jsonResponse({ result: SAMPLE_RESPONSE });
            await driver.Decide(params({ Model: '  vendor/family/short-name  ' }));

            const [sent] = driver.Sent;
            expect(sent.Url).toBe('https://decisions.example.test/run/vendor/family/short-name');
            expect(sent.Body['model']).toBe('short-name');
            expect(sent.Init.headers).toEqual({ 'X-Test-Model': 'vendor/family/short-name', 'Content-Type': 'application/json' });
        });

        it('sends through the global fetch unless SendRequest is overridden', async () => {
            const fetchStub = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_RESPONSE));
            vi.stubGlobal('fetch', fetchStub);

            class FetchingDecision extends BaseSystemOneDecision {
                protected get ServiceName(): string { return 'Fetching API'; }
                protected get DefaultModel(): string { return 'm'; }
                protected GetEndpointURL(): string { return 'https://fetch.example.test/decide'; }
            }
            const result = await new FetchingDecision('k').Decide(params());

            expect(result.success).toBe(true);
            expect(fetchStub).toHaveBeenCalledTimes(1);
            expect(fetchStub.mock.calls[0][0]).toBe('https://fetch.example.test/decide');
        });
    });

    describe('the credential', () => {
        it("sends an AI Credential's apiKey as the bearer token, not its JSON", async () => {
            const driver = new TestSystemOneDecision(JSON.stringify({ apiKey: 'sk-from-credential' }));
            await driver.Decide(params());

            expect(driver.Sent[0].Init.headers).toEqual({ Authorization: 'Bearer sk-from-credential', 'Content-Type': 'application/json' });
        });

        it('sends a raw API key exactly as given', async () => {
            const driver = new TestSystemOneDecision(' raw-key ');
            await driver.Decide(params());

            expect(driver.Sent[0].Init.headers).toEqual({ Authorization: 'Bearer  raw-key ', 'Content-Type': 'application/json' });
        });

        it('ParseSystemOneCredential reads apiKey, endpoint and accountId from JSON and keeps anything else raw', () => {
            expect(ParseSystemOneCredential('{"apiKey":" k ","endpoint":"https://e.example.test","accountId":"acct"}'))
                .toEqual({ APIKey: 'k', Endpoint: 'https://e.example.test', AccountID: 'acct' });
            expect(ParseSystemOneCredential('{"apiKey":"k"}')).toEqual({ APIKey: 'k', Endpoint: undefined, AccountID: undefined });
            expect(ParseSystemOneCredential('{"endpoint":"https://e.example.test","apiKey":""}'))
                .toEqual({ APIKey: '', Endpoint: 'https://e.example.test', AccountID: undefined });
            expect(ParseSystemOneCredential('{"apiKey":7}')).toEqual({ APIKey: '', Endpoint: undefined, AccountID: undefined });
            expect(ParseSystemOneCredential('acct:token')).toEqual({ APIKey: 'acct:token' });
            expect(ParseSystemOneCredential('{not json')).toEqual({
                APIKey: '',
                ParseError: 'the API key starts with "{" but is not valid JSON; check the AI_VENDOR_API_KEY__* variable or apiKeys entry it came from',
            });
            expect(ParseSystemOneCredential('["a"]')).toEqual({ APIKey: '["a"]' });
            expect(ParseSystemOneCredential('')).toEqual({ APIKey: '' });
        });

        it('fails without a request, allowing failover, when the configuration check reports a problem', async () => {
            const driver = new MisconfiguredSystemOneDecision();
            const result = await driver.Decide(params());

            expect(driver.Sent).toHaveLength(0);
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Test Decisions API has no endpoint');
            // Not 'Fatal': the failover loop stops on any Fatal error, so a misconfigured fallback
            // candidate would stop the loop before a correctly configured one got its turn.
            expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
            expect(result.Answers).toEqual({});
        });

        it('fails without a request when the credential starts with { but is not JSON, never sending its text', async () => {
            // One stray comma: before, the whole text, real key included, went out as the bearer token.
            const driver = new TestSystemOneDecision('{"apiKey":"sk-123","endpoint":"https://s1.example",}');
            const result = await driver.Decide(params());

            expect(driver.Sent).toHaveLength(0);
            expect(result.success).toBe(false);
            expect(result.errorMessage).toMatch(/^Test Decisions API: the API key starts with "\{" but is not valid JSON/);
            expect(result.errorMessage).not.toContain('sk-123');
            expect(result.errorInfo).toEqual({ errorType: 'NoCredentials', severity: 'Retriable', canFailover: true });
        });
    });

    describe('the answers', () => {
        it('maps all three kinds, keys Score probabilities by level name, and records the model and usage', async () => {
            const driver = new TestSystemOneDecision();
            const result = await driver.Decide(params());

            expect(result.success).toBe(true);
            expect(result.ResolvedModel).toBe('vendor/model-20261001');
            expect(result.Usage?.promptTokens).toBe(438);
            expect(result.Usage?.completionTokens).toBe(69);
            expect(result.Usage?.cost).toBe(0.0000184);
            expect(result.Usage?.costCurrency).toBe('USD');

            expect(result.Answers['refund'] as LikelihoodAnswer).toEqual({ Kind: 'Likelihood', Probability: 0.05 });

            const route = result.Answers['route'] as ChoiceAnswer;
            expect(route.Value).toBe('technical');
            expect(route.Confidence).toBe(0.96);
            // 0, 0.01, 0.98 sum to 0.99: renormalised to sum to 1.
            expect(route.Probabilities['account']).toBe(0);
            expect(route.Probabilities['billing']).toBeCloseTo(0.01 / 0.99, 10);
            expect(route.Probabilities['technical']).toBeCloseTo(0.98 / 0.99, 10);

            const urgency = result.Answers['urgency'] as ScoreAnswer;
            expect(urgency.Value).toBe(1.98);
            expect(urgency.Confidence).toBe(0.97);
            expect(urgency.Probabilities).toEqual({ low: 0, medium: 0.02, high: 0.98 });
        });

        it('records no cost when the usage has none', async () => {
            const driver = new TestSystemOneDecision();
            driver.Responder = () => jsonResponse({ ...SAMPLE_RESPONSE, usage: { input_tokens: 10, output_tokens: 0 } });
            const result = await driver.Decide(params());

            expect(result.success).toBe(true);
            expect(result.Usage?.promptTokens).toBe(10);
            expect(result.Usage?.cost).toBeUndefined();
        });

        it('clamps a Likelihood and a Score into range, and falls back to the top probability for a missing confidence', async () => {
            const driver = new TestSystemOneDecision();
            driver.Responder = () => jsonResponse({
                answers: {
                    refund: { noul: 1.2 },
                    route: { choice: 'billing', probabilities: { account: 0.2, billing: 0.6, technical: 0.2 } },
                    urgency: { score: 7, probabilities: { '0': 0, '1': 0, '2': 1 } },
                },
            });
            const result = await driver.Decide(params());

            expect(result.success).toBe(true);
            expect((result.Answers['refund'] as LikelihoodAnswer).Probability).toBe(1);
            expect((result.Answers['route'] as ChoiceAnswer).Confidence).toBeCloseTo(0.6, 10);
            expect((result.Answers['urgency'] as ScoreAnswer).Value).toBe(2);
            expect(result.ResolvedModel).toBeUndefined();
            expect(result.Usage).toBeUndefined();
        });

        it('unwraps the response through UnwrapResponse', async () => {
            const driver = new WrappingSystemOneDecision();
            driver.Responder = () => jsonResponse({ ok: true, result: SAMPLE_RESPONSE });
            const result = await driver.Decide(params());

            expect(result.success).toBe(true);
            expect(result.ResolvedModel).toBe('vendor/model-20261001');
            expect((result.Answers['route'] as ChoiceAnswer).Value).toBe('technical');
        });
    });

    describe('unmappable responses fail with a failover-eligible error and no answers', () => {
        const cases: Array<{ Name: string; Body: unknown; Message: RegExp }> = [
            { Name: 'no answers object', Body: { model: 'm' }, Message: /The Test Decisions API response has no answers object/ },
            { Name: 'a missing answer', Body: { answers: { refund: { type: 'noul', noul: 0.5 } } }, Message: /Question 'route': the response has no answer object for it/ },
            {
                Name: 'a wire type that does not match the question',
                Body: { answers: { ...SAMPLE_RESPONSE.answers, refund: { type: 'choice', choice: 'x' } } },
                Message: /Question 'refund': expected an answer of type 'noul', got 'choice'/,
            },
            {
                Name: 'a choice that is not an option',
                Body: { answers: { ...SAMPLE_RESPONSE.answers, route: { type: 'choice', choice: 'sales', probabilities: { account: 1 } } } },
                Message: /the choice 'sales' is not one of the options/,
            },
            {
                Name: 'a non-numeric Likelihood',
                Body: { answers: { ...SAMPLE_RESPONSE.answers, refund: { type: 'noul', noul: 'likely' } } },
                Message: /the Likelihood probability is not a finite number/,
            },
            {
                Name: 'a Score with no finite value',
                Body: { answers: { ...SAMPLE_RESPONSE.answers, urgency: { type: 'score', score: null, probabilities: { '0': 1 } } } },
                Message: /the Score value is not a finite number/,
            },
            {
                Name: 'Score probabilities that sum to 0',
                Body: { answers: { ...SAMPLE_RESPONSE.answers, urgency: { type: 'score', score: 1, probabilities: { low: 1 } } } },
                Message: /the Score probabilities sum to 0/,
            },
        ];

        for (const c of cases) {
            it(c.Name, async () => {
                const driver = new TestSystemOneDecision();
                driver.Responder = () => jsonResponse(c.Body);
                const result = await driver.Decide(params());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toMatch(c.Message);
                expect(result.errorInfo).toMatchObject({ errorType: 'ModelError', severity: 'Retriable', canFailover: true });
                expect(result.Answers).toEqual({});
            });
        }
    });

    describe('HTTP and transport errors', () => {
        it('names the service and status, and quotes the start of the body', async () => {
            const driver = new TestSystemOneDecision();
            driver.Responder = () => new Response('x'.repeat(800), { status: 400 });
            const result = await driver.Decide(params());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe(`Test Decisions API returned HTTP 400: ${'x'.repeat(500)}`);
        });

        it('lets the subclass describe the error, keeping the status for classification', async () => {
            const driver = new WrappingSystemOneDecision();
            driver.Responder = () => new Response('abc', { status: 503 });
            const result = await driver.Decide(params());

            expect(result.errorMessage).toBe('wrapped 503 [3 chars]');
            expect(result.errorInfo?.httpStatusCode).toBe(503);
            expect(result.errorInfo?.canFailover).toBe(true);
        });

        it('makes a 429 and a 500 failover-eligible, and a 401 a fatal authentication error', async () => {
            const outcome = async (status: number) => {
                const driver = new TestSystemOneDecision();
                driver.Responder = () => new Response('', { status });
                return driver.Decide(params());
            };
            const limited = await outcome(429);
            expect(limited.errorInfo).toMatchObject({ errorType: 'RateLimit', canFailover: true });
            const broken = await outcome(500);
            expect(broken.errorInfo).toMatchObject({ errorType: 'InternalServerError', canFailover: true });
            const denied = await outcome(401);
            expect(denied.errorMessage).toBe('Test Decisions API returned HTTP 401');
            expect(denied.errorInfo).toMatchObject({ errorType: 'Authentication', severity: 'Fatal' });
        });

        it('fails when a 2xx body is not JSON', async () => {
            const driver = new TestSystemOneDecision();
            driver.Responder = () => new Response('<html>gateway</html>', { status: 200 });
            const result = await driver.Decide(params());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toMatch(/^The Test Decisions API response is not JSON: /);
        });

        it('fails with the error UnwrapResponse throws, and its status', async () => {
            const driver = new WrappingSystemOneDecision();
            driver.Responder = () => jsonResponse({ ok: false });
            const result = await driver.Decide(params());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Test Decisions API reported a failure (HTTP 200)');
            expect(result.errorInfo?.httpStatusCode).toBe(200);
            // An envelope failure names no known error, so it must still let another model answer.
            expect(result.errorInfo?.canFailover).toBe(true);
        });
    });

    describe('helpers', () => {
        it('IsSystemOneWireObject accepts only plain objects', () => {
            expect(IsSystemOneWireObject({})).toBe(true);
            expect(IsSystemOneWireObject([])).toBe(false);
            expect(IsSystemOneWireObject(null)).toBe(false);
            expect(IsSystemOneWireObject('x')).toBe(false);
        });

        it('CreateSystemOneHTTPError carries the status', () => {
            const err = CreateSystemOneHTTPError('boom', 502);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('boom');
            expect(err.status).toBe(502);
        });
    });
});
