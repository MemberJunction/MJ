/**
 * @fileoverview Security & server-guard-of-truth tests for EdgePreDiscoveryHint in
 * BaseAgent.InjectDecisionDiscovery and decision-discovery.ts.
 *
 * Verifies that tampered/forged EdgePreDiscoveryHint payloads carrying unauthorized,
 * non-runnable, sub-agent, host-excluded, or non-existent AgentIDs are silently
 * stripped without elevating privileges or breaking standard Jev / SearchEntity discovery.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import { AgentDecisionService, type AgentDecisionAskParams } from '../AgentDecisionService';
import {
    BuildDecisionDiscoveryOptionSet,
    DECISION_DISCOVERY_CALIBRATION,
    EvaluateEdgePreDiscoveryHint,
} from '../decision-discovery';
import {
    CalibrateEdgeLogitToConfidence,
    EDGE_PRE_DISCOVERY_DATA_KEY,
    type AIPromptParams,
    type AIPromptRunResult,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { DecisionResult, type ChatMessage, type ChoiceQuestion, type DecisionAnswer, type PlattCalibration } from '@memberjunction/ai';
import type { EntitySearchResult, IMetadataProvider, SearchEntityParams, UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';

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

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return harness.engineInstance;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return { Config: async (): Promise<void> => undefined, Actions: [] };
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
        FilterRunnableAgents: async <T extends { ID: string }>(agents: T[]): Promise<T[]> => {
            return agents.filter((a) => harness.runnableIDs.has(a.ID));
        },
        IsDirectlyDiscoverable: (agent: { ID: string }): boolean => !harness.subAgentIDs.has(agent.ID),
    },
}));

const SELF_ID = 'ffffffff-0000-4000-8000-000000000001';
const TYPE_ID = 'ffffffff-0000-4000-8000-000000000002';
const SYS_PROMPT_ID = 'ffffffff-0000-4000-8000-000000000003';
const CHILD_PROMPT_ID = 'ffffffff-0000-4000-8000-000000000004';
const STORAGE_ACCOUNT_ID = 'ffffffff-0000-4000-8000-000000000005';
const USER_ID = 'ffffffff-0000-4000-8000-000000000006';

interface AgentRow {
    ID: string;
    Name: string;
    Description: string | null;
    Status: string;
    TypeID: string;
    InvocationMode: string;
    ParentID: string | null;
    ExecutionOrder: number;
    DriverClass: string | null;
    Parent: string | null;
    DefaultStorageAccountID: string | null;
    CategoryID: string | null;
    ModelSelectionMode: string;
    DefaultPromptEffortLevel: number | null;
    ScopeConfig: string | null;
    PayloadSelfReadPaths: string | null;
    PayloadSelfWritePaths: string | null;
    PayloadScope: string | null;
    AllowMemoryWrite: boolean;
    ChatHandlingOption: string | null;
    FinalPayloadValidation: string | null;
    StartingPayloadValidation: string | null;
    InjectNotes: boolean;
    InjectExamples: boolean;
    RequirePlanMode: boolean;
    SupportsPlanMode: boolean;
    MaxCostPerRun: number | null;
    MaxTokensPerRun: number | null;
    MaxTimePerRun: number | null;
    MaxIterationsPerRun: number | null;
    AgentTypePromptParams: string | null;
    OwnerUserID: string | null;
}

function agentRow(id: string, name: string, description: string | null, promptParams: Record<string, unknown> | null = null): AgentRow {
    return {
        ID: id,
        Name: name,
        Description: description,
        Status: 'Active',
        TypeID: TYPE_ID,
        InvocationMode: 'Top-Level',
        ParentID: null,
        ExecutionOrder: 0,
        DriverClass: null,
        Parent: null,
        DefaultStorageAccountID: STORAGE_ACCOUNT_ID,
        CategoryID: null,
        ModelSelectionMode: 'Agent Type',
        DefaultPromptEffortLevel: null,
        ScopeConfig: null,
        PayloadSelfReadPaths: null,
        PayloadSelfWritePaths: null,
        PayloadScope: null,
        AllowMemoryWrite: false,
        ChatHandlingOption: null,
        FinalPayloadValidation: null,
        StartingPayloadValidation: null,
        InjectNotes: false,
        InjectExamples: false,
        RequirePlanMode: false,
        SupportsPlanMode: false,
        MaxCostPerRun: null,
        MaxTokensPerRun: null,
        MaxTimePerRun: null,
        MaxIterationsPerRun: null,
        AgentTypePromptParams: promptParams ? JSON.stringify(promptParams) : null,
        OwnerUserID: null,
    };
}

const ON = { decisionsEnabled: true, decisionDiscovery: true };
const RESEARCH = agentRow('ffffffff-1000-4000-8000-000000000001', 'Research Agent', 'Researches topics on the web');
const BILLING = agentRow('ffffffff-1000-4000-8000-000000000002', 'Billing Agent', 'Handles invoices and payments');
const MARKETING = agentRow('ffffffff-1000-4000-8000-000000000003', 'Marketing Agent', 'Writes marketing copy');
const SUPPORT = agentRow('ffffffff-1000-4000-8000-000000000006', 'Support Agent', 'Handles customer support tickets');
const UNAUTHORIZED = agentRow('ffffffff-1000-4000-8000-000000000004', 'Secret Admin Agent', 'Privileged agent user cannot run');
const SUB_AGENT = agentRow('ffffffff-1000-4000-8000-000000000005', 'Internal Sub Agent', 'Sub-agent only');
const NON_EXISTENT_ID = 'ffffffff-9999-4999-8999-999999999999';

class MockRunEntity {
    public ID = 'ffffffff-5000-4000-8000-000000000001';
    public AgentID = '';
    public Status = '';
    public StartedAt: Date | null = null;
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public UserID: string | null = null;
    public CompanyID: string | null = null;
    public ParentRunID: string | null = null;
    public StartingPayload: string | null = null;
    public Verbose = false;
    public TotalPromptIterations = 0;
    public Result: string | null = null;
    public FinalStep: string | null = null;
    public Message: string | null = null;
    public FinalPayload: string | null = null;
    public FinalPayloadObject: unknown = undefined;
    public PlanMode = false;
    public TotalTokensUsed = 0;
    public TotalPromptTokensUsed = 0;
    public TotalCompletionTokensUsed = 0;
    public TotalCacheReadTokensUsed = 0;
    public TotalCacheWriteTokensUsed = 0;
    public TotalCost = 0;
    public Steps: MockStepEntity[] = [];
    public async Save(): Promise<boolean> {
        return true;
    }
}

class MockStepEntity {
    public ID = '';
    public AgentRunID = '';
    public StepNumber = 0;
    public StepType = '';
    public StepName = '';
    public TargetID: string | null = null;
    public TargetLogID: string | null = null;
    public ParentID: string | null = null;
    public Status = '';
    public StartedAt: Date = new Date(0);
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public InputData: string | null = null;
    public OutputData: string | null = null;
    public PayloadAtStart: string | null = null;
    public PayloadAtEnd: string | null = null;
    public Skills: string | null = null;
    public PromptRun: MJAIPromptRunEntity | undefined = undefined;
    constructor(private readonly seq: number) {}
    public NewRecord(): void {
        this.ID = `ffffffff-4000-4000-8000-${String(this.seq).padStart(12, '0')}`;
    }
    public async Save(): Promise<boolean> {
        return true;
    }
}

class RecordingPromptRunner {
    public readonly MessagesAtCall: ChatMessage[][] = [];
    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        this.MessagesAtCall.push(
            (params.conversationMessages ?? []).filter((m) => (m.metadata as { volatileState?: boolean } | undefined)?.volatileState !== true)
        );
        const done: LoopAgentResponse = { taskComplete: true, message: 'Done' };
        return { success: true, result: JSON.stringify(done), chatResult: {} as AIPromptRunResult['chatResult'] };
    }
}

class SecurityDiscoveryHarness {
    public self: AgentRow = agentRow(SELF_ID, 'Sage', 'Routes requests', ON);
    public catalog: AgentRow[] = [RESEARCH, BILLING, MARKETING, SUPPORT, UNAUTHORIZED, SUB_AGENT];
    public runnableIDs = new Set<string>([SELF_ID, RESEARCH.ID, BILLING.ID, MARKETING.ID, SUPPORT.ID, SUB_AGENT.ID]);
    public subAgentIDs = new Set<string>([SUB_AGENT.ID]);
    public steps: MockStepEntity[] = [];
    private stepSeq = 0;
    private readonly baseCatalog = new Map<string, unknown>();

    public get engineInstance(): Record<string, unknown> {
        return {
            Config: async (): Promise<void> => undefined,
            Agents: [this.self, ...this.catalog],
            AgentRelationships: [],
            AgentCategories: [],
            ResolveAgentStorageAccountID: () => null,
            ScopedPromptParts: [],
            ScopedPromptConfigs: [],
            AgentTypes: [
                {
                    ID: TYPE_ID,
                    Name: 'Loop',
                    DriverClass: 'LoopAgentType',
                    SystemPromptID: SYS_PROMPT_ID,
                    AgentPromptPlaceholder: '_AGENT_PROMPT_',
                    PromptParamsSchema: null,
                    DefaultStorageAccountID: null,
                },
            ],
            Prompts: [
                { ID: SYS_PROMPT_ID, Name: 'Loop System Prompt', EffortLevel: null },
                { ID: CHILD_PROMPT_ID, Name: 'Child Prompt', EffortLevel: null },
            ],
            PromptModels: [],
            ModelVendors: [],
            GetEffectiveModelConfiguration: (): unknown => ({ Decision: { MaxChoiceOptions: null } }),
            AgentPrompts: [{ ID: 'p1', AgentID: SELF_ID, PromptID: CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 }],
            AgentActions: [],
            GetSubAgents: (): unknown[] => [],
            GetAutoActivatableSkillsForAgent: (): unknown[] => [],
            GetSkillsForAgent: (): unknown[] => [],
            GetClientToolsForAgent: (): unknown[] => [],
            GetAgentBaseCatalog: (id: string) => this.baseCatalog.get(id),
            SetAgentBaseCatalog: (id: string, c: unknown) => this.baseCatalog.set(id, c),
        };
    }

    public readonly provider = {
        GetEntityObject: async (entityName: string): Promise<unknown> => {
            if (entityName === 'MJ: AI Agent Runs') {
                return new MockRunEntity();
            }
            if (entityName === 'MJ: AI Agent Run Steps') {
                const s = new MockStepEntity(++this.stepSeq);
                this.steps.push(s);
                return s;
            }
            throw new Error(`Unexpected entity ${entityName}`);
        },
    };
}

let harness: SecurityDiscoveryHarness;

class TestBaseAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }
}

function makeAgent(): { agent: TestBaseAgent; runner: RecordingPromptRunner } {
    const agent = new TestBaseAgent();
    const runner = new RecordingPromptRunner();
    (agent as unknown as { _promptRunner: RecordingPromptRunner })._promptRunner = runner;
    return { agent, runner };
}

function makeParams(data?: Record<string, unknown>, extraProvider?: Record<string, unknown>): ExecuteAgentParams {
    return {
        agent: harness.self as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'Handle my customer invoice' }],
        contextUser: { ID: USER_ID, Name: 'Tester', Email: 't@mj.test' } as unknown as UserInfo,
        provider: (extraProvider ?? harness.provider) as unknown as IMetadataProvider,
        disableDataPreloading: true,
        ...(data ? { data } : {}),
    };
}

function jevAnswerFor(picked: AgentRow, confidence = 0.92, applies = 0.95): (args: AgentDecisionAskParams) => Promise<AIDecisionRunResult> {
    const cal = DECISION_DISCOVERY_CALIBRATION.find((c) => c.ModelName === 'Jev')!.Calibration;
    const inv = (p: number, pc: PlattCalibration): number => 1 / (1 + Math.exp(-(Math.log(p / (1 - p)) - pc.B) / pc.A));
    const rawC = inv(confidence, cal.Confidence);
    const rawA = inv(applies, cal.AnyApplies);
    return async (args) => {
        const opts = (args.Questions.agent as ChoiceQuestion).Options;
        const probs: Record<string, number> = {};
        for (const o of opts) {
            probs[o.Value] = o.Value === picked.ID ? rawC : (1 - rawC) / Math.max(1, opts.length - 1);
        }
        const dr = new DecisionResult(true, new Date(0), new Date(1));
        dr.ResolvedModel = 'typesafe/jev-1.13-20260917';
        const answers: Record<string, DecisionAnswer> = {
            agent: { Kind: 'Choice', Value: picked.ID, Confidence: rawC, Probabilities: probs },
            anyApplies: { Kind: 'Likelihood', Probability: rawA },
        };
        return { success: true, Answers: answers, modelInfo: { modelId: 'm1', modelName: 'Jev' }, DecisionResult: dr };
    };
}

describe('EdgePreDiscoveryHint — server guard of truth & security sanitization', () => {
    beforeEach(() => {
        harness = new SecurityDiscoveryHarness();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('EvaluateEdgePreDiscoveryHint discards unauthorized, sub-agent, and non-existent IDs silently', () => {
        const permitted = [
            { ID: RESEARCH.ID, Name: RESEARCH.Name, Description: RESEARCH.Description! },
            { ID: BILLING.ID, Name: BILLING.Name, Description: BILLING.Description! },
            { ID: MARKETING.ID, Name: MARKETING.Name, Description: MARKETING.Description! },
        ];
        const evaluation = EvaluateEdgePreDiscoveryHint(
            {
                CandidateAgentIds: [UNAUTHORIZED.ID, SUB_AGENT.ID, NON_EXISTENT_ID, BILLING.ID],
                SuggestedAgentId: UNAUTHORIZED.ID,
                Confidence: 0.99,
                TopLogit: 2.0,
            },
            permitted
        );

        expect(evaluation.DirectOutcome).toBeNull();
        expect(evaluation.DiscardedCount).toBe(4);
        expect(evaluation.SanitizedHint?.CandidateAgentIds).toEqual([BILLING.ID]);
        expect(evaluation.SanitizedHint?.SuggestedAgentId).toBeUndefined();
    });

    it('BaseAgent.Execute strips forged unauthorized SuggestedAgentId and falls back to server Jev', async () => {
        const askSpy = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(jevAnswerFor(BILLING));
        const { agent, runner } = makeAgent();

        await agent.Execute(
            makeParams({
                [EDGE_PRE_DISCOVERY_DATA_KEY]: {
                    CandidateAgentIds: [UNAUTHORIZED.ID, SUB_AGENT.ID, NON_EXISTENT_ID],
                    SuggestedAgentId: UNAUTHORIZED.ID,
                    Confidence: 0.99,
                    TopLogit: 3.0,
                },
            })
        );

        // Unauthorized suggestion NEVER injected; server Jev ran and suggested permitted BILLING
        expect(askSpy).toHaveBeenCalledTimes(1);
        const sysMsgs = runner.MessagesAtCall[0].filter((m) => typeof m.content === 'string' && m.content.includes('<suggested_agent>'));
        expect(sysMsgs).toHaveLength(1);
        expect(String(sysMsgs[0].content)).toContain(BILLING.Name);
        expect(String(sysMsgs[0].content)).not.toContain(UNAUTHORIZED.Name);
        const discoveryStep = harness.steps.find((s) => s.StepName.includes('Agent discovery'));
        const out = JSON.parse(discoveryStep?.OutputData ?? '{}');
        expect(out.edgePreDiscovery?.discardedCount).toBe(4);
    });

    it('BaseAgent.Execute strips hinted agents excluded by ALL_AVAILABLE_AGENTS allow-list', async () => {
        const askSpy = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(jevAnswerFor(MARKETING));
        const { agent, runner } = makeAgent();

        await agent.Execute(
            makeParams({
                ALL_AVAILABLE_AGENTS: [
                    { ID: RESEARCH.ID, Name: RESEARCH.Name, Description: RESEARCH.Description },
                    { ID: MARKETING.ID, Name: MARKETING.Name, Description: MARKETING.Description },
                    { ID: SUPPORT.ID, Name: SUPPORT.Name, Description: SUPPORT.Description },
                    { ID: UNAUTHORIZED.ID, Name: UNAUTHORIZED.Name, Description: UNAUTHORIZED.Description },
                ],
                [EDGE_PRE_DISCOVERY_DATA_KEY]: {
                    CandidateAgentIds: [BILLING.ID, RESEARCH.ID],
                    SuggestedAgentId: BILLING.ID, // permitted globally, but NOT in host allow-list!
                    Confidence: 0.95,
                    TopLogit: -0.5,
                },
            })
        );

        expect(askSpy).toHaveBeenCalledTimes(1);
        const sysMsgs = runner.MessagesAtCall[0].filter((m) => typeof m.content === 'string' && m.content.includes('<suggested_agent>'));
        expect(String(sysMsgs[0].content)).toContain(MARKETING.Name);
        expect(String(sysMsgs[0].content)).not.toContain(BILLING.Name);
    });

    it('rejects forged high Confidence when TopLogit is below -2.0 threshold and falls back to server Jev', async () => {
        const askSpy = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockImplementation(jevAnswerFor(BILLING));
        const { agent, runner } = makeAgent();

        await agent.Execute(
            makeParams({
                [EDGE_PRE_DISCOVERY_DATA_KEY]: {
                    CandidateAgentIds: [RESEARCH.ID, BILLING.ID, MARKETING.ID],
                    SuggestedAgentId: RESEARCH.ID,
                    Confidence: 0.99, // forged high confidence
                    TopLogit: -4.2,   // raw logit below -2.0 threshold
                },
            })
        );

        expect(askSpy).toHaveBeenCalledTimes(1);
        const sysMsgs = runner.MessagesAtCall[0].filter((m) => typeof m.content === 'string' && m.content.includes('<suggested_agent>'));
        expect(String(sysMsgs[0].content)).toContain(BILLING.Name);
    });

    it('accepts verified confident EdgePreDiscoveryHint fast-path without invoking server Jev', async () => {
        const askSpy = vi.spyOn(AgentDecisionService.prototype, 'Ask');
        const { agent, runner } = makeAgent();

        await agent.Execute(
            makeParams({
                [EDGE_PRE_DISCOVERY_DATA_KEY]: {
                    CandidateAgentIds: [BILLING.ID, RESEARCH.ID, MARKETING.ID],
                    SuggestedAgentId: BILLING.ID,
                    TopLogit: -1.2,
                    Confidence: CalibrateEdgeLogitToConfidence(-1.2),
                    ModelId: 'Xenova/bge-small-en-v1.5@q8+Xenova/ms-marco-MiniLM-L-6-v2@q8',
                },
            })
        );

        expect(askSpy).not.toHaveBeenCalled();
        const sysMsgs = runner.MessagesAtCall[0].filter((m) => typeof m.content === 'string' && m.content.includes('<suggested_agent>'));
        expect(sysMsgs).toHaveLength(1);
        expect(String(sysMsgs[0].content)).toContain(BILLING.Name);
        const discoveryStep = harness.steps.find((s) => s.StepName.includes('Agent discovery'));
        const out = JSON.parse(discoveryStep?.OutputData ?? '{}');
        expect(out.source).toBe('edge-pre-discovery');
        expect(out.injected).toBe(true);
    });

    it('narrows >25-agent catalog using verified PreferredCandidateIDs without calling SearchEntity, and falls back when <3 valid IDs survive', async () => {
        const largeAgents = Array.from({ length: 30 }, (_, i) => ({
            ID: `ffffffff-2000-4000-8000-${String(i + 1).padStart(12, '0')}`,
            Name: `Agent ${i + 1}`,
            Description: `Handles domain ${i + 1}`,
            Status: 'Active',
            InvocationMode: 'Top-Level',
            ParentID: null,
        }));
        const searchSpy = vi.fn(async (): Promise<EntitySearchResult[]> =>
            largeAgents.slice(0, 5).map((a, idx) => ({
                entityRecordDocumentId: null,
                recordId: a.ID,
                score: 1 / (idx + 1),
                matchType: 'hybrid',
                components: {},
            }))
        );

        // 1) >= 3 permitted candidate IDs -> skips SearchEntity completely
        const narrowed = await BuildDecisionDiscoveryOptionSet({
            Agents: largeAgents,
            RunningAgentID: SELF_ID,
            PreferredCandidateIDs: [largeAgents[3].ID, largeAgents[7].ID, largeAgents[12].ID, largeAgents[19].ID],
            Search: searchSpy,
        });
        expect(searchSpy).not.toHaveBeenCalled();
        expect(narrowed.NarrowedFrom).toBe(30);
        expect(narrowed.Options.map((o) => o.ID)).toEqual([
            largeAgents[3].ID,
            largeAgents[7].ID,
            largeAgents[12].ID,
            largeAgents[19].ID,
        ]);

        // 2) < 3 valid IDs -> falls back to SearchEntity
        const fallback = await BuildDecisionDiscoveryOptionSet({
            Agents: largeAgents,
            RunningAgentID: SELF_ID,
            PreferredCandidateIDs: [NON_EXISTENT_ID, largeAgents[3].ID],
            Search: searchSpy,
        });
        expect(searchSpy).toHaveBeenCalledTimes(1);
        expect(fallback.Options).toHaveLength(5);
    });

    it('does not inject anything from EdgePreDiscoveryHint when decisionsEnabled or decisionDiscovery is off', async () => {
        harness.self = agentRow(SELF_ID, 'Sage', 'Routes requests', { decisionsEnabled: false, decisionDiscovery: true });
        const { agent, runner } = makeAgent();

        await agent.Execute(
            makeParams({
                [EDGE_PRE_DISCOVERY_DATA_KEY]: {
                    CandidateAgentIds: [BILLING.ID, RESEARCH.ID, MARKETING.ID],
                    SuggestedAgentId: BILLING.ID,
                    TopLogit: -0.5,
                    Confidence: 0.97,
                },
            })
        );

        expect(harness.steps.filter((s) => s.StepName.includes('Agent discovery'))).toHaveLength(0);
        const sysMsgs = runner.MessagesAtCall[0].filter((m) => typeof m.content === 'string' && m.content.includes('<suggested_agent>'));
        expect(sysMsgs).toHaveLength(0);
    });
});
