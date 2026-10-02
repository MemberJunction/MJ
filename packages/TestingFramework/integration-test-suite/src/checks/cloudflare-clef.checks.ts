/**
 * cloudflare-clef.checks.ts — the 'cloudflare-clef' bundle (CF1–CF6): Cloudflare's Clef and
 * Clef-flash decision models, from the synced metadata through `AIDecisionRunner` to the Workers AI
 * request, with no network.
 *
 * WHAT IT PROVES, against this database's metadata:
 *   CF1  the synced catalog: `Clef` and `Clef-flash` are Active `Decision` models with their Decision
 *        limits, each with a Cloudflare Model Developer row, a Cloudflare Inference Provider row naming
 *        `CloudflareDecision` and its `@cf/cloudflare/...` APIName, and an active input-token cost row;
 *        the `Cloudflare` vendor takes an API Key credential.
 *   CF2  `ClassFactory.CreateInstance(BaseDecision, 'CloudflareDecision', key)` builds the real driver,
 *        which reads the account ID from a compound key.
 *   CF3  a real `AIDecisionRunner.ExecuteDecision` with `override` naming each model selects it with
 *        the Cloudflare vendor and `CloudflareDecision`, sends the System One body for all three
 *        question kinds to the account's Workers AI URL with the token alone as the bearer, maps the
 *        scripted answers (Score probabilities re-keyed by level, Choice renormalised), and records the
 *        `MJ: AI Prompt Runs` row against that model and vendor, priced from its cost row.
 *   CF4  Cloudflare's v4 envelope reporting `success: false` fails the call with the envelope's
 *        `errors[].message`, whether it comes with a 200 or a 5xx, and the runner fails over to the next
 *        candidate: Clef alone fails with that message; a test prompt bound to Clef, then Clef-flash,
 *        answers from Clef-flash.
 *   CF5  a bare System One response (no envelope, as a Worker or AI Gateway may return it) is accepted
 *        and mapped.
 *   CF6  a real `API Key` credential whose values carry an `accountId`, created through
 *        `CredentialEngine` and bound to Clef's Cloudflare row, sends the request to that account's
 *        Workers AI URL with its token as the bearer.
 *
 * NO NETWORK. CF3–CF6 register a subclass of `CloudflareDecision` over the `CloudflareDecision` key for
 * the length of the check; it overrides only `SendRequest`, the driver's one network call, and answers
 * as the check scripts it (by default, a Workers AI response in Cloudflare's v4 envelope). Everything
 * else is real: the prompt, model and vendor rows, candidate selection, credential resolution (a legacy
 * `apiKeys` entry, or a bound `MJ: Credentials` row in CF6), the driver's URL, header and body building,
 * the envelope handling, the answer mapping, `BaseDecision`'s validation, the failover loop and the run
 * row. The environment variables that would give the driver an account ID or base URL are unset for the
 * bundle and restored after it.
 *
 * TRANSPORT: SERVER-ONLY by necessity: the stand-in is a ClassFactory registration in this process.
 *
 * FIXTURES: none seeded; the models are shipped metadata, read only. CF4 and CF6 create a test Decision
 * prompt or a credential and binding (decision-fixtures.ts) and delete them in a `finally`; Teardown
 * deletes whatever a failed check left, and every prompt run the bundle creates.
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    BaseDecision,
    IsSystemOneWireObject,
    type ChoiceAnswer,
    type DecisionQuestion,
    type LikelihoodAnswer,
    type ScoreAnswer,
    type SystemOneWireObject,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIVendorEntity } from '@memberjunction/core-entities';
import { AIDecisionParams, AIDecisionRunner, type AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { CloudflareDecision } from '@memberjunction/ai-cloudflare';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, RequireRows } from './agent-live-shared';
import {
    ClearEnvironment,
    DecisionFixtures,
    DecisionRunnerProbe,
    ReadDecisionPromptRun,
    RegisterDecisionStandIn,
    RequireInferenceRowID,
} from './decision-fixtures';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const DRIVER_CLASS = 'CloudflareDecision';
const VENDOR_NAME = 'Cloudflare';
const DEFAULT_DECISION_PROMPT = 'Default Decision';

/** A fake compound credential: never sent anywhere, the stand-in answers instead. */
const IT_ACCOUNT_ID = 'it-cloudflare-account';
const IT_API_TOKEN = 'it-cloudflare-token-no-network';

