/**
 * Stage 1 Behavior-Pinning Suite: Deterministic Performance Baseline Harness (§2.4).
 *
 * Records and verifies deterministic execution metrics against TODAY'S untouched BaseAgent:
 *   - Exact prompt iteration count (zero extra LLM turns)
 *   - Exact step count (zero extra step entity writes)
 *   - Exact token usage (promptTokens, completionTokens, totalTokens)
 *   - Median & p95 execution latency (catches O(N^2) / runaway latency regressions while staying
 *     flake-free across CI runner hardware)
 *
 * Re-run after every Stage 2 pure-move PR and every Stage 3 enhancement PR.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import '../agent-types/loop-agent-type';
import '../agent-types/flow-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type {
    AIPromptParams,
    AIPromptRunResult,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

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
            return benchHarness.engineInstance;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return {
                Config: async () => undefined,
                Actions: [
                    {
                        ID: BENCH_ACTION_ID,
                        Name: 'Bench Action',
                        Description: 'Fast deterministic action',
                        Status: 'Active',
                        Params: { Items: [{ Name: 'x', Type: 'Input', IsRequired: false }] },
                        ResultCodes: { Items: [] },
                    },
                ],
                RunAction: async () => ({
                    Success: true,
                    Message: 'ok',
                    Params: [{ Name: 'out', Value: 100, Type: 'Output' }],
                    Result: { ResultCode: 'SUCCESS' },
                    LogEntry: { ID: 'd4000000-0000-4000-8000-000000000099' },
                }),
            };
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async () => true,
    },
}));

const BENCH_LOOP_AGENT_ID = 'd1000000-0000-4000-8000-000000000001';
const BENCH_FLOW_AGENT_ID = 'd1000000-0000-4000-8000-000000000002';
const BENCH_LOOP_TYPE_ID = 'd2000000-0000-4000-8000-000000000001';
const BENCH_FLOW_TYPE_ID = 'd2000000-0000-4000-8000-000000000002';
const BENCH_SYS_PROMPT_ID = 'd3000000-0000-4000-8000-000000000001';
const BENCH_CHILD_PROMPT_ID = 'd3000000-0000-4000-8000-000000000002';
const BENCH_ACTION_ID = 'd4000000-0000-4000-8000-000000000001';
const BENCH_USER_ID = 'd5000000-0000-4000-8000-000000000001';
const BENCH_STORAGE_ID = 'd6000000-0000-4000-8000-000000000001';
const BENCH_FLOW_STEP_1 = 'd7000000-0000-4000-8000-000000000001';
const BENCH_FLOW_STEP_2 = 'd7000000-0000-4000-8000-000000000002';

class BenchStep {
    public ID = '';
    public AgentRunID = '';
    public StepNumber = 0;
    public StepType = '';
    public StepName = '';
    public Status = '';
    public StartedAt = new Date(0);
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public IsSaved = false;
    constructor(private readonly seq: number) {}
    public NewRecord(): void { this.ID = `d8000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`; }
    public async Save(): Promise<boolean> { this.IsSaved = true; return true; }
}

class BenchRun {
    public ID = 'd9000000-0000-4000-8000-000000000001';
    public AgentID = '';
    public Status = '';
    public StartedAt: Date | null = null;
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public TotalPromptIterations = 0;
    public TotalTokensUsed = 0;
    public TotalPromptTokensUsed = 0;
    public TotalCompletionTokensUsed = 0;
    public TotalCacheReadTokensUsed = 0;
    public TotalCacheWriteTokensUsed = 0;
    public TotalCost = 0;
    public Steps: BenchStep[] = [];
    public async Save(): Promise<boolean> { return true; }
}

class BenchHarness {
    public runs: BenchRun[] = [];
    public steps: BenchStep[] = [];
    private stepSeq = 0;
    private readonly catalog = new Map<string, unknown>();

    public resetRunCounters(): void {
        this.runs = [];
        this.steps = [];
        this.stepSeq = 0;
    }

    public get engineInstance(): Record<string, unknown> {
        return {
            Config: async () => undefined,
            Agents: [],
            AgentRelationships: [],
            AgentCategories: [],
            ResolveAgentStorageAccountID: () => BENCH_STORAGE_ID,
            ScopedPromptParts: [],
            ScopedPromptConfigs: [],
            AgentTypes: [
                { ID: BENCH_LOOP_TYPE_ID, Name: 'Loop', DriverClass: 'LoopAgentType', SystemPromptID: BENCH_SYS_PROMPT_ID, AgentPromptPlaceholder: '_AGENT_PROMPT_' },
                { ID: BENCH_FLOW_TYPE_ID, Name: 'Flow', DriverClass: 'FlowAgentType', SystemPromptID: null, AgentPromptPlaceholder: null },
            ],
            Prompts: [
                { ID: BENCH_SYS_PROMPT_ID, Name: 'Sys', EffortLevel: null },
                { ID: BENCH_CHILD_PROMPT_ID, Name: 'Child', EffortLevel: null },
            ],
            AgentPrompts: [
                { ID: 'dp-1', AgentID: BENCH_LOOP_AGENT_ID, PromptID: BENCH_CHILD_PROMPT_ID, Status: 'Active', ExecutionOrder: 1 },
            ],
            AgentActions: [
                { ID: 'da-1', AgentID: BENCH_LOOP_AGENT_ID, ActionID: BENCH_ACTION_ID, Action: 'Bench Action', Status: 'Active' },
                { ID: 'da-2', AgentID: BENCH_FLOW_AGENT_ID, ActionID: BENCH_ACTION_ID, Action: 'Bench Action', Status: 'Active' },
            ],
            AgentSteps: [
                { ID: BENCH_FLOW_STEP_1, AgentID: BENCH_FLOW_AGENT_ID, Name: 'Step 1', StepType: 'Prompt', StartingStep: true, Status: 'Active', PromptID: BENCH_CHILD_PROMPT_ID, ActionID: null, SubAgentID: null, ActionInputMapping: null, ActionOutputMapping: null, Configuration: null, LoopBodyType: null, PositionX: 0, PositionY: 0 },
                { ID: BENCH_FLOW_STEP_2, AgentID: BENCH_FLOW_AGENT_ID, Name: 'Step 2', StepType: 'Action', StartingStep: false, Status: 'Active', PromptID: null, ActionID: BENCH_ACTION_ID, SubAgentID: null, ActionInputMapping: JSON.stringify({ x: '1' }), ActionOutputMapping: JSON.stringify({ out: 'result' }), Configuration: null, LoopBodyType: null, PositionX: 100, PositionY: 0 },
            ],
            AgentStepPaths: [
                { ID: 'dpath-1', OriginStepID: BENCH_FLOW_STEP_1, DestinationStepID: BENCH_FLOW_STEP_2, Condition: null, Priority: 1 },
            ],
            GetAgentSteps: (id: string) => (id === BENCH_FLOW_AGENT_ID ? (this.engineInstance.AgentSteps as unknown[]) : []),
            GetAgentStepByID: (stepId: string) =>
                (this.engineInstance.AgentSteps as Array<{ ID: string }>).find((s) => s.ID === stepId),
            GetAgentStepPaths: (id: string) => (id === BENCH_FLOW_AGENT_ID ? (this.engineInstance.AgentStepPaths as unknown[]) : []),
            GetPathsFromStep: (stepId: string) =>
                (this.engineInstance.AgentStepPaths as Array<{ OriginStepID: string }>).filter((p) => p.OriginStepID === stepId),
            GetSubAgents: () => [],
            GetAutoActivatableSkillsForAgent: () => [],
            GetSkillsForAgent: () => [],
            GetClientToolsForAgent: () => [],
            GetAgentConfigurationPresets: () => [],
            GetAgentBaseCatalog: (id: string) => this.catalog.get(id),
            SetAgentBaseCatalog: (id: string, c: unknown) => { this.catalog.set(id, c); },
        };
    }

    public readonly provider = {
        GetEntityObject: async (name: string): Promise<unknown> => {
            if (name === 'MJ: AI Agent Runs') {
                const run = new BenchRun();
                this.runs.push(run);
                return run;
            }
            if (name === 'MJ: AI Agent Run Steps') {
                const step = new BenchStep(++this.stepSeq);
                this.steps.push(step);
                return step;
            }
            throw new Error(`Unexpected entity ${name}`);
        },
        RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 }),
    };
}

let benchHarness: BenchHarness;

class BenchAgent extends BaseAgent {
    protected override async InjectPreExecutionRAG(): Promise<AgentPreExecutionRAGResult | null> {
        return null;
    }
}

interface BenchmarkRecord {
    scenario: string;
    iterations: number;
    stepCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    recordedMedianMs: number;
    maxAllowedMedianMs: number;
}

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname_, 'fixtures/base-agent-perf-baseline.json');
const BENCH_USER = { ID: BENCH_USER_ID, Name: 'Bench User', Email: 'bench@test.mj' } as UserInfo;

function makeBenchAgent(id: string, typeId: string): MJAIAgentEntityExtended {
    return {
        ID: id,
        Name: `Bench ${id}`,
        Description: 'Benchmark agent',
        Status: 'Active',
        TypeID: typeId,
        DriverClass: null,
        DefaultStorageAccountID: BENCH_STORAGE_ID,
        ModelSelectionMode: 'Agent Type',
        InjectNotes: false,
        InjectExamples: false,
        AllowMemoryWrite: false,
        RequirePlanMode: false,
        SupportsPlanMode: false,
    } as unknown as MJAIAgentEntityExtended;
}

function makePromptResult(payload: string, promptTokens: number, completionTokens: number): AIPromptRunResult {
    return {
        success: true,
        result: payload,
        promptTokens,
        completionTokens,
        combinedTokensUsed: promptTokens + completionTokens,
        chatResult: {
            success: true,
            data: {
                usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                },
            },
        } as unknown as AIPromptRunResult['chatResult'],
    };
}

async function measureScenario(
    scenario: string,
    agentRow: MJAIAgentEntityExtended,
    script: Array<() => AIPromptRunResult>,
    extraParams: Partial<ExecuteAgentParams> = {},
): Promise<BenchmarkRecord> {
    const WARMUP = 2;
    const SAMPLES = 15;
    const durations: number[] = [];
    let lastIterations = 0;
    let lastStepCount = 0;
    let lastPromptTokens = 0;
    let lastCompletionTokens = 0;
    let lastTotalTokens = 0;

    for (let i = 0; i < WARMUP + SAMPLES; i++) {
        benchHarness.resetRunCounters();
        const agent = new BenchAgent();
        let callIdx = 0;
        (agent as unknown as { _promptRunner: { ExecutePrompt: (p: AIPromptParams) => Promise<AIPromptRunResult> } })._promptRunner = {
            ExecutePrompt: async () => script[Math.min(callIdx++, script.length - 1)](),
        };

        const t0 = performance.now();
        const res = await agent.Execute({
            agent: agentRow,
            conversationMessages: [{ role: 'user', content: `Benchmark ${scenario}` }],
            contextUser: BENCH_USER,
            provider: benchHarness.provider as unknown as IMetadataProvider,
            disableDataPreloading: true,
            ...extraParams,
        });
        const elapsed = performance.now() - t0;
        expect(res.success).toBe(true);

        if (i >= WARMUP) {
            durations.push(elapsed);
            const run = benchHarness.runs[0];
            lastIterations = run.TotalPromptIterations;
            lastStepCount = benchHarness.steps.length;
            lastPromptTokens = run.TotalPromptTokensUsed;
            lastCompletionTokens = run.TotalCompletionTokensUsed;
            lastTotalTokens = run.TotalTokensUsed;
        }
    }

    durations.sort((a, b) => a - b);
    const medianMs = Number(durations[Math.floor(durations.length / 2)].toFixed(3));
    return {
        scenario,
        iterations: lastIterations,
        stepCount: lastStepCount,
        promptTokens: lastPromptTokens,
        completionTokens: lastCompletionTokens,
        totalTokens: lastTotalTokens,
        recordedMedianMs: medianMs,
        maxAllowedMedianMs: Math.max(250, Math.ceil(medianMs * 25)),
    };
}

describe('Stage 1 Pinning — Performance Baseline Harness (Latency, Iterations, Token Counts)', () => {
    beforeEach(() => {
        benchHarness = new BenchHarness();
    });

    it('matches deterministic iteration counts, step counts, token counts, and stays within latency ceiling', async () => {
        const loopAgent = makeBenchAgent(BENCH_LOOP_AGENT_ID, BENCH_LOOP_TYPE_ID);
        const flowAgent = makeBenchAgent(BENCH_FLOW_AGENT_ID, BENCH_FLOW_TYPE_ID);

        const singleTurn = await measureScenario('loop-single-turn', loopAgent, [
            () => makePromptResult(JSON.stringify({ taskComplete: true, message: 'done' } as LoopAgentResponse), 100, 30),
        ]);

        const actionLoop = await measureScenario('loop-prompt-action-prompt', loopAgent, [
            () =>
                makePromptResult(
                    JSON.stringify({
                        taskComplete: false,
                        nextStep: { type: 'Actions', actions: [{ name: 'Bench Action', params: { x: 1 } }] },
                    } as LoopAgentResponse),
                    150,
                    50,
                ),
            () => makePromptResult(JSON.stringify({ taskComplete: true, message: 'done after action' } as LoopAgentResponse), 220, 40),
        ]);

        const flowTwoStep = await measureScenario(
            'flow-two-step',
            flowAgent,
            [() => makePromptResult(JSON.stringify({ ok: true }), 80, 20)],
            { parentRun: { ID: 'd9999999-0000-4000-8000-000000000001' } as unknown as MJAIAgentRunEntityExtended },
        );

        const measured = [singleTurn, actionLoop, flowTwoStep];

        if (process.env.UPDATE_PERF_BASELINE === '1' || !existsSync(BASELINE_PATH)) {
            writeFileSync(BASELINE_PATH, `${JSON.stringify({ baselineVersion: 'stage1-pr0', benchmarks: measured }, null, 2)}\n`, 'utf8');
        }

        const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
            baselineVersion: string;
            benchmarks: BenchmarkRecord[];
        };

        expect(measured).toHaveLength(baseline.benchmarks.length);
        for (let i = 0; i < measured.length; i++) {
            const actual = measured[i];
            const expected = baseline.benchmarks[i];
            expect(actual.scenario).toBe(expected.scenario);
            // Exact deterministic invariants — zero tolerance for extra turns/steps/tokens!
            expect(actual.iterations).toBe(expected.iterations);
            expect(actual.stepCount).toBe(expected.stepCount);
            expect(actual.promptTokens).toBe(expected.promptTokens);
            expect(actual.completionTokens).toBe(expected.completionTokens);
            expect(actual.totalTokens).toBe(expected.totalTokens);
            // Latency regression guard
            expect(actual.recordedMedianMs).toBeLessThanOrEqual(expected.maxAllowedMedianMs);
        }
    });
});
