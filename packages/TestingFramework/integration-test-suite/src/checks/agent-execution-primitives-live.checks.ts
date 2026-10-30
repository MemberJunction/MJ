/**
 * agent-execution-primitives-live.checks.ts — the 'agent-execution-primitives-live' bundle (AEPL1–AEPL4):
 * LIVE-MODEL end-to-end verification of MemberJunction's execution primitive hierarchy (`Pipeline`,
 * multi-step `ForEach` `steps[]`, and durable `Tasks` `TaskGraphSpec` including multi-step `ForEach`
 * nodes) across real LLM providers running with Native Tool Calling enabled.
 *
 * LIVE-MODEL tier (`RequiresLiveModel: true`). Runs three specialized fixture Loop agents through
 * `AgentRunner` on real native-tool-calling models (`AnthropicLLM`, `OpenAILLM`, `GeminiLLM`) wrapped
 * by {@link ITRecordingLLM} so every provider wire request/reply is inspected alongside persisted
 * SQL Server rows (`MJ: AI Agent Runs`, `MJ: AI Agent Run Steps`, `MJ: Tasks`, `MJ: Task Dependencies`,
 * and `MJ: Action Execution Logs`):
 *
 *   AEPL1  `IT: AEPL Pipeline Agent` — live native-tool-calling model bridges to JSON envelope for
 *          `nextStep.type = 'Pipeline'`, chaining `Calculate Expression` + `select` server-side so
 *          intermediate outputs stay out of context; persists a `Tool` (`Pipeline: ...`) step and
 *          writes the exact arithmetic result (`537` for `19 * 23 + 100`) to the payload.
 *   AEPL2  `IT: AEPL Batch Loop Agent` — live native-tool-calling model bridges to JSON envelope for
 *          in-turn `nextStep.type = 'ForEach'` with multi-step `steps[]` (`{{steps.<id>.details.result}}`
 *          chaining + `outputMapping` `[]` append) over `[3, 7, 11]`; persists one `ForEach` step +
 *          6 child `Actions` steps (`TargetLogID` linked) and produces `[14, 26, 38]` in the payload.
 *   AEPL3  `IT: AEPL Durable Workflow Agent` — live native-tool-calling model with `enableTaskGraphs: true`
 *          emits `nextStep.type = 'Tasks'` with two dependent `Action` tasks (`inputMapping` /
 *          `outputMapping`); persists `StepType = 'TaskGraph'`, parks the run in `Paused`, and
 *          `TaskGraphDispatcher` executes both tasks (`12 * 12 = 144`, `144 + 56 = 200`) and settles
 *          the submitting `MJAIAgentRunEntity` to `Status = 'Completed'`.
 *   AEPL4  `IT: AEPL Durable Workflow Agent` — live native-tool-calling model emits a durable `Tasks`
 *          graph containing a `ForEach` node with multi-step `steps[]` over `data.items = [4, 9]` plus
 *          a dependent downstream task; `TaskGraphDispatcher` executes the durable loop (`[42, 92]`),
 *          records `Configuration.runtime.iterations`, and settles the submitting agent run to `Completed`.
 *
 * Self-cleaning: Setup creates `IT: AEPL …` fixtures; Teardown deletes task dependencies, tasks,
 * action execution logs, agent runs, and fixture metadata in FK-safe order.
 */