/** The two shipped Clef models: their APIName, wire model name and input price per million tokens. */
const CLEF_MODELS = [
    { Name: 'Clef', APIName: '@cf/cloudflare/clef', WireModel: 'clef', InputPricePerMillion: 0.24 },
    { Name: 'Clef-flash', APIName: '@cf/cloudflare/clef-flash', WireModel: 'clef-flash', InputPricePerMillion: 0.09 },
] as const;

type ClefModel = (typeof CLEF_MODELS)[number];

/** The Decision limits both models declare. */
const DECISION_LIMITS = { MaxQuestionsPerCall: 64, MaxChoiceOptions: 255, MaxScoreLevels: 10, MaxStateTokens: 65536 } as const;

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

/** The System One body the driver must send for {@link QUESTIONS}, but for the model field. */
const EXPECTED_WIRE_QUESTIONS = {
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

/** The input tokens the scripted response reports: the run's cost is these at the model's input price. */
const SCRIPTED_INPUT_TOKENS = 1000;

/**
 * The scripted Workers AI response, in Cloudflare's v4 envelope. The Choice probabilities sum to 0.98
 * (the API rounds), and the Score probabilities are keyed by level index.
 */
function scriptedEnvelope(wireModel: string): SystemOneWireObject {
    return {
        result: {
            model: wireModel,
            answers: {
                urgent: { type: 'noul', noul: 0.91 },
                team: { type: 'choice', choice: 'technical', probabilities: { billing: 0.02, technical: 0.95, sales: 0.01 }, confidence: 0.9 },
                severity: {
                    type: 'score',
                    score: 2.7,
                    legend: { '0': 'No impact', '1': 'Minor', '2': 'Major', '3': 'Critical' },
                    probabilities: { '0': 0, '1': 0.05, '2': 0.2, '3': 0.75 },
                    confidence: 0.8,
                },
            },
            usage: { input_tokens: SCRIPTED_INPUT_TOKENS, output_tokens: 0 },
        },
        success: true,
        errors: [],
        messages: [],
    };
}

// ─── The HTTP stand-in ───────────────────────────────────────────────────────────────────────────

/** One request the stand-in received. */
interface WorkersAIRequest {
    Url: string;
    Authorization: string | null;
    Body: unknown;
}

/** What the stand-ins were sent. Module state, because the runner builds its own driver instance. */
const sentRequests: WorkersAIRequest[] = [];

/** How the stand-in answers: a response for the wire model the request names. */
type WorkersAIResponder = (wireModel: string) => Response;

/** A JSON response with the given status. */
function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The default answer: {@link scriptedEnvelope} for the model the request names. */
const answerWithEnvelope: WorkersAIResponder = wireModel => jsonResponse(200, scriptedEnvelope(wireModel));

/** How the stand-in answers now. A check that changes it puts {@link answerWithEnvelope} back in a `finally`. */
let respondAs: WorkersAIResponder = answerWithEnvelope;

/**
 * The real `CloudflareDecision` with only its network call replaced: it records the request and
 * answers as {@link respondAs} scripts it for the model the request names.
 */
class ScriptedWorkersAIDecision extends CloudflareDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        const body: unknown = JSON.parse(String(init.body));
        sentRequests.push({ Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: body });
        const wireModel = IsSystemOneWireObject(body) && typeof body['model'] === 'string' ? body['model'] : 'unknown';
        return respondAs(wireModel);
    }
}

/** Registers the stand-in over `CloudflareDecision` and returns the restore. */
function registerStandIn(): () => void {
    return RegisterDecisionStandIn(DRIVER_CLASS, ScriptedWorkersAIDecision, CloudflareDecision);
}

/** Runs `work` with the stand-in registered and answering as `responder`, then restores both. */
async function withStandIn(responder: WorkersAIResponder, work: () => Promise<void>): Promise<void> {
    const restore = registerStandIn();
    respondAs = responder;
    try {
        await work();
    } finally {
        respondAs = answerWithEnvelope;
        restore();
    }
}

