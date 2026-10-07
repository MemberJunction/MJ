/**
 * openai-decisions.checks.ts — the 'openai-decisions' bundle (OD1–OD7): OpenAI's GPT-6 Luna Decisions
 * model (`gpt-6-luna` on OpenAI's Decisions API, public beta), from the synced metadata through
 * `AIDecisionRunner` to the request each route would send, with no network.
 *
 * WHAT IT PROVES, against this database's metadata:
 *   OD1  the synced catalog: `GPT-6 Luna Decisions` is an Active `Decision` model, separate from the
 *        `GPT-6 Luna` LLM, with no Decision limits (OpenAI documents none); an OpenAI Model Developer
 *        row; an OpenAI Inference Provider row naming `OpenAIDecision` and `gpt-6-luna`, preferred over an
 *        OpenRouter Inference Provider row naming `OpenRouterDecision` and the pinned
 *        `openai/gpt-6-luna-decisions-20261006` with a 1,050,000-token context; and an active input-token
 *        cost row on each vendor at $0.10 per million, output free.
 *   OD2  `ClassFactory.CreateInstance(BaseDecision, 'OpenAIDecision', key)` builds the shipped driver
 *        (the bundle's guard, a subclass of it, sits on top), which reads a credential's endpoint.
 *   OD3  a real `AIDecisionRunner.ExecuteDecision` with `override` naming the model on OpenAI sends the
 *        Decisions API request (an ordered, named question array: predicate, choices, levels; the state
 *        as `input`) with the key as the bearer, maps the answers from OpenAI's array shapes (Choice
 *        renormalised, Score keyed by level label), and records the run against the model and OpenAI,
 *        priced from the cost row because the response carries no cost.
 *   OD4  the same through OpenRouter: `OpenRouterDecision` sends the System One request with the pinned
 *        model, maps the answers OpenRouter returned in a live call, and records OpenRouter's cost.
 *   OD5  a refusal on the first candidate fails over: OpenAI declines one question, the attempt fails
 *        with an error that names it, and the run answers through the model's OpenRouter row.
 *   OD6  a real `API Key` credential, created through `CredentialEngine` and bound to the model's OpenAI
 *        Inference Provider row (the model also has a Model Developer row on OpenAI), sends its token,
 *        not its JSON, as the bearer.
 *   OD7  `Default Decision`'s selection is unchanged by the new model: Jev, then LLM Decision, then the
 *        power-matched fallbacks, the new model's two rows among them; with no OpenAI decision credential
 *        the runner selects the first of Jev and LLM Decision it has a credential for; with a credential
 *        bound to the model's OpenAI row it is a credentialed candidate still behind both, and the
 *        selection does not change; and with every other decision driver unavailable, the run fails
 *        over to it.
 *
 * NO NETWORK. For the whole bundle, `OpenAIDecision` and `OpenRouterDecision` are replaced by subclasses
 * that override only `SendRequest`, the drivers' one network call: they record each request and answer
 * only while a check arms them, refusing with a 500 otherwise, so nothing can reach api.openai.com or
 * openrouter.ai. OD7 registers the shared scripted decision driver over every decision driver class, as
 * KV4 does. Everything else is real: the prompt, model and vendor rows, candidate selection, credential
 * resolution (legacy `apiKeys` entries, or a bound `MJ: Credentials` row in OD6 and OD7), the drivers' URL,
 * header and body building, the answer mapping, `BaseDecision`'s validation, the failover loop and the
 * run rows.
 *
 * TRANSPORT: SERVER-ONLY by necessity: the guards are ClassFactory registrations in this process.
 *
 * FIXTURES: none seeded; the model is shipped metadata, read only. OD6 and OD7 create a credential and a
 * binding (decision-fixtures.ts) and delete them in a `finally`; Teardown deletes whatever a failed check
 * left, and every prompt run the bundle creates.
 */
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    BaseDecision,
    IsSystemOneWireObject,
    type ChoiceAnswer,
    type DecisionQuestion,
    type LikelihoodAnswer,
    type ScoreAnswer,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { AIDecisionParams, AIDecisionRunner, type AIDecisionRunResult, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { OpenAIDecision } from '@memberjunction/ai-openai';
import { OpenRouterDecision } from '@memberjunction/ai-openrouter';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById } from './agent-live-shared';
import { RegisterScriptedDecision, ScriptedDecision, SCRIPTED_DECISION_DRIVER_CLASSES, UnavailableDecision } from './decision-test-double';
import {
    DecisionFixtures,
    DecisionRunnerProbe,
    ReadDecisionPromptRun,
    RegisterDecisionStandIn,
    RequireDecisionModel,
    RequireDefaultDecisionPrompt,
    RequireInferenceRowID,
    RequireVendorID,
} from './decision-fixtures';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const MODEL_NAME = 'GPT-6 Luna Decisions';
const LLM_MODEL_NAME = 'GPT-6 Luna';
const OPENAI_VENDOR = 'OpenAI';
const OPENROUTER_VENDOR = 'OpenRouter';
const OPENAI_DRIVER = 'OpenAIDecision';
const OPENROUTER_DRIVER = 'OpenRouterDecision';
const OPENAI_API_NAME = 'gpt-6-luna';
const OPENROUTER_API_NAME = 'openai/gpt-6-luna-decisions-20261006';
const OPENROUTER_MAX_INPUT_TOKENS = 1_050_000;
const POWER_RANK = 57;
const INPUT_PRICE_PER_MILLION = 0.1;