import { ActionEngineServer } from '@memberjunction/actions';
import { BaseLLM, ChatMessageRole, GetAIAPIKey } from '@memberjunction/ai';
import type { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { RunView } from '@memberjunction/core';
import {
    MJAIAgentRunEntity,
    MJAIModelVendorEntity,
    MJTaskDependencyEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import { IndexByUUID, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { LoadTaskGraphSubmitter } from '@memberjunction/task-graph';
import { TemplateEngineServer } from '@memberjunction/templates';
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { AGENT_LIVE_SETTLE_MS } from './agent-live-shared';
import {
    DeleteTaskGraphsAndLogs,
    DriveGraphUntilSettled,
    EnsureTaskTypeAndEnvironment,
} from './agent-execution-primitives.checks';
import {
    AdjacencyViolations,
    CreateLoopAgent,
    CreateModelVendor,
    CreateNativePrompt,
    CreateVendor,
    IdsWhere,
    NewFixture,
    RECORDING_DRIVER,
    RecordingState,
    RemoveStaleFixtures,
    ResetRecording,
    TeardownFixture,
    type NativeLoopFixture,
} from './native-tool-loop-shared';
import { WaitUntil } from './wait-until';

const PREFIX = 'IT: AEPL ';
const PIPELINE_AGENT = `${PREFIX}Pipeline Agent`;
const BATCH_LOOP_AGENT = `${PREFIX}Batch Loop Agent`;
const DURABLE_WORKFLOW_AGENT = `${PREFIX}Durable Workflow Agent`;
const ACTION_NAME = 'Calculate Expression';

/** One fast native-tool-calling model per provider; overridable via EXECUTION_PRIMITIVES_IT_MODELS. */
const DEFAULT_TARGETS = [
    'Claude Haiku 4.5@AnthropicLLM',
    'GPT 5.4-mini@OpenAILLM',
    'Gemini 3.8 Flash@GeminiLLM',
];

const COMPLIANCE_ATTEMPTS = 2;

const ACTION_OUTPUT_NOTE = `Action contract note:
- \`Calculate Expression\` takes parameter \`Expression\` (a math string like \`"19 * 23"\`).
- Its structured JSON output has shape \`{ "summary": "...", "details": { "result": <number> } }\`, so the numeric output field path is \`details.result\`.
- Never ask the user clarifying questions.`;

const PIPELINE_INSTRUCTIONS = `# Server-Side Pipeline Specialist

You execute multi-stage arithmetic dataflows using MemberJunction's \`Pipeline\` nextStep so intermediate results stay server-side, then store the requested final number in the payload and complete the task.

${ACTION_OUTPUT_NOTE}`;

const BATCH_LOOP_INSTRUCTIONS = `{% raw %}# Multi-Step Loop Specialist

You process arrays in the payload in a single turn using \`ForEach\` with multi-step \`steps\` (chaining step outputs via \`{{steps.<stepId>.details.result}}\` and folding results into the payload via \`outputMapping\`), then complete the task once the \`ForEach\` finishes.

${ACTION_OUTPUT_NOTE}{% endraw %}`;

const DURABLE_WORKFLOW_INSTRUCTIONS = `{% raw %}# Durable TaskGraph Specialist

When asked to launch a durable workflow, emit \`nextStep.type = "Tasks"\` with a valid \`TaskGraphSpec\` (\`continuation: "none"\`) using \`Calculate Expression\` (whose numeric output path for \`outputMapping\` and \`{{steps.<id>.details.result}}\` is \`details.result\`).

${ACTION_OUTPUT_NOTE}{% endraw %}`;

interface LiveTarget {
    Spec: string;
    Model: MJAIModelEntityExtended;
    RealRow: MJAIModelVendorEntity;
    Driver: string;
}

interface SkippedTarget {
    Spec: string;
    Driver: string;
    Reason: string;
}

const label = (t: LiveTarget): string => `${t.Model.Name} (${t.Driver})`;
const supportsNative = (modelID: string, rowID: string): boolean =>
    AIEngine.Instance.GetEffectiveModelConfiguration(modelID, rowID)?.LLM?.SupportsNativeToolCalling === true;

function resolveTarget(spec: string): LiveTarget | null {
    const [name, driver] = spec.split('@').map((s) => s.trim());
    const engine = AIEngine.Instance;
    const nativeRowsByModel = IndexByUUID(
        engine.ModelVendors.filter(
            (mv) =>
                mv.DriverClass === driver &&
                mv.Status === 'Active' &&
                engine.IsInferenceProvider(mv) &&
                supportsNative(mv.ModelID, mv.ID),
        ),
        (mv) => mv.ModelID,
    );
    for (const model of engine.Models.filter((m) => m.Name === name && m.IsActive)) {
        const row = nativeRowsByModel.Get(model.ID);
        if (row) {
            return { Spec: spec, Model: model, RealRow: row, Driver: driver };
        }
    }
    return null;
}

function callableTargets(): { Callable: LiveTarget[]; Skipped: SkippedTarget[] } {
    const envRaw = process.env.EXECUTION_PRIMITIVES_IT_MODELS ?? process.env.NATIVE_LOOP_IT_MODELS;
    const specs = envRaw?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_TARGETS;
    const callable: LiveTarget[] = [];
    const skipped: SkippedTarget[] = [];
    const skip = (spec: string, driver: string, reason: string): void => {
        console.log(`      ○ skipped ${spec}: ${reason}`);
        skipped.push({ Spec: spec, Driver: driver, Reason: reason });
    };
    for (const spec of specs) {
        const driver = spec.split('@')[1]?.trim() ?? '';
        const target = resolveTarget(spec);
        if (!target) {
            skip(spec, driver, 'no active native-capable model row on that driver');
            continue;
        }
        if (!MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, target.Driver)) {
            skip(spec, driver, 'driver not registered');
            continue;
        }
        if (!GetAIAPIKey(target.Driver)) {
            skip(spec, driver, `no API key for ${target.Driver}`);
            continue;
        }
        callable.push(target);
    }
    return { Callable: callable, Skipped: skipped };
}

interface AeplFixture extends NativeLoopFixture {
    VendorID: string;
    Targets: LiveTarget[];
    Skipped: SkippedTarget[];
    CreatedParentTaskIDs: string[];
    CreatedTaskTypeIDs: string[];
    CreatedActionLogIDs: string[];
}

let fixture: AeplFixture | undefined;

function fx(): AeplFixture {
    if (!fixture) {
        throw new Error('agent-execution-primitives-live fixture not initialized — Setup must run first.');
    }
    return fixture;
}

async function setup(ctx: IntegrationCheckContext): Promise<void> {
    LoadTaskGraphSubmitter();
    await RemoveStaleFixtures(ctx, PREFIX);
    await ActionEngineServer.Instance.Config(false, ctx.User);
    await AIEngine.Instance.Config(false, ctx.User);
    const { Callable, Skipped } = callableTargets();
    const f: AeplFixture = {
        ...NewFixture(),
        VendorID: '',
        Targets: Callable,
        Skipped,
        CreatedParentTaskIDs: [],
        CreatedTaskTypeIDs: [],
        CreatedActionLogIDs: [],
    };
    fixture = f;

    process.env[`AI_VENDOR_API_KEY__${RECORDING_DRIVER.toUpperCase()}`] ??= 'recording';
    f.VendorID = await CreateVendor(ctx, f, `${PREFIX}Recording Vendor`);
    RecordingState.RealDriverByAPIName.clear();
    for (const t of f.Targets) {
        const api = t.RealRow.APIName ?? '';
        RecordingState.RealDriverByAPIName.set(api, t.Driver);
        await CreateModelVendor(ctx, f, {
            ModelID: t.Model.ID,
            VendorID: f.VendorID,
            DriverClass: RECORDING_DRIVER,
            APIName: api,
            ModelConfiguration: t.RealRow.ModelConfiguration,
            SupportsEffortLevel: t.RealRow.SupportsEffortLevel,
            MaxOutputTokens: t.RealRow.MaxOutputTokens,
            MaxInputTokens: t.RealRow.MaxInputTokens,
        });
    }

    const pipePrompt = await CreateNativePrompt(ctx, f, `${PIPELINE_AGENT} - Prompt`, PIPELINE_INSTRUCTIONS);
    const loopPrompt = await CreateNativePrompt(ctx, f, `${BATCH_LOOP_AGENT} - Prompt`, BATCH_LOOP_INSTRUCTIONS);
    const wfPrompt = await CreateNativePrompt(ctx, f, `${DURABLE_WORKFLOW_AGENT} - Prompt`, DURABLE_WORKFLOW_INSTRUCTIONS);

    await CreateLoopAgent(ctx, f, {
        Name: PIPELINE_AGENT,
        PromptID: pipePrompt,
        ActionNames: [ACTION_NAME],
        MaxIterationsPerRun: 6,
    });
    await CreateLoopAgent(ctx, f, {
        Name: BATCH_LOOP_AGENT,
        PromptID: loopPrompt,
        ActionNames: [ACTION_NAME],
        MaxIterationsPerRun: 6,
    });
    await CreateLoopAgent(ctx, f, {
        Name: DURABLE_WORKFLOW_AGENT,
        PromptID: wfPrompt,
        ActionNames: [ACTION_NAME],
        AgentTypePromptParams: { enableTaskGraphs: true },
        MaxIterationsPerRun: 6,
    });

    await EnsureTaskTypeAndEnvironment(ctx, f.CreatedTaskTypeIDs);
    await TemplateEngineServer.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngine.Instance.Config(true, ctx.User);
}

async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    if (fixture) {
        await DeleteTaskGraphsAndLogs(
            ctx,
            fixture.CreatedParentTaskIDs,
            fixture.CreatedTaskTypeIDs,
            fixture.CreatedActionLogIDs,
        );
    }
    await TeardownFixture(ctx, fixture);
    await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    fixture = undefined;
}

interface LiveStepRow {
    ID: string;
    StepNumber: number;
    StepType: string;
    StepName: string;
    ParentID: string | null;
    Status: string;
    CompletedAt: Date | string | null;
    Success: boolean | null;
    TargetLogID: string | null;
    OutputData: string | null;
}

async function loadSteps(ctx: IntegrationCheckContext, runID: string): Promise<LiveStepRow[]> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<LiveStepRow>(
        {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runID}'`,
            OrderBy: 'StepNumber ASC',
            Fields: ['ID', 'StepNumber', 'StepType', 'StepName', 'ParentID', 'Status', 'CompletedAt', 'Success', 'TargetLogID', 'OutputData'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User,
    );
    return r.Results ?? [];
}

const TERMINAL_STEP_STATUSES = new Set(['Completed', 'Failed', 'Cancelled']);

async function verifyNativeRunAndSteps(ctx: IntegrationCheckContext, runID: string): Promise<string[]> {
    const problems: string[] = [];
    const runEntity = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
    if (!(await runEntity.Load(runID))) {
        problems.push(`MJ: AI Agent Runs '${runID}' not found`);
        return problems;
    }
    if (runEntity.Status !== 'Completed' || runEntity.CompletedAt == null) {
        problems.push(`AgentRun '${runID}' expected Completed with CompletedAt set, got Status='${runEntity.Status}' CompletedAt=${String(runEntity.CompletedAt)}`);
    }
    const steps = await loadSteps(ctx, runID);
    if (steps.length === 0) {
        problems.push(`AgentRun '${runID}' persisted 0 MJ: AI Agent Run Steps rows`);
    }
    for (const s of steps) {
        if (!TERMINAL_STEP_STATUSES.has(s.Status) || s.CompletedAt == null) {
            problems.push(`Step #${s.StepNumber} (${s.StepType} '${s.StepName}') non-terminal: Status='${s.Status}' CompletedAt=${String(s.CompletedAt)}`);
        }
    }
    return problems;
}

interface LiveOutcome {
    RunID: string;
    Status: string;
    ErrorMessage: string | null;
    Payload: Record<string, unknown>;
}

async function runLiveAgent(
    ctx: IntegrationCheckContext,
    agentName: string,
    target: LiveTarget,
    request: string,
    opts: { payload?: Record<string, unknown>; data?: Record<string, unknown> } = {},
): Promise<LiveOutcome> {
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === agentName);
    Assert(!!agent, `Fixture agent '${agentName}' is loaded in AIEngine`);
    ResetRecording(false);
    const result = await new AgentRunner().RunAgent({
        agent: agent!,
        conversationMessages: [{ role: ChatMessageRole.user, content: request }],
        contextUser: ctx.User,
        override: { modelId: target.Model.ID, vendorId: fx().VendorID },
        ...(opts.payload ? { payload: opts.payload } : {}),
        ...(opts.data ? { data: opts.data } : {}),
    });
    const runID = result.agentRun?.ID ?? '';
    if (runID) {
        fx().RunIds.push(runID);
        const expectedSteps = result.agentRun?.Steps?.length ?? 0;
        if (expectedSteps > 0) {
            await WaitUntil(
                async () => (await IdsWhere(ctx, 'MJ: AI Agent Run Steps', `AgentRunID='${runID}'`)).length >= expectedSteps,
                `${agentName}: ${expectedSteps} step row(s) to land`,
                { TimeoutMs: AGENT_LIVE_SETTLE_MS * 2, PollMs: 120, StableReads: 2 },
            ).catch(() => undefined);
        }
    }
    return {
        RunID: runID,
        Status: result.agentRun?.Status ?? 'Unknown',
        ErrorMessage: result.agentRun?.ErrorMessage ?? null,
        Payload: (result.payload ?? {}) as Record<string, unknown>,
    };
}

