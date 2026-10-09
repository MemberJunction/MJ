/**
 * systemone-kev.checks.ts — the 'systemone-kev' bundle (KV1–KV10): Jared Palmer's Kev decision models
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
 *   KV4  `Default Decision`'s selection is what it was before Clef and Kev: with no Cloudflare or System
 *        One credential its candidates are Jev, then LLM Decision, then the fallbacks, every new model
 *        among the fallbacks, and the runner selects the first of Jev and LLM Decision it has a
 *        credential for; with a System One credential bound to Kev-27B's row, Kev-27B is a credentialed
 *        candidate that still comes after both, and the selection does not change; and with every
 *        driver but System One's unavailable, the run fails over from model to model (the prompt's
 *        `SameModelDifferentVendor` strategy does not hold it to one model) and Kev-27B answers.
 *   KV5  the credential fix, end to end: a real `API Key with Endpoint` credential, created through
 *        `CredentialEngine` and stored encrypted, bound to Kev-9B's System One row, sends its token, not
 *        its JSON, as the bearer to its endpoint, and the answers map.
 *   KV6  per-row routing: two credentials bound to the Kev-4B and Kev-27B rows send each model to its own
 *        server, and only its own.
 *   KV7  failover past misconfigured candidates: a Kev row whose credential is a token with no endpoint,
 *        then Clef with a token and no account ID, each fail before any request with a `NoCredentials`
 *        error naming the missing setting, and the run fails over to a Kev row with a working server.
 *   KV8  error classification through the runner: a 503 fails over, a 429 is retried as the prompt's
 *        `MaxRetries` allows and then fails over, and a 401 stops the failover loop.
 *   KV9  Kev-4B on OpenRouter: an override naming Kev-4B and OpenRouter builds `OpenRouterDecision`,
 *        which POSTs to the OpenRouter decisions endpoint with the row's `jaredpalmer/kev-4b-20260924`,
 *        and the answers map.
 *   KV10 a `ModelVendor` binding on the row that serves a model is found when the model has a second
 *        Active row on the same vendor: a throwaway Decision model with a Model Developer row and an
 *        Inference Provider row on System One Endpoint, under keys that put the Developer row first in
 *        the engine on any database, and a credential bound to the Inference Provider row only. The
 *        candidate counts as available, the request reaches its server with the bound token, and the
 *        answers map. Before the fix the runner read only the first Active row of the pair.
 *
 * NO NETWORK BEYOND LOOPBACK. KV3, KV5–KV8 and KV10 start `node:http` servers on 127.0.0.1 with
 * ephemeral ports that answer `/v1/systemone` the way Kev's server does, and stop them after the check.
 * For the whole bundle, `OpenRouterDecision` is replaced by a subclass that overrides only `SendRequest`
 * (as IT108 does for Cloudflare): it answers only when a check arms it (KV8, KV9) and refuses otherwise,
 * so a failover to Kev-4B's OpenRouter row can never leave the process. `CloudflareDecision` is replaced the same way
 * by a guard that records the URL and refuses every request, so KV7's Clef candidate cannot reach
 * Cloudflare even if its missing-account check regressed, and KV7 can assert it sent nothing. KV4
 * registers the shared scripted decision driver over every decision driver class, as IT97 does. The
 * environment variables that would give a decision driver a real base URL or account ID are unset for
 * the bundle and restored after it.
 * Everything else is real: the prompt, model and vendor rows, candidate selection, credential resolution
 * (legacy `apiKeys` entries in KV3, `MJ: Credentials` rows with `MJ: AI Credential Bindings` in KV4–KV8
 * and KV10), the drivers' URL, header and body building, the fetch, the answer mapping, `BaseDecision`'s
 * validation, the failover loop and the run rows.
 *
 * TRANSPORT: SERVER-ONLY: the runner runs in this process, against servers and stand-ins in this process.
 *
 * FIXTURES: KV4–KV8 and KV10 create their own credentials (encrypted, through `CredentialEngine`),
 * bindings, test Decision prompts and, in KV10, a test Decision model with its model-vendor rows
 * (decision-fixtures.ts), and delete them in a `finally`, children first; Teardown deletes whatever a
 * failed check left. Every prompt run the bundle creates is deleted.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    BaseDecision,
    IsSystemOneWireObject,
    type ChoiceAnswer,
    type DecisionQuestion,
    type LikelihoodAnswer,
    type ScoreAnswer,
} from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionParams, AIDecisionRunner, type AIDecisionRunResult, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { SystemOneDecision } from '@memberjunction/ai-systemone';
import { OpenRouterDecision } from '@memberjunction/ai-openrouter';
import { CloudflareDecision } from '@memberjunction/ai-cloudflare';
import { EncryptionEngine } from '@memberjunction/encryption';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIVendorEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, RequireRows } from './agent-live-shared';
import { RegisterScriptedDecision, ScriptedDecision, SCRIPTED_DECISION_DRIVER_CLASSES } from './decision-test-double';
import {
    ClearEnvironment,
    DecisionFixtures,
    DecisionRunnerProbe,
    ReadDecisionPromptRun,
    type ObservedAttempt,
    RegisterDecisionStandIn,
    RequireDefaultDecisionPrompt,
    RequireInferenceRowID,
    UnavailableDecision,
} from './decision-fixtures';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const DRIVER_CLASS = 'SystemOneDecision';
const VENDOR_NAME = 'System One Endpoint';
const OPENROUTER_VENDOR = 'OpenRouter';
const CLOUDFLARE_VENDOR = 'Cloudflare';
const DEFAULT_DECISION_PROMPT = 'Default Decision';
const KEV_4B_OPENROUTER_API_NAME = 'jaredpalmer/kev-4b-20260924';

/** The credential types the System One Endpoint and Cloudflare vendors take. */
const ENDPOINT_CREDENTIAL_TYPE = 'API Key with Endpoint';
const API_KEY_CREDENTIAL_TYPE = 'API Key';

/** The four Kev models and the state limit each declares. */
const KEV_MODELS = [
    { Name: 'Kev-0.8B', MaxStateTokens: 8192 },
    { Name: 'Kev-4B', MaxStateTokens: 8192 },
    { Name: 'Kev-9B', MaxStateTokens: 8192 },
    { Name: 'Kev-27B', MaxStateTokens: 65536 },
] as const;

/** The Decision models this PR added. Every other active Decision model was there before it. */
const NEW_DECISION_MODELS: readonly string[] = ['Clef', 'Clef-flash', 'Kev-0.8B', 'Kev-4B', 'Kev-9B', 'Kev-27B'];

/** The variables a decision driver reads a base URL or a Cloudflare account ID from when its credential has none. */
const DRIVER_ENVIRONMENT: readonly string[] = [
    SystemOneDecision.BASE_URL_ENV_VAR,
    CloudflareDecision.ACCOUNT_ID_ENV_VAR,
    CloudflareDecision.BASE_URL_ENV_VAR,
];

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

/** The System One questions the driver must send for {@link QUESTIONS}. */
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

/** The System One body the driver must send for {@link QUESTIONS}. */
const EXPECTED_BODY = { model: 'kev-latest', state: STATE, questions: EXPECTED_WIRE_QUESTIONS };