/** Fake keys: never sent anywhere, the guards answer instead. */
const OPENAI_TOKEN = 'it-openai-decisions-token-no-network';
const OPENROUTER_TOKEN = 'it-openrouter-token-no-network';

const STATE = 'Checkout has been failing for every customer for the last hour.';

const QUESTIONS: Record<string, DecisionQuestion> = {
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

/** The Decisions API questions `OpenAIDecision` must send for {@link QUESTIONS}: ordered, named by key. */
const EXPECTED_OPENAI_QUESTIONS = [
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

/** The System One questions `OpenRouterDecision` must send for {@link QUESTIONS}. */
const EXPECTED_SYSTEMONE_QUESTIONS = {
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
    severity: { type: 'score', instructions: 'How severe is the customer impact?', criteria: ['No impact', 'Minor', 'Major', 'Critical'] },
};

/** The input tokens the scripted OpenAI response reports: the run's cost is these at the input price. */
const SCRIPTED_INPUT_TOKENS = 1000;

/**
 * An OpenAI Decisions response in the shapes openai-node 7.30.0 types (`Decision`): answers in question
 * order, named, with array probabilities. The Choice's sum to 0.98; the Score's levels are valued 0 to 3.
 */
function scriptedOpenAIResponse(answers: unknown[] = SCRIPTED_OPENAI_ANSWERS): Record<string, unknown> {
    return {
        model: OPENAI_API_NAME,
        answers,
        usage: {
            input_tokens: SCRIPTED_INPUT_TOKENS,
            input_tokens_details: { cache_write_tokens: 0, cached_tokens: 0 },
            output_tokens: 0,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: SCRIPTED_INPUT_TOKENS,
        },
    };
}

const SCRIPTED_OPENAI_ANSWERS: unknown[] = [
    { type: 'predicate', name: 'urgent', probability: 0.91 },
    {
        type: 'choice',
        name: 'team',
        choice: 'technical',
        confidence: 0.9,
        probabilities: [
            { value: 'billing', probability: 0.02 },
            { value: 'technical', probability: 0.95 },
            { value: 'sales', probability: 0.01 },
        ],
    },
    {
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
    },
];

/** OpenAI declining the Choice question, as openai-node 7.30.0 types a refusal. */
const REFUSED_TEAM_ANSWERS: unknown[] = [SCRIPTED_OPENAI_ANSWERS[0], { type: 'refusal', name: 'team' }, SCRIPTED_OPENAI_ANSWERS[2]];

/** The error a refusal of the Choice question fails the attempt with. */
const REFUSAL_ERROR = "Question 'team': OpenAI declined to answer it (refusal)";

/** The tokens and cost OpenRouter reported in the live call below. */
const OPENROUTER_INPUT_TOKENS = 406;
const OPENROUTER_REPORTED_COST = 0.0000406;

/**
 * What OpenRouter's Decisions API answered for {@link QUESTIONS} on openai/gpt-6-luna-decisions-20261006
 * in a live call on October 7, 2026 (HTTP 200 in 0.44 s), served by OpenAI.
 */
const LIVE_OPENROUTER_RESPONSE = {
    model: OPENROUTER_API_NAME,
    answers: {
        urgent: { type: 'noul', noul: 0.99 },
        team: { type: 'choice', choice: 'technical', probabilities: { billing: 0, technical: 1, sales: 0 }, confidence: 1 },
        severity: {
            type: 'score',
            score: 2.97,
            legend: { '0': 'No impact', '1': 'Minor', '2': 'Major', '3': 'Critical' },
            probabilities: { '0': 0, '1': 0, '2': 0.03, '3': 0.97 },
            confidence: 0.97,
        },
    },
    usage: { input_tokens: OPENROUTER_INPUT_TOKENS, output_tokens: 0, cost: OPENROUTER_REPORTED_COST },
    id: 'gen-dec-it-gpt-6-luna-decisions',
    provider: 'OpenAI',
};

// ─── The guards ──────────────────────────────────────────────────────────────────────────────────

/** One request a guard received. */
interface GuardedRequest {
    Url: string;
    Authorization: string | null;
    Body: unknown;
}

/** How an armed guard answers a request. */
type Responder = (request: GuardedRequest) => Response;

/** What one guard was sent, and how it answers; undefined `Respond` refuses. Module state, because the runner builds its own drivers. */
interface GuardState {
    Requests: GuardedRequest[];
    Respond: Responder | undefined;
}

const openAIGuard: GuardState = { Requests: [], Respond: undefined };
const openRouterGuard: GuardState = { Requests: [], Respond: undefined };

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Records the request; answers as the guard is armed to, or refuses with a 500. Never calls the network. */
function guardedSend(guard: GuardState, service: string, url: string, init: RequestInit): Response {
    const body: unknown = JSON.parse(String(init.body));
    const request: GuardedRequest = { Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: body };
    guard.Requests.push(request);
    return guard.Respond
        ? guard.Respond(request)
        : jsonResponse(500, { error: { message: `The integration-test ${service} guard is not armed: no request leaves this process` } });
}

/** The real `OpenAIDecision` with only its network call replaced by the guard. */
class GuardedOpenAIDecision extends OpenAIDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return guardedSend(openAIGuard, 'OpenAI', url, init);
    }
}

