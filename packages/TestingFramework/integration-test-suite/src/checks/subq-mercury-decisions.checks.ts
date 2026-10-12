/**
 * subq-mercury-decisions.checks.ts — the 'subq-mercury-decisions' bundle (SM1–SM8): Subquadratic's SubQ
 * Snap (`SubQDecision`, `@memberjunction/ai-systemone`) and Inception's Mercury Decide
 * (`InceptionDecision`, `@memberjunction/ai-inception`, and `OpenRouterDecision` through OpenRouter),
 * from the synced metadata through `AIDecisionRunner` to the request each route would send, with no
 * network. Both APIs speak System One exactly, so one bundle covers both.
 *
 * WHAT IT PROVES, against this database's metadata:
 *   SM1  the synced catalog: the `Subquadratic` vendor; `SubQ Snap` (PowerRank 43) with a Subquadratic
 *        Model Developer row, an Inference Provider row naming `SubQDecision` and `subq-snap-preview`
 *        and a $0.05 cost row; `Mercury Decide` (PowerRank 44) with an Inception Labs Model Developer
 *        row, an Inception Labs Inference Provider row naming `InceptionDecision` and `mercury-decide`,
 *        preferred over an OpenRouter row naming `OpenRouterDecision` and the pinned
 *        `inception/mercury-decide-20260930` (65,536 input tokens), and a $0.02 cost row on each; both
 *        with the Choice (255) and Score (10) limits their APIs document, and no others.
 *   SM2  `ClassFactory.CreateInstance(BaseDecision, …)` builds `SubQDecision` and `InceptionDecision`
 *        (the bundle's guards, subclasses of them, sit on top), which read a credential's endpoint.
 *   SM3  a real `AIDecisionRunner.ExecuteDecision` with `override` naming SubQ Snap on Subquadratic sends
 *        the System One request, maps the answers from SubQ's documented response, and records the run
 *        against the model and vendor, priced from the cost row.
 *   SM4  the same for Mercury Decide on Inception Labs, with Inception's documented response.
 *   SM5  the same for Mercury Decide on OpenRouter: `OpenRouterDecision` sends the pinned model.
 *   SM6  real `API Key` credentials bound to each new model's own Inference Provider row send their
 *        tokens, not their JSON (both models also have a Model Developer row on that vendor).
 *   SM7  failover-eligible errors fail over: SubQ's 422 for a request it rejects is a `ModelError`,
 *        and the next model answers, though its message names no validation word (`ErrorAnalyzer` alone
 *        would stop the loop); Inception's documented 402 is `NoCredit`, and Mercury Decide's OpenRouter
 *        row answers.
 *   SM8  `Default Decision`'s order is unchanged: Jev, LLM Decision, then every existing power-matched
 *        fallback, and the new models' three rows last (Mercury Decide on Inception, then on OpenRouter,
 *        then SubQ Snap); the selection does not change when both new models' rows are bound; and with
 *        every other decision driver unavailable the run fails over to Mercury Decide on Inception.
 *
 * NO NETWORK. For the whole bundle `SubQDecision`, `InceptionDecision` and `OpenRouterDecision` are
 * replaced by subclasses that override only `SendRequest`, the drivers' one network call: each records its
 * requests and answers only while a check arms it, refusing with a 500 otherwise, so nothing can reach
 * api.subq.ai, api.inceptionlabs.ai or openrouter.ai. SM8 registers the shared scripted decision driver
 * over every decision driver class, as KV4 and OD7 do. Everything else is real: the prompts, model and
 * vendor rows, candidate selection, credential resolution, the drivers' URL, header and body building, the
 * answer mapping and status classification, `BaseDecision`'s validation, the failover loop and the run rows.
 *
 * TRANSPORT: SERVER-ONLY by necessity: the guards are ClassFactory registrations in this process.
 *
 * FIXTURES: none seeded; the models are shipped metadata, read only. Each check tracks its prompt runs, and
 * SM6–SM8 create credentials, bindings and a test prompt (decision-fixtures.ts), all deleted in a
 * `finally`; Teardown deletes whatever a failed check left.
 */
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseDecision, type ChoiceAnswer, type DecisionQuestion, type LikelihoodAnswer, type ScoreAnswer } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { AIDecisionParams, AIDecisionRunner, type AIDecisionRunResult, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { SubQDecision } from '@memberjunction/ai-systemone';
import { InceptionDecision } from '@memberjunction/ai-inception';
import { OpenRouterDecision } from '@memberjunction/ai-openrouter';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { RegisterScriptedDecision, ScriptedDecision, SCRIPTED_DECISION_DRIVER_CLASSES } from './decision-test-double';
import {
    DecisionFixtures,
    DecisionRunnerProbe,
    ReadDecisionPromptRun,
    RegisterDecisionStandIn,
    RequireDecisionModel,
    RequireDefaultDecisionPrompt,
    RequireInferenceRowID,
    RequireVendorID,
    UnavailableDecision,
} from './decision-fixtures';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const SUBQ_MODEL = 'SubQ Snap';
const MERCURY_MODEL = 'Mercury Decide';
const SUBQ_VENDOR = 'Subquadratic';
const INCEPTION_VENDOR = 'Inception Labs';
const OPENROUTER_VENDOR = 'OpenRouter';
const SUBQ_DRIVER = 'SubQDecision';
const INCEPTION_DRIVER = 'InceptionDecision';
const OPENROUTER_DRIVER = 'OpenRouterDecision';
const SUBQ_API_NAME = 'subq-snap-preview';
const INCEPTION_API_NAME = 'mercury-decide';
const OPENROUTER_API_NAME = 'inception/mercury-decide-20260930';
const OPENROUTER_MAX_INPUT_TOKENS = 65_536;

/** Both unmeasured: farther from Default Decision's target rank (57) than every existing Decision model. */
const SUBQ_POWER_RANK = 43;
const MERCURY_POWER_RANK = 44;

const SUBQ_INPUT_PRICE_PER_MILLION = 0.05;
const MERCURY_INPUT_PRICE_PER_MILLION = 0.02;

/** The Decision limits both APIs document; nothing else is declared. */
const DECISION_LIMITS = { MaxChoiceOptions: 255, MaxScoreLevels: 10 } as const;

/** Fake keys: never sent anywhere, the guards answer instead. */
const SUBQ_KEY = 'it-subq-key-no-network';
const INCEPTION_KEY = 'it-inception-key-no-network';
const OPENROUTER_KEY = 'it-openrouter-key-no-network';

/** SubQ's Decisions API example (state and questions), as MJ asks it. */
const SUBQ_STATE = 'Patient with asthma reports a sore throat, fever since yesterday, and shortness of breath walking to the kitchen this morning.';
const SUBQ_QUESTIONS: Record<string, DecisionQuestion> = {
    escalate: { Kind: 'Likelihood', Instructions: 'Should a nurse see this chat before the patient books anything?' },
    queue: {
        Kind: 'Choice',
        Instructions: 'Which team should own this chat?',
        Options: [
            { Value: 'nurse_line', Description: 'Needs a nurse to assess symptoms today' },
            { Value: 'primary_care', Description: "Book with the patient's own doctor" },
            { Value: 'pharmacy', Description: 'Refill or medication question only' },
            { Value: 'front_desk', Description: 'Scheduling or paperwork only' },
        ],
    },
    acuity: { Kind: 'Score', Instructions: 'How soon should someone respond?', Levels: ['Within a week', 'Within a day', 'Within an hour'] },
};
const SUBQ_EXPECTED_QUESTIONS = {
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
};

/** SubQ's documented response to that example. */
const SUBQ_INPUT_TOKENS = 477;
const SUBQ_RESPONSE = {
    model: SUBQ_API_NAME,
    answers: {
        escalate: { type: 'noul', noul: 0.92 },
        queue: { type: 'choice', choice: 'nurse_line', probabilities: { nurse_line: 1, primary_care: 0, pharmacy: 0, front_desk: 0 }, confidence: 1 },
        acuity: {
            type: 'score',
            score: 1.86,
            legend: { '0': 'Within a week', '1': 'Within a day', '2': 'Within an hour' },
            probabilities: { '0': 0, '1': 0.13, '2': 0.87 },
            confidence: 0.79,
        },
    },
    usage: { input_tokens: SUBQ_INPUT_TOKENS, output_tokens: 0 },
};

/** Inception's "Create a decision" example (state and questions), as MJ asks it. */
const MERCURY_STATE = { message: 'Please refund the duplicate charge on my account.' };
const MERCURY_QUESTIONS: Record<string, DecisionQuestion> = {
    billing: { Kind: 'Likelihood', Instructions: 'Is this request about billing?' },
    team: {
        Kind: 'Choice',
        Instructions: 'Which team should handle this request?',
        Options: [
            { Value: 'billing', Description: 'Payments, charges, and refunds' },
            { Value: 'support', Description: 'Technical support and other requests' },
        ],
    },
    urgency: { Kind: 'Score', Instructions: 'How urgent is this request?', Levels: ['Can wait', 'Needs attention soon', 'Needs immediate attention'] },
};
const MERCURY_EXPECTED_QUESTIONS = {
    billing: { type: 'noul', instructions: 'Is this request about billing?' },
    team: {
        type: 'choice',
        instructions: 'Which team should handle this request?',
        criteria: { billing: 'Payments, charges, and refunds', support: 'Technical support and other requests' },
    },
    urgency: { type: 'score', instructions: 'How urgent is this request?', criteria: ['Can wait', 'Needs attention soon', 'Needs immediate attention'] },
};

/** Inception's documented response to that example; `model` is what the serving route names. */
const MERCURY_INPUT_TOKENS = 120;
function mercuryResponse(model: string): Record<string, unknown> {
    return {
        model,
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
        usage: { input_tokens: MERCURY_INPUT_TOKENS, output_tokens: 3 },
    };
}

/** Inception's documented 402. */
const INCEPTION_402 = { error: { code: 'account_error', type: 'invalid_request_error', message: 'Account access is unavailable.' } };

/**
 * A SubQ 422 for a request it rejects (its docs list "a model that is not a decision model"). The message
 * names no validation word, so `ErrorAnalyzer` alone would read it as a fatal `InvalidRequest`.
 */
const SUBQ_422 = { detail: { error_type: 'unsupported_model', message: 'subq-preview is not a decision model.' } };

// ─── The guards ──────────────────────────────────────────────────────────────────────────────────

/** One request a guard received. */
interface GuardedRequest {
    Url: string;
    Authorization: string | null;
    Body: unknown;
}

/** How an armed guard answers. */
type Responder = (request: GuardedRequest) => Response;

/** What one guard was sent, and how it answers; undefined `Respond` refuses. Module state: the runner builds its own drivers. */
interface GuardState {
    Requests: GuardedRequest[];
    Respond: Responder | undefined;
}

const subqGuard: GuardState = { Requests: [], Respond: undefined };
const inceptionGuard: GuardState = { Requests: [], Respond: undefined };
const openRouterGuard: GuardState = { Requests: [], Respond: undefined };
const ALL_GUARDS: readonly GuardState[] = [subqGuard, inceptionGuard, openRouterGuard];

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Records the request; answers as the guard is armed to, or refuses with a 500. Never calls the network. */
function guardedSend(guard: GuardState, service: string, url: string, init: RequestInit): Response {
    const request: GuardedRequest = { Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: JSON.parse(String(init.body)) };
    guard.Requests.push(request);
    return guard.Respond
        ? guard.Respond(request)
        : jsonResponse(500, { error: { message: `The integration-test ${service} guard is not armed: no request leaves this process` } });
}

/** The real `SubQDecision` with only its network call replaced by the guard. */
class GuardedSubQDecision extends SubQDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return guardedSend(subqGuard, 'SubQ', url, init);
    }
}

