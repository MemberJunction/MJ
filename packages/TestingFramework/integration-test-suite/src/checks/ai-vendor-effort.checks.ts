/**
 * ai-vendor-effort.checks.ts — the 'ai-vendor-effort' bundle (AVE1–AVE2): does an AI prompt's
 * effort level reach each vendor's API, and does the vendor accept it?
 *
 * LIVE-MODEL tier (real model calls cost tokens). Each call runs the seeded 'IT: Effort Probe'
 * prompt through the full AIPromptRunner stack with the model and vendor named by the override, and
 * records the HTTP request bodies the driver's SDK sends through `fetch` in this process, so the
 * assertions are on what went to the vendor, not on what the driver meant to send.
 *
 *   AVE1: Gemini and Vertex (strict). For each thinking control (level, budget) the cheapest model,
 *         plus the newest level model: effort 90 sends `thinkingConfig` and succeeds; a `minimal`
 *         effort never fails the request (a model that rejects it is retried with `LOW`);
 *         and completion tokens include the thinking tokens Google reports.
 *   AVE2: every other driver with an effort-capable model (survey). One model per driver at effort
 *         90 must succeed, and must carry an effort field in its request unless the driver is a
 *         known gap. Each finding is logged, gaps included, so the log is the cross-vendor report.
 *
 * A call that fails because the vendor no longer serves the model (404) or the account has no
 * balance or quota is logged and not counted: it says nothing about the driver.
 *
 * CREDENTIALS: a model is called only when the runner itself would find a credential for it —
 * an MJ credential binding, the vendor's default credential, or `AI_VENDOR_API_KEY__<DRIVER>` in the
 * environment. Anything else is logged as skipped; a check with nothing callable skips loudly.
 * `EFFORT_IT_MODELS` (comma-separated model names) narrows either check to the listed models.
 *
 * Requests made by SDKs that do not use the global `fetch` (Bedrock, Azure, Groq, Cerebras,
 * LMStudio) cannot be recorded; those findings say so instead of guessing. The AI Prompt Runs the
 * checks create are their own output and are kept, as the prompt-runner bundle does.
 */
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseLLM } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import type { AIPromptRunResult, MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const PROBE_PROMPT_NAME = 'IT: Effort Probe';
const GOOGLE_DRIVERS = new Set(['GeminiLLM', 'VertexLLM']);

/**
 * Drivers that do not map `effortLevel` into their request today (#5530). AVE2 logs them as gaps
 * instead of failing; remove a driver from this list when it starts sending effort.
 */
const KNOWN_EFFORT_GAPS: Record<string, string> = {
    AzureLLM: 'effort is ignored',
    BedrockLLM: 'effort is ignored',
    FireworksLLM: 'effort is ignored',
    MistralLLM: 'effort is ignored',
    OllamaLLM: 'effort is ignored',
    LMStudioLLM: 'effort is ignored',
    GroqLLM: 'effort is mapped for GPT-OSS and Qwen models only',
    CerebrasLLM: 'effort is mapped for GPT-OSS models only',
};

/**
 * Models whose vendor rejects the effort setting the driver sends, so a run with an effort level
 * fails (#5530). Keyed by API name; AVE2 logs a match as a gap instead of failing. Remove an entry
 * when the driver or the model's metadata is fixed.
 */
const KNOWN_EFFORT_REJECTIONS: Record<string, string> = {
    'grok-build-0.1': 'xAI rejects reasoning_effort ("does not support parameter reasoningEffort") although the model is flagged SupportsEffortLevel',
};

/** Request-body keys that carry an effort or thinking setting, across vendors. */
const EFFORT_KEYS = ['reasoning_effort', 'reasoningEffort', 'thinkingConfig', 'thinking', 'output_config', 'reasoning', 'think'];

/** One model a check calls, on one vendor. */
interface EffortTarget {
    Model: MJAIModelEntityExtended;
    ModelVendor: MJAIModelVendorEntity;
    Driver: string;
}

/** An HTTP request the SDK sent through `fetch` during a call. */
interface RecordedRequest {
    Url: string;
    Body: Record<string, unknown> | null;
}

/** The outcome of one call: the run result and the requests it sent. */
interface EffortCall {
    Result: AIPromptRunResult<string>;
    Requests: RecordedRequest[];
}

/** AIPromptRunner with its credential check exposed, so a check calls only models it can reach. */
class CredentialProbeRunner extends AIPromptRunner {
    public HasCredentialFor(prompt: MJAIPromptEntityExtended, target: EffortTarget): boolean {
        return this.HasCredentialsAvailable(target.Driver, prompt.ID, target.Model.ID, target.ModelVendor.VendorID);
    }
}

// ─── Targets ───────────────────────────────────────────────────────────────────

/** Every Active inference-provider row for an Active LLM that supports effort and has a driver loaded here. */
function effortCapableTargets(): EffortTarget[] {
    const engine = AIEngine.Instance;
    const targets: EffortTarget[] = [];
    for (const mv of engine.ModelVendors) {
        const model = engine.Models.find(m => UUIDsEqual(m.ID, mv.ModelID));
        const driver = mv.DriverClass || model?.DriverClass;
        if (!model || !driver || !model.IsActive || mv.Status !== 'Active' || !engine.IsInferenceProvider(mv)) continue;
        if (model.AIModelType?.trim().toLowerCase() !== 'llm') continue;
        if (!(mv.SupportsEffortLevel ?? model.SupportsEffortLevel ?? false)) continue;
        if (!MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, driver)) continue;
        targets.push({ Model: model, ModelVendor: mv, Driver: driver });
    }
    return narrowToRequestedModels(targets);
}

