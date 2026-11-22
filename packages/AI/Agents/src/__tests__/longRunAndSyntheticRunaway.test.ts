/**
 * End-to-End Long-Run & Synthetic Runaway Acceptance Suite (Slice 4, Epic 1a)
 *
 * Proves all three acceptance pillars:
 * 1. Legitimate 5,000-node drawn workflow validates cleanly under `MaxTasksPerGraph = 100,000`
 *    and executes 100% of nodes with genuine deterministic progress without tripping budget,
 *    progress-detector, or backstop guards.
 * 2. Legitimate 2,000-turn Agent Channel conversation with genuine progress completes all
 *    2,000 turns cleanly when configured/permitted without tripping budget, progress, or
 *    backstop guards.
 * 3. Synthetic repeating runaway loop is paused early by `DeterministicProgressDetector`
 *    with a full persisted resumable checkpoint (`Status = 'Paused'`) WELL BEFORE hitting the
 *    100,000 (`AgentAbsoluteIterations`) or 1,000,000 (`WhileLoopMaxIterations`) backstops,
 *    refuses unapproved resume, and resumes non-destructively after human approval while
 *    preserving all completed work and cumulative USD + active wall-clock accounting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    ExtractRunawayCheckpointFromRunData,
    ValidateTaskGraphSpec,
    type AgentConfiguration,
    type AIPromptParams,
    type AIPromptRunResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type RunawayJsonValue,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentRequestEntity,
    MJAIAgentTypeEntity,
    MJAIPromptEntity,
    MJAIPromptRunEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJUserNotificationEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { ActionEngineServer } from '@memberjunction/actions';
import { UserCache } from '@memberjunction/generic-database-provider';
import { BaseAgent } from '../base-agent';
import { AgentWakeTriggerService } from '../AgentWakeTriggerService';
import { BudgetEnforcementGuard } from '../BudgetEnforcementGuard';
import { DeterministicProgressDetector } from '../DeterministicProgressDetector';
import { RunawayCheckpointManager } from '../RunawayCheckpointManager';
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS } from '../agent-types/loop-agent-prompt-params';
import '../agent-types/loop-agent-type';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PEER_USER_ID = '22222222-2222-4222-8222-222222222223';
const APPROVER_ID = '33333333-3333-4333-8333-333333333333';
const AGENT_TYPE_ID = '44444444-4444-4444-8444-444444444444';
const PROMPT_ID = '55555555-5555-4555-8555-555555555555';
const ACTION_ID = '66666666-6666-4666-8666-666666666666';

const catalogMap = new Map<string, object>();

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: vi.fn(async () => undefined),
                Agents: [],
                AgentCategories: [],
                ScopedPromptParts: [],
                ScopedPromptConfigs: [],
                AgentTypes: [
                    {
                        ID: AGENT_TYPE_ID,
                        Name: 'Loop',
                        DriverClass: 'LoopAgentType',
                        SystemPromptID: PROMPT_ID,
                        AgentPromptPlaceholder: '{{ _AGENT_PROMPT_ }}',
                        IsActive: true,
                    } as Partial<MJAIAgentTypeEntity> as MJAIAgentTypeEntity,
                ],
                Prompts: [
                    {
                        ID: PROMPT_ID,
                        Name: 'Loop System Prompt',
                        TemplateText: 'System',
                        IsActive: true,
                    } as Partial<MJAIPromptEntity> as MJAIPromptEntity,
                ],
                AgentActions: [
                    {
                        ID: 'aaaaaaaa-0000-4000-8000-000000000001',
                        AgentID: AGENT_ID,
                        ActionID: ACTION_ID,
                        Action: 'ExecuteStep',
                        Status: 'Active',
                    },
                ],
                AgentPrompts: [
                    {
                        ID: 'aaaaaaaa-0000-4000-8000-000000000002',
                        AgentID: AGENT_ID,
                        PromptID: PROMPT_ID,
                        Status: 'Active',
                        ExecutionOrder: 1,
                    },
                ],
                AgentRelationships: [],
                AgentConfigurations: [],
                AgentDataSources: [],
                AgentSkills: [],
                AgentSteps: [],
                AgentStepPaths: [],
                GetSubAgents: vi.fn(() => []),
                GetAutoActivatableSkillsForAgent: vi.fn(() => []),
                GetSkillsForAgent: vi.fn(() => []),
                GetClientToolsForAgent: vi.fn(() => []),
                GetAgentConfigurationPresets: vi.fn(() => []),
                GetAgentSteps: vi.fn(() => []),
                GetAgentActions: vi.fn(() => [{ AgentID: AGENT_ID, ActionID: ACTION_ID, Status: 'Active' }]),
                GetAgentRelationships: vi.fn(() => []),
                GetAgentPrompts: vi.fn(() => []),
                GetAgentBaseCatalog: vi.fn((agentId: string) => catalogMap.get(agentId)),
                SetAgentBaseCatalog: vi.fn((agentId: string, cat: object) => {
                    catalogMap.set(agentId, cat);
                }),
                ResolveAgentStorageAccountID: vi.fn(async () => null),
            };
        },
    },
}));

vi.mock('@memberjunction/actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/actions')>();
    let mockActionEngine: {
        Config: ReturnType<typeof vi.fn>;
        Actions: Array<{
            ID: string;
            Name: string;
            Description: string;
            Status: string;
            Params: { Items: never[] };
            ResultCodes: { Items: never[] };
        }>;
        RunAction: ReturnType<typeof vi.fn>;
    } | null = null;
    return {
        ...actual,
        ActionEngineServer: {
            get Instance() {
                if (!mockActionEngine) {
                    mockActionEngine = {
                        Config: vi.fn(async () => undefined),
                        Actions: [
                            {
                                ID: ACTION_ID,
                                Name: 'ExecuteStep',
                                Description: 'Executes a step',
                                Status: 'Active',
                                Params: { Items: [] },
                                ResultCodes: { Items: [] },
                            },
                        ],
                        RunAction: vi.fn(async () => ({
                            Success: true,
                            Message: 'Executed step cleanly',
                            Params: [],
                            Result: { ResultCode: 'SUCCESS' },
                        })),
                    };
                }
                return mockActionEngine;
            },
        },
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: vi.fn(async () => true),
    },
}));

interface AcceptanceEnvelope extends Record<string, RunawayJsonValue | object | undefined> {
    taskComplete: boolean;
    reasoning?: string;
    message?: string;
    scratchpad?: object;
    payloadChangeRequest?: object;
    nextStep?: object;
}

class AcceptanceRunHarness {
    public readonly Runs = new Map<string, MJAIAgentRunEntityExtended>();
    public readonly Notifications: MJUserNotificationEntity[] = [];
    public readonly AgentRequests: MJAIAgentRequestEntity[] = [];
    private nextRun = 1;
    private nextStep = 1;
    private nextNotification = 1;
    private nextRequest = 1;

    public CreateProvider(): IMetadataProvider {
        const self = this;
        const provider: Partial<IMetadataProvider> = {
            Entities: [],
            EntityByName: vi.fn(() => undefined),
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: AI Agent Runs') return self.makeRun();
                if (entityName === 'MJ: AI Agent Run Steps') return self.makeStep();
                if (entityName === 'MJ: User Notifications') return self.makeNotification();
                if (entityName === 'MJ: AI Agent Requests') return self.makeRequest();
                throw new Error(`Unexpected entity ${entityName}`);
            }),
            RunViews: vi.fn(async () => []),
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        };
        return provider as IMetadataProvider;
    }

    private makeRun(): MJAIAgentRunEntityExtended {
        const id = `77777777-7777-4777-8777-${String(this.nextRun++).padStart(12, '0')}`;
        const steps: MJAIAgentRunStepEntityExtended[] = [];
        let dataJson: string | null = null;
        let checkpointCache: ReturnType<typeof ExtractRunawayCheckpointFromRunData> = null;
        let finalPayloadObj: RunawayJsonValue | object | null = null;
        let finalPayload: string | null = null;

        const run: Partial<MJAIAgentRunEntityExtended> & { ID: string; Steps: MJAIAgentRunStepEntityExtended[] } = {
            ID: id,
            AgentID: AGENT_ID,
            Status: 'Running',
            StartedAt: new Date(),
            CompletedAt: null,
            Success: null,
            ErrorMessage: null,
            Message: null,
            UserID: USER_ID,
            TotalPromptIterations: 0,
            TotalTokensUsed: 0,
            TotalPromptTokensUsed: 0,
            TotalCompletionTokensUsed: 0,
            TotalCacheReadTokensUsed: 0,
            TotalCacheWriteTokensUsed: 0,
            TotalCost: 0,
            Steps: steps,
            LatestResult: { CompleteMessage: '' } as MJAIAgentRunEntityExtended['LatestResult'],
            get Data(): string | null {
                return dataJson;
            },
            set Data(v: string | null) {
                dataJson = v;
            },
            get RunawayCheckpoint() {
                return checkpointCache ?? ExtractRunawayCheckpointFromRunData(dataJson);
            },
            set RunawayCheckpoint(v) {
                checkpointCache = v;
            },
            get FinalPayloadObject() {
                return finalPayloadObj;
            },
            set FinalPayloadObject(v: RunawayJsonValue | object | null) {
                finalPayloadObj = v;
            },
            get FinalPayload() {
                return finalPayload;
            },
            set FinalPayload(v) {
                finalPayload = v;
            },
            Load: vi.fn(async (targetId: string) => {
                const stored = this.Runs.get(targetId);
                if (!stored) return false;
                Object.assign(run, stored);
                dataJson = stored.Data;
                checkpointCache = stored.RunawayCheckpoint;
                finalPayload = stored.FinalPayload;
                finalPayloadObj = stored.FinalPayloadObject as RunawayJsonValue | object | null;
                steps.length = 0;
                steps.push(...stored.Steps);
                return true;
            }),
            Save: vi.fn(async () => {
                this.Runs.set(run.ID, run as MJAIAgentRunEntityExtended);
                return true;
            }),
            SetServerBoundActionParams: vi.fn(),
        };
        return run as MJAIAgentRunEntityExtended;
    }

    private makeStep(): MJAIAgentRunStepEntityExtended {
        const id = `88888888-8888-4888-8888-${String(this.nextStep++).padStart(12, '0')}`;
        const step: Partial<MJAIAgentRunStepEntityExtended> = {
            ID: id,
            Status: 'Running',
            Success: null,
            StepNumber: 1,
            StepType: 'Prompt',
            StepName: 'Step',
            Save: vi.fn(async () => true),
            NewRecord: vi.fn(() => true),
        };
        return step as MJAIAgentRunStepEntityExtended;
    }

    private makeNotification(): MJUserNotificationEntity {
        const id = `99999999-9999-4999-8999-${String(this.nextNotification++).padStart(12, '0')}`;
        const notif: Partial<MJUserNotificationEntity> = {
            ID: id,
            UserID: USER_ID,
            Title: null,
            Message: null,
            Unread: true,
            ResourceRecordID: null,
            ResourceConfiguration: null,
            LatestResult: { CompleteMessage: '' } as MJUserNotificationEntity['LatestResult'],
            Save: vi.fn(async () => {
                this.Notifications.push(notif as MJUserNotificationEntity);
                return true;
            }),
        };
        return notif as MJUserNotificationEntity;
    }

    private makeRequest(): MJAIAgentRequestEntity {
        const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(this.nextRequest++).padStart(12, '0')}`;
        const req: Partial<MJAIAgentRequestEntity> = {
            ID: id,
            Status: 'Requested',
            Save: vi.fn(async () => {
                this.AgentRequests.push(req as MJAIAgentRequestEntity);
                return true;
            }),
        };
        return req as MJAIAgentRequestEntity;
    }
}

function makePromptResult(
    envelope: AcceptanceEnvelope,
    costUsd: number,
    tokens: number,
): AIPromptRunResult<AcceptanceEnvelope> {
    const promptRun: Partial<MJAIPromptRunEntity> = {
        ID: `pr-${Math.random().toString(36).slice(2)}`,
        TotalCost: costUsd,
        Cost: costUsd,
        TokensUsedRollup: tokens,
        TokensPromptRollup: Math.floor(tokens * 0.7),
        TokensCompletionRollup: Math.ceil(tokens * 0.3),
        TokensCacheReadRollup: 0,
        TokensCacheWriteRollup: 0,
    };
    return {
        success: true,
        result: JSON.stringify(envelope),
        promptRun: promptRun as MJAIPromptRunEntity,
        tokensUsed: tokens,
        promptTokens: Math.floor(tokens * 0.7),
        completionTokens: Math.ceil(tokens * 0.3),
        cost: costUsd,
        combinedCost: costUsd,
        combinedTokensUsed: tokens,
        chatResult: {} as AIPromptRunResult<AcceptanceEnvelope>['chatResult'],
    };
}

class ScriptedAcceptanceAgent extends BaseAgent {
    private readonly generator: (callIndex: number) => AIPromptRunResult<AcceptanceEnvelope>;
    public CallCount = 0;

    constructor(generator: (callIndex: number) => AIPromptRunResult<AcceptanceEnvelope>) {
        super();
        this.generator = generator;
        const promptRunnerStub = {
            ExecutePrompt: vi.fn(async (_params: AIPromptParams) => {
                this.CallCount++;
                return this.generator(this.CallCount);
            }),
            FlushPendingSaves: vi.fn(async () => ({ failures: 0 })),
        };
        Reflect.set(this, '_promptRunner', promptRunnerStub);
    }

    protected override async loadAgentConfiguration(): Promise<AgentConfiguration> {
        return {
            success: true,
            agentType: {
                ID: AGENT_TYPE_ID,
                Name: 'Loop',
                DriverClass: 'LoopAgentType',
                SystemPromptID: PROMPT_ID,
                AgentPromptPlaceholder: '{{ _AGENT_PROMPT }}',
                PromptParamsSchema: JSON.stringify({}),
            } as Partial<MJAIAgentTypeEntity> as MJAIAgentTypeEntity,
            systemPrompt: {
                ID: PROMPT_ID,
                Name: 'Loop System Prompt',
                TemplateText: 'System',
            } as Partial<AgentConfiguration['systemPrompt']> as AgentConfiguration['systemPrompt'],
            childPrompt: {
                ID: PROMPT_ID,
                Name: 'Child Prompt',
                TemplateText: 'Child',
            } as Partial<AgentConfiguration['childPrompt']> as AgentConfiguration['childPrompt'],
        };
    }

    protected override async loadAgentTypePromptParams(): Promise<Record<string, boolean | number | string | null | undefined>> {
        return { ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, enableTaskGraphs: false };
    }

    protected override async InjectContextMemory(): Promise<{ notes: never[]; examples: never[] }> {
        return { notes: [], examples: [] };
    }

    protected override async InjectPreExecutionRAG(): Promise<null> {
        return null;
    }

    protected override async InjectDecisionDiscovery(): Promise<null> {
        return null;
    }
}

describe('Epic 1a End-to-End Acceptance: Long-Run Workflows/Channels & Early Synthetic Runaway Pause/Resume', () => {
    let harness: AcceptanceRunHarness;

    beforeEach(() => {
        vi.restoreAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        harness = new AcceptanceRunHarness();
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockResolvedValue({
            Success: true,
            Message: 'Executed step cleanly',
            Params: [],
            Result: { ResultCode: 'SUCCESS' },
        });
    });

    it('1/3 allows a legitimate 5,000-node drawn workflow with genuine deterministic progress to complete 100% without tripping budget, progress, or backstop guards', async () => {
        const nodeCount = 5_000;
        const tasks: TaskGraphSpecNode[] = Array.from({ length: nodeCount }, (_, idx) => ({
            tempId: `node-${idx + 1}`,
            name: `ETL Stage ${idx + 1}`,
            kind: 'Action',
            configuration: { actionName: 'ExecuteStep', params: { batchIndex: idx + 1 } },
            dependsOn: idx > 0 ? [`node-${idx}`] : [],
        }));

        const spec: TaskGraphSpec = {
            workflowName: '5000-Node Legitimate Drawn Pipeline',
            description: 'Large drawn workflow exercising high-node capacity below MaxTasksPerGraph=100,000',
            tasks,
        };

        // 1) Drawn workflow validation must pass under MaxTasksPerGraph = 100,000
        expect(CODE_FALLBACK_LIMITS.MaxTasksPerGraph).toBe(100_000);
        const validation = ValidateTaskGraphSpec(spec);
        expect(validation.Valid).toBe(true);
        expect(validation.Errors).toHaveLength(0);

        // 2) Execute all 5,000 topological nodes through ActionEngineServer.RunAction + persisted step entities + guard pipeline
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as Partial<UserInfo> as UserInfo;
        const provider = harness.CreateProvider();
        const completedNodeIds: string[] = [];
        const persistedSteps: MJAIAgentRunStepEntityExtended[] = [];
        let runCostUsd = 0;

        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (actionParams) => {
            const batchParam = (actionParams.Params ?? []).find((p) => p.Name === 'batchIndex');
            const batchIndex = Number(batchParam?.Value ?? 0);
            completedNodeIds.push(`node-${batchIndex}`);
            runCostUsd += 0.0001;
            return {
                Success: true,
                Message: `Executed ETL slice ${batchIndex} affecting row key rec-${batchIndex}`,
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
            };
        });

        const nodeById = new Map<string, TaskGraphSpecNode>(tasks.map((t) => [t.tempId, t]));
        const inDegree = new Map<string, number>();
        const dependents = new Map<string, string[]>();
        for (const node of tasks) {
            const deps = node.dependsOn ?? [];
            inDegree.set(node.tempId, deps.length);
            for (const dep of deps) {
                const list = dependents.get(dep) ?? [];
                list.push(node.tempId);
                dependents.set(dep, list);
            }
        }
        const readyQueue: string[] = tasks.filter((t) => (inDegree.get(t.tempId) ?? 0) === 0).map((t) => t.tempId);

        const detector = new DeterministicProgressDetector();
        const budgetGuard = new BudgetEnforcementGuard();
        const progressConfig = LimitsConfigResolver.Resolve().Limits.ProgressDetector;
        const budgets = LimitsConfigResolver.Resolve().Limits.Budgets;
        const startedAtMs = Date.UTC(2026, 10, 21, 10, 0, 0);

        let stalledCount = 0;
        let budgetBreachCount = 0;
        let executedIdx = 0;

        while (readyQueue.length > 0) {
            const nodeId = readyQueue.shift()!;
            const node = nodeById.get(nodeId)!;
            executedIdx++;

            const actionResult = await ActionEngineServer.Instance.RunAction({
                Action: { ID: ACTION_ID, Name: 'ExecuteStep' } as never,
                Params: [{ Name: 'batchIndex', Value: executedIdx, Type: 'Input' }],
                ContextUser: contextUser,
            });
            expect(actionResult.Success).toBe(true);

            const stepEntity = await provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', contextUser);
            stepEntity.StepNumber = executedIdx;
            stepEntity.StepType = 'Actions';
            stepEntity.StepName = node.name;
            stepEntity.Status = 'Completed';
            stepEntity.Success = true;
            await stepEntity.Save();
            persistedSteps.push(stepEntity);

            detector.RecordSample({
                IterationIndex: executedIdx,
                StepType: 'Action',
                StepSignature: `Action:${node.tempId}`,
                RecordsCreatedOrChanged: 1,
                TasksClosed: 1,
                OutputText: actionResult.Message ?? node.name,
                PayloadFingerprint: `completed=${completedNodeIds.length}:last=${completedNodeIds[completedNodeIds.length - 1]}`,
                TokensSpent: 120,
                ErrorSignature: null,
                HeapUsedBytes: 64_000_000 + (executedIdx % 50) * 1024,
            });

            if (executedIdx % 50 === 0 || executedIdx === nodeCount) {
                const evalResult = detector.Evaluate(progressConfig);
                if (evalResult.Checked && evalResult.Classification === 'Stalled') {
                    stalledCount++;
                }
                const budgetResult = await budgetGuard.Evaluate({
                    Budgets: budgets,
                    AgentRunID: '5000-node-run',
                    UserID: USER_ID,
                    CurrentRunCostUsd: runCostUsd,
                    CurrentRunStartedAtMs: startedAtMs,
                    CurrentRunTokens: executedIdx * 120,
                    NowMs: startedAtMs + executedIdx * 100,
                });
                if (budgetResult.Exceeded) {
                    budgetBreachCount++;
                }
            }

            for (const depId of dependents.get(node.tempId) ?? []) {
                const remaining = (inDegree.get(depId) ?? 1) - 1;
                inDegree.set(depId, remaining);
                if (remaining === 0) {
                    readyQueue.push(depId);
                }
            }
        }

        expect(persistedSteps).toHaveLength(5_000);
        expect(completedNodeIds).toHaveLength(5_000);
        expect(completedNodeIds[0]).toBe('node-1');
        expect(completedNodeIds[4_999]).toBe('node-5000');
        expect(stalledCount).toBe(0);
        expect(budgetBreachCount).toBe(0);
    }, 30_000);

    it('2/3 allows a legitimate 2,000-turn agent channel with genuine deterministic progress to complete 100% without tripping guards', async () => {
        const totalTurns = 2_000;
        // Configure channel-permitted ceiling via Tier 2 MjConfig (or channel metadata) above 2,000
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            AgentChannelConsecutiveTurns: 2_500,
            AgentChannelWakesPerHour: 3_000,
        });

        const alice = {
            ID: USER_ID,
            Name: 'alice',
            Email: 'alice@example.com',
            IsActive: true,
            Type: 'User',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;
        const bob = {
            ID: PEER_USER_ID,
            Name: 'bob',
            Email: 'bob@example.com',
            IsActive: true,
            Type: 'User',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;
        const systemUser = {
            ID: APPROVER_ID,
            Name: 'system',
            Email: 'system@example.com',
            IsActive: true,
            Type: 'Owner',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

        const channel = {
            ID: 'chan-long-run-2000',
            Topic: 'Multi-Quarter Portfolio Reconciliation',
            ChannelStatus: 'Open' as MJAgentChannelEntity['ChannelStatus'],
            ConsecutiveAgentTurns: 0,
            MaxConsecutiveAgentTurns: 2_000,
            LastHumanMessageAt: null as Date | null,
            HourlyWakeCount: 0,
            HourlyWakeWindowStart: null as Date | null,
            MaxHourlyWakes: 3_000,
            Save: vi.fn(async () => true),
            Load: vi.fn(async () => true),
            LatestResult: null,
        } as Partial<MJAgentChannelEntity> as MJAgentChannelEntity;

        const participants = [
            { ID: 'p1', AgentChannelID: channel.ID, UserID: alice.ID, AgentID: AGENT_ID, Role: 'Initiator' },
            { ID: 'p2', AgentChannelID: channel.ID, UserID: bob.ID, AgentID: AGENT_ID, Role: 'Participant' },
        ] as Partial<MJAgentChannelParticipantEntity>[] as MJAgentChannelParticipantEntity[];

        let routineSaveCount = 0;
        const routineStub = {
            ID: 'routine-long-chan',
            UserID: '',
            Name: '',
            RoutineType: 'AgentWake',
            ScheduleMode: 'OneShot',
            TargetType: 'Agent',
            TargetID: '',
            Status: 'Active',
            NextRunAt: null as Date | null,
            InitialMessage: '',
            StartingPayload: '',
            Description: '',
            WakeConfiguration: null as string | null,
            WakeConfigurationObject: null as MJUserRoutineEntity['WakeConfigurationObject'],
            NewRecord: vi.fn(),
            Save: vi.fn(async () => {
                routineSaveCount++;
                return true;
            }),
            LatestResult: null,
        } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;

        const md = {
            GetEntityObject: vi.fn(async (entityName: string) =>
                entityName === 'MJ: Agent Channels' ? channel : routineStub,
            ),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Agent Channel Participants') {
                    return { Success: true, Results: participants };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<RunView> as RunView);

        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                Status: 'Active',
                AllowInterAgentCoordination: true,
                Agent: 'Chief of Staff',
            } as Partial<AgentUserPolicyEngine extends never ? never : NonNullable<Awaited<ReturnType<AgentUserPolicyEngine['ResolvePolicyForAgentAndUser']>>['policy']>> as never,
        });

        let dispatchedTurnActions = 0;
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (actionParams) => {
            dispatchedTurnActions++;
            const turnVal = Number((actionParams.Params ?? []).find((p) => p.Name === 'turn')?.Value ?? dispatchedTurnActions);
            return {
                Success: true,
                Message: `Reconciled portfolio ledger turn ${turnVal}`,
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
            };
        });

        const detector = new DeterministicProgressDetector();
        const budgetGuard = new BudgetEnforcementGuard();
        const progressConfig = LimitsConfigResolver.Resolve().Limits.ProgressDetector;
        const budgets = LimitsConfigResolver.Resolve().Limits.Budgets;
        const baseNowMs = Date.UTC(2026, 10, 21, 12, 0, 0);

        let completedTurns = 0;
        let pausedTurns = 0;
        let stalledTurns = 0;
        let budgetBreachTurns = 0;

        for (let turn = 1; turn <= totalTurns; turn++) {
            const sender = turn % 2 === 1 ? alice : bob;
            const outcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
                channelID: channel.ID,
                conversationDetailID: `detail-${turn}`,
                senderUserID: sender.ID,
                senderAgentID: AGENT_ID,
                messagePreview: `Reconciled ledger segment #${turn}`,
                contextUser: sender,
                metadataProvider: md,
                now: new Date(baseNowMs + turn * 1_000),
            });

            if (outcome.pausedByGuard) {
                pausedTurns++;
                break;
            }
            completedTurns++;

            const turnActionOutcome = await ActionEngineServer.Instance.RunAction({
                Action: { ID: ACTION_ID, Name: 'ExecuteStep' } as never,
                Params: [{ Name: 'turn', Value: turn, Type: 'Input' }],
                ContextUser: sender,
            });
            expect(turnActionOutcome.Success).toBe(true);

            detector.RecordSample({
                IterationIndex: turn,
                StepType: 'AgentChannelTurn',
                StepSignature: `Channel:Turn-${turn}`,
                RecordsCreatedOrChanged: 1,
                TasksClosed: turn % 4 === 0 ? 1 : 0,
                OutputText: turnActionOutcome.Message ?? `Turn ${turn}`,
                PayloadFingerprint: `chan-turns=${channel.ConsecutiveAgentTurns}:wakes=${routineSaveCount}`,
                TokensSpent: 180,
                ErrorSignature: null,
            });

            if (turn % 100 === 0 || turn === totalTurns) {
                const evalRes = detector.Evaluate(progressConfig);
                if (evalRes.Checked && evalRes.Classification === 'Stalled') {
                    stalledTurns++;
                }
                const budgetRes = await budgetGuard.Evaluate({
                    Budgets: budgets,
                    AgentRunID: channel.ID,
                    UserID: sender.ID,
                    CurrentRunCostUsd: turn * 0.0001,
                    CurrentRunStartedAtMs: baseNowMs,
                    CurrentRunTokens: turn * 180,
                    NowMs: baseNowMs + turn * 1_000,
                });
                if (budgetRes.Exceeded) {
                    budgetBreachTurns++;
                }
            }
        }

        expect(completedTurns).toBe(2_000);
        expect(dispatchedTurnActions).toBe(2_000);
        expect(routineSaveCount).toBe(2_000);
        expect(pausedTurns).toBe(0);
        expect(stalledTurns).toBe(0);
        expect(budgetBreachTurns).toBe(0);
        expect(channel.ChannelStatus).toBe('Open');
        expect(channel.ConsecutiveAgentTurns).toBe(2_000);

        // Verify diagnostics snapshot documents the explicit override vs approved 1,000-turn fallback
        const resolution = LimitsConfigResolver.Resolve();
        expect(resolution.Limits.AgentChannelConsecutiveTurns).toBe(2_500);
        expect(resolution.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe('MjConfig');
        expect(resolution.Provenance.AgentChannelConsecutiveTurns.IsOverridden).toBe(true);
    }, 30_000);

    it('2b/3 retains the default 1,000-turn backstop when no channel/config override is applied', async () => {
        // Ensure no override is registered
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        expect(LimitsConfigResolver.Resolve().Limits.AgentChannelConsecutiveTurns).toBe(1_000);

        const alice = {
            ID: USER_ID,
            Name: 'alice',
            Email: 'alice@example.com',
            IsActive: true,
            Type: 'User',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;
        const systemUser = {
            ID: APPROVER_ID,
            Name: 'system',
            Email: 'system@example.com',
            IsActive: true,
            Type: 'Owner',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

        // Channel leaves MaxConsecutiveAgentTurns = 0 so it falls back to CODE_FALLBACK_LIMITS (1,000)
        const channel = {
            ID: 'chan-default-backstop-1000',
            Topic: 'Default 1,000-Turn Backstop Verification',
            ChannelStatus: 'Open' as MJAgentChannelEntity['ChannelStatus'],
            ConsecutiveAgentTurns: 999,
            MaxConsecutiveAgentTurns: 0,
            LastHumanMessageAt: null as Date | null,
            HourlyWakeCount: 0,
            HourlyWakeWindowStart: null as Date | null,
            MaxHourlyWakes: 2_000,
            Save: vi.fn(async () => true),
            Load: vi.fn(async () => true),
            LatestResult: null,
        } as Partial<MJAgentChannelEntity> as MJAgentChannelEntity;

        const participants = [
            { ID: 'p1', AgentChannelID: channel.ID, UserID: alice.ID, AgentID: AGENT_ID, Role: 'Initiator' },
        ] as Partial<MJAgentChannelParticipantEntity>[] as MJAgentChannelParticipantEntity[];

        const routineStub = {
            ID: 'routine-default-backstop',
            UserID: '',
            Name: '',
            RoutineType: 'AgentWake',
            ScheduleMode: 'OneShot',
            TargetType: 'Agent',
            TargetID: '',
            Status: 'Active',
            NextRunAt: null as Date | null,
            InitialMessage: '',
            StartingPayload: '',
            Description: '',
            WakeConfiguration: null as string | null,
            WakeConfigurationObject: null as MJUserRoutineEntity['WakeConfigurationObject'],
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            LatestResult: null,
        } as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;

        const md = {
            GetEntityObject: vi.fn(async (entityName: string) =>
                entityName === 'MJ: Agent Channels' ? channel : routineStub,
            ),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Agent Channel Participants') {
                    return { Success: true, Results: participants };
                }
                return { Success: true, Results: [] };
            }),
        } as Partial<RunView> as RunView);

        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                Status: 'Active',
                AllowInterAgentCoordination: true,
                Agent: 'Chief of Staff',
            } as never,
        });

        const baseNowMs = Date.UTC(2026, 10, 21, 13, 0, 0);

        // Turn 1,000 succeeds under default backstop
        const turn1000 = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: channel.ID,
            conversationDetailID: 'detail-1000',
            senderUserID: alice.ID,
            senderAgentID: AGENT_ID,
            messagePreview: 'Turn 1000 legitimate progress',
            contextUser: alice,
            metadataProvider: md,
            now: new Date(baseNowMs + 1_000),
        });
        expect(turn1000.pausedByGuard).toBe(false);
        expect(channel.ConsecutiveAgentTurns).toBe(1_000);
        expect(channel.ChannelStatus).toBe('Open');

        // Turn 1,001 trips default 1,000-turn backstop
        const turn1001 = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
            channelID: channel.ID,
            conversationDetailID: 'detail-1001',
            senderUserID: alice.ID,
            senderAgentID: AGENT_ID,
            messagePreview: 'Turn 1001 exceeds default 1000 backstop',
            contextUser: alice,
            metadataProvider: md,
            now: new Date(baseNowMs + 2_000),
        });
        expect(turn1001.pausedByGuard).toBe(true);
        expect(turn1001.channelStatus).toBe('Paused For Human');
        expect(turn1001.results[0]?.resultCode).toBe('CHANNEL_PAUSED_LOOP_GUARD');
        expect(channel.ChannelStatus).toBe('Paused For Human');
    });

    it('3/3 pauses a synthetic repeating runaway loop early with persisted resumable checkpoint well before 100k/1M backstops, and resumes non-destructively after human intervention', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'RunawayAcceptanceAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        // Turn 1-2: genuine work creating batches ['item-1', 'item-2']
        // Turn 3-10: synthetic repeating runaway loop (identical action + reasoning, zero new records/payload delta)
        // Turn 11 (after human approval + resume): finishes ['item-1', 'item-2', 'item-3']
        const agent = new ScriptedAcceptanceAgent((callIdx) => {
            if (callIdx === 1) {
                return makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Processed item-1 into staging table',
                        scratchpad: {
                            notes: 'Completed item-1',
                            taskList: { upsert: [{ id: 'item-1', title: 'Item 1', status: 'completed' }] },
                        },
                        payloadChangeRequest: { newElements: { processedItems: ['item-1'] } },
                        nextStep: { type: 'Actions', actions: [{ name: 'ExecuteStep', params: { item: 1 } }] },
                    },
                    0.05,
                    250,
                );
            }
            if (callIdx === 2) {
                return makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Processed item-2 into staging table',
                        scratchpad: {
                            notes: 'Completed item-1 and item-2',
                            taskList: { upsert: [{ id: 'item-2', title: 'Item 2', status: 'completed' }] },
                        },
                        payloadChangeRequest: { updateElements: { processedItems: ['item-1', 'item-2'] } },
                        nextStep: { type: 'Actions', actions: [{ name: 'ExecuteStep', params: { item: 2 } }] },
                    },
                    0.05,
                    250,
                );
            }
            if (callIdx <= 10) {
                return makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Retrying identical lookup for item-3 with zero state progress',
                        nextStep: { type: 'Actions', actions: [{ name: 'ExecuteStep', params: { retry: true } }] },
                    },
                    0.02,
                    3000,
                );
            }
            return makePromptResult(
                {
                    taskComplete: true,
                    message: 'Completed item-3 cleanly after human guidance on resume',
                    payloadChangeRequest: { updateElements: { processedItems: ['item-1', 'item-2', 'item-3'] } },
                },
                0.04,
                200,
            );
        });

        const pauseResult = await agent.Execute<{ processedItems?: string[] }, { processedItems?: string[] }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Process items 1, 2, 3' }],
            contextUser,
            provider,
            userId: USER_ID,
            limitsOverride: {
                // Keep backstops at full 100,000 / 1,000,000 so early progress detection proves it fires WAY before backstops
                AgentAbsoluteIterations: CODE_FALLBACK_LIMITS.AgentAbsoluteIterations,
                ProgressDetector: {
                    Enabled: true,
                    WindowSize: 5,
                    MinIterationsBeforeCheck: 7,
                    NoPayloadDeltaWindowCount: 4,
                    DuplicateStepRatioThreshold: 0.6,
                    FastJudgeEnabled: false,
                },
            },
        });

        // 1) Paused early by progress detection WELL BEFORE 100,000 / 1,000,000 backstop
        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.pausedReason).toBe('ProgressStalled');
        expect(pauseResult.agentRun.Status).toBe('Paused');
        expect(pauseResult.agentRun.CompletedAt).toBeNull();
        expect(pauseResult.agentRun.ErrorMessage).toBeNull();
        expect(agent.CallCount).toBeLessThan(20);
        expect(agent.CallCount).toBeLessThan(CODE_FALLBACK_LIMITS.AgentAbsoluteIterations);

        // 2) Persisted checkpoint retains completed work & cumulative spend
        const checkpoint = ExtractRunawayCheckpointFromRunData(pauseResult.agentRun.Data);
        expect(checkpoint).not.toBeNull();
        expect(checkpoint?.InFlightPayload).toEqual({ processedItems: ['item-1', 'item-2'] });
        expect(checkpoint?.Scratchpad.notes).toBe('Completed item-1 and item-2');
        expect(checkpoint?.HumanApproval.Status).toBe('Pending');
        const prePauseCost = checkpoint!.CumulativeLedger.RunCostUsd;
        expect(prePauseCost).toBeGreaterThan(0.1);

        // 3) Owner notification was created
        expect(harness.Notifications).toHaveLength(1);
        expect(harness.Notifications[0].UserID).toBe(USER_ID);

        // 4) Unapproved resume fails closed
        const unapprovedResume = await agent.ResumePausedRun({
            agent: agentEntity,
            conversationMessages: [],
            contextUser,
            provider,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
        });
        expect(unapprovedResume.success).toBe(false);
        expect(harness.Runs.get(pauseResult.agentRun.ID)?.Status).toBe('Paused');

        // 5) Human approves & resets progress detector window, then resumes non-destructively
        // Advance scripted calls directly to the post-intervention final turn (turn 11)
        Reflect.set(agent, 'generator', () =>
            makePromptResult(
                {
                    taskComplete: true,
                    message: 'Completed item-3 cleanly after human guidance on resume',
                    payloadChangeRequest: { updateElements: { processedItems: ['item-1', 'item-2', 'item-3'] } },
                },
                0.04,
                200,
            ),
        );

        const checkpointManager = new RunawayCheckpointManager();
        await checkpointManager.ApproveCheckpoint({
            AgentRunID: pauseResult.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            BudgetExtension: {
                AdditionalCostUsd: 1.0,
                ResetProgressDetectorWindow: true,
            },
            DecisionNotes: 'Provided missing lookup hint for item-3',
            Provider: provider,
            ContextUser: contextUser,
        });

        const callsBeforeResume = agent.CallCount;
        const resumedResult = await agent.ResumePausedRun<{ processedItems?: string[] }, { processedItems?: string[] }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Hint: use index partition 3 for item-3' }],
            contextUser,
            provider,
            userId: USER_ID,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
        });

        expect(resumedResult.success).toBe(true);
        expect(resumedResult.agentRun.Status).toBe('Completed');
        expect(resumedResult.payload).toEqual({ processedItems: ['item-1', 'item-2', 'item-3'] });
        // Only 1 turn ran on resume — prior turns were NOT re-executed
        expect(agent.CallCount - callsBeforeResume).toBe(1);
        // Cumulative budget accounting preserves pre-pause + post-resume cost
        expect(resumedResult.agentRun.TotalCost).toBeCloseTo(prePauseCost + 0.04, 5);
    });
});