/** The input tokens the local server reports. */
const SERVED_INPUT_TOKENS = 86;

/** Kev's answers to {@link QUESTIONS}: four-decimal probabilities, the Score's summing to 1.0001. */
const KEV_ANSWERS = {
    urgent: { type: 'noul', noul: 0.8673 },
    team: { type: 'choice', choice: 'technical', probabilities: { billing: 0.0699, technical: 0.8968, sales: 0.0333 }, confidence: 0.8452 },
    severity: {
        type: 'score',
        score: 2.5764,
        legend: { '0': 'No impact', '1': 'Minor', '2': 'Major', '3': 'Critical' },
        probabilities: { '0': 0.0153, '1': 0.0322, '2': 0.3134, '3': 0.6392 },
        confidence: 0.8588,
    },
};

/** What Kev's server answers for {@link QUESTIONS}: bare, with Kev's extra `latency_ms`. */
const KEV_RESPONSE = {
    model: 'kev-latest',
    answers: KEV_ANSWERS,
    usage: { input_tokens: SERVED_INPUT_TOKENS, output_tokens: 192 },
    latency_ms: 41.5,
};

/** The cost OpenRouter reports for one Kev-4B call. */
const OPENROUTER_REPORTED_COST = 0.000003612;

/** What OpenRouter's decisions API answered for {@link QUESTIONS} on Kev-4B, recorded from a live call. */
const KEV_4B_OPENROUTER_RESPONSE = {
    model: KEV_4B_OPENROUTER_API_NAME,
    answers: KEV_ANSWERS,
    usage: { input_tokens: SERVED_INPUT_TOKENS, output_tokens: 192, cost: OPENROUTER_REPORTED_COST },
    id: 'gen-dec-it-kev-4b',
    provider: 'SiliconFlow',
};

/** What Kev's server sends for a missing or wrong bearer token (kev_serve.py). */
const KEV_UNAUTHORIZED = { detail: 'missing or invalid API key; send Authorization: Bearer <KEV_API_KEY>' };

/** What Kev's server sends while it shuts down (kev_serve.py). */
const KEV_STOPPING = { detail: 'the server is stopping' };

/** A rate-limit body that names no rate limit, so the 429 status alone classifies it. */
const KEV_AT_CAPACITY = { detail: 'Kev is at capacity; retry shortly' };

// ─── The local System One server ─────────────────────────────────────────────────────────────────

/** One request the local server received. */
interface ServedRequest {
    Method: string;
    Path: string;
    Authorization: string | undefined;
    Body: unknown;
}

/** What the local server answers one request with. */
interface ServedResponse {
    Status: number;
    Body: unknown;
}

type Responder = (request: ServedRequest) => ServedResponse;

/** A System One server on loopback, what it was sent, and how it answers (a check may change that). */
interface LocalSystemOneServer {
    BaseURL: string;
    Requests: ServedRequest[];
    Respond: Responder;
    Close: () => Promise<void>;
}

/** Answers `POST /v1/systemone` with {@link KEV_RESPONSE}, anything else with Kev's 404 shape. */
function answerAsKev(request: ServedRequest): ServedResponse {
    const found = request.Method === 'POST' && request.Path === '/v1/systemone';
    return found ? { Status: 200, Body: KEV_RESPONSE } : { Status: 404, Body: { detail: 'Not Found' } };
}

/** Answers every request with one status and body. */
function answerWith(status: number, body: unknown): Responder {
    return () => ({ Status: status, Body: body });
}

function handle(server: LocalSystemOneServer, req: IncomingMessage, res: ServerResponse): void {
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
        const request: ServedRequest = { Method: req.method ?? '', Path: req.url ?? '', Authorization: req.headers['authorization'], Body: body };
        server.Requests.push(request);
        const response = server.Respond(request);
        res.writeHead(response.Status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response.Body));
    });
}

async function startLocalServer(respond: Responder = answerAsKev): Promise<LocalSystemOneServer> {
    let httpServer: Server | undefined;
    const local: LocalSystemOneServer = {
        BaseURL: '',
        Requests: [],
        Respond: respond,
        Close: () => new Promise<void>(resolve => (httpServer ? httpServer.close(() => resolve()) : resolve())),
    };
    httpServer = createServer((req, res) => handle(local, req, res));
    const listening = httpServer;
    await new Promise<void>((resolve, reject) => {
        listening.once('error', reject);
        listening.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = listening.address() as AddressInfo;
    local.BaseURL = `http://127.0.0.1:${port}`;
    return local;
}

/** Starts `count` servers and closes every one of them after `work`, however it ends. */
async function withLocalServers(count: number, work: (servers: LocalSystemOneServer[]) => Promise<void>): Promise<void> {
    const servers: LocalSystemOneServer[] = [];
    try {
        for (let i = 0; i < count; i++) {
            servers.push(await startLocalServer());
        }
        await work(servers);
    } finally {
        for (const server of servers) {
            await server.Close();
        }
    }
}

// ─── The OpenRouter stand-in ─────────────────────────────────────────────────────────────────────

/** One request the OpenRouter stand-in received. */
interface OpenRouterRequest {
    Url: string;
    Authorization: string | null;
    Body: unknown;
}

/** What the OpenRouter stand-in was sent, and whether it may answer. */
interface OpenRouterStandInState {
    Requests: OpenRouterRequest[];
    Armed: boolean;
}

/** The OpenRouter stand-in's state. Module state, because the runner builds its own driver instance. */
const openRouter: OpenRouterStandInState = { Requests: [], Armed: false };

/**
 * The real `OpenRouterDecision` with only its network call replaced. Armed, it answers every request
 * with {@link KEV_4B_OPENROUTER_RESPONSE}; disarmed, it refuses with a 500, so nothing reaches OpenRouter.
 */
class ScriptedOpenRouterDecision extends OpenRouterDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        const body: unknown = JSON.parse(String(init.body));
        openRouter.Requests.push({ Url: url, Authorization: new Headers(init.headers).get('Authorization'), Body: body });
        return openRouter.Armed
            ? new Response(JSON.stringify(KEV_4B_OPENROUTER_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } })
            : new Response(JSON.stringify({ error: { message: 'The integration-test OpenRouter stand-in is not armed' } }), { status: 500 });
    }
}

// ─── The Cloudflare guard ────────────────────────────────────────────────────────────────────────

/** The URLs the Cloudflare guard was asked for. No check in this bundle should reach it. */
const cloudflareRequests: string[] = [];

/**
 * The real `CloudflareDecision` with only its network call replaced: it records the URL and refuses
 * with a Workers AI failure envelope. KV7's Clef candidate runs the real driver and must fail before
 * any request; if that check ever regressed, the request would otherwise go to Cloudflare.
 */