function narrowToRequestedModels(targets: EffortTarget[]): EffortTarget[] {
    const names = process.env.EFFORT_IT_MODELS?.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
    return names && names.length > 0 ? targets.filter(t => names.includes(t.Model.Name.toLowerCase())) : targets;
}

/** The targets the runner has a credential for; the rest are logged as skipped. */
function callableTargets(prompt: MJAIPromptEntityExtended, targets: EffortTarget[]): EffortTarget[] {
    const runner = new CredentialProbeRunner();
    const callable = targets.filter(t => runner.HasCredentialFor(prompt, t));
    for (const t of targets.filter(t => !callable.includes(t))) {
        console.log(`      ○ skipped ${label(t)}: no credential (MJ credential binding, vendor default credential, or AI_VENDOR_API_KEY__${t.Driver.toUpperCase()})`);
    }
    return callable;
}

/** The lowest-PowerRank target in each group, a cheap representative. */
function cheapestPerGroup(targets: EffortTarget[], groupOf: (t: EffortTarget) => string): EffortTarget[] {
    const best = new Map<string, EffortTarget>();
    for (const t of targets) {
        const key = groupOf(t);
        const current = best.get(key);
        if (!current || (t.Model.PowerRank ?? 0) < (current.Model.PowerRank ?? 0)) best.set(key, t);
    }
    return [...best.values()];
}

function label(t: EffortTarget): string {
    return `${t.Model.Name} on ${t.ModelVendor.Vendor} (${t.Driver})`;
}

// ─── Calls ─────────────────────────────────────────────────────────────────────

/** Runs `work` with `fetch` wrapped to record each request's URL and JSON body; always restores it. */
async function withRecordedRequests<T>(work: () => Promise<T>): Promise<{ Value: T; Requests: RecordedRequest[] }> {
    const original = globalThis.fetch;
    const requests: RecordedRequest[] = [];
    globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        requests.push({ Url: url, Body: parseJsonBody(init?.body) });
        return original(input, init);
    };
    try {
        return { Value: await work(), Requests: requests };
    } finally {
        globalThis.fetch = original;
    }
}

