/**
 * perplexity-decider.checks.ts — the 'perplexity-decider' bundle (PX1–PX5): Perplexity's
 * pplx-decider-v1-27b decision model and the `PerplexityDecision` driver, from the synced metadata through
 * `AIDecisionRunner` to the Decisions API request, with no network.
 *
 * WHAT IT PROVES, against this database's metadata:
 *   PX1  the synced catalog: `Perplexity Decider v1 27B` is an Active `Decision` model with its limits,
 *        a Perplexity Model Developer row, a Perplexity Inference Provider row naming
 *        `PerplexityDecision` and `pplx-decider-v1-27b`, and an active input-token cost row; the
 *        `Perplexity` vendor takes an `API Key` credential.
 *   PX2  `ClassFactory.CreateInstance(BaseDecision, 'PerplexityDecision', key)` builds the shipped
 *        driver, which posts to `https://api.perplexity.ai/v1/decisions`.
 *   PX3  a real `AIDecisionRunner.ExecuteDecision` with `override` naming the Decider sends Perplexity's
 *        quickstart request (all three question kinds) with the key as the bearer, maps the quickstart's
 *        response, and records the `MJ: AI Prompt Runs` row against the model and the Perplexity vendor,
 *        priced from its cost row.
 *   PX4  a real `API Key` credential, created through `CredentialEngine` and bound to the Decider's
 *        Perplexity row, sends its token, not its JSON, as the bearer.
 *   PX5  `Default Decision`'s selection is unchanged: with no Perplexity credential its candidates are
 *        Jev, then LLM Decision, then the fallbacks, the Decider among them; with a Perplexity credential
 *        bound to the Decider's row, the Decider is a credentialed candidate that still comes after both,
 *        and the selection does not change; and with every other decision driver unavailable, the run
 *        fails over from model to model and the Decider answers with the bound token.
 *
 * NO NETWORK. For the whole bundle, `PerplexityDecision` is replaced by a subclass that overrides only
 * `SendRequest`, the driver's one network call: it records each request, answers with Perplexity's
 * quickstart response only while a check arms it, and refuses otherwise, so no check can reach
 * api.perplexity.ai. PX5 registers the shared scripted decision driver over every decision driver class
 * for its selection legs, as IT97 and IT100 do, and `UnavailableDecision` over every other decision
 * driver for its failover leg. Everything else is real: the prompt, model and vendor rows, candidate
 * selection, credential resolution (a legacy `apiKeys` entry in PX3, a bound `MJ: Credentials` row in
 * PX4 and PX5), the driver's URL, header and body building, the answer mapping, `BaseDecision`'s
 * validation, the failover loop and the run rows.
 *
 * TRANSPORT: SERVER-ONLY by necessity: the stand-in is a ClassFactory registration in this process.
 *
 * FIXTURES: none seeded; the model is shipped metadata, read only. PX3–PX5 track their prompt runs, and
 * PX4 and PX5 create a credential and binding (decision-fixtures.ts), all deleted in a `finally`;
 * Teardown deletes whatever a failed check left.
 */
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    BaseDecision,
    type ChoiceAnswer,
    type DecisionQuestion,
    type LikelihoodAnswer,
    type ScoreAnswer,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIVendorEntity } from '@memberjunction/core-entities';