/** The real `InceptionDecision` with only its network call replaced by the guard. */
class GuardedInceptionDecision extends InceptionDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return guardedSend(inceptionGuard, 'Inception', url, init);
    }
}

/** The real `OpenRouterDecision` with only its network call replaced by the guard. */
class GuardedOpenRouterDecision extends OpenRouterDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return guardedSend(openRouterGuard, 'OpenRouter', url, init);
    }
}

/** Arms the guards with the given responders for the length of `work`, then disarms all three. */
async function withGuardsArmed<T>(responders: { SubQ?: Responder; Inception?: Responder; OpenRouter?: Responder }, work: () => Promise<T>): Promise<T> {
    subqGuard.Respond = responders.SubQ;
    inceptionGuard.Respond = responders.Inception;
    openRouterGuard.Respond = responders.OpenRouter;
    try {
        return await work();
    } finally {
        for (const guard of ALL_GUARDS) {
            guard.Respond = undefined;
        }
    }
}

const answerAsSubQ: Responder = () => jsonResponse(200, SUBQ_RESPONSE);
const answerAsInception: Responder = () => jsonResponse(200, mercuryResponse(INCEPTION_API_NAME));
const answerAsOpenRouter: Responder = () => jsonResponse(200, mercuryResponse(OPENROUTER_API_NAME));

/** What Setup changed for the bundle, undone in Teardown. */
const bundleRestores: Array<() => void> = [];

// ─── Lookups and assertions ──────────────────────────────────────────────────────────────────────

function assertClose(actual: number | null | undefined, expected: number, message: string): void {
    Assert(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9, `${message} — expected ${expected}, got ${String(actual)}`);
}

