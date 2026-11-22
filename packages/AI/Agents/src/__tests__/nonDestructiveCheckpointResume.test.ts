import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    AgentUserPolicyEngine,
    AttachRunawayCheckpointToRunData,
    ExtractRunawayCheckpointFromRunData,
    ValidateLoopOperationStructure,
    type AgentConfiguration,
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type OwnerPauseNotificationPayload,
    type RunawayCheckpointState,
    type RunawayJsonValue,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentRequestEntity, MJAIAgentTypeEntity, MJAIPromptEntity, MJAIPromptRunEntity, MJAIAgentUserPolicyEntity, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngine } from '@memberjunction/aiengine';
import { ActiveRunGovernanceRegistry } from '../ActiveRunGovernanceRegistry';
import { BaseAgent } from '../base-agent';
import { LimitsPauseRunServerOperation } from '../operations/LimitsOperations';
import { RunawayCheckpointManager } from '../RunawayCheckpointManager';
import '../agent-types/loop-agent-type';
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS } from '../agent-types/loop-agent-prompt-params';

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
                        Action: 'ProcessBatchItem',
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
                                Name: 'ProcessBatchItem',
                                Description: 'Processes one batch item',
                                Status: 'Active',
                                Params: { Items: [] },
                                ResultCodes: { Items: [] },
                            },
                        ],
                        RunAction: vi.fn(async () => ({
                            Success: true,
                            Message: 'Item processed',
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

class InMemoryCheckpointHarness {
    public readonly Runs = new Map<string, MJAIAgentRunEntityExtended>();
    public readonly Notifications: MJUserNotificationEntity[] = [];
    public readonly AgentRequests: MJAIAgentRequestEntity[] = [];
    private nextRunCounter = 1;
    private nextStepCounter = 1;
    private nextNotificationCounter = 1;
    private nextRequestCounter = 1;

    public CreateProvider(): IMetadataProvider {
        const self = this;
        const provider = {
            Entities: [],
            EntityByName: vi.fn(() => undefined),
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: AI Agent Runs') {
                    return self.createMockRun();
                }
                if (entityName === 'MJ: AI Agent Run Steps') {
                    return self.createMockStep();
                }
                if (entityName === 'MJ: User Notifications') {
                    return self.createMockNotification();
                }
                if (entityName === 'MJ: AI Agent Requests') {
                    return self.createMockAgentRequest();
                }
                throw new Error(`Unexpected entity in test harness: ${entityName}`);
            }),
            RunViews: vi.fn(async () => []),
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        };
        return provider as Partial<IMetadataProvider> as IMetadataProvider;
    }

    private createMockRun(): MJAIAgentRunEntityExtended {
        const id = `77777777-7777-4777-8777-${String(this.nextRunCounter++).padStart(12, '0')}`;
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
            set Data(val: string | null) {
                dataJson = val;
            },
            get RunawayCheckpoint() {
                return checkpointCache ?? ExtractRunawayCheckpointFromRunData(dataJson);
            },
            set RunawayCheckpoint(val) {
                checkpointCache = val;
            },
            get FinalPayloadObject() {
                return finalPayloadObj;
            },
            set FinalPayloadObject(val: RunawayJsonValue | object | null) {
                finalPayloadObj = val;
            },
            get FinalPayload() {
                return finalPayload;
            },
            set FinalPayload(val) {
                finalPayload = val;
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

    private createMockStep(): MJAIAgentRunStepEntityExtended {
        const id = `88888888-8888-4888-8888-${String(this.nextStepCounter++).padStart(12, '0')}`;
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

    private createMockNotification(): MJUserNotificationEntity {
        const id = `99999999-9999-4999-8999-${String(this.nextNotificationCounter++).padStart(12, '0')}`;
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

    private createMockAgentRequest(): MJAIAgentRequestEntity {
        const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(this.nextRequestCounter++).padStart(12, '0')}`;
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

interface ScriptedEnvelope extends Record<string, RunawayJsonValue | object | undefined> {
    taskComplete: boolean;
    reasoning?: string;
    message?: string;
    scratchpad?: object;
    payloadChangeRequest?: object;
    nextStep?: object;
}

function makePromptResult(
    envelope: ScriptedEnvelope,
    costUsd: number,
    tokens: number,
): AIPromptRunResult<ScriptedEnvelope> {
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
        chatResult: {} as AIPromptRunResult<ScriptedEnvelope>['chatResult'],
    };
}

class TestableCheckpointAgent extends BaseAgent {
    private readonly scriptedPromptCalls: Array<() => AIPromptRunResult<ScriptedEnvelope>>;
    public readonly PromptCalls: AIPromptParams[] = [];

    constructor(scripted: Array<() => AIPromptRunResult<ScriptedEnvelope>>) {
        super();
        this.scriptedPromptCalls = scripted;
        const promptRunnerStub = {
            ExecutePrompt: vi.fn(async (promptParams: AIPromptParams) => {
                this.PromptCalls.push(promptParams);
                const fn = this.scriptedPromptCalls.shift();
                if (!fn) {
                    throw new Error('Unexpected extra ExecutePrompt call');
                }
                return fn();
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

describe('Non-destructive pause, persisted checkpoint, owner notification, and human-approved resume', () => {
    let harness: InMemoryCheckpointHarness;

    beforeEach(() => {
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        harness = new InMemoryCheckpointHarness();
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockResolvedValue({
            Success: true,
            Message: 'Item processed',
            Params: [],
            Result: { ResultCode: 'SUCCESS' },
        });
    });

    it('pauses non-destructively on budget exhaustion, notifies owner, rejects unapproved resume, and preserves work + cumulative ledger on approved resume', async () => {
        const notificationsEmitted: OwnerPauseNotificationPayload[] = [];
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'BudgetedLoopAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        // Scripted turns:
        // Turn 1: updates payload + scratchpad + invokes action ($0.20)
        // Turn 2: updates payload + invokes action ($0.15 => cumulative $0.35 >= $0.30 PerRun limit -> PAUSE!)
        // Turn 3 (AFTER HUMAN APPROVAL): completes task ($0.10 => cumulative $0.45)
        const agent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Step 1 batch A',
                        scratchpad: {
                            notes: 'Completed batch A cleanly',
                            taskList: { upsert: [{ id: 't1', title: 'Batch A', status: 'completed' }] },
                        },
                        payloadChangeRequest: {
                            newElements: { processedBatches: ['A'] },
                        },
                        nextStep: {
                            type: 'Actions',
                            actions: [{ name: 'ProcessBatchItem', params: {} }],
                        },
                    },
                    0.20,
                    200,
                ),
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Step 2 batch B',
                        scratchpad: {
                            notes: 'Completed batch A and B',
                            taskList: { upsert: [{ id: 't2', title: 'Batch B', status: 'completed' }] },
                        },
                        payloadChangeRequest: {
                            updateElements: { processedBatches: ['A', 'B'] },
                        },
                        nextStep: {
                            type: 'Actions',
                            actions: [{ name: 'ProcessBatchItem', params: {} }],
                        },
                    },
                    0.15,
                    150,
                ),
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'Finished all batches including C after resume',
                        payloadChangeRequest: {
                            updateElements: { processedBatches: ['A', 'B', 'C'] },
                        },
                    },
                    0.10,
                    100,
                ),
        ]);

        const pauseResult = await agent.Execute<{ processedBatches?: string[] }, { processedBatches?: string[] }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Process batches A, B, and C' }],
            contextUser,
            provider,
            userId: USER_ID,
            limitsOverride: {
                Budgets: {
                    PerRun: { MaxCostUsd: 0.30 },
                },
            },
            onOwnerPauseNotification: async (payload) => {
                notificationsEmitted.push(payload);
            },
        });

        // 1) Run paused non-destructively — NEVER Failed or Killed
        expect(pauseResult.agentRun.ErrorMessage).toBeNull();
        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.pausedReason).toBe('BudgetExceeded');
        expect(pauseResult.agentRun.Status).toBe('Paused');
        expect(pauseResult.agentRun.CompletedAt).toBeNull();
        expect(pauseResult.budgetBreach?.Scope).toBe('PerRun');
        expect(pauseResult.budgetBreach?.Dimension).toBe('CostUsd');
        expect(agent.PromptCalls).toHaveLength(2);

        // 2) Full checkpoint persisted onto AIAgentRun.Data
        const persistedCheckpoint = ExtractRunawayCheckpointFromRunData(pauseResult.agentRun.Data);
        expect(persistedCheckpoint).not.toBeNull();
        expect(persistedCheckpoint?.CompletedPromptTurns).toBe(2);
        expect(persistedCheckpoint?.InFlightPayload).toEqual({ processedBatches: ['A', 'B'] });
        expect(persistedCheckpoint?.Scratchpad.notes).toBe('Completed batch A and B');
        expect(persistedCheckpoint?.Scratchpad.tasks).toHaveLength(2);
        expect(persistedCheckpoint?.CumulativeLedger.RunCostUsd).toBeCloseTo(0.35, 5);
        expect(persistedCheckpoint?.HumanApproval.Status).toBe('Pending');

        // 3) Owner notification + approval request emitted
        expect(harness.Notifications).toHaveLength(1);
        expect(harness.Notifications[0].UserID).toBe(USER_ID);
        expect(harness.Notifications[0].Unread).toBe(true);
        expect(notificationsEmitted).toHaveLength(1);
        expect(notificationsEmitted[0].EvidenceSummary).toContain('PerRun dollar budget exceeded');

        // 4) Refuses to resume before human approval (and leaves persisted paused run intact!)
        await expect(
            new RunawayCheckpointManager().PrepareResumeFromCheckpoint({
                AgentRunID: pauseResult.agentRun.ID,
                BaseBudgets: CODE_FALLBACK_LIMITS.Budgets,
                Provider: provider,
                ContextUser: contextUser,
            }),
        ).rejects.toThrow(/human approval status is 'Pending'/i);
        const unapprovedResumeResult = await agent.ResumePausedRun({
            agent: agentEntity,
            conversationMessages: [],
            contextUser,
            provider,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
        });
        expect(unapprovedResumeResult.success).toBe(false);
        expect(harness.Runs.get(pauseResult.agentRun.ID)?.Status).toBe('Paused');

        // 5) Human approves & grants budget extension (+$0.50 USD => $0.80 ceiling)
        const checkpointManager = new RunawayCheckpointManager();
        const approvedCheckpoint = await checkpointManager.ApproveCheckpoint({
            AgentRunID: pauseResult.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            BudgetExtension: {
                AdditionalCostUsd: 0.50,
                ResetProgressDetectorWindow: true,
            },
            DecisionNotes: 'Approved batch C completion',
            Provider: provider,
            ContextUser: contextUser,
        });
        expect(approvedCheckpoint.HumanApproval.Status).toBe('Approved');
        expect(approvedCheckpoint.HumanApproval.BudgetExtension?.AdditionalCostUsd).toBe(0.50);

        // 6) Non-destructive resume: completes Batch C WITHOUT re-executing Turns 1 & 2!
        const resumedResult = await agent.ResumePausedRun<{ processedBatches?: string[] }, { processedBatches?: string[] }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Approved — finish batch C' }],
            contextUser,
            provider,
            userId: USER_ID,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
            limitsOverride: {
                Budgets: {
                    PerRun: { MaxCostUsd: 0.30 },
                },
            },
        });

        expect(resumedResult.success).toBe(true);
        expect(resumedResult.paused).toBeUndefined();
        expect(resumedResult.agentRun.Status).toBe('Completed');
        // Only 1 new prompt turn ran on resume (total 3 across pause+resume, never re-running turns 1-2)
        expect(agent.PromptCalls).toHaveLength(3);
        expect(resumedResult.payload).toEqual({ processedBatches: ['A', 'B', 'C'] });
        // Cumulative cost ledger includes BOTH pre-pause ($0.35) and post-resume ($0.10) = $0.45
        expect(resumedResult.agentRun.TotalCost).toBeCloseTo(0.45, 5);
        expect(resumedResult.agentRun.TotalTokensUsed).toBe(450);
    });

    it('excludes paused wall-clock wait time from cumulative budget when CountPausedTimeTowardsWallClock is false', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID } as UserInfo;
        const checkpointManager = new RunawayCheckpointManager();

        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        run.StartedAt = new Date(1_000_000);
        await run.Save();

        await checkpointManager.PauseRunWithCheckpoint({
            AgentRun: run,
            AgentID: AGENT_ID,
            AgentName: 'TimeTestAgent',
            UserID: USER_ID,
            RoutineID: null,
            PauseReason: 'ProgressStalled',
            Summary: 'Stalled at iteration 6',
            CompletedPromptTurns: 6,
            ConversationMessages: [{ role: 'user', content: 'Go' }],
            InFlightPayload: { step: 6 },
            Scratchpad: { notes: 'Saved note', tasks: [] },
            CumulativeLedger: {
                RunCostUsd: 0.12,
                RunWallClockMs: 2_000,
                RunTokens: 1200,
                RoutineCostUsd: 0.12,
                RoutineWallClockMs: 2_000,
                UserDailyCostUsd: 0.12,
                UserDailyWallClockMs: 2_000,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date(1_002_000).toISOString(),
            },
            Provider: provider,
            ContextUser: contextUser,
            NowMs: 1_002_000,
        });

        // Human approves 120,000ms later
        await checkpointManager.ApproveCheckpoint({
            AgentRun: run,
            ApprovedByUserID: APPROVER_ID,
            BudgetExtension: { AdditionalWallClockMs: 5_000 },
            Provider: provider,
            ContextUser: contextUser,
            NowMs: 1_122_000,
        });

        const restored = await checkpointManager.PrepareResumeFromCheckpoint({
            AgentRun: run,
            BaseBudgets: {
                ...CODE_FALLBACK_LIMITS.Budgets,
                PerRun: { MaxCostUsd: 1, MaxWallClockMs: 10_000, MaxTokens: null },
                CountPausedTimeTowardsWallClock: false,
            },
            Provider: provider,
            ContextUser: contextUser,
            NowMs: 1_122_000,
        });

        expect(restored.ExtendedBudgets.PerRun.MaxWallClockMs).toBe(15_000);
        expect(restored.PausedIntervals).toEqual([{ PausedAtMs: 1_002_000, ResumedAtMs: 1_122_000 }]);
        expect(restored.Checkpoint.CumulativeLedger.PausedWallClockMs).toBe(120_000);
        expect(restored.AgentRun.Status).toBe('Running');
        expect(restored.RestoredPayload).toEqual({ step: 6 });
        expect(restored.RestoredScratchpad.notes).toBe('Saved note');
    });

    it('pauses non-destructively when Ambiguous progress triggers FastConvergenceJudge -> Converging: false, then resumes cleanly after approval', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'AmbiguousJudgeAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const judgeCalls: number[] = [];
        const makeAmbiguousTurn = (idx: number) =>
            makePromptResult(
                {
                    taskComplete: false,
                    reasoning: idx % 2 === 0
                        ? `Inspecting schema partition ${idx} metadata without mutating state`
                        : `Evaluating selectivity for candidate partition ${idx * 13}`,
                    nextStep: {
                        type: 'Actions',
                        actions: [{ name: 'ProcessBatchItem', params: {} }],
                    },
                },
                0.02,
                1800,
            );

        const agent = new TestableCheckpointAgent([
            () => makeAmbiguousTurn(1),
            () => makeAmbiguousTurn(2),
            () => makeAmbiguousTurn(3),
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'Completed after human approval of ambiguous exploration',
                        payloadChangeRequest: {
                            newElements: { branchIndex: 99, done: true },
                        },
                    },
                    0.02,
                    200,
                ),
        ]);

        const pauseResult = await agent.Execute({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Explore ambiguous schema partitions' }],
            contextUser,
            provider,
            userId: USER_ID,
            limitsOverride: {
                ProgressDetector: {
                    Enabled: true,
                    MinIterationsBeforeCheck: 6,
                    WindowSize: 6,
                    AmbiguityLowScoreThreshold: 0.25,
                    AmbiguityHighScoreThreshold: 0.65,
                    FastJudgeEnabled: true,
                    FastJudgeTimeoutMs: 200,
                },
            },
            fastConvergenceJudgeEvaluator: async ({ Iteration }) => {
                judgeCalls.push(Iteration);
                return {
                    Converging: false,
                    Reason: 'Agent is oscillating between two partitions without committing progress',
                    LatencyMs: 12,
                    TimedOut: false,
                    UsedFallback: false,
                    Source: 'Model',
                };
            },
        });

        expect(judgeCalls).toEqual([6]);
        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.pausedReason).toBe('FastJudgeStalled');
        expect(pauseResult.agentRun.Status).toBe('Paused');
        expect(pauseResult.progressEvaluation?.FastJudgeInvoked).toBe(true);
        expect(pauseResult.progressEvaluation?.FastJudgeResult?.Reason).toContain('oscillating');

        const checkpointManager = new RunawayCheckpointManager();
        await checkpointManager.ApproveCheckpoint({
            AgentRunID: pauseResult.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            BudgetExtension: { ResetProgressDetectorWindow: true },
            Provider: provider,
            ContextUser: contextUser,
        });

        const resumed = await agent.ResumePausedRun({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Proceed with finalization' }],
            contextUser,
            provider,
            userId: USER_ID,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
        });

        expect(resumed.success).toBe(true);
        expect(resumed.agentRun.Status).toBe('Completed');
        expect(agent.PromptCalls).toHaveLength(4);
        expect(resumed.payload).toEqual({ branchIndex: 99, done: true });
    });

    it('CR-1: enforces real agent budget columns (MaxCostPerRun) and tree budgets without enableRunawayGovernance and updates ceiling on approved extension', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;

        const agentWithColumnBudget = {
            ID: AGENT_ID,
            Name: 'ColumnBudgetAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: 0.25,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const colAgent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Step 1 ($0.18 < $0.25)',
                        payloadChangeRequest: { newElements: { phase: 'step-1' } },
                        nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: { batch: 1 } }] },
                    },
                    0.18,
                    150,
                ),
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Step 2 ($0.12 => cumulative $0.30 >= $0.25)',
                        payloadChangeRequest: { updateElements: { phase: 'step-2' } },
                        nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: { batch: 2 } }] },
                    },
                    0.12,
                    150,
                ),
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'Completed after extending column-derived budget ceiling',
                        payloadChangeRequest: { updateElements: { phase: 'done' } },
                    },
                    0.05,
                    100,
                ),
        ]);

        // Deliberately NO enableRunawayGovernance and NO limitsOverride
        const colPause = await colAgent.Execute<{ phase?: string }, { phase?: string }>({
            agent: agentWithColumnBudget,
            conversationMessages: [{ role: 'user', content: 'Run with MaxCostPerRun=0.25' }],
            contextUser,
            provider,
            userId: USER_ID,
        });

        expect(colPause.paused).toBe(true);
        expect(colPause.pausedReason).toBe('BudgetExceeded');
        expect(colPause.budgetBreach?.Scope).toBe('PerRun');
        expect(colPause.budgetBreach?.Dimension).toBe('CostUsd');
        expect(colPause.agentRun.Status).toBe('Paused');
        expect(colPause.agentRun.ErrorMessage).toBeNull();
        expect(colPause.payload).toEqual({ phase: 'step-2' });

        const checkpointManager = new RunawayCheckpointManager();
        await checkpointManager.ApproveCheckpoint({
            AgentRunID: colPause.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            BudgetExtension: { AdditionalCostUsd: 0.25 },
            Provider: provider,
            ContextUser: contextUser,
        });

        const colResume = await colAgent.ResumePausedRun<{ phase?: string }, { phase?: string }>({
            agent: agentWithColumnBudget,
            conversationMessages: [],
            contextUser,
            provider,
            userId: USER_ID,
            resumeCheckpointRunId: colPause.agentRun.ID,
        });

        expect(colResume.success).toBe(true);
        expect(colResume.agentRun.Status).toBe('Completed');
        expect(colResume.payload).toEqual({ phase: 'done' });

        // Tree budget maxTreeCost without enableRunawayGovernance must also pause non-destructively BEFORE terminal fail
        const agentNoColumns = {
            ID: AGENT_ID,
            Name: 'TreeBudgetAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const treeAgent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Tree step 1 ($0.14)',
                        nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: { batch: 1 } }] },
                    },
                    0.14,
                    120,
                ),
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Tree step 2 ($0.12 => tree cost $0.26 >= $0.22)',
                        nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: { batch: 2 } }] },
                    },
                    0.12,
                    120,
                ),
        ]);

        const treePause = await treeAgent.Execute({
            agent: agentNoColumns,
            conversationMessages: [{ role: 'user', content: 'Run with maxTreeCost=0.22' }],
            contextUser,
            provider,
            userId: USER_ID,
            maxTreeCost: 0.22,
        });

        expect(treePause.paused).toBe(true);
        expect(treePause.agentRun.Status).toBe('Paused');
        expect(treePause.agentRun.ErrorMessage).toBeNull();
    });

    it('CR-3: cooperatively pauses a live running BaseAgent at step boundary via Limits.PauseRun and preserves live messages and payload', async () => {
        const provider = harness.CreateProvider();
        const ownerUser = {
            ID: USER_ID,
            Name: 'Alice Owner',
            Email: 'alice@example.com',
            Type: 'Owner',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'CooperativePauseAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const pauseOp = new LimitsPauseRunServerOperation();
        let pauseDispatchedForRunId: string | null = null;
        let pauseOpPromise: ReturnType<LimitsPauseRunServerOperation['ExecuteServer']> | null = null;
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async () => {
            if (!pauseDispatchedForRunId) {
                const activeRuns = Array.from(harness.Runs.values());
                pauseDispatchedForRunId = activeRuns[0]?.ID ?? null;
                if (pauseDispatchedForRunId) {
                    // Launch cooperative pause concurrently while the step action finishes
                    pauseOpPromise = pauseOp.ExecuteServer(
                        {
                            AgentRunID: pauseDispatchedForRunId,
                            Summary: 'Operator requested safe-point pause during batch action',
                        },
                        { provider, user: ownerUser, emitProgress: () => undefined },
                    );
                }
            }
            return {
                Success: true,
                Message: 'Item processed',
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
            };
        });

        const agent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Running batch 1 before cooperative pause check',
                        scratchpad: {
                            notes: 'Live in-flight note preserved during cooperative pause',
                            taskList: { upsert: [{ id: 't1', title: 'Batch 1', status: 'completed' }] },
                        },
                        payloadChangeRequest: { newElements: { syncedRecords: ['rec-1'] } },
                        nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: { batch: 1 } }] },
                    },
                    0.05,
                    100,
                ),
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'Finished cleanly after cooperative pause resumed',
                        payloadChangeRequest: { updateElements: { syncedRecords: ['rec-1', 'rec-2'] } },
                    },
                    0.03,
                    80,
                ),
        ]);

        const pauseResult = await agent.Execute<{ syncedRecords?: string[] }, { syncedRecords?: string[] }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Sync records with cooperative pause' }],
            contextUser: ownerUser,
            provider,
            userId: USER_ID,
        });

        expect(pauseDispatchedForRunId).toBe(pauseResult.agentRun.ID);
        expect(pauseOpPromise).not.toBeNull();
        const opRes = await pauseOpPromise!;
        expect(opRes.Success).toBe(true);
        expect(opRes.Output?.Status).toBe('Paused');
        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.pausedReason).toBe('ManualPause');
        expect(pauseResult.agentRun.Status).toBe('Paused');

        const checkpoint = ExtractRunawayCheckpointFromRunData(pauseResult.agentRun.Data);
        expect(checkpoint).not.toBeNull();
        expect(checkpoint?.InFlightPayload).toEqual({ syncedRecords: ['rec-1'] });
        expect(checkpoint?.Scratchpad.notes).toBe('Live in-flight note preserved during cooperative pause');
        expect(checkpoint?.ConversationMessages.some((m) => m.Content.includes('Sync records with cooperative pause'))).toBe(true);
    });

    it('CR-4: persists full PendingStepDecision on post-prompt budget pause and executes the pending action once on a fresh BaseAgent instance without re-prompting', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'PendingDecisionResumeAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const executedParams: Array<Record<string, string | number | boolean | null | undefined>> = [];
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (actionParams) => {
            const paramMap: Record<string, string | number | boolean | null | undefined> = {};
            for (const p of actionParams.Params ?? []) {
                paramMap[p.Name] = p.Value as string | number | boolean | null | undefined;
            }
            executedParams.push(paramMap);
            return {
                Success: true,
                Message: 'Executed pending action cleanly',
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
            };
        });

        // Turn 1 decides to run ProcessBatchItem(batchId='delta-99') and spends $0.35 >= $0.30 PerRunCostUsd,
        // pausing BEFORE executing the pending Actions step.
        const initialAgent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Commit delta-99 action next',
                        payloadChangeRequest: { newElements: { preparedBatch: 'delta-99' } },
                        nextStep: {
                            type: 'Actions',
                            actions: [{ name: 'ProcessBatchItem', params: { batchId: 'delta-99' } }],
                        },
                    },
                    0.35,
                    300,
                ),
        ]);

        const pauseResult = await initialAgent.Execute<{ preparedBatch?: string }, { preparedBatch?: string }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Prepare and process delta-99' }],
            contextUser,
            provider,
            userId: USER_ID,
            limitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.30 } } },
        });

        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.agentRun.Status).toBe('Paused');
        expect(executedParams).toHaveLength(0); // Pending action has NOT executed yet!

        const checkpoint = ExtractRunawayCheckpointFromRunData(pauseResult.agentRun.Data);
        expect(checkpoint?.PendingStepDecision).toBeDefined();
        expect(checkpoint?.PendingStepDecision?.step).toBe('Actions');
        expect(checkpoint?.PendingStepDecision?.actions?.[0]?.name).toBe('ProcessBatchItem');
        expect(checkpoint?.PendingStepDecision?.actions?.[0]?.params).toEqual({ batchId: 'delta-99' });

        const checkpointManager = new RunawayCheckpointManager();
        await checkpointManager.ApproveCheckpoint({
            AgentRunID: pauseResult.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            BudgetExtension: { AdditionalCostUsd: 0.50 },
            Provider: provider,
            ContextUser: contextUser,
        });

        // Resume on a BRAND NEW BaseAgent instance that only has the post-action finalization prompt
        const freshAgent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'Delta-99 pending action completed once on fresh worker',
                        payloadChangeRequest: { updateElements: { executedBatch: 'delta-99' } },
                    },
                    0.05,
                    100,
                ),
        ]);

        const resumed = await freshAgent.ResumePausedRun<{ preparedBatch?: string; executedBatch?: string }>({
            agent: agentEntity,
            conversationMessages: [],
            contextUser,
            provider,
            userId: USER_ID,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
        });

        expect(resumed.success).toBe(true);
        expect(resumed.agentRun.Status).toBe('Completed');
        // Fresh agent ran pending ProcessBatchItem(batchId='delta-99') BEFORE calling its 1 finalization prompt
        expect(executedParams).toHaveLength(1);
        expect(executedParams[0]).toEqual({ batchId: 'delta-99' });
        expect(freshAgent.PromptCalls).toHaveLength(1);
        expect(resumed.payload).toEqual({ preparedBatch: 'delta-99', executedBatch: 'delta-99' });
    });

    it('CR-5: resolves Tier-4 MJAIAgentUserPolicy limits server-side during BaseAgent.Execute and clamps widening RunOverride', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'PolicyClampedAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValue({
            status: 'found',
            policy: {
                ID: '99999999-9999-4999-8999-000000000042',
                UserID: USER_ID,
                AgentID: AGENT_ID,
                Status: 'Active',
                AllowInterAgentCoordination: true,
                InstructionsOverride: '<!-- mj-limits:{"Budgets":{"PerRun":{"MaxCostUsd":0.25}}} -->',
            } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity,
        });

        const agent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Attempt to spend $0.30 despite $10 RunOverride because policy caps at $0.25',
                        nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: { idx: 1 } }] },
                    },
                    0.30,
                    200,
                ),
        ]);

        const pauseResult = await agent.Execute({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Run with clamped policy ceiling' }],
            contextUser,
            provider,
            userId: USER_ID,
            limitsOverride: {
                Budgets: {
                    PerRun: { MaxCostUsd: 10.0 },
                },
            },
        });

        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.pausedReason).toBe('BudgetExceeded');
        expect(pauseResult.budgetBreach?.Scope).toBe('PerRun');
        expect(pauseResult.budgetBreach?.Dimension).toBe('CostUsd');
        expect(pauseResult.agentRun.Status).toBe('Paused');
    });

    it('CR-7: pauses an inline While loop mid-iteration preserving LoopCursor and resumes from exact iteration index on a fresh BaseAgent', async () => {
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice Owner', Email: 'alice@example.com' } as UserInfo;
        const agentEntity = {
            ID: AGENT_ID,
            Name: 'WhileLoopCheckpointAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const executedAttempts: number[] = [];
        let loopPausePromise: ReturnType<typeof ActiveRunGovernanceRegistry.Instance.RequestCooperativePause> | null = null;
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (actionParams) => {
            const attemptParam = (actionParams.Params ?? []).find((p) => p.Name === 'attempt');
            const attemptNumber = Number(attemptParam?.Value ?? 0);
            executedAttempts.push(attemptNumber);
            if (executedAttempts.length === 2) {
                const currentRunId = Array.from(harness.Runs.keys())[0];
                if (currentRunId) {
                    // Launch cooperative pause signal concurrently so iteration 2 completes cleanly
                    // and checkInlineLoopIterationGovernance pauses right before iteration 3
                    loopPausePromise = ActiveRunGovernanceRegistry.Instance.RequestCooperativePause(
                        currentRunId,
                        'Pause While loop after iteration 2',
                        provider,
                    );
                }
            }
            return {
                Success: true,
                Message: `Processed iteration ${attemptNumber}`,
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
            };
        });

        const initialAgent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Execute 4-iteration While loop',
                        payloadChangeRequest: { newElements: { loopTag: 'while-4' } },
                        nextStep: {
                            type: 'While',
                            while: {
                                condition: 'results.length < 4',
                                itemVariable: 'attempt',
                                maxIterations: 10,
                                action: {
                                    name: 'ProcessBatchItem',
                                    params: { attempt: '{{attempt.attemptNumber}}' },
                                },
                            },
                        },
                    },
                    0.05,
                    150,
                ),
        ]);

        const pauseResult = await initialAgent.Execute<{ loopTag?: string }, { loopTag?: string }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Run 4 while iterations with pause after 2' }],
            contextUser,
            provider,
            userId: USER_ID,
        });

        expect(executedAttempts).toEqual([1, 2]);
        expect(pauseResult.agentRun.ErrorMessage).toBeNull();
        expect(loopPausePromise).not.toBeNull();
        const loopPauseAck = await loopPausePromise!;
        expect(loopPauseAck?.Paused).toBe(true);
        expect(pauseResult.paused).toBe(true);
        expect(pauseResult.agentRun.Status).toBe('Paused');

        const checkpoint = ExtractRunawayCheckpointFromRunData(pauseResult.agentRun.Data);
        expect(checkpoint?.LoopCursor?.LoopType).toBe('While');
        expect(checkpoint?.LoopCursor?.IterationIndex).toBe(2);
        expect(checkpoint?.LoopCursor?.CompletedItemResults).toHaveLength(2);
        expect(checkpoint?.PendingStepDecision?.step).toBe('While');

        const checkpointManager = new RunawayCheckpointManager();
        await checkpointManager.ApproveCheckpoint({
            AgentRunID: pauseResult.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            Provider: provider,
            ContextUser: contextUser,
        });

        const freshAgent = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'While loop resumed from cursor index 2 and completed remaining items',
                        payloadChangeRequest: { updateElements: { loopCompleted: true } },
                    },
                    0.02,
                    100,
                ),
        ]);

        const resumed = await freshAgent.ResumePausedRun<{ loopTag?: string; loopCompleted?: boolean }>({
            agent: agentEntity,
            conversationMessages: [],
            contextUser,
            provider,
            userId: USER_ID,
            resumeCheckpointRunId: pauseResult.agentRun.ID,
        });

        expect(resumed.success).toBe(true);
        expect(resumed.agentRun.Status).toBe('Completed');
        // Exact non-duplicated continuation: [1, 2] pre-pause + [3, 4] post-resume = 4 total iterations!
        expect(executedAttempts).toEqual([1, 2, 3, 4]);
        expect(freshAgent.PromptCalls).toHaveLength(1);
        expect(resumed.payload).toEqual({ loopTag: 'while-4', loopCompleted: true });
    });

    it('CR-15: enforces Tier-4 user-policy AgentAbsoluteIterations ceiling even when raw params.absoluteMaxIterations attempts to widen it', async () => {
        const harness = new InMemoryCheckpointHarness();
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Policy User', Email: 'u@example.com' } as UserInfo;

        const userPolicy = {
            ID: '99999999-1111-4111-8111-000000000015',
            AgentID: AGENT_ID,
            UserID: USER_ID,
            Status: 'Active',
            LimitsOverride: JSON.stringify({ AgentAbsoluteIterations: 2 }),
        } as Partial<MJAIAgentUserPolicyEntity> as MJAIAgentUserPolicyEntity;

        const policySpy = vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
            status: 'found',
            policy: userPolicy,
        });
        try {
            vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockResolvedValue({
                Success: true,
                Message: 'Step action ok',
                Params: [],
                Result: { ResultCode: 'SUCCESS' },
            });

            const agentEntity = {
                ID: AGENT_ID,
                Name: 'Cr15 Clamped Agent',
                TypeID: AGENT_TYPE_ID,
                Status: 'Active',
                MaxCostPerRun: null,
                MaxTokensPerRun: null,
                MaxTimePerRun: null,
                MaxIterationsPerRun: null,
                TypeConfiguration: null,
            } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

            // Script more Retry turns than the policy ceiling (2) so the guardrail MUST stop at iteration 2 despite params.absoluteMaxIterations=50_000
            const agent = new TestableCheckpointAgent([
                () => makePromptResult({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: {} }] } }, 0.01, 50),
                () => makePromptResult({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: {} }] } }, 0.01, 50),
                () => makePromptResult({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'ProcessBatchItem', params: {} }] } }, 0.01, 50),
                () => makePromptResult({ taskComplete: true, message: 'Should never reach turn 4' }, 0.01, 50),
            ]);

            const result = await agent.Execute({
                agent: agentEntity,
                conversationMessages: [{ role: 'user', content: 'Attempt widening absoluteMaxIterations to 50000' }],
                contextUser,
                provider,
                userId: USER_ID,
                absoluteMaxIterations: 50_000,
            });

            expect(result.success).toBe(false);
            expect(agent.PromptCalls).toHaveLength(2);
        } finally {
            policySpy.mockRestore();
        }
    });

    it('CR-16: fails closed before dispatching any prompt or action work when ResolvePolicyForAgentAndUser returns status="error" or throws', async () => {
        const harness = new InMemoryCheckpointHarness();
        const baseProvider = harness.CreateProvider();
        const provider = {
            ...baseProvider,
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        } as Partial<IMetadataProvider> as IMetadataProvider;
        const contextUser = { ID: USER_ID, Name: 'Alice', Email: 'alice@example.com' } as UserInfo;

        const agentEntity = {
            ID: AGENT_ID,
            Name: 'Cr16 Policy Agent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const actionSpy = vi.spyOn(ActionEngineServer.Instance, 'RunAction');

        // 1) Explicit status === 'error' fails closed before any prompt dispatch
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
            status: 'error',
            policy: null,
            errorMessage: 'Simulated policy store outage',
        });

        const agentOnErr = new TestableCheckpointAgent([
            () => makePromptResult({ taskComplete: true, message: 'MUST NOT RUN' }, 0.01, 50),
        ]);
        const errRes = await agentOnErr.Execute({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Should fail closed on status error' }],
            contextUser,
            provider,
            userId: USER_ID,
        });
        expect(errRes.success).toBe(false);
        expect(errRes.errorMessage).toContain('Fail-closed');
        expect(errRes.errorMessage).toContain('Simulated policy store outage');
        expect(agentOnErr.PromptCalls).toHaveLength(0);
        expect(actionSpy).not.toHaveBeenCalled();

        // 2) Thrown exception during ResolvePolicyForAgentAndUser also fails closed before any prompt dispatch
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockRejectedValueOnce(
            new Error('Simulated policy query timeout'),
        );

        const agentOnThrow = new TestableCheckpointAgent([
            () => makePromptResult({ taskComplete: true, message: 'MUST NOT RUN' }, 0.01, 50),
        ]);
        const throwRes = await agentOnThrow.Execute({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Should fail closed on thrown lookup' }],
            contextUser,
            provider,
            userId: USER_ID,
        });
        expect(throwRes.success).toBe(false);
        expect(throwRes.errorMessage).toContain('Simulated policy query timeout');
        expect(agentOnThrow.PromptCalls).toHaveLength(0);
        expect(actionSpy).not.toHaveBeenCalled();

        // 3) missingRunViewProvider: true error variant MUST fail closed with zero prompt/action dispatch (never stripped to null)
        vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser').mockResolvedValueOnce({
            status: 'error',
            policy: null,
            errorMessage: 'Provider lacks RunView capability',
            missingRunViewProvider: true,
        });

        const agentOnMissingRunView = new TestableCheckpointAgent([
            () => makePromptResult({ taskComplete: true, message: 'MUST NOT RUN' }, 0.01, 50),
        ]);
        const missingRvRes = await agentOnMissingRunView.Execute({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Should fail closed on missingRunViewProvider' }],
            contextUser,
            provider,
            userId: USER_ID,
        });
        expect(missingRvRes.success).toBe(false);
        expect(missingRvRes.errorMessage).toContain('Fail-closed');
        expect(missingRvRes.errorMessage).toContain('Provider lacks RunView capability');
        expect(agentOnMissingRunView.PromptCalls).toHaveLength(0);
        expect(actionSpy).not.toHaveBeenCalled();

        // 4) Real incapable provider (lacking RunView) evaluated through AgentUserPolicyEngine also fails closed
        const incapableProvider = {
            Entities: [],
            EntityByName: vi.fn(() => undefined),
            GetEntityObject: baseProvider.GetEntityObject,
        } as Partial<IMetadataProvider> as IMetadataProvider;
        AgentUserPolicyEngine.Instance.ClearCache(AGENT_ID, USER_ID, incapableProvider);
        const agentIncapable = new TestableCheckpointAgent([
            () => makePromptResult({ taskComplete: true, message: 'MUST NOT RUN' }, 0.01, 50),
        ]);
        const incapableRes = await agentIncapable.Execute({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Should fail closed with incapable provider' }],
            contextUser,
            provider: incapableProvider,
            userId: USER_ID,
        });
        expect(incapableRes.success).toBe(false);
        expect(incapableRes.errorMessage).toContain('Fail-closed');
        expect(agentIncapable.PromptCalls).toHaveLength(0);
        expect(actionSpy).not.toHaveBeenCalled();
    });

    it('CR-17: preserves steps[], prompt, and subAgent ForEach/While loop bodies across JSON-only persistence on fresh entities and fresh workers', async () => {
        const harness = new InMemoryCheckpointHarness();
        const provider = harness.CreateProvider();
        const contextUser = { ID: USER_ID, Name: 'Alice', Email: 'alice@example.com' } as UserInfo;

        const agentEntity = {
            ID: AGENT_ID,
            Name: 'Cr17 Loop Body Agent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
            TypeConfiguration: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        // Part A: Live BaseAgent pause + JSON-only fresh entity reload + fresh worker continuation for ForEach with steps[]
        const executedSteps: Array<{ item: string; stepTag: string }> = [];
        let stepsPausePromise: ReturnType<typeof ActiveRunGovernanceRegistry.Instance.RequestCooperativePause> | null = null;
        vi.spyOn(ActionEngineServer.Instance, 'RunAction').mockImplementation(async (actionParams) => {
            const valParam = (actionParams.Params ?? []).find((p) => p.Name === 'itemVal');
            const tagParam = (actionParams.Params ?? []).find((p) => p.Name === 'stepTag');
            const itemVal = String(valParam?.Value ?? '');
            const stepTag = String(tagParam?.Value ?? '');
            executedSteps.push({ item: itemVal, stepTag });
            if (itemVal === 'item-0' && stepTag === 'step-two') {
                const activeId = Array.from(harness.Runs.keys())[0];
                if (activeId) {
                    stepsPausePromise = ActiveRunGovernanceRegistry.Instance.RequestCooperativePause(
                        activeId,
                        'Pause multi-step ForEach after item-0',
                        provider,
                    );
                }
            }
            return {
                Success: true,
                Message: `ok:${itemVal}:${stepTag}`,
                Params: [{ Name: 'status', Value: 'ok', Type: 'Output' as const }],
                Result: { ResultCode: 'SUCCESS' },
            };
        });

        const worker1 = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: false,
                        reasoning: 'Run 2-item multi-step ForEach loop',
                        payloadChangeRequest: { newElements: { batch: ['item-0', 'item-1'] } },
                        nextStep: {
                            type: 'ForEach',
                            forEach: {
                                collectionPath: 'batch',
                                itemVariable: 'entry',
                                maxIterations: 10,
                                steps: [
                                    {
                                        id: 's1',
                                        name: 'ProcessBatchItem',
                                        params: { itemVal: '{{entry}}', stepTag: 'step-one' },
                                        condition: 'true',
                                        outputMapping: '{"status":"s1Last"}',
                                    },
                                    {
                                        id: 's2',
                                        name: 'ProcessBatchItem',
                                        params: { itemVal: '{{entry}}', stepTag: 'step-two' },
                                        condition: 'steps.s1.status == "ok"',
                                        outputMapping: '{"status":"s2Last"}',
                                    },
                                ],
                            },
                        },
                    },
                    0.02,
                    100,
                ),
        ]);

        const pausedStepsRes = await worker1.Execute<{ batch: string[] }, { batch: string[] }>({
            agent: agentEntity,
            conversationMessages: [{ role: 'user', content: 'Run multi-step ForEach' }],
            contextUser,
            provider,
            userId: USER_ID,
        });
        expect(pausedStepsRes.agentRun?.ErrorMessage ?? null).toBeNull();
        expect(pausedStepsRes.paused).toBe(true);
        if (stepsPausePromise) {
            await stepsPausePromise;
        }
        expect(executedSteps).toEqual([
            { item: 'item-0', stepTag: 'step-one' },
            { item: 'item-0', stepTag: 'step-two' },
        ]);

        // Hydrate a BRAND-NEW harness & plain persisted data row ONLY from serialized JSON string
        const rawPersistedJson = JSON.stringify(JSON.parse(pausedStepsRes.agentRun.Data ?? '{}'));
        const freshHarness = new InMemoryCheckpointHarness();
        const freshProvider = freshHarness.CreateProvider();
        const freshReloadedRun = {
            ID: pausedStepsRes.agentRun.ID,
            AgentID: AGENT_ID,
            Status: 'Paused',
            StartedAt: pausedStepsRes.agentRun.StartedAt,
            CompletedAt: null,
            Success: null,
            ErrorMessage: null,
            Message: null,
            UserID: USER_ID,
            TotalPromptIterations: pausedStepsRes.agentRun.TotalPromptIterations,
            TotalCost: pausedStepsRes.agentRun.TotalCost,
            TotalTokensUsed: pausedStepsRes.agentRun.TotalTokensUsed,
            Steps: [],
            Data: rawPersistedJson,
            RunawayCheckpoint: null,
            FinalPayloadObject: pausedStepsRes.agentRun.FinalPayloadObject,
            FinalPayload: pausedStepsRes.agentRun.FinalPayload,
        } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
        freshHarness.Runs.set(pausedStepsRes.agentRun.ID, freshReloadedRun);

        const reloadedCp = ExtractRunawayCheckpointFromRunData(rawPersistedJson);
        expect(reloadedCp?.PendingStepDecision?.forEach?.steps).toEqual([
            {
                id: 's1',
                name: 'ProcessBatchItem',
                params: { itemVal: '{{entry}}', stepTag: 'step-one' },
                condition: 'true',
                outputMapping: '{"status":"s1Last"}',
            },
            {
                id: 's2',
                name: 'ProcessBatchItem',
                params: { itemVal: '{{entry}}', stepTag: 'step-two' },
                condition: 'steps.s1.status == "ok"',
                outputMapping: '{"status":"s2Last"}',
            },
        ]);

        const checkpointManager = new RunawayCheckpointManager();
        await checkpointManager.ApproveCheckpoint({
            AgentRunID: pausedStepsRes.agentRun.ID,
            ApprovedByUserID: APPROVER_ID,
            Provider: freshProvider,
            ContextUser: contextUser,
        });

        // Fresh worker resumes ONLY item-1 without replaying item-0!
        const worker2 = new TestableCheckpointAgent([
            () =>
                makePromptResult(
                    {
                        taskComplete: true,
                        message: 'Multi-step ForEach completed cleanly after JSON-only reload',
                        payloadChangeRequest: { newElements: { done: true } },
                    },
                    0.02,
                    100,
                ),
        ]);
        const resumedStepsRes = await worker2.ResumePausedRun({
            agent: agentEntity,
            conversationMessages: [],
            contextUser,
            provider: freshProvider,
            userId: USER_ID,
            resumeCheckpointRunId: pausedStepsRes.agentRun.ID,
        });
        expect(resumedStepsRes.agentRun?.ErrorMessage ?? resumedStepsRes.errorMessage ?? null).toBeNull();
        expect(resumedStepsRes.success).toBe(true);
        expect(executedSteps).toEqual([
            { item: 'item-0', stepTag: 'step-one' },
            { item: 'item-0', stepTag: 'step-two' },
            { item: 'item-1', stepTag: 'step-one' },
            { item: 'item-1', stepTag: 'step-two' },
        ]);

        // Part B: JSON-only fresh-entity reload + RestoreNextStepFromDecision round-trip for prompt AND subAgent loops (ForEach & While),
        // plus live BaseAgent subAgent ForEach continuation on a fresh worker!
        const subAgentCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-cr17-variants',
            AgentRunID: '44444444-1111-4111-8111-000000000017',
            AgentID: AGENT_ID,
            AgentName: 'Cr17Agent',
            UserID: USER_ID,
            RoutineID: null,
            PausedAtISO: '2026-11-21T12:00:00.000Z',
            PausedAtMs: Date.UTC(2026, 10, 21, 12, 0, 0),
            PauseReason: 'ManualPause',
            Summary: 'Paused prompt & subAgent variants',
            CompletedStepCount: 1,
            CompletedStepIDs: ['s-prev'],
            CompletedPromptTurns: 1,
            CompletedNodeIDs: [],
            ConversationMessages: [],
            InFlightPayload: { items: ['alpha', 'beta'] },
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: 'ForEach',
            PendingStepDecision: {
                step: 'ForEach',
                terminate: false,
                newPayload: { items: ['alpha', 'beta'] },
                forEach: {
                    collectionPath: 'items',
                    itemVariable: 'doc',
                    prompt: {
                        name: 'SummarizeDocumentPrompt',
                        templateParameters: { docId: '{{doc}}', format: 'bullet' },
                        outputMapping: 'summaries[]',
                    },
                },
                while: {
                    condition: 'attempts < 3',
                    itemVariable: 'ctx',
                    subAgent: {
                        name: 'WorkerSubAgent',
                        message: 'Inspect attempt {{ctx.attemptNumber}}',
                        templateParameters: { mode: 'strict' },
                        context: { tenant: 'acme', traceId: 42 },
                    },
                },
            },
            LoopCursor: {
                LoopType: 'ForEach',
                ParentStepID: null,
                IterationIndex: 1,
                CompletedItemResults: [{ ok: true }],
                WorkingPayload: { items: ['alpha', 'beta'] },
            },
            Evidence: {},
            CumulativeLedger: {
                RunCostUsd: 0.1,
                RunWallClockMs: 500,
                RunTokens: 100,
                RoutineCostUsd: 0.1,
                RoutineWallClockMs: 500,
                UserDailyCostUsd: 0.1,
                UserDailyWallClockMs: 500,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: '2026-11-21T12:00:00.000Z',
            },
            HumanApproval: { Status: 'Approved' },
        };

        const serializedVariantsJson = AttachRunawayCheckpointToRunData(null, subAgentCheckpoint);
        const parsedVariantsCp = ExtractRunawayCheckpointFromRunData(serializedVariantsJson);
        expect(parsedVariantsCp).not.toBeNull();
        expect(parsedVariantsCp?.PendingStepDecision?.forEach?.prompt).toEqual({
            name: 'SummarizeDocumentPrompt',
            templateParameters: { docId: '{{doc}}', format: 'bullet' },
            outputMapping: 'summaries[]',
        });
        expect(parsedVariantsCp?.PendingStepDecision?.while?.subAgent).toEqual({
            name: 'WorkerSubAgent',
            message: 'Inspect attempt {{ctx.attemptNumber}}',
            templateParameters: { mode: 'strict' },
            context: { tenant: 'acme', traceId: 42 },
        });
        expect(ValidateLoopOperationStructure('ForEach', parsedVariantsCp!.PendingStepDecision!.forEach!)).toEqual([]);
        expect(ValidateLoopOperationStructure('While', parsedVariantsCp!.PendingStepDecision!.while!)).toEqual([]);

        const restoredDecision = checkpointManager.RestoreNextStepFromDecision(parsedVariantsCp?.PendingStepDecision);
        expect(restoredDecision?.forEach?.prompt).toEqual({
            name: 'SummarizeDocumentPrompt',
            templateParameters: { docId: '{{doc}}', format: 'bullet' },
            outputMapping: 'summaries[]',
        });
        expect(restoredDecision?.while?.subAgent).toEqual({
            name: 'WorkerSubAgent',
            message: 'Inspect attempt {{ctx.attemptNumber}}',
            templateParameters: { mode: 'strict' },
            context: { tenant: 'acme', traceId: 42 },
        });

        // Also test live ForEach subAgent resume on a fresh worker (reloaded purely from JSON Data)
        const childSubAgent = {
            ID: '11111111-2222-4333-8444-555555555555',
            ParentID: AGENT_ID,
            Name: 'WorkerSubAgent',
            TypeID: AGENT_TYPE_ID,
            Status: 'Active',
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;
        const baseAiInstance = AIEngine.Instance;
        const aiInstanceSpy = vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            ...baseAiInstance,
            Agents: [childSubAgent],
        });
        try {
            const subAgentInvocations: Array<{ name: string; message: string; context: unknown; tpl: Record<string, string> | undefined }> = [];
            const subAgentCp: RunawayCheckpointState = {
                ...subAgentCheckpoint,
                AgentRunID: '44444444-2222-4222-8222-000000000017',
                PendingStepDecision: {
                    step: 'ForEach',
                    terminate: false,
                    newPayload: { items: ['alpha', 'beta'] },
                    forEach: {
                        collectionPath: 'items',
                        itemVariable: 'doc',
                        subAgent: {
                            name: 'WorkerSubAgent',
                            message: 'Inspect {{doc}}',
                            templateParameters: { mode: 'strict' },
                            context: { tenant: 'acme', traceId: 77 },
                        },
                    },
                },
            };
            const subAgentRunId = subAgentCp.AgentRunID;
            const jsonOnlyRunData = AttachRunawayCheckpointToRunData(null, subAgentCp);
            const jsonOnlyRun = {
                ID: subAgentRunId,
                AgentID: AGENT_ID,
                Status: 'Paused',
                StartedAt: new Date(Date.now() - 2_000),
                CompletedAt: null,
                Success: null,
                ErrorMessage: null,
                Message: null,
                UserID: USER_ID,
                TotalPromptIterations: 1,
                TotalCost: 0.1,
                TotalTokensUsed: 100,
                Steps: [],
                Data: jsonOnlyRunData,
                get RunawayCheckpoint() {
                    return ExtractRunawayCheckpointFromRunData(this.Data);
                },
                set RunawayCheckpoint(_val: RunawayCheckpointState | null) {},
                FinalPayloadObject: { items: ['alpha', 'beta'] },
                FinalPayload: JSON.stringify({ items: ['alpha', 'beta'] }),
                LatestResult: { CompleteMessage: '' },
                Load: vi.fn(async (id: string) => id === subAgentRunId),
                Save: vi.fn(async () => true),
            } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
            harness.Runs.set(subAgentRunId, jsonOnlyRun);

            const freshSubAgentWorker = new TestableCheckpointAgent([
                () =>
                    makePromptResult(
                        {
                            taskComplete: true,
                            message: 'SubAgent ForEach resumed cleanly',
                            payloadChangeRequest: { newElements: { subAgentDone: true } },
                        },
                        0.02,
                        100,
                    ),
            ]);
            Object.defineProperty(freshSubAgentWorker, 'processSubAgentStep', {
                value: vi.fn(
                    async (
                        _p: ExecuteAgentParams,
                        step: { subAgent: { name: string; message: string; templateParameters?: Record<string, string>; context?: unknown } },
                        _parentStepId: string,
                        item: RunawayJsonValue,
                    ) => {
                        subAgentInvocations.push({
                            name: step.subAgent.name,
                            message: step.subAgent.message,
                            context: step.subAgent.context,
                            tpl: step.subAgent.templateParameters,
                        });
                        return { step: 'Retry' as const, terminate: false, newPayload: { items: ['alpha', 'beta'], processed: item } };
                    },
                ),
                configurable: true,
            });

            const resumedSub = await freshSubAgentWorker.ResumePausedRun({
                agent: agentEntity,
                conversationMessages: [],
                contextUser,
                provider,
                userId: USER_ID,
                resumeCheckpointRunId: subAgentRunId,
            });
            expect(resumedSub.success).toBe(true);
            // Resumed at IterationIndex=1 -> invoked ONLY once for item 'beta', preserving subAgent name/message/templateParameters/context
            expect(subAgentInvocations).toEqual([
                {
                    name: 'WorkerSubAgent',
                    message: 'Inspect {{doc}}',
                    tpl: { mode: 'strict' },
                    context: { tenant: 'acme', traceId: 77 },
                },
            ]);
        } finally {
            aiInstanceSpy.mockRestore();
        }
    });
});
