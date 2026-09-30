// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';

/** The slice of `APIKeyEngine.Authorize` that ResolverBase.CheckAPIKeyScopeAuthorization calls. */
type AuthorizeFn = (
  apiKeyHash: string,
  application: string,
  scopePath: string,
  resource: string,
  contextUser: UserInfo,
  usageDetails: { endpoint: string; method: string },
  options?: { skipLogging?: boolean; actingContext?: UserInfo['APIKeyActingContext'] }
) => Promise<{ Allowed: boolean; Reason: string }>;

const { mockAuthorize } = vi.hoisted(() => ({ mockAuthorize: vi.fn<AuthorizeFn>() }));

// As in RunAIPromptResolver.simplePromptModel.test.ts: vitest's esbuild transform does not apply
// `emitDecoratorMetadata`, so the decorators are no-ops and the resolvers run as plain classes.
// `AuthorizationError` is a real Error so ResolverBase's denial keeps its message.
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
    ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
    Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
    Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
    createUnionType: () => class {},
    AuthorizationError: class AuthorizationError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = 'AuthorizationError';
      }
    },
    Float: class {}, Int: class {}, ID: class {},
  };
});

// Only the API-key engine is replaced. ResolverBase.CheckAPIKeyScopeAuthorization itself is the
// production code, so the authorization tests below exercise the real gate for both resolvers.
vi.mock('@memberjunction/api-keys', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, GetAPIKeyEngine: () => ({ Authorize: mockAuthorize }) };
});

import { EntityInfo, UserInfo } from '@memberjunction/core';
import { MJAIModelTypeEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AIEngine } from '@memberjunction/aiengine';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionRunner, type AIDecisionParams, type AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import { RunDecisionResolver } from '../resolvers/RunDecisionResolver.js';
import { RunAIPromptResolver } from '../resolvers/RunAIPromptResolver.js';
import type { AppContext, UserPayload } from '../types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A minimal entity definition with the named fields, so the fixtures below are real entity objects
 * rather than casts: the ID is the primary key, and every field reads back what was hydrated.
 */
function entityInfo(name: string, fieldNames: string[]): EntityInfo {
  const entityId = `entity-${name}`;
  return new EntityInfo({
    ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
    Fields: fieldNames.map((field, index) => ({
      ID: `${entityId}-${field}`, EntityID: entityId, Sequence: index + 1, Name: field, Entity: name,
      Type: field === 'ID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
    })),
  });
}

const PROMPT_ENTITY = entityInfo('MJ: AI Prompts', ['ID', 'Name', 'Status', 'AIModelTypeID']);
const MODEL_TYPE_ENTITY = entityInfo('MJ: AI Model Types', ['ID', 'Name']);
const PROMPT_RUN_ENTITY = entityInfo('MJ: AI Prompt Runs', ['ID']);

const DECISION_TYPE_ID = 'type-decision';
const LLM_TYPE_ID = 'type-llm';

/** The prompt fields the resolver reads. */
type PromptFields = Pick<MJAIPromptEntityExtended, 'ID' | 'Name' | 'Status' | 'AIModelTypeID'>;

const makePrompt = (over: Partial<PromptFields>): MJAIPromptEntityExtended => {
  const fields: PromptFields = {
    ID: 'prompt-default', Name: 'Default Decision', Status: 'Active', AIModelTypeID: DECISION_TYPE_ID,
    ...over,
  };
  const prompt = new MJAIPromptEntityExtended(PROMPT_ENTITY);
  prompt.Hydrate(fields);
  return prompt;
};

const makeModelType = (fields: Pick<MJAIModelTypeEntity, 'ID' | 'Name'>): MJAIModelTypeEntity => {
  const modelType = new MJAIModelTypeEntity(MODEL_TYPE_ENTITY);
  modelType.Hydrate(fields);
  return modelType;
};