/** A candidate as `model / vendor / driver`, for messages and order comparisons. */
function describeCandidate(candidate: ModelVendorCandidate): string {
    return `${candidate.model.Name} / ${candidate.vendorName ?? 'no vendor'} / ${candidate.driverClass}`;
}

/** The model's model-vendor rows on one vendor, of one type. */
function rowsOf(model: MJAIModelEntityExtended, vendorName: string, type: MJAIModelVendorEntity['Type']): MJAIModelVendorEntity[] {
    const vendorId = RequireVendorID(vendorName);
    return AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId) && mv.Type === type);
}

/** A decision request on `prompt`. */
function decisionParams(ctx: IntegrationCheckContext, prompt: MJAIPromptEntityExtended, state: AIDecisionParams['State'], questions: Record<string, DecisionQuestion>): AIDecisionParams {
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.contextUser = ctx.User;
    params.State = state;
    params.Questions = questions;
    return params;
}

/** SubQ's example on `Default Decision`, with an override naming SubQ Snap on Subquadratic. */
function subqOverrideParams(ctx: IntegrationCheckContext): AIDecisionParams {
    const params = decisionParams(ctx, RequireDefaultDecisionPrompt(), SUBQ_STATE, SUBQ_QUESTIONS);
    params.override = { modelId: RequireDecisionModel(SUBQ_MODEL).ID, vendorId: RequireVendorID(SUBQ_VENDOR) };
    return params;
}

/** Inception's example on `Default Decision`, with an override naming Mercury Decide, on `vendorName` when given. */
function mercuryOverrideParams(ctx: IntegrationCheckContext, vendorName?: string): AIDecisionParams {
    const params = decisionParams(ctx, RequireDefaultDecisionPrompt(), MERCURY_STATE, MERCURY_QUESTIONS);
    params.override = { modelId: RequireDecisionModel(MERCURY_MODEL).ID, vendorId: vendorName ? RequireVendorID(vendorName) : undefined };
    return params;
}

/** Runs one decision, waits for its run row and hands its ID to `fixtures` for deletion. */
async function runDecision(runner: AIDecisionRunner, params: AIDecisionParams, fixtures: DecisionFixtures): Promise<AIDecisionRunResult> {
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    fixtures.TrackPromptRun(result.promptRun?.ID);
    return result;
}

/** Asserts the run succeeded on `modelName` through `vendorName` with `driverClass`. */
function assertAnsweredBy(result: AIDecisionRunResult, modelName: string, vendorName: string, driverClass: string, label: string): void {
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.DriverClass, driverClass, `${label}: answering driver class`);
    AssertEqual(result.modelInfo?.modelName, modelName, `${label}: answering model`);
    AssertEqual(result.modelInfo?.vendorName, vendorName, `${label}: answering vendor`);
}

/** Asserts exactly one request reached `guard` since `before`, to `url`, with `key` as the bearer and `body`. */
function assertOneRequest(guard: GuardState, before: number, url: string, key: string, body: unknown, label: string): void {
    AssertEqual(guard.Requests.length - before, 1, `${label}: requests`);
    const sent = guard.Requests[guard.Requests.length - 1];
    AssertEqual(sent.Url, url, `${label}: request URL`);
    Assert(!(sent.Authorization ?? '').includes('{'), `${label}: the bearer is a credential's JSON, not its token: ${String(sent.Authorization)}`);
    AssertEqual(sent.Authorization, `Bearer ${key}`, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(sent.Body), JSON.stringify(body), `${label}: request body`);
}

/** Asserts the answers came back mapped from SubQ's documented response. */
function assertSubQAnswers(result: AIDecisionRunResult, label: string): void {
    assertClose((result.Answers['escalate'] as LikelihoodAnswer)?.Probability, 0.92, `${label}: escalate probability`);
    const queue = result.Answers['queue'] as ChoiceAnswer;
    AssertEqual(queue?.Value, 'nurse_line', `${label}: queue choice`);
    AssertEqual(JSON.stringify(queue.Probabilities), JSON.stringify({ nurse_line: 1, primary_care: 0, pharmacy: 0, front_desk: 0 }), `${label}: queue probabilities`);
    const acuity = result.Answers['acuity'] as ScoreAnswer;
    assertClose(acuity?.Value, 1.86, `${label}: acuity score`);
    assertClose(acuity.Confidence, 0.79, `${label}: acuity confidence`);
    AssertEqual(JSON.stringify(Object.keys(acuity.Probabilities)), JSON.stringify(['Within a week', 'Within a day', 'Within an hour']), `${label}: acuity keyed by level`);
    assertClose(acuity.Probabilities['Within an hour'], 0.87, `${label}: acuity probability of level 2`);
}

/** Asserts the answers came back mapped from Inception's documented response. */
function assertMercuryAnswers(result: AIDecisionRunResult, label: string): void {
    assertClose((result.Answers['billing'] as LikelihoodAnswer)?.Probability, 0.97, `${label}: billing probability`);
    const team = result.Answers['team'] as ChoiceAnswer;
    AssertEqual(team?.Value, 'billing', `${label}: team choice`);
    assertClose(team.Probabilities['support'], 0.04, `${label}: team probability of support`);
    const urgency = result.Answers['urgency'] as ScoreAnswer;
    assertClose(urgency?.Value, 1.1, `${label}: urgency score`);
    AssertEqual(JSON.stringify(Object.keys(urgency.Probabilities)), JSON.stringify(['Can wait', 'Needs attention soon', 'Needs immediate attention']), `${label}: urgency keyed by level`);
    assertClose(urgency.Probabilities['Needs attention soon'], 0.7, `${label}: urgency probability of level 1`);
}

/** Asserts the run row names `modelName`, `vendorName` and Default Decision, succeeded, and has the tokens and the cost from the cost row. */
async function assertRunRow(ctx: IntegrationCheckContext, result: AIDecisionRunResult, modelName: string, vendorName: string, tokens: number, pricePerMillion: number, label: string): Promise<void> {
    Assert(!!result.promptRun?.ID, `${label}: no prompt run`);
    const row = await ReadDecisionPromptRun(ctx, result.promptRun!.ID);
    Assert(!!row, `${label}: prompt run ${result.promptRun!.ID} was not found`);
    Assert(UUIDsEqual(row!.PromptID, RequireDefaultDecisionPrompt().ID), `${label}: the run's prompt is not Default Decision`);
    Assert(UUIDsEqual(row!.ModelID, RequireDecisionModel(modelName).ID), `${label}: run model ${row!.ModelID} is not ${modelName}`);
    Assert(!!row!.VendorID && UUIDsEqual(row!.VendorID, RequireVendorID(vendorName)), `${label}: run vendor ${String(row!.VendorID)} is not ${vendorName}`);
    AssertEqual(row!.Success, true, `${label}: run Success`);
    AssertEqual(row!.TokensPrompt, tokens, `${label}: run TokensPrompt`);
    const cost = (tokens * pricePerMillion) / 1_000_000;
    // The column keeps 8 decimal places.
    Assert(typeof row!.Cost === 'number' && Math.abs(row!.Cost - cost) < 1e-8, `${label}: run Cost from the cost row — expected ${cost} to 8 places, got ${String(row!.Cost)}`);
}

