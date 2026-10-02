/**
 * systemone-kev.checks.ts — the 'systemone-kev' bundle (KV1–KV3): Jared Palmer's Kev decision models
 * and the generic `SystemOneDecision` driver, from the synced metadata through `AIDecisionRunner` to a
 * real HTTP request against a System One server running in this process.
 *
 * WHAT IT PROVES, against this database's metadata:
 *   KV1  the synced catalog: the `System One Endpoint` vendor takes an `API Key with Endpoint`
 *        credential; `Kev-0.8B`, `Kev-4B`, `Kev-9B` and `Kev-27B` are Active `Decision` models with their
 *        limits, each with one Active System One Endpoint row naming `SystemOneDecision` and
 *        `kev-latest`, and no cost row there (the customer runs the GPU); `Kev-4B` also has an OpenRouter
 *        row naming `OpenRouterDecision` and `jaredpalmer/kev-4b-20260924`, preferred over its self-hosted
 *        row, with an active input-token cost row.
 *   KV2  `ClassFactory.CreateInstance(BaseDecision, 'SystemOneDecision', credential)` builds the shipped
 *        driver, which reads the endpoint from an `API Key with Endpoint` credential's JSON.
 *   KV3  a real `AIDecisionRunner.ExecuteDecision` with `override` naming Kev-4B (with a token) and
 *        Kev-27B (open server, no token) on the System One Endpoint vendor POSTs the System One body to
 *        `<endpoint>/v1/systemone` (a bearer token only when the credential has one), maps the answers,
 *        and records the prompt run against the model and vendor, with no cost.
 *
 * NO NETWORK BEYOND LOOPBACK. KV3 starts a `node:http` server on 127.0.0.1 with an ephemeral port that
 * answers `/v1/systemone` the way Kev's server does, and stops it after the check. The credential the
 * runner resolves is a legacy `apiKeys` entry holding the JSON an `API Key with Endpoint` AI Credential
 * resolves to (`{"apiKey":"…","endpoint":"…"}`), so the driver's credential parsing is exercised as a
 * bound credential would exercise it. Everything else is real: the prompt, model and vendor rows,
 * candidate selection, the driver's URL, header and body building, the fetch, the answer mapping,
 * `BaseDecision`'s validation and the run row.
 *
 * TRANSPORT: SERVER-ONLY: the runner runs in this process, against a server in this process.
 *
 * FIXTURES: none seeded; the models are shipped metadata, read only. Every prompt run KV3 creates is
 * deleted in Teardown.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    BaseDecision,
    type ChoiceAnswer,
    type DecisionQuestion,
    type LikelihoodAnswer,
    type ScoreAnswer,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionParams, AIDecisionRunner } from '@memberjunction/ai-prompts';
import { SystemOneDecision } from '@memberjunction/ai-systemone';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIVendorEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, RequireRows } from './agent-live-shared';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const DRIVER_CLASS = 'SystemOneDecision';
const VENDOR_NAME = 'System One Endpoint';
const OPENROUTER_VENDOR = 'OpenRouter';
const DEFAULT_DECISION_PROMPT = 'Default Decision';
const KEV_4B_OPENROUTER_API_NAME = 'jaredpalmer/kev-4b-20260924';

/** The four Kev models and the state limit each declares. */
const KEV_MODELS = [
    { Name: 'Kev-0.8B', MaxStateTokens: 8192 },
    { Name: 'Kev-4B', MaxStateTokens: 8192 },
    { Name: 'Kev-9B', MaxStateTokens: 8192 },
    { Name: 'Kev-27B', MaxStateTokens: 65536 },
] as const;

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

/** The System One body the driver must send for {@link QUESTIONS}. */
const EXPECTED_BODY = {
    model: 'kev-latest',
    state: STATE,
    questions: {
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
    },
};

/** The input tokens the local server reports. */
const SERVED_INPUT_TOKENS = 86;

/**
 * What Kev's server answers for {@link QUESTIONS}: bare, with four-decimal probabilities (the Score's sum
 * to 1.0001) and Kev's extra `latency_ms`.
 */