function unavailableReason(o: LiveOutcome): string | null {
    const errors = [o.ErrorMessage ?? '', ...RecordingState.Replies.filter((r) => !r.Success).map((r) => r.ErrorMessage)].join(' ');
    if (/model\b[^.\n]{0,80}\b(not found|does not exist|no longer available|not deployed)|\b404\b/i.test(errors)) {
        return 'model unavailable at the vendor';
    }
    if (/insufficient balance|insufficient_quota|quota exceeded|credit balance is too low|recharge/i.test(errors)) {
        return 'account has no balance or quota';
    }
    if (/\b401\b|authentication_error|invalid x-api-key|invalid_api_key|api key not valid/i.test(errors)) {
        return 'invalid or expired API key for vendor';
    }
    return null;
}

function protocolProblems(who: string): string[] {
    const problems: string[] = [];
    RecordingState.Replies.forEach((r, i) => {
        if (!r.Success) {
            problems.push(`${who}: provider rejected request ${i + 1}: ${r.ErrorMessage.slice(0, 300)}`);
        }
    });
    RecordingState.Requests.forEach((req, i) => {
        for (const p of AdjacencyViolations(req.Messages)) {
            problems.push(`${who}: request ${i + 1} history: ${p}`);
        }
    });
    return problems;
}