// ─── SM1: the catalog ────────────────────────────────────────────────────────────────────────────

function assertInferenceRow(row: MJAIModelVendorEntity | undefined, driverClass: string, apiName: string, maxInputTokens: number | null, label: string): void {
    Assert(!!row, `${label}: missing`);
    AssertEqual(row!.Status, 'Active', `${label}: status`);
    AssertEqual(row!.DriverClass, driverClass, `${label}: DriverClass`);
    AssertEqual(row!.APIName, apiName, `${label}: APIName`);
    AssertEqual(row!.MaxInputTokens, maxInputTokens, `${label}: MaxInputTokens`);
    AssertEqual(row!.SupportsStreaming, false, `${label}: SupportsStreaming`);
}

function assertDecisionModel(name: string, powerRank: number): MJAIModelEntityExtended {
    const model = RequireDecisionModel(name);
    AssertEqual(model.IsActive, true, `SM1 ${name}: IsActive`);
    AssertEqual(model.AIModelType, 'Decision', `SM1 ${name}: model type`);
    AssertEqual(model.PowerRank, powerRank, `SM1 ${name}: PowerRank`);
    AssertEqual(AIEngine.Instance.Models.filter(m => m.Name === name).length, 1, `SM1 ${name}: models by that name`);
    return model;
}

function assertLimitsAndCost(model: MJAIModelEntityExtended, row: MJAIModelVendorEntity, vendorName: string, pricePerMillion: number): void {
    const label = `SM1 ${model.Name} on ${vendorName}`;
    const limits = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, row.ID)?.Decision;
    AssertEqual(JSON.stringify({ MaxQuestionsPerCall: limits?.MaxQuestionsPerCall, MaxChoiceOptions: limits?.MaxChoiceOptions, MaxScoreLevels: limits?.MaxScoreLevels, MaxStateTokens: limits?.MaxStateTokens }),
        JSON.stringify({ MaxQuestionsPerCall: undefined, MaxChoiceOptions: DECISION_LIMITS.MaxChoiceOptions, MaxScoreLevels: DECISION_LIMITS.MaxScoreLevels, MaxStateTokens: undefined }),
        `${label}: effective Decision limits`);
    const cost = AIEngine.Instance.GetActiveModelCost(model.ID, RequireVendorID(vendorName), 'Realtime');
    Assert(!!cost, `${label}: no active Realtime cost row`);
    assertClose(cost!.InputPricePerUnit, pricePerMillion, `${label}: input price per unit`);
    assertClose(cost!.OutputPricePerUnit, 0, `${label}: output price per unit`);
    AssertEqual(cost!.UnitType, 'Per 1M Tokens', `${label}: cost unit type`);
}

function checkCatalog(): void {
    for (const vendorName of [SUBQ_VENDOR, INCEPTION_VENDOR]) {
        AssertEqual(AIEngine.Instance.Vendors.find(v => v.Name === vendorName)?.CredentialType, 'API Key', `SM1: the ${vendorName} vendor credential type`);
    }

    const subq = assertDecisionModel(SUBQ_MODEL, SUBQ_POWER_RANK);
    AssertEqual(rowsOf(subq, SUBQ_VENDOR, 'Model Developer').length, 1, 'SM1 SubQ Snap: Subquadratic Model Developer rows');
    const subqRows = rowsOf(subq, SUBQ_VENDOR, 'Inference Provider');
    AssertEqual(subqRows.length, 1, 'SM1 SubQ Snap: Subquadratic Inference Provider rows');
    assertInferenceRow(subqRows[0], SUBQ_DRIVER, SUBQ_API_NAME, null, 'SM1 SubQ Snap row');
    assertLimitsAndCost(subq, subqRows[0], SUBQ_VENDOR, SUBQ_INPUT_PRICE_PER_MILLION);

    const mercury = assertDecisionModel(MERCURY_MODEL, MERCURY_POWER_RANK);
    AssertEqual(rowsOf(mercury, INCEPTION_VENDOR, 'Model Developer').length, 1, 'SM1 Mercury Decide: Inception Labs Model Developer rows');
    const inceptionRows = rowsOf(mercury, INCEPTION_VENDOR, 'Inference Provider');
    const openRouterRows = rowsOf(mercury, OPENROUTER_VENDOR, 'Inference Provider');
    AssertEqual(inceptionRows.length, 1, 'SM1 Mercury Decide: Inception Labs Inference Provider rows');
    AssertEqual(openRouterRows.length, 1, 'SM1 Mercury Decide: OpenRouter Inference Provider rows');
    assertInferenceRow(inceptionRows[0], INCEPTION_DRIVER, INCEPTION_API_NAME, null, 'SM1 Mercury Decide Inception row');
    assertInferenceRow(openRouterRows[0], OPENROUTER_DRIVER, OPENROUTER_API_NAME, OPENROUTER_MAX_INPUT_TOKENS, 'SM1 Mercury Decide OpenRouter row');
    Assert(inceptionRows[0].Priority > openRouterRows[0].Priority, `SM1 Mercury Decide: the Inception row's priority ${inceptionRows[0].Priority} is not above OpenRouter's ${openRouterRows[0].Priority}`);
    assertLimitsAndCost(mercury, inceptionRows[0], INCEPTION_VENDOR, MERCURY_INPUT_PRICE_PER_MILLION);
    assertLimitsAndCost(mercury, openRouterRows[0], OPENROUTER_VENDOR, MERCURY_INPUT_PRICE_PER_MILLION);
}

// ─── SM2: the drivers through the ClassFactory ───────────────────────────────────────────────────