const KEV_RESPONSE = {
    model: 'kev-latest',
    answers: {
        urgent: { type: 'noul', noul: 0.8673 },
        team: { type: 'choice', choice: 'technical', probabilities: { billing: 0.0699, technical: 0.8968, sales: 0.0333 }, confidence: 0.8452 },
        severity: {
            type: 'score',
            score: 2.5764,
            legend: { '0': 'No impact', '1': 'Minor', '2': 'Major', '3': 'Critical' },
            probabilities: { '0': 0.0153, '1': 0.0322, '2': 0.3134, '3': 0.6392 },
            confidence: 0.8588,
        },
    },
    usage: { input_tokens: SERVED_INPUT_TOKENS, output_tokens: 192 },
    latency_ms: 41.5,
};

// ─── The local System One server ─────────────────────────────────────────────────────────────────

/** One request the local server received. */
interface ServedRequest {
    Method: string;
    Path: string;
    Authorization: string | undefined;
    Body: unknown;
}

/** A System One server on loopback, and what it was sent. */
interface LocalSystemOneServer {
    BaseURL: string;
    Requests: ServedRequest[];
    Close: () => Promise<void>;
}

/** Answers `POST /v1/systemone` with {@link KEV_RESPONSE}, anything else with Kev's 404 shape. */
function handle(requests: ServedRequest[], req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
        requests.push({ Method: req.method ?? '', Path: req.url ?? '', Authorization: req.headers['authorization'], Body: body });
        const found = req.method === 'POST' && req.url === '/v1/systemone';
        res.writeHead(found ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(found ? KEV_RESPONSE : { detail: 'Not Found' }));
    });
}

async function startLocalServer(): Promise<LocalSystemOneServer> {
    const requests: ServedRequest[] = [];
    const server: Server = createServer((req, res) => handle(requests, req, res));
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    return {
        BaseURL: `http://127.0.0.1:${port}`,
        Requests: requests,
        Close: () => new Promise<void>(resolve => server.close(() => resolve())),
    };
}

// ─── Fixture and lookups ─────────────────────────────────────────────────────────────────────────

/** The prompt runs KV3 created, deleted in Teardown. */
const createdPromptRunIDs: string[] = [];

interface PromptRunRow {
    ID: string;
    PromptID: string;
    ModelID: string;
    VendorID: string | null;
    Success: boolean | null;
    TokensPrompt: number | null;
    Cost: number | null;
}