import { AIDecisionParams, AIDecisionRunner, type AIDecisionRunResult, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { PerplexityDecision } from '@memberjunction/ai-systemone';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { RegisterScriptedDecision, ScriptedDecision, SCRIPTED_DECISION_DRIVER_CLASSES } from './decision-test-double';
import {
    DecisionFixtures,
    DecisionRunnerProbe,
    ReadDecisionPromptRun,
    RegisterDecisionStandIn,
    RequireDefaultDecisionPrompt,
    RequireInferenceRowID,
    UnavailableDecision,
    type DecisionDriverClass,
} from './decision-fixtures';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const DRIVER_CLASS = 'PerplexityDecision';
const VENDOR_NAME = 'Perplexity';
const MODEL_NAME = 'Perplexity Decider v1 27B';
const API_NAME = 'pplx-decider-v1-27b';
const CREDENTIAL_TYPE = 'API Key';

/** The Decision limits the model declares: Perplexity's per-request limits. */
const DECISION_LIMITS = { MaxQuestionsPerCall: 128, MaxChoiceOptions: 255, MaxScoreLevels: 10, MaxStateTokens: 262144 } as const;

/** $0.04 per million input tokens; output is free. */
const INPUT_PRICE_PER_MILLION = 0.04;

/** Below Jev's 60 until MJ measures it. */
const POWER_RANK = 59;

/** The state of Perplexity's quickstart: one product review, as an object. */
const QUICKSTART_STATE = {
    title: 'Battery died after two weeks',
    review: 'The headphones sound great, but the battery stopped charging after two weeks.',
};

/** The quickstart's three questions, as MJ asks them. */
const QUICKSTART_QUESTIONS: Record<string, DecisionQuestion> = {
    defect: { Kind: 'Likelihood', Instructions: 'Does the review report a product defect?' },
    sentiment: {
        Kind: 'Choice',
        Instructions: 'What is the overall sentiment of the review?',
        Options: [
            { Value: 'positive', Description: 'Mostly satisfied' },
            { Value: 'mixed', Description: 'Praise and complaints in one review' },
            { Value: 'negative', Description: 'Mostly dissatisfied' },
        ],
    },
    severity: { Kind: 'Score', Instructions: 'How severe is the reported problem?', Levels: ['Cosmetic', 'Inconvenient', 'Product unusable'] },
};

/** The request body the quickstart sends (https://docs.perplexity.ai/docs/decisions/quickstart), verbatim. */
const QUICKSTART_REQUEST = {
    model: API_NAME,
    state: QUICKSTART_STATE,
    questions: {
        defect: { type: 'noul', instructions: 'Does the review report a product defect?' },
        sentiment: {
            type: 'choice',
            instructions: 'What is the overall sentiment of the review?',
            criteria: { positive: 'Mostly satisfied', mixed: 'Praise and complaints in one review', negative: 'Mostly dissatisfied' },
        },
        severity: { type: 'score', instructions: 'How severe is the reported problem?', criteria: ['Cosmetic', 'Inconvenient', 'Product unusable'] },
    },
};

/** The quickstart's response to that request, verbatim, as the API sent it. */
const QUICKSTART_RESPONSE_TEXT =
    '{"model":"pplx-decider-v1-27b","answers":{"defect":{"type":"noul","noul":0.9424522889347015},"sentiment":{"type":"choice","choice":"mixed","confidence":0.9255246944002182,"probabilities":{"positive":0.020649883775315993,"mixed":0.9503497962668123,"negative":0.02900031995787183}},"severity":{"type":"score","score":1.7838686319784252,"confidence":0.7838686319784252,"legend":{"0":"Cosmetic","1":"Inconvenient","2":"Product unusable"},"probabilities":{"0":0.008423954913615923,"1":0.199283458194343,"2":0.7922925868920411}}},"usage":{"input_tokens":367,"output_tokens":3}}';

/** The input tokens the quickstart response reports: the run's cost is these at the model's input price. */
const QUICKSTART_INPUT_TOKENS = 367;

// ─── The Perplexity guard ────────────────────────────────────────────────────────────────────────

/** One request the guard received. */
interface PerplexityRequest {
    Url: string;
    Authorization: string | null;
    Body: unknown;
}

/** What the guard was sent, and whether it may answer. Module state: the runner builds its own driver. */
interface PerplexityGuardState {
    Requests: PerplexityRequest[];
    Armed: boolean;
}

const perplexity: PerplexityGuardState = { Requests: [], Armed: false };

/** A response with a JSON body. */
function jsonText(status: number, text: string): Response {
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * The real `PerplexityDecision` with only its network call replaced. Armed, it answers every request
 * with the quickstart's response; disarmed, it refuses with a 503 in Perplexity's error shape. Either
 * way, nothing reaches api.perplexity.ai.
 */
class ScriptedPerplexityDecision extends PerplexityDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        const body: unknown = JSON.parse(String(init.body));
        perplexity.Requests.push({ Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: body });
        return perplexity.Armed
            ? jsonText(200, QUICKSTART_RESPONSE_TEXT)
            : jsonText(503, JSON.stringify({ error: { message: 'The integration-test Perplexity guard is not armed', type: 'service_unavailable', code: null } }));
    }
}