function checkClassFactory(): void {
    const factory = MJGlobal.Instance.ClassFactory;
    // At least one each: a stand-in's restore (IT97, KV4) registers the shipped class again, above the stand-in.
    Assert(factory.GetAllRegistrations(BaseDecision, SUBQ_DRIVER).some(r => r.SubClass === SubQDecision), "SM2: the shipped SubQDecision is not registered under 'SubQDecision'");
    Assert(factory.GetAllRegistrations(BaseDecision, INCEPTION_DRIVER).some(r => r.SubClass === InceptionDecision), "SM2: the shipped InceptionDecision is not registered under 'InceptionDecision'");

    const subq = factory.CreateInstance<BaseDecision>(BaseDecision, SUBQ_DRIVER, JSON.stringify({ apiKey: SUBQ_KEY, endpoint: 'https://gateway.example.test/subq/v1/systemone/' }));
    if (!(subq instanceof SubQDecision)) {
        throw new Error(`SM2: the factory built ${subq?.constructor?.name ?? 'nothing'}, not a SubQDecision`);
    }
    AssertEqual(subq.constructor, GuardedSubQDecision, "SM2: the bundle's guard, a subclass of the shipped SubQDecision, is on top");
    AssertEqual(subq.EndpointURL, 'https://gateway.example.test/subq/v1/systemone', "SM2: SubQ endpoint from the credential's JSON");
    AssertEqual(new SubQDecision(SUBQ_KEY).EndpointURL, 'https://api.subq.ai/v1/systemone', 'SM2: the default SubQ endpoint');

    const inception = factory.CreateInstance<BaseDecision>(BaseDecision, INCEPTION_DRIVER, JSON.stringify({ apiKey: INCEPTION_KEY, endpoint: 'https://gateway.example.test/inception/v1/decisions' }));
    if (!(inception instanceof InceptionDecision)) {
        throw new Error(`SM2: the factory built ${inception?.constructor?.name ?? 'nothing'}, not an InceptionDecision`);
    }
    AssertEqual(inception.constructor, GuardedInceptionDecision, "SM2: the bundle's guard, a subclass of the shipped InceptionDecision, is on top");
    AssertEqual(inception.EndpointURL, 'https://gateway.example.test/inception/v1/decisions', "SM2: Inception endpoint from the credential's JSON");
    AssertEqual(new InceptionDecision(INCEPTION_KEY).EndpointURL, 'https://api.inceptionlabs.ai/v1/decisions', 'SM2: the default Inception endpoint');
}

// ─── SM3–SM5: the runner, one route each ─────────────────────────────────────────────────────────

async function checkSubQRunnerCall(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'sm3');
    try {
        const params = subqOverrideParams(ctx);
        params.apiKeys = [{ driverClass: SUBQ_DRIVER, apiKey: SUBQ_KEY }];
        const before = subqGuard.Requests.length;
        const result = await withGuardsArmed({ SubQ: answerAsSubQ }, () => runDecision(new AIDecisionRunner(), params, fixtures));
        assertAnsweredBy(result, SUBQ_MODEL, SUBQ_VENDOR, SUBQ_DRIVER, 'SM3');
        assertOneRequest(subqGuard, before, SubQDecision.DEFAULT_ENDPOINT, SUBQ_KEY, { model: SUBQ_API_NAME, state: SUBQ_STATE, questions: SUBQ_EXPECTED_QUESTIONS }, 'SM3');
        assertSubQAnswers(result, 'SM3');
        AssertEqual(result.DecisionResult?.ResolvedModel, SUBQ_API_NAME, 'SM3: resolved model');
        await assertRunRow(ctx, result, SUBQ_MODEL, SUBQ_VENDOR, SUBQ_INPUT_TOKENS, SUBQ_INPUT_PRICE_PER_MILLION, 'SM3');
    } finally {
        await fixtures.Cleanup();
    }
}

async function checkInceptionRunnerCall(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'sm4');
    try {
        const params = mercuryOverrideParams(ctx, INCEPTION_VENDOR);
        params.apiKeys = [{ driverClass: INCEPTION_DRIVER, apiKey: INCEPTION_KEY }];
        const before = inceptionGuard.Requests.length;
        const openRouterBefore = openRouterGuard.Requests.length;
        const result = await withGuardsArmed({ Inception: answerAsInception }, () => runDecision(new AIDecisionRunner(), params, fixtures));
        assertAnsweredBy(result, MERCURY_MODEL, INCEPTION_VENDOR, INCEPTION_DRIVER, 'SM4');
        assertOneRequest(inceptionGuard, before, InceptionDecision.DEFAULT_ENDPOINT, INCEPTION_KEY, { model: INCEPTION_API_NAME, state: MERCURY_STATE, questions: MERCURY_EXPECTED_QUESTIONS }, 'SM4');
        AssertEqual(openRouterGuard.Requests.length - openRouterBefore, 0, 'SM4: OpenRouter requests');
        assertMercuryAnswers(result, 'SM4');
        AssertEqual(result.DecisionResult?.ResolvedModel, INCEPTION_API_NAME, 'SM4: resolved model');
        await assertRunRow(ctx, result, MERCURY_MODEL, INCEPTION_VENDOR, MERCURY_INPUT_TOKENS, MERCURY_INPUT_PRICE_PER_MILLION, 'SM4');
    } finally {
        await fixtures.Cleanup();
    }
}

