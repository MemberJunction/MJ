/**
 * native-tool-loop-live.checks.ts — the 'native-tool-loop-live' bundle (NTLL1–NTLL3): the native tool
 * loop against real providers, through AgentRunner and the prompt runner exactly as in production.
 *
 * LIVE-MODEL tier (real model calls cost tokens). Every target model runs on a fixture AI Model Vendor
 * row served by {@link ITRecordingLLM}, which forwards each request to the model's real driver and
 * records the request and the reply — so a check sees exactly what the provider received and
 * whether it accepted it, independent of what the agent then did.
 *
 *   NTLL1 a Retry on a native tool-call turn: the recording driver stands in for the model on the
 *         first turn with a call to a tool the request never declared. The loop must answer that
 *         call in the protocol, and every later request — now carrying that call — must be accepted
 *         by the provider. On the old history order Anthropic and OpenAI rejected 100% of these.
 *   NTLL2 agent-local tools in native-only mode with a text terminal: the model writes a document
 *         with `write_doc`, corrects it with `edit_doc`, and answers in plain text. The payload is the
 *         corrected document, each call a Tool step, and no request is rejected.
 *   NTLL3 thinking across tool turns on Claude: with an effort level set, every request that follows
 *         a tool turn which thought replays that turn's signed reasoning, the provider accepts every
 *         one, and a budget-form model (Claude 4.5) thinks again on a later turn — the
 *         interleaved-thinking beta at work.
 *
 * TARGETS: `NATIVE_LOOP_IT_MODELS` ("Model Name@DriverClass", comma-separated) or the defaults below.
 * A target runs only when its real driver has an API key in this environment; others are logged as
 * skipped. A run the vendor cannot serve (retired model, no balance) is logged and not counted. A
 * check fails, saying why, when a provider it covers had no model exercised at all.
 *
 * Self-cleaning: fixtures are named 'IT: NTLL …'; Teardown purges every run and deletes them.
 */