/** The real `OpenRouterDecision` with only its network call replaced by the guard. */
class GuardedOpenRouterDecision extends OpenRouterDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return guardedSend(openRouterGuard, 'OpenRouter', url, init);
    }
}

/** Arms the guards with the given responders for the length of `work`, then disarms both. */
async function withGuardsArmed(responders: { OpenAI?: Responder; OpenRouter?: Responder }, work: () => Promise<void>): Promise<void> {
    openAIGuard.Respond = responders.OpenAI;
    openRouterGuard.Respond = responders.OpenRouter;
    try {
        await work();
    } finally {
        openAIGuard.Respond = undefined;
        openRouterGuard.Respond = undefined;
    }
}

const answerAsOpenAI: Responder = () => jsonResponse(200, scriptedOpenAIResponse());
const answerAsOpenRouter: Responder = () => jsonResponse(200, LIVE_OPENROUTER_RESPONSE);

// ─── Lookups and assertions ──────────────────────────────────────────────────────────────────────

/** The prompt runs OD3 and OD4 created, deleted in Teardown. */
const createdPromptRunIDs: string[] = [];

/** What Setup changed for the bundle, undone in Teardown. */
const bundleRestores: Array<() => void> = [];

function requireModel(): MJAIModelEntityExtended {
    return RequireDecisionModel(MODEL_NAME);
}

function assertClose(actual: number | null | undefined, expected: number, message: string): void {
    Assert(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9, `${message} — expected ${expected}, got ${String(actual)}`);
}

/** The model's model-vendor rows on one vendor, of one type. */
function rowsOf(model: MJAIModelEntityExtended, vendorName: string, type: MJAIModelVendorEntity['Type']): MJAIModelVendorEntity[] {
    const vendorId = RequireVendorID(vendorName);
    return AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Type === type);
}

/** A decision request on `prompt` for {@link QUESTIONS}. */
function decisionParams(ctx: IntegrationCheckContext, prompt: MJAIPromptEntityExtended): AIDecisionParams {
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.contextUser = ctx.User;
    params.State = STATE;
    params.Questions = QUESTIONS;
    return params;
}

/** A decision request on `Default Decision` naming the model on `vendorName`. */
function overrideParams(ctx: IntegrationCheckContext, vendorName: string): AIDecisionParams {
    const params = decisionParams(ctx, RequireDefaultDecisionPrompt());
    params.override = { modelId: requireModel().ID, vendorId: RequireVendorID(vendorName) };
    return params;
}

/** Runs one decision, waits for its run row and records it for deletion. */
async function runDecision(runner: AIDecisionRunner, params: AIDecisionParams, track: (id: string | undefined) => void): Promise<AIDecisionRunResult> {
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    track(result.promptRun?.ID);
    return result;
}

function trackForTeardown(id: string | undefined): void {
    if (id) {
        createdPromptRunIDs.push(id);
    }
}

/** Asserts the run succeeded on the model through `vendorName` with `driverClass`. */
function assertAnsweredBy(result: AIDecisionRunResult, vendorName: string, driverClass: string, label: string): void {
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.DriverClass, driverClass, `${label}: answering driver class`);
    AssertEqual(result.modelInfo?.modelName, MODEL_NAME, `${label}: answering model`);
    AssertEqual(result.modelInfo?.vendorName, vendorName, `${label}: answering vendor`);
}

/** Asserts the answers came back mapped from {@link SCRIPTED_OPENAI_ANSWERS}. */
function assertOpenAIAnswers(result: AIDecisionRunResult, label: string): void {
    assertClose((result.Answers['urgent'] as LikelihoodAnswer)?.Probability, 0.91, `${label}: urgent probability`);
    const team = result.Answers['team'] as ChoiceAnswer;
    AssertEqual(team?.Value, 'technical', `${label}: team choice`);
    assertClose(team.Confidence, 0.9, `${label}: team confidence`);
    assertClose(team.Probabilities['technical'], 0.95 / 0.98, `${label}: team probability renormalised`);
    const severity = result.Answers['severity'] as ScoreAnswer;
    assertClose(severity?.Value, 2.7, `${label}: severity score`);
    AssertEqual(JSON.stringify(severity.Probabilities), JSON.stringify({ 'No impact': 0, Minor: 0.05, Major: 0.2, Critical: 0.75 }), `${label}: severity probabilities keyed by level label`);
}

/** Asserts the answers came back mapped from {@link LIVE_OPENROUTER_RESPONSE}. */
function assertOpenRouterAnswers(result: AIDecisionRunResult, label: string): void {
    assertClose((result.Answers['urgent'] as LikelihoodAnswer)?.Probability, 0.99, `${label}: urgent probability`);
    const team = result.Answers['team'] as ChoiceAnswer;
    AssertEqual(team?.Value, 'technical', `${label}: team choice`);
    AssertEqual(JSON.stringify(team.Probabilities), JSON.stringify({ billing: 0, technical: 1, sales: 0 }), `${label}: team probabilities`);
    const severity = result.Answers['severity'] as ScoreAnswer;
    assertClose(severity?.Value, 2.97, `${label}: severity score`);
    AssertEqual(JSON.stringify(severity.Probabilities), JSON.stringify({ 'No impact': 0, Minor: 0, Major: 0.03, Critical: 0.97 }), `${label}: severity probabilities keyed by level`);
}

