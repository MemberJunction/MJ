/**
 * gemini-decisions.checks.ts — IT172: Google's Gemini Decision 1 (`gemini-decision-1` on Google AI Studio's
 * Gemini Decisions API through `GeminiDecision`, and `google/gemini-decision-1-20261111` on OpenRouter's
 * Decisions API through `OpenRouterDecision`) from synced metadata through `AIDecisionRunner` to the wire
 * request and response, with no network.
 *
 * GD1–GD8, deterministic, server transport:
 * - GD1: Catalog metadata — Google and OpenRouter `API Key` vendors; `Gemini Decision 1` Active, `Decision`,
 *   PowerRank 61, effective Decision limits 1,000 / 255 / 255 / 262,144; 1 Google Model Developer row; 1
 *   Google Inference Provider row (`GeminiDecision`, `gemini-decision-1`, 262,144 tokens) at higher priority
 *   than 1 OpenRouter Inference Provider row (`OpenRouterDecision`, `google/gemini-decision-1-20261111`,
 *   262,144 tokens); active Realtime cost rows at $0.10 per 1M input tokens and $0 output on both vendors.
 * - GD2: ClassFactory — `GeminiDecision` is registered under `'GeminiDecision'`, `CreateInstance` builds the
 *   guarded subclass reading a JSON credential's `endpoint` (trailing slash trimmed), and the default
 *   endpoint is `https://generativelanguage.googleapis.com/v1beta/decisions`.
 * - GD3: Runner call on Google — `ExecuteDecision` with override naming `Gemini Decision 1` on `Google`
 *   POSTs `{ model: 'gemini-decision-1', input: JSON.stringify(STATE), questions }` (never `state`) with
 *   `x-goog-api-key` and no `Authorization` header, sends nothing to OpenRouter, maps Google's live wire
 *   response (which omits `model`, leaving `ResolvedModel` undefined, and keys 12-level Score probabilities
 *   by `'0'`..`'11'`), and records the `MJ: AI Prompt Runs` row priced at $0.10/1M input tokens.
 * - GD4: Runner call on OpenRouter — the same override on `OpenRouter` POSTs System One `{ model:
 *   'google/gemini-decision-1-20261111', state: STATE, questions }` with `Authorization: Bearer <key>`,
 *   sends nothing to Google, records `ResolvedModel`, and prices the run from the OpenRouter cost row.
 * - GD5: Bound credentials — real encrypted `API Key` credentials created via `CredentialEngine` and bound
 *   to `Gemini Decision 1`'s Google and OpenRouter Inference Provider rows send raw tokens, never JSON.
 * - GD6: Input-filter block failover — Google's `prompt_feedback.block_reason` response (no `answers`)
 *   fails the Google attempt as a `ModelError` naming the block reason and fails over to OpenRouter.
 * - GD7: HTTP 400 and 403 failover — Google's gateway `400 INVALID_ARGUMENT` (redacting any leaked key),
 *   decisions-service `400 invalid_request` (`"must have between 1 and 1000 questions"`), and `403
 *   PERMISSION_DENIED` each fail as a retriable `ModelError` and fail over cleanly to OpenRouter without
 *   triggering `BaseModelRunner` vendor-removal index skipping.
 * - GD8: `Default Decision` ordering & failover — `Jev` then `LLM Decision` stay first and selected;
 *   `Gemini Decision 1` on `Google` then `OpenRouter` appear in `power-match-fallback` order at distance 4
 *   from target rank 57 (ahead of `Kev-4B`, `Kev-0.8B`, `Mercury Decide`, `SubQ Snap`); binding credentials
 *   to both rows leaves order and selection unchanged; and when every other driver fails with
 *   `ServiceUnavailable`, `Default Decision` fails over to `Gemini Decision 1` on `Google`.
 */
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseDecision, type ChoiceAnswer, type DecisionQuestion, type LikelihoodAnswer, type ScoreAnswer } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { AIDecisionRunner, type AIDecisionParams, type AIDecisionRunResult, type ModelVendorCandidate } from '@memberjunction/ai-prompts';
import { GeminiDecision } from '@memberjunction/ai-gemini';
import { OpenRouterDecision } from '@memberjunction/ai-openrouter';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { RegisterScriptedDecision, ScriptedDecision, SCRIPTED_DECISION_DRIVER_CLASSES } from './decision-test-double';
import {
    AssertAnsweredBy,
    AssertClose,
    AssertDefaultDecisionFailsOverTo,
    AssertInferenceRow,
    AssertRunRow,
    AssertSelects,
    DecisionFixtures,
    DecisionRunnerProbe,
    DescribeCandidate,
    ExpectedSelection,
    ModelNameOf,
    ModelVendorRowsOf,
    NewDecisionParams,
    RegisterDecisionStandIn,
    RequireDecisionModel,
    RequireDefaultDecisionPrompt,
    RequireInferenceRowID,
    RequireVendorID,
    RunDecision,
} from './decision-fixtures';
import {
    AssertOneGoogleRequest,
    AssertOneRequest,
    GuardedOpenRouterDecision,
    GuardedSend,
    JSONResponse,
    NewGuardState,
    OPENROUTER_GUARD,
    ResetGuards,
    WithGuardsArmed,
    type GuardResponder,
} from './decision-guards';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'Gemini Decision 1';
const GOOGLE_VENDOR = 'Google';
const OPENROUTER_VENDOR = 'OpenRouter';
const GEMINI_DRIVER = 'GeminiDecision';
const OPENROUTER_DRIVER = 'OpenRouterDecision';
const GEMINI_API_NAME = 'gemini-decision-1';
const OPENROUTER_API_NAME = 'google/gemini-decision-1-20261111';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';
const GEMINI_POWER_RANK = 61;
const GEMINI_MAX_INPUT_TOKENS = 262_144;
const GEMINI_INPUT_PRICE_PER_MILLION = 0.1;

