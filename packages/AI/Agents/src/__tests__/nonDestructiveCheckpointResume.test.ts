import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    ExtractRunawayCheckpointFromRunData,
    type AgentConfiguration,
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type OwnerPauseNotificationPayload,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentRequestEntity, MJAIAgentTypeEntity, MJAIPromptEntity, MJAIPromptRunEntity, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { BaseAgent } from '../base-agent';
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

const catalogMap = new Map<string, unknown>();

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
                    } as unknown as MJAIAgentTypeEntity,
                ],
                Prompts: [
                    {
                        ID: PROMPT_ID,
                        Name: 'Loop System Prompt',
                        TemplateText: 'System',
                        IsActive: true,
                    } as unknown as MJAIPromptEntity,
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
                SetAgentBaseCatalog: vi.fn((agentId: string, cat: unknown) => {
                    catalogMap.set(agentId, cat);
                }),
                ResolveAgentStorageAccountID: vi.fn(async () => null),
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
        return provider as unknown as IMetadataProvider;
    }

    private createMockRun(): MJAIAgentRunEntityExtended {
        const id = `77777777-7777-4777-8777-${String(this.nextRunCounter++).padStart(12, '0')}`;
        const steps: MJAIAgentRunStepEntityExtended[] = [];
        let dataJson: string | null = null;
        let checkpointCache: ReturnType<typeof ExtractRunawayCheckpointFromRunData> = null;
        let finalPayloadObj: unknown = null;
        let finalPayload: string | null = null;

        const run: Partial<MJAIAgentRunEntityExtended> & Record<string, unknown> = {
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
            set FinalPayloadObject(val) {
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
                finalPayloadObj = stored.FinalPayloadObject;
                steps.length = 0;
                steps.push(...stored.Steps);
                return true;
            }),
            Save: vi.fn(async () => {
                this.Runs.set(run.ID as string, run as unknown as MJAIAgentRunEntityExtended);
                return true;
            }),
            SetServerBoundActionParams: vi.fn(),
        };
        return run as unknown as MJAIAgentRunEntityExtended;
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

function makePromptResult(
    envelope: Record<string, unknown>,
    costUsd: number,
    tokens: number,
): AIPromptRunResult<Record<string, unknown>> {
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
        chatResult: {} as AIPromptRunResult<Record<string, unknown>>['chatResult'],
    };
}

class TestableCheckpointAgent extends BaseAgent {
    private readonly scriptedPromptCalls: Array<() => AIPromptRunResult<Record<string, unknown>>>;
    public readonly PromptCalls: AIPromptParams[] = [];

    constructor(scripted: Array<() => AIPromptRunResult<Record<string, unknown>>>) {
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
            } as unknown as MJAIAgentTypeEntity,
            systemPrompt: {
                ID: PROMPT_ID,
                Name: 'Loop System Prompt',
                TemplateText: 'System',
            } as unknown as AgentConfiguration['systemPrompt'],
            childPrompt: {
                ID: PROMPT_ID,
                Name: 'Child Prompt',
                TemplateText: 'Child',
            } as unknown as AgentConfiguration['childPrompt'],
        };
    }

    protected override async loadAgentTypePromptParams(): Promise<Record<string, unknown>> {
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
        } as unknown as MJAIAgentEntityExtended;

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
        } as unknown as MJAIAgentEntityExtended;

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
});