// ─── Fixture ─────────────────────────────────────────────────────────────────────────────────────

/** The prompt runs CF3 created, deleted in Teardown. */
const createdPromptRunIDs: string[] = [];

interface PromptRunRow {
    ID: string;
    PromptID: string;
    ModelID: string;
    VendorID: string | null;
    Success: boolean | null;
    TokensPrompt: number | null;
    Cost: number | null;
    Result: string | null;
}

async function readPromptRun(ctx: IntegrationCheckContext, id: string): Promise<PromptRunRow | undefined> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID='${EscapeSQLString(id)}'`,
        Fields: ['ID', 'PromptID', 'ModelID', 'VendorID', 'Success', 'TokensPrompt', 'Cost', 'Result'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    return RequireRows(result, `prompt run ${id}`)[0];
}

function requireModel(name: string): MJAIModelEntityExtended {
    const model = AIEngine.Instance.Models.find(m => m.Name === name);
    if (!model) {
        throw new Error(`The '${name}' model is not in this database: sync the metadata (mj sync push --dir=metadata)`);
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

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

/** CF1 for one model: its type, limits, vendor rows and cost row. */
function assertCatalogRow(entry: ClefModel, vendorId: string): void {
    const model = requireModel(entry.Name);
    const label = `CF1 ${entry.Name}`;
    AssertEqual(model.IsActive, true, `${label}: IsActive`);
    AssertEqual(model.AIModelType, 'Decision', `${label}: model type`);

    const rows = AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId));
    const developer = rows.filter(mv => mv.Type === 'Model Developer');
    const providers = rows.filter(mv => mv.Type === 'Inference Provider');
    AssertEqual(developer.length, 1, `${label}: Cloudflare Model Developer rows`);
    AssertEqual(providers.length, 1, `${label}: Cloudflare Inference Provider rows`);
    const provider = providers[0];
    AssertEqual(provider.Status, 'Active', `${label}: inference row status`);
    AssertEqual(provider.DriverClass, DRIVER_CLASS, `${label}: inference row DriverClass`);
    AssertEqual(provider.APIName, entry.APIName, `${label}: inference row APIName`);
    AssertEqual(provider.MaxInputTokens, DECISION_LIMITS.MaxStateTokens, `${label}: inference row MaxInputTokens`);
    AssertEqual(provider.SupportsStreaming, false, `${label}: inference row SupportsStreaming`);

    const limits = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, provider.ID)?.Decision;
    Assert(!!limits, `${label}: no effective Decision configuration`);
    AssertEqual(limits!.MaxQuestionsPerCall, DECISION_LIMITS.MaxQuestionsPerCall, `${label}: MaxQuestionsPerCall`);
    AssertEqual(limits!.MaxChoiceOptions, DECISION_LIMITS.MaxChoiceOptions, `${label}: MaxChoiceOptions`);
    AssertEqual(limits!.MaxScoreLevels, DECISION_LIMITS.MaxScoreLevels, `${label}: MaxScoreLevels`);
    AssertEqual(limits!.MaxStateTokens, DECISION_LIMITS.MaxStateTokens, `${label}: MaxStateTokens`);

    const cost = AIEngine.Instance.GetActiveModelCost(model.ID, vendorId, 'Realtime');
    Assert(!!cost, `${label}: no active Realtime cost row for Cloudflare`);
    assertClose(cost!.InputPricePerUnit, entry.InputPricePerMillion, `${label}: input price per unit`);
    assertClose(cost!.OutputPricePerUnit, 0, `${label}: output price per unit`);
    AssertEqual(cost!.UnitType, 'Per 1M Tokens', `${label}: cost unit type`);
}

/** Asserts the answers came back mapped from {@link scriptedEnvelope}, and the dated model from `wireModel`. */
function assertScriptedAnswers(result: AIDecisionRunResult, wireModel: string, label: string): void {
    const urgent = result.Answers['urgent'] as LikelihoodAnswer;
    AssertEqual(urgent?.Kind, 'Likelihood', `${label}: urgent kind`);
    assertClose(urgent.Probability, 0.91, `${label}: urgent probability`);
    const team = result.Answers['team'] as ChoiceAnswer;
    AssertEqual(team?.Value, 'technical', `${label}: team choice`);
    assertClose(team.Probabilities['technical'], 0.95 / 0.98, `${label}: team probability renormalised`);
    assertClose(team.Probabilities['billing'] + team.Probabilities['technical'] + team.Probabilities['sales'], 1, `${label}: team probabilities sum`);
    const severity = result.Answers['severity'] as ScoreAnswer;
    assertClose(severity?.Value, 2.7, `${label}: severity score`);
    AssertEqual(JSON.stringify(severity.Probabilities), JSON.stringify({ 'No impact': 0, Minor: 0.05, Major: 0.2, Critical: 0.75 }), `${label}: severity probabilities keyed by level`);
    AssertEqual(result.DecisionResult?.ResolvedModel, wireModel, `${label}: resolved model`);
}

/** CF3 for one model: one real runner call through the stand-in, then the request, answers and run row. */
async function runThroughRunner(ctx: IntegrationCheckContext, entry: ClefModel, vendorId: string): Promise<void> {
    const label = `CF3 ${entry.Name}`;
    const model = requireModel(entry.Name);
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === DEFAULT_DECISION_PROMPT);
    Assert(!!prompt, `${label}: the '${DEFAULT_DECISION_PROMPT}' prompt is not in this database`);

    const params = new AIDecisionParams();
    params.prompt = prompt!;
    params.contextUser = ctx.User;
    params.override = { modelId: model.ID, vendorId };
    params.apiKeys = [{ driverClass: DRIVER_CLASS, apiKey: `${IT_ACCOUNT_ID}:${IT_API_TOKEN}` }];
    params.State = STATE;
    params.Questions = QUESTIONS;

    const sentBefore = sentRequests.length;
    const runner = new AIDecisionRunner();
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    if (result.promptRun?.ID) {
        createdPromptRunIDs.push(result.promptRun.ID);
    }

    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.DriverClass, DRIVER_CLASS, `${label}: answering driver class`);
    AssertEqual(result.modelInfo?.modelName, entry.Name, `${label}: answering model`);
    AssertEqual(result.modelInfo?.vendorName, VENDOR_NAME, `${label}: answering vendor`);

    // The request the driver built.
    AssertEqual(sentRequests.length - sentBefore, 1, `${label}: Workers AI requests`);
    const sent = sentRequests[sentRequests.length - 1];
    AssertEqual(sent.Url, `https://api.cloudflare.com/client/v4/accounts/${IT_ACCOUNT_ID}/ai/run/${entry.APIName}`, `${label}: request URL`);
    AssertEqual(sent.Authorization, `Bearer ${IT_API_TOKEN}`, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(sent.Body), JSON.stringify({ model: entry.WireModel, state: STATE, questions: EXPECTED_WIRE_QUESTIONS }), `${label}: request body`);

    // The answers, mapped.
    assertScriptedAnswers(result, entry.WireModel, label);

    // The run row.
    Assert(!!result.promptRun?.ID, `${label}: no prompt run`);
    const row = await readPromptRun(ctx, result.promptRun!.ID);
    Assert(!!row, `${label}: prompt run ${result.promptRun!.ID} was not found`);
    Assert(UUIDsEqual(row!.PromptID, prompt!.ID), `${label}: run prompt is not ${DEFAULT_DECISION_PROMPT}`);
    Assert(UUIDsEqual(row!.ModelID, model.ID), `${label}: run model ${row!.ModelID} is not ${entry.Name}`);
    Assert(!!row!.VendorID && UUIDsEqual(row!.VendorID, vendorId), `${label}: run vendor ${String(row!.VendorID)} is not ${VENDOR_NAME}`);
    AssertEqual(row!.Success, true, `${label}: run Success`);
    AssertEqual(row!.TokensPrompt, SCRIPTED_INPUT_TOKENS, `${label}: run TokensPrompt`);
    assertClose(row!.Cost, (SCRIPTED_INPUT_TOKENS * entry.InputPricePerMillion) / 1_000_000, `${label}: run Cost from the cost row`);
    const recorded: unknown = JSON.parse(row!.Result ?? '{}');
    Assert(IsSystemOneWireObject(recorded) && IsSystemOneWireObject(recorded['team']) && recorded['team']['Value'] === 'technical', `${label}: run Result does not hold the mapped answers`);
}