const DEFAULT_PROMPT = makePrompt({});
const ROUTING_PROMPT = makePrompt({ ID: 'prompt-routing', Name: 'Route Message' });
const CHAT_PROMPT = makePrompt({ ID: 'prompt-chat', Name: 'Summarize Text', AIModelTypeID: LLM_TYPE_ID });
const UNTYPED_PROMPT = makePrompt({ ID: 'prompt-untyped', Name: 'Untyped Prompt', AIModelTypeID: null });
const INACTIVE_PROMPT = makePrompt({ ID: 'prompt-inactive', Name: 'Retired Decision', Status: 'Disabled' });

const MODEL_TYPES = [
  makeModelType({ ID: DECISION_TYPE_ID, Name: 'Decision' }),
  makeModelType({ ID: LLM_TYPE_ID, Name: 'LLM' }),
];

/** Gives AIEngine a fixed prompt set and the two model types the tests use; its load does nothing. */
function stubEngine(prompts: MJAIPromptEntityExtended[]): void {
  vi.spyOn(AIEngine.prototype, 'Config').mockResolvedValue(undefined);
  vi.spyOn(AIEngine.prototype, 'Prompts', 'get').mockReturnValue(prompts);
  vi.spyOn(AIEngine.prototype, 'ModelTypes', 'get').mockReturnValue(MODEL_TYPES);
}

const QUESTIONS: Record<string, DecisionQuestion> = {
  route: {
    Kind: 'Choice',
    Instructions: 'Which agent should answer this message?',
    Options: [
      { Value: 'sage', Description: 'General questions about the product' },
      { Value: 'analyst', Description: 'Questions about data and reports' },
    ],
  },
  duplicate: { Kind: 'Likelihood', Instructions: 'Does this message repeat an earlier one?' },
};

const ANSWERS: Record<string, DecisionAnswer> = {
  route: { Kind: 'Choice', Value: 'analyst', Confidence: 0.9, Probabilities: { sage: 0.1, analyst: 0.9 } },
  duplicate: { Kind: 'Likelihood', Probability: 0.2 },
};

const PROMPT_RUN = new MJAIPromptRunEntity(PROMPT_RUN_ENTITY);
PROMPT_RUN.Hydrate({ ID: 'run-1' });

const successResult = (): AIDecisionRunResult => ({
  success: true,
  Answers: ANSWERS,
  promptRun: PROMPT_RUN,
  modelInfo: { modelId: 'model-jev', modelName: 'Jev' },
});

const failedResult = (): AIDecisionRunResult => ({
  success: false,
  errorMessage: 'No Decision model has credentials available',
  Answers: {},
  promptRun: PROMPT_RUN,
  modelInfo: { modelId: 'model-jev', modelName: 'Jev' },
});

const makeUser = (fields: Pick<UserInfo, 'ID' | 'Name' | 'Email'>): UserInfo => Object.assign(new UserInfo(), fields);

const USER = makeUser({ ID: 'user-1', Name: 'Test User', Email: 'test@example.com' });
const SYSTEM_USER = makeUser({ ID: 'user-system', Name: 'System', Email: 'system@example.com' });

/** A session authenticated by JWT: no API key, so no scope check. */
const sessionPayload = (): UserPayload => ({ email: USER.Email, userRecord: USER, sessionId: 'session-1' });
/** A session authenticated by an MJ API key: scope-checked. */
const apiKeyPayload = (): UserPayload => ({ ...sessionPayload(), apiKeyId: 'key-1', apiKeyHash: 'hash-1' });

/** The context both resolvers read: only `userPayload` (and `providers`, for RunAIPrompt). */
function context(userPayload: UserPayload): AppContext {
  const partial: Pick<AppContext, 'userPayload' | 'providers'> = { userPayload, providers: [] };
  return partial as AppContext;
}

interface RunArgs {
  State?: string;
  Questions?: string;
  PromptID?: string;
  PromptName?: string;
  TimeoutMS?: number;
  Payload?: UserPayload;
}