import { IndexByUUID, MJGlobal } from '@memberjunction/global';
import { BaseLLM, ChatMessageRole, GetAIAPIKey } from '@memberjunction/ai';
import { AnthropicLLM, UsesAdaptiveThinking } from '@memberjunction/ai-anthropic';
import type { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { AGENT_LIVE_SETTLE_MS, Sleep } from './agent-live-shared';
import {
    AdjacencyViolations, CreateLoopAgent, CreateModelVendor, CreateNativePrompt, CreateVendor, NewFixture, RECORDING_DRIVER,
    RecordingState, RemoveStaleFixtures, ResetRecording, ResultBlocksOf, StepsOf, TeardownFixture, UNDECLARED_TOOL,
    type NativeLoopFixture
} from './native-tool-loop-shared';
// Registers the doc agent class (`ITNtlDocAgent`) the NTLL2/NTLL3 agent runs as.
import './native-tool-loop.checks';

const PREFIX = 'IT: NTLL ';
const CALC_AGENT = `${PREFIX}Calc Agent`;
const DOC_AGENT = `${PREFIX}Doc Agent`;
const DOC_AGENT_DRIVER = 'ITNtlDocAgent';

/** One model per driver and thinking form: Claude 4.5 thinks in the budget form, 4.6 adaptively. */
const DEFAULT_TARGETS = [
    'Claude Haiku 4.5@AnthropicLLM',
    'Claude Sonnet 4.6@AnthropicLLM',
    'GPT 5.4-mini@OpenAILLM',
    'Gemini 3.8 Flash@GeminiLLM'
];

/** Attempts per target before a model that does not follow the task counts as a problem. */
const COMPLIANCE_ATTEMPTS = 2;

const CALC_INSTRUCTIONS = `# Calculator

You answer arithmetic questions. Use the Calculate Expression action to compute the answer, then reply in one plain-text sentence with the result.

Rules:
- Never ask the user a question.
- Do not write to the payload.`;

const DOC_INSTRUCTIONS = `# Editor

You keep one document in your payload, and you change it only through your tools:
- write_doc writes the whole document.
- edit_doc replaces one exact passage of it.

When the user gives you a draft: write it with write_doc EXACTLY as given, then fix each misspelling with its own edit_doc call. When the document is correct, reply in one plain-text sentence. Never ask the user a question.`;

const DRAFT = 'The quarterly reprot shows revenue grew in every regoin. Custmer churn fell to four percent.';
const DOC_REQUEST = `Here is the draft:\n\n${DRAFT}\n\nWrite it, then fix the three misspellings.`;
const CORRECTED = 'The quarterly report shows revenue grew in every region. Customer churn fell to four percent.';

// ─── Targets ───────────────────────────────────────────────────────────────────

interface LiveTarget {
    Spec: string;
    Model: MJAIModelEntityExtended;
    RealRow: MJAIModelVendorEntity;
    Driver: string;
}

const label = (t: LiveTarget): string => `${t.Model.Name} (${t.Driver})`;
const supportsNative = (modelID: string, rowID: string): boolean =>
    AIEngine.Instance.GetEffectiveModelConfiguration(modelID, rowID)?.LLM?.SupportsNativeToolCalling === true;

/** Resolves "Model Name@DriverClass" to an active native-capable inference row, or null. */
function resolveTarget(spec: string): LiveTarget | null {
    const [name, driver] = spec.split('@').map((s) => s.trim());
    const engine = AIEngine.Instance;
    const rowsByModel = IndexByUUID(engine.ModelVendors.filter((mv) => mv.DriverClass === driver && mv.Status === 'Active' && engine.IsInferenceProvider(mv)), (mv) => mv.ModelID);
    for (const model of engine.Models.filter((m) => m.Name === name && m.IsActive)) {
        const row = engine.ModelVendors.find((mv) => mv.ModelID === model.ID && mv.DriverClass === driver && mv.Status === 'Active'
            && engine.IsInferenceProvider(mv) && supportsNative(model.ID, mv.ID)) ?? rowsByModel.Get(model.ID);
        if (row && supportsNative(model.ID, row.ID)) return { Spec: spec, Model: model, RealRow: row, Driver: driver };
    }
    return null;
}

/** A requested model that will not run, and why. */
interface SkippedTarget { Spec: string; Driver: string; Reason: string }

/** The requested targets that resolve and have a key for their real driver, and the rest with their reasons. */
function callableTargets(): { Callable: LiveTarget[]; Skipped: SkippedTarget[] } {
    const specs = process.env.NATIVE_LOOP_IT_MODELS?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_TARGETS;
    const callable: LiveTarget[] = [];
    const skipped: SkippedTarget[] = [];
    const skip = (spec: string, driver: string, reason: string) => {
        console.log(`      ○ skipped ${spec}: ${reason}`);
        skipped.push({ Spec: spec, Driver: driver, Reason: reason });
    };
    for (const spec of specs) {
        const driver = spec.split('@')[1]?.trim() ?? '';
        const target = resolveTarget(spec);
        if (!target) { skip(spec, driver, 'no active native-capable model row on that driver'); continue; }
        if (!MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, target.Driver)) { skip(spec, driver, 'driver not registered'); continue; }
        if (!GetAIAPIKey(target.Driver)) { skip(spec, driver, `no API key for ${target.Driver}`); continue; }
        callable.push(target);
    }
    return { Callable: callable, Skipped: skipped };
}

// ─── Fixture ───────────────────────────────────────────────────────────────────

interface NtllFixture extends NativeLoopFixture {
    VendorID: string;
    Targets: LiveTarget[];
    Skipped: SkippedTarget[];
}

let fixture: NtllFixture | undefined;

function fx(): NtllFixture {
    if (!fixture) throw new Error('native-tool-loop-live fixture not initialized — the bundle lifecycle Setup must run first.');
    return fixture;
}

async function setup(ctx: IntegrationCheckContext): Promise<void> {
    await RemoveStaleFixtures(ctx, PREFIX);
    await AIEngine.Instance.Config(false, ctx.User);
    const { Callable, Skipped } = callableTargets();
    const f: NtllFixture = { ...NewFixture(), VendorID: '', Targets: Callable, Skipped };
    fixture = f;
    // The runner checks for a key under the serving driver's name; the recording driver uses the real one's.
    process.env[`AI_VENDOR_API_KEY__${RECORDING_DRIVER.toUpperCase()}`] ??= 'recording';
    f.VendorID = await CreateVendor(ctx, f, `${PREFIX}Recording Vendor`);
    RecordingState.RealDriverByAPIName.clear();
    for (const t of f.Targets) {
        const api = t.RealRow.APIName ?? '';
        RecordingState.RealDriverByAPIName.set(api, t.Driver);
        await CreateModelVendor(ctx, f, {
            ModelID: t.Model.ID, VendorID: f.VendorID, DriverClass: RECORDING_DRIVER, APIName: api,
            ModelConfiguration: t.RealRow.ModelConfiguration, SupportsEffortLevel: t.RealRow.SupportsEffortLevel,
            MaxOutputTokens: t.RealRow.MaxOutputTokens, MaxInputTokens: t.RealRow.MaxInputTokens
        });
    }
    const calcPrompt = await CreateNativePrompt(ctx, f, `${CALC_AGENT} - Prompt`, CALC_INSTRUCTIONS);
    const docPrompt = await CreateNativePrompt(ctx, f, `${DOC_AGENT} - Prompt`, DOC_INSTRUCTIONS);
    await CreateLoopAgent(ctx, f, { Name: CALC_AGENT, PromptID: calcPrompt, ActionNames: ['Calculate Expression'], MaxIterationsPerRun: 6 });
    await CreateLoopAgent(ctx, f, {
        Name: DOC_AGENT, PromptID: docPrompt, DriverClass: DOC_AGENT_DRIVER, MaxIterationsPerRun: 10,
        TypeConfiguration: { NativeControl: { Terminal: 'text', PayloadChangeTool: false, NativeOnly: true } }
    });
    await TemplateEngineServer.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngine.Instance.Config(true, ctx.User);
}