/** Runs `work` with the guard answering, then disarms it. */
async function withGuardArmed<T>(work: () => Promise<T>): Promise<T> {
    perplexity.Armed = true;
    try {
        return await work();
    } finally {
        perplexity.Armed = false;
    }
}

/** What the ClassFactory built for `PerplexityDecision` before Setup put the guard on top. */
let registeredBeforeGuard: DecisionDriverClass | undefined;

/** What Setup changed for the bundle, undone in Teardown. */
const bundleRestores: Array<() => void> = [];

// ─── Lookups and shared assertions ───────────────────────────────────────────────────────────────

function requireModel(): MJAIModelEntityExtended {
    const model = AIEngine.Instance.Models.find(m => m.Name === MODEL_NAME);
    if (!model) {
        throw new Error(`The '${MODEL_NAME}' model is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return model;
}

function requireVendor(): MJAIVendorEntity {
    const vendor = AIEngine.Instance.Vendors.find(v => v.Name === VENDOR_NAME);
    if (!vendor) {
        throw new Error(`The '${VENDOR_NAME}' AI vendor is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return vendor;
}

function assertClose(actual: number | null | undefined, expected: number, message: string): void {
    Assert(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9, `${message} — expected ${expected}, got ${String(actual)}`);
}

/** A decision request on `prompt` for the quickstart's state and questions. */
function quickstartParams(ctx: IntegrationCheckContext, prompt: MJAIPromptEntityExtended): AIDecisionParams {
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.contextUser = ctx.User;
    params.State = QUICKSTART_STATE;
    params.Questions = QUICKSTART_QUESTIONS;
    return params;
}

/** A quickstart request on `Default Decision` whose override names the Decider on Perplexity. */
function overrideParams(ctx: IntegrationCheckContext): AIDecisionParams {
    const params = quickstartParams(ctx, RequireDefaultDecisionPrompt());
    params.override = { modelId: requireModel().ID, vendorId: requireVendor().ID };
    return params;
}

/** Runs one decision, waits for its run row and hands its ID to `fixtures` for deletion. */
async function runDecision(runner: AIDecisionRunner, params: AIDecisionParams, fixtures: DecisionFixtures): Promise<AIDecisionRunResult> {
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    fixtures.TrackPromptRun(result.promptRun?.ID);
    return result;
}

/** Asserts the run succeeded on the Decider, on Perplexity, with `PerplexityDecision`. */
function assertAnsweredByDecider(result: AIDecisionRunResult, label: string): void {
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.DriverClass, DRIVER_CLASS, `${label}: answering driver class`);
    AssertEqual(result.modelInfo?.modelName, MODEL_NAME, `${label}: answering model`);
    AssertEqual(result.modelInfo?.vendorName, VENDOR_NAME, `${label}: answering vendor`);
}

/** Asserts exactly one request reached the guard since `before`, to the endpoint, with `key` as the bearer and the quickstart body. */
function assertOneQuickstartRequest(before: number, key: string, label: string): void {
    AssertEqual(perplexity.Requests.length - before, 1, `${label}: requests to the Decisions API`);
    const sent = perplexity.Requests[perplexity.Requests.length - 1];
    AssertEqual(sent.Url, PerplexityDecision.DEFAULT_ENDPOINT, `${label}: request URL`);
    AssertEqual(sent.Authorization, `Bearer ${key}`, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(sent.Body), JSON.stringify(QUICKSTART_REQUEST), `${label}: request body`);
}

/** Asserts the answers came back mapped from the quickstart's response. */
function assertQuickstartAnswers(result: AIDecisionRunResult, label: string): void {
    const defect = result.Answers['defect'] as LikelihoodAnswer;
    AssertEqual(defect?.Kind, 'Likelihood', `${label}: defect kind`);
    assertClose(defect.Probability, 0.9424522889347015, `${label}: defect probability`);

    const sentiment = result.Answers['sentiment'] as ChoiceAnswer;
    AssertEqual(sentiment?.Value, 'mixed', `${label}: sentiment choice`);
    assertClose(sentiment.Confidence, 0.9255246944002182, `${label}: sentiment confidence`);
    assertClose(sentiment.Probabilities['mixed'], 0.9503497962668123, `${label}: sentiment probability`);

    const severity = result.Answers['severity'] as ScoreAnswer;
    assertClose(severity?.Value, 1.7838686319784252, `${label}: severity score`);
    assertClose(severity.Confidence, 0.7838686319784252, `${label}: severity confidence`);
    AssertEqual(JSON.stringify(Object.keys(severity.Probabilities)), JSON.stringify(['Cosmetic', 'Inconvenient', 'Product unusable']), `${label}: severity keyed by level`);
    assertClose(severity.Probabilities['Product unusable'], 0.7922925868920411, `${label}: severity probability of level 2`);
    AssertEqual(result.DecisionResult?.ResolvedModel, API_NAME, `${label}: resolved model`);
}

// ─── PX1 ─────────────────────────────────────────────────────────────────────────────────────────

function checkCatalog(): void {
    const vendor = requireVendor();
    AssertEqual(vendor.CredentialType, CREDENTIAL_TYPE, 'PX1: the Perplexity vendor credential type');
    const model = requireModel();
    AssertEqual(model.IsActive, true, 'PX1: IsActive');
    AssertEqual(model.AIModelType, 'Decision', 'PX1: model type');
    AssertEqual(model.PowerRank, POWER_RANK, 'PX1: PowerRank');

    const rows = AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendor.ID));
    AssertEqual(rows.filter(mv => mv.Type === 'Model Developer').length, 1, 'PX1: Perplexity Model Developer rows');
    const providers = rows.filter(mv => mv.Type === 'Inference Provider');
    AssertEqual(providers.length, 1, 'PX1: Perplexity Inference Provider rows');
    const provider = providers[0];
    AssertEqual(provider.Status, 'Active', 'PX1: inference row status');
    AssertEqual(provider.DriverClass, DRIVER_CLASS, 'PX1: inference row DriverClass');
    AssertEqual(provider.APIName, API_NAME, 'PX1: inference row APIName');
    AssertEqual(provider.MaxInputTokens, DECISION_LIMITS.MaxStateTokens, 'PX1: inference row MaxInputTokens');
    AssertEqual(provider.SupportsStreaming, false, 'PX1: inference row SupportsStreaming');

    const limits = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, provider.ID)?.Decision;
    Assert(!!limits, 'PX1: no effective Decision configuration');
    AssertEqual(limits!.MaxQuestionsPerCall, DECISION_LIMITS.MaxQuestionsPerCall, 'PX1: MaxQuestionsPerCall');
    AssertEqual(limits!.MaxChoiceOptions, DECISION_LIMITS.MaxChoiceOptions, 'PX1: MaxChoiceOptions');
    AssertEqual(limits!.MaxScoreLevels, DECISION_LIMITS.MaxScoreLevels, 'PX1: MaxScoreLevels');
    AssertEqual(limits!.MaxStateTokens, DECISION_LIMITS.MaxStateTokens, 'PX1: MaxStateTokens');

    const cost = AIEngine.Instance.GetActiveModelCost(model.ID, vendor.ID, 'Realtime');
    Assert(!!cost, 'PX1: no active Realtime cost row for Perplexity');
    assertClose(cost!.InputPricePerUnit, INPUT_PRICE_PER_MILLION, 'PX1: input price per unit');
    assertClose(cost!.OutputPricePerUnit, 0, 'PX1: output price per unit');
    AssertEqual(cost!.UnitType, 'Per 1M Tokens', 'PX1: cost unit type');
}