async function readPromptRun(ctx: IntegrationCheckContext, id: string): Promise<PromptRunRow | undefined> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID='${EscapeSQLString(id)}'`,
        Fields: ['ID', 'PromptID', 'ModelID', 'VendorID', 'Success', 'TokensPrompt', 'Cost'],
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

function requireVendor(name: string): MJAIVendorEntity {
    const vendor = AIEngine.Instance.Vendors.find(v => v.Name === name);
    if (!vendor) {
        throw new Error(`The '${name}' AI vendor is not in this database: sync the metadata (mj sync push --dir=metadata)`);
    }
    return vendor;
}

function assertClose(actual: number | null | undefined, expected: number, message: string): void {
    Assert(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9, `${message} — expected ${expected}, got ${String(actual)}`);
}

/** The JSON an `API Key with Endpoint` AI Credential resolves to, which BaseModelRunner hands the driver. */
function endpointCredential(apiKey: string, endpoint: string): string {
    return JSON.stringify({ apiKey, endpoint });
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

/** KV1 for one Kev model: type, limits, its System One Endpoint row and no cost row there. */
function assertKevRow(entry: (typeof KEV_MODELS)[number], vendorId: string): void {
    const label = `KV1 ${entry.Name}`;
    const model = requireModel(entry.Name);
    AssertEqual(model.IsActive, true, `${label}: IsActive`);
    AssertEqual(model.AIModelType, 'Decision', `${label}: model type`);
    const rows = AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID) && UUIDsEqual(mv.VendorID, vendorId));
    AssertEqual(rows.length, 1, `${label}: System One Endpoint rows`);
    const row = rows[0];
    AssertEqual(row.Status, 'Active', `${label}: row status`);
    AssertEqual(row.Type, 'Inference Provider', `${label}: row type`);
    AssertEqual(row.DriverClass, DRIVER_CLASS, `${label}: row DriverClass`);
    AssertEqual(row.APIName, 'kev-latest', `${label}: row APIName`);
    AssertEqual(row.MaxInputTokens, entry.MaxStateTokens, `${label}: row MaxInputTokens`);

    const limits = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, row.ID)?.Decision;
    Assert(!!limits, `${label}: no effective Decision configuration`);
    AssertEqual(limits!.MaxChoiceOptions, 255, `${label}: MaxChoiceOptions`);
    AssertEqual(limits!.MaxScoreLevels, 10, `${label}: MaxScoreLevels`);
    AssertEqual(limits!.MaxStateTokens, entry.MaxStateTokens, `${label}: MaxStateTokens`);
    AssertEqual(AIEngine.Instance.GetActiveModelCost(model.ID, vendorId, 'Realtime'), null, `${label}: self-hosted cost row`);
}

/** KV1 for Kev-4B's OpenRouter route: the pinned APIName, the priority over self-hosting, and the price. */
function assertKev4BOpenRouterRow(systemOneVendorId: string): void {
    const label = 'KV1 Kev-4B OpenRouter';
    const model = requireModel('Kev-4B');
    const openRouter = requireVendor(OPENROUTER_VENDOR);
    const rows = AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID));
    const viaOpenRouter = rows.filter(mv => UUIDsEqual(mv.VendorID, openRouter.ID));
    AssertEqual(viaOpenRouter.length, 1, `${label}: rows`);
    const row = viaOpenRouter[0];
    AssertEqual(row.Status, 'Active', `${label}: status`);
    AssertEqual(row.DriverClass, 'OpenRouterDecision', `${label}: DriverClass`);
    AssertEqual(row.APIName, KEV_4B_OPENROUTER_API_NAME, `${label}: APIName`);
    AssertEqual(row.MaxInputTokens, 8192, `${label}: MaxInputTokens`);
    const selfHosted = rows.find(mv => UUIDsEqual(mv.VendorID, systemOneVendorId));
    Assert(!!selfHosted && row.Priority > selfHosted.Priority, `${label}: priority ${row.Priority} is not above the self-hosted row's ${selfHosted?.Priority}`);

    const cost = AIEngine.Instance.GetActiveModelCost(model.ID, openRouter.ID, 'Realtime');
    Assert(!!cost, `${label}: no active Realtime cost row`);
    assertClose(cost!.InputPricePerUnit, 0.042, `${label}: input price per unit`);
    assertClose(cost!.OutputPricePerUnit, 0, `${label}: output price per unit`);
    AssertEqual(cost!.UnitType, 'Per 1M Tokens', `${label}: cost unit type`);
}