async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    await TeardownFixture(ctx, fixture);
    await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    fixture = undefined;
}

// ─── Running and judging ───────────────────────────────────────────────────────

interface LiveOutcome {
    RunID: string;
    Status: string;
    ErrorMessage: string | null;
    Payload: Record<string, unknown>;
}

async function runAgent(ctx: IntegrationCheckContext, agentName: string, target: LiveTarget, request: string, opts: { inject?: boolean; effortLevel?: number } = {}): Promise<LiveOutcome> {
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === agentName);
    Assert(!!agent, `fixture agent '${agentName}' is loaded in AIEngine`);
    ResetRecording(opts.inject === true);
    const result = await new AgentRunner().RunAgent({
        agent: agent!,
        conversationMessages: [{ role: ChatMessageRole.user, content: request }],
        contextUser: ctx.User,
        override: { modelId: target.Model.ID, vendorId: fx().VendorID },
        ...(opts.effortLevel ? { effortLevel: opts.effortLevel } : {})
    });
    const runID = result.agentRun?.ID ?? '';
    if (runID) fx().RunIds.push(runID);
    await Sleep(AGENT_LIVE_SETTLE_MS);
    return { RunID: runID, Status: result.agentRun?.Status ?? 'Unknown', ErrorMessage: result.agentRun?.ErrorMessage ?? null, Payload: (result.payload ?? {}) as Record<string, unknown> };
}

/** Why a failed run says nothing about the framework (retired model, no balance), or null. */
function unavailableReason(o: LiveOutcome): string | null {
    const errors = [o.ErrorMessage ?? '', ...RecordingState.Replies.filter((r) => !r.Success).map((r) => r.ErrorMessage)].join(' ');
    if (/model\b[^.\n]{0,80}\b(not found|does not exist|no longer available|not deployed)|\b404\b/i.test(errors)) return 'model unavailable at the vendor';
    if (/insufficient balance|insufficient_quota|quota exceeded|credit balance is too low|recharge/i.test(errors)) return 'account has no balance or quota';
    return null;
}

/** Every request the provider rejected, and every history that breaks adjacency. */
function protocolProblems(who: string): string[] {
    const problems: string[] = [];
    RecordingState.Replies.forEach((r, i) => { if (!r.Success) problems.push(`${who}: provider rejected request ${i + 1}: ${r.ErrorMessage.slice(0, 300)}`); });
    RecordingState.Requests.forEach((req, i) => {
        for (const p of AdjacencyViolations(req.Messages)) problems.push(`${who}: request ${i + 1} history: ${p}`);
    });
    return problems;
}

/**
 * Runs a check on every target whose driver is in scope. A check passes only when every provider
 * it covers was exercised by at least one model: a provider with no key, no model row or an
 * unavailable vendor fails the check, with the reason, instead of passing with nothing run.
 * Narrow the providers with NATIVE_LOOP_IT_MODELS.
 */
async function runTargets(check: string, run: (t: LiveTarget) => Promise<AttemptResult>, inScope: (driver: string) => boolean = () => true): Promise<void> {
    const targets = fx().Targets.filter((t) => inScope(t.Driver));
    const failures: string[] = [];
    const exercised = new Set<string>();
    const notRun: string[] = fx().Skipped.filter((s) => inScope(s.Driver)).map((s) => `${s.Spec}: ${s.Reason}`);
    for (const target of targets) {
        const result = await run(target);
        failures.push(...result.Problems);
        if (result.Counted) exercised.add(target.Driver); else notRun.push(`${label(target)}: ${result.NotCountedReason ?? 'not counted'}`);
    }
    const drivers = [...new Set([...targets.map((t) => t.Driver), ...fx().Skipped.map((s) => s.Driver)].filter(inScope))];
    for (const driver of drivers.filter((d) => !exercised.has(d))) {
        failures.push(`no ${driver} model was exercised (${notRun.filter((n) => n.includes(driver)).join('; ') || 'none requested'})`);
    }
    Assert(drivers.length > 0, `${check}: no provider is in scope — check NATIVE_LOOP_IT_MODELS`);
    Assert(failures.length === 0, `${check}: ${failures.length} problem(s) across ${targets.length} model(s):\n    ${failures.join('\n    ')}`);
}