// ─── CF4–CF6 ─────────────────────────────────────────────────────────────────────────────────────

/** The legacy key CF3–CF5 resolve: `<accountId>:<apiToken>`. */
const LEGACY_KEY = `${IT_ACCOUNT_ID}:${IT_API_TOKEN}`;

/** A Workers AI v4 envelope reporting a failure. */
function failureEnvelope(code: number, message: string): SystemOneWireObject {
    return { result: null, success: false, errors: [{ code, message }], messages: [] };
}

/**
 * The envelope failures CF4 scripts for Clef: one that arrives with a 200, one with a 500. `Error` is
 * the message the driver must throw: the envelope's `errors[].message` alone, never the raw body,
 * which would still contain the message and so prove nothing about the 500's handling.
 */
const ENVELOPE_FAILURES = [
    {
        Label: 'CF4 200',
        Status: 200,
        Code: 3040,
        Message: 'Capacity temporarily exceeded, please try again.',
        Error: 'Cloudflare Workers AI reported a failure (HTTP 200): Capacity temporarily exceeded, please try again.',
    },
    {
        Label: 'CF4 500',
        Status: 500,
        Code: 5007,
        Message: 'AiError: inference failed on the upstream model',
        Error: 'Cloudflare Workers AI returned HTTP 500: AiError: inference failed on the upstream model',
    },
] as const;