/** KV3 for one model: one real runner call against the local server, then the request, answers and run row. */
async function runThroughRunner(ctx: IntegrationCheckContext, server: LocalSystemOneServer, modelName: string, token: string): Promise<void> {
    const label = `KV3 ${modelName}`;
    const model = requireModel(modelName);
    const vendor = requireVendor(VENDOR_NAME);
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === DEFAULT_DECISION_PROMPT);
    Assert(!!prompt, `${label}: the '${DEFAULT_DECISION_PROMPT}' prompt is not in this database`);

    const params = new AIDecisionParams();
    params.prompt = prompt!;
    params.contextUser = ctx.User;
    params.override = { modelId: model.ID, vendorId: vendor.ID };
    params.apiKeys = [{ driverClass: DRIVER_CLASS, apiKey: endpointCredential(token, server.BaseURL) }];
    params.State = STATE;
    params.Questions = QUESTIONS;

    const servedBefore = server.Requests.length;
    const runner = new AIDecisionRunner();
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    if (result.promptRun?.ID) {
        createdPromptRunIDs.push(result.promptRun.ID);
    }

    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.DriverClass, DRIVER_CLASS, `${label}: answering driver class`);
    AssertEqual(result.modelInfo?.modelName, modelName, `${label}: answering model`);
    AssertEqual(result.modelInfo?.vendorName, VENDOR_NAME, `${label}: answering vendor`);

    // The request the server received.
    AssertEqual(server.Requests.length - servedBefore, 1, `${label}: requests served`);
    const served = server.Requests[server.Requests.length - 1];
    AssertEqual(served.Method, 'POST', `${label}: method`);
    AssertEqual(served.Path, '/v1/systemone', `${label}: path`);
    AssertEqual(served.Authorization, token ? `Bearer ${token}` : undefined, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(served.Body), JSON.stringify(EXPECTED_BODY), `${label}: request body`);

    // The answers, mapped.
    assertClose((result.Answers['urgent'] as LikelihoodAnswer)?.Probability, 0.8673, `${label}: urgent probability`);
    const team = result.Answers['team'] as ChoiceAnswer;
    AssertEqual(team?.Value, 'technical', `${label}: team choice`);
    assertClose(team.Confidence, 0.8452, `${label}: team confidence`);
    assertClose(team.Probabilities['technical'], 0.8968, `${label}: team probability`);
    const severity = result.Answers['severity'] as ScoreAnswer;
    assertClose(severity?.Value, 2.5764, `${label}: severity score`);
    AssertEqual(JSON.stringify(Object.keys(severity.Probabilities)), JSON.stringify(['No impact', 'Minor', 'Major', 'Critical']), `${label}: severity keyed by level`);
    assertClose(severity.Probabilities['Critical'], 0.6392 / 1.0001, `${label}: severity probability renormalised`);

    // The run row: no cost, because a self-hosted route has no cost row.
    Assert(!!result.promptRun?.ID, `${label}: no prompt run`);
    const row = await readPromptRun(ctx, result.promptRun!.ID);
    Assert(!!row, `${label}: prompt run ${result.promptRun!.ID} was not found`);
    Assert(UUIDsEqual(row!.PromptID, prompt!.ID), `${label}: run prompt is not ${DEFAULT_DECISION_PROMPT}`);
    Assert(UUIDsEqual(row!.ModelID, model.ID), `${label}: run model ${row!.ModelID} is not ${modelName}`);
    Assert(!!row!.VendorID && UUIDsEqual(row!.VendorID, vendor.ID), `${label}: run vendor ${String(row!.VendorID)} is not ${VENDOR_NAME}`);
    AssertEqual(row!.Success, true, `${label}: run Success`);
    AssertEqual(row!.TokensPrompt, SERVED_INPUT_TOKENS, `${label}: run TokensPrompt`);
    AssertEqual(row!.Cost, null, `${label}: run Cost`);
}

export const SystemOneKevChecks: NamedCheck[] = [
    {
        Id: 'systemone-kev.KV1',
        Name: 'KV1: the Kev models are Active Decision models with their limits and System One Endpoint rows naming SystemOneDecision; Kev-4B also routes through OpenRouter first',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            const vendor = requireVendor(VENDOR_NAME);
            AssertEqual(vendor.CredentialType, 'API Key with Endpoint', 'KV1: the System One Endpoint vendor credential type');
            for (const entry of KEV_MODELS) {
                assertKevRow(entry, vendor.ID);
            }
            assertKev4BOpenRouterRow(vendor.ID);
        },
    },
    {
        Id: 'systemone-kev.KV2',
        Name: "KV2: ClassFactory.CreateInstance(BaseDecision, 'SystemOneDecision', credential) returns a SystemOneDecision that reads the credential's endpoint",
        Fn: async (): Promise<void> => {
            const credential = endpointCredential('it-token', 'https://kev.example.test/');
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, DRIVER_CLASS, credential);
            if (!(driver instanceof SystemOneDecision)) {
                throw new Error(`KV2: the factory built ${driver?.constructor?.name ?? 'nothing'}, not a SystemOneDecision`);
            }
            AssertEqual(driver.constructor, SystemOneDecision, 'KV2: the registered class is the shipped driver');
            AssertEqual(driver.EndpointURL, 'https://kev.example.test/v1/systemone', "KV2: endpoint from the credential's JSON");
        },
    },
    {
        Id: 'systemone-kev.KV3',
        Name: 'KV3: AIDecisionRunner with override naming Kev-4B or Kev-27B on System One Endpoint POSTs to <endpoint>/v1/systemone, maps the answers and records the run',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            const server = await startLocalServer();
            try {
                await runThroughRunner(ctx, server, 'Kev-4B', 'it-kev-token');
                // An open server: a credential with an endpoint and no key sends no Authorization header.
                await runThroughRunner(ctx, server, 'Kev-27B', '');
            } finally {
                await server.Close();
            }
        },
    },
];

for (const check of SystemOneKevChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('systemone-kev', {
    Setup: async (): Promise<void> => {
        createdPromptRunIDs.length = 0;
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        for (const id of createdPromptRunIDs.splice(0)) {
            await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User);
        }
    },
});
