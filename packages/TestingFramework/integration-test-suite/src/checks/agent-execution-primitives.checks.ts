/**
 * agent-execution-primitives.checks.ts — the 'agent-execution-primitives' bundle (AEP1–AEP6):
 * deterministic end-to-end verification of MemberJunction's agent execution primitives across
 * native tool-calling models, multi-step loop bodies (`steps[]`), Pipelines, and durable TaskGraphs.
 *
 * DETERMINISTIC tier — zero live LLM calls, zero external network. Runs real Loop agents through
 * `AgentRunner` against {@link ITScriptedToolLLM} (configured with native tool calling + implicit
 * control flow) and drives real `TaskGraphService` + `TaskGraphDispatcher` + `ActionEngineServer`
 * against the live SQL Server database:
 *
 *   AEP1  Native tool-calling JSON bridge for `Pipeline` with sanitized tool names
 *         (`calculate_expression` → `'Calculate Expression'`), structured JSON Message coercion,
 *         and `{{$}}` stage chaining; persists a single `Tool` (`Pipeline: 4 step(s)`) run step.
 *   AEP2  In-turn `ForEach` with multi-step `steps[]` (`steps.<id>.*` output wiring, per-step
 *         `condition`, per-step `outputMapping` `[]` append, and sanitized tool names) under native
 *         tool calling; persists one `ForEach` step plus child `Actions` steps linked via `TargetLogID`.
 *   AEP3  In-turn `While` with multi-step `steps[]` mutating loop payload across iterations under
 *         native tool calling; persists one `While` step plus child `Actions` steps.
 *   AEP4  Durable `TaskGraphService.Submit` + `TaskGraphDispatcher` running multi-step `ForEach`
 *         (`steps[]`) and multi-step `While` (`steps[]`) against real `ActionEngineServer.Instance`
 *         and SQL Server; asserts `ActionID` FK, `OutputPayload`, and `Configuration.runtime.iterations`.
 *   AEP5  Agent emitting `nextStep.type = 'Tasks'` under native tool calling: parks `MJAIAgentRunEntity`
 *         in `Status = 'Paused'` with a `StepType = 'TaskGraph'` run step, then `TaskGraphDispatcher`
 *         executes the multi-step `ForEach` + XOR `exclusiveGroup` conditional `Action` fork and settles
 *         the submitting agent run to `Status = 'Completed'`.
 *   AEP6  Flow graduation round-trip (`ConvertTaskGraphToAgentSpec` → `CompileFlowToTaskGraph` →
 *         `TaskGraphService.Submit`) preserving multi-step `ForEach` and `While` `steps[]` on
 *         persisted `MJ: Tasks` rows.
 *
 * Self-cleaning: Setup creates fixture vendor/model/prompts/agents (`IT: AEP …`); Teardown deletes
 * task dependencies, child/parent tasks, action execution logs, agent runs, and fixture metadata.
 */
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { ChatMessageRole } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import {
    BuildActionOutputObject,
    CompileFlowToTaskGraph,
    ConvertTaskGraphToAgentSpec,
    type FlowCompilerPath,
    type FlowCompilerStep,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRunEntity,
    MJTaskDependencyEntity,
    MJTaskEntity,
    MJTaskTypeEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import {
    LoadTaskGraphSubmitter,
    TaskGraphDispatcher,
    TaskGraphService,
    type ProviderFactory,
    type TaskActionRunParams,
    type TaskActionRunResult,
    type TaskActionRunner,
    type TaskAgentRunParams,
    type TaskAgentRunResult,
    type TaskAgentRunner,
} from '@memberjunction/task-graph';
import { TemplateEngineServer } from '@memberjunction/templates';
import { Assert, AssertEqual, IntegrationCheckRegistry, settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { AGENT_LIVE_SETTLE_MS, DeleteById } from './agent-live-shared';
import {
    CreateLoopAgent,
    CreateModel,
    CreateModelVendor,
    CreateNativePrompt,
    CreateVendor,
    IdsWhere,
    NewFixture,
    RemoveStaleFixtures,
    ResetScript,
    SCRIPTED_DRIVER,
    ScriptState,
    TeardownFixture,
    TextOf,
    TextTurn,
    ToolCallTurn,
    type NativeLoopFixture,
    type RecordedRequest,
    type ScriptedTurn,
} from './native-tool-loop-shared';
import { WaitUntil } from './wait-until';

const PREFIX = 'IT: AEP ';
const PRIMITIVES_AGENT = `${PREFIX}Primitives Agent`;
const WORKFLOW_AGENT = `${PREFIX}Workflow Agent`;
const ACTION_NAME = 'Calculate Expression';

interface AepFixture extends NativeLoopFixture {
    ModelID: string;
    VendorID: string;
    CreatedParentTaskIDs: string[];
    CreatedTaskTypeIDs: string[];
    CreatedActionLogIDs: string[];
}

let fixture: AepFixture | undefined;

function fx(): AepFixture {
    if (!fixture) {
        throw new Error('agent-execution-primitives fixture not initialized — Setup must run first.');
    }
    return fixture;
}

const INSTRUCTIONS =
    '# Execution Primitives Fixture\n\nExecute calculations using Pipelines, ForEach/While loops, or durable Tasks graphs as instructed.';

/** Real ActionEngine-backed runner matching MJServer's TaskGraphActionRunner output projection. */
export class RealIntegrationTaskActionRunner implements TaskActionRunner {
    public constructor(private readonly logSink: string[]) {}

    public async RunActionForTask(params: TaskActionRunParams): Promise<TaskActionRunResult> {
        await ActionEngineServer.Instance.Config(false, params.ContextUser);
        const action = ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, params.ActionID));
        if (!action) {
            return { Success: false, ErrorMessage: `Action ${params.ActionID} not found in ActionEngineServer.` };
        }
        const inputRecord: Record<string, unknown> =
            params.InputPayload && typeof params.InputPayload === 'object' && !Array.isArray(params.InputPayload)
                ? (params.InputPayload as Record<string, unknown>)
                : {};
        const actionParams: ActionParam[] = Object.entries(inputRecord).map(([Name, Value]) => ({
            Name,
            Value,
            Type: 'Input',
        }));
        const result = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: params.ContextUser,
            Params: actionParams,
            Filters: [],
        });
        if (result.LogEntry?.ID) {
            this.logSink.push(result.LogEntry.ID);
        }
        const output = BuildActionOutputObject(result.Params, result.Message);
        return {
            Success: result.Success,
            Output: output,
            ErrorMessage: result.Success ? undefined : (result.Message ?? 'Action failed'),
            ActionLogID: result.LogEntry?.ID,
        };
    }
}