class RefusingCloudflareDecision extends CloudflareDecision {
    protected async SendRequest(url: string): Promise<Response> {
        cloudflareRequests.push(url);
        const refusal = { result: null, success: false, errors: [{ code: 0, message: 'The integration-test Cloudflare guard refuses every request' }], messages: [] };
        return new Response(JSON.stringify(refusal), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

// ─── Fixture and lookups ─────────────────────────────────────────────────────────────────────────

/** The prompt runs KV3 and KV9 created, deleted in Teardown. */
const createdPromptRunIDs: string[] = [];

/** What Setup changed for the bundle, undone in Teardown. */
const bundleRestores: Array<() => void> = [];

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

/** Asserts the answers came back mapped from {@link KEV_ANSWERS}. */
function assertKevAnswers(result: AIDecisionRunResult, label: string): void {
    assertClose((result.Answers['urgent'] as LikelihoodAnswer)?.Probability, 0.8673, `${label}: urgent probability`);
    const team = result.Answers['team'] as ChoiceAnswer;
    AssertEqual(team?.Value, 'technical', `${label}: team choice`);
    assertClose(team.Confidence, 0.8452, `${label}: team confidence`);
    assertClose(team.Probabilities['technical'], 0.8968, `${label}: team probability`);
    const severity = result.Answers['severity'] as ScoreAnswer;
    assertClose(severity?.Value, 2.5764, `${label}: severity score`);
    AssertEqual(JSON.stringify(Object.keys(severity.Probabilities)), JSON.stringify(['No impact', 'Minor', 'Major', 'Critical']), `${label}: severity keyed by level`);
    assertClose(severity.Probabilities['Critical'], 0.6392 / 1.0001, `${label}: severity probability renormalised`);
}

/** Asserts one request reached `server` since `before`, carrying `token` as the bearer and the System One body. */
function assertServed(server: LocalSystemOneServer, before: number, token: string, label: string): void {
    AssertEqual(server.Requests.length - before, 1, `${label}: requests served`);
    const served = server.Requests[server.Requests.length - 1];
    AssertEqual(served.Method, 'POST', `${label}: method`);
    AssertEqual(served.Path, '/v1/systemone', `${label}: path`);
    AssertEqual(served.Authorization, `Bearer ${token}`, `${label}: Authorization header`);
    AssertEqual(JSON.stringify(served.Body), JSON.stringify(EXPECTED_BODY), `${label}: request body`);
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

/** A decision request on `Default Decision` that names a model and vendor. */
function overrideParams(ctx: IntegrationCheckContext, modelName: string, vendorName: string): AIDecisionParams {
    const params = decisionParams(ctx, RequireDefaultDecisionPrompt());
    params.override = { modelId: requireModel(modelName).ID, vendorId: requireVendor(vendorName).ID };
    return params;
}

/** Runs one decision, waits for its run row and records it for deletion. */
async function runDecision(runner: AIDecisionRunner, params: AIDecisionParams, track: (id: string | undefined) => void): Promise<AIDecisionRunResult> {
    const result = await runner.ExecuteDecision(params);
    await runner.WaitForPendingPromptRunSaves();
    track(result.promptRun?.ID);
    return result;
}

/** Asserts the run succeeded on `modelName` and `vendorName` with `driverClass`. */
function assertAnsweredBy(result: AIDecisionRunResult, modelName: string, vendorName: string, driverClass: string, label: string): void {
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    AssertEqual(result.DriverClass, driverClass, `${label}: answering driver class`);
    AssertEqual(result.modelInfo?.modelName, modelName, `${label}: answering model`);
    AssertEqual(result.modelInfo?.vendorName, vendorName, `${label}: answering vendor`);
}

/**
 * Asserts the run row of a run that failed over succeeded. Only `Success`: the row's model, vendor and
 * failover columns are set on the run entity outside its save queue
 * (`BaseModelRunner.updatePromptRunWithFailoverSuccess`), so the INSERT's reload, landing after them,
 * can put the first candidate back. The attempts are read from the runner's own log instead.
 */
async function assertFailedOverRunSucceeded(ctx: IntegrationCheckContext, result: AIDecisionRunResult, label: string): Promise<void> {
    Assert(!!result.promptRun?.ID, `${label}: no prompt run`);
    const row = await ReadDecisionPromptRun(ctx, result.promptRun!.ID);
    AssertEqual(row?.Success, true, `${label}: run Success`);
}

/** Asserts the run row names `modelName` and `vendorName` and has the given outcome. */
async function assertRunRow(ctx: IntegrationCheckContext, result: AIDecisionRunResult, modelName: string, vendorName: string, success: boolean, label: string): Promise<void> {
    Assert(!!result.promptRun?.ID, `${label}: no prompt run`);
    const row = await ReadDecisionPromptRun(ctx, result.promptRun!.ID);
    Assert(!!row, `${label}: prompt run ${result.promptRun!.ID} was not found`);
    Assert(UUIDsEqual(row!.ModelID, requireModel(modelName).ID), `${label}: run model ${row!.ModelID} is not ${modelName}`);
    Assert(!!row!.VendorID && UUIDsEqual(row!.VendorID, requireVendor(vendorName).ID), `${label}: run vendor ${String(row!.VendorID)} is not ${vendorName}`);
    AssertEqual(row!.Success, success, `${label}: run Success`);
}

// ─── KV1–KV3 ─────────────────────────────────────────────────────────────────────────────────────

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
    const openRouterVendor = requireVendor(OPENROUTER_VENDOR);
    const rows = AIEngine.Instance.ModelVendors.filter(mv => UUIDsEqual(mv.ModelID, model.ID));
    const viaOpenRouter = rows.filter(mv => UUIDsEqual(mv.VendorID, openRouterVendor.ID));
    AssertEqual(viaOpenRouter.length, 1, `${label}: rows`);
    const row = viaOpenRouter[0];
    AssertEqual(row.Status, 'Active', `${label}: status`);
    AssertEqual(row.DriverClass, 'OpenRouterDecision', `${label}: DriverClass`);
    AssertEqual(row.APIName, KEV_4B_OPENROUTER_API_NAME, `${label}: APIName`);
    AssertEqual(row.MaxInputTokens, 8192, `${label}: MaxInputTokens`);
    const selfHosted = rows.find(mv => UUIDsEqual(mv.VendorID, systemOneVendorId));
    Assert(!!selfHosted && row.Priority > selfHosted.Priority, `${label}: priority ${row.Priority} is not above the self-hosted row's ${selfHosted?.Priority}`);

    const cost = AIEngine.Instance.GetActiveModelCost(model.ID, openRouterVendor.ID, 'Realtime');
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
    assertKevAnswers(result, label);

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

// ─── KV4: Default Decision's selection ───────────────────────────────────────────────────────────

/** A candidate as `model / vendor / driver`, for messages and order comparisons. */
function describeCandidate(candidate: ModelVendorCandidate): string {
    return `${candidate.model.Name} / ${candidate.vendorName ?? 'no vendor'} / ${candidate.driverClass}`;
}

function isNewModel(candidate: ModelVendorCandidate): boolean {
    return NEW_DECISION_MODELS.includes(candidate.model.Name);
}

/**
 * Asserts the candidate list keeps its pre-Clef/Kev shape: the two bound candidates first, every new
 * model among the fallbacks after them, and the list without the new models being Jev, LLM Decision and
 * the fallbacks of the other active Decision models.
 */
function assertPreExistingOrder(candidates: ModelVendorCandidate[], label: string): void {
    AssertEqual(candidates[0] ? describeCandidate(candidates[0]) : 'none', 'Jev / OpenRouter / OpenRouterDecision', `${label}: first candidate`);
    AssertEqual(candidates[1] ? describeCandidate(candidates[1]) : 'none', 'LLM Decision / MemberJunction / LLMDecision', `${label}: second candidate`);
    AssertEqual(candidates[0].source, 'prompt-model', `${label}: Jev's source`);
    AssertEqual(candidates[1].source, 'prompt-model', `${label}: LLM Decision's source`);

    const newOnes = candidates.filter(isNewModel);
    Assert(newOnes.length > 0, `${label}: none of ${NEW_DECISION_MODELS.join(', ')} is a candidate, so the check would prove nothing`);
    for (const candidate of newOnes) {
        Assert(candidates.indexOf(candidate) > 1, `${label}: ${describeCandidate(candidate)} is ahead of Jev or LLM Decision`);
        AssertEqual(candidate.source, 'power-match-fallback', `${label}: ${describeCandidate(candidate)} source`);
    }

    const before = candidates.filter(c => !isNewModel(c));
    const otherDecisionModels = AIEngine.Instance.Models
        .filter(m => m.IsActive && m.AIModelType === 'Decision' && !NEW_DECISION_MODELS.includes(m.Name) && m.Name !== 'Jev' && m.Name !== 'LLM Decision')
        .map(m => m.Name)
        .sort();
    const fallbacksBefore = before.slice(2);
    AssertEqual(JSON.stringify([...new Set(fallbacksBefore.map(c => c.model.Name))].sort()), JSON.stringify(otherDecisionModels), `${label}: the fallbacks other than Clef and Kev`);
    for (const candidate of fallbacksBefore) {
        AssertEqual(candidate.source, 'power-match-fallback', `${label}: ${describeCandidate(candidate)} source`);
    }
}

/** The first of Jev and LLM Decision the runner has a credential for: what it selected before Clef and Kev. */
function expectedSelection(probe: DecisionRunnerProbe, candidates: ModelVendorCandidate[], prompt: MJAIPromptEntityExtended, params: AIDecisionParams): string {
    const first = candidates.slice(0, 2).find(c => probe.HasCredentials(c, prompt, params));
    return first ? first.model.Name : 'none';
}

/** Runs Default Decision through the scripted driver and returns which model it selected, and the candidates it considered. */
async function selectOnDefaultDecision(ctx: IntegrationCheckContext, probe: DecisionRunnerProbe, fixtures: DecisionFixtures, label: string): Promise<AIDecisionRunResult> {
    const params = decisionParams(ctx, RequireDefaultDecisionPrompt());
    const result = await runDecision(probe, params, id => fixtures.TrackPromptRun(id));
    Assert(result.success, `${label}: the decision failed: ${result.errorMessage ?? 'no error message'}`);
    Assert(!!result.modelSelectionInfo, `${label}: the run carries no selection info`);
    return result;
}

/** Asserts the runner's own record of the candidates matches the builder's, in order. */
function assertConsidered(result: AIDecisionRunResult, candidates: ModelVendorCandidate[], label: string): void {
    const considered = result.modelSelectionInfo?.ModelsConsidered ?? [];
    AssertEqual(
        JSON.stringify(considered.map(c => `${c.model.Name} / ${c.vendor?.Name ?? 'no vendor'}`)),
        JSON.stringify(candidates.map(c => `${c.model.Name} / ${c.vendorName ?? 'no vendor'}`)),
        `${label}: the candidates the run considered`,
    );
}

/** What KV4 found with no Cloudflare or System One credential: the candidates, and the model selected. */
interface PristineSelection {
    Candidates: ModelVendorCandidate[];
    Selected: string;
}

/** KV4 with no Cloudflare or System One credential: the pre-Clef/Kev order, and Jev or LLM Decision selected. */
async function assertSelectionWithoutCredentials(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams,
): Promise<PristineSelection> {
    const label = 'KV4 no credentials';
    const candidates = probe.Candidates(prompt, params);
    assertPreExistingOrder(candidates, label);
    const credentialedNew = candidates.filter(c =>
        (c.vendorName === CLOUDFLARE_VENDOR || c.vendorName === VENDOR_NAME) && probe.HasCredentials(c, prompt, params));
    AssertEqual(credentialedNew.map(describeCandidate).join(', '), '', `${label}: Cloudflare or System One candidates with a credential (this database must have none)`);
    const expected = expectedSelection(probe, candidates, prompt, params);
    Assert(expected === 'Jev' || expected === 'LLM Decision', `${label}: neither Jev nor LLM Decision has a credential (LLM Decision needs none): ${expected}`);
    const result = await selectOnDefaultDecision(ctx, probe, fixtures, label);
    AssertEqual(result.modelInfo?.modelName, expected, `${label}: the selected model`);
    AssertEqual(result.modelSelectionInfo?.ModelSelected?.Name, expected, `${label}: the selection info`);
    assertConsidered(result, candidates, label);
    return { Candidates: candidates, Selected: expected };
}

/** KV4 with a System One credential bound to Kev-27B's row: a credentialed candidate, still behind both, not selected. */
async function assertSelectionWithBoundKev(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams,
    pristine: PristineSelection,
): Promise<void> {
    const label = 'KV4 bound';
    const credential = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, 'KV4 Kev-27B', { apiKey: 'it-kv4-token', endpoint: 'http://127.0.0.1:9' });
    await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID('Kev-27B', VENDOR_NAME));
    const bound = probe.Candidates(prompt, params);
    AssertEqual(bound.map(describeCandidate).join(', '), pristine.Candidates.map(describeCandidate).join(', '), `${label}: the candidates and their order`);
    const kev = bound.find(c => c.model.Name === 'Kev-27B' && c.vendorName === VENDOR_NAME);
    Assert(!!kev, `${label}: Kev-27B on System One Endpoint is not a candidate`);
    Assert(probe.HasCredentials(kev!, prompt, params), `${label}: Kev-27B has no credential after its row was bound`);
    const llmDecision = bound.findIndex(c => c.model.Name === 'LLM Decision');
    Assert(bound.indexOf(kev!) > llmDecision && llmDecision > 0, `${label}: Kev-27B is at ${bound.indexOf(kev!)}, LLM Decision at ${llmDecision}`);
    const result = await selectOnDefaultDecision(ctx, probe, fixtures, label);
    AssertEqual(result.modelInfo?.modelName, pristine.Selected, `${label}: the selected model`);
    const considered = result.modelSelectionInfo?.ModelsConsidered.find(c => c.model.Name === 'Kev-27B' && c.vendor?.Name === VENDOR_NAME);
    AssertEqual(considered?.available, true, `${label}: the run saw Kev-27B as available`);
    assertConsidered(result, bound, label);
}

/** The drivers KV4's failover leg makes unavailable: every decision driver but System One's. */
const UNAVAILABLE_DRIVER_CLASSES: readonly string[] = ['OpenRouterDecision', 'LLMDecision', 'CloudflareDecision', 'PerplexityDecision'];

/**
 * KV4 failover: with Jev, LLM Decision, Clef and the Perplexity Decider unavailable, `Default Decision`
 * fails over from model to model, past every credentialed candidate ahead of the bound Kev-27B, and
 * Kev-27B answers. Its `FailoverStrategy` is the column default, `SameModelDifferentVendor`, and
 * `AIDecisionRunner` treats every strategy but `None` as the full priority list: the strategy does not
 * keep it on one model.
 */
async function assertFailoverReachesBoundKev(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams,
    decider: ScriptedDecision,
): Promise<void> {
    const label = 'KV4 failover';
    AssertEqual(prompt.FailoverStrategy, 'SameModelDifferentVendor', `${label}: Default Decision's FailoverStrategy`);
    const candidates = probe.Candidates(prompt, params);
    const kev = candidates.findIndex(c => c.model.Name === 'Kev-27B' && c.vendorName === VENDOR_NAME);
    Assert(kev > 1, `${label}: Kev-27B on System One Endpoint is at ${kev}, not behind Jev and LLM Decision`);
    const credentialedAhead = candidates.slice(0, kev).filter(c => probe.HasCredentials(c, prompt, params));
    const unexpected = credentialedAhead.filter(c => !UNAVAILABLE_DRIVER_CLASSES.includes(c.driverClass));
    AssertEqual(unexpected.map(describeCandidate).join(', '), '', `${label}: credentialed candidates ahead of Kev-27B that this leg cannot make unavailable`);

    const restores = UNAVAILABLE_DRIVER_CLASSES.map(name => RegisterDecisionStandIn(name, UnavailableDecision));
    const callsBefore = decider.Calls.length;
    const attemptsBefore = probe.Attempts.length;
    try {
        const result = await runDecision(probe, decisionParams(ctx, prompt), id => fixtures.TrackPromptRun(id));
        assertAnsweredBy(result, 'Kev-27B', VENDOR_NAME, DRIVER_CLASS, label);
    } finally {
        for (const restore of restores.reverse()) {
            restore();
        }
    }
    AssertEqual(decider.Calls.length - callsBefore, 1, `${label}: calls Kev-27B's scripted driver answered`);
    const attempts = probe.Attempts.slice(attemptsBefore);
    AssertEqual(
        JSON.stringify(attempts.map(a => `${modelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}:${a.WillRetry ? 'retry' : 'stop'}`)),
        JSON.stringify(credentialedAhead.map(c => `${c.model.Name}:ServiceUnavailable:retry`)),
        `${label}: the failed attempts before Kev-27B`,
    );
    Assert(attempts.some(a => modelNameOf(a.Attempt.modelId) === 'LLM Decision'), `${label}: LLM Decision was not tried before Kev-27B`);
}

/** A model's name by ID, for comparisons and messages. */
function modelNameOf(modelId: string): string {
    return AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelId))?.Name ?? `unknown model ${modelId}`;
}