// ─── PX2 ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Builds the driver through the ClassFactory with what was registered before the guard back on top,
 * then puts the guard back. Nothing is sent: the driver is only constructed.
 */
function checkFactoryBuildsDriver(): void {
    const factory = MJGlobal.Instance.ClassFactory;
    Assert(!!registeredBeforeGuard, `PX2: nothing was registered for '${DRIVER_CLASS}' before the bundle's guard: the package's @RegisterClass did not run`);
    const restoreGuard = RegisterDecisionStandIn(DRIVER_CLASS, registeredBeforeGuard!);
    let driver: BaseDecision | null;
    try {
        driver = factory.CreateInstance<BaseDecision>(BaseDecision, DRIVER_CLASS, 'it-px2-key');
    } finally {
        restoreGuard();
    }
    if (!(driver instanceof PerplexityDecision)) {
        throw new Error(`PX2: the factory built ${driver?.constructor?.name ?? 'nothing'}, not a PerplexityDecision`);
    }
    AssertEqual(driver.constructor, PerplexityDecision, 'PX2: the registered class is the shipped driver, not a stand-in');
    AssertEqual(driver.EndpointURL, 'https://api.perplexity.ai/v1/decisions', 'PX2: the endpoint');
    const guarded = factory.CreateInstance<BaseDecision>(BaseDecision, DRIVER_CLASS, 'it-px2-key');
    AssertEqual(guarded?.constructor, ScriptedPerplexityDecision, 'PX2: the guard is back on top');
}