class NoopTaskAgentRunner implements TaskAgentRunner {
    public async RunAgentForTask(_params: TaskAgentRunParams): Promise<TaskAgentRunResult> {
        return { Success: false, ErrorMessage: 'No Agent nodes expected in AEP action-only task graphs.' };
    }
}

function providerFactory(ctx: IntegrationCheckContext): ProviderFactory {
    const pool = ctx.Pool;
    if (!pool) {
        return { CreateProvider: async () => ctx.Provider };
    }
    return {
        CreateProvider: async (): Promise<IMetadataProvider> => {
            const config = new SQLServerProviderConfigData(pool, ctx.Schema ?? '__mj', 0, undefined, undefined, false);
            const provider = new SQLServerDataProvider();
            await provider.Config(config);
            return provider;
        },
    };
}

export async function EnsureTaskTypeAndEnvironment(ctx: IntegrationCheckContext, taskTypeSink: string[]): Promise<string> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const existingType = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Task Types', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        ctx.User,
    );
    if (!existingType.Results?.[0]?.ID) {
        const tt = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
        tt.NewRecord();
        tt.Name = 'mj-it-aep-task-type (safe to delete)';
        tt.Description = 'Created by agent-execution-primitives integration bundle.';
        Assert(await tt.Save(), `Failed to create TaskType fixture: ${tt.LatestResult?.CompleteMessage ?? 'unknown'}`);
        taskTypeSink.push(tt.ID);
    }
    const envRes = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Environments', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        ctx.User,
    );
    const envId = envRes.Results?.[0]?.ID;
    Assert(!!envId, 'Could not resolve an Environment ID');
    return envId!;
}

export async function DriveGraphUntilSettled(
    ctx: IntegrationCheckContext,
    parentTaskID: string,
    instanceID: string,
    logSink: string[],
    timeoutMs: number = 30_000,
): Promise<MJTaskEntity> {
    const dispatcher = new TaskGraphDispatcher(
        providerFactory(ctx),
        new NoopTaskAgentRunner(),
        ctx.User,
        {
            InstanceID: instanceID,
            PollIntervalSeconds: 0.2,
            ClaimTTLSeconds: 300,
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 4,
        },
        undefined,
        undefined,
        new RealIntegrationTaskActionRunner(logSink),
    );
    const terminal = new Set<MJTaskEntity['Status']>(['Complete', 'Failed', 'Cancelled', 'Skipped']);
    await dispatcher.Start();
    try {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const parent = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
            Assert(await parent.Load(parentTaskID), `Parent task ${parentTaskID} could not be loaded`);
            if (terminal.has(parent.Status)) {
                // Allow settleSubmittingRun (which runs right after parent rollup) a brief beat to finish saving.
                await settle(250);
                return parent;
            }
            Assert(
                Date.now() < deadline,
                `Task graph ${parentTaskID} did not reach terminal state within ${timeoutMs}ms (stuck in '${parent.Status}')`,
            );
            await settle(200);
        }
    } finally {
        await dispatcher.Stop();
    }
}