const DECISION_LIMITS = {
    MaxQuestionsPerCall: 1000,
    MaxChoiceOptions: 255,
    MaxScoreLevels: 255,
    MaxStateTokens: 262_144,
} as const;

const GEMINI_KEY = 'AIza-it-gemini-key-no-network';
const OPENROUTER_KEY = 'sk-or-it-gemini-key-no-network';

const SCORE_LEVELS_12 = [
    '0 - informational',
    '1 - cosmetic',
    '2 - minor question',
    '3 - low priority bug',
    '4 - workaround exists',
    '5 - moderate degradation',
    '6 - partial feature failure',
    '7 - single customer blocked',
    '8 - multiple customers degraded',
    '9 - major subsystem down',
    '10 - checkout degraded',
    '11 - critical P0 total checkout outage',
];

const GEMINI_STATE = {
    ticket: 'Production database connections exhausted; API returning HTTP 503 for all checkout requests.',
    customerTier: 'Enterprise',
};

const GEMINI_QUESTIONS: Record<string, DecisionQuestion> = {
    is_incident: { Kind: 'Likelihood', Instructions: 'Is this ticket reporting an active production outage?' },
    route: {
        Kind: 'Choice',
        Instructions: 'Which on-call rotation should handle this ticket?',
        Options: [
            { Value: 'billing', Description: 'Invoice, payment method, or subscription disputes.' },
            { Value: 'sre_database', Description: 'Database availability, connection pool exhaustion, or outages.' },
            { Value: 'frontend_design', Description: 'Visual styling, CSS layout, or typography bugs.' },
        ],
    },
    urgency_12: {
        Kind: 'Score',
        Instructions: 'Score the urgency from level 0 (routine) to level 11 (critical P0 outage).',
        Levels: SCORE_LEVELS_12,
    },
};

const GEMINI_EXPECTED_QUESTIONS = {
    is_incident: { type: 'noul', instructions: 'Is this ticket reporting an active production outage?' },
    route: {
        type: 'choice',
        instructions: 'Which on-call rotation should handle this ticket?',
        criteria: {
            billing: 'Invoice, payment method, or subscription disputes.',
            sre_database: 'Database availability, connection pool exhaustion, or outages.',
            frontend_design: 'Visual styling, CSS layout, or typography bugs.',
        },
    },
    urgency_12: {
        type: 'score',
        instructions: 'Score the urgency from level 0 (routine) to level 11 (critical P0 outage).',
        criteria: SCORE_LEVELS_12,
    },
};

const GEMINI_INPUT_TOKENS = 363;

const SCORE_PROBABILITIES_12: Record<string, number> = {
    '0': 0.001, '1': 0.001, '2': 0.001, '3': 0.001, '4': 0.001, '5': 0.001,
    '6': 0.002, '7': 0.002, '8': 0.005, '9': 0.015, '10': 0.05, '11': 0.92,
};