// ─── PX3 ─────────────────────────────────────────────────────────────────────────────────────────

const PX3_KEY = 'it-px3-perplexity-key';

async function checkRunnerCall(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'px3');
    try {
        const params = overrideParams(ctx);
        params.apiKeys = [{ driverClass: DRIVER_CLASS, apiKey: PX3_KEY }];
        const before = perplexity.Requests.length;
        const result = await withGuardArmed(() => runDecision(new AIDecisionRunner(), params, fixtures));

        assertAnsweredByDecider(result, 'PX3');
        assertOneQuickstartRequest(before, PX3_KEY, 'PX3');
        assertQuickstartAnswers(result, 'PX3');

        Assert(!!result.promptRun?.ID, 'PX3: no prompt run');
        const row = await ReadDecisionPromptRun(ctx, result.promptRun!.ID);
        Assert(!!row, `PX3: prompt run ${result.promptRun!.ID} was not found`);
        Assert(UUIDsEqual(row!.PromptID, RequireDefaultDecisionPrompt().ID), 'PX3: run prompt is not Default Decision');
        Assert(UUIDsEqual(row!.ModelID, requireModel().ID), `PX3: run model ${row!.ModelID} is not ${MODEL_NAME}`);
        Assert(!!row!.VendorID && UUIDsEqual(row!.VendorID, requireVendor().ID), `PX3: run vendor ${String(row!.VendorID)} is not ${VENDOR_NAME}`);
        AssertEqual(row!.Success, true, 'PX3: run Success');
        AssertEqual(row!.TokensPrompt, QUICKSTART_INPUT_TOKENS, 'PX3: run TokensPrompt');
        assertClose(row!.Cost, (QUICKSTART_INPUT_TOKENS * INPUT_PRICE_PER_MILLION) / 1_000_000, 'PX3: run Cost from the cost row');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── PX4 ─────────────────────────────────────────────────────────────────────────────────────────

const PX4_TOKEN = 'it-px4-perplexity-token';

async function checkBoundCredential(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'px4');
    try {
        const credential = await fixtures.CreateCredential(CREDENTIAL_TYPE, 'PX4 Perplexity Decider', { apiKey: PX4_TOKEN });
        await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID(MODEL_NAME, VENDOR_NAME));
        const before = perplexity.Requests.length;
        const result = await withGuardArmed(() => runDecision(new AIDecisionRunner(), overrideParams(ctx), fixtures));

        assertAnsweredByDecider(result, 'PX4');
        const sent = perplexity.Requests[perplexity.Requests.length - 1];
        Assert(!(sent?.Authorization ?? '').includes('{'), `PX4: the bearer is the credential's JSON, not its token: ${sent?.Authorization}`);
        assertOneQuickstartRequest(before, PX4_TOKEN, 'PX4');
        assertQuickstartAnswers(result, 'PX4');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── PX5: Default Decision's selection ───────────────────────────────────────────────────────────

const PX5_TOKEN = 'it-px5-perplexity-token';

/** A candidate as `model / vendor / driver`, for messages and order comparisons. */
function describeCandidate(candidate: ModelVendorCandidate): string {
    return `${candidate.model.Name} / ${candidate.vendorName ?? 'no vendor'} / ${candidate.driverClass}`;
}

function isDecider(candidate: ModelVendorCandidate): boolean {
    return candidate.model.Name === MODEL_NAME && candidate.vendorName === VENDOR_NAME;
}

/** The Decider's candidate, asserted to be a power-matched fallback behind Jev and LLM Decision. */
function requireDeciderBehindBoundModels(candidates: ModelVendorCandidate[], label: string): ModelVendorCandidate {
    AssertEqual(candidates[0] ? describeCandidate(candidates[0]) : 'none', 'Jev / OpenRouter / OpenRouterDecision', `${label}: first candidate`);
    AssertEqual(candidates[1] ? describeCandidate(candidates[1]) : 'none', 'LLM Decision / MemberJunction / LLMDecision', `${label}: second candidate`);
    AssertEqual(candidates[0].source, 'prompt-model', `${label}: Jev's source`);
    AssertEqual(candidates[1].source, 'prompt-model', `${label}: LLM Decision's source`);
    const decider = candidates.find(isDecider);
    Assert(!!decider, `${label}: the Decider on Perplexity is not a candidate, so the check would prove nothing`);
    Assert(candidates.indexOf(decider!) > 1, `${label}: the Decider is ahead of Jev or LLM Decision`);
    AssertEqual(decider!.source, 'power-match-fallback', `${label}: the Decider's source`);
    return decider!;
}

/** The first of Jev and LLM Decision the runner has a credential for: what Default Decision selects. */
function expectedSelection(probe: DecisionRunnerProbe, candidates: ModelVendorCandidate[], prompt: MJAIPromptEntityExtended, params: AIDecisionParams): string {
    const first = candidates.slice(0, 2).find(c => probe.HasCredentials(c, prompt, params));
    return first ? first.model.Name : 'none';
}

/** Runs Default Decision through the scripted driver; returns the result after checking it selected `expected`. */
async function assertSelects(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, expected: string, label: string): Promise<AIDecisionRunResult> {
    const result = await runDecision(probe, quickstartParams(ctx, RequireDefaultDecisionPrompt()), fixtures);
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.modelInfo?.modelName, expected, `${label}: the selected model`);
    AssertEqual(result.modelSelectionInfo?.ModelSelected?.Name, expected, `${label}: the selection info`);
    return result;
}