interface AttemptResult {
    Problems: string[];
    Counted: boolean;
    NotCountedReason?: string;
}

async function attempt(
    check: string,
    target: LiveTarget,
    go: () => Promise<LiveOutcome>,
    judge: (o: LiveOutcome) => Promise<string[]>,
): Promise<AttemptResult> {
    const who = label(target);
    for (let n = 1; n <= COMPLIANCE_ATTEMPTS; n++) {
        const outcome = await go();
        const unavailable = unavailableReason(outcome);
        if (unavailable) {
            console.log(`      ○ ${who}: ${unavailable}; not counted`);
            return { Problems: [], Counted: false, NotCountedReason: unavailable };
        }
        const protocol = protocolProblems(who);
        if (protocol.length > 0) {
            return { Problems: protocol, Counted: true };
        }
        const behaviour = await judge(outcome);
        console.log(
            `      ● ${check} ${who}: ${outcome.Status}; ${RecordingState.Requests.length} request(s); ${
                behaviour.length === 0 ? 'ok' : behaviour.join('; ')
            }`,
        );
        if (behaviour.length === 0) {
            return { Problems: [], Counted: true };
        }
        if (n === COMPLIANCE_ATTEMPTS) {
            return { Problems: behaviour.map((b) => `${who}: ${b}`), Counted: true };
        }
        console.warn(`      ↻ ${who}: attempt ${n}/${COMPLIANCE_ATTEMPTS} did not follow the task; retrying`);
    }
    return { Problems: [], Counted: true };
}