/** Google's live v1beta/decisions wire response: omits `model` and uses `total_input_tokens` / `total_output_tokens`. */
const GOOGLE_WIRE_RESPONSE = {
    answers: {
        is_incident: { type: 'noul', noul: 0.99, confidence: 0.99 },
        route: {
            type: 'choice',
            choice: 'sre_database',
            probabilities: { billing: 0.005, sre_database: 0.99, frontend_design: 0.005 },
            confidence: 0.99,
        },
        urgency_12: {
            type: 'score',
            score: 10.87,
            probabilities: SCORE_PROBABILITIES_12,
            legend: Object.fromEntries(SCORE_LEVELS_12.map((lvl, idx) => [String(idx), lvl])),
            confidence: 0.92,
        },
    },
    usage: {
        total_tokens: GEMINI_INPUT_TOKENS,
        total_input_tokens: GEMINI_INPUT_TOKENS,
        input_tokens_by_modality: [{ modality: 'text', tokens: GEMINI_INPUT_TOKENS }],
        total_output_tokens: 0,
    },
};

/** OpenRouter's System One wire response for `google/gemini-decision-1-20261111`, which includes `model`. */
const OPENROUTER_WIRE_RESPONSE = {
    model: OPENROUTER_API_NAME,
    answers: GOOGLE_WIRE_RESPONSE.answers,
    usage: { input_tokens: GEMINI_INPUT_TOKENS, output_tokens: 0 },
};

// ─── Guards ──────────────────────────────────────────────────────────────────────────────────────

const geminiGuard = NewGuardState();
const ALL_GUARDS = [geminiGuard, OPENROUTER_GUARD] as const;

class GuardedGeminiDecision extends GeminiDecision {
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return GuardedSend(geminiGuard, 'Gemini', url, init);
    }
}

async function withGuardsArmed<T>(responders: { Gemini?: GuardResponder; OpenRouter?: GuardResponder }, work: () => Promise<T>): Promise<T> {
    return WithGuardsArmed([[geminiGuard, responders.Gemini], [OPENROUTER_GUARD, responders.OpenRouter]], work);
}

const answerAsGoogle: GuardResponder = () => JSONResponse(200, GOOGLE_WIRE_RESPONSE);
const answerAsOpenRouter: GuardResponder = () => JSONResponse(200, OPENROUTER_WIRE_RESPONSE);

const bundleRestores: Array<() => void> = [];

// ─── Shared Params & Answer Assertions ───────────────────────────────────────────────────────────

function geminiParams(ctx: IntegrationCheckContext): AIDecisionParams {
    return NewDecisionParams(ctx, RequireDefaultDecisionPrompt(), GEMINI_STATE, GEMINI_QUESTIONS);
}

function geminiOverrideParams(ctx: IntegrationCheckContext, vendorName?: string): AIDecisionParams {
    const params = geminiParams(ctx);
    params.override = {
        modelId: RequireDecisionModel(GEMINI_MODEL).ID,
        vendorId: vendorName ? RequireVendorID(vendorName) : undefined,
    };
    return params;
}

function assertMappedAnswers(result: AIDecisionRunResult, label: string): void {
    AssertClose((result.Answers['is_incident'] as LikelihoodAnswer)?.Probability, 0.99, `${label}: is_incident probability`);
    const route = result.Answers['route'] as ChoiceAnswer;
    AssertEqual(route?.Value, 'sre_database', `${label}: route choice`);
    AssertClose(route.Probabilities['sre_database'], 0.99, `${label}: route sre_database probability`);
    const urgency = result.Answers['urgency_12'] as ScoreAnswer;
    AssertClose(urgency?.Value, 10.87, `${label}: urgency_12 score`);
    AssertClose(urgency.Confidence, 0.92, `${label}: urgency_12 confidence`);
    AssertEqual(JSON.stringify(Object.keys(urgency.Probabilities)), JSON.stringify(SCORE_LEVELS_12), `${label}: urgency_12 keyed by level names`);
    AssertClose(urgency.Probabilities['11 - critical P0 total checkout outage'], 0.92, `${label}: urgency_12 top level probability`);
}

async function assertPricedRunRow(ctx: IntegrationCheckContext, result: AIDecisionRunResult, vendorName: string, label: string): Promise<void> {
    await AssertRunRow(ctx, result, GEMINI_MODEL, vendorName, GEMINI_INPUT_TOKENS, (GEMINI_INPUT_TOKENS * GEMINI_INPUT_PRICE_PER_MILLION) / 1_000_000, label);
}

// ─── GD1: Catalog ────────────────────────────────────────────────────────────────────────────────