const runDecision = (args: RunArgs = {}) =>
  new RunDecisionResolver().RunDecision(
    args.State ?? 'A customer asks why the invoice total changed this month.',
    args.Questions ?? JSON.stringify(QUESTIONS),
    context(args.Payload ?? sessionPayload()),
    args.PromptID,
    args.PromptName,
    args.TimeoutMS
  );

/** The scope-check calls, without the `full_access` fast-path probe that precedes each one. */
const scopeCalls = () => mockAuthorize.mock.calls.filter(call => call[2] !== 'full_access');

/** The resources the scope checks were made against, in order. */
const checkedResources = () => scopeCalls().map(call => call[3]);

/**
 * An API key allowed `prompt:execute` on every prompt except the resources given, as a broad allow
 * plus a Deny rule on each would have it. It has no `full_access`.
 */
const allowPromptsExcept = (...denied: string[]) =>
  mockAuthorize.mockImplementation(async (_hash, _app, scope, resource) => {
    const allowed = scope === 'prompt:execute' && !denied.includes(resource);
    return { Allowed: allowed, Reason: allowed ? 'Allowed' : 'Denied by a rule' };
  });

let executeDecision: MockInstance<AIDecisionRunner['ExecuteDecision']>;
const sentParams = (): AIDecisionParams => executeDecision.mock.calls[0][0];

beforeEach(() => {
  vi.restoreAllMocks();
  mockAuthorize.mockReset();
  stubEngine([DEFAULT_PROMPT, ROUTING_PROMPT, CHAT_PROMPT, UNTYPED_PROMPT, INACTIVE_PROMPT]);
  vi.spyOn(UserCache.prototype, 'GetSystemUser').mockReturnValue(SYSTEM_USER);
  executeDecision = vi.spyOn(AIDecisionRunner.prototype, 'ExecuteDecision').mockResolvedValue(successResult());
});

// ─── Prompt resolution ───────────────────────────────────────────────────────