async function runTargets(check: string, run: (t: LiveTarget) => Promise<AttemptResult>): Promise<void> {
    const targets = fx().Targets;
    const failures: string[] = [];
    const exercised = new Set<string>();
    const notRun: string[] = fx().Skipped.map((s) => `${s.Spec}: ${s.Reason}`);
    for (const target of targets) {
        const result = await run(target);
        failures.push(...result.Problems);
        if (result.Counted) {
            exercised.add(target.Driver);
        } else {
            notRun.push(`${label(target)}: ${result.NotCountedReason ?? 'not counted'}`);
        }
    }
    Assert(
        exercised.size > 0,
        `${check}: no live model could be exercised (${notRun.join('; ') || 'check API keys / EXECUTION_PRIMITIVES_IT_MODELS'})`,
    );
    Assert(
        failures.length === 0,
        `${check}: ${failures.length} problem(s) across ${targets.length} model(s):\n    ${failures.join('\n    ')}`,
    );
}

export const AgentExecutionPrimitivesLiveChecks: NamedCheck[] = [
    {
        Id: 'agent-execution-primitives-live.AEPL1',
        Name: 'AEPL1: live native-tool-calling agent executes a multi-stage server-side Pipeline (Calculate Expression -> select -> Calculate Expression -> select) via JSON envelope bridge and records finalScore = 537',
        RequiresLiveModel: true,
        Fn: async (ctx) =>
            runTargets('AEPL1', (t) =>
                attempt(
                    'AEPL1',
                    t,
                    () =>
                        runLiveAgent(
                            ctx,
                            PIPELINE_AGENT,
                            t,
                            'Use a single `Pipeline` nextStep (`nextStep.type = "Pipeline"`, NOT separate direct tool calls across turns) to: ' +
                                '(1) run `Calculate Expression` with `Expression: "19 * 23"`, ' +
                                '(2) `select` `"details.result"`, ' +
                                '(3) run `Calculate Expression` with `Expression: "{{$}} + 100"`, and ' +
                                '(4) `select` `"details.result"`. ' +
                                'Once the pipeline returns the result, write it into the payload at `finalScore` (number) and complete the task.',
                        ),
                    async (o) => {
                        const problems: string[] = [];
                        if (o.Status !== 'Completed') {
                            problems.push(`run ended '${o.Status}': ${o.ErrorMessage ?? '(no message)'}`);
                            return problems;
                        }
                        problems.push(...(await verifyNativeRunAndSteps(ctx, o.RunID)));
                        const steps = await loadSteps(ctx, o.RunID);
                        const pipeStep = steps.find(
                            (s) => s.StepType === 'Tool' && s.StepName.startsWith('Pipeline:') && s.Success === true,
                        );
                        if (!pipeStep) {
                            problems.push(
                                `expected a successful Tool step starting with 'Pipeline:', got steps=${JSON.stringify(
                                    steps.map((s) => [s.StepType, s.StepName, s.Success]),
                                )}`,
                            );
                        }
                        if (Number(o.Payload.finalScore) !== 537) {
                            problems.push(`expected payload.finalScore === 537, got ${JSON.stringify(o.Payload.finalScore)}`);
                        }
                        return problems;
                    },
                ),
            ),
    },
    {
        Id: 'agent-execution-primitives-live.AEPL2',
        Name: 'AEPL2: live native-tool-calling agent executes in-turn ForEach with multi-step steps[] over [3, 7, 11], persisting 1 ForEach step + 6 child Actions steps and producing processed = [14, 26, 38]',
        RequiresLiveModel: true,
        Fn: async (ctx) =>
            runTargets('AEPL2', (t) =>
                attempt(
                    'AEPL2',
                    t,
                    () =>
                        runLiveAgent(
                            ctx,
                            BATCH_LOOP_AGENT,
                            t,
                            'Process `quantities` in the payload in ONE turn using `nextStep.type = "ForEach"` with multi-step `steps` ' +
                                '(do NOT call `calculate_expression` directly 6 times): ' +
                                'set `collectionPath: "quantities"`, `itemVariable: "q"`, `executionMode: "sequential"`, and two `steps`: ' +
                                'step 1 (`id: "triple"`) calls `Calculate Expression` with `Expression: "{{q}} * 3"`, and ' +
                                'step 2 (`id: "plusFive"`) calls `Calculate Expression` with `Expression: "{{steps.triple.details.result}} + 5"` ' +
                                'and `outputMapping: "{\\"details.result\\": \\"processed[]\\"}"`. ' +
                                'Because `outputMapping` already appends into `processed`, once the ForEach finishes do NOT touch `processed` in `payloadChangeRequest` — simply complete the task.',
                            { payload: { quantities: [3, 7, 11] } },
                        ),
                    async (o) => {
                        const problems: string[] = [];
                        if (o.Status !== 'Completed') {
                            problems.push(`run ended '${o.Status}': ${o.ErrorMessage ?? '(no message)'}`);
                            return problems;
                        }
                        problems.push(...(await verifyNativeRunAndSteps(ctx, o.RunID)));
                        const steps = await loadSteps(ctx, o.RunID);
                        const feStep = steps.find((s) => s.StepType === 'ForEach' && s.Success === true);
                        if (!feStep) {
                            problems.push(
                                `expected a successful ForEach step, got steps=${JSON.stringify(
                                    steps.map((s) => [s.StepType, s.StepName, s.Success]),
                                )}`,
                            );
                        } else {
                            const children = steps.filter((s) => s.StepType === 'Actions' && s.ParentID === feStep.ID);
                            if (children.length !== 6) {
                                problems.push(`expected 6 child Actions steps under ForEach, got ${children.length}`);
                            }
                            if (!children.every((c) => c.Success === true && !!c.TargetLogID)) {
                                problems.push('not all child Actions steps succeeded with TargetLogID set');
                            }
                        }
                        const processed = Array.isArray(o.Payload.processed) ? o.Payload.processed.map(Number) : [];
                        if (JSON.stringify(processed) !== JSON.stringify([14, 26, 38])) {
                            problems.push(`expected payload.processed === [14, 26, 38], got ${JSON.stringify(o.Payload.processed)}`);
                        }
                        return problems;
                    },
                ),
            ),
    },
    {
        Id: 'agent-execution-primitives-live.AEPL3',
        Name: 'AEPL3: live native-tool-calling agent emits durable Tasks (2 connected Action nodes with inputMapping/outputMapping) -> parks run -> TaskGraphDispatcher executes graph (144 -> 200) and settles run to Completed',
        RequiresLiveModel: true,
        Fn: async (ctx) =>
            runTargets('AEPL3', (t) =>
                attempt(
                    'AEPL3',
                    t,
                    () =>
                        runLiveAgent(
                            ctx,
                            DURABLE_WORKFLOW_AGENT,
                            t,
                            'Emit a durable task graph (`nextStep.type = "Tasks"`) with `workflowName: "IT AEPL3 Two-Stage Math"`, `continuation: "none"`, and 2 connected `Action` tasks: ' +
                                '(1) `tempId: "t1"`, `kind: "Action"`, `dependsOn: []`, `configuration: { "actionName": "Calculate Expression", "outputMapping": "{\\"details.result\\": \\"gross\\"}" }`, `inputPayload: { "Expression": "12 * 12" }`; ' +
                                '(2) `tempId: "t2"`, `kind: "Action"`, `dependsOn: [{ "tempId": "t1", "condition": "output.gross === 144" }]`, `configuration: { "actionName": "Calculate Expression", "inputMapping": "{\\"Expression\\": \\"data.followupFormula\\"}", "outputMapping": "{\\"details.result\\": \\"netTotal\\"}" }`.',
                            { data: { followupFormula: '144 + 56' } },
                        ),
                    async (o) => {
                        const problems: string[] = [];
                        const steps = await loadSteps(ctx, o.RunID);
                        const tgStep = steps.find((s) => s.StepType === 'TaskGraph' && s.Success === true);
                        if (!tgStep) {
                            problems.push(
                                `expected a successful TaskGraph step, got status=${o.Status} error=${o.ErrorMessage ?? 'none'} steps=${JSON.stringify(
                                    steps.map((s) => [s.StepType, s.StepName, s.Success]),
                                )}`,
                            );
                            return problems;
                        }
                        const tgOutput = JSON.parse(tgStep.OutputData ?? '{}') as { submitted?: boolean; parentTaskID?: string };
                        if (!tgOutput.submitted || !tgOutput.parentTaskID) {
                            problems.push(`TaskGraph step did not submit durable parentTaskID: ${tgStep.OutputData ?? 'null'}`);
                            return problems;
                        }
                        const parentID = tgOutput.parentTaskID;
                        fx().CreatedParentTaskIDs.push(parentID);

                        const settledParent = await DriveGraphUntilSettled(
                            ctx,
                            parentID,
                            `it-aepl3-${t.Driver}`,
                            fx().CreatedActionLogIDs,
                        );
                        if (settledParent.Status !== 'Complete') {
                            problems.push(`durable parent task ended '${settledParent.Status}' (${settledParent.ErrorMessage ?? 'no error'})`);
                        }

                        const rv = RunView.FromMetadataProvider(ctx.Provider);
                        const childRes = await rv.RunView<MJTaskEntity>(
                            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
                            ctx.User,
                        );
                        const children = childRes.Results ?? [];
                        if (children.length !== 2) {
                            problems.push(`expected 2 child MJ: Tasks rows, found ${children.length}`);
                        } else {
                            const ids = children.map((c) => `'${c.ID}'`).join(',');
                            const depRes = await rv.RunView<MJTaskDependencyEntity>(
                                { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids})`, ResultType: 'entity_object', BypassCache: true },
                                ctx.User,
                            );
                            if ((depRes.Results ?? []).length !== 1) {
                                problems.push(`expected 1 MJ: Task Dependencies edge, found ${(depRes.Results ?? []).length}`);
                            }
                            const outputs = children.map((c) => JSON.parse(c.OutputPayload ?? '{}') as Record<string, unknown>);
                            const hasGross144 = outputs.some((out) => Number(out.gross) === 144);
                            const hasNet200 = outputs.some((out) => Number(out.netTotal) === 200);
                            if (!hasGross144 || !hasNet200) {
                                problems.push(`expected child outputs gross=144 and netTotal=200, got ${JSON.stringify(outputs)}`);
                            }
                        }

                        await WaitUntil(
                            async () => {
                                const runEntity = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
                                return (await runEntity.Load(o.RunID)) && runEntity.Status === 'Completed' && runEntity.CompletedAt != null;
                            },
                            'AEPL3: parked run settled to Completed by TaskGraphDispatcher',
                            { TimeoutMs: 10_000, PollMs: 150 },
                        ).catch(() => {
                            problems.push('submitting MJ: AI Agent Runs row did not transition to Completed after graph settlement');
                        });

                        return problems;
                    },
                ),
            ),
    },
    {
        Id: 'agent-execution-primitives-live.AEPL4',
        Name: 'AEPL4: live native-tool-calling agent emits a durable Tasks graph containing a multi-step ForEach (steps[]) node + downstream node; TaskGraphDispatcher computes [42, 92] and settles run to Completed',
        RequiresLiveModel: true,
        Fn: async (ctx) =>
            runTargets('AEPL4', (t) =>
                attempt(
                    'AEPL4',
                    t,
                    () =>
                        runLiveAgent(
                            ctx,
                            DURABLE_WORKFLOW_AGENT,
                            t,
                            'Emit a durable task graph (`nextStep.type = "Tasks"`) with `workflowName: "IT AEPL4 Durable Multi-Step Loop"`, `continuation: "none"`, and 2 tasks: ' +
                                '(1) `tempId: "loop"`, `kind: "ForEach"`, `dependsOn: []`, `configuration` with `collectionPath: "data.items"`, `itemVariable: "x"`, `executionMode: "sequential"`, and `steps`: ' +
                                'step 1 (`id: "s1"`, `name: "Calculate Expression"`, `params: { "Expression": "{{x}} * 10" }`) and ' +
                                'step 2 (`id: "s2"`, `name: "Calculate Expression"`, `params: { "Expression": "{{steps.s1.details.result}} + 2" }`, `outputMapping: "{\\"details.result\\": \\"answers[]\\"}"`); ' +
                                '(2) `tempId: "verify"`, `kind: "Action"`, `dependsOn: [{ "tempId": "loop", "condition": "output.iterations === 2" }]`, `configuration: { "actionName": "Calculate Expression", "outputMapping": "{\\"details.result\\": \\"verifiedSum\\"}" }`, `inputPayload: { "Expression": "42 + 92" }`.',
                            { data: { items: [4, 9] } },
                        ),
                    async (o) => {
                        const problems: string[] = [];
                        const steps = await loadSteps(ctx, o.RunID);
                        const tgStep = steps.find((s) => s.StepType === 'TaskGraph' && s.Success === true);
                        if (!tgStep) {
                            problems.push(
                                `expected a successful TaskGraph step, got status=${o.Status} error=${o.ErrorMessage ?? 'none'} steps=${JSON.stringify(
                                    steps.map((s) => [s.StepType, s.StepName, s.Success]),
                                )}`,
                            );
                            return problems;
                        }
                        const tgOutput = JSON.parse(tgStep.OutputData ?? '{}') as { submitted?: boolean; parentTaskID?: string };
                        if (!tgOutput.submitted || !tgOutput.parentTaskID) {
                            problems.push(`TaskGraph step did not submit durable parentTaskID: ${tgStep.OutputData ?? 'null'}`);
                            return problems;
                        }
                        const parentID = tgOutput.parentTaskID;
                        fx().CreatedParentTaskIDs.push(parentID);

                        const settledParent = await DriveGraphUntilSettled(
                            ctx,
                            parentID,
                            `it-aepl4-${t.Driver}`,
                            fx().CreatedActionLogIDs,
                        );
                        if (settledParent.Status !== 'Complete') {
                            problems.push(`durable parent task ended '${settledParent.Status}' (${settledParent.ErrorMessage ?? 'no error'})`);
                        }

                        const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
                            ctx.User,
                        );
                        const children = childRes.Results ?? [];
                        const feChild = children.find(
                            (c) => c.StepType === 'ForEach' || (c.Configuration ?? '').includes('"forEach"'),
                        );
                        if (!feChild) {
                            problems.push('could not find persisted ForEach child MJ: Tasks row');
                        } else {
                            const out = JSON.parse(feChild.OutputPayload ?? '{}') as { answers?: number[] };
                            const answers = Array.isArray(out.answers) ? out.answers.map(Number) : [];
                            if (JSON.stringify(answers) !== JSON.stringify([42, 92])) {
                                problems.push(`expected ForEach OutputPayload answers=[42, 92], got ${feChild.OutputPayload ?? 'null'}`);
                            }
                            const cfg = JSON.parse(feChild.Configuration ?? '{}') as { runtime?: { iterations?: unknown[] } };
                            if ((cfg.runtime?.iterations?.length ?? 0) !== 2) {
                                problems.push(`expected 2 recorded runtime iterations on ForEach task, got ${cfg.runtime?.iterations?.length ?? 0}`);
                            }
                        }
                        const verifyChild = children.find((c) => !UUIDsEqual(c.ID, feChild?.ID));
                        if (!verifyChild || verifyChild.Status !== 'Complete') {
                            problems.push(`expected downstream Action task Complete, got ${verifyChild?.Status ?? 'missing'}`);
                        } else {
                            const vOut = JSON.parse(verifyChild.OutputPayload ?? '{}') as { verifiedSum?: number };
                            if (Number(vOut.verifiedSum) !== 134) {
                                problems.push(`expected downstream verifiedSum === 134, got ${verifyChild.OutputPayload ?? 'null'}`);
                            }
                        }

                        await WaitUntil(
                            async () => {
                                const runEntity = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
                                return (await runEntity.Load(o.RunID)) && runEntity.Status === 'Completed' && runEntity.CompletedAt != null;
                            },
                            'AEPL4: parked run settled to Completed by TaskGraphDispatcher',
                            { TimeoutMs: 10_000, PollMs: 150 },
                        ).catch(() => {
                            problems.push('submitting MJ: AI Agent Runs row did not transition to Completed after graph settlement');
                        });

                        return problems;
                    },
                ),
            ),
    },
];

for (const check of AgentExecutionPrimitivesLiveChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-execution-primitives-live', { Setup: setup, Teardown: teardown });
