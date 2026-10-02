/**
 * cloudflare-clef.checks.ts — the 'cloudflare-clef' bundle (CF1–CF3): Cloudflare's Clef and
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
 *
 * NO NETWORK. CF3 registers a subclass of `CloudflareDecision` over the `CloudflareDecision` key for
 * the length of the check; it overrides only `SendRequest`, the driver's one network call, and answers
 * with a Workers AI response in Cloudflare's v4 envelope. Everything else is real: the prompt, model
 * and vendor rows, candidate selection, credential resolution (a legacy `apiKeys` entry), the driver's
 * URL, header and body building, the answer mapping, `BaseDecision`'s validation and the run row.
 *
 * TRANSPORT: SERVER-ONLY by necessity: the stand-in is a ClassFactory registration in this process.
 *
 * FIXTURES: none seeded; the models are shipped metadata, read only. Every prompt run CF3 creates is
 * deleted in Teardown.
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
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIVendorEntity } from '@memberjunction/core-entities';
import { AIDecisionParams, AIDecisionRunner } from '@memberjunction/ai-prompts';
import { CloudflareDecision } from '@memberjunction/ai-cloudflare';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, RequireRows } from './agent-live-shared';

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

/**
 * The real `CloudflareDecision` with only its network call replaced: it records the request and
 * answers with {@link scriptedEnvelope} for the model the URL names.
 */
class ScriptedWorkersAIDecision extends CloudflareDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        const body: unknown = JSON.parse(String(init.body));
        sentRequests.push({ Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: body });
        const wireModel = IsSystemOneWireObject(body) && typeof body['model'] === 'string' ? body['model'] : 'unknown';
        return new Response(JSON.stringify(scriptedEnvelope(wireModel)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}

/** The highest priority registered on BaseDecision for `name`, or 0 when it has none. */
function highestDecisionPriority(name: string): number {
    return Math.max(0, ...MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseDecision, name).map(r => r.Priority));
}

/**
 * Registers the stand-in over `CloudflareDecision` above whatever is registered there, and returns a
 * restore that puts the previous class back on top.
 */
function registerStandIn(): () => void {
    const factory = MJGlobal.Instance.ClassFactory;
    const previous = factory.GetRegistration(BaseDecision, DRIVER_CLASS);
    factory.Register(BaseDecision, ScriptedWorkersAIDecision, DRIVER_CLASS, highestDecisionPriority(DRIVER_CLASS) + 1);
    return () => {
        factory.Register(BaseDecision, previous ? previous.SubClass : CloudflareDecision, DRIVER_CLASS, highestDecisionPriority(DRIVER_CLASS) + 1);
    };
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
    AssertEqual(result.DecisionResult?.ResolvedModel, entry.WireModel, `${label}: resolved model`);

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
];

for (const check of CloudflareClefChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('cloudflare-clef', {
    Setup: async (): Promise<void> => {
        sentRequests.length = 0;
        createdPromptRunIDs.length = 0;
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        for (const id of createdPromptRunIDs.splice(0)) {
            await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User);
        }
        sentRequests.length = 0;
    },
});
