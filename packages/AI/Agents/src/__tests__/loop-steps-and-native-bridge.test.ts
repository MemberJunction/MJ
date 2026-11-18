/**
 * Unit tests for:
 * 1. Multi-step `steps[]` loop bodies (`ForEachOperation.steps` and `WhileOperation.steps`) in `BaseAgent`
 *    — sequential & parallel `ForEach`, `While`, `{{steps.<id>.*}}` chaining, `step.condition`,
 *    `step.outputMapping` (`[]` append), step failure halting, and body validation.
 * 2. Native tool-calling JSON envelope bridge in `LoopAgentType.DetermineNextStep` — `Pipeline`,
 *    `ForEach` (`steps[]`), `While` (`steps[]`), and `Tasks` dispatched via JSON envelope on
 *    `Native` (hybrid) and `NativeImplicit` turns when 0 native tool calls are emitted.
 * 3. Sanitized native tool-name normalization (`calculate_expression` -> `"Calculate Expression"`,
 *    `delegate_to_query_builder` -> `"Query Builder"`) across `PipelineToolRegistry`,
 *    `validateActionsNextStep`, `validateForEachOperation` / `executeForEachLoop`,
 *    `validateSubAgentNextStep` / `validateSubAgentInAgent`, and `validateTasksNextStep`.
 * 4. `BaseAgent.resolveValueFromContext` multi-placeholder fix (`"{{user.first}} {{user.last}}"`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentType } from '../agent-types/base-agent-type';
import { FlowAgentType, FlowExecutionState } from '../agent-types/flow-agent-type';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { PipelineToolRegistry } from '../pipeline/pipeline-registry';
import { StructureActionResult } from '../pipeline/providers/serialize';
import type { PipelineInvocable } from '../pipeline/pipeline.types';
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import { MJGlobal } from '@memberjunction/global';
import type { ChatResult } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import {
    ConvertTaskGraphToAgentSpec,
    TaskGraphSubmitter,
    TASK_GRAPH_SUBMITTER_KEY,
    TaskNode,
    type AgentConfiguration,
    type AgentAction,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ForEachOperation,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type TaskGraphSpec,
    type TaskGraphSubmitOutcome,
    type TaskGraphSubmitRequest,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';

const PARENT_AGENT_ID = '11111111-1111-4111-8111-111111111111';
const QUERY_BUILDER_AGENT_ID = '22222222-2222-4222-8222-222222222222';
const CALC_ACTION_ID = '33333333-3333-4333-8333-333333333333';
const FORMAT_ACTION_ID = '44444444-4444-4444-8444-444444444444';
const FAIL_ACTION_ID = '55555555-5555-4555-8555-555555555555';

const MOCK_ACTIONS: Array<Pick<MJActionEntityExtended, 'ID' | 'Name' | 'Status'>> = [
    { ID: CALC_ACTION_ID, Name: 'Calculate Expression', Status: 'Active' },
    { ID: FORMAT_ACTION_ID, Name: 'Format Currency', Status: 'Active' },
    { ID: FAIL_ACTION_ID, Name: 'Explode Step', Status: 'Active' },
];

const MOCK_SUB_AGENTS: Array<Pick<MJAIAgentEntityExtended, 'ID' | 'Name' | 'ParentID' | 'Status' | 'MaxExecutionsPerRun'>> = [
    {
        ID: QUERY_BUILDER_AGENT_ID,
        Name: 'Query Builder',
        ParentID: null,
        Status: 'Active',
        MaxExecutionsPerRun: null,
    },
];

const MOCK_RELATIONSHIPS = [
    {
        ID: '66666666-6666-4666-8666-666666666666',
        AgentID: PARENT_AGENT_ID,
        SubAgentID: QUERY_BUILDER_AGENT_ID,
        SubAgent: 'Query Builder',
        Status: 'Active',
    },
];

let mockFlowSteps: MJAIAgentStepEntity[] = [];
let mockFlowPaths: MJAIAgentStepPathEntity[] = [];

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Agents: MOCK_SUB_AGENTS,
                AgentRelationships: MOCK_RELATIONSHIPS,
                AgentActions: [],
                Prompts: [],
                GetAgentSteps: (agentId: string, status?: string) =>
                    mockFlowSteps.filter((s) => s.AgentID === agentId && (!status || s.Status === status)),
                GetAgentStepByID: (id: string) => mockFlowSteps.find((s) => s.ID === id) ?? null,
                GetPathsFromStep: (id: string) => mockFlowPaths.filter((p) => p.OriginStepID === id),
            };
        },
    },
}));

vi.mock('@memberjunction/actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/actions')>();
    return {
        ...actual,
        ActionEngineServer: {
            get Instance() {
                return {
                    Actions: MOCK_ACTIONS,
                };
            },
        },
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: vi.fn(async () => true),
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogErrorEx: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

interface RecordedStep {
    ID: string;
    StepType: string;
    StepName: string;
    ParentID: string | null;
    Status: string;
    TargetLogID: string | null;
    StepNumber: number;
    PayloadAtStart: string | null;
    PayloadAtEnd: string | null;
    PayloadAtEndSourceStepID: string | null;
    ErrorMessage: string | null;
    OutputData: string | null;
    Save: () => Promise<boolean>;
}

type ResolvedTemplateValue = string | number | boolean | Record<string, string | number | boolean | null> | null | undefined;

class TestableBaseAgent extends BaseAgent {
    public readonly CreatedSteps: RecordedStep[] = [];
    public readonly ActionCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
    private stepCounter = 0;
    private readonly testAgentType: BaseAgentType;
    private readonly testRun: MJAIAgentRunEntityExtended;
    private testAgentTypeState: FlowExecutionState | null = null;

    public constructor(
        private readonly effectiveActions: MJActionEntityExtended[],
        private readonly effectiveSubAgents: MJAIAgentEntityExtended[],
        private readonly actionHandler?: (name: string, params: Record<string, unknown>) => Promise<ActionResult>,
        agentTypeInstance: BaseAgentType = new LoopAgentType()
    ) {
        super();
        this.testAgentType = agentTypeInstance;
        const runStub: Pick<MJAIAgentRunEntityExtended, 'ID' | 'AgentID' | 'Steps'> = {
            ID: 'run-1',
            AgentID: PARENT_AGENT_ID,
            Steps: [],
        };
        this.testRun = runStub as MJAIAgentRunEntityExtended;
    }

    public override get AgentTypeInstance(): BaseAgentType {
        return this.testAgentType;
    }

    public override get AgentRun(): MJAIAgentRunEntityExtended | null {
        return this.testRun;
    }

    protected override get AgentTypeState(): FlowExecutionState | null {
        return this.testAgentTypeState;
    }

    public SetAgentTypeState(state: FlowExecutionState | null): void {
        this.testAgentTypeState = state;
    }

    private makeAgentConfig(): AgentConfiguration {
        const cfg: Pick<AgentConfiguration, 'agentType'> = {
            agentType: { Name: this.testAgentType instanceof FlowAgentType ? 'Flow' : 'Loop' } as AgentConfiguration['agentType'],
        };
        return cfg as AgentConfiguration;
    }

    protected override getEffectiveActionsForValidation(_agentId: string): MJActionEntityExtended[] {
        return this.effectiveActions;
    }

    protected override getEffectiveSubAgentsForValidation(_agentId: string): MJAIAgentEntityExtended[] {
        return this.effectiveSubAgents;
    }

    protected override async createStepEntity(stepParams: {
        stepType: MJAIAgentRunStepEntityExtended['StepType'];
        stepName: string;
        contextUser?: UserInfo;
        targetId?: string;
        inputData?: object;
        payloadAtStart?: object;
        payloadAtEnd?: object;
        parentId?: string;
        completed?: { success: boolean; errorMessage?: string; outputData?: object };
    }): Promise<MJAIAgentRunStepEntityExtended> {
        const rec: RecordedStep = {
            ID: `step-${++this.stepCounter}`,
            StepType: stepParams.stepType,
            StepName: stepParams.stepName,
            ParentID: stepParams.parentId ?? null,
            Status: stepParams.completed ? (stepParams.completed.success ? 'Success' : 'Failed') : 'Running',
            TargetLogID: null,
            StepNumber: this.stepCounter,
            PayloadAtStart: stepParams.payloadAtStart ? JSON.stringify(stepParams.payloadAtStart) : null,
            PayloadAtEnd: stepParams.payloadAtEnd ? JSON.stringify(stepParams.payloadAtEnd) : null,
            PayloadAtEndSourceStepID: null,
            ErrorMessage: stepParams.completed?.errorMessage ?? null,
            OutputData: stepParams.completed?.outputData ? JSON.stringify(stepParams.completed.outputData) : null,
            Save: async () => true,
        };
        this.CreatedSteps.push(rec);
        return rec as MJAIAgentRunStepEntityExtended;
    }

    protected override async finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: object
    ): Promise<void> {
        stepEntity.Status = success ? 'Success' : 'Failed';
        if (errorMessage) {
            stepEntity.ErrorMessage = errorMessage;
        }
        if (outputData) {
            stepEntity.OutputData = JSON.stringify(outputData);
        }
    }

    public override async ExecuteSingleAction(
        _params: ExecuteAgentParams,
        action: AgentAction,
        _actionEntity: MJActionEntityExtended
    ): Promise<ActionResult> {
        this.ActionCalls.push({ name: action.name, params: { ...(action.params ?? {}) } });
        if (this.actionHandler) {
            return this.actionHandler(action.name, action.params ?? {});
        }
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: 'OK',
            Params: [],
        };
    }

    public RunStep<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P> | null): Promise<BaseAgentNextStep<P>> {
        return this.executeNextStep(params, this.makeAgentConfig(), decision);
    }

    public RunForEach(params: ExecuteAgentParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this.executeNextStep(params, this.makeAgentConfig(), decision);
    }

    public RunWhile(params: ExecuteAgentParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this.executeNextStep(params, this.makeAgentConfig(), decision);
    }

    public ValidateActions<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
        return this.validateActionsNextStep(
            params,
            nextStep,
            {} as P,
            this.testRun,
            {} as MJAIAgentRunStepEntityExtended
        );
    }

    public ValidateSubAgents<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
        return this.validateSubAgentNextStep(
            params,
            nextStep,
            {} as P,
            this.testRun,
            {} as MJAIAgentRunStepEntityExtended
        );
    }

    public ValidateTasks<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
        return this.validateTasksNextStep(
            params,
            nextStep,
            {} as P,
            this.testRun,
            {} as MJAIAgentRunStepEntityExtended
        );
    }

    public CheckActionInAgent(name: string): string | null {
        return this.validateActionInAgent(name, PARENT_AGENT_ID);
    }

    public CheckSubAgentInAgent(name: string): string | null {
        return this.validateSubAgentInAgent(name, PARENT_AGENT_ID);
    }

    public ResolveTemplateValue(value: string, context: Record<string, unknown>, itemVariable: string): ResolvedTemplateValue {
        return this.resolveValueFromContext(value, context, itemVariable) as ResolvedTemplateValue;
    }
}

function makeExecuteParams(payload: Record<string, unknown> = {}): ExecuteAgentParams {
    const agentStub: Pick<MJAIAgentEntityExtended, 'ID' | 'Name' | 'PayloadSelfWritePaths'> = {
        ID: PARENT_AGENT_ID,
        Name: 'Parent Test Agent',
        PayloadSelfWritePaths: null,
    };
    const userStub: Pick<UserInfo, 'ID' | 'Name'> = {
        ID: 'user-1',
        Name: 'Test User',
    };
    return {
        agent: agentStub as MJAIAgentEntityExtended,
        conversationMessages: [],
        payload,
        contextUser: userStub as UserInfo,
        data: { __agentTypePromptParams: { enableTaskGraphs: true } },
    };
}

function evalSimpleMath(exprRaw: unknown): number {
    const expr = String(exprRaw ?? '').trim();
    const mulMatch = expr.match(/^(-?\d+(?:\.\d+)?)\s*\*\s*(-?\d+(?:\.\d+)?)$/);
    if (mulMatch) {
        return Number(mulMatch[1]) * Number(mulMatch[2]);
    }
    const addMatch = expr.match(/^(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)$/);
    if (addMatch) {
        return Number(addMatch[1]) + Number(addMatch[2]);
    }
    throw new Error(`Unsupported test math expression: "${expr}"`);
}

describe('PipelineToolRegistry — native tool-name normalization', () => {
    const makeInvocable = (toolName: string): PipelineInvocable => ({
        toolName,
        providerKind: 'action',
        description: toolName,
        invoke: async (args) => args,
    });

    it('resolves both canonical MJ Action names and sanitized native tool names', () => {
        const registry = new PipelineToolRegistry();
        registry.Register(makeInvocable('Calculate Expression'));
        registry.Register(makeInvocable('Web Search'));

        expect(registry.Resolve('Calculate Expression')?.toolName).toBe('Calculate Expression');
        expect(registry.Resolve('calculate expression')?.toolName).toBe('Calculate Expression');
        expect(registry.Resolve('calculate_expression')?.toolName).toBe('Calculate Expression');
        expect(registry.Resolve('web_search')?.toolName).toBe('Web Search');
        expect(registry.Resolve('nonexistent_action')).toBeUndefined();
    });

    it('returns undefined when two distinct registered tools collide on the same sanitized tool name', () => {
        const registry = new PipelineToolRegistry();
        registry.Register(makeInvocable('Foo-Bar'));
        registry.Register(makeInvocable('Foo_Bar'));

        expect(registry.Resolve('Foo-Bar')?.toolName).toBe('Foo-Bar');
        expect(registry.Resolve('foo bar')).toBeUndefined();
    });
});

describe('LoopAgentType.DetermineNextStep — JSON envelope bridge under Native & NativeImplicit modes', () => {
    const nativeTurnPromptResult = (
        envelope: Record<string, unknown>,
        mode: 'Native' | 'NativeImplicit'
    ): AIPromptRunResult => {
        const rawJson = JSON.stringify(envelope);
        const chatResult: Pick<ChatResult, 'success' | 'data'> = {
            success: true,
            data: {
                choices: [
                    {
                        message: { role: 'assistant', content: rawJson, toolCalls: [] },
                        finish_reason: 'stop',
                        index: 0,
                    },
                ],
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            },
        };
        RecordToolCallingDecision(chatResult as ChatResult, {
            useNativeTools: true,
            mode,
            controlFlow: mode === 'NativeImplicit' ? 'implicit' : 'envelope',
            toolResults: true,
        });
        return {
            success: true,
            result: rawJson,
            rawResult: rawJson,
            chatResult: chatResult as ChatResult,
        };
    };

    it.each(['Native', 'NativeImplicit'] as const)(
        'dispatches Pipeline, multi-step ForEach, multi-step While, and Tasks via JSON envelope on %s turns with 0 tool calls',
        async (mode) => {
            const loopType = new LoopAgentType();
            const params = makeExecuteParams();

            // 1. Pipeline
            const pipelineStep = await loopType.DetermineNextStep(
                nativeTurnPromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Run pipeline inline',
                        nextStep: {
                            type: 'Pipeline',
                            pipeline: {
                                steps: [
                                    { tool: 'calculate_expression', args: { Expression: '6 * 7' } },
                                ],
                            },
                        },
                    },
                    mode
                ),
                params,
                {}
            );
            expect(pipelineStep.step).toBe('Retry');
            expect(pipelineStep.pipeline?.steps).toHaveLength(1);

            // 2. Multi-step ForEach
            const forEachStep = await loopType.DetermineNextStep(
                nativeTurnPromptResult(
                    {
                        taskComplete: false,
                        nextStep: {
                            type: 'ForEach',
                            forEach: {
                                collectionPath: 'items',
                                itemVariable: 'item',
                                steps: [
                                    { id: 's1', name: 'calculate_expression', params: { Expression: '{{item.x}} * 2' } },
                                    { id: 's2', name: 'calculate_expression', params: { Expression: '{{steps.s1.Result}} + 1' } },
                                ],
                            },
                        },
                    },
                    mode
                ),
                params,
                {}
            );
            expect(forEachStep.step).toBe('ForEach');
            expect(forEachStep.forEach?.steps).toHaveLength(2);

            // 3. Multi-step While
            const whileStep = await loopType.DetermineNextStep(
                nativeTurnPromptResult(
                    {
                        taskComplete: false,
                        nextStep: {
                            type: 'While',
                            while: {
                                condition: 'payload.n < 4',
                                itemVariable: 'attempt',
                                steps: [{ id: 'inc', name: 'calculate_expression', params: { Expression: '{{payload.n}} + 1' } }],
                            },
                        },
                    },
                    mode
                ),
                params,
                {}
            );
            expect(whileStep.step).toBe('While');
            expect(whileStep.while?.steps).toHaveLength(1);

            // 4. Durable Tasks graph
            const tasksSpec: TaskGraphSpec = {
                workflowName: 'Native Mode DAG',
                tasks: [
                    {
                        tempId: 'calc',
                        name: 'Calculate',
                        description: 'Compute initial value',
                        kind: 'Action',
                        configuration: { actionName: 'calculate_expression' },
                        dependsOn: [],
                    },
                    {
                        tempId: 'summarize',
                        name: 'Summarize',
                        description: 'Summarize result',
                        kind: 'Agent',
                        configuration: { agentName: 'delegate_to_query_builder' },
                        dependsOn: ['calc'],
                    },
                ],
            };
            const tasksStep = await loopType.DetermineNextStep(
                nativeTurnPromptResult(
                    {
                        taskComplete: false,
                        nextStep: {
                            type: 'Tasks',
                            tasks: tasksSpec,
                        },
                    },
                    mode
                ),
                params,
                {}
            );
            expect(tasksStep.step).toBe('Tasks');
            expect(tasksStep.taskGraph?.spec.tasks).toHaveLength(2);
        }
    );
});

describe('BaseAgent — multi-step ForEach and While (`steps[]`) & native tool-name normalization', () => {
    let actions: MJActionEntityExtended[];
    let subAgents: MJAIAgentEntityExtended[];

    beforeEach(() => {
        mockFlowSteps = [];
        mockFlowPaths = [];
        actions = MOCK_ACTIONS.map((a) => ({ ...a }) as MJActionEntityExtended);
        subAgents = MOCK_SUB_AGENTS.map((a) => ({ ...a }) as MJAIAgentEntityExtended);
    });

    it.each(['sequential', 'parallel'] as const)(
        'executes multi-step ForEach (%s) chaining steps.<id>.*, evaluating step.condition, persisting child Actions steps, and folding outputMapping in index order',
        async (executionMode) => {
            const agent = new TestableBaseAgent(actions, subAgents, async (name, stepParams) => {
                // Reverse delay in parallel mode so higher indices finish first, proving index-order fold replay!
                if (executionMode === 'parallel') {
                    const expr = String(stepParams['Expression'] ?? '');
                    const delay = expr.startsWith('2') ? 25 : expr.startsWith('10') ? 10 : 1;
                    await new Promise((r) => setTimeout(r, delay));
                }
                if (name === 'Calculate Expression') {
                    const val = evalSimpleMath(stepParams['Expression']);
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Message: 'Calculated',
                        LogEntry: { ID: `log-${val}` } as ActionResult['LogEntry'],
                        Params: [{ Name: 'Result', Value: val, Type: 'Output' }],
                    };
                }
                return { Success: false, ResultCode: 'ERR', Message: 'Unknown', Params: [] };
            });

            const initialPayload = {
                lineItems: [
                    { qty: 2, price: 3 },   // subtotal = 6  (<= 10 -> step 2 skipped!)
                    { qty: 10, price: 2 },  // subtotal = 20 (> 10  -> step 2 runs: 20 + 5 = 25)
                    { qty: 15, price: 2 },  // subtotal = 30 (> 10  -> step 2 runs: 30 + 5 = 35)
                ],
            };
            const params = makeExecuteParams(initialPayload);
            const forEach: ForEachOperation = {
                collectionPath: 'lineItems',
                itemVariable: 'line',
                executionMode,
                maxConcurrency: 3,
                steps: [
                    {
                        id: 'subtotal',
                        // Intentionally use sanitized native tool name to verify end-to-end normalization!
                        name: 'calculate_expression',
                        params: { Expression: '{{line.qty}} * {{line.price}}' },
                        outputMapping: '{"Result": "subtotals[]"}',
                    },
                    {
                        id: 'withFee',
                        name: 'Calculate Expression',
                        condition: 'steps.subtotal.Result > 10',
                        params: { Expression: '{{steps.subtotal.Result}} + 5' },
                        outputMapping: '{"Result": "largeTotals[]"}',
                    },
                ],
            };

            const next = await agent.RunForEach(params, {
                step: 'ForEach',
                terminate: false,
                forEach,
                previousPayload: initialPayload,
                newPayload: initialPayload,
            });

            expect(next.step).toBe('Retry');
            const finalPayload = next.newPayload as { subtotals?: number[]; largeTotals?: number[] };
            expect(finalPayload.subtotals).toEqual([6, 20, 30]);
            expect(finalPayload.largeTotals).toEqual([25, 35]);

            // Parent ForEach step + 5 executed child Actions steps (3 subtotals + 2 conditional withFee steps)
            const forEachSteps = agent.CreatedSteps.filter((s) => s.StepType === 'ForEach');
            const childActionSteps = agent.CreatedSteps.filter((s) => s.StepType === 'Actions');
            expect(forEachSteps).toHaveLength(1);
            expect(forEachSteps[0].Status).toBe('Success');
            expect(childActionSteps).toHaveLength(5);
            for (const child of childActionSteps) {
                expect(child.ParentID).toBe(forEachSteps[0].ID);
                expect(child.TargetLogID).toMatch(/^log-/);
            }
        }
    );

    it('halts remaining steps in an iteration when an earlier step fails and respects continueOnError', async () => {
        const agent = new TestableBaseAgent(actions, subAgents, async (name, stepParams) => {
            if (name === 'Explode Step' && stepParams['n'] === 2) {
                return { Success: false, ResultCode: 'BOOM', Message: 'Item 2 exploded', Params: [] };
            }
            if (name === 'Explode Step') {
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: 'OK',
                    Params: [{ Name: 'Value', Value: stepParams['n'], Type: 'Output' }],
                };
            }
            const val = evalSimpleMath(stepParams['Expression']);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'OK',
                Params: [{ Name: 'Result', Value: val, Type: 'Output' }],
            };
        });

        const initialPayload = { nums: [1, 2, 3] };
        const params = makeExecuteParams(initialPayload);
        const next = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: initialPayload,
            newPayload: initialPayload,
            forEach: {
                collectionPath: 'nums',
                itemVariable: 'n',
                continueOnError: true,
                steps: [
                    { id: 'check', name: 'Explode Step', params: { n: 'n' } },
                    {
                        id: 'double',
                        name: 'Calculate Expression',
                        params: { Expression: '{{steps.check.Value}} * 2' },
                        outputMapping: '{"Result": "doubled[]"}',
                    },
                ],
            },
        });

        expect(next.step).toBe('Retry');
        // Item 2 failed at step 1 ('check'), so step 2 ('double') NEVER ran for item 2, while items 1 and 3 succeeded!
        expect((next.newPayload as { doubled?: number[] }).doubled).toEqual([2, 6]);
        expect(agent.ActionCalls.filter((c) => c.name === 'Calculate Expression')).toHaveLength(2);
    });

    it('executes multi-step While (`steps[]`) updating payload across iterations until condition turns false', async () => {
        const agent = new TestableBaseAgent(actions, subAgents, async (_name, stepParams) => {
            const val = evalSimpleMath(stepParams['Expression']);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'OK',
                Params: [{ Name: 'Result', Value: val, Type: 'Output' }],
            };
        });

        const initialPayload = { count: 1 };
        const params = makeExecuteParams(initialPayload);
        const whileOp: WhileOperation = {
            condition: 'payload.count < 10',
            itemVariable: 'attempt',
            maxIterations: 5,
            steps: [
                {
                    id: 'double',
                    name: 'calculate_expression',
                    params: { Expression: '{{payload.count}} * 2' },
                },
                {
                    id: 'plusOne',
                    name: 'calculate_expression',
                    params: { Expression: '{{steps.double.Result}} + 1' },
                    outputMapping: '{"Result": "count"}',
                },
            ],
        };

        // Pass 1: 1 -> double=2 -> plusOne=3 (count=3 < 10)
        // Pass 2: 3 -> double=6 -> plusOne=7 (count=7 < 10)
        // Pass 3: 7 -> double=14 -> plusOne=15 (count=15 >= 10 -> loop exits!)
        const next = await agent.RunWhile(params, {
            step: 'While',
            terminate: false,
            while: whileOp,
            previousPayload: initialPayload,
            newPayload: initialPayload,
        });

        expect(next.step).toBe('Retry');
        expect((next.newPayload as { count: number }).count).toBe(15);
        expect(agent.ActionCalls).toHaveLength(6);
    });

    it('folds single-arm action.outputMapping into payload for both parallel ForEach and While under LoopAgentType', async () => {
        const agent = new TestableBaseAgent(actions, subAgents, async (_name, stepParams) => {
            const expr = String(stepParams['Expression'] ?? '');
            if (expr.startsWith('1 ')) {
                await new Promise((r) => setTimeout(r, 20));
            }
            const val = evalSimpleMath(expr);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'OK',
                Params: [{ Name: 'Result', Value: val, Type: 'Both' }],
            };
        });

        const fePayload = { nums: [1, 2, 3], count: 1 };
        const feNext = await agent.RunForEach(makeExecuteParams(fePayload), {
            step: 'ForEach',
            terminate: false,
            previousPayload: fePayload,
            newPayload: fePayload,
            forEach: {
                collectionPath: 'nums',
                itemVariable: 'n',
                executionMode: 'parallel',
                maxConcurrency: 3,
                action: {
                    name: 'calculate_expression',
                    params: { Expression: '{{n}} * 10' },
                    outputMapping: '{"Result": "scaled[]"}',
                },
            },
        });
        expect(feNext.step).toBe('Retry');
        expect((feNext.newPayload as { scaled?: number[] }).scaled).toEqual([10, 20, 30]);

        const whilePayload = feNext.newPayload as { nums: number[]; count: number; scaled: number[] };
        const whileNext = await agent.RunWhile(makeExecuteParams(whilePayload), {
            step: 'While',
            terminate: false,
            previousPayload: whilePayload,
            newPayload: whilePayload,
            while: {
                condition: 'payload.count < 8',
                itemVariable: 'attempt',
                maxIterations: 5,
                action: {
                    name: 'calculate_expression',
                    params: { Expression: '{{payload.count}} * 2' },
                    outputMapping: '{"Result": "count"}',
                },
            },
        });
        expect(whileNext.step).toBe('Retry');
        expect((whileNext.newPayload as { count: number }).count).toBe(8);
    });

    it('rejects invalid multi-step loop configurations before running any iterations', async () => {
        const agent = new TestableBaseAgent(actions, subAgents);
        const params = makeExecuteParams({ items: [1] });

        // 1. Conflicting action + steps
        const conflict = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            forEach: {
                collectionPath: 'items',
                itemVariable: 'item',
                action: { name: 'Calculate Expression', params: {} },
                steps: [{ name: 'Calculate Expression', params: {} }],
            },
        });
        expect(conflict.step).toBe('Failed');
        expect(conflict.errorMessage).toContain('multiple loop bodies');

        // 2. Duplicate step.id
        const dupId = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            forEach: {
                collectionPath: 'items',
                itemVariable: 'item',
                steps: [
                    { id: 'dup', name: 'Calculate Expression', params: {} },
                    { id: 'dup', name: 'Format Currency', params: {} },
                ],
            },
        });
        expect(dupId.step).toBe('Failed');
        expect(dupId.errorMessage).toContain('duplicate loop step id "dup"');

        // 3. Invalid outputMapping JSON
        const badMapping = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            forEach: {
                collectionPath: 'items',
                itemVariable: 'item',
                steps: [{ id: 's1', name: 'Calculate Expression', params: {}, outputMapping: 'not-json' }],
            },
        });
        expect(badMapping.step).toBe('Failed');
        expect(badMapping.errorMessage).toContain('outputMapping is not valid JSON');

        // 4. Unparseable step.condition
        const badCond = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            forEach: {
                collectionPath: 'items',
                itemVariable: 'item',
                steps: [{ id: 's1', name: 'Calculate Expression', params: {}, condition: 'steps.s1.Result ===' }],
            },
        });
        expect(badCond.step).toBe('Failed');
        expect(badCond.errorMessage).toContain('cannot be parsed');

        // 5. Forward / self steps.<prevId> reference
        const forwardRef = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            forEach: {
                collectionPath: 'items',
                itemVariable: 'item',
                steps: [
                    { id: 's1', name: 'Calculate Expression', params: { Expression: '{{steps.s2.Result}} + 1' } },
                    { id: 's2', name: 'Format Currency', params: {} },
                ],
            },
        });
        expect(forwardRef.step).toBe('Failed');
        expect(forwardRef.errorMessage).toContain('has not run before step');

        // 6. Durable-only prompt arm refused cleanly on in-turn execution
        const promptArm = await agent.RunForEach(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: { items: [1] },
            forEach: {
                collectionPath: 'items',
                itemVariable: 'item',
                prompt: { name: 'Summarize Item', params: {} },
            },
        });
        expect(promptArm.step).toBe('Failed');
        expect(promptArm.errorMessage).toContain('Prompt loop bodies are only supported in durable TaskGraph execution');
    });

    it('accepts sanitized native tool names without mutating caller inputs and canonicalizes at execution time', async () => {
        const agent = new TestableBaseAgent(actions, subAgents, async (name, stepParams) => ({
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `${name}:${String(stepParams['Expression'] ?? '')}`,
            Params: [{ Name: 'Result', Value: 2, Type: 'Output' }],
        }));
        const params = makeExecuteParams();

        // 1. validateActionsNextStep does NOT mutate caller input; executeActionsStep invokes canonical name
        const actionsStep: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            actions: [{ name: 'calculate_expression', params: { Expression: '1 + 1' } }],
        };
        const validatedActions = await agent.ValidateActions(params, actionsStep);
        expect(validatedActions).toBe(actionsStep);
        expect(actionsStep.actions?.[0].name).toBe('calculate_expression');

        await agent.RunStep(params, actionsStep);
        expect(actionsStep.actions?.[0].name).toBe('calculate_expression');
        expect(agent.ActionCalls[0]?.name).toBe('Calculate Expression');

        // 2. validateSubAgentNextStep & validateSubAgentInAgent do NOT mutate caller input
        const subAgentStep: BaseAgentNextStep = {
            step: 'Sub-Agent',
            terminate: false,
            subAgent: { name: 'delegate_to_query_builder', message: 'Find top customers', terminateAfter: false },
        };
        const validatedSub = await agent.ValidateSubAgents(params, subAgentStep);
        expect(validatedSub).toBe(subAgentStep);
        expect(subAgentStep.subAgent?.name).toBe('delegate_to_query_builder');
        expect(agent.CheckSubAgentInAgent('delegate_to_query_builder')).toBeNull();
        expect(agent.CheckActionInAgent('format_currency')).toBeNull();

        // 3. validateTasksNextStep leaves caller spec untouched; executeTasksStep submits canonicalized copy
        const spec: TaskGraphSpec = {
            workflowName: 'Normalized Graph',
            tasks: [
                {
                    tempId: 'loop',
                    name: 'Batch Math',
                    description: 'Compute batch',
                    kind: 'ForEach',
                    configuration: {
                        collectionPath: 'static:[1,2]',
                        itemVariable: 'n',
                        steps: [
                            { id: 'c1', name: 'calculate_expression', params: { Expression: '{{n}} * 2' } },
                            { id: 'c2', name: 'format_currency', params: { Amount: '{{steps.c1.Result}}' } },
                        ],
                    },
                    dependsOn: [],
                },
                {
                    tempId: 'report',
                    name: 'Query Report',
                    description: 'Build report',
                    kind: 'Agent',
                    configuration: { agentName: 'delegate_to_query_builder' },
                    dependsOn: ['loop'],
                },
            ],
        };
        const tasksStep: BaseAgentNextStep = {
            step: 'Tasks' as BaseAgentNextStep['step'],
            terminate: false,
            taskGraph: { spec },
        };
        const validatedTasks = await agent.ValidateTasks(params, tasksStep);
        expect(validatedTasks).toBe(tasksStep);
        const callerLoopCfg = spec.tasks[0].configuration as ForEachOperation;
        expect(callerLoopCfg.steps?.[0].name).toBe('calculate_expression');
        expect(callerLoopCfg.steps?.[1].name).toBe('format_currency');
        expect((spec.tasks[1].configuration as { agentName: string }).agentName).toBe('delegate_to_query_builder');

        const submitted: TaskGraphSubmitRequest[] = [];
        class CapturingSubmitter extends TaskGraphSubmitter {
            public async Submit(req: TaskGraphSubmitRequest): Promise<TaskGraphSubmitOutcome> {
                submitted.push(req);
                return { Success: true, ParentTaskID: 'parent-task-1', TaskIDByTempId: { loop: 't1', report: 't2' } };
            }
        }
        class EmptySubmitter extends CapturingSubmitter {
            public override Submit!: (req: TaskGraphSubmitRequest) => Promise<TaskGraphSubmitOutcome>;
        }
        MJGlobal.Instance.ClassFactory.Register(TaskGraphSubmitter, CapturingSubmitter, TASK_GRAPH_SUBMITTER_KEY);
        try {
            const submittedOutcome = await agent.RunStep(params, tasksStep);
            expect(submittedOutcome.step).toBe('Success');
            expect(submitted).toHaveLength(1);
            const submittedLoop = submitted[0].Spec.tasks[0].configuration as ForEachOperation;
            expect(submittedLoop.steps?.[0].name).toBe('Calculate Expression');
            expect(submittedLoop.steps?.[1].name).toBe('Format Currency');
            expect((submitted[0].Spec.tasks[1].configuration as { agentName: string }).agentName).toBe('Query Builder');
            // Caller spec remained completely untouched
            expect(callerLoopCfg.steps?.[0].name).toBe('calculate_expression');
            expect((spec.tasks[1].configuration as { agentName: string }).agentName).toBe('delegate_to_query_builder');
        } finally {
            MJGlobal.Instance.ClassFactory.Register(TaskGraphSubmitter, EmptySubmitter, TASK_GRAPH_SUBMITTER_KEY, 10);
        }
    });

    it('executes graduated multi-step ForEach and While workflows in-run under FlowAgentType without dropping steps[1..N]', async () => {
        // Graduate a 2-node TaskGraphSpec (multi-step ForEach -> multi-step While, each chaining
        // TWO DISTINCT actions: Calculate Expression -> Format Currency, and omitting While.itemVariable)
        // via ConvertTaskGraphToAgentSpec, then run it through FlowAgentType (executionMode: 'inRun').
        const graduatedGraph: TaskGraphSpec = {
            workflowName: 'Graduated Multi-Step Loops',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe', name: 'Price Line Items', description: 'Compute & format line items', dependsOn: [] },
                    {
                        collectionPath: 'payload.quantities',
                        itemVariable: 'qty',
                        steps: [
                            { id: 'calc', name: 'Calculate Expression', params: { Expression: '{{qty}} * 5' } },
                            {
                                id: 'fmt',
                                name: 'Format Currency',
                                params: { Amount: '{{steps.calc.Result}}' },
                                outputMapping: '{"Formatted": "formattedPrices[]"}',
                            },
                        ],
                    }
                ),
                TaskNode.While(
                    { tempId: 'wh', name: 'Accumulate Bonus', description: 'Double bonus and record badge', dependsOn: ['fe'] },
                    {
                        condition: 'payload.bonus < 4',
                        maxIterations: 5,
                        steps: [
                            {
                                id: 'grow',
                                name: 'Calculate Expression',
                                params: { Expression: '{{payload.bonus}} * 2' },
                                outputMapping: '{"Result": "bonus"}',
                            },
                            {
                                id: 'label',
                                name: 'Format Currency',
                                params: { Amount: '{{steps.grow.Result}}' },
                                outputMapping: '{"Formatted": "bonusHistory[]"}',
                            },
                        ],
                    }
                ),
            ],
        };

        let idSeq = 0;
        const converted = ConvertTaskGraphToAgentSpec(graduatedGraph, {
            AgentID: PARENT_AGENT_ID,
            ResolveAgentID: (name) => `agent-${name}`,
            ResolveActionID: (name) =>
                name === 'Calculate Expression' ? CALC_ACTION_ID : name === 'Format Currency' ? FORMAT_ACTION_ID : null,
            NextID: () => `grad-id-${++idSeq}`,
        });
        expect(converted.Success).toBe(true);
        expect(converted.Losses).toEqual([]);
        // ConvertTaskGraphToAgentSpec sets LoopBodyType='Action' and ActionID=steps[0] (CALC_ACTION_ID)
        expect(converted.Spec?.Steps?.[0].LoopBodyType).toBe('Action');
        expect(converted.Spec?.Steps?.[0].ActionID).toBe(CALC_ACTION_ID);

        mockFlowSteps = (converted.Spec?.Steps ?? []).map(
            (s) =>
                ({
                    ID: s.ID,
                    AgentID: PARENT_AGENT_ID,
                    Name: s.Name,
                    Description: s.Description ?? null,
                    StepType: s.StepType,
                    StartingStep: s.StartingStep,
                    Status: 'Active',
                    ActionID: s.ActionID ?? null,
                    SubAgentID: s.SubAgentID ?? null,
                    PromptID: s.PromptID ?? null,
                    ActionInputMapping: s.ActionInputMapping ?? null,
                    ActionOutputMapping: s.ActionOutputMapping ?? null,
                    LoopBodyType: s.LoopBodyType ?? null,
                    Configuration: typeof s.Configuration === 'string' ? s.Configuration : JSON.stringify(s.Configuration),
                }) as MJAIAgentStepEntity
        );
        mockFlowPaths = (converted.Spec?.Paths ?? []).map(
            (p) =>
                ({
                    ID: p.ID,
                    OriginStepID: p.OriginStepID,
                    DestinationStepID: p.DestinationStepID,
                    Condition: p.Condition ?? null,
                    Priority: p.Priority ?? 0,
                    Description: p.Description ?? null,
                }) as MJAIAgentStepPathEntity
        );

        const flowType = new FlowAgentType();
        // Pass empty effectiveActions (`[]`) so BaseAgent MUST resolve BOTH Calculate Expression AND
        // Format Currency from Flow AIAgentStep + Configuration.steps[] via getFlowStepActions!
        const agent = new TestableBaseAgent(
            [],
            subAgents,
            async (name, stepParams) => {
                if (name === 'Calculate Expression') {
                    const val = evalSimpleMath(stepParams['Expression']);
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Message: 'OK',
                        Params: [{ Name: 'Result', Value: val, Type: 'Output' }],
                    };
                }
                if (name === 'Format Currency') {
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Message: 'OK',
                        Params: [{ Name: 'Formatted', Value: `USD ${String(stepParams['Amount'])}`, Type: 'Output' }],
                    };
                }
                return { Success: false, ResultCode: 'ERR', Message: `Unexpected action ${name}`, Params: [] };
            },
            flowType
        );

        const initialPayload = { quantities: [2, 4], bonus: 1 };
        const params: ExecuteAgentParams = {
            ...makeExecuteParams(initialPayload),
            agentTypeParams: { executionMode: 'inRun' },
        };
        const flowState = await flowType.InitializeAgentTypeState<FlowExecutionState>(params);
        agent.SetAgentTypeState(flowState);

        let decision: BaseAgentNextStep | null = null;
        let safetyCounter = 0;
        do {
            decision = await agent.RunStep(params, decision);
            safetyCounter++;
        } while (!decision.terminate && safetyCounter < 12);

        expect(decision.terminate).toBe(true);
        expect(decision.step).toBe('Success');
        const finalPayload = decision.newPayload as {
            quantities: number[];
            bonus: number;
            formattedPrices?: string[];
            bonusHistory?: string[];
        };
        expect(finalPayload.formattedPrices).toEqual(['USD 10', 'USD 20']);
        expect(finalPayload.bonus).toBe(4);
        expect(finalPayload.bonusHistory).toEqual(['USD 2', 'USD 4']);
    });

    it('resolves multi-placeholder inline templates starting and ending with {{...}} without corrupting inner braces', () => {
        const agent = new TestableBaseAgent(actions, subAgents);
        const ctx = {
            item: { firstName: 'Ada', lastName: 'Lovelace', age: 36 },
            index: 0,
        };

        expect(agent.ResolveTemplateValue('{{user.firstName}} {{user.lastName}}', ctx, 'user')).toBe('Ada Lovelace');
        expect(agent.ResolveTemplateValue('{{user.age}}', ctx, 'user')).toBe(36);
    });
});

describe('StructureActionResult — Pipeline action output adapter (`Output` | `Both` & JSON container Message)', () => {
    it('includes both Output and Both params, excludes Input params, and coerces JSON container strings', () => {
        const multi = StructureActionResult({
            Success: true,
            ResultCode: 'OK',
            Message: 'ignored when params exist',
            Params: [
                { Name: 'Expression', Value: '2 * 3', Type: 'Input' },
                { Name: 'Result', Value: 6, Type: 'Both' },
                { Name: 'Meta', Value: '{"unit":"USD"}', Type: 'Output' },
            ],
        });
        expect(multi).toEqual({ Result: 6, Meta: { unit: 'USD' } });

        const singleBoth = StructureActionResult({
            Success: true,
            ResultCode: 'OK',
            Message: 'OK',
            Params: [
                { Name: 'Expression', Value: '10 + 5', Type: 'Input' },
                { Name: 'Result', Value: 15, Type: 'Both' },
            ],
        });
        expect(singleBoth).toBe(15);
    });

    it('parses unambiguous JSON object/array Message when no Output/Both params exist and leaves prose untouched', () => {
        const jsonMsg = StructureActionResult({
            Success: true,
            ResultCode: 'OK',
            Message: '{"handle":"doc-42","rows":[1,2]}',
            Params: [{ Name: 'Title', Value: 'Q3 Report', Type: 'Input' }],
        });
        expect(jsonMsg).toEqual({ handle: 'doc-42', rows: [1, 2] });

        const proseMsg = StructureActionResult({
            Success: true,
            ResultCode: 'OK',
            Message: '[Note: document queued for indexing]',
            Params: [],
        });
        expect(proseMsg).toBe('[Note: document queued for indexing]');
    });
});