async function checkDefaultDecisionSelection(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const prompt = RequireDefaultDecisionPrompt();
    const probe = new DecisionRunnerProbe();
    const params = decisionParams(ctx, prompt);
    const fixtures = new DecisionFixtures(ctx, 'kv4');
    const decider = new ScriptedDecision();
    decider.Arm();
    const restore = RegisterScriptedDecision(decider, SCRIPTED_DECISION_DRIVER_CLASSES);
    try {
        const pristine = await assertSelectionWithoutCredentials(ctx, probe, fixtures, prompt, params);
        await assertSelectionWithBoundKev(ctx, probe, fixtures, prompt, params, pristine);
        await assertFailoverReachesBoundKev(ctx, probe, fixtures, prompt, params, decider);
    } finally {
        decider.Disarm();
        restore();
        await fixtures.Cleanup();
    }
}

// ─── KV5: the credential fix, end to end ─────────────────────────────────────────────────────────

const KV5_TOKEN = 'it-kv5-kev-9b-token';

/**
 * Asserts the credential is encrypted at rest: the stored `Values` carries the key's marker and neither
 * the token nor the endpoint in clear, and the engine reads it back decrypted. SQL Server only (the raw
 * read uses the fixture pool); elsewhere the at-rest leg is skipped with a warning.
 */