function assertLimitsAndCost(model: MJAIModelEntityExtended, row: MJAIModelVendorEntity, vendorName: string): void {
    const label = `GD1 ${model.Name} on ${vendorName}`;
    const limits = AIEngine.Instance.GetEffectiveModelConfiguration(model.ID, row.ID)?.Decision;
    AssertEqual(
        JSON.stringify({
            MaxQuestionsPerCall: limits?.MaxQuestionsPerCall,
            MaxChoiceOptions: limits?.MaxChoiceOptions,
            MaxScoreLevels: limits?.MaxScoreLevels,
            MaxStateTokens: limits?.MaxStateTokens,
        }),
        JSON.stringify(DECISION_LIMITS),
        `${label}: effective Decision limits`,
    );
    const cost = AIEngine.Instance.GetActiveModelCost(model.ID, RequireVendorID(vendorName), 'Realtime');
    Assert(!!cost, `${label}: no active Realtime cost row`);
    AssertClose(cost!.InputPricePerUnit, GEMINI_INPUT_PRICE_PER_MILLION, `${label}: input price per unit`);
    AssertClose(cost!.OutputPricePerUnit, 0, `${label}: output price per unit`);
    AssertEqual(cost!.UnitType, 'Per 1M Tokens', `${label}: cost unit type`);
}

function checkCatalog(): void {
    for (const vendorName of [GOOGLE_VENDOR, OPENROUTER_VENDOR]) {
        AssertEqual(AIEngine.Instance.Vendors.find(v => v.Name === vendorName)?.CredentialType, 'API Key', `GD1: ${vendorName} credential type`);
    }
    const model = RequireDecisionModel(GEMINI_MODEL);
    AssertEqual(model.IsActive, true, 'GD1: IsActive');
    AssertEqual(model.AIModelType, 'Decision', 'GD1: AIModelType');
    AssertEqual(model.PowerRank, GEMINI_POWER_RANK, 'GD1: PowerRank');
    AssertEqual(AIEngine.Instance.Models.filter(m => m.Name === GEMINI_MODEL).length, 1, 'GD1: unique model name');
    AssertEqual(ModelVendorRowsOf(model, GOOGLE_VENDOR, 'Model Developer').length, 1, 'GD1: Google Model Developer rows');

    const googleRows = ModelVendorRowsOf(model, GOOGLE_VENDOR, 'Inference Provider');
    const openRouterRows = ModelVendorRowsOf(model, OPENROUTER_VENDOR, 'Inference Provider');
    AssertEqual(googleRows.length, 1, 'GD1: Google Inference Provider rows');
    AssertEqual(openRouterRows.length, 1, 'GD1: OpenRouter Inference Provider rows');
    AssertInferenceRow(googleRows[0], GEMINI_DRIVER, GEMINI_API_NAME, GEMINI_MAX_INPUT_TOKENS, 'GD1 Google row');
    AssertInferenceRow(openRouterRows[0], OPENROUTER_DRIVER, OPENROUTER_API_NAME, GEMINI_MAX_INPUT_TOKENS, 'GD1 OpenRouter row');
    Assert(googleRows[0].Priority > openRouterRows[0].Priority, `GD1: Google priority ${googleRows[0].Priority} must exceed OpenRouter ${openRouterRows[0].Priority}`);
    assertLimitsAndCost(model, googleRows[0], GOOGLE_VENDOR);
    assertLimitsAndCost(model, openRouterRows[0], OPENROUTER_VENDOR);
}

// ─── GD2: ClassFactory ───────────────────────────────────────────────────────────────────────────

function checkClassFactory(): void {
    const factory = MJGlobal.Instance.ClassFactory;
    Assert(
        factory.GetAllRegistrations(BaseDecision, GEMINI_DRIVER).some(r => r.SubClass === GeminiDecision),
        "GD2: the shipped GeminiDecision is not registered under 'GeminiDecision'",
    );
    const built = factory.CreateInstance<BaseDecision>(
        BaseDecision,
        GEMINI_DRIVER,
        JSON.stringify({ apiKey: GEMINI_KEY, endpoint: 'https://gateway.example.test/v1beta/decisions/' }),
    );
    if (!(built instanceof GeminiDecision)) {
        throw new Error(`GD2: ClassFactory built ${built?.constructor?.name ?? 'nothing'}, not a GeminiDecision`);
    }
    AssertEqual(built.constructor, GuardedGeminiDecision, 'GD2: guarded subclass is on top');
    AssertEqual(built.EndpointURL, 'https://gateway.example.test/v1beta/decisions', 'GD2: endpoint from credential JSON with trailing slash trimmed');
    AssertEqual(new GeminiDecision(GEMINI_KEY).EndpointURL, GEMINI_ENDPOINT, 'GD2: default Gemini Decisions endpoint');
}

// ─── GD3 & GD4: Runner Calls on Google and OpenRouter ────────────────────────────────────────────