async function checkOpenRouterRunnerCall(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'sm5');
    try {
        const params = mercuryOverrideParams(ctx, OPENROUTER_VENDOR);
        params.apiKeys = [{ driverClass: OPENROUTER_DRIVER, apiKey: OPENROUTER_KEY }];
        const before = openRouterGuard.Requests.length;
        const result = await withGuardsArmed({ OpenRouter: answerAsOpenRouter }, () => runDecision(new AIDecisionRunner(), params, fixtures));
        assertAnsweredBy(result, MERCURY_MODEL, OPENROUTER_VENDOR, OPENROUTER_DRIVER, 'SM5');
        assertOneRequest(openRouterGuard, before, OpenRouterDecision.DEFAULT_ENDPOINT, OPENROUTER_KEY, { model: OPENROUTER_API_NAME, state: MERCURY_STATE, questions: MERCURY_EXPECTED_QUESTIONS }, 'SM5');
        assertMercuryAnswers(result, 'SM5');
        AssertEqual(result.DecisionResult?.ResolvedModel, OPENROUTER_API_NAME, 'SM5: resolved model');
        // The scripted response reports no cost, so the run is priced from the model's OpenRouter cost row.
        await assertRunRow(ctx, result, MERCURY_MODEL, OPENROUTER_VENDOR, MERCURY_INPUT_TOKENS, MERCURY_INPUT_PRICE_PER_MILLION, 'SM5');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── SM6: bound credentials ──────────────────────────────────────────────────────────────────────

const SM6_SUBQ_TOKEN = 'it-sm6-subq-token';
const SM6_INCEPTION_TOKEN = 'it-sm6-inception-token';

async function checkBoundCredentials(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'sm6');
    try {
        const subqCredential = await fixtures.CreateCredential('API Key', 'SM6 SubQ Snap', { apiKey: SM6_SUBQ_TOKEN });
        await fixtures.BindToModelVendor(subqCredential.ID, RequireInferenceRowID(SUBQ_MODEL, SUBQ_VENDOR));
        const inceptionCredential = await fixtures.CreateCredential('API Key', 'SM6 Mercury Decide', { apiKey: SM6_INCEPTION_TOKEN });
        await fixtures.BindToModelVendor(inceptionCredential.ID, RequireInferenceRowID(MERCURY_MODEL, INCEPTION_VENDOR));

        await withGuardsArmed({ SubQ: answerAsSubQ, Inception: answerAsInception }, async () => {
            const subqBefore = subqGuard.Requests.length;
            const subq = await runDecision(new AIDecisionRunner(), subqOverrideParams(ctx), fixtures);
            assertAnsweredBy(subq, SUBQ_MODEL, SUBQ_VENDOR, SUBQ_DRIVER, 'SM6 SubQ Snap');
            assertOneRequest(subqGuard, subqBefore, SubQDecision.DEFAULT_ENDPOINT, SM6_SUBQ_TOKEN, { model: SUBQ_API_NAME, state: SUBQ_STATE, questions: SUBQ_EXPECTED_QUESTIONS }, 'SM6 SubQ Snap');
            assertSubQAnswers(subq, 'SM6 SubQ Snap');

            const inceptionBefore = inceptionGuard.Requests.length;
            const mercury = await runDecision(new AIDecisionRunner(), mercuryOverrideParams(ctx, INCEPTION_VENDOR), fixtures);
            assertAnsweredBy(mercury, MERCURY_MODEL, INCEPTION_VENDOR, INCEPTION_DRIVER, 'SM6 Mercury Decide');
            assertOneRequest(inceptionGuard, inceptionBefore, InceptionDecision.DEFAULT_ENDPOINT, SM6_INCEPTION_TOKEN, { model: INCEPTION_API_NAME, state: MERCURY_STATE, questions: MERCURY_EXPECTED_QUESTIONS }, 'SM6 Mercury Decide');
            assertMercuryAnswers(mercury, 'SM6 Mercury Decide');
        });
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── SM7: failover-eligible errors ───────────────────────────────────────────────────────────────

/** A model's name by ID, for comparisons and messages. */
function modelNameOf(modelId: string): string {
    return AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelId))?.Name ?? `unknown model ${modelId}`;
}

/** SubQ's 422 on a test prompt bound to SubQ Snap, then Mercury Decide on Inception: the next model answers. */
async function assertSubQ422FailsOver(ctx: IntegrationCheckContext, fixtures: DecisionFixtures): Promise<void> {
    const label = 'SM7 SubQ 422';
    const { Prompt } = await fixtures.CreateDecisionPrompt('SM7 SubQ then Mercury', {
        Bindings: [
            { Key: 'subq', ModelName: SUBQ_MODEL, VendorName: SUBQ_VENDOR, Priority: 2 },
            { Key: 'mercury', ModelName: MERCURY_MODEL, VendorName: INCEPTION_VENDOR, Priority: 1 },
        ],
    });
    const params = decisionParams(ctx, Prompt, MERCURY_STATE, MERCURY_QUESTIONS);
    params.apiKeys = [{ driverClass: SUBQ_DRIVER, apiKey: SUBQ_KEY }, { driverClass: INCEPTION_DRIVER, apiKey: INCEPTION_KEY }];
    const probe = new DecisionRunnerProbe();
    AssertEqual(probe.Candidates(Prompt, params).map(describeCandidate).join(', '),
        `${SUBQ_MODEL} / ${SUBQ_VENDOR} / ${SUBQ_DRIVER}, ${MERCURY_MODEL} / ${INCEPTION_VENDOR} / ${INCEPTION_DRIVER}`, `${label}: the candidates`);
    const counts = { SubQ: subqGuard.Requests.length, Inception: inceptionGuard.Requests.length };
    const result = await withGuardsArmed({ SubQ: () => jsonResponse(422, SUBQ_422), Inception: answerAsInception }, () => runDecision(probe, params, fixtures));
    AssertEqual(subqGuard.Requests.length - counts.SubQ, 1, `${label}: SubQ requests`);
    AssertEqual(inceptionGuard.Requests.length - counts.Inception, 1, `${label}: Inception requests`);
    assertAnsweredBy(result, MERCURY_MODEL, INCEPTION_VENDOR, INCEPTION_DRIVER, label);
    assertMercuryAnswers(result, label);
    AssertEqual(JSON.stringify(probe.Attempts.map(a => `${modelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}:${a.WillRetry ? 'retry' : 'stop'}`)),
        JSON.stringify([`${SUBQ_MODEL}:ModelError:retry`]), `${label}: the failed attempts`);
    AssertEqual(probe.Attempts[0].Attempt.error.message, 'SubQ Decisions API returned HTTP 422: unsupported_model: subq-preview is not a decision model.', `${label}: the failed attempt's error`);
}

/** Inception's 402 with the override naming Mercury Decide: its OpenRouter row answers. */
async function assertInception402FailsOver(ctx: IntegrationCheckContext, fixtures: DecisionFixtures): Promise<void> {
    const label = 'SM7 Inception 402';
    const params = mercuryOverrideParams(ctx);
    params.apiKeys = [{ driverClass: INCEPTION_DRIVER, apiKey: INCEPTION_KEY }, { driverClass: OPENROUTER_DRIVER, apiKey: OPENROUTER_KEY }];
    const probe = new DecisionRunnerProbe();
    AssertEqual(probe.Candidates(RequireDefaultDecisionPrompt(), params).map(describeCandidate).join(', '),
        `${MERCURY_MODEL} / ${INCEPTION_VENDOR} / ${INCEPTION_DRIVER}, ${MERCURY_MODEL} / ${OPENROUTER_VENDOR} / ${OPENROUTER_DRIVER}`, `${label}: the candidates`);
    const counts = { Inception: inceptionGuard.Requests.length, OpenRouter: openRouterGuard.Requests.length };
    const result = await withGuardsArmed({ Inception: () => jsonResponse(402, INCEPTION_402), OpenRouter: answerAsOpenRouter }, () => runDecision(probe, params, fixtures));
    AssertEqual(inceptionGuard.Requests.length - counts.Inception, 1, `${label}: Inception requests`);
    AssertEqual(openRouterGuard.Requests.length - counts.OpenRouter, 1, `${label}: OpenRouter requests`);
    assertAnsweredBy(result, MERCURY_MODEL, OPENROUTER_VENDOR, OPENROUTER_DRIVER, label);
    assertMercuryAnswers(result, label);
    AssertEqual(JSON.stringify(probe.Attempts.map(a => `${modelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}:${a.WillRetry ? 'retry' : 'stop'}`)),
        JSON.stringify([`${MERCURY_MODEL}:NoCredit:retry`]), `${label}: the failed attempts`);
    Assert(UUIDsEqual(probe.Attempts[0].Attempt.vendorId ?? '', RequireVendorID(INCEPTION_VENDOR)), `${label}: the failed attempt was not on Inception Labs`);
    AssertEqual(probe.Attempts[0].Attempt.error.message, 'Inception Decisions API returned HTTP 402: Account access is unavailable.', `${label}: the failed attempt's error`);
}