/** Clef answers with `status` and `envelope`; every other model with the scripted envelope. */
function clefFailsWith(status: number, envelope: SystemOneWireObject): WorkersAIResponder {
    return wireModel => (wireModel === 'clef' ? jsonResponse(status, envelope) : jsonResponse(200, scriptedEnvelope(wireModel)));
}

/** A decision request on `prompt`, or on Default Decision naming `modelName` on Cloudflare, with the legacy key when given. */
function clefParams(ctx: IntegrationCheckContext, prompt: MJAIPromptEntityExtended, overrideModel?: string, apiKey?: string): AIDecisionParams {
    const params = new AIDecisionParams();
    params.prompt = prompt;
    params.contextUser = ctx.User;
    if (overrideModel) {
        params.override = { modelId: requireModel(overrideModel).ID, vendorId: requireVendor().ID };
    }
    if (apiKey) {
        params.apiKeys = [{ driverClass: DRIVER_CLASS, apiKey }];
    }
    params.State = STATE;
    params.Questions = QUESTIONS;
    return params;
}

function requireDefaultDecision(): MJAIPromptEntityExtended {
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === DEFAULT_DECISION_PROMPT);
    if (!prompt) {
        throw new Error(`The '${DEFAULT_DECISION_PROMPT}' prompt is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return prompt;
}

/** Runs one decision, waits for its run row and hands its ID to `fixtures` for deletion. */
async function runDecision(runner: AIDecisionRunner, params: AIDecisionParams, fixtures: DecisionFixtures): Promise<AIDecisionRunResult> {
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    fixtures.TrackPromptRun(result.promptRun?.ID);
    return result;
}

/** The wire model each request since `before` named, from its URL's last segment. */
function requestedModels(before: number): string[] {
    return sentRequests.slice(before).map(r => r.Url.slice(r.Url.lastIndexOf('/') + 1));
}

/** CF4 for one envelope failure: Clef alone fails with Cloudflare's message; Clef then Clef-flash fails over. */
async function runEnvelopeFailure(ctx: IntegrationCheckContext, fixtures: DecisionFixtures, failoverPrompt: MJAIPromptEntityExtended, failure: (typeof ENVELOPE_FAILURES)[number]): Promise<void> {
    const label = failure.Label;
    // Clef alone: the call fails and carries Cloudflare's message, to the result and the run row.
    let before = sentRequests.length;
    const alone = await runDecision(new AIDecisionRunner(), clefParams(ctx, requireDefaultDecision(), 'Clef', LEGACY_KEY), fixtures);
    AssertEqual(JSON.stringify(requestedModels(before)), JSON.stringify(['clef']), `${label} alone: requests`);
    Assert(!alone.success, `${label} alone: the decision succeeded`);
    Assert((alone.errorMessage ?? '').includes(failure.Error), `${label} alone: the error is not '${failure.Error}': ${alone.errorMessage}`);
    const row = await ReadDecisionPromptRun(ctx, alone.promptRun?.ID ?? '');
    AssertEqual(row?.Success, false, `${label} alone: run Success`);
    Assert((row?.ErrorMessage ?? '').includes(failure.Error), `${label} alone: the run's error is not '${failure.Error}': ${row?.ErrorMessage}`);

    // Clef, then Clef-flash: the runner fails over past the failure, and Clef-flash answers.
    before = sentRequests.length;
    const probe = new DecisionRunnerProbe();
    const result = await runDecision(probe, clefParams(ctx, failoverPrompt, undefined, LEGACY_KEY), fixtures);
    AssertEqual(JSON.stringify(requestedModels(before)), JSON.stringify(['clef', 'clef-flash']), `${label} failover: requests`);
    Assert(result.success, `${label} failover: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.modelInfo?.modelName, 'Clef-flash', `${label} failover: answering model`);
    assertScriptedAnswers(result, 'clef-flash', `${label} failover`);
    AssertEqual(probe.Attempts.length, 1, `${label} failover: failed attempts`);
    const attempt = probe.Attempts[0];
    Assert(UUIDsEqual(attempt.Attempt.modelId, requireModel('Clef').ID), `${label} failover: the failed attempt was not Clef`);
    AssertEqual(attempt.WillRetry, true, `${label} failover: Clef's failure allowed failover`);
    AssertEqual(attempt.Attempt.error.message, failure.Error, `${label} failover: Clef's error`);
}

async function checkEnvelopeFailure(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'cf4');
    try {
        const created = await fixtures.CreateDecisionPrompt('CF4 envelope failover', {
            Bindings: [
                { Key: 'clef', ModelName: 'Clef', VendorName: VENDOR_NAME, Priority: 20 },
                { Key: 'clef-flash', ModelName: 'Clef-flash', VendorName: VENDOR_NAME, Priority: 10 },
            ],
        });
        for (const failure of ENVELOPE_FAILURES) {
            await withStandIn(clefFailsWith(failure.Status, failureEnvelope(failure.Code, failure.Message)), () =>
                runEnvelopeFailure(ctx, fixtures, created.Prompt, failure));
        }
    } finally {
        await fixtures.Cleanup();
    }
}

/** Answers with the System One response bare, as a Worker or an AI Gateway may return it. */
const answerBare: WorkersAIResponder = wireModel => jsonResponse(200, scriptedEnvelope(wireModel)['result']);

async function checkBareResponse(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'cf5');
    try {
        await withStandIn(answerBare, async () => {
            const before = sentRequests.length;
            const result = await runDecision(new AIDecisionRunner(), clefParams(ctx, requireDefaultDecision(), 'Clef', LEGACY_KEY), fixtures);
            AssertEqual(JSON.stringify(requestedModels(before)), JSON.stringify(['clef']), 'CF5: requests');
            Assert(result.success, `CF5: the decision failed: ${result.errorMessage ?? 'no error message'}`);
            AssertEqual(result.modelInfo?.modelName, 'Clef', 'CF5: answering model');
            assertScriptedAnswers(result, 'clef', 'CF5');
            AssertEqual(result.promptTokens, SCRIPTED_INPUT_TOKENS, 'CF5: input tokens from the bare usage');
        });
    } finally {
        await fixtures.Cleanup();
    }
}