describe('RunDecision: prompt resolution', () => {
  it('uses the Default Decision prompt when the caller names none', async () => {
    const result = await runDecision();

    expect(result.success).toBe(true);
    expect(sentParams().prompt).toBe(DEFAULT_PROMPT);
  });

  it('resolves a prompt by ID', async () => {
    const result = await runDecision({ PromptID: 'PROMPT-ROUTING' });

    expect(result.success).toBe(true);
    expect(sentParams().prompt).toBe(ROUTING_PROMPT);
  });

  it('resolves a prompt by name, ignoring case and surrounding space', async () => {
    const result = await runDecision({ PromptName: '  route message ' });

    expect(result.success).toBe(true);
    expect(sentParams().prompt).toBe(ROUTING_PROMPT);
  });

  it('prefers the ID when both an ID and a name are given', async () => {
    await runDecision({ PromptID: ROUTING_PROMPT.ID, PromptName: 'Default Decision' });

    expect(sentParams().prompt).toBe(ROUTING_PROMPT);
  });

  it('fails without running when the prompt is not found', async () => {
    const byId = await runDecision({ PromptID: 'prompt-missing' });
    const byName = await runDecision({ PromptName: 'No Such Prompt' });

    expect(byId).toMatchObject({ success: false, errorMessage: 'AI Prompt with ID prompt-missing not found' });
    expect(byName).toMatchObject({ success: false, errorMessage: "AI Prompt 'No Such Prompt' not found" });
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('rejects a prompt whose AI model type is not Decision', async () => {
    const result = await runDecision({ PromptID: CHAT_PROMPT.ID });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("AI Prompt 'Summarize Text' is not a Decision prompt: its AI model type must be 'Decision'");
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('rejects a prompt with no AI model type', async () => {
    const result = await runDecision({ PromptName: 'Untyped Prompt' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('is not a Decision prompt');
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('rejects an inactive prompt', async () => {
    const result = await runDecision({ PromptID: INACTIVE_PROMPT.ID });

    expect(result).toMatchObject({ success: false, errorMessage: "AI Prompt 'Retired Decision' is not active (Status: Disabled)" });
    expect(executeDecision).not.toHaveBeenCalled();
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe('RunDecision: input validation', () => {
  it('rejects questions that are not valid JSON', async () => {
    const result = await runDecision({ Questions: '{ route: ' });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/^Questions JSON parsing failed: /);
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('rejects a question of an unknown Kind, with the Run Decision action\'s message', async () => {
    const questions = JSON.stringify({ urgent: { Kind: 'YesNo', Instructions: 'Is this urgent?' } });

    const result = await runDecision({ Questions: questions });

    expect(result).toMatchObject({
      success: false,
      errorMessage: "Question 'urgent' must have a known Kind ('Likelihood', 'Choice', or 'Score')",
    });
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('rejects a Choice question without an Options array', async () => {
    const questions = JSON.stringify({ route: { Kind: 'Choice', Instructions: 'Which agent?' } });

    const result = await runDecision({ Questions: questions });

    expect(result).toMatchObject({ success: false, errorMessage: "Question 'route' of Kind 'Choice' must have an Options array" });
  });

  it('rejects an empty question map', async () => {
    const result = await runDecision({ Questions: '{}' });

    expect(result).toMatchObject({ success: false, errorMessage: 'Questions object must have at least one question' });
  });

  it('rejects an empty state and an empty state object', async () => {
    const blank = await runDecision({ State: '   ' });
    const emptyObject = await runDecision({ State: '{}' });

    expect(blank).toMatchObject({ success: false, errorMessage: 'State is required and cannot be empty' });
    expect(emptyObject).toMatchObject({ success: false, errorMessage: 'State object cannot be empty' });
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('passes the JSON text of an object as an object', async () => {
    await runDecision({ State: '{"message": "Show me last quarter\'s renewals", "channel": "chat"}' });

    expect(sentParams().State).toEqual({ message: "Show me last quarter's renewals", channel: 'chat' });
  });

  it('passes any other text as text, including JSON that is not an object', async () => {
    await runDecision({ State: '  Please cancel my order.  ' });
    const text = sentParams().State;
    executeDecision.mockClear();
    await runDecision({ State: '["not", "an", "object"]' });

    expect(text).toBe('Please cancel my order.');
    expect(sentParams().State).toBe('["not", "an", "object"]');
  });

  it('passes the validated questions, the timeout and the caller to the runner', async () => {
    await runDecision({ TimeoutMS: 250 });

    const params = sentParams();
    expect(params.Questions).toEqual(QUESTIONS);
    expect(params.timeoutMS).toBe(250);
    expect(params.contextUser).toBe(USER);
  });

  it('leaves the timeout unset when the caller gives none', async () => {
    await runDecision();

    expect(sentParams().timeoutMS).toBeUndefined();
  });
});

// ─── Result mapping ──────────────────────────────────────────────────────────

describe('RunDecision: result mapping', () => {
  it('maps a successful run: the answers as JSON, the prompt run, the model and the elapsed time', async () => {
    const result = await runDecision();

    expect(result.success).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    expect(JSON.parse(result.answersJSON ?? '')).toEqual(ANSWERS);
    expect(result.promptRunId).toBe('run-1');
    expect(result.modelName).toBe('Jev');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('maps a failed run to success: false, keeping the prompt run and the model but sending no answers', async () => {
    executeDecision.mockResolvedValue(failedResult());

    const result = await runDecision();

    expect(result).toMatchObject({
      success: false,
      errorMessage: 'No Decision model has credentials available',
      promptRunId: 'run-1',
      modelName: 'Jev',
    });
    expect(result.answersJSON).toBeUndefined();
  });

  it('gives a failed run with no message a generic one', async () => {
    executeDecision.mockResolvedValue({ ...failedResult(), errorMessage: undefined });

    const result = await runDecision();

    expect(result).toMatchObject({ success: false, errorMessage: 'Decision execution failed' });
  });

  it('returns an unexpected error as success: false instead of throwing', async () => {
    executeDecision.mockRejectedValue(new Error('connection reset'));

    const result = await runDecision();

    expect(result).toMatchObject({ success: false, errorMessage: 'connection reset' });
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('fails when the caller cannot be resolved to a user', async () => {
    const result = await runDecision({ Payload: { email: 'nobody@example.com', userRecord: undefined, sessionId: 's-2' } });

    expect(result).toMatchObject({ success: false, errorMessage: 'Unable to determine current user' });
    expect(executeDecision).not.toHaveBeenCalled();
  });
});

// ─── Authorization: the same gate as RunAIPrompt ────────────────────────────

describe('RunDecision: authorization mirrors RunAIPrompt', () => {
  it('rejects an API key without the prompt:execute scope, with the same checks and message as RunAIPrompt', async () => {
    mockAuthorize.mockResolvedValue({ Allowed: false, Reason: 'No rule grants this scope' });

    const decision = await runDecision({ PromptID: DEFAULT_PROMPT.ID, Payload: apiKeyPayload() });
    const decisionChecks = [...mockAuthorize.mock.calls];
    mockAuthorize.mockClear();
    const promptRun = new RunAIPromptResolver().RunAIPrompt(DEFAULT_PROMPT.ID, context(apiKeyPayload()));

    // The same denial. RunAIPrompt throws it; RunDecision returns it, because it never throws.
    expect(decision.success).toBe(false);
    expect(decision.errorMessage).toContain("Access denied. This API key requires the 'prompt:execute' scope for resource 'prompt-default'");
    await expect(promptRun).rejects.toThrow(decision.errorMessage);
    // The same engine calls, argument for argument: the full_access probe, then prompt:execute on the prompt.
    expect(decisionChecks).toEqual(mockAuthorize.mock.calls);
    expect(decisionChecks.map(call => call[2])).toEqual(['full_access', 'prompt:execute']);
    // And nothing ran.
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('runs for an API key that has the scope, checking the prompt the caller named', async () => {
    mockAuthorize.mockImplementation(async (_hash, _app, scope) =>
      ({ Allowed: scope === 'prompt:execute', Reason: scope === 'prompt:execute' ? 'Allowed' : 'No full access' }));

    const result = await runDecision({ PromptID: ROUTING_PROMPT.ID, Payload: apiKeyPayload() });

    expect(result.success).toBe(true);
    expect(scopeCalls()).toHaveLength(1);
    expect(scopeCalls()[0].slice(0, 5)).toEqual(['hash-1', 'MJAPI', 'prompt:execute', 'prompt-routing', SYSTEM_USER]);
  });

  it('checks the ID of the prompt that runs, however the caller named it', async () => {
    allowPromptsExcept();

    await runDecision({ PromptName: 'route MESSAGE', Payload: apiKeyPayload() });
    await runDecision({ PromptID: 'PROMPT-ROUTING', Payload: apiKeyPayload() });
    await runDecision({ Payload: apiKeyPayload() });

    expect(checkedResources()).toEqual(['prompt-routing', 'prompt-routing', 'prompt-default']);
    expect(executeDecision).toHaveBeenCalledTimes(3);
  });

  it('refuses a caller denied a prompt by its ID when it names that prompt by name', async () => {
    allowPromptsExcept(ROUTING_PROMPT.ID);

    const byName = await runDecision({ PromptName: 'Route Message', Payload: apiKeyPayload() });
    const byId = await runDecision({ PromptID: ROUTING_PROMPT.ID, Payload: apiKeyPayload() });
    const another = await runDecision({ PromptName: 'Default Decision', Payload: apiKeyPayload() });

    expect(byName.success).toBe(false);
    expect(byName.errorMessage).toContain("Access denied. This API key requires the 'prompt:execute' scope for resource 'prompt-routing'");
    expect(byId).toMatchObject({ success: false, errorMessage: byName.errorMessage });
    // The rule is on the one prompt: another still runs, and it is the only one that did.
    expect(another.success).toBe(true);
    expect(executeDecision).toHaveBeenCalledTimes(1);
    expect(sentParams().prompt).toBe(DEFAULT_PROMPT);
  });

  it('checks a prompt that is not found against the value the caller sent, and says it is missing only once allowed', async () => {
    mockAuthorize.mockResolvedValue({ Allowed: false, Reason: 'Denied' });

    const deniedByName = await runDecision({ PromptName: 'No Such Prompt', Payload: apiKeyPayload() });
    const deniedById = await runDecision({ PromptID: 'prompt-missing', Payload: apiKeyPayload() });

    expect(checkedResources()).toEqual(['No Such Prompt', 'prompt-missing']);
    for (const denied of [deniedByName, deniedById]) {
      expect(denied.success).toBe(false);
      expect(denied.errorMessage).toContain('Access denied');
      expect(denied.errorMessage).not.toContain('not found');
    }

    mockAuthorize.mockClear();
    allowPromptsExcept();
    const allowed = await runDecision({ PromptName: 'No Such Prompt', Payload: apiKeyPayload() });

    expect(checkedResources()).toEqual(['No Such Prompt']);
    expect(allowed).toMatchObject({ success: false, errorMessage: "AI Prompt 'No Such Prompt' not found" });
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('checks a prompt that appears only once the engine loads by its ID too, so a cold cache cannot be passed by name', async () => {
    let loaded = false;
    vi.spyOn(AIEngine.prototype, 'Config').mockImplementation(async () => {
      loaded = true;
    });
    vi.spyOn(AIEngine.prototype, 'Prompts', 'get').mockImplementation(() => (loaded ? [DEFAULT_PROMPT, ROUTING_PROMPT] : []));
    allowPromptsExcept(ROUTING_PROMPT.ID);

    const denied = await runDecision({ PromptName: 'Route Message', Payload: apiKeyPayload() });

    expect(checkedResources()).toEqual(['Route Message', 'prompt-routing']);
    expect(denied.success).toBe(false);
    expect(denied.errorMessage).toContain("scope for resource 'prompt-routing'");
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('treats a prompt cache that cannot be read as not found until the caller is authorized', async () => {
    vi.spyOn(AIEngine.prototype, 'Prompts', 'get').mockImplementation(() => {
      throw new Error('AIEngine cannot read MJ: AI Prompts');
    });
    mockAuthorize.mockResolvedValue({ Allowed: false, Reason: 'Denied' });

    const denied = await runDecision({ PromptName: 'Route Message', Payload: apiKeyPayload() });
    mockAuthorize.mockClear();
    allowPromptsExcept();
    const allowed = await runDecision({ PromptName: 'Route Message', Payload: apiKeyPayload() });

    // Denied, the caller hears only the denial; allowed, it hears why the prompt cannot be read.
    expect(denied.errorMessage).toContain('Access denied');
    expect(denied.errorMessage).not.toContain('cannot read');
    expect(allowed).toMatchObject({ success: false, errorMessage: 'AIEngine cannot read MJ: AI Prompts' });
    expect(executeDecision).not.toHaveBeenCalled();
  });

  it('checks before anything else, so a denied caller learns nothing about the prompt or the input', async () => {
    mockAuthorize.mockResolvedValue({ Allowed: false, Reason: 'Denied' });

    const result = await runDecision({ PromptID: 'prompt-missing', Questions: 'not json', Payload: apiKeyPayload() });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Access denied');
  });

  it('skips the scope check for a session without an API key, as RunAIPrompt does', async () => {
    const result = await runDecision({ Payload: sessionPayload() });

    expect(result.success).toBe(true);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });
});