/** Asserts one request reached the OpenAI guard since `before`, with `token` as the bearer and the Decisions body. */
function assertOpenAIRequest(before: number, token: string, label: string): void {
    AssertEqual(openAIGuard.Requests.length - before, 1, `${label}: OpenAI requests`);
    const sent = openAIGuard.Requests[openAIGuard.Requests.length - 1];
    AssertEqual(sent.Url, OpenAIDecision.DEFAULT_ENDPOINT, `${label}: request URL`);
    AssertEqual(sent.Authorization, `Bearer ${token}`, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(sent.Body), JSON.stringify({ model: OPENAI_API_NAME, input: STATE, questions: EXPECTED_OPENAI_QUESTIONS }), `${label}: request body`);
}

/** Asserts the run row names the model and `vendorName`, succeeded, and has the given tokens and cost. */
async function assertRunRow(ctx: IntegrationCheckContext, result: AIDecisionRunResult, vendorName: string, tokens: number, cost: number, label: string): Promise<void> {
    Assert(!!result.promptRun?.ID, `${label}: no prompt run`);
    const row = await ReadDecisionPromptRun(ctx, result.promptRun!.ID);
    Assert(!!row, `${label}: prompt run ${result.promptRun!.ID} was not found`);
    Assert(UUIDsEqual(row!.PromptID, RequireDefaultDecisionPrompt().ID), `${label}: the run's prompt is not Default Decision`);
    Assert(UUIDsEqual(row!.ModelID, requireModel().ID), `${label}: run model ${row!.ModelID} is not ${MODEL_NAME}`);
    Assert(!!row!.VendorID && UUIDsEqual(row!.VendorID, RequireVendorID(vendorName)), `${label}: run vendor ${String(row!.VendorID)} is not ${vendorName}`);
    AssertEqual(row!.Success, true, `${label}: run Success`);
    AssertEqual(row!.TokensPrompt, tokens, `${label}: run TokensPrompt`);
    // The column keeps 8 decimal places.
    Assert(typeof row!.Cost === 'number' && Math.abs(row!.Cost - cost) < 1e-8, `${label}: run Cost — expected ${cost} to 8 places, got ${String(row!.Cost)}`);
    const recorded: unknown = JSON.parse(row!.Result ?? '{}');
    Assert(IsSystemOneWireObject(recorded) && IsSystemOneWireObject(recorded['team']) && recorded['team']['Value'] === 'technical', `${label}: the run's Result does not hold the mapped answers`);
}

// ─── OD1: the catalog ────────────────────────────────────────────────────────────────────────────

function checkCatalog(): void {
    const model = requireModel();
    AssertEqual(model.IsActive, true, 'OD1: IsActive');
    AssertEqual(model.AIModelType, 'Decision', 'OD1: model type');
    AssertEqual(model.PowerRank, POWER_RANK, 'OD1: PowerRank');
    const llm = AIEngine.Instance.Models.find(m => m.Name === LLM_MODEL_NAME);
    Assert(!!llm && llm.AIModelType === 'LLM' && !UUIDsEqual(llm.ID, model.ID), `OD1: the '${LLM_MODEL_NAME}' LLM is not a separate LLM model`);
    AssertEqual(AIEngine.Instance.Models.filter(m => m.Name === MODEL_NAME).length, 1, 'OD1: models by that name');

    AssertEqual(rowsOf(model, OPENAI_VENDOR, 'Model Developer').length, 1, 'OD1: OpenAI Model Developer rows');
    const openAIRows = rowsOf(model, OPENAI_VENDOR, 'Inference Provider');
    const openRouterRows = rowsOf(model, OPENROUTER_VENDOR, 'Inference Provider');
    AssertEqual(openAIRows.length, 1, 'OD1: OpenAI Inference Provider rows');
    AssertEqual(openRouterRows.length, 1, 'OD1: OpenRouter Inference Provider rows');
    assertInferenceRow(openAIRows[0], OPENAI_DRIVER, OPENAI_API_NAME, null, 'OD1 OpenAI row');
    assertInferenceRow(openRouterRows[0], OPENROUTER_DRIVER, OPENROUTER_API_NAME, OPENROUTER_MAX_INPUT_TOKENS, 'OD1 OpenRouter row');
    Assert(openAIRows[0].Priority > openRouterRows[0].Priority, `OD1: the OpenAI row's priority ${openAIRows[0].Priority} is not above OpenRouter's ${openRouterRows[0].Priority}`);

    for (const row of [...openAIRows, ...openRouterRows]) {
        const limits = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, row.ID)?.Decision;
        AssertEqual(JSON.stringify(limits ?? null), 'null', `OD1: Decision limits on the ${row.Vendor} row (OpenAI documents none)`);
    }
    for (const vendor of [OPENAI_VENDOR, OPENROUTER_VENDOR]) {
        const cost = AIEngine.Instance.GetActiveModelCost(model.ID, RequireVendorID(vendor), 'Realtime');
        Assert(!!cost, `OD1: no active Realtime cost row on ${vendor}`);
        assertClose(cost!.InputPricePerUnit, INPUT_PRICE_PER_MILLION, `OD1 ${vendor}: input price per unit`);
        assertClose(cost!.OutputPricePerUnit, 0, `OD1 ${vendor}: output price per unit`);
        AssertEqual(cost!.UnitType, 'Per 1M Tokens', `OD1 ${vendor}: cost unit type`);
    }
    const vendor = AIEngine.Instance.Vendors.find(v => v.Name === OPENAI_VENDOR);
    AssertEqual(vendor?.CredentialType, 'API Key', 'OD1: the OpenAI vendor credential type');
}