async function assertEncryptedAtRest(ctx: IntegrationCheckContext, credentialId: string, token: string, endpoint: string): Promise<void> {
    const entity = ctx.Provider.EntityByName('MJ: Credentials');
    const field = entity?.Fields.find(f => f.Name === 'Values');
    Assert(!!entity && !!field?.Encrypt && !!field.EncryptionKeyID, 'KV5: MJ: Credentials.Values is not an encrypted field');
    if (!ctx.Pool) {
        console.warn('  ⚠ KV5 at-rest leg SKIPPED — no SQL Server fixture pool on this transport');
        return;
    }
    const raw = await ctx.Pool.request()
        .input('id', credentialId)
        .query<{ Values: string }>(`SELECT [Values] FROM [${entity!.SchemaName}].[${entity!.BaseTable}] WHERE ID = @id`);
    const stored = raw.recordset[0]?.Values ?? '';
    const marker = EncryptionEngine.Instance.GetKeyByID(field!.EncryptionKeyID!)?.Marker;
    Assert(EncryptionEngine.Instance.IsEncrypted(stored, marker), `KV5: the stored Values is not encrypted (starts '${stored.slice(0, 8)}')`);
    Assert(!stored.includes(token) && !stored.includes(endpoint), 'KV5: the stored Values holds the token or endpoint in clear');
}

async function checkCredentialFix(ctx: IntegrationCheckContext, server: LocalSystemOneServer): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'kv5');
    try {
        const credential = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, 'KV5 Kev-9B', { apiKey: KV5_TOKEN, endpoint: server.BaseURL });
        await assertEncryptedAtRest(ctx, credential.ID, KV5_TOKEN, server.BaseURL);
        await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID('Kev-9B', VENDOR_NAME));

        const before = server.Requests.length;
        const result = await runDecision(new AIDecisionRunner(), overrideParams(ctx, 'Kev-9B', VENDOR_NAME), id => fixtures.TrackPromptRun(id));
        assertAnsweredBy(result, 'Kev-9B', VENDOR_NAME, DRIVER_CLASS, 'KV5');
        const sent = server.Requests[server.Requests.length - 1]?.Authorization ?? '';
        Assert(!sent.includes('{'), `KV5: the bearer is the credential's JSON, not its token: ${sent}`);
        assertServed(server, before, KV5_TOKEN, 'KV5');
        assertKevAnswers(result, 'KV5');
        await assertRunRow(ctx, result, 'Kev-9B', VENDOR_NAME, true, 'KV5');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── KV6: per-row routing ────────────────────────────────────────────────────────────────────────

const KV6_ROUTES = [
    { ModelName: 'Kev-4B', Token: 'it-kv6-kev-4b-token' },
    { ModelName: 'Kev-27B', Token: 'it-kv6-kev-27b-token' },
] as const;