/** The account and token a CF6 credential carries in its values. */
const JSON_CREDENTIAL = { AccountID: 'it-json-credential-account', Token: 'it-json-credential-token' } as const;

async function checkJsonCredential(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'cf6');
    try {
        const credential = await fixtures.CreateCredential('API Key', 'CF6 Clef', { apiKey: JSON_CREDENTIAL.Token, accountId: JSON_CREDENTIAL.AccountID });
        await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID('Clef', VENDOR_NAME));
        await withStandIn(answerWithEnvelope, async () => {
            const before = sentRequests.length;
            const result = await runDecision(new AIDecisionRunner(), clefParams(ctx, requireDefaultDecision(), 'Clef'), fixtures);
            Assert(result.success, `CF6: the decision failed: ${result.errorMessage ?? 'no error message'}`);
            AssertEqual(sentRequests.length - before, 1, 'CF6: Workers AI requests');
            const sent = sentRequests[sentRequests.length - 1];
            AssertEqual(sent.Url, `https://api.cloudflare.com/client/v4/accounts/${JSON_CREDENTIAL.AccountID}/ai/run/@cf/cloudflare/clef`, 'CF6: request URL');
            AssertEqual(sent.Authorization, `Bearer ${JSON_CREDENTIAL.Token}`, 'CF6: Authorization header');
            assertScriptedAnswers(result, 'clef', 'CF6');
        });
    } finally {
        await fixtures.Cleanup();
    }
}