function assertInferenceRow(row: MJAIModelVendorEntity, driverClass: string, apiName: string, maxInputTokens: number | null, label: string): void {
    AssertEqual(row.Status, 'Active', `${label}: status`);
    AssertEqual(row.DriverClass, driverClass, `${label}: DriverClass`);
    AssertEqual(row.APIName, apiName, `${label}: APIName`);
    AssertEqual(row.MaxInputTokens, maxInputTokens, `${label}: MaxInputTokens`);
    AssertEqual(row.SupportsStreaming, false, `${label}: SupportsStreaming`);
}

// ─── OD2: the driver through the ClassFactory ────────────────────────────────────────────────────

function checkClassFactory(): void {
    // At least one: a stand-in's restore (IT97, KV4) registers the shipped class again, above the stand-in.
    const shipped = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseDecision, OPENAI_DRIVER).filter(r => r.SubClass === OpenAIDecision);
    Assert(shipped.length > 0, "OD2: the shipped OpenAIDecision is not registered under 'OpenAIDecision'");
    const credential = JSON.stringify({ apiKey: OPENAI_TOKEN, endpoint: 'https://gateway.example.test/openai/v1' });
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, OPENAI_DRIVER, credential);
    if (!(driver instanceof OpenAIDecision)) {
        throw new Error(`OD2: the factory built ${driver?.constructor?.name ?? 'nothing'}, not an OpenAIDecision`);
    }
    AssertEqual(driver.constructor, GuardedOpenAIDecision, "OD2: the bundle's guard, a subclass of the shipped driver, is on top");
    AssertEqual(driver.EndpointURL, 'https://gateway.example.test/openai/v1/decisions', "OD2: endpoint from the credential's JSON");
    AssertEqual(new OpenAIDecision(OPENAI_TOKEN).EndpointURL, 'https://api.openai.com/v1/decisions', 'OD2: the default endpoint');
}

// ─── OD3–OD6: the runner ─────────────────────────────────────────────────────────────────────────

async function checkThroughOpenAI(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const params = overrideParams(ctx, OPENAI_VENDOR);
    params.apiKeys = [{ driverClass: OPENAI_DRIVER, apiKey: OPENAI_TOKEN }];
    await withGuardsArmed({ OpenAI: answerAsOpenAI }, async () => {
        const before = openAIGuard.Requests.length;
        const openRouterBefore = openRouterGuard.Requests.length;
        const result = await runDecision(new AIDecisionRunner(), params, trackForTeardown);
        assertAnsweredBy(result, OPENAI_VENDOR, OPENAI_DRIVER, 'OD3');
        assertOpenAIRequest(before, OPENAI_TOKEN, 'OD3');
        AssertEqual(openRouterGuard.Requests.length - openRouterBefore, 0, 'OD3: OpenRouter requests');
        assertOpenAIAnswers(result, 'OD3');
        AssertEqual(result.DecisionResult?.ResolvedModel, OPENAI_API_NAME, 'OD3: resolved model');
        // OpenAI's response carries no cost, so the run is priced from the model's OpenAI cost row.
        await assertRunRow(ctx, result, OPENAI_VENDOR, SCRIPTED_INPUT_TOKENS, (SCRIPTED_INPUT_TOKENS * INPUT_PRICE_PER_MILLION) / 1_000_000, 'OD3');
    });
}

async function checkThroughOpenRouter(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const params = overrideParams(ctx, OPENROUTER_VENDOR);
    params.apiKeys = [{ driverClass: OPENROUTER_DRIVER, apiKey: OPENROUTER_TOKEN }];
    await withGuardsArmed({ OpenRouter: answerAsOpenRouter }, async () => {
        const before = openRouterGuard.Requests.length;
        const result = await runDecision(new AIDecisionRunner(), params, trackForTeardown);
        assertAnsweredBy(result, OPENROUTER_VENDOR, OPENROUTER_DRIVER, 'OD4');
        AssertEqual(openRouterGuard.Requests.length - before, 1, 'OD4: OpenRouter requests');
        const sent = openRouterGuard.Requests[openRouterGuard.Requests.length - 1];
        AssertEqual(sent.Url, OpenRouterDecision.DEFAULT_ENDPOINT, 'OD4: request URL');
        AssertEqual(sent.Authorization, `Bearer ${OPENROUTER_TOKEN}`, 'OD4: Authorization header');
        AssertEqual(JSON.stringify(sent.Body), JSON.stringify({ model: OPENROUTER_API_NAME, state: STATE, questions: EXPECTED_SYSTEMONE_QUESTIONS }), 'OD4: request body');
        assertOpenRouterAnswers(result, 'OD4');
        AssertEqual(result.DecisionResult?.ResolvedModel, OPENROUTER_API_NAME, 'OD4: resolved model');
        assertClose(result.cost, OPENROUTER_REPORTED_COST, 'OD4: the cost OpenRouter reported');
        await assertRunRow(ctx, result, OPENROUTER_VENDOR, OPENROUTER_INPUT_TOKENS, OPENROUTER_REPORTED_COST, 'OD4');
    });
}