async function checkPerRowRouting(ctx: IntegrationCheckContext, servers: LocalSystemOneServer[]): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'kv6');
    try {
        for (let i = 0; i < KV6_ROUTES.length; i++) {
            const route = KV6_ROUTES[i];
            const credential = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, `KV6 ${route.ModelName}`, { apiKey: route.Token, endpoint: servers[i].BaseURL });
            await fixtures.BindToModelVendor(credential.ID, RequireInferenceRowID(route.ModelName, VENDOR_NAME));
        }
        for (let i = 0; i < KV6_ROUTES.length; i++) {
            const route = KV6_ROUTES[i];
            const label = `KV6 ${route.ModelName}`;
            const counts = servers.map(s => s.Requests.length);
            const result = await runDecision(new AIDecisionRunner(), overrideParams(ctx, route.ModelName, VENDOR_NAME), id => fixtures.TrackPromptRun(id));
            assertAnsweredBy(result, route.ModelName, VENDOR_NAME, DRIVER_CLASS, label);
            assertServed(servers[i], counts[i], route.Token, label);
            servers.forEach((other, j) => {
                if (j !== i) {
                    AssertEqual(other.Requests.length - counts[j], 0, `${label}: requests to ${KV6_ROUTES[j].ModelName}'s server`);
                }
            });
            await assertRunRow(ctx, result, route.ModelName, VENDOR_NAME, true, label);
        }
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── KV7: failover past misconfigured candidates ─────────────────────────────────────────────────

const KV7_TOKEN = 'it-kv7-kev-27b-token';

/** Asserts one KV7 attempt: `modelName` failed with a `NoCredentials` error naming every one of `names`, and failed over. */
function assertConfigurationAttempt(observed: ObservedAttempt, modelName: string, names: string[]): void {
    const label = `KV7 ${modelName}`;
    Assert(UUIDsEqual(observed.Attempt.modelId, requireModel(modelName).ID), `${label}: the attempt was not ${modelName}'s`);
    AssertEqual(observed.Attempt.errorType, 'NoCredentials', `${label}: error type`);
    AssertEqual(observed.WillRetry, true, `${label}: failed over`);
    const message = observed.Attempt.error.message;
    Assert(names.every(name => message.includes(name)), `${label}: the error does not name ${names.join(' and ')}: ${message}`);
}

async function checkFailoverPastMisconfigured(ctx: IntegrationCheckContext, server: LocalSystemOneServer): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'kv7');
    try {
        const created = await fixtures.CreateDecisionPrompt('KV7 failover', {
            Bindings: [
                { Key: 'kev9b', ModelName: 'Kev-9B', VendorName: VENDOR_NAME, Priority: 30 },
                { Key: 'clef', ModelName: 'Clef', VendorName: CLOUDFLARE_VENDOR, Priority: 20 },
                { Key: 'kev27b', ModelName: 'Kev-27B', VendorName: VENDOR_NAME, Priority: 10 },
            ],
        });
        // Clef: a real Cloudflare credential with a token and no account ID.
        const clef = await fixtures.CreateCredential(API_KEY_CREDENTIAL_TYPE, 'KV7 Clef token only', { apiKey: 'it-kv7-cloudflare-token' });
        await fixtures.BindToPromptModel(clef.ID, created.PromptModelIDs['clef']);
        // Kev-27B: a real credential pointing at the working server.
        const kev = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, 'KV7 Kev-27B', { apiKey: KV7_TOKEN, endpoint: server.BaseURL });
        await fixtures.BindToPromptModel(kev.ID, created.PromptModelIDs['kev27b']);

        // Kev-9B: no binding, so the runner falls back to the request's key: a token with no endpoint.
        const params = decisionParams(ctx, created.Prompt);
        params.apiKeys = [{ driverClass: DRIVER_CLASS, apiKey: 'it-kv7-token-without-endpoint' }];
        const probe = new DecisionRunnerProbe();
        const before = server.Requests.length;
        const cloudflareBefore = cloudflareRequests.length;
        const result = await runDecision(probe, params, id => fixtures.TrackPromptRun(id));

        AssertEqual(cloudflareRequests.length - cloudflareBefore, 0, 'KV7: requests Clef sent with no account ID');
        assertAnsweredBy(result, 'Kev-27B', VENDOR_NAME, DRIVER_CLASS, 'KV7');
        assertServed(server, before, KV7_TOKEN, 'KV7');
        assertKevAnswers(result, 'KV7');
        AssertEqual(probe.Attempts.length, 2, 'KV7: failed attempts before Kev-27B answered');
        assertConfigurationAttempt(probe.Attempts[0], 'Kev-9B', ['no base URL', SystemOneDecision.BASE_URL_ENV_VAR]);
        assertConfigurationAttempt(probe.Attempts[1], 'Clef', ['no Cloudflare account ID', CloudflareDecision.ACCOUNT_ID_ENV_VAR]);
        await assertFailedOverRunSucceeded(ctx, result, 'KV7');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── KV8: error classification through the runner ────────────────────────────────────────────────

const KV8_TOKENS = { Failing: 'it-kv8-failing-token', Working: 'it-kv8-working-token' } as const;

/** One KV8 scenario: what the first server answers, and what the runner must do about it. */
interface ClassificationScenario {
    Label: string;
    Status: number;
    Body: unknown;
    ErrorType: string;
    /** Requests the failing server gets: the first try plus any rate-limit retries. */
    FailingRequests: number;
    /** Whether the run fails over to the working server and succeeds there. */
    FailsOver: boolean;
}

const KV8_SCENARIOS: readonly ClassificationScenario[] = [
    { Label: 'KV8 503', Status: 503, Body: KEV_STOPPING, ErrorType: 'ServiceUnavailable', FailingRequests: 1, FailsOver: true },
    { Label: 'KV8 429', Status: 429, Body: KEV_AT_CAPACITY, ErrorType: 'RateLimit', FailingRequests: 2, FailsOver: true },
    { Label: 'KV8 401', Status: 401, Body: KEV_UNAUTHORIZED, ErrorType: 'Authentication', FailingRequests: 1, FailsOver: false },
];

/** The rate-limit retries the KV8 prompt allows before failing over. */
const KV8_MAX_RETRIES = 1;

async function runClassificationScenario(
    ctx: IntegrationCheckContext,
    fixtures: DecisionFixtures,
    prompt: MJAIPromptEntityExtended,
    servers: { Failing: LocalSystemOneServer; Working: LocalSystemOneServer },
    scenario: ClassificationScenario,
): Promise<void> {
    const label = scenario.Label;
    servers.Failing.Respond = answerWith(scenario.Status, scenario.Body);
    const params = decisionParams(ctx, prompt);
    params.apiKeys = [{ driverClass: 'OpenRouterDecision', apiKey: 'it-kv8-openrouter-token' }];
    const counts = { Failing: servers.Failing.Requests.length, Working: servers.Working.Requests.length, OpenRouter: openRouter.Requests.length };
    const probe = new DecisionRunnerProbe();
    const result = await runDecision(probe, params, id => fixtures.TrackPromptRun(id));

    AssertEqual(servers.Failing.Requests.length - counts.Failing, scenario.FailingRequests, `${label}: requests to the failing server`);
    const attempts = probe.Attempts.map(a => `${a.Attempt.errorType}:${a.WillRetry ? 'retry' : 'stop'}`);
    const expectedAttempts = Array.from({ length: scenario.FailingRequests }, () => `${scenario.ErrorType}:${scenario.FailsOver ? 'retry' : 'stop'}`);
    AssertEqual(JSON.stringify(attempts), JSON.stringify(expectedAttempts), `${label}: the attempts the runner logged`);
    for (const attempt of probe.Attempts) {
        Assert(attempt.Attempt.error.message.includes(`HTTP ${scenario.Status}`), `${label}: the error does not name HTTP ${scenario.Status}: ${attempt.Attempt.error.message}`);
    }
    const expectedDelays = scenario.Status === 429 ? [{ AttemptNumber: 1, SuggestedDelaySeconds: 30 }] : [];
    AssertEqual(JSON.stringify(probe.RetryDelays), JSON.stringify(expectedDelays), `${label}: rate-limit backoffs requested`);
    AssertEqual(openRouter.Requests.length - counts.OpenRouter, 0, `${label}: requests to Kev-4B on OpenRouter`);

    if (scenario.FailsOver) {
        assertAnsweredBy(result, 'Kev-27B', VENDOR_NAME, DRIVER_CLASS, label);
        assertServed(servers.Working, counts.Working, KV8_TOKENS.Working, label);
        await assertFailedOverRunSucceeded(ctx, result, label);
    } else {
        Assert(!result.success, `${label}: the decision succeeded`);
        Assert((result.errorMessage ?? '').includes(`HTTP ${scenario.Status}`), `${label}: the result's error does not name HTTP ${scenario.Status}: ${result.errorMessage}`);
        AssertEqual(servers.Working.Requests.length - counts.Working, 0, `${label}: requests to Kev-27B's server`);
        await assertRunRow(ctx, result, 'Kev-9B', VENDOR_NAME, false, label);
    }
}