export const CloudflareClefChecks: NamedCheck[] = [
    {
        Id: 'cloudflare-clef.CF1',
        Name: 'CF1: Clef and Clef-flash are Active Decision models with their limits, Cloudflare vendor rows naming CloudflareDecision, and cost rows',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            const vendor = requireVendor();
            AssertEqual(vendor.CredentialType, 'API Key', 'CF1: the Cloudflare vendor credential type');
            for (const entry of CLEF_MODELS) {
                assertCatalogRow(entry, vendor.ID);
            }
        },
    },
    {
        Id: 'cloudflare-clef.CF2',
        Name: "CF2: ClassFactory.CreateInstance(BaseDecision, 'CloudflareDecision', key) returns a CloudflareDecision that reads the account from a compound key",
        Fn: async (): Promise<void> => {
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, DRIVER_CLASS, `${IT_ACCOUNT_ID}:${IT_API_TOKEN}`);
            if (!(driver instanceof CloudflareDecision)) {
                throw new Error(`CF2: the factory built ${driver?.constructor?.name ?? 'nothing'}, not a CloudflareDecision`);
            }
            AssertEqual(driver.constructor, CloudflareDecision, 'CF2: the registered class is the shipped driver, not a stand-in');
            AssertEqual(driver.AccountID, IT_ACCOUNT_ID, 'CF2: account ID from the compound key');
        },
    },
    {
        Id: 'cloudflare-clef.CF3',
        Name: 'CF3: AIDecisionRunner with override naming Clef or Clef-flash sends the Workers AI request, maps the answers and records the run against the model and Cloudflare',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            const vendorId = requireVendor().ID;
            const restore = registerStandIn();
            try {
                for (const entry of CLEF_MODELS) {
                    await runThroughRunner(ctx, entry, vendorId);
                }
            } finally {
                restore();
            }
        },
    },
    {
        Id: 'cloudflare-clef.CF4',
        Name: "CF4: a Workers AI envelope with success false, with a 200 or a 5xx, fails the call with the envelope's error message, and the runner fails over from Clef to Clef-flash",
        Fn: checkEnvelopeFailure,
    },
    {
        Id: 'cloudflare-clef.CF5',
        Name: 'CF5: a bare System One response from Workers AI, with no v4 envelope, is accepted and its answers mapped',
        Fn: checkBareResponse,
    },
    {
        Id: 'cloudflare-clef.CF6',
        Name: "CF6: a real API Key credential carrying an accountId, bound to Clef's Cloudflare row, sends the request to that account's Workers AI URL with its token as the bearer",
        Fn: checkJsonCredential,
    },
];

for (const check of CloudflareClefChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

/** Restores the environment Setup cleared. */
let restoreEnvironment: (() => void) | undefined;

IntegrationCheckRegistry.Instance.RegisterLifecycle('cloudflare-clef', {
    Setup: async (): Promise<void> => {
        sentRequests.length = 0;
        createdPromptRunIDs.length = 0;
        respondAs = answerWithEnvelope;
        restoreEnvironment = ClearEnvironment([CloudflareDecision.ACCOUNT_ID_ENV_VAR, CloudflareDecision.BASE_URL_ENV_VAR]);
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await DecisionFixtures.CleanupAll();
        for (const id of createdPromptRunIDs.splice(0)) {
            await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User);
        }
        sentRequests.length = 0;
        respondAs = answerWithEnvelope;
        restoreEnvironment?.();
        restoreEnvironment = undefined;
    },
});