async function checkRefusalFailsOver(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'od5');
    const params = overrideParams(ctx, OPENAI_VENDOR);
    params.apiKeys = [{ driverClass: OPENAI_DRIVER, apiKey: OPENAI_TOKEN }, { driverClass: OPENROUTER_DRIVER, apiKey: OPENROUTER_TOKEN }];
    const probe = new DecisionRunnerProbe();
    try {
        const candidates = probe.Candidates(RequireDefaultDecisionPrompt(), params);
        AssertEqual(candidates.map(describeCandidate).join(', '), `${MODEL_NAME} / ${OPENAI_VENDOR} / ${OPENAI_DRIVER}, ${MODEL_NAME} / ${OPENROUTER_VENDOR} / ${OPENROUTER_DRIVER}`, 'OD5: the candidates');
        await withGuardsArmed({ OpenAI: () => jsonResponse(200, scriptedOpenAIResponse(REFUSED_TEAM_ANSWERS)), OpenRouter: answerAsOpenRouter }, async () => {
            const counts = { OpenAI: openAIGuard.Requests.length, OpenRouter: openRouterGuard.Requests.length };
            const result = await runDecision(probe, params, id => fixtures.TrackPromptRun(id));
            AssertEqual(openAIGuard.Requests.length - counts.OpenAI, 1, 'OD5: OpenAI requests');
            AssertEqual(openRouterGuard.Requests.length - counts.OpenRouter, 1, 'OD5: OpenRouter requests');
            assertAnsweredBy(result, OPENROUTER_VENDOR, OPENROUTER_DRIVER, 'OD5');
            assertOpenRouterAnswers(result, 'OD5');
            AssertEqual(probe.Attempts.length, 1, 'OD5: failed attempts before OpenRouter answered');
            const attempt = probe.Attempts[0];
            Assert(UUIDsEqual(attempt.Attempt.modelId, requireModel().ID) && UUIDsEqual(attempt.Attempt.vendorId ?? '', RequireVendorID(OPENAI_VENDOR)), 'OD5: the failed attempt was not the model on OpenAI');
            AssertEqual(attempt.Attempt.error.message, REFUSAL_ERROR, "OD5: the refused attempt's error");
            AssertEqual(attempt.WillRetry, true, 'OD5: the refusal allowed failover');
            const row = await ReadDecisionPromptRun(ctx, result.promptRun?.ID ?? '');
            AssertEqual(row?.Success, true, 'OD5: run Success');
        });
    } finally {
        await fixtures.Cleanup();
    }
}

const OD6_TOKEN = 'it-od6-openai-bound-token';

async function checkBoundCredential(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'od6');
    try {
        const params = overrideParams(ctx, OPENAI_VENDOR);
        const prompt = RequireDefaultDecisionPrompt();
        const probe = new DecisionRunnerProbe();
        const unbound = probe.Candidates(prompt, params)[0];
        Assert(!probe.HasCredentials(unbound, prompt, params), 'OD6 precondition: the model on OpenAI has a credential before any binding, so the binding would prove nothing');

        const credential = await fixtures.CreateCredential('API Key', 'OD6 GPT-6 Luna Decisions', { apiKey: OD6_TOKEN });
        await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID(MODEL_NAME, OPENAI_VENDOR));
        await withGuardsArmed({ OpenAI: answerAsOpenAI }, async () => {
            const before = openAIGuard.Requests.length;
            const result = await runDecision(new AIDecisionRunner(), params, id => fixtures.TrackPromptRun(id));
            assertAnsweredBy(result, OPENAI_VENDOR, OPENAI_DRIVER, 'OD6');
            const sent = openAIGuard.Requests[openAIGuard.Requests.length - 1]?.Authorization ?? '';
            Assert(!sent.includes('{'), `OD6: the bearer is the credential's JSON, not its token: ${sent}`);
            assertOpenAIRequest(before, OD6_TOKEN, 'OD6');
            assertOpenAIAnswers(result, 'OD6');
        });
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── OD7: Default Decision's selection (KV4's pattern) ───────────────────────────────────────────

/** A candidate as `model / vendor / driver`, for messages and order comparisons. */
function describeCandidate(candidate: ModelVendorCandidate): string {
    return `${candidate.model.Name} / ${candidate.vendorName ?? 'no vendor'} / ${candidate.driverClass}`;
}