async function checkErrorClassification(ctx: IntegrationCheckContext, failing: LocalSystemOneServer, working: LocalSystemOneServer): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'kv8');
    openRouter.Armed = true;
    try {
        // Kev-9B (the failing server), Kev-27B (a working one) on the same vendor, then Kev-4B on another.
        const created = await fixtures.CreateDecisionPrompt('KV8 classification', {
            Bindings: [
                { Key: 'kev9b', ModelName: 'Kev-9B', VendorName: VENDOR_NAME, Priority: 30 },
                { Key: 'kev27b', ModelName: 'Kev-27B', VendorName: VENDOR_NAME, Priority: 20 },
                { Key: 'kev4b', ModelName: 'Kev-4B', VendorName: OPENROUTER_VENDOR, Priority: 10 },
            ],
            MaxRetries: KV8_MAX_RETRIES,
        });
        const failingCredential = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, 'KV8 Kev-9B', { apiKey: KV8_TOKENS.Failing, endpoint: failing.BaseURL });
        await fixtures.BindToPromptModel(failingCredential.ID, created.PromptModelIDs['kev9b']);
        const workingCredential = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, 'KV8 Kev-27B', { apiKey: KV8_TOKENS.Working, endpoint: working.BaseURL });
        await fixtures.BindToPromptModel(workingCredential.ID, created.PromptModelIDs['kev27b']);

        for (const scenario of KV8_SCENARIOS) {
            await runClassificationScenario(ctx, fixtures, created.Prompt, { Failing: failing, Working: working }, scenario);
        }
    } finally {
        openRouter.Armed = false;
        await fixtures.Cleanup();
    }
}

// ─── KV9: Kev-4B on OpenRouter ───────────────────────────────────────────────────────────────────

const KV9_TOKEN = 'it-kv9-openrouter-token';

async function checkKev4BOnOpenRouter(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const params = overrideParams(ctx, 'Kev-4B', OPENROUTER_VENDOR);
    params.apiKeys = [{ driverClass: 'OpenRouterDecision', apiKey: KV9_TOKEN }];
    const before = openRouter.Requests.length;
    openRouter.Armed = true;
    let result: AIDecisionRunResult;
    try {
        result = await runDecision(new AIDecisionRunner(), params, id => {
            if (id) {
                createdPromptRunIDs.push(id);
            }
        });
    } finally {
        openRouter.Armed = false;
    }

    assertAnsweredBy(result, 'Kev-4B', OPENROUTER_VENDOR, 'OpenRouterDecision', 'KV9');
    AssertEqual(openRouter.Requests.length - before, 1, 'KV9: requests to OpenRouter');
    const sent = openRouter.Requests[openRouter.Requests.length - 1];
    AssertEqual(sent.Url, OpenRouterDecision.DEFAULT_ENDPOINT, 'KV9: request URL');
    AssertEqual(sent.Authorization, `Bearer ${KV9_TOKEN}`, 'KV9: Authorization header');
    Assert(IsSystemOneWireObject(sent.Body), 'KV9: the request body is not an object');
    AssertEqual(JSON.stringify(sent.Body), JSON.stringify({ model: KEV_4B_OPENROUTER_API_NAME, state: STATE, questions: EXPECTED_WIRE_QUESTIONS }), 'KV9: request body');
    assertKevAnswers(result, 'KV9');
    AssertEqual(result.DecisionResult?.ResolvedModel, KEV_4B_OPENROUTER_API_NAME, 'KV9: resolved model');

    await assertRunRow(ctx, result, 'Kev-4B', OPENROUTER_VENDOR, true, 'KV9');
    const row = await ReadDecisionPromptRun(ctx, result.promptRun!.ID);
    AssertEqual(row?.TokensPrompt, SERVED_INPUT_TOKENS, 'KV9: run TokensPrompt');
    assertClose(result.cost, OPENROUTER_REPORTED_COST, 'KV9: the cost OpenRouter reported');
    // The column keeps 8 decimal places.
    Assert(typeof row?.Cost === 'number' && Math.abs(row.Cost - OPENROUTER_REPORTED_COST) < 1e-8, `KV9: run Cost, as OpenRouter reported it — expected ${OPENROUTER_REPORTED_COST} to 8 places, got ${String(row?.Cost)}`);
}

// ─── KV10: a binding on the serving row, whatever order the rows load in ─────────────────────────

const KV10_TOKEN = 'it-kv10-inference-row-token';

/** The keys of KV10's two rows of one model on one vendor. */
interface TwoRowKeys {
    Developer: string;
    Inference: string;
}

/**
 * Keys that put the Model Developer row first and the Inference Provider row last in whatever order a
 * database returns them. The engine loads `MJ: AI Model Vendors` with no ORDER BY, so SQL Server returns
 * the rows in clustered-key order, which compares a `uniqueidentifier`'s last six bytes first;
 * PostgreSQL's `uuid` order and a string sort compare the first four bytes first. Both ends are all
 * zeros for one key and all `f`s for the other, and the middle is random, so no two runs share a key.
 */
function twoRowKeys(): TwoRowKeys {
    const middle = randomUUID().slice(8, 23);
    return { Developer: `00000000${middle}-000000000000`, Inference: `ffffffff${middle}-ffffffffffff` };
}

/**
 * Asserts the engine holds the model's two rows on `vendorId`, both Active, the Model Developer row
 * first: the row the runner read before the fix, which does not serve the model and has no binding.
 */
function assertDeveloperRowFirst(modelId: string, vendorId: string, keys: TwoRowKeys): void {
    const rows = (AIEngine.Instance.ModelVendorsByModelID.get(NormalizeUUID(modelId)) ?? []).filter(mv => UUIDsEqual(mv.VendorID, vendorId));
    AssertEqual(
        JSON.stringify(rows.map(mv => `${mv.Type}:${mv.Status}:${NormalizeUUID(mv.ID)}`)),
        JSON.stringify([`Model Developer:Active:${keys.Developer}`, `Inference Provider:Active:${keys.Inference}`]),
        "KV10 precondition: the engine's rows of the model on System One Endpoint, in order",
    );
}