export async function DeleteTaskGraphsAndLogs(
    ctx: IntegrationCheckContext,
    parentTaskIDs: string[],
    taskTypeIDs: string[],
    actionLogIDs: string[],
): Promise<void> {
    // Wait briefly so fire-and-forget ActionExecutionLog writes finish before cleanup
    if (actionLogIDs.length > 0) {
        await settle(500);
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    for (const parentID of parentTaskIDs) {
        const childRes = await rv.RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        const children = childRes.Results ?? [];
        if (children.length > 0) {
            const ids = children.map((c) => `'${c.ID}'`).join(',');
            const depRes = await rv.RunView<MJTaskDependencyEntity>(
                { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids}) OR DependsOnTaskID IN (${ids})`, ResultType: 'entity_object', BypassCache: true },
                ctx.User,
            );
            for (const dep of depRes.Results ?? []) {
                await dep.Delete().catch(() => false);
            }
        }
        for (const child of children) {
            await child.Delete().catch(() => false);
        }
        await DeleteById('MJ: Tasks', parentID, ctx.Provider, ctx.User);
    }
    for (const typeID of taskTypeIDs) {
        await DeleteById('MJ: Task Types', typeID, ctx.Provider, ctx.User);
    }
    for (const logID of actionLogIDs) {
        await DeleteById('MJ: Action Execution Logs', logID, ctx.Provider, ctx.User);
    }
}

async function setup(ctx: IntegrationCheckContext): Promise<void> {
    LoadTaskGraphSubmitter();
    await RemoveStaleFixtures(ctx, PREFIX);
    await ActionEngineServer.Instance.Config(false, ctx.User);
    const f: AepFixture = {
        ...NewFixture(),
        ModelID: '',
        VendorID: '',
        CreatedParentTaskIDs: [],
        CreatedTaskTypeIDs: [],
        CreatedActionLogIDs: [],
    };
    fixture = f;

    process.env[`AI_VENDOR_API_KEY__${SCRIPTED_DRIVER.toUpperCase()}`] ??= 'scripted';
    f.VendorID = await CreateVendor(ctx, f, `${PREFIX}Scripted Vendor`);
    f.ModelID = await CreateModel(ctx, f, `${PREFIX}Scripted Native Model`, {
        LLM: {
            SupportsNativeToolCalling: true,
            DefaultToNativeToolCalling: true,
            NativeControlFlow: 'implicit',
            NativeToolResults: true,
        },
    });
    await CreateModelVendor(ctx, f, {
        ModelID: f.ModelID,
        VendorID: f.VendorID,
        DriverClass: SCRIPTED_DRIVER,
        APIName: 'it-aep-scripted-native',
    });

    const promptID = await CreateNativePrompt(ctx, f, `${PREFIX}Prompt`, INSTRUCTIONS);
    await CreateLoopAgent(ctx, f, {
        Name: PRIMITIVES_AGENT,
        PromptID: promptID,
        ActionNames: [ACTION_NAME],
        MaxIterationsPerRun: 8,
    });
    await CreateLoopAgent(ctx, f, {
        Name: WORKFLOW_AGENT,
        PromptID: promptID,
        ActionNames: [ACTION_NAME],
        AgentTypePromptParams: { enableTaskGraphs: true },
        MaxIterationsPerRun: 8,
    });

    await TemplateEngineServer.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngine.Instance.Config(true, ctx.User);
}

async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    if (fixture) {
        // Delete tasks BEFORE TeardownFixture purges MJ: AI Agent Runs (MJ: Tasks.AgentRunID is an FK).
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

interface DetailedStepRow {
    ID: string;
    StepNumber: number;
    StepType: string;
    StepName: string;
    ParentID: string | null;
    Status: string;
    Success: boolean | null;
    TargetLogID: string | null;
    OutputData: string | null;
}

async function loadDetailedSteps(ctx: IntegrationCheckContext, runID: string): Promise<DetailedStepRow[]> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<DetailedStepRow>(
        {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runID}'`,
            OrderBy: 'StepNumber ASC',
            Fields: ['ID', 'StepNumber', 'StepType', 'StepName', 'ParentID', 'Status', 'Success', 'TargetLogID', 'OutputData'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User,
    );
    return r.Results ?? [];
}

interface RunOutcome {
    RunID: string;
    Status: string;
    ErrorMessage: string | null;
    Payload: Record<string, unknown>;
    Requests: RecordedRequest[];
}

async function runScripted(
    ctx: IntegrationCheckContext,
    agentName: string,
    userRequest: string,
    turns: ScriptedTurn[],
    initialPayload?: Record<string, unknown>,
): Promise<RunOutcome> {
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === agentName);
    Assert(!!agent, `Fixture agent '${agentName}' is loaded in AIEngine`);
    ResetScript(turns);
    const result = await new AgentRunner().RunAgent({
        agent: agent!,
        conversationMessages: [{ role: ChatMessageRole.user, content: userRequest }],
        contextUser: ctx.User,
        override: { modelId: fx().ModelID, vendorId: fx().VendorID },
        ...(initialPayload ? { payload: initialPayload } : {}),
    });
    const runID = result.agentRun?.ID;
    Assert(!!runID, `${agentName}: AgentRunner recorded an MJ: AI Agent Runs row`);
    fx().RunIds.push(runID!);

    const expectedSteps = result.agentRun?.Steps?.length ?? 0;
    if (expectedSteps > 0) {
        await WaitUntil(
            async () => (await IdsWhere(ctx, 'MJ: AI Agent Run Steps', `AgentRunID='${runID}'`)).length >= expectedSteps,
            `${agentName}: ${expectedSteps} agent-run step row(s) to land`,
            { TimeoutMs: AGENT_LIVE_SETTLE_MS * 2, PollMs: 100, StableReads: 2 },
        ).catch(() => undefined);
    }

    return {
        RunID: runID!,
        Status: result.agentRun?.Status ?? 'Unknown',
        ErrorMessage: result.agentRun?.ErrorMessage ?? null,
        Payload: (result.payload ?? {}) as Record<string, unknown>,
        Requests: [...ScriptState.Requests],
    };
}

export const AgentExecutionPrimitivesChecks: NamedCheck[] = [
    {
        Id: 'agent-execution-primitives.AEP1',
        Name: 'AEP1: native tool-calling model emits a JSON envelope Pipeline using sanitized tool names; intermediate JSON stays server-side and final output returns cleanly',
        Fn: async (ctx) => {
            const o = await runScripted(ctx, PRIMITIVES_AGENT, 'Compute (6 * 7) * 2 via a server-side Pipeline.', [
                TextTurn(
                    JSON.stringify({
                        taskComplete: false,
                        message: 'Running server-side pipeline.',
                        nextStep: {
                            type: 'Pipeline',
                            pipeline: {
                                steps: [
                                    { tool: 'calculate_expression', with: { Expression: '6 * 7' } },
                                    { select: 'details.result' },
                                    { tool: 'Calculate Expression', with: { Expression: '{{$}} * 2' } },
                                    { select: 'details.result' },
                                ],
                            },
                        },
                    }),
                ),
                ToolCallTurn([
                    {
                        name: 'complete_task',
                        args: {
                            message: 'Pipeline returned 84.',
                            payloadChangeRequest: { newElements: { pipelineResult: 84 } },
                        },
                    },
                ]),
            ]);

            AssertEqual(o.Status, 'Completed', `AEP1: run status (error: ${o.ErrorMessage ?? 'none'})`);
            AssertEqual(o.Payload.pipelineResult, 84, 'AEP1: final payload carries 84');

            // Verify the system prompt taught the single-channel JSON bridge under native tool calling
            const sysPrompt = TextOf(o.Requests[0]?.Messages.find((m) => m.role === ChatMessageRole.system));
            Assert(
                sysPrompt.includes('emit **no native tool call** on that turn') && sysPrompt.includes('Pipeline'),
                'AEP1: implicit native system prompt teaches the single-channel JSON envelope bridge',
            );
            // Verify turn 2 received the server-side pipeline result 84
            const turn2Messages = (o.Requests[1]?.Messages ?? []).map(TextOf).join('\n');
            Assert(turn2Messages.includes('Pipeline result') && turn2Messages.includes('84'), 'AEP1: turn 2 saw Pipeline result 84');

            const steps = await loadDetailedSteps(ctx, o.RunID);
            const pipeStep = steps.find((s) => s.StepType === 'Tool' && s.StepName === 'Pipeline: 4 step(s)');
            Assert(!!pipeStep && pipeStep.Success === true, `AEP1: persisted Pipeline Tool step succeeded (steps=${JSON.stringify(steps.map((s) => [s.StepType, s.StepName, s.Success]))})`);
        },
    },
    {
        Id: 'agent-execution-primitives.AEP2',
        Name: 'AEP2: in-turn ForEach with multi-step steps[], steps.<id>.* chaining, per-step condition, outputMapping append, and sanitized tool names under native tool calling',
        Fn: async (ctx) => {
            const o = await runScripted(
                ctx,
                PRIMITIVES_AGENT,
                'Double each number and add 10 for items >= 5.',
                [
                    TextTurn(
                        JSON.stringify({
                            taskComplete: false,
                            message: 'Executing multi-step ForEach over nums.',
                            nextStep: {
                                type: 'ForEach',
                                forEach: {
                                    collectionPath: 'nums',
                                    itemVariable: 'n',
                                    executionMode: 'sequential',
                                    steps: [
                                        {
                                            id: 'double',
                                            name: 'calculate_expression',
                                            params: { Expression: '{{n}} * 2' },
                                        },
                                        {
                                            id: 'plusTen',
                                            name: 'Calculate Expression',
                                            condition: 'n >= 5',
                                            params: { Expression: '{{steps.double.details.result}} + 10' },
                                            outputMapping: '{"details.result": "bigComputed[]"}',
                                        },
                                    ],
                                },
                            },
                        }),
                    ),
                    ToolCallTurn([{ name: 'complete_task', args: { message: 'Batch complete.' } }]),
                ],
                { nums: [2, 5, 8], bigComputed: [] },
            );

            AssertEqual(o.Status, 'Completed', `AEP2: run status (error: ${o.ErrorMessage ?? 'none'})`);
            AssertEqual(
                JSON.stringify(o.Payload.bigComputed),
                JSON.stringify([20, 26]),
                'AEP2: n=2 skipped step 2; n=5 -> 20; n=8 -> 26',
            );

            const steps = await loadDetailedSteps(ctx, o.RunID);
            const forEachStep = steps.find((s) => s.StepType === 'ForEach');
            Assert(!!forEachStep && forEachStep.Success === true, 'AEP2: persisted ForEach run step succeeded');
            const childActionSteps = steps.filter((s) => s.StepType === 'Actions' && s.ParentID === forEachStep!.ID);
            AssertEqual(childActionSteps.length, 5, 'AEP2: 5 child Actions steps persisted (1 for n=2, 2 for n=5, 2 for n=8)');
            Assert(
                childActionSteps.every((s) => s.Success === true && !!s.TargetLogID),
                'AEP2: every child Actions step succeeded and linked its TargetLogID',
            );
        },
    },
    {
        Id: 'agent-execution-primitives.AEP3',
        Name: 'AEP3: in-turn While with multi-step steps[] updates loop payload across iterations under native tool calling',
        Fn: async (ctx) => {
            const o = await runScripted(
                ctx,
                PRIMITIVES_AGENT,
                'Advance counter until 3 while recording counter * 10.',
                [
                    TextTurn(
                        JSON.stringify({
                            taskComplete: false,
                            message: 'Executing multi-step While loop.',
                            nextStep: {
                                type: 'While',
                                while: {
                                    condition: 'payload.counter < 3',
                                    itemVariable: 'attempt',
                                    maxIterations: 5,
                                    steps: [
                                        {
                                            id: 'scale',
                                            name: 'calculate_expression',
                                            params: { Expression: '{{payload.counter}} * 10' },
                                            outputMapping: '{"details.result": "history[]"}',
                                        },
                                        {
                                            id: 'inc',
                                            name: 'Calculate Expression',
                                            params: { Expression: '{{payload.counter}} + 1' },
                                            outputMapping: '{"details.result": "counter"}',
                                        },
                                    ],
                                },
                            },
                        }),
                    ),
                    ToolCallTurn([{ name: 'complete_task', args: { message: 'While loop complete.' } }]),
                ],
                { counter: 1, history: [] },
            );

            AssertEqual(o.Status, 'Completed', `AEP3: run status (error: ${o.ErrorMessage ?? 'none'})`);
            AssertEqual(o.Payload.counter, 3, 'AEP3: counter advanced from 1 to 3');
            AssertEqual(JSON.stringify(o.Payload.history), JSON.stringify([10, 20]), 'AEP3: history recorded [10, 20]');

            const steps = await loadDetailedSteps(ctx, o.RunID);
            const whileStep = steps.find((s) => s.StepType === 'While');
            Assert(!!whileStep && whileStep.Success === true, 'AEP3: persisted While run step succeeded');
            const childActionSteps = steps.filter((s) => s.StepType === 'Actions' && s.ParentID === whileStep!.ID);
            AssertEqual(childActionSteps.length, 4, 'AEP3: 4 child Actions steps persisted (2 steps × 2 iterations)');
        },
    },
    {
        Id: 'agent-execution-primitives.AEP4',
        Name: 'AEP4: durable TaskGraphService.Submit + TaskGraphDispatcher executes multi-step ForEach (steps[]) and While (steps[]) against SQL Server and ActionEngineServer',
        Fn: async (ctx) => {
            const envID = await EnsureTaskTypeAndEnvironment(ctx, fx().CreatedTaskTypeIDs);
            const calcAction = ActionEngineServer.Instance.Actions.find((a) => a.Name === ACTION_NAME);
            Assert(!!calcAction, `'${ACTION_NAME}' action exists in ActionEngineServer`);

            const spec: TaskGraphSpec = {
                workflowName: 'mj-it-aep4-durable-multistep-loops (safe to delete)',
                continuation: 'none',
                tasks: [
                    {
                        tempId: 'fe',
                        name: 'AEP4 Multi-Step ForEach',
                        description: 'ForEach chaining two Calculate Expression steps per element',
                        kind: 'ForEach',
                        dependsOn: [],
                        configuration: {
                            collectionPath: 'data.values',
                            itemVariable: 'v',
                            executionMode: 'sequential',
                            steps: [
                                {
                                    id: 'triple',
                                    name: 'calculate_expression',
                                    params: { Expression: '{{v}} * 3' },
                                },
                                {
                                    id: 'plusOne',
                                    name: 'Calculate Expression',
                                    condition: 'v > 1',
                                    params: { Expression: '{{steps.triple.details.result}} + 1' },
                                    outputMapping: '{"details.result": "totals[]"}',
                                },
                            ],
                        },
                    },
                    {
                        tempId: 'wh',
                        name: 'AEP4 Multi-Step While',
                        description: 'While chaining two Calculate Expression steps until count == 2',
                        kind: 'While',
                        dependsOn: ['fe'],
                        configuration: {
                            condition: '(payload.count ?? 0) < 2',
                            itemVariable: 'attempt',
                            maxIterations: 4,
                            steps: [
                                {
                                    id: 'nextCount',
                                    name: 'calculate_expression',
                                    params: { Expression: '{{attempt}} + 1' },
                                    outputMapping: '{"details.result": "count"}',
                                },
                                {
                                    id: 'stamp',
                                    name: 'Calculate Expression',
                                    params: { Expression: '{{steps.nextCount.details.result}} * 100' },
                                    outputMapping: '{"details.result": "stamps[]"}',
                                },
                            ],
                        },
                    },
                ],
            };

            const submission = await new TaskGraphService().Submit(spec, {
                EnvironmentID: envID,
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
                Invocation: { Data: { values: [1, 4, 7] } },
            });
            Assert(submission.Success && !!submission.ParentTaskID, `AEP4: Submit succeeded (${submission.ErrorMessage ?? 'ok'})`);
            const parentID = submission.ParentTaskID!;
            fx().CreatedParentTaskIDs.push(parentID);

            const settledParent = await DriveGraphUntilSettled(ctx, parentID, 'it-aep4', fx().CreatedActionLogIDs);
            AssertEqual(settledParent.Status, 'Complete', 'AEP4: durable parent task settled Complete');

            const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
                ctx.User,
            );
            const byName = new Map((childRes.Results ?? []).map((t) => [t.Name, t]));
            const feTask = byName.get('AEP4 Multi-Step ForEach');
            const whTask = byName.get('AEP4 Multi-Step While');
            Assert(!!feTask && !!whTask, 'AEP4: both ForEach and While child tasks persisted');

            Assert(UUIDsEqual(feTask!.ActionID, calcAction!.ID), 'AEP4: ForEach task ActionID FK points to first step action');
            AssertEqual(feTask!.Status, 'Complete', 'AEP4: ForEach task status');
            const feOut = JSON.parse(feTask!.OutputPayload ?? '{}') as { totals?: number[]; results?: unknown[] };
            AssertEqual(JSON.stringify(feOut.totals), JSON.stringify([13, 22]), 'AEP4: ForEach totals [4*3+1=13, 7*3+1=22]');
            AssertEqual(feOut.results?.length, 3, 'AEP4: ForEach recorded 3 iteration results');
            const feConfig = JSON.parse(feTask!.Configuration ?? '{}') as { runtime?: { iterations?: Array<{ actionLogID?: string }> } };
            AssertEqual(feConfig.runtime?.iterations?.length, 3, 'AEP4: ForEach runtime recorded 3 iteration entries');

            Assert(UUIDsEqual(whTask!.ActionID, calcAction!.ID), 'AEP4: While task ActionID FK points to first step action');
            AssertEqual(whTask!.Status, 'Complete', 'AEP4: While task status');
            const whOut = JSON.parse(whTask!.OutputPayload ?? '{}') as { count?: number; stamps?: number[] };
            AssertEqual(whOut.count, 2, 'AEP4: While converged at count === 2');
            AssertEqual(JSON.stringify(whOut.stamps), JSON.stringify([100, 200]), 'AEP4: While stamps [100, 200]');
        },
    },
    {
        Id: 'agent-execution-primitives.AEP5',
        Name: 'AEP5: native tool-calling agent emits nextStep.type = Tasks -> parks run in Paused -> TaskGraphDispatcher runs multi-step ForEach + XOR exclusiveGroup Action fork and settles run to Completed',
        Fn: async (ctx) => {
            await EnsureTaskTypeAndEnvironment(ctx, fx().CreatedTaskTypeIDs);

            const graphSpec: TaskGraphSpec = {
                workflowName: 'mj-it-aep5-agent-submitted-graph (safe to delete)',
                continuation: 'none',
                tasks: [
                    {
                        tempId: 'batch',
                        name: 'AEP5 Batch Compute',
                        description: 'Multi-step ForEach computing 2x + 3 for [5, 10]',
                        kind: 'ForEach',
                        dependsOn: [],
                        configuration: {
                            collectionPath: 'data.seed',
                            itemVariable: 'x',
                            steps: [
                                { id: 'dbl', name: 'calculate_expression', params: { Expression: '{{x}} * 2' } },
                                {
                                    id: 'add3',
                                    name: 'Calculate Expression',
                                    params: { Expression: '{{steps.dbl.details.result}} + 3' },
                                    outputMapping: '{"details.result": "computed[]"}',
                                },
                            ],
                        },
                    },
                    {
                        tempId: 'finalize',
                        name: 'AEP5 Final Sum',
                        description: 'Winning high-priority XOR branch when output.iterations === 2',
                        kind: 'Action',
                        dependsOn: [
                            {
                                tempId: 'batch',
                                condition: 'output.iterations === 2',
                                exclusiveGroup: 'route',
                                priority: 10,
                            },
                        ],
                        configuration: {
                            actionName: 'calculate_expression',
                            outputMapping: '{"details.result": "grandTotal"}',
                        },
                        inputPayload: { Expression: '13 + 23' },
                    },
                    {
                        tempId: 'fallback',
                        name: 'AEP5 Fallback Route',
                        description: 'Lower-priority XOR sibling that must settle Skipped',
                        kind: 'Action',
                        dependsOn: [
                            {
                                tempId: 'batch',
                                condition: 'true',
                                exclusiveGroup: 'route',
                                priority: 0,
                            },
                        ],
                        configuration: {
                            actionName: 'calculate_expression',
                            outputMapping: '{"details.result": "grandTotal"}',
                        },
                        inputPayload: { Expression: '0' },
                    },
                ],
            };

            const agent = AIEngine.Instance.Agents.find((a) => a.Name === WORKFLOW_AGENT);
            Assert(!!agent, `Fixture agent '${WORKFLOW_AGENT}' is loaded in AIEngine`);
            ResetScript([
                TextTurn(
                    JSON.stringify({
                        taskComplete: false,
                        message: 'Launching durable workflow.',
                        nextStep: {
                            type: 'Tasks',
                            tasks: graphSpec,
                        },
                    }),
                ),
            ]);

            const result = await new AgentRunner().RunAgent({
                agent: agent!,
                conversationMessages: [{ role: ChatMessageRole.user, content: 'Run the durable batch workflow.' }],
                contextUser: ctx.User,
                override: { modelId: fx().ModelID, vendorId: fx().VendorID },
                data: { seed: [5, 10] },
            });
            const runID = result.agentRun?.ID;
            Assert(!!runID, 'AEP5: AgentRunner recorded an MJ: AI Agent Runs row');
            fx().RunIds.push(runID!);

            await WaitUntil(
                async () => (await loadDetailedSteps(ctx, runID!)).some((s) => s.StepType === 'TaskGraph'),
                'AEP5: TaskGraph step row to land',
                { TimeoutMs: AGENT_LIVE_SETTLE_MS * 2, PollMs: 100, StableReads: 2 },
            );

            // Immediately after submission, the agent run must be parked in Paused with CompletedAt === null
            const parkedRun = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            Assert(await parkedRun.Load(runID!), 'AEP5: load parked MJ: AI Agent Runs row');
            AssertEqual(parkedRun.Status, 'Paused', 'AEP5: submitting agent run parks in Paused while workflow is in flight');
            AssertEqual(parkedRun.CompletedAt, null, 'AEP5: parked agent run has CompletedAt === null');

            const steps = await loadDetailedSteps(ctx, runID!);
            const tgStep = steps.find((s) => s.StepType === 'TaskGraph');
            Assert(!!tgStep && tgStep.Success === true, 'AEP5: TaskGraph step persisted with Success === true');
            const tgOutput = JSON.parse(tgStep!.OutputData ?? '{}') as { submitted?: boolean; parentTaskID?: string };
            Assert(tgOutput.submitted === true && !!tgOutput.parentTaskID, 'AEP5: TaskGraph step recorded parentTaskID');
            const parentID = tgOutput.parentTaskID!;
            fx().CreatedParentTaskIDs.push(parentID);

            // Drive TaskGraphDispatcher to settle the graph AND transition the parked agent run to Completed
            const settledParent = await DriveGraphUntilSettled(ctx, parentID, 'it-aep5', fx().CreatedActionLogIDs);
            AssertEqual(settledParent.Status, 'Complete', 'AEP5: durable workflow settled Complete');

            await WaitUntil(
                async () => {
                    const r = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
                    return (await r.Load(runID!)) && r.Status === 'Completed' && r.CompletedAt != null;
                },
                'AEP5: TaskGraphDispatcher.settleSubmittingRun transitions parked run to Completed',
                { TimeoutMs: 10_000, PollMs: 150 },
            );

            const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
                ctx.User,
            );
            const byName = new Map((childRes.Results ?? []).map((t) => [t.Name, t]));
            const batchOut = JSON.parse(byName.get('AEP5 Batch Compute')?.OutputPayload ?? '{}') as { computed?: number[] };
            const finalOut = JSON.parse(byName.get('AEP5 Final Sum')?.OutputPayload ?? '{}') as { grandTotal?: number };
            AssertEqual(JSON.stringify(batchOut.computed), JSON.stringify([13, 23]), 'AEP5: ForEach node produced [13, 23]');
            AssertEqual(finalOut.grandTotal, 36, 'AEP5: winning XOR Action node produced grandTotal === 36');
            AssertEqual(byName.get('AEP5 Fallback Route')?.Status, 'Skipped', 'AEP5: losing XOR sibling settled Skipped');
        },
    },
    {
        Id: 'agent-execution-primitives.AEP6',
        Name: 'AEP6: Flow graduation round-trip (ConvertTaskGraphToAgentSpec -> CompileFlowToTaskGraph -> TaskGraphService.Submit) preserves multi-step ForEach and While steps[]',
        Fn: async (ctx) => {
            const envID = await EnsureTaskTypeAndEnvironment(ctx, fx().CreatedTaskTypeIDs);
            const calcAction = ActionEngineServer.Instance.Actions.find((a) => a.Name === ACTION_NAME);
            Assert(!!calcAction, `'${ACTION_NAME}' action exists`);

            const original: TaskGraphSpec = {
                workflowName: 'mj-it-aep6-flow-roundtrip (safe to delete)',
                continuation: 'none',
                tasks: [
                    {
                        tempId: 'step_fe',
                        name: 'AEP6 Graduated ForEach',
                        description: 'Multi-step ForEach graduated to Flow and compiled back',
                        kind: 'ForEach',
                        dependsOn: [],
                        configuration: {
                            collectionPath: 'data.items',
                            itemVariable: 'it',
                            steps: [
                                { id: 's1', name: ACTION_NAME, params: { Expression: '{{it}} + 1' } },
                                {
                                    id: 's2',
                                    name: ACTION_NAME,
                                    params: { Expression: '{{steps.s1.details.result}} * 5' },
                                    outputMapping: '{"details.result": "resultsOut[]"}',
                                },
                            ],
                        },
                    },
                    {
                        tempId: 'step_wh',
                        name: 'AEP6 Graduated While',
                        description: 'Multi-step While graduated to Flow and compiled back',
                        kind: 'While',
                        dependsOn: ['step_fe'],
                        configuration: {
                            condition: '(payload.iter ?? 0) < 1',
                            itemVariable: 'attempt',
                            maxIterations: 2,
                            steps: [
                                {
                                    id: 'w1',
                                    name: ACTION_NAME,
                                    params: { Expression: '1' },
                                    outputMapping: '{"details.result": "iter"}',
                                },
                            ],
                        },
                    },
                ],
            };

            let seq = 0;
            const conversion = ConvertTaskGraphToAgentSpec(original, {
                AgentID: '00000000-0000-0000-0000-000000000001',
                ResolveAgentID: () => null,
                ResolveActionID: (name) => (name === ACTION_NAME ? calcAction!.ID : null),
                NextID: () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`,
            });
            AssertEqual(conversion.Success, true, 'AEP6: ConvertTaskGraphToAgentSpec succeeded');
            Assert(!!conversion.Spec, 'AEP6: ConvertTaskGraphToAgentSpec produced an AgentSpec');
            const agentSpec = conversion.Spec!;
            AssertEqual((agentSpec.Steps ?? []).length, 2, 'AEP6: 2 Flow steps emitted');

            const stringifyOrNull = (val: string | Record<string, unknown> | null | undefined): string | null =>
                val == null ? null : typeof val === 'string' ? val : JSON.stringify(val);

            const compilerSteps: FlowCompilerStep[] = (agentSpec.Steps ?? []).map((s) => ({
                ID: s.ID,
                Name: s.Name,
                Description: s.Description ?? null,
                StepType: s.StepType,
                StartingStep: s.StartingStep,
                Status: 'Active',
                ActionID: s.ActionID ?? null,
                SubAgentID: s.SubAgentID ?? null,
                PromptID: s.PromptID ?? null,
                LoopBodyType: s.LoopBodyType ?? null,
                Configuration: stringifyOrNull(s.Configuration),
                ActionInputMapping: stringifyOrNull(s.ActionInputMapping),
                ActionOutputMapping: stringifyOrNull(s.ActionOutputMapping),
            }));
            const compilerPaths: FlowCompilerPath[] = (agentSpec.Paths ?? []).map((p) => ({
                ID: p.ID,
                OriginStepID: p.OriginStepID,
                DestinationStepID: p.DestinationStepID,
                Condition: p.Condition ?? null,
                Priority: p.Priority,
            }));

            const compiled = CompileFlowToTaskGraph(compilerSteps, compilerPaths, {
                WorkflowName: original.workflowName,
                ResolveAgentName: () => null,
                ResolveActionName: (id) => (UUIDsEqual(id, calcAction!.ID) ? ACTION_NAME : null),
                ResolvePromptName: () => null,
            });
            AssertEqual(compiled.Success, true, `AEP6: CompileFlowToTaskGraph succeeded (${compiled.Errors.map((e) => e.Message).join('; ')})`);
            Assert(!!compiled.Spec, 'AEP6: compiled TaskGraphSpec is present');

            const sub = await new TaskGraphService().Submit(compiled.Spec!, {
                EnvironmentID: envID,
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
                Invocation: { Data: { items: [3, 6] } },
            });
            Assert(sub.Success && !!sub.ParentTaskID, `AEP6: recompiled spec submitted cleanly (${sub.ErrorMessage ?? 'ok'})`);
            fx().CreatedParentTaskIDs.push(sub.ParentTaskID!);

            const settled = await DriveGraphUntilSettled(ctx, sub.ParentTaskID!, 'it-aep6', fx().CreatedActionLogIDs);
            AssertEqual(settled.Status, 'Complete', 'AEP6: recompiled Flow task graph settled Complete');

            const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${sub.ParentTaskID}'`, ResultType: 'entity_object', BypassCache: true },
                ctx.User,
            );
            const feTask = (childRes.Results ?? []).find((t) => t.Name === 'AEP6 Graduated ForEach');
            const feOut = JSON.parse(feTask?.OutputPayload ?? '{}') as { resultsOut?: number[] };
            AssertEqual(JSON.stringify(feOut.resultsOut), JSON.stringify([20, 35]), 'AEP6: graduated ForEach produced [(3+1)*5=20, (6+1)*5=35]');
        },
    },
];

for (const check of AgentExecutionPrimitivesChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-execution-primitives', { Setup: setup, Teardown: teardown });