/** One target's outcome: its problems, and whether it ran far enough to count. */
interface AttemptResult { Problems: string[]; Counted: boolean; NotCountedReason?: string }

/**
 * Runs a scenario up to {@link COMPLIANCE_ATTEMPTS} times: provider rejections fail at once, a model
 * that does not follow the task is retried, and an unavailable vendor is logged and not counted.
 */
async function attempt(ctx: IntegrationCheckContext, check: string, target: LiveTarget, go: () => Promise<LiveOutcome>, judge: (o: LiveOutcome) => Promise<string[]>): Promise<AttemptResult> {
    const who = label(target);
    for (let n = 1; n <= COMPLIANCE_ATTEMPTS; n++) {
        const outcome = await go();
        const unavailable = unavailableReason(outcome);
        if (unavailable) { console.log(`      ○ ${who}: ${unavailable}; not counted`); return { Problems: [], Counted: false, NotCountedReason: unavailable }; }
        const protocol = protocolProblems(who);
        if (protocol.length > 0) return { Problems: protocol, Counted: true };
        const behaviour = await judge(outcome);
        console.log(`      ● ${check} ${who}: ${outcome.Status}; ${RecordingState.Requests.length} request(s); ${behaviour.length === 0 ? 'ok' : behaviour.join('; ')}`);
        if (behaviour.length === 0) return { Problems: [], Counted: true };
        if (n === COMPLIANCE_ATTEMPTS) return { Problems: behaviour.map((b) => `${who}: ${b}`), Counted: true };
        console.warn(`      ↻ ${who}: attempt ${n}/${COMPLIANCE_ATTEMPTS} did not follow the task; retrying`);
    }
    return { Problems: [], Counted: true };
}

/** What the Anthropic driver puts on the wire for a recorded request — its own formatter, no network. */
class AnthropicWire extends AnthropicLLM {
    public Format(messages: ChatMessage[]): Array<{ role: string; content: Array<{ type: string; text?: string }> }> {
        return this.formatMessagesWithCaching(messages.filter((m) => m.role !== ChatMessageRole.system), true, true);
    }
}

/**
 * Wire problems that make a tool loop look finished to Claude: an assistant "OK" filler right after
 * tool results, or a later turn that thought on a request whose history does not end in tool
 * results (a fresh turn, where the model thinks anyway — so thinking there proves nothing about
 * interleaving). A filler between two plain user messages opens no loop and is not counted.
 */
function anthropicLoopProblems(): string[] {
    const wire = new AnthropicWire('wire-only');
    const problems: string[] = [];
    RecordingState.Requests.forEach((req, i) => {
        const formatted = wire.Format(req.Messages);
        const closesLoop = formatted.some((m, j) => j > 0 && m.role === 'assistant' && m.content.length === 1 && m.content[0].text === 'OK'
            && formatted[j - 1].content.some((b) => b.type === 'tool_result'));
        if (closesLoop) {
            problems.push(`request ${i + 1} puts an assistant "OK" filler after tool results`);
        }
        const last = formatted[formatted.length - 1];
        const continuing = last?.role === 'user' && last.content.some((b) => b.type === 'tool_result');
        if (i > 0 && (RecordingState.Replies[i]?.Reasoning.length ?? 0) > 0 && !continuing) {
            problems.push(`turn ${i + 1} thought, but its request did not continue a tool loop`);
        }
    });
    return problems;
}

/** The tool_result blocks answering calls to `toolName`, across a request's history. */
function answersIn(messagesIndex: number, toolName: string): ReturnType<typeof ResultBlocksOf> {
    const req = RecordingState.Requests[messagesIndex];
    return (req?.Messages ?? []).filter((m) => m.role === ChatMessageRole.tool).flatMap(ResultBlocksOf).filter((b) => b.toolName === toolName);
}

// ─── Checks ────────────────────────────────────────────────────────────────────