/** PX5 with no Perplexity credential: the Decider is a fallback, and Jev or LLM Decision is selected. */
async function assertSelectionWithoutCredential(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams,
): Promise<{ Candidates: ModelVendorCandidate[]; Selected: string }> {
    const label = 'PX5 no credential';
    const candidates = probe.Candidates(prompt, params);
    const decider = requireDeciderBehindBoundModels(candidates, label);
    if (probe.HasCredentials(decider, prompt, params)) {
        console.warn(`  ⚠ ${label}: this host already has a Perplexity key, so the unbound leg cannot show the Decider without one`);
    }
    const expected = expectedSelection(probe, candidates, prompt, params);
    Assert(expected === 'Jev' || expected === 'LLM Decision', `${label}: neither Jev nor LLM Decision has a credential (LLM Decision needs none): ${expected}`);
    await assertSelects(ctx, probe, fixtures, expected, label);
    return { Candidates: candidates, Selected: expected };
}

/** PX5 with a Perplexity credential bound to the Decider's row: credentialed, still behind both, not selected. */
async function assertSelectionWithBoundDecider(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams,
    pristine: { Candidates: ModelVendorCandidate[]; Selected: string },
): Promise<void> {
    const label = 'PX5 bound';
    const bound = probe.Candidates(prompt, params);
    AssertEqual(bound.map(describeCandidate).join(', '), pristine.Candidates.map(describeCandidate).join(', '), `${label}: the candidates and their order`);
    const decider = requireDeciderBehindBoundModels(bound, label);
    Assert(probe.HasCredentials(decider, prompt, params), `${label}: the Decider has no credential after its row was bound`);
    const result = await assertSelects(ctx, probe, fixtures, pristine.Selected, label);
    const considered = result.modelSelectionInfo?.ModelsConsidered.find(c => c.model.Name === MODEL_NAME && c.vendor?.Name === VENDOR_NAME);
    AssertEqual(considered?.available, true, `${label}: the run saw the Decider as available`);
}