/** The request body as a JSON object, or null when it is not a JSON string. */
function parseJsonBody(body: NonNullable<Parameters<typeof fetch>[1]>['body'] | undefined): Record<string, unknown> | null {
    if (typeof body !== 'string') return null;
    try {
        const parsed: Record<string, unknown> = JSON.parse(body);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

async function callWithEffort(prompt: MJAIPromptEntityExtended, target: EffortTarget, effortLevel: string, ctx: IntegrationCheckContext): Promise<EffortCall> {
    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = ctx.User;
    params.override = { modelId: target.Model.ID, vendorId: target.ModelVendor.VendorID };
    params.effortLevel = effortLevel;
    const runner = new AIPromptRunner();
    const { Value, Requests } = await withRecordedRequests(() => runner.ExecutePrompt<string>(params));
    await runner.WaitForPendingPromptRunSaves();
    return { Result: Value, Requests: Requests.filter(r => r.Body !== null) };
}

// ─── Reading a call ────────────────────────────────────────────────────────────

/** The dotted path of the first effort or thinking setting in a request body, or null. */
function findEffortField(value: unknown, path = ''): string | null {
    if (!value || typeof value !== 'object') return null;
    for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        if (EFFORT_KEYS.includes(key) && child != null) return childPath;
        const nested = Array.isArray(child) ? null : findEffortField(child, childPath);
        if (nested) return nested;
    }
    return null;
}

function effortFieldsSent(call: EffortCall): string[] {
    return call.Requests.map(r => findEffortField(r.Body)).filter((p): p is string => p !== null);
}

/** Whether the run was recorded against the vendor the override named. */
function ranOnTargetVendor(call: EffortCall, target: EffortTarget): boolean {
    return UUIDsEqual(call.Result.promptRun?.VendorID ?? '', target.ModelVendor.VendorID);
}

/**
 * Why a failed call says nothing about the driver, or null when it does: a model the vendor no longer
 * serves (a metadata problem), or an account without balance or quota (a billing problem). Either is
 * logged and not counted.
 */
function unavailableReason(call: EffortCall): string | null {
    if (call.Result.success) return null;
    const message = call.Result.errorMessage ?? '';
    if (/\b404\b|not found|no longer available|does not exist/i.test(message)) return 'model unavailable at the vendor';
    if (call.Result.chatResult?.errorInfo?.errorType === 'NoCredit' || /insufficient balance|insufficient_quota|quota exceeded|recharge/i.test(message)) {
        return 'account has no balance or quota';
    }
    return null;
}

/** Logs and returns true when the call failed for a reason that is not the driver's. */
function skipIfUnavailable(target: EffortTarget, call: EffortCall): boolean {
    const reason = unavailableReason(call);
    if (reason) console.log(`      ○ ${label(target)}: ${reason} (${call.Result.errorMessage}); not counted`);
    return reason !== null;
}

/** Google's usage block from the raw response, when the driver kept one. */
function googleUsage(call: EffortCall): { candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined {
    const raw = call.Result.chatResult?.modelSpecificResponseDetails?.raw as { usageMetadata?: { candidatesTokenCount?: number; thoughtsTokenCount?: number } } | undefined;
    return raw?.usageMetadata;
}

function failIfAny(check: string, failures: string[], called: number): void {
    Assert(failures.length === 0, `${check}: ${failures.length} problem(s) across ${called} model(s):\n    ${failures.join('\n    ')}`);
}

// ─── AVE1: Gemini and Vertex ──────────────────────────────────────────────────

/** The cheapest model per Google driver and thinking control, plus each driver's newest level model. */
function googleTargets(callable: EffortTarget[]): EffortTarget[] {
    // Only Gemini ids: Gemma models served by these drivers take no thinking setting.
    const google = callable.filter(t => GOOGLE_DRIVERS.has(t.Driver) && /gemini/i.test(t.ModelVendor.APIName || t.Model.Name));
    const control = (t: EffortTarget): string => /gemini-2\.5/i.test(t.ModelVendor.APIName || t.Model.Name) ? 'budget' : 'level';
    const picked = cheapestPerGroup(google, t => `${t.Driver}:${control(t)}`);
    for (const driver of GOOGLE_DRIVERS) {
        const newest = google.filter(t => t.Driver === driver && control(t) === 'level')
            .sort((a, b) => (b.ModelVendor.APIName || '').localeCompare(a.ModelVendor.APIName || '', undefined, { numeric: true }))[0];
        if (newest && !picked.includes(newest)) picked.push(newest);
    }
    return picked;
}

async function checkGoogleTarget(prompt: MJAIPromptEntityExtended, target: EffortTarget, ctx: IntegrationCheckContext): Promise<string[]> {
    const high = await callWithEffort(prompt, target, '90', ctx);
    if (skipIfUnavailable(target, high)) return [];
    const problems = googleHighEffortProblems(target, high);
    const minimal = await callWithEffort(prompt, target, 'minimal', ctx);
    if (!minimal.Result.success) problems.push(`${label(target)}: effort 'minimal' failed the request — ${minimal.Result.errorMessage}`);
    const retriedWith = (minimal.Requests[1]?.Body?.generationConfig as { thinkingConfig?: { thinkingLevel?: string } } | undefined)?.thinkingConfig?.thinkingLevel ?? 'no thinkingConfig';
    const retried = minimal.Requests.length > 1 ? `rejected, retried with ${retriedWith}` : 'accepted';
    console.log(`      ● ${label(target)}: effort 90 sent ${effortFieldsSent(high).join(', ') || 'nothing'}; thoughts=${googleUsage(high)?.thoughtsTokenCount ?? 0}; minimal ${minimal.Result.success ? retried : 'FAILED'}`);
    return problems;
}

function googleHighEffortProblems(target: EffortTarget, call: EffortCall): string[] {
    const problems: string[] = [];
    if (!call.Result.success) return [`${label(target)}: effort 90 failed — ${call.Result.errorMessage}`];
    if (!ranOnTargetVendor(call, target)) problems.push(`${label(target)}: the run was recorded against another vendor`);
    const first = call.Requests[0]?.Body;
    if (!findEffortField(first)?.endsWith('thinkingConfig')) problems.push(`${label(target)}: no thinkingConfig in the request (sent ${JSON.stringify(first?.generationConfig ?? null)})`);
    const usage = googleUsage(call);
    const expected = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    if (usage && call.Result.completionTokens !== expected) {
        problems.push(`${label(target)}: completion tokens ${call.Result.completionTokens} leave out thinking (candidates ${usage.candidatesTokenCount} + thoughts ${usage.thoughtsTokenCount})`);
    }
    return problems;
}

// ─── AVE2: every other driver ─────────────────────────────────────────────────

async function surveyTarget(prompt: MJAIPromptEntityExtended, target: EffortTarget, ctx: IntegrationCheckContext): Promise<string[]> {
    const call = await callWithEffort(prompt, target, '90', ctx);
    if (skipIfUnavailable(target, call)) return [];
    const rejection = KNOWN_EFFORT_REJECTIONS[(target.ModelVendor.APIName || '').toLowerCase()];
    const gap = KNOWN_EFFORT_GAPS[target.Driver] ?? rejection;
    const sent = effortFieldsSent(call);
    const observed = call.Requests.length > 0;
    const thinking = call.Result.chatResult?.data?.choices?.[0]?.message?.thinking ? 'thinking returned' : 'no thinking returned';
    const effort = !observed ? 'request not observable (SDK does not use fetch)' : sent.length > 0 ? `sent ${sent.join(', ')}` : 'NO effort field sent';
    console.log(`      ● ${label(target)}: ${call.Result.success ? 'ok' : 'FAILED'}; ${effort}; ${thinking}${gap ? `; known gap: ${gap}` : ''}`);
    if (!call.Result.success && !rejection) return [`${label(target)}: effort 90 failed — ${call.Result.errorMessage}`];
    if (observed && sent.length === 0 && !gap) return [`${label(target)}: effort 90 sent no effort field, and ${target.Driver} is not a known gap`];
    return [];
}

// ─── Checks ────────────────────────────────────────────────────────────────────

function requireProbePrompt(): MJAIPromptEntityExtended {
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === PROBE_PROMPT_NAME);
    Assert(!!prompt, `The '${PROBE_PROMPT_NAME}' prompt is not seeded: run mj sync push --dir=metadata-optional/integration-test`);
    return prompt!;
}

async function runTargets(check: string, targets: EffortTarget[], run: (t: EffortTarget) => Promise<string[]>): Promise<void> {
    if (targets.length === 0) {
        console.warn(`  ⚠ ${check} SKIPPED — no effort-capable model in scope has a credential in this environment.`);
        return;
    }
    const failures: string[] = [];
    for (const target of targets) {
        failures.push(...await run(target));
    }
    failIfAny(check, failures, targets.length);
}

export const AiVendorEffortChecks: NamedCheck[] = [
    {
        Id: 'ai-vendor-effort.AVE1',
        Name: 'AVE1: Gemini and Vertex send thinkingConfig for an effort level, never fail on an unsupported level, and count thinking tokens',
        Fn: async (ctx): Promise<void> => {
            const prompt = requireProbePrompt();
            const targets = googleTargets(callableTargets(prompt, effortCapableTargets().filter(t => GOOGLE_DRIVERS.has(t.Driver))));
            await runTargets('AVE1', targets, t => checkGoogleTarget(prompt, t, ctx));
        }
    },
    {
        Id: 'ai-vendor-effort.AVE2',
        Name: 'AVE2: every other effort-capable driver succeeds at effort 90 and sends an effort field, unless it is a known gap',
        Fn: async (ctx): Promise<void> => {
            const prompt = requireProbePrompt();
            const others = callableTargets(prompt, effortCapableTargets().filter(t => !GOOGLE_DRIVERS.has(t.Driver)));
            const targets = process.env.EFFORT_IT_MODELS ? others : cheapestPerGroup(others, t => t.Driver);
            await runTargets('AVE2', targets, t => surveyTarget(prompt, t, ctx));
        }
    }
];

for (const check of AiVendorEffortChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('ai-vendor-effort', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngine.Instance.Config(false, ctx.User);
    },
    Teardown: async () => {
        // No shared fixture: the AI Prompt Runs the checks create are their own output.
    }
});