export const NativeToolLoopLiveChecks: NamedCheck[] = [
    {
        Id: 'native-tool-loop-live.NTLL1',
        Name: 'NTLL1: after a Retry on a native tool-call turn, every provider accepts every later request, and the call is answered in the protocol',
        RequiresLiveModel: true,
        Fn: async (ctx) => runTargets('NTLL1', (t) => attempt(ctx, 'NTLL1', t,
            () => runAgent(ctx, CALC_AGENT, t, 'What is 17 multiplied by 23?', { inject: true }),
            async (o) => {
                const problems: string[] = [];
                if (o.Status !== 'Completed') problems.push(`run ended '${o.Status}': ${o.ErrorMessage ?? '(no message)'}`);
                if (RecordingState.Requests.length < 2) problems.push('the loop never sent the history back after the Retry');
                const answer = answersIn(1, UNDECLARED_TOOL);
                if (answer.length !== 1 || answer[0].isError !== true || !(answer[0].content ?? '').startsWith('Not executed.')) {
                    problems.push(`the undeclared call is not answered as not executed: ${JSON.stringify(answer)}`);
                }
                const retried = RecordingState.Requests[1]?.Messages ?? [];
                if (retried.some((m) => typeof m.content === 'string' && m.content.includes('Retrying due to'))) problems.push('a "Retrying due to" message rode along');
                return problems;
            }))
    },
    {
        Id: 'native-tool-loop-live.NTLL2',
        Name: 'NTLL2: in native-only mode the model writes and corrects a document with agent tools and finishes in text; the payload is the corrected document',
        RequiresLiveModel: true,
        Fn: async (ctx) => runTargets('NTLL2', (t) => attempt(ctx, 'NTLL2', t,
            () => runAgent(ctx, DOC_AGENT, t, DOC_REQUEST),
            async (o) => {
                const problems: string[] = [];
                if (o.Status !== 'Completed') problems.push(`run ended '${o.Status}': ${o.ErrorMessage ?? '(no message)'}`);
                const doc = String(o.Payload.doc ?? '').replace(/\s+/g, ' ').trim();
                if (doc !== CORRECTED) problems.push(`payload doc is not the corrected draft: ${JSON.stringify(doc).slice(0, 200)}`);
                const tools = (await StepsOf(ctx, o.RunID)).filter((s) => s.StepType === 'Tool').map((s) => s.StepName);
                if (!tools.includes('Agent Tool: write_doc') || !tools.includes('Agent Tool: edit_doc')) problems.push(`expected write_doc and edit_doc Tool steps, got [${tools.join(', ')}]`);
                const declared = RecordingState.Requests[0]?.Tools ?? [];
                if (declared.includes('complete_task') || declared.includes('payload_change_request')) problems.push(`text-terminal agent declared [${declared.join(', ')}]`);
                return problems;
            }))
    },
    {
        Id: 'native-tool-loop-live.NTLL3',
        Name: 'NTLL3: on Claude with thinking on, every tool turn that thought is replayed with its signatures and accepted, the loop never reads as finished on the wire, and a budget-form model thinks again inside the loop',
        RequiresLiveModel: true,
        Fn: async (ctx) => runTargets('NTLL3', (t) => attempt(ctx, 'NTLL3', t,
            () => runAgent(ctx, DOC_AGENT, t, DOC_REQUEST, { effortLevel: 50 }),
            async (o) => {
                const problems: string[] = [];
                if (o.Status !== 'Completed') problems.push(`run ended '${o.Status}': ${o.ErrorMessage ?? '(no message)'}`);
                const replies = RecordingState.Replies;
                // Reply i answers request i; a tool turn that thought must come back on request i+1.
                replies.forEach((reply, i) => {
                    if (reply.ToolCalls.length === 0 || reply.Reasoning.length === 0) return;
                    const next = RecordingState.Requests[i + 1];
                    const replayed = next?.Messages.find((m) => m.role === ChatMessageRole.assistant && m.toolCalls?.some((c) => c.id === reply.ToolCalls[0].id));
                    if (!next) return;
                    if (JSON.stringify(replayed?.reasoning ?? []) !== JSON.stringify(reply.Reasoning)) problems.push(`turn ${i + 1}'s reasoning was not replayed unchanged`);
                });
                if (!replies.some((r) => r.Reasoning.length > 0)) problems.push('no turn produced reasoning blocks at all');
                const budgetForm = !UsesAdaptiveThinking(t.RealRow.APIName ?? '');
                const laterThinking = replies.slice(1).some((r) => r.Reasoning.length > 0);
                if (budgetForm && !laterThinking) problems.push('the budget-form model never thought after its first turn (interleaved thinking did not take effect)');
                problems.push(...anthropicLoopProblems());
                return problems;
            }), (driver) => driver === 'AnthropicLLM')
    }
];

for (const check of NativeToolLoopLiveChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('native-tool-loop-live', { Setup: setup, Teardown: teardown });