/** Every decision driver but Perplexity's, made unavailable for PX5's failover leg. */
const UNAVAILABLE_DRIVER_CLASSES: readonly string[] = ['OpenRouterDecision', 'LLMDecision', 'CloudflareDecision', 'SystemOneDecision'];

/**
 * PX5 failover: with every other decision driver unavailable, `Default Decision` fails over from model to
 * model, past every credentialed candidate ahead of the Decider, and the real `PerplexityDecision` answers
 * with the bound token (through the guard).
 */
async function assertFailoverReachesBoundDecider(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, prompt: MJAIPromptEntityExtended, params: AIDecisionParams): Promise<void> {
    const label = 'PX5 failover';
    const candidates = probe.Candidates(prompt, params);
    const decider = requireDeciderBehindBoundModels(candidates, label);
    const credentialedAhead = candidates.slice(0, candidates.indexOf(decider)).filter(c => probe.HasCredentials(c, prompt, params));
    const unexpected = credentialedAhead.filter(c => !UNAVAILABLE_DRIVER_CLASSES.includes(c.driverClass));
    AssertEqual(unexpected.map(describeCandidate).join(', '), '', `${label}: credentialed candidates ahead of the Decider that this leg cannot make unavailable`);

    const restores = UNAVAILABLE_DRIVER_CLASSES.map(name => RegisterDecisionStandIn(name, UnavailableDecision));
    const before = perplexity.Requests.length;
    const attemptsBefore = probe.Attempts.length;
    let result: AIDecisionRunResult;
    try {
        result = await withGuardArmed(() => runDecision(probe, quickstartParams(ctx, prompt), fixtures));
    } finally {
        for (const restore of restores.reverse()) {
            restore();
        }
    }
    assertAnsweredByDecider(result, label);
    assertOneQuickstartRequest(before, PX5_TOKEN, label);
    assertQuickstartAnswers(result, label);
    const attempts = probe.Attempts.slice(attemptsBefore);
    AssertEqual(
        JSON.stringify(attempts.map(a => `${modelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}:${a.WillRetry ? 'retry' : 'stop'}`)),
        JSON.stringify(credentialedAhead.map(c => `${c.model.Name}:ServiceUnavailable:retry`)),
        `${label}: the failed attempts before the Decider`,
    );
    Assert(attempts.some(a => modelNameOf(a.Attempt.modelId) === 'LLM Decision'), `${label}: LLM Decision was not tried before the Decider`);
}