/** The model's two candidates, OpenAI first, both power-matched fallbacks behind Jev and LLM Decision. */
function assertLunaBehindBoundModels(candidates: ModelVendorCandidate[], label: string): void {
    AssertEqual(candidates[0] ? describeCandidate(candidates[0]) : 'none', 'Jev / OpenRouter / OpenRouterDecision', `${label}: first candidate`);
    AssertEqual(candidates[1] ? describeCandidate(candidates[1]) : 'none', 'LLM Decision / MemberJunction / LLMDecision', `${label}: second candidate`);
    const luna = candidates.filter(c => c.model.Name === MODEL_NAME);
    AssertEqual(luna.map(describeCandidate).join(', '), `${MODEL_NAME} / ${OPENAI_VENDOR} / ${OPENAI_DRIVER}, ${MODEL_NAME} / ${OPENROUTER_VENDOR} / ${OPENROUTER_DRIVER}`, `${label}: the model's candidates`);
    for (const candidate of luna) {
        Assert(candidates.indexOf(candidate) > 1, `${label}: ${describeCandidate(candidate)} is ahead of Jev or LLM Decision`);
        AssertEqual(candidate.source, 'power-match-fallback', `${label}: ${describeCandidate(candidate)} source`);
    }
}

/** The model's candidate on OpenAI. */
function lunaOnOpenAI(candidates: ModelVendorCandidate[], label: string): ModelVendorCandidate {
    const candidate = candidates.find(c => c.model.Name === MODEL_NAME && c.vendorName === OPENAI_VENDOR);
    Assert(!!candidate, `${label}: the model on OpenAI is not a candidate`);
    return candidate!;
}

/** The first of Jev and LLM Decision the runner has a credential for: what it selected before this model. */
function expectedSelection(probe: DecisionRunnerProbe, candidates: ModelVendorCandidate[], prompt: MJAIPromptEntityExtended, params: AIDecisionParams): string {
    const first = candidates.slice(0, 2).find(c => probe.HasCredentials(c, prompt, params));
    return first ? first.model.Name : 'none';
}

/** Runs Default Decision through the scripted driver; asserts it selected `expected` and considered `candidates` in order. */
async function assertSelects(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, candidates: ModelVendorCandidate[], expected: string, label: string): Promise<AIDecisionRunResult> {
    const result = await runDecision(probe, decisionParams(ctx, RequireDefaultDecisionPrompt()), id => fixtures.TrackPromptRun(id));
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.modelInfo?.modelName, expected, `${label}: the selected model`);
    AssertEqual(result.modelSelectionInfo?.ModelSelected?.Name, expected, `${label}: the selection info`);
    AssertEqual(
        JSON.stringify((result.modelSelectionInfo?.ModelsConsidered ?? []).map(c => `${c.model.Name} / ${c.vendor?.Name ?? 'no vendor'}`)),
        JSON.stringify(candidates.map(c => `${c.model.Name} / ${c.vendorName ?? 'no vendor'}`)),
        `${label}: the candidates the run considered`,
    );
    return result;
}

/** OD7 with no OpenAI decision credential: Jev, LLM Decision, then the fallbacks; Jev or LLM Decision selected. */
async function assertSelectionWithoutCredential(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures): Promise<{ Candidates: ModelVendorCandidate[]; Selected: string }> {
    const label = 'OD7 no credential';
    const prompt = RequireDefaultDecisionPrompt();
    const params = decisionParams(ctx, prompt);
    const candidates = probe.Candidates(prompt, params);
    assertLunaBehindBoundModels(candidates, label);
    Assert(!probe.HasCredentials(lunaOnOpenAI(candidates, label), prompt, params), `${label}: the model on OpenAI has a credential (this database and host must have none)`);
    const expected = expectedSelection(probe, candidates, prompt, params);
    Assert(expected === 'Jev' || expected === 'LLM Decision', `${label}: neither Jev nor LLM Decision has a credential (LLM Decision needs none): ${expected}`);
    await assertSelects(ctx, probe, fixtures, candidates, expected, label);
    return { Candidates: candidates, Selected: expected };
}

/** OD7 with a credential bound to the model's OpenAI row: credentialed, still behind both, not selected. */
async function assertSelectionWithBoundCredential(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, pristine: { Candidates: ModelVendorCandidate[]; Selected: string }): Promise<void> {
    const label = 'OD7 bound';
    const credential = await fixtures.CreateCredential('API Key', 'OD7 GPT-6 Luna Decisions', { apiKey: 'it-od7-token' });
    await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID(MODEL_NAME, OPENAI_VENDOR));
    const prompt = RequireDefaultDecisionPrompt();
    const params = decisionParams(ctx, prompt);
    const bound = probe.Candidates(prompt, params);
    AssertEqual(bound.map(describeCandidate).join(', '), pristine.Candidates.map(describeCandidate).join(', '), `${label}: the candidates and their order`);
    Assert(probe.HasCredentials(lunaOnOpenAI(bound, label), prompt, params), `${label}: the model on OpenAI has no credential after its row was bound`);
    const result = await assertSelects(ctx, probe, fixtures, bound, pristine.Selected, label);
    const considered = result.modelSelectionInfo?.ModelsConsidered.find(c => c.model.Name === MODEL_NAME && c.vendor?.Name === OPENAI_VENDOR);
    AssertEqual(considered?.available, true, `${label}: the run saw the model on OpenAI as available`);
}

/** Every decision driver but OpenAI's, made unavailable in OD7's failover leg. */
const UNAVAILABLE_DRIVER_CLASSES: readonly string[] = SCRIPTED_DECISION_DRIVER_CLASSES.filter(name => name !== OPENAI_DRIVER);