async function checkFailover(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'sm7');
    try {
        await assertSubQ422FailsOver(ctx, fixtures);
        await assertInception402FailsOver(ctx, fixtures);
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── SM8: Default Decision's order (OD7's pattern) ───────────────────────────────────────────────

/** The new models' candidates, in the order Default Decision must list them: last of all. */
const NEW_CANDIDATES_IN_ORDER = [
    `${MERCURY_MODEL} / ${INCEPTION_VENDOR} / ${INCEPTION_DRIVER}`,
    `${MERCURY_MODEL} / ${OPENROUTER_VENDOR} / ${OPENROUTER_DRIVER}`,
    `${SUBQ_MODEL} / ${SUBQ_VENDOR} / ${SUBQ_DRIVER}`,
];

function isNewModel(candidate: ModelVendorCandidate): boolean {
    return candidate.model.Name === SUBQ_MODEL || candidate.model.Name === MERCURY_MODEL;
}

/**
 * Jev, then LLM Decision, then every existing power-matched fallback, then the new models' three rows,
 * last: their PowerRanks (44, 43) are farther from `Default Decision`'s target rank (57, the
 * priority-weighted mean of Jev's 60 and LLM Decision's 50) than every other active Decision model's,
 * Kev-0.8B's 45 included. The READMEs and the changeset say so; a rank change that moves either fails here.
 */
function assertNewModelsLast(candidates: ModelVendorCandidate[], label: string): void {
    AssertEqual(candidates[0] ? describeCandidate(candidates[0]) : 'none', 'Jev / OpenRouter / OpenRouterDecision', `${label}: first candidate`);
    AssertEqual(candidates[1] ? describeCandidate(candidates[1]) : 'none', 'LLM Decision / MemberJunction / LLMDecision', `${label}: second candidate`);
    const newOnes = candidates.filter(isNewModel);
    AssertEqual(newOnes.map(describeCandidate).join(', '), NEW_CANDIDATES_IN_ORDER.join(', '), `${label}: the new models' candidates`);
    AssertEqual(candidates.slice(-NEW_CANDIDATES_IN_ORDER.length).map(describeCandidate).join(', '), NEW_CANDIDATES_IN_ORDER.join(', '), `${label}: the last candidates`);
    for (const candidate of newOnes) {
        AssertEqual(candidate.source, 'power-match-fallback', `${label}: ${describeCandidate(candidate)} source`);
    }
    Assert(candidates.length > 2 + NEW_CANDIDATES_IN_ORDER.length, `${label}: no existing fallback ahead of the new models, so the order proves nothing`);
}

/** The direct rows of the new models: the ones a bound credential reaches. */
function directCandidates(candidates: ModelVendorCandidate[]): ModelVendorCandidate[] {
    return candidates.filter(c => (c.model.Name === MERCURY_MODEL && c.vendorName === INCEPTION_VENDOR) || (c.model.Name === SUBQ_MODEL && c.vendorName === SUBQ_VENDOR));
}

/** The first of Jev and LLM Decision the runner has a credential for: what Default Decision selects. */
function expectedSelection(probe: DecisionRunnerProbe, candidates: ModelVendorCandidate[], prompt: MJAIPromptEntityExtended, params: AIDecisionParams): string {
    const first = candidates.slice(0, 2).find(c => probe.HasCredentials(c, prompt, params));
    return first ? first.model.Name : 'none';
}

/** Runs Default Decision through the scripted driver; asserts it selected `expected` and considered `candidates` in order. */
async function assertSelects(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, candidates: ModelVendorCandidate[], expected: string, label: string): Promise<AIDecisionRunResult> {
    const result = await runDecision(probe, decisionParams(ctx, RequireDefaultDecisionPrompt(), MERCURY_STATE, MERCURY_QUESTIONS), fixtures);
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.modelInfo?.modelName, expected, `${label}: the selected model`);
    AssertEqual(
        JSON.stringify((result.modelSelectionInfo?.ModelsConsidered ?? []).map(c => `${c.model.Name} / ${c.vendor?.Name ?? 'no vendor'}`)),
        JSON.stringify(candidates.map(c => `${c.model.Name} / ${c.vendorName ?? 'no vendor'}`)),
        `${label}: the candidates the run considered`,
    );
    return result;
}

/** SM8 with no credential for the new models: they are last, and Jev or LLM Decision is selected. */
async function assertSelectionWithoutCredentials(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures): Promise<{ Candidates: ModelVendorCandidate[]; Selected: string }> {
    const label = 'SM8 no credential';
    const prompt = RequireDefaultDecisionPrompt();
    const params = decisionParams(ctx, prompt, MERCURY_STATE, MERCURY_QUESTIONS);
    const candidates = probe.Candidates(prompt, params);
    assertNewModelsLast(candidates, label);
    for (const candidate of directCandidates(candidates)) {
        if (probe.HasCredentials(candidate, prompt, params)) {
            console.warn(`  ⚠ ${label}: this host already has a key for ${describeCandidate(candidate)}, so the unbound leg cannot show it without one`);
        }
    }
    const expected = expectedSelection(probe, candidates, prompt, params);
    Assert(expected === 'Jev' || expected === 'LLM Decision', `${label}: neither Jev nor LLM Decision has a credential (LLM Decision needs none): ${expected}`);
    await assertSelects(ctx, probe, fixtures, candidates, expected, label);
    return { Candidates: candidates, Selected: expected };
}

/** SM8 with credentials bound to both new models' direct rows: credentialed, still last, not selected. */
async function assertSelectionWithBoundCredentials(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, pristine: { Candidates: ModelVendorCandidate[]; Selected: string }): Promise<void> {
    const label = 'SM8 bound';
    const subq = await fixtures.CreateCredential('API Key', 'SM8 SubQ Snap', { apiKey: 'it-sm8-subq-token' });
    await fixtures.BindToModelVendor(subq.ID, RequireInferenceRowID(SUBQ_MODEL, SUBQ_VENDOR));
    const inception = await fixtures.CreateCredential('API Key', 'SM8 Mercury Decide', { apiKey: 'it-sm8-inception-token' });
    await fixtures.BindToModelVendor(inception.ID, RequireInferenceRowID(MERCURY_MODEL, INCEPTION_VENDOR));
    const prompt = RequireDefaultDecisionPrompt();
    const params = decisionParams(ctx, prompt, MERCURY_STATE, MERCURY_QUESTIONS);
    const bound = probe.Candidates(prompt, params);
    AssertEqual(bound.map(describeCandidate).join(', '), pristine.Candidates.map(describeCandidate).join(', '), `${label}: the candidates and their order`);
    for (const candidate of directCandidates(bound)) {
        Assert(probe.HasCredentials(candidate, prompt, params), `${label}: ${describeCandidate(candidate)} has no credential after its row was bound`);
    }
    await assertSelects(ctx, probe, fixtures, bound, pristine.Selected, label);
}