async function checkGeminiRunnerCall(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'gd3');
    try {
        const params = geminiOverrideParams(ctx, GOOGLE_VENDOR);
        params.apiKeys = [{ driverClass: GEMINI_DRIVER, apiKey: GEMINI_KEY }];
        const geminiBefore = geminiGuard.Requests.length;
        const openRouterBefore = OPENROUTER_GUARD.Requests.length;
        const result = await withGuardsArmed({ Gemini: answerAsGoogle }, () => RunDecision(new AIDecisionRunner(), params, fixtures));
        AssertAnsweredBy(result, GEMINI_MODEL, GOOGLE_VENDOR, GEMINI_DRIVER, 'GD3');
        AssertOneGoogleRequest(
            geminiGuard,
            geminiBefore,
            GEMINI_ENDPOINT,
            GEMINI_KEY,
            { model: GEMINI_API_NAME, input: JSON.stringify(GEMINI_STATE), questions: GEMINI_EXPECTED_QUESTIONS },
            'GD3',
        );
        AssertEqual(OPENROUTER_GUARD.Requests.length - openRouterBefore, 0, 'GD3: OpenRouter requests');
        assertMappedAnswers(result, 'GD3');
        AssertEqual(result.DecisionResult?.ResolvedModel, undefined, 'GD3: Google omits model so ResolvedModel stays undefined');
        await assertPricedRunRow(ctx, result, GOOGLE_VENDOR, 'GD3');
    } finally {
        await fixtures.Cleanup();
    }
}