/** A model's name by ID, for comparisons and messages. */
function modelNameOf(modelId: string): string {
    return AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelId))?.Name ?? `unknown model ${modelId}`;
}

async function checkDefaultDecisionSelection(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const prompt = RequireDefaultDecisionPrompt();
    const probe = new DecisionRunnerProbe();
    const params = quickstartParams(ctx, prompt);
    const fixtures = new DecisionFixtures(ctx, 'px5');
    try {
        const decider = new ScriptedDecision();
        decider.Arm();
        const restoreScripted = RegisterScriptedDecision(decider, SCRIPTED_DECISION_DRIVER_CLASSES);
        const before = perplexity.Requests.length;
        try {
            const pristine = await assertSelectionWithoutCredential(ctx, probe, fixtures, prompt, params);
            const credential = await fixtures.CreateCredential(CREDENTIAL_TYPE, 'PX5 Perplexity Decider', { apiKey: PX5_TOKEN });
            await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID(MODEL_NAME, VENDOR_NAME));
            await assertSelectionWithBoundDecider(ctx, probe, fixtures, prompt, params, pristine);
        } finally {
            decider.Disarm();
            restoreScripted();
        }
        AssertEqual(perplexity.Requests.length - before, 0, 'PX5: requests to the Decisions API while Jev or LLM Decision was selected');
        await assertFailoverReachesBoundDecider(ctx, probe, fixtures, prompt, params);
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const PerplexityDeciderChecks: NamedCheck[] = [
    {
        Id: 'perplexity-decider.PX1',
        Name: 'PX1: Perplexity Decider v1 27B is an Active Decision model with its limits, Perplexity rows naming PerplexityDecision and pplx-decider-v1-27b, and a cost row; the Perplexity vendor takes an API Key',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            checkCatalog();
        },
    },
    {
        Id: 'perplexity-decider.PX2',
        Name: "PX2: ClassFactory.CreateInstance(BaseDecision, 'PerplexityDecision', key) returns the shipped PerplexityDecision, which posts to https://api.perplexity.ai/v1/decisions",
        Fn: async (): Promise<void> => {
            checkFactoryBuildsDriver();
        },
    },
    {
        Id: 'perplexity-decider.PX3',
        Name: "PX3: AIDecisionRunner with override naming the Decider sends Perplexity's quickstart request with the key as the bearer, maps its response, and records the run against the model and Perplexity, priced from the cost row",
        Fn: checkRunnerCall,
    },
    {
        Id: 'perplexity-decider.PX4',
        Name: "PX4: a real API Key credential bound to the Decider's Perplexity row sends its token, not its JSON, as the bearer",
        Fn: checkBoundCredential,
    },
    {
        Id: 'perplexity-decider.PX5',
        Name: "PX5: Default Decision's candidates and selection are unchanged with a Perplexity credential bound: the Decider stays a fallback behind Jev and LLM Decision, and is reached only by failing over from both",
        Fn: checkDefaultDecisionSelection,
    },
];

for (const check of PerplexityDeciderChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('perplexity-decider', {
    Setup: async (): Promise<void> => {
        perplexity.Requests.length = 0;
        perplexity.Armed = false;
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseDecision, DRIVER_CLASS);
        registeredBeforeGuard = registration ? registration.SubClass : undefined;
        bundleRestores.push(RegisterDecisionStandIn(DRIVER_CLASS, ScriptedPerplexityDecision, PerplexityDecision));
    },
    Teardown: async (): Promise<void> => {
        await DecisionFixtures.CleanupAll();
        perplexity.Armed = false;
        perplexity.Requests.length = 0;
        for (const restore of bundleRestores.splice(0).reverse()) {
            restore();
        }
        registeredBeforeGuard = undefined;
    },
});