/** Every decision driver but Inception's, made unavailable in SM8's failover leg. */
const UNAVAILABLE_DRIVER_CLASSES: readonly string[] = SCRIPTED_DECISION_DRIVER_CLASSES.filter(name => name !== INCEPTION_DRIVER);

/** SM8 failover: with every other decision driver unavailable, Default Decision fails over to the bound Mercury Decide on Inception. */
async function assertFailoverReachesMercury(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, decider: ScriptedDecision): Promise<void> {
    const label = 'SM8 failover';
    const prompt = RequireDefaultDecisionPrompt();
    const params = decisionParams(ctx, prompt, MERCURY_STATE, MERCURY_QUESTIONS);
    const candidates = probe.Candidates(prompt, params);
    const target = candidates.findIndex(c => c.model.Name === MERCURY_MODEL && c.vendorName === INCEPTION_VENDOR);
    const credentialedAhead = candidates.slice(0, target).filter(c => probe.HasCredentials(c, prompt, params));
    const restores = UNAVAILABLE_DRIVER_CLASSES.map(name => RegisterDecisionStandIn(name, UnavailableDecision));
    const callsBefore = decider.Calls.length;
    const attemptsBefore = probe.Attempts.length;
    try {
        const result = await runDecision(probe, params, fixtures);
        assertAnsweredBy(result, MERCURY_MODEL, INCEPTION_VENDOR, INCEPTION_DRIVER, label);
    } finally {
        for (const restore of restores.reverse()) {
            restore();
        }
    }
    AssertEqual(decider.Calls.length - callsBefore, 1, `${label}: calls the scripted driver answered`);
    const attempts = probe.Attempts.slice(attemptsBefore).map(a => `${modelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}`);
    AssertEqual(JSON.stringify(attempts), JSON.stringify(credentialedAhead.map(c => `${c.model.Name}:ServiceUnavailable`)), `${label}: the failed attempts before Mercury Decide`);
    Assert(attempts.some(a => a.startsWith('LLM Decision:')), `${label}: LLM Decision was not tried first`);
}

async function checkDefaultDecisionOrder(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const probe = new DecisionRunnerProbe();
    const fixtures = new DecisionFixtures(ctx, 'sm8');
    const decider = new ScriptedDecision();
    decider.Arm();
    const restore = RegisterScriptedDecision(decider, SCRIPTED_DECISION_DRIVER_CLASSES);
    try {
        const pristine = await assertSelectionWithoutCredentials(ctx, probe, fixtures);
        await assertSelectionWithBoundCredentials(ctx, probe, fixtures, pristine);
        await assertFailoverReachesMercury(ctx, probe, fixtures, decider);
    } finally {
        decider.Disarm();
        restore();
        await fixtures.Cleanup();
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const SubQMercuryDecisionsChecks: NamedCheck[] = [
    {
        Id: 'subq-mercury-decisions.SM1',
        Name: 'SM1: SubQ Snap and Mercury Decide are Active Decision models at PowerRanks 43 and 44 with their documented limits, rows naming SubQDecision, InceptionDecision and the pinned OpenRouter slug (Inception preferred), and their cost rows',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            checkCatalog();
        },
    },
    {
        Id: 'subq-mercury-decisions.SM2',
        Name: "SM2: ClassFactory.CreateInstance(BaseDecision, …) builds the shipped SubQDecision and InceptionDecision, which read a credential's endpoint",
        Fn: async (): Promise<void> => {
            checkClassFactory();
        },
    },
    {
        Id: 'subq-mercury-decisions.SM3',
        Name: "SM3: AIDecisionRunner with override naming SubQ Snap sends the System One request to api.subq.ai, maps SubQ's documented response and records the run against the model and Subquadratic, priced from its cost row",
        Fn: checkSubQRunnerCall,
    },
    {
        Id: 'subq-mercury-decisions.SM4',
        Name: "SM4: AIDecisionRunner with override naming Mercury Decide on Inception Labs sends the System One request to api.inceptionlabs.ai, maps Inception's documented response and records the run, priced from its cost row",
        Fn: checkInceptionRunnerCall,
    },
    {
        Id: 'subq-mercury-decisions.SM5',
        Name: 'SM5: the same through OpenRouter: OpenRouterDecision sends the pinned inception/mercury-decide-20260930 and the run is recorded against OpenRouter, priced from its cost row',
        Fn: checkOpenRouterRunnerCall,
    },
    {
        Id: 'subq-mercury-decisions.SM6',
        Name: "SM6: real API Key credentials bound to SubQ Snap's and Mercury Decide's Inference Provider rows send their tokens, not their JSON, as the bearer",
        Fn: checkBoundCredentials,
    },
    {
        Id: 'subq-mercury-decisions.SM7',
        Name: "SM7: SubQ's 422 fails over to the next model as a ModelError, and Inception's 402 fails over to Mercury Decide's OpenRouter row as NoCredit",
        Fn: checkFailover,
    },
    {
        Id: 'subq-mercury-decisions.SM8',
        Name: "SM8: Default Decision's order is unchanged with the new models last (Mercury Decide on Inception, on OpenRouter, then SubQ Snap); bound, they stay last and the selection does not change; they are reached only by failing over",
        Fn: checkDefaultDecisionOrder,
    },
];

for (const check of SubQMercuryDecisionsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('subq-mercury-decisions', {
    Setup: async (): Promise<void> => {
        for (const guard of ALL_GUARDS) {
            guard.Requests.length = 0;
            guard.Respond = undefined;
        }
        bundleRestores.push(RegisterDecisionStandIn(SUBQ_DRIVER, GuardedSubQDecision, SubQDecision));
        bundleRestores.push(RegisterDecisionStandIn(INCEPTION_DRIVER, GuardedInceptionDecision, InceptionDecision));
        bundleRestores.push(RegisterDecisionStandIn(OPENROUTER_DRIVER, GuardedOpenRouterDecision, OpenRouterDecision));
    },
    Teardown: async (): Promise<void> => {
        await DecisionFixtures.CleanupAll();
        for (const guard of ALL_GUARDS) {
            guard.Requests.length = 0;
            guard.Respond = undefined;
        }
        for (const restore of bundleRestores.splice(0).reverse()) {
            restore();
        }
    },
});