async function checkOpenRouterRunnerCall(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'gd4');
    try {
        const params = geminiOverrideParams(ctx, OPENROUTER_VENDOR);
        params.apiKeys = [{ driverClass: OPENROUTER_DRIVER, apiKey: OPENROUTER_KEY }];
        const geminiBefore = geminiGuard.Requests.length;
        const openRouterBefore = OPENROUTER_GUARD.Requests.length;
        const result = await withGuardsArmed({ OpenRouter: answerAsOpenRouter }, () => RunDecision(new AIDecisionRunner(), params, fixtures));
        AssertAnsweredBy(result, GEMINI_MODEL, OPENROUTER_VENDOR, OPENROUTER_DRIVER, 'GD4');
        AssertOneRequest(
            OPENROUTER_GUARD,
            openRouterBefore,
            OpenRouterDecision.DEFAULT_ENDPOINT,
            OPENROUTER_KEY,
            { model: OPENROUTER_API_NAME, state: GEMINI_STATE, questions: GEMINI_EXPECTED_QUESTIONS },
            'GD4',
        );
        AssertEqual(geminiGuard.Requests.length - geminiBefore, 0, 'GD4: Google requests');
        assertMappedAnswers(result, 'GD4');
        AssertEqual(result.DecisionResult?.ResolvedModel, OPENROUTER_API_NAME, 'GD4: OpenRouter resolved model');
        await assertPricedRunRow(ctx, result, OPENROUTER_VENDOR, 'GD4');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── GD5: Bound Encrypted Credentials ────────────────────────────────────────────────────────────

const GD5_GOOGLE_TOKEN = 'AIza-it-gd5-google-token';
const GD5_OPENROUTER_TOKEN = 'sk-or-it-gd5-openrouter-token';

async function checkBoundCredentials(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'gd5');
    try {
        const googleCred = await fixtures.CreateCredential('API Key', 'GD5 Gemini Google', { apiKey: GD5_GOOGLE_TOKEN });
        await fixtures.BindToModelVendor(googleCred.ID, RequireInferenceRowID(GEMINI_MODEL, GOOGLE_VENDOR));
        const openRouterCred = await fixtures.CreateCredential('API Key', 'GD5 Gemini OpenRouter', { apiKey: GD5_OPENROUTER_TOKEN });
        await fixtures.BindToModelVendor(openRouterCred.ID, RequireInferenceRowID(GEMINI_MODEL, OPENROUTER_VENDOR));

        await withGuardsArmed({ Gemini: answerAsGoogle, OpenRouter: answerAsOpenRouter }, async () => {
            const geminiBefore = geminiGuard.Requests.length;
            const googleRun = await RunDecision(new AIDecisionRunner(), geminiOverrideParams(ctx, GOOGLE_VENDOR), fixtures);
            AssertAnsweredBy(googleRun, GEMINI_MODEL, GOOGLE_VENDOR, GEMINI_DRIVER, 'GD5 Google');
            AssertOneGoogleRequest(
                geminiGuard,
                geminiBefore,
                GEMINI_ENDPOINT,
                GD5_GOOGLE_TOKEN,
                { model: GEMINI_API_NAME, input: JSON.stringify(GEMINI_STATE), questions: GEMINI_EXPECTED_QUESTIONS },
                'GD5 Google',
            );

            const orBefore = OPENROUTER_GUARD.Requests.length;
            const orRun = await RunDecision(new AIDecisionRunner(), geminiOverrideParams(ctx, OPENROUTER_VENDOR), fixtures);
            AssertAnsweredBy(orRun, GEMINI_MODEL, OPENROUTER_VENDOR, OPENROUTER_DRIVER, 'GD5 OpenRouter');
            AssertOneRequest(
                OPENROUTER_GUARD,
                orBefore,
                OpenRouterDecision.DEFAULT_ENDPOINT,
                GD5_OPENROUTER_TOKEN,
                { model: OPENROUTER_API_NAME, state: GEMINI_STATE, questions: GEMINI_EXPECTED_QUESTIONS },
                'GD5 OpenRouter',
            );
        });
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── GD6 & GD7: Input-Filter Block & HTTP 400 / 403 Failover ─────────────────────────────────────

async function assertGoogleFailsOverToOpenRouter(
    ctx: IntegrationCheckContext,
    fixtures: DecisionFixtures,
    googleResponder: GuardResponder,
    expectedSubstring: string,
    label: string,
): Promise<void> {
    const params = geminiOverrideParams(ctx);
    params.apiKeys = [
        { driverClass: GEMINI_DRIVER, apiKey: GEMINI_KEY },
        { driverClass: OPENROUTER_DRIVER, apiKey: OPENROUTER_KEY },
    ];
    const probe = new DecisionRunnerProbe();
    AssertEqual(
        probe.Candidates(RequireDefaultDecisionPrompt(), params).map(DescribeCandidate).join(', '),
        `${GEMINI_MODEL} / ${GOOGLE_VENDOR} / ${GEMINI_DRIVER}, ${GEMINI_MODEL} / ${OPENROUTER_VENDOR} / ${OPENROUTER_DRIVER}`,
        `${label}: candidates`,
    );
    const counts = { Gemini: geminiGuard.Requests.length, OpenRouter: OPENROUTER_GUARD.Requests.length };
    const result = await withGuardsArmed({ Gemini: googleResponder, OpenRouter: answerAsOpenRouter }, () => RunDecision(probe, params, fixtures));
    AssertEqual(geminiGuard.Requests.length - counts.Gemini, 1, `${label}: Google requests`);
    AssertEqual(OPENROUTER_GUARD.Requests.length - counts.OpenRouter, 1, `${label}: OpenRouter requests`);
    AssertAnsweredBy(result, GEMINI_MODEL, OPENROUTER_VENDOR, OPENROUTER_DRIVER, label);
    assertMappedAnswers(result, label);
    AssertEqual(
        JSON.stringify(probe.Attempts.map(a => `${ModelNameOf(a.Attempt.modelId)}:${a.Attempt.errorType}:${a.WillRetry ? 'retry' : 'stop'}`)),
        JSON.stringify([`${GEMINI_MODEL}:ModelError:retry`]),
        `${label}: failed attempts`,
    );
    Assert(UUIDsEqual(probe.Attempts[0].Attempt.vendorId ?? '', RequireVendorID(GOOGLE_VENDOR)), `${label}: failed attempt vendor must be Google`);
    const errMsg = probe.Attempts[0].Attempt.error.message;
    Assert(errMsg.includes(expectedSubstring), `${label}: expected '${expectedSubstring}' in '${errMsg}'`);
    Assert(!errMsg.includes(GEMINI_KEY), `${label}: error message leaked API key`);
}

async function checkBlockedInputFailover(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'gd6');
    try {
        const blocked = { prompt_feedback: { block_reason: 'safety', block_reason_message: 'Unsafe content' } };
        await assertGoogleFailsOverToOpenRouter(
            ctx,
            fixtures,
            () => JSONResponse(200, blocked),
            'Gemini Decisions API blocked the input: safety (Unsafe content)',
            'GD6 blocked input',
        );
    } finally {
        await fixtures.Cleanup();
    }
}

async function checkHttpErrorFailover(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const fixtures = new DecisionFixtures(ctx, 'gd7');
    try {
        const badKey400 = { error: { code: 400, message: `API key not valid. Please pass a valid API key. (${GEMINI_KEY})`, status: 'INVALID_ARGUMENT' } };
        await assertGoogleFailsOverToOpenRouter(ctx, fixtures, () => JSONResponse(400, badKey400), 'Gemini Decisions API returned HTTP 400', 'GD7 gateway 400');

        const limit400 = { error: { code: 'invalid_request', message: '* CreateDecisionRequest.questions: must have between 1 and 1000 questions\n' } };
        await assertGoogleFailsOverToOpenRouter(ctx, fixtures, () => JSONResponse(400, limit400), 'must have between 1 and 1000 questions', 'GD7 service 400');

        const denied403 = { error: { code: 403, message: 'Permission denied on the service.', status: 'PERMISSION_DENIED' } };
        await assertGoogleFailsOverToOpenRouter(ctx, fixtures, () => JSONResponse(403, denied403), 'Permission denied on the service.', 'GD7 403');
    } finally {
        await fixtures.Cleanup();
    }
}

// ─── GD8: Default Decision Candidate Order & Failover ────────────────────────────────────────────

const GEMINI_CANDIDATES_IN_ORDER = [
    `${GEMINI_MODEL} / ${GOOGLE_VENDOR} / ${GEMINI_DRIVER}`,
    `${GEMINI_MODEL} / ${OPENROUTER_VENDOR} / ${OPENROUTER_DRIVER}`,
];

function assertGeminiFallbackPlacement(candidates: ModelVendorCandidate[], label: string): void {
    AssertEqual(candidates[0] ? DescribeCandidate(candidates[0]) : 'none', 'Jev / OpenRouter / OpenRouterDecision', `${label}: first candidate`);
    AssertEqual(candidates[1] ? DescribeCandidate(candidates[1]) : 'none', 'LLM Decision / MemberJunction / LLMDecision', `${label}: second candidate`);
    const geminiOnes = candidates.filter(c => c.model.Name === GEMINI_MODEL);
    AssertEqual(geminiOnes.map(DescribeCandidate).join(', '), GEMINI_CANDIDATES_IN_ORDER.join(', '), `${label}: Gemini Decision 1 candidates`);
    for (const candidate of geminiOnes) {
        AssertEqual(candidate.source, 'power-match-fallback', `${label}: ${DescribeCandidate(candidate)} source`);
    }
    const googleIdx = candidates.findIndex(c => c.model.Name === GEMINI_MODEL && c.vendorName === GOOGLE_VENDOR);
    const openRouterIdx = candidates.findIndex(c => c.model.Name === GEMINI_MODEL && c.vendorName === OPENROUTER_VENDOR);
    const mercuryIdx = candidates.findIndex(c => c.model.Name === 'Mercury Decide');
    Assert(googleIdx > 2, `${label}: expected closer fallbacks ahead of Gemini Decision 1 (got index ${googleIdx})`);
    AssertEqual(openRouterIdx, googleIdx + 1, `${label}: OpenRouter route must immediately follow Google route`);
    Assert(mercuryIdx > openRouterIdx, `${label}: Mercury Decide (PowerRank 44) must sort after Gemini Decision 1 (PowerRank 61)`);
}

async function assertUnboundDefaultDecision(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
): Promise<{ Candidates: ModelVendorCandidate[]; Selected: string }> {
    const label = 'GD8 unbound';
    const prompt = RequireDefaultDecisionPrompt();
    const params = geminiParams(ctx);
    const candidates = probe.Candidates(prompt, params);
    assertGeminiFallbackPlacement(candidates, label);
    const expected = ExpectedSelection(probe, candidates, prompt, params);
    Assert(expected === 'Jev' || expected === 'LLM Decision', `${label}: expected Jev or LLM Decision selected, got ${expected}`);
    await AssertSelects(probe, params, fixtures, candidates, expected, label);
    return { Candidates: candidates, Selected: expected };
}

async function assertBoundDefaultDecision(
    ctx: IntegrationCheckContext,
    probe: DecisionRunnerProbe,
    fixtures: DecisionFixtures,
    pristine: { Candidates: ModelVendorCandidate[]; Selected: string },
): Promise<void> {
    const label = 'GD8 bound';
    const googleCred = await fixtures.CreateCredential('API Key', 'GD8 Google', { apiKey: 'AIza-it-gd8-google' });
    await fixtures.BindToModelVendor(googleCred.ID, RequireInferenceRowID(GEMINI_MODEL, GOOGLE_VENDOR));
    const orCred = await fixtures.CreateCredential('API Key', 'GD8 OpenRouter', { apiKey: 'sk-or-it-gd8-openrouter' });
    await fixtures.BindToModelVendor(orCred.ID, RequireInferenceRowID(GEMINI_MODEL, OPENROUTER_VENDOR));
    const prompt = RequireDefaultDecisionPrompt();
    const params = geminiParams(ctx);
    const bound = probe.Candidates(prompt, params);
    AssertEqual(bound.map(DescribeCandidate).join(', '), pristine.Candidates.map(DescribeCandidate).join(', '), `${label}: candidate order`);
    for (const candidate of bound.filter(c => c.model.Name === GEMINI_MODEL)) {
        Assert(probe.HasCredentials(candidate, prompt, params), `${label}: ${DescribeCandidate(candidate)} lacks credentials after binding`);
    }
    await AssertSelects(probe, params, fixtures, bound, pristine.Selected, label);
}

async function checkDefaultDecisionOrder(ctx: IntegrationCheckContext): Promise<void> {
    await AIEngine.Instance.Config(false, ctx.User);
    const probe = new DecisionRunnerProbe();
    const fixtures = new DecisionFixtures(ctx, 'gd8');
    const decider = new ScriptedDecision();
    decider.Arm();
    const restore = RegisterScriptedDecision(decider, SCRIPTED_DECISION_DRIVER_CLASSES);
    try {
        const pristine = await assertUnboundDefaultDecision(ctx, probe, fixtures);
        await assertBoundDefaultDecision(ctx, probe, fixtures, pristine);
        const target = { ModelName: GEMINI_MODEL, VendorName: GOOGLE_VENDOR, DriverClass: GEMINI_DRIVER };
        await AssertDefaultDecisionFailsOverTo(probe, geminiParams(ctx), fixtures, decider, target, 'GD8 failover');
    } finally {
        decider.Disarm();
        restore();
        await fixtures.Cleanup();
    }
}

// ─── Checks Registration ─────────────────────────────────────────────────────────────────────────

export const GeminiDecisionsChecks: NamedCheck[] = [
    {
        Id: 'gemini-decisions.GD1',
        Name: 'GD1: Gemini Decision 1 is an Active Decision model at PowerRank 61 with limits 1000/255/255/262144, Google GeminiDecision preferred over pinned OpenRouter google/gemini-decision-1-20261111, and $0.10/1M cost rows',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            await AIEngine.Instance.Config(false, ctx.User);
            checkCatalog();
        },
    },
    {
        Id: 'gemini-decisions.GD2',
        Name: "GD2: ClassFactory.CreateInstance(BaseDecision, 'GeminiDecision', …) builds the shipped GeminiDecision, trims credential endpoints, and defaults to v1beta/decisions",
        Fn: async (): Promise<void> => {
            checkClassFactory();
        },
    },
    {
        Id: 'gemini-decisions.GD3',
        Name: "GD3: AIDecisionRunner on Google sends x-goog-api-key and {model: 'gemini-decision-1', input, questions}, maps Google's omitted-model wire response, and prices the prompt run at $0.10/1M",
        Fn: checkGeminiRunnerCall,
    },
    {
        Id: 'gemini-decisions.GD4',
        Name: "GD4: AIDecisionRunner on OpenRouter sends Bearer token and {model: 'google/gemini-decision-1-20261111', state, questions}, records ResolvedModel, and prices the prompt run at $0.10/1M",
        Fn: checkOpenRouterRunnerCall,
    },
    {
        Id: 'gemini-decisions.GD5',
        Name: "GD5: real encrypted API Key credentials bound to Gemini Decision 1's Google and OpenRouter Inference Provider rows send raw tokens, never credential JSON",
        Fn: checkBoundCredentials,
    },
    {
        Id: 'gemini-decisions.GD6',
        Name: "GD6: Google's prompt_feedback.block_reason fails as a retriable ModelError naming the block reason and fails over to Gemini Decision 1 on OpenRouter",
        Fn: checkBlockedInputFailover,
    },
    {
        Id: 'gemini-decisions.GD7',
        Name: "GD7: Google's gateway 400 INVALID_ARGUMENT (with key redaction), service 400 invalid_request, and 403 PERMISSION_DENIED all fail over cleanly as ModelError to OpenRouter",
        Fn: checkHttpErrorFailover,
    },
    {
        Id: 'gemini-decisions.GD8',
        Name: 'GD8: Default Decision keeps Jev and LLM Decision first, places Gemini Decision 1 (Google then OpenRouter) at its PowerRank distance, preserves selection when bound, and fails over to Google when ahead drivers fail',
        Fn: checkDefaultDecisionOrder,
    },
];

for (const check of GeminiDecisionsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('gemini-decisions', {
    Setup: async (): Promise<void> => {
        ResetGuards(ALL_GUARDS);
        bundleRestores.push(RegisterDecisionStandIn(GEMINI_DRIVER, GuardedGeminiDecision, GeminiDecision));
        bundleRestores.push(RegisterDecisionStandIn(OPENROUTER_DRIVER, GuardedOpenRouterDecision, OpenRouterDecision));
    },
    Teardown: async (): Promise<void> => {
        await DecisionFixtures.CleanupAll();
        ResetGuards(ALL_GUARDS);
        for (const restore of bundleRestores.splice(0).reverse()) {
            restore();
        }
    },
});