/** OD7 failover: with every other decision driver unavailable, Default Decision fails over to the bound model on OpenAI. */
async function assertFailoverReachesBoundModel(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, decider: ScriptedDecision): Promise<void> {
    const label = 'OD7 failover';
    const prompt = RequireDefaultDecisionPrompt();
    const params = decisionParams(ctx, prompt);
    const candidates = probe.Candidates(prompt, params);
    const target = candidates.indexOf(lunaOnOpenAI(candidates, label));
    const credentialedAhead = candidates.slice(0, target).filter(c => probe.HasCredentials(c, prompt, params));
    const restores = UNAVAILABLE_DRIVER_CLASSES.map(name => RegisterDecisionStandIn(name, UnavailableDecision));
    const callsBefore = decider.Calls.length;
    const attemptsBefore = probe.Attempts.length;
    try {
        const result = await runDecision(probe, params, id => fixtures.TrackPromptRun(id));
        assertAnsweredBy(result, OPENAI_VENDOR, OPENAI_DRIVER, label);
    } finally {
        for (const restore of restores.reverse()) {
            restore();
        }
    }
    AssertEqual(decider.Calls.length - callsBefore, 1, `${label}: calls the model's scripted driver answered`);
    const attempts = probe.Attempts.slice(attemptsBefore).map(a => `${modelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}`);
    AssertEqual(JSON.stringify(attempts), JSON.stringify(credentialedAhead.map(c => `${c.model.Name}:ServiceUnavailable`)), `${label}: the failed attempts before the model`);
    Assert(attempts.some(a => a.startsWith('LLM Decision:')), `${label}: LLM Decision was not tried first`);
}

function modelNameOf(modelId: string): string {
    return AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelId))?.Name ?? `unknown model ${modelId}`;
}

async function checkDefaultDecisionSelection(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const probe = new DecisionRunnerProbe();
    const fixtures = new DecisionFixtures(ctx, 'od7');
    const decider = new ScriptedDecision();
    decider.Arm();
    const restore = RegisterScriptedDecision(decider, SCRIPTED_DECISION_DRIVER_CLASSES);
    try {
        const pristine = await assertSelectionWithoutCredential(ctx, probe, fixtures);
        await assertSelectionWithBoundCredential(ctx, probe, fixtures, pristine);
        await assertFailoverReachesBoundModel(ctx, probe, fixtures, decider);
    } finally {
        decider.Disarm();
        restore();
        await fixtures.Cleanup();
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const OpenAIDecisionsChecks: NamedCheck[] = [
    {
        Id: 'openai-decisions.OD1',
        Name: 'OD1: GPT-6 Luna Decisions is an Active Decision model with no limits, an OpenAI row naming OpenAIDecision and gpt-6-luna preferred over a pinned OpenRouter row, and $0.10 per million input cost rows on both',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            checkCatalog();
        },
    },
    {
        Id: 'openai-decisions.OD2',
        Name: "OD2: ClassFactory.CreateInstance(BaseDecision, 'OpenAIDecision', credential) builds the shipped OpenAIDecision, which reads the credential's endpoint",
        Fn: async (): Promise<void> => {
            checkClassFactory();
        },
    },
    {
        Id: 'openai-decisions.OD3',
        Name: 'OD3: AIDecisionRunner with override naming GPT-6 Luna Decisions on OpenAI sends the Decisions API request, maps the answers and records the run against the model and OpenAI, priced from its cost row',
        Fn: checkThroughOpenAI,
    },
    {
        Id: 'openai-decisions.OD4',
        Name: "OD4: the same through OpenRouter: OpenRouterDecision sends the System One request with the pinned model, maps the live-recorded answers and records OpenRouter's cost",
        Fn: checkThroughOpenRouter,
    },
    {
        Id: 'openai-decisions.OD5',
        Name: 'OD5: a refusal from OpenAI fails the attempt with an error naming the question, and the run fails over to the OpenRouter row',
        Fn: checkRefusalFailsOver,
    },
    {
        Id: 'openai-decisions.OD6',
        Name: "OD6: a real API Key credential bound to the model's OpenAI row sends its token, not its JSON, as the bearer",
        Fn: checkBoundCredential,
    },
    {
        Id: 'openai-decisions.OD7',
        Name: "OD7: Default Decision's candidates and selection are unchanged by GPT-6 Luna Decisions: Jev, then LLM Decision, then the fallbacks; a bound OpenAI row stays behind both, and is reached only by failing over",
        Fn: checkDefaultDecisionSelection,
    },
];

for (const check of OpenAIDecisionsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('openai-decisions', {
    Setup: async (): Promise<void> => {
        createdPromptRunIDs.length = 0;
        for (const guard of [openAIGuard, openRouterGuard]) {
            guard.Requests.length = 0;
            guard.Respond = undefined;
        }
        bundleRestores.push(RegisterDecisionStandIn(OPENAI_DRIVER, GuardedOpenAIDecision, OpenAIDecision));
        bundleRestores.push(RegisterDecisionStandIn(OPENROUTER_DRIVER, GuardedOpenRouterDecision, OpenRouterDecision));
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await DecisionFixtures.CleanupAll();
        for (const id of createdPromptRunIDs.splice(0)) {
            await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User);
        }
        for (const guard of [openAIGuard, openRouterGuard]) {
            guard.Requests.length = 0;
            guard.Respond = undefined;
        }
        for (const restore of bundleRestores.splice(0).reverse()) {
            restore();
        }
    },
});