/** The one candidate of an override naming the KV10 model on System One Endpoint. */
function requireOnlyCandidate(probe: DecisionRunnerProbe, prompt: MJAIPromptEntityExtended, params: AIDecisionParams, modelName: string): ModelVendorCandidate {
    const candidates = probe.Candidates(prompt, params);
    AssertEqual(candidates.map(describeCandidate).join(', '), `${modelName} / ${VENDOR_NAME} / ${DRIVER_CLASS}`, 'KV10: the candidates');
    return candidates[0];
}

async function checkBindingOnServingRow(ctx: IntegrationCheckContext, server: LocalSystemOneServer): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'kv10');
    try {
        const keys = twoRowKeys();
        // Saved Developer row first as well, so an engine that appends saved rows holds the same order.
        const model = await fixtures.CreateDecisionModel('KV10 two-row model', [
            { ID: keys.Developer, VendorName: VENDOR_NAME, Type: 'Model Developer', Priority: 0 },
            { ID: keys.Inference, VendorName: VENDOR_NAME, Type: 'Inference Provider', Priority: 1, DriverClass: DRIVER_CLASS, APIName: 'kev-latest' },
        ]);
        const vendor = requireVendor(VENDOR_NAME);
        assertDeveloperRowFirst(model.ID, vendor.ID, keys);

        const prompt = RequireDefaultDecisionPrompt();
        const params = decisionParams(ctx, prompt);
        params.override = { modelId: model.ID, vendorId: vendor.ID };
        const probe = new DecisionRunnerProbe();
        const unbound = requireOnlyCandidate(probe, prompt, params, model.Name);
        Assert(!probe.HasCredentials(unbound, prompt, params), 'KV10 precondition: the candidate has a credential before any binding, so the binding would prove nothing');

        const credential = await fixtures.CreateCredential(ENDPOINT_CREDENTIAL_TYPE, 'KV10 Inference Provider row', { apiKey: KV10_TOKEN, endpoint: server.BaseURL });
        await fixtures.BindToModelVendor(credential.ID, keys.Inference);
        assertDeveloperRowFirst(model.ID, vendor.ID, keys);
        const bound = requireOnlyCandidate(probe, prompt, params, model.Name);
        Assert(
            probe.HasCredentials(bound, prompt, params),
            'KV10: the candidate has no credential after its Inference Provider row was bound (the Model Developer row, first in the engine, was read instead)',
        );

        const before = server.Requests.length;
        const result = await runDecision(probe, params, id => fixtures.TrackPromptRun(id));
        assertAnsweredBy(result, model.Name, VENDOR_NAME, DRIVER_CLASS, 'KV10');
        const considered = result.modelSelectionInfo?.ModelsConsidered.find(c => UUIDsEqual(c.model.ID, model.ID));
        AssertEqual(considered?.available, true, 'KV10: the run saw the candidate as available');
        assertServed(server, before, KV10_TOKEN, 'KV10');
        assertKevAnswers(result, 'KV10');
        await assertRunRow(ctx, result, model.Name, VENDOR_NAME, true, 'KV10');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const SystemOneKevChecks: NamedCheck[] = [
    {
        Id: 'systemone-kev.KV1',
        Name: 'KV1: the Kev models are Active Decision models with their limits and System One Endpoint rows naming SystemOneDecision; Kev-4B also routes through OpenRouter first',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            const vendor = requireVendor(VENDOR_NAME);
            AssertEqual(vendor.CredentialType, ENDPOINT_CREDENTIAL_TYPE, 'KV1: the System One Endpoint vendor credential type');
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
            await withLocalServers(1, async ([server]) => {
                await runThroughRunner(ctx, server, 'Kev-4B', 'it-kev-token');
                // An open server: a credential with an endpoint and no key sends no Authorization header.
                await runThroughRunner(ctx, server, 'Kev-27B', '');
            });
        },
    },
    {
        Id: 'systemone-kev.KV4',
        Name: "KV4: Default Decision's candidates and selection are unchanged by Clef and Kev: Jev, then LLM Decision, then the fallbacks; a bound Kev row stays behind both and is not selected, and is reached only by failing over from both",
        Fn: checkDefaultDecisionSelection,
    },
    {
        Id: 'systemone-kev.KV5',
        Name: "KV5: a real API Key with Endpoint credential, stored encrypted and bound to Kev-9B's System One row, sends its token (not its JSON) as the bearer to its endpoint, and the answers map",
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await withLocalServers(1, ([server]) => checkCredentialFix(ctx, server));
        },
    },
    {
        Id: 'systemone-kev.KV6',
        Name: "KV6: credentials bound to the Kev-4B and Kev-27B System One rows send each model to its own server, and only its own",
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await withLocalServers(KV6_ROUTES.length, servers => checkPerRowRouting(ctx, servers));
        },
    },
    {
        Id: 'systemone-kev.KV7',
        Name: 'KV7: a Kev token with no endpoint and a Clef token with no account ID each fail before any request with a NoCredentials error naming the missing setting, and the run fails over to a working Kev server',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await withLocalServers(1, ([server]) => checkFailoverPastMisconfigured(ctx, server));
        },
    },
    {
        Id: 'systemone-kev.KV8',
        Name: "KV8: through the runner, a System One 503 fails over, a 429 is retried up to the prompt's MaxRetries then fails over, and a 401 stops the failover loop",
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await withLocalServers(2, ([failing, working]) => checkErrorClassification(ctx, failing, working));
        },
    },
    {
        Id: 'systemone-kev.KV9',
        Name: 'KV9: an override naming Kev-4B on OpenRouter uses OpenRouterDecision, POSTs to the OpenRouter decisions endpoint with jaredpalmer/kev-4b-20260924, and maps the answers',
        Fn: checkKev4BOnOpenRouter,
    },
    {
        Id: 'systemone-kev.KV10',
        Name: 'KV10: a credential bound to the Inference Provider row of a model that also has a Model Developer row on the same vendor, loaded first, makes the candidate available and reaches its server with the bound token',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await withLocalServers(1, ([server]) => checkBindingOnServingRow(ctx, server));
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
        openRouter.Requests.length = 0;
        openRouter.Armed = false;
        cloudflareRequests.length = 0;
        bundleRestores.push(ClearEnvironment(DRIVER_ENVIRONMENT));
        bundleRestores.push(RegisterDecisionStandIn('OpenRouterDecision', ScriptedOpenRouterDecision, OpenRouterDecision));
        bundleRestores.push(RegisterDecisionStandIn('CloudflareDecision', RefusingCloudflareDecision, CloudflareDecision));
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await DecisionFixtures.CleanupAll();
        for (const id of createdPromptRunIDs.splice(0)) {
            await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User);
        }
        openRouter.Armed = false;
        openRouter.Requests.length = 0;
        cloudflareRequests.length = 0;
        for (const restore of bundleRestores.splice(0).reverse()) {
            restore();
        }
    },
});
