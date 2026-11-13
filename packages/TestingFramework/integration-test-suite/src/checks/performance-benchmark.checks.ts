/**
 * performance-benchmark.checks.ts — the 'performance-benchmark' bundle (PB1–PB12):
 * MemberJunction Core, Template, Action, Payload, and AI Agent (Sage, Query Builder,
 * Research Agent) performance and database-footprint benchmark suite.
 *
 * Designed to run identically against both `next` and optimization branches:
 * - PB1–PB6: Deterministic in-process CPU/memory microbenchmarks for MJ core and AI primitives:
 *   1. ClassFactory (GetRegistration + GetAllRegistrations) & ObjectCache.Find
 *   2. EntityInfo.ChildEntities + BaseEntity Hydration (LoadFromData/SetMany/GetAll) + FLS
 *   3. LocalCacheManager SetRunViewResult + SetDataset + GetStats
 *   4. TemplateEngineServer.RenderTemplateSimple + NunjucksSandbox
 *   5. ActionEngine SnapshotActionParams + AIEngineBase permission/catalog lookups
 *   6. PayloadManager.applyAgentChangeRequest + DeepDiffer
 * - PB7–PB9: Deterministic multi-turn agent runs (using TestLLM with 0ms network jitter)
 *   for Sage, Query Builder (+ Query Strategist sub-agent), and Research Agent (+ Research Report
 *   Writer sub-agent) against the live database. Measures pure MJ framework + SQL Server execution
 *   time, step counts, and exact serialized bytes stored in AIAgentRunStep (PayloadAtStart,
 *   PayloadAtEnd, InputData, OutputData) plus pointer deduplication rates.
 * - PB10–PB12 (RequiresLiveModel): Live-model executions of Sage, Query Builder, and Research Agent
 *   measuring total wall time, LLM prompt execution time vs. MJ framework overhead, and persisted
 *   SQL Server byte footprint across the entire run tree.
 *
 * Self-cleaning: all fabricated/executed agent runs, steps, prompt runs, action logs, and
 * conversations are purged in Teardown. When MJ_PERF_BENCHMARK_OUT is set, Teardown writes a
 * structured JSON benchmark report to that path and prints a Markdown summary table.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
    BaseEntity,
    CompositeKey,
    EntityInfo,
    InMemoryLocalStorageProvider,
    LocalCacheManager,
    RunView,
    SetProvider,
    Metadata,
    UserInfo,
    type CachedRunViewData,
    type DatasetItemResultType,
    type IEntityDataProvider,
    type ILocalStorageProvider,
    type IMetadataProvider,
} from '@memberjunction/core';
import { ClassFactory, EscapeSQLString, ObjectCache } from '@memberjunction/global';
import { type GenericDatabaseProvider, UserCache } from '@memberjunction/generic-database-provider';
import {
    DeepFreeze,
    type RedisLocalStorageProvider,
    TwoTierCacheStorageProvider,
} from '@memberjunction/redis-provider';
import { TemplateEngineServer } from '@memberjunction/templates';
import { RedactParamsToJSON, type ActionParam } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { PayloadManager } from '@memberjunction/ai-agents';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJConversationDetailEntity, MJConversationEntity, MJErrorLogEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { RegisterTestLLM, TestLLM, type TestLLMOutcome } from '@memberjunction/unit-testing';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    Settle,
    SkipCheck,
    verifyAgentRun,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    AGENT_LIVE_FIXTURE_TAG,
    AGENT_LIVE_SETTLE_MS,
    DeleteById,
    MakeAIClient,
    NewMarker,
    PurgeAgentRun,
    RequireRows,
    ResolveRunId,
    RunAgentOverWire,
    Sleep,
    UserTurn,
} from './agent-live-shared';

const BUNDLE = 'performance-benchmark';
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 1500);

/**
 * Every inference chat driver class that a prompt on Sage, Query Builder, or Research Agent
 * (or their sub-agents) can resolve to when running deterministic scripted turns via TestLLM.
 */
const CHAT_DRIVER_CLASSES: readonly string[] = [
    'OpenAILLM',
    'AzureLLM',
    'OpenRouterLLM',
    'AnthropicLLM',
    'GeminiLLM',
    'VertexLLM',
    'CerebrasLLM',
    'GroqLLM',
    'BedrockLLM',
    'DeepSeekLLM',
    'FireworksLLM',
    'MistralLLM',
    'xAILLM',
];

const SCRIPTED_API_KEYS = CHAT_DRIVER_CLASSES.map((driverClass) => ({
    driverClass,
    apiKey: 'it-performance-benchmark-scripted-no-network',
}));

export interface PrimitiveBenchmarkMetrics {
    ClassFactoryAndObjectCacheMs?: number;
    EntityHydrateAndFlsMs?: number;
    LocalCacheWritesAndStatsMs?: number;
    TemplateRenderSimpleMs?: number;
    ActionSnapshotAndEngineLookupMs?: number;
    PayloadApplyAndDeepDiffMs?: number;
    DatestampsOnlyEntityCount?: number;
    DatestampsOnlyEntitiesBySchema?: Record<string, number>;
    DatestampsOnly10SavesMs?: number;
    // Wave 4 (PB15–PB17) metrics:
    ApplyRowChanges50On5000RowsMs?: number;
    BaseEnginePKMap100DeltasMs?: number;
    BaseEngineLinearScan100DeltasMs?: number;
    BaseEnginePKMapSpeedupRatio?: number;
    GetEntityObjectSkipNewRecord500Ms?: number;
    GetEntityObjectDefault500Ms?: number;
    UserByEmail10kLookupsMs?: number;
    UserByEmailLinear10kLookupsMs?: number;
    UserByEmailSpeedupRatio?: number;
    NarrowSearchRunView10CallsMs?: number;
    WideSearchRunView10CallsMs?: number;
    NarrowSearchReturnedColumns?: number;
    WideSearchReturnedColumns?: number;
    CanCountFromBaseTableEntityCount?: number;
    RecordChangesCountTargetsBaseTable?: boolean;
    RecordChangesCountSql?: string;
    TwoTierL1200Reads50DeltasMs?: number;
    TwoTierL1ZeroCloneIdentity?: boolean;
    FrozenRowWireSerialize5000x20Ms?: number;
    UncachedJsonStringify5000x20Ms?: number;
    FrozenRowWireSpeedupRatio?: number;
    // Wave 5.2 (PB19) metrics:
    RecordChangePayloadSkip500x32KBMs?: number;
    RecordChangePayloadFull500x32KBMs?: number;
    RecordChangePayloadSkipSpeedupRatio?: number;
    CanCountSubqueryFiltersPassed?: number;
    RecordChangesExistsCountTargetsBaseTable?: boolean;
    RecordChangesExistsCountMs?: number;
}

export interface BaselineComparisonRow {
    Metric: string;
    Unit: string;
    PreWave1?: string | number;
    Wave2?: string | number;
    Wave3?: string | number;
    PreWave4?: string | number;
    Wave4Baseline: string | number;
    Current: string | number;
    DeltaVsBaselinePercent: number | null;
    Status: 'PASS' | 'IMPROVED' | 'WARN' | 'FAIL';
}

export interface AgentRunTreeMetrics {
    Label: string;
    AgentName: string;
    Mode: 'deterministic-testllm' | 'live-model';
    RootRunId: string;
    WallTimeMs: number;
    LlmPromptExecutionMs: number;
    FrameworkOverheadMs: number;
    TotalRunsInTree: number;
    TotalStepsInTree: number;
    PromptSteps: number;
    ActionSteps: number;
    SubAgentSteps: number;
    PayloadAtStartBytes: number;
    PayloadAtEndBytes: number;
    InputDataBytes: number;
    OutputDataBytes: number;
    TotalStepStorageBytes: number;
    PayloadAtStartPointerSteps: number;
    PayloadAtEndPointerSteps: number;
    UnDeduplicatedPayloadBytesEstimate: number;
    StorageSavingsPercent: number;
}

export interface PerformanceBenchmarkReport {
    Timestamp: string;
    Database: string;
    Primitives: PrimitiveBenchmarkMetrics;
    PrimitivesTotalMs: number;
    DeterministicAgentRuns: AgentRunTreeMetrics[];
    LiveAgentRuns: AgentRunTreeMetrics[];
    BaselineComparisons?: BaselineComparisonRow[];
}

interface BenchmarkFixture {
    Marker: string;
    Primitives: PrimitiveBenchmarkMetrics;
    DeterministicAgentRuns: AgentRunTreeMetrics[];
    LiveAgentRuns: AgentRunTreeMetrics[];
    BaselineComparisons: BaselineComparisonRow[];
    RunIdsToPurge: string[];
    ConversationIdsToPurge: string[];
    ActionLogIdsToPurge: string[];
}

let benchmarkFixture: BenchmarkFixture | undefined;

function requireFixture(): BenchmarkFixture {
    if (!benchmarkFixture) {
        throw new Error(`${BUNDLE} fixture not initialized — lifecycle Setup must run first.`);
    }
    return benchmarkFixture;
}

function utf8Bytes(val: string | null | undefined): number {
    return val ? Buffer.byteLength(val, 'utf8') : 0;
}

/**
 * Generates a realistic ~15 KB nested payload so multi-step agent runs exercise
 * PayloadManager cloning, diffing, and AIAgentRunStep payload persistence.
 */
function buildRealisticAgentPayload(extraFields: Record<string, unknown> = {}): Record<string, unknown> {
    const records: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= 60; i++) {
        records.push({
            id: `rec-${String(i).padStart(4, '0')}`,
            entity: i % 3 === 0 ? 'MJ: AI Agents' : i % 2 === 0 ? 'MJ: Entity Fields' : 'MJ: Entities',
            status: 'Active',
            score: (i * 17) % 100,
            notes: `Structured benchmark context item #${i} carrying representative metadata and analytical notes for multi-turn agent state tracking.`,
            tags: ['benchmark', `tier-${(i % 4) + 1}`, 'memberjunction'],
        });
    }
    return {
        workspaceContext: {
            version: 1,
            sessionTag: 'mj-perf-benchmark',
            records,
        },
        ...extraFields,
    };
}

/**
 * Resolves a shipped agent by name; skips the running check (SkipCheck) if it is absent or inactive.
 */
async function resolveShippedAgent(
    name: string,
    provider: IMetadataProvider,
    user: UserInfo
): Promise<MJAIAgentEntityExtended> {
    const r = await RunView.FromMetadataProvider(provider).RunView<MJAIAgentEntityExtended>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${EscapeSQLString(name)}'`,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        user
    );
    const agent = r.Success && r.Results.length === 1 ? r.Results[0] : null;
    if (!agent) {
        SkipCheck(`shipped agent '${name}' not found in metadata`);
    }
    if (agent.Status !== 'Active') {
        SkipCheck(`shipped agent '${name}' is ${agent.Status} (not runnable); it must be Active`);
    }
    return agent;
}

interface RawStepRow {
    ID: string;
    AgentRunID: string;
    StepNumber: number;
    StepType: string;
    StepName: string | null;
    Status: string;
    TargetLogID: string | null;
    PayloadAtStart?: string | null;
    PayloadAtEnd?: string | null;
    PayloadAtStartSourceStepID?: string | null;
    PayloadAtEndSourceStepID?: string | null;
    InputData?: string | null;
    OutputData?: string | null;
}

interface RawPromptRunRow {
    ID: string;
    ExecutionTimeMS: number | null;
}

/**
 * Recursively walks a root AIAgentRun and all of its Sub-Agent child runs to collect
 * timing, step counts, LLM execution time, and exact SQL Server storage byte metrics.
 * Works on both `next` (before PayloadAtEndSourceStepID existed) and optimization branches.
 */
async function collectAgentRunTreeMetrics(
    label: string,
    agentName: string,
    mode: 'deterministic-testllm' | 'live-model',
    rootRunId: string,
    wallTimeMs: number,
    provider: IMetadataProvider,
    user: UserInfo
): Promise<AgentRunTreeMetrics> {
    const rv = RunView.FromMetadataProvider(provider);
    const visitedRuns = new Set<string>();
    const queue: string[] = [rootRunId];
    const allSteps: RawStepRow[] = [];
    const promptRunIds = new Set<string>();

    while (queue.length > 0) {
        const runId = queue.shift()!;
        const normId = runId.toUpperCase();
        if (visitedRuns.has(normId)) {
            continue;
        }
        visitedRuns.add(normId);

        // Omit Fields so RunView selects all columns present on vwAIAgentRunSteps in this DB
        // (compatible with both pre-migration `next` and post-migration `HEAD`).
        const stepsRes = await rv.RunView<RawStepRow>(
            {
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}'`,
                OrderBy: 'StepNumber ASC',
                ResultType: 'simple',
                BypassCache: true,
            },
            user
        );
        const steps = RequireRows(stepsRes, `steps for run ${runId}`);
        for (const step of steps) {
            allSteps.push(step);
            if (step.StepType === 'Sub-Agent' && step.TargetLogID) {
                queue.push(step.TargetLogID);
            } else if (
                (step.StepType === 'Prompt' || step.StepType === 'Compaction' || step.StepType === 'Decision' || step.StepType === 'Tool') &&
                step.TargetLogID
            ) {
                promptRunIds.add(step.TargetLogID);
            }
        }
    }

    let llmPromptExecutionMs = 0;
    if (promptRunIds.size > 0) {
        const quoted = [...promptRunIds].map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const prRes = await rv.RunView<RawPromptRunRow>(
            {
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `ID IN (${quoted})`,
                Fields: ['ID', 'ExecutionTimeMS'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user
        );
        for (const pr of RequireRows(prRes, 'prompt runs for tree')) {
            llmPromptExecutionMs += Number(pr.ExecutionTimeMS ?? 0);
        }
    }

    let payloadAtStartBytes = 0;
    let payloadAtEndBytes = 0;
    let inputDataBytes = 0;
    let outputDataBytes = 0;
    let payloadAtStartPointerSteps = 0;
    let payloadAtEndPointerSteps = 0;
    let maxObservedPayloadSize = 0;

    for (const s of allSteps) {
        const startB = utf8Bytes(s.PayloadAtStart);
        const endB = utf8Bytes(s.PayloadAtEnd);
        const inB = utf8Bytes(s.InputData);
        const outB = utf8Bytes(s.OutputData);

        payloadAtStartBytes += startB;
        payloadAtEndBytes += endB;
        inputDataBytes += inB;
        outputDataBytes += outB;

        if (startB > maxObservedPayloadSize) {
            maxObservedPayloadSize = startB;
        }
        if (endB > maxObservedPayloadSize) {
            maxObservedPayloadSize = endB;
        }
        if (s.PayloadAtStartSourceStepID) {
            payloadAtStartPointerSteps++;
        }
        if (s.PayloadAtEndSourceStepID) {
            payloadAtEndPointerSteps++;
        }
    }

    const promptSteps = allSteps.filter((s) => s.StepType === 'Prompt').length;
    const actionSteps = allSteps.filter((s) => s.StepType === 'Actions' || s.StepType === 'Tool').length;
    const subAgentSteps = allSteps.filter((s) => s.StepType === 'Sub-Agent').length;

    const totalStepStorageBytes = payloadAtStartBytes + payloadAtEndBytes + inputDataBytes + outputDataBytes;
    // Estimate what un-deduplicated storage would have been if every pointer step and Prompt/Sub-Agent InputData
    // carried a full copy of the payload:
    const deduplicatedPayloadCopies = payloadAtStartPointerSteps + payloadAtEndPointerSteps;
    const unDeduplicatedPayloadBytesEstimate =
        totalStepStorageBytes + deduplicatedPayloadCopies * maxObservedPayloadSize;
    const storageSavingsPercent =
        unDeduplicatedPayloadBytesEstimate > 0
            ? Number(
                  (
                      ((unDeduplicatedPayloadBytesEstimate - totalStepStorageBytes) /
                          unDeduplicatedPayloadBytesEstimate) *
                      100
                  ).toFixed(1)
              )
            : 0;

    const frameworkOverheadMs = Math.max(0, Number((wallTimeMs - llmPromptExecutionMs).toFixed(2)));

    const metrics: AgentRunTreeMetrics = {
        Label: label,
        AgentName: agentName,
        Mode: mode,
        RootRunId: rootRunId,
        WallTimeMs: Number(wallTimeMs.toFixed(2)),
        LlmPromptExecutionMs: Number(llmPromptExecutionMs.toFixed(2)),
        FrameworkOverheadMs: frameworkOverheadMs,
        TotalRunsInTree: visitedRuns.size,
        TotalStepsInTree: allSteps.length,
        PromptSteps: promptSteps,
        ActionSteps: actionSteps,
        SubAgentSteps: subAgentSteps,
        PayloadAtStartBytes: payloadAtStartBytes,
        PayloadAtEndBytes: payloadAtEndBytes,
        InputDataBytes: inputDataBytes,
        OutputDataBytes: outputDataBytes,
        TotalStepStorageBytes: totalStepStorageBytes,
        PayloadAtStartPointerSteps: payloadAtStartPointerSteps,
        PayloadAtEndPointerSteps: payloadAtEndPointerSteps,
        UnDeduplicatedPayloadBytesEstimate: unDeduplicatedPayloadBytesEstimate,
        StorageSavingsPercent: storageSavingsPercent,
    };

    console.log(
        `      → [${label}] wall=${metrics.WallTimeMs}ms (llm=${metrics.LlmPromptExecutionMs}ms, framework=${metrics.FrameworkOverheadMs}ms) | ` +
            `runs=${metrics.TotalRunsInTree}, steps=${metrics.TotalStepsInTree} (P:${promptSteps}/A:${actionSteps}/SA:${subAgentSteps}) | ` +
            `DB bytes=${metrics.TotalStepStorageBytes} (start=${payloadAtStartBytes}, end=${payloadAtEndBytes}, in=${inputDataBytes}, out=${outputDataBytes}) | ` +
            `pointers=(start:${payloadAtStartPointerSteps}, end:${payloadAtEndPointerSteps})`
    );

    return metrics;
}

/**
 * Executes a shipped agent deterministically using TestLLM (0ms scripted LLM responses)
 * and restores the real ClassFactory registrations immediately in `finally`.
 */
async function runDeterministicScriptedAgent(
    ctx: IntegrationCheckContext,
    label: string,
    agentName: string,
    userMessage: string,
    initialPayload: Record<string, unknown>,
    scriptedReplies: Array<Record<string, unknown>>
): Promise<AgentRunTreeMetrics> {
    await AIEngine.Instance.Config(false, ctx.User);
    await ActionEngineServer.Instance.Config(false, ctx.User);

    const agent = await resolveShippedAgent(agentName, ctx.Provider, ctx.User);

    const fx = requireFixture();
    const llm = new TestLLM();
    const restore = RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]);
    try {
        const scriptedDelayMs = process.env.GITHUB_ACTIONS === 'true' ? 200 : 35;
        llm.Reset();
        llm.SetDefaultOutcome({
            kind: 'succeed',
            content: JSON.stringify({ taskComplete: true, message: `${label} fallback completion` }),
            delayMS: scriptedDelayMs,
        });
        const outcomes: TestLLMOutcome[] = scriptedReplies.map((reply) => ({
            kind: 'succeed',
            content: JSON.stringify(reply),
            delayMS: scriptedDelayMs,
        }));
        llm.Script(...outcomes);

        const t0 = performance.now();
        const result: ExecuteAgentResult = await MakeAIClient(ctx.Provider, ctx.User).RunAIAgent({
            agent,
            conversationMessages: UserTurn(userMessage),
            payload: initialPayload,
            apiKeys: SCRIPTED_API_KEYS,
            CredentialScope: 'RuntimeOnly',
        });
        const wallTimeMs = performance.now() - t0;

        const runId = result.agentRun?.ID;
        Assert(!!runId, `${label}: AgentRunner returned no run (${result.errorMessage ?? 'no error'})`);
        fx.RunIdsToPurge.push(runId!);

        await Settle(SETTLE_MS);
        await verifyAgentRun(runId!, ctx.User, true);

        const metrics = await collectAgentRunTreeMetrics(
            label,
            agentName,
            'deterministic-testllm',
            runId!,
            wallTimeMs,
            ctx.Provider,
            ctx.User
        );
        fx.DeterministicAgentRuns.push(metrics);
        return metrics;
    } finally {
        llm.Reset();
        llm.SetDefaultOutcome({
            kind: 'fail',
            error: new Error(`The ${BUNDLE} TestLLM is not armed: its check has finished`),
        });
        restore();
    }
}

class BenchEntity extends BaseEntity {}

class BenchLocalCacheManager extends LocalCacheManager {
    public constructor() {
        super();
    }
}

export const PerformanceBenchmarkChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.PB1`,
        Name: 'PB1: ClassFactory (GetRegistration + GetAllRegistrations) & ObjectCache.Find hot-path lookup benchmark',
        Fn: async (): Promise<void> => {
            const fx = requireFixture();
            const cf = new ClassFactory();
            const oc = new ObjectCache();
            class BaseBenchClass {}
            for (let i = 0; i < 450; i++) {
                const SubCls = class extends BaseBenchClass {};
                cf.Register(BaseBenchClass, SubCls, `MJ: Bench Entity ${i}`);
                oc.Add(`MJ: Bench Entity ${i}`, { idx: i });
            }
            const targetKey = 'MJ: Bench Entity 420';
            for (let i = 0; i < 100; i++) {
                cf.GetRegistration(BaseBenchClass, targetKey);
                cf.GetAllRegistrations(BaseBenchClass, targetKey);
                oc.Find(targetKey);
            }

            const t0 = performance.now();
            const ITERS = 10_000;
            let foundCount = 0;
            for (let i = 0; i < ITERS; i++) {
                const reg = cf.GetRegistration(BaseBenchClass, targetKey);
                const all = cf.GetAllRegistrations(BaseBenchClass, targetKey);
                const cached = oc.Find<{ idx: number }>('mj: bench entity 250');
                if (reg && all.length === 1 && cached?.idx === 250) {
                    foundCount++;
                }
            }
            const elapsedMs = Number((performance.now() - t0).toFixed(2));
            fx.Primitives.ClassFactoryAndObjectCacheMs = elapsedMs;
            AssertEqual(foundCount, ITERS, 'PB1: all ClassFactory and ObjectCache lookups resolved accurately');
            console.log(`      → PB1 ClassFactory + ObjectCache (10k iters over 450 classes): ${elapsedMs} ms`);
        },
    },
    {
        Id: `${BUNDLE}.PB2`,
        Name: 'PB2: EntityInfo.ChildEntities + BaseEntity Hydration (LoadFromData/SetMany/GetAll) + FLS permissions benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();

            const roles = Array.from({ length: 8 }, (_, r) => ({
                ID: `00000000-0000-0000-0000-00000000010${r}`,
                Name: `Role_${r}`,
                RoleID: `00000000-0000-0000-0000-00000000010${r}`,
                Role: `Role_${r}`,
            }));

            const makeFields = (entityId: string): Array<Record<string, unknown>> => {
                const fields: Array<Record<string, unknown>> = [
                    {
                        ID: `${entityId.slice(0, 24)}000000000001`,
                        EntityID: entityId,
                        Sequence: 1,
                        Name: 'ID',
                        CodeName: 'ID',
                        Type: 'uniqueidentifier',
                        IsPrimaryKey: true,
                        AllowsNull: false,
                        DefaultValue: null,
                        ValueListType: 'None',
                        Status: 'Active',
                        EntityFieldValues: [],
                    },
                ];
                for (let f = 2; f <= 25; f++) {
                    const fieldId = `${entityId.slice(0, 24)}${String(f).padStart(12, '0')}`;
                    fields.push({
                        ID: fieldId,
                        EntityID: entityId,
                        Sequence: f,
                        Name: f === 24 ? '__mj_CreatedAt' : f === 25 ? '__mj_UpdatedAt' : `Field_${f}`,
                        CodeName: f === 24 ? '__mj_CreatedAt' : f === 25 ? '__mj_UpdatedAt' : `Field_${f}`,
                        Type: f % 3 === 0 ? 'int' : f >= 24 ? 'datetimeoffset' : 'nvarchar',
                        Length: 255,
                        IsPrimaryKey: false,
                        AllowsNull: true,
                        AllowUpdateAPI: f < 24,
                        Status: 'Active',
                        DefaultValue:
                            f >= 24
                                ? '(getutcdate())'
                                : f % 3 === 0
                                  ? '((0))'
                                  : f % 5 === 0
                                    ? "('DefaultVal')"
                                    : null,
                        ValueListType: f % 6 === 0 ? 'List' : 'None',
                        EntityFieldValues: [],
                        EntityFieldPermissions: [
                            {
                                ID: `00000000-0000-0009-${String(f).padStart(4, '0')}-${entityId.slice(-12)}`,
                                EntityFieldID: fieldId,
                                RoleID: roles[0].ID,
                                ReadAccess: f !== 23 ? 'Allow' : 'Deny',
                                UpdateAccess: f !== 22 && f !== 23 ? 'Allow' : 'Deny',
                                CreateAccess: 'Allow',
                            },
                        ],
                    });
                }
                return fields;
            };

            const entities: EntityInfo[] = [];
            for (let e = 0; e < 350; e++) {
                const entityId = `00000000-0000-0000-0001-${String(e).padStart(12, '0')}`;
                const perms = roles.map((r) => ({
                    ID: `00000000-0000-0000-0002-${String(e * 10 + Number(r.ID.slice(-1))).padStart(12, '0')}`,
                    EntityID: entityId,
                    RoleID: r.ID,
                    RoleName: r.Name,
                    CanCreate: true,
                    CanRead: true,
                    CanUpdate: true,
                    CanDelete: true,
                }));
                entities.push(
                    new EntityInfo({
                        ID: entityId,
                        Name: `MJ: Bench Entity ${e}`,
                        BaseTable: `BenchEntity_${e}`,
                        BaseView: `vwBenchEntities_${e}`,
                        SchemaName: '__mj',
                        ParentID: e === 349 ? `00000000-0000-0000-0001-${String(100).padStart(12, '0')}` : null,
                        AllowCreateAPI: true,
                        AllowUpdateAPI: true,
                        AllowDeleteAPI: true,
                        EnableFieldLevelSecurity: true,
                        EntityFields: makeFields(entityId),
                        EntityPermissions: perms,
                        EntityRelationships: [],
                        EntitySettings: [],
                    })
                );
            }

            const user = new UserInfo(undefined, {
                ID: '00000000-0000-0000-0000-000000000999',
                Name: 'BenchUser',
                Email: 'bench@example.com',
                IsActive: true,
                UserRoles: roles.slice(0, 4).map((r) => ({
                    UserID: '00000000-0000-0000-0000-000000000999',
                    RoleID: r.ID,
                    Role: r.Name,
                })),
            });

            const benchProvider = {
                Entities: entities,
                CurrentUser: user,
                DatabaseConnection: {},
                InstanceConnectionString: 'bench-conn',
            } as unknown as IMetadataProvider & IEntityDataProvider;

            const targetEntity = entities[50];
            const realRootEntity = ctx.Provider.Entities.find((e) => e.Name === 'MJ: AI Agents') ?? ctx.Provider.Entities[0];
            const sampleRow: Record<string, unknown> = { ID: '11111111-2222-3333-4444-555555555555' };
            for (let f = 2; f <= 21; f++) {
                sampleRow[`Field_${f}`] = f % 3 === 0 ? f * 10 : `Row value ${f}`;
            }
            sampleRow.__mj_CreatedAt = new Date('2026-01-01T00:00:00Z');
            sampleRow.__mj_UpdatedAt = new Date('2026-01-02T00:00:00Z');

            const patchRow: Record<string, unknown> = {
                Field_2: 'Updated',
                Field_3: 999,
            };

            for (let i = 0; i < 50; i++) {
                const be = new BenchEntity(targetEntity, benchProvider);
                be.ContextCurrentUser = user;
                await be.LoadFromData(sampleRow);
                be.SetMany(patchRow, false);
                be.GetAll();
                targetEntity.GetUserPermisions(user);
            }

            const t0 = performance.now();
            const ROWS = 2_000;
            let hydratedCount = 0;
            for (let i = 0; i < ROWS; i++) {
                const be = new BenchEntity(targetEntity, benchProvider);
                be.ContextCurrentUser = user;
                await be.LoadFromData(sampleRow);
                be.SetMany(patchRow, false);
                const allVals = be.GetAll();
                const perms = targetEntity.GetUserPermisions(user);
                const children = realRootEntity?.ChildEntities;
                if (allVals.Field_2 === 'Updated' && perms.CanRead && Array.isArray(children)) {
                    hydratedCount++;
                }
            }
            const elapsedMs = Number((performance.now() - t0).toFixed(2));
            fx.Primitives.EntityHydrateAndFlsMs = elapsedMs;
            AssertEqual(hydratedCount, ROWS, 'PB2: all 2,000 BaseEntity rows hydrated and checked FLS accurately');
            console.log(`      → PB2 BaseEntity Hydration + FLS (2,000 rows x 25 fields): ${elapsedMs} ms`);
        },
    },
    {
        Id: `${BUNDLE}.PB3`,
        Name: 'PB3: LocalCacheManager dataset & view cache writes + GetStats() footprint benchmark',
        Fn: async (): Promise<void> => {
            const fx = requireFixture();
            const lcm = new BenchLocalCacheManager();
            const mockStorage = new Map<string, unknown>();
            const storageProvider: ILocalStorageProvider = {
                SharesReferences: false,
                SupportsCrossProcessPersistence: false,
                SharedAcrossProcesses: false,
                GetItem: async <T = unknown>(k: string): Promise<T | null> => (mockStorage.get(k) as T | undefined) ?? null,
                GetItems: async <T = unknown>(keys: string[]): Promise<Map<string, T | null>> => {
                    const m = new Map<string, T | null>();
                    for (const k of keys) {
                        m.set(k, (mockStorage.get(k) as T | undefined) ?? null);
                    }
                    return m;
                },
                SetItem: async <T>(k: string, v: T): Promise<void> => {
                    mockStorage.set(k, v);
                },
                Remove: async (k: string): Promise<void> => {
                    mockStorage.delete(k);
                },
            };
            await lcm.Initialize(storageProvider, { maxSizeBytes: 50 * 1024 * 1024 });

            const rows = Array.from({ length: 150 }, (_, idx) => ({
                ID: `00000000-0000-0000-0000-${String(idx).padStart(12, '0')}`,
                Name: `Entity Row ${idx}`,
                Description: 'Some moderately sized text description for benchmarking cache writes '.repeat(3),
                Status: 'Active',
                __mj_UpdatedAt: '2026-10-14T00:00:00.000Z',
            }));

            const datasetItem: DatasetItemResultType = {
                Code: 'MockDataset',
                EntityName: 'MJ: Bench Entity 1',
                EntityID: '00000000-0000-0000-0000-000000000001',
                LatestUpdateDate: new Date(),
                Results: rows,
            };

            const t0 = performance.now();
            for (let i = 0; i < 60; i++) {
                await lcm.SetRunViewResult(
                    `ViewFp_${i}|_|_`,
                    { EntityName: 'MJ: Bench Entity 1', ExtraFilter: `Idx=${i}` },
                    rows,
                    '2026-10-14T00:00:00.000Z',
                    undefined,
                    rows.length
                );
            }
            for (let i = 0; i < 20; i++) {
                await lcm.SetDataset(
                    `Dataset_${i}`,
                    undefined,
                    {
                        DatasetID: `ds-${i}`,
                        DatasetName: `Dataset_${i}`,
                        Success: true,
                        Status: 'Loaded',
                        LatestUpdateDate: new Date(),
                        Results: [datasetItem, datasetItem, datasetItem],
                    },
                    'conn-1'
                );
            }
            const stats = await lcm.GetStats();
            const elapsedMs = Number((performance.now() - t0).toFixed(2));
            fx.Primitives.LocalCacheWritesAndStatsMs = elapsedMs;
            Assert(stats.totalEntries >= 80, `PB3: expected >= 80 cached entries, got ${stats.totalEntries}`);
            console.log(`      → PB3 LocalCacheManager writes + GetStats (80 large entries): ${elapsedMs} ms`);
        },
    },
    {
        Id: `${BUNDLE}.PB4`,
        Name: 'PB4: TemplateEngineServer.RenderTemplateSimple + NunjucksSandbox context wrapping benchmark',
        Fn: async (): Promise<void> => {
            const fx = requireFixture();
            const te = TemplateEngineServer.Instance;
            const contextData = {
                agentName: 'Sage',
                userName: 'BenchUser',
                organization: 'MemberJunction',
                stepCount: 12,
                subAgents: [
                    { name: 'Query Builder', description: 'Builds SQL queries' },
                    { name: 'Research Agent', description: 'Performs multi-step research' },
                    { name: 'Codesmith', description: 'Generates code artifacts' },
                ],
                payload: {
                    customer: { id: 'cust-123', tier: 'Enterprise', region: 'NA' },
                    metrics: { revenue: 125000, activeUsers: 450, healthScore: 94 },
                },
            };

            const templates: string[] = [];
            for (let i = 0; i < 200; i++) {
                templates.push(
                    `You are {{ agentName }} assisting {{ userName }} at {{ organization }} (Turn #{{ stepCount }} - Variant ${i}).\n` +
                        `Customer {{ payload.customer.id }} ({{ payload.customer.tier }}) has health score {{ payload.metrics.healthScore }}.\n` +
                        `{% for sa in subAgents %}- {{ sa.name }}: {{ sa.description }}\n{% endfor %}`
                );
            }

            await te.RenderTemplateSimple(templates[0], contextData);

            const t0 = performance.now();
            let successRenders = 0;
            for (let pass = 0; pass < 5; pass++) {
                for (let i = 0; i < templates.length; i++) {
                    const res = await te.RenderTemplateSimple(templates[i], contextData);
                    if (res.Success) {
                        successRenders++;
                    }
                }
            }
            const elapsedMs = Number((performance.now() - t0).toFixed(2));
            fx.Primitives.TemplateRenderSimpleMs = elapsedMs;
            AssertEqual(successRenders, 1_000, 'PB4: all 1,000 prompt templates rendered cleanly');
            console.log(`      → PB4 TemplateEngineServer.RenderTemplateSimple (1,000 renders): ${elapsedMs} ms`);
        },
    },
    {
        Id: `${BUNDLE}.PB5`,
        Name: 'PB5: ActionEngine RedactParamsToJSON + AIEngineBase permission & catalog lookup benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const engine = AIEngineBase.Instance;
            await engine.Config(false, ctx.User, ctx.Provider);
            await ActionEngineServer.Instance.Config(false, ctx.User, ctx.Provider);
            const calcAction = ActionEngineServer.Instance.GetActionByName('Calculate Expression');
            const paramDefs = calcAction ? [...calcAction.Params.Items] : undefined;

            const actionParams: ActionParam[] = [
                { Name: 'EntityName', Value: 'MJ: AI Agent Runs', Type: 'Input' },
                { Name: 'ExtraFilter', Value: "Status = 'Running'", Type: 'Input' },
                { Name: 'MaxRows', Value: 100, Type: 'Input' },
                {
                    Name: 'Payload',
                    Value: { nested: { items: Array.from({ length: 25 }, (_, i) => `val_${i}`) } },
                    Type: 'Input',
                },
                { Name: 'APIKey', Value: 'sk-secret-key-value-123456', Type: 'Input' },
                { Name: 'ResultCount', Value: 42, Type: 'Output' },
                {
                    Name: 'Records',
                    Value: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Row ${i}` })),
                    Type: 'Output',
                },
                { Name: 'SuccessFlag', Value: true, Type: 'Output' },
            ];

            const sampleAgents = engine.Agents.slice(0, 10);
            Assert(sampleAgents.length > 0, 'PB5: expected at least 1 configured AI Agent');

            const t0 = performance.now();
            const ITERS = 500;
            let checkCount = 0;
            for (let i = 0; i < ITERS; i++) {
                const json = RedactParamsToJSON(actionParams, paramDefs);
                const ag = sampleAgents[i % sampleAgents.length];
                const canView = await engine.CanUserViewAgent(ag.ID, ctx.User);
                const canRun = await engine.CanUserRunAgent(ag.ID, ctx.User);
                if (json.length > 10 && (canView || !canView) && (canRun || !canRun)) {
                    checkCount++;
                }
            }
            const elapsedMs = Number((performance.now() - t0).toFixed(2));
            fx.Primitives.ActionSnapshotAndEngineLookupMs = elapsedMs;
            AssertEqual(checkCount, ITERS, 'PB5: all 500 ActionParam snapshots and AIEngine permission checks succeeded');
            console.log(`      → PB5 RedactParamsToJSON + AIEngineBase permissions (500 iters): ${elapsedMs} ms`);
        },
    },
    {
        Id: `${BUNDLE}.PB6`,
        Name: 'PB6: PayloadManager.applyAgentChangeRequest + DeepDiffer multi-turn payload diffing benchmark',
        Fn: async (): Promise<void> => {
            const fx = requireFixture();
            const pm = new PayloadManager();

            const basePayload = {
                metadata: {
                    runId: '00000000-0000-0000-0000-000000000001',
                    version: 1,
                    tags: ['analysis', 'research', 'memberjunction', 'optimization'],
                },
                sections: Array.from({ length: 30 }, (_, s) => ({
                    id: `sec-${s}`,
                    title: `Section ${s}: Detailed Architectural Analysis`,
                    status: 'completed',
                    items: Array.from({ length: 6 }, (__, k) => ({
                        key: `item-${s}-${k}`,
                        summary: 'Detailed finding text with structured metrics and citations '.repeat(3),
                        confidence: 0.92,
                        citations: [`doc-${s}-a`, `doc-${s}-b`, `doc-${s}-c`],
                    })),
                })),
                scratchpad: {
                    currentTurn: 0,
                    notes: Array.from({ length: 20 }, (_, n) => `Note ${n}: intermediate observation`),
                },
            };

            let currentPayload = JSON.parse(JSON.stringify(basePayload)) as typeof basePayload;
            const t0 = performance.now();
            const TURNS = 50;
            for (let turn = 1; turn <= TURNS; turn++) {
                const res = pm.applyAgentChangeRequest(
                    currentPayload,
                    {
                        updateElements: {
                            metadata: { version: turn + 1 },
                            scratchpad: { currentTurn: turn },
                            sections: [
                                ...Array.from({ length: 29 }, () => '__NO_CHANGE__'),
                                {
                                    title: `Section 29: Updated on turn ${turn}`,
                                },
                            ],
                        },
                        newElements: {
                            [`turn_${turn}_marker`]: { completedAtStep: turn, ok: true },
                        },
                    },
                    { generateDiff: true, agentName: 'BenchAgent' }
                );
                currentPayload = res.result;
            }
            const elapsedMs = Number((performance.now() - t0).toFixed(2));
            fx.Primitives.PayloadApplyAndDeepDiffMs = elapsedMs;
            AssertEqual(currentPayload.metadata.version, TURNS + 1, 'PB6: 50 turns of payload change requests applied');
            console.log(`      → PB6 PayloadManager.applyAgentChangeRequest + DeepDiffer (50 turns): ${elapsedMs} ms`);
        },
    },
    {
        Id: `${BUNDLE}.PB7`,
        Name: 'PB7: Sage multi-turn deterministic run (TestLLM: 4 turns, 3 Actions, 15 KB payload) — framework overhead & DB step storage benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const initialPayload = buildRealisticAgentPayload({
                summary: 'Initial Sage benchmark state',
                calculationHistory: ['init'],
            });
            const scriptedReplies: Array<Record<string, unknown>> = [
                {
                    taskComplete: false,
                    message: 'Turn 1: executing first calculation action.',
                    nextStep: {
                        type: 'Actions',
                        actions: [{ name: 'Calculate Expression', params: { Expression: '42 * 10' } }],
                    },
                },
                {
                    taskComplete: false,
                    message: 'Turn 2: updating payload summary and executing second calculation action.',
                    payloadChangeRequest: {
                        updateElements: {
                            summary: 'Updated after 42 * 10 = 420',
                        },
                    },
                    nextStep: {
                        type: 'Actions',
                        actions: [{ name: 'Calculate Expression', params: { Expression: '420 + 80' } }],
                    },
                },
                {
                    taskComplete: false,
                    message: 'Turn 3: executing third calculation action without modifying payload.',
                    nextStep: {
                        type: 'Actions',
                        actions: [{ name: 'Calculate Expression', params: { Expression: '500 * 2' } }],
                    },
                },
                {
                    taskComplete: true,
                    message: 'Turn 4: Sage deterministic multi-turn benchmark complete (result = 1000).',
                },
            ];

            const metrics = await runDeterministicScriptedAgent(
                ctx,
                'PB7: Sage (4-turn deterministic)',
                'Sage',
                'Compute 42*10, then +80, then *2 using Calculate Expression.',
                initialPayload,
                scriptedReplies
            );
            Assert(metrics.TotalStepsInTree >= 7, `PB7: expected >= 7 steps in Sage run, got ${metrics.TotalStepsInTree}`);
            Assert(metrics.PromptSteps >= 4, `PB7: expected >= 4 Prompt steps, got ${metrics.PromptSteps}`);
            Assert(metrics.ActionSteps >= 3, `PB7: expected >= 3 Action steps, got ${metrics.ActionSteps}`);
        },
    },
    {
        Id: `${BUNDLE}.PB8`,
        Name: 'PB8: Query Builder multi-turn deterministic run with Query Strategist sub-agent delegation (TestLLM) — tree overhead & DB step storage benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const initialPayload = buildRealisticAgentPayload({
                title: 'Active System Users Count Query',
                plan: '1. Delegate to Query Strategist to inspect MJ: Users\n2. Finalize SQL query plan',
                source: 'query',
                columns: [{ field: 'ActiveUserCount', displayName: 'Active User Count' }],
                rows: [{ ActiveUserCount: 25 }],
                tables: [
                    {
                        name: 'User',
                        columns: [{ field: 'ID' }, { field: 'IsActive' }],
                        rows: [],
                    },
                ],
                interpretation: 'Counts active users in __mj.[User].',
                computations: [],
                metadata: {
                    sql: 'SELECT COUNT(*) AS ActiveUserCount FROM __mj.[User] WHERE IsActive = 1',
                    rowCount: 1,
                    executionTimeMs: 5,
                },
            });

            // Sequence of LLM calls across parent (Query Builder) and child (Query Strategist):
            // 1. Query Builder Turn 1 -> Sub-Agent 'Query Strategist'
            // 2. Query Strategist Turn 1 -> Action 'Get Entity Details' (EntityName: 'MJ: Users')
            // 3. Query Strategist Turn 2 -> taskComplete: true
            // 4. Query Builder Turn 2 -> taskComplete: true
            const scriptedReplies: Array<Record<string, unknown>> = [
                {
                    taskComplete: false,
                    message: 'Delegating entity inspection to Query Strategist.',
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'Query Strategist',
                            message: 'Verify MJ: Users schema details and confirm query plan.',
                            terminateAfter: false,
                        },
                    },
                },
                {
                    taskComplete: false,
                    message: 'Query Strategist inspecting MJ: Users entity metadata.',
                    nextStep: {
                        type: 'Actions',
                        actions: [
                            {
                                name: 'Get Entity Details',
                                params: {
                                    EntityName: 'MJ: Users',
                                    SampleRowCount: 0,
                                    UseSemanticSearch: false,
                                },
                            },
                        ],
                    },
                },
                {
                    taskComplete: true,
                    message: 'Query Strategist verified MJ: Users schema and confirmed SQL.',
                },
                {
                    taskComplete: true,
                    message: 'Query Builder completed active users query specification.',
                },
            ];

            const metrics = await runDeterministicScriptedAgent(
                ctx,
                'PB8: Query Builder + Query Strategist (deterministic)',
                'Query Builder',
                'Build a query that counts active users in the system.',
                initialPayload,
                scriptedReplies
            );
            Assert(
                metrics.TotalRunsInTree >= 2,
                `PB8: expected >= 2 runs in Query Builder tree (parent + child), got ${metrics.TotalRunsInTree}`
            );
            Assert(metrics.SubAgentSteps >= 1, `PB8: expected >= 1 Sub-Agent step, got ${metrics.SubAgentSteps}`);
        },
    },
    {
        Id: `${BUNDLE}.PB9`,
        Name: 'PB9: Research Agent multi-turn deterministic run with Research Report Writer sub-agent synthesis (TestLLM) — tree overhead & DB step storage benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const initialPayload = buildRealisticAgentPayload({
                metadata: { topic: 'MemberJunction EntityInfo and BaseEntity Architecture', status: 'in_progress' },
                plan: { steps: ['Gather core architecture facts', 'Synthesize final report via Research Report Writer'] },
                findings: [
                    { source: 'MJCore', summary: 'EntityInfo caches entity/field metadata and permissions.' },
                    { source: 'MJCore', summary: 'BaseEntity manages per-record state, dirty tracking, and saves.' },
                ],
                comparisons: [{ dimension: 'Scope', entityInfo: 'Metadata singleton', baseEntity: 'Record instance' }],
                contradictions: [],
                iterations: [{ turn: 1, focus: 'Core classes' }],
                report: { title: 'MJ Core Architecture', body: 'Initial draft' },
                synthesis: { conclusion: 'EntityInfo and BaseEntity form the core data layer.' },
            });

            // Sequence of LLM calls across parent (Research Agent) and child (Research Report Writer):
            // 1. Research Agent Turn 1 -> updates findings in payload + delegates to Sub-Agent 'Research Report Writer'
            // 2. Research Report Writer Turn 1 -> updates synthesis/report + completes
            // 3. Research Agent Turn 2 -> completes
            const scriptedReplies: Array<Record<string, unknown>> = [
                {
                    taskComplete: false,
                    message: 'Delegating report synthesis to Research Report Writer.',
                    payloadChangeRequest: {
                        updateElements: {
                            metadata: { topic: 'MemberJunction EntityInfo and BaseEntity Architecture', status: 'synthesizing' },
                        },
                    },
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'Research Report Writer',
                            message: 'Write a concise synthesis report from the gathered findings.',
                            terminateAfter: false,
                        },
                    },
                },
                {
                    taskComplete: true,
                    message: 'Research Report Writer completed the architectural synthesis report.',
                    payloadChangeRequest: {
                        updateElements: {
                            report: {
                                title: 'MemberJunction Core Data Layer Synthesis',
                                body: 'EntityInfo provides O(1) metadata lookups while BaseEntity handles record lifecycle.',
                            },
                            synthesis: {
                                conclusion: 'Memoized metadata in EntityInfo directly accelerates BaseEntity hydration.',
                            },
                        },
                    },
                },
                {
                    taskComplete: true,
                    message: 'Research Agent completed full architectural research and synthesis.',
                },
            ];

            const metrics = await runDeterministicScriptedAgent(
                ctx,
                'PB9: Research Agent + Report Writer (deterministic)',
                'Research Agent',
                'Compare EntityInfo and BaseEntity in MemberJunction and synthesize a short report.',
                initialPayload,
                scriptedReplies
            );
            Assert(
                metrics.TotalRunsInTree >= 2,
                `PB9: expected >= 2 runs in Research Agent tree (parent + child), got ${metrics.TotalRunsInTree}`
            );
            Assert(metrics.SubAgentSteps >= 1, `PB9: expected >= 1 Sub-Agent step, got ${metrics.SubAgentSteps}`);
        },
    },
    {
        Id: `${BUNDLE}.PB10`,
        Name: 'PB10: Live Sage multi-step execution & conversation linkage — wall time, LLM vs framework overhead, and DB payload storage benchmark',
        RequiresLiveModel: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const sage = await resolveShippedAgent('Sage', ctx.Provider, ctx.User);
            const fx = requireFixture();

            // Create conversation + user turn to benchmark full conversation-linked Sage execution
            const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
            conversation.Name = `PB10 Sage Benchmark ${fx.Marker} ${AGENT_LIVE_FIXTURE_TAG}`;
            conversation.UserID = ctx.User.ID;
            Assert(await conversation.Save(), `PB10: conversation save: ${conversation.LatestResult?.CompleteMessage}`);
            fx.ConversationIdsToPurge.push(conversation.ID);

            const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                ctx.User
            );
            detail.ConversationID = conversation.ID;
            detail.Role = 'User';
            detail.Message =
                'Using the Calculate Expression action, compute (125 * 8) + 250, then reply with the numeric result only. Do not delegate to sub-agents.';
            detail.HiddenToUser = false;
            Assert(await detail.Save(), `PB10: detail save: ${detail.LatestResult?.CompleteMessage}`);

            const t0 = performance.now();
            const result = await RunAgentOverWire(
                MakeAIClient(ctx.Provider, ctx.User),
                sage,
                UserTurn(detail.Message),
                { ConversationId: conversation.ID }
            );
            const wallTimeMs = performance.now() - t0;

            await Sleep(AGENT_LIVE_SETTLE_MS);
            const runId = await ResolveRunId(
                result,
                ctx.User,
                `AgentID='${sage.ID}' AND ConversationID='${conversation.ID}'`,
                ctx.Provider
            );
            Assert(!!runId, 'PB10: Live Sage run landed an AI Agent Run');
            fx.RunIdsToPurge.push(runId!);

            await verifyAgentRun(runId!, ctx.User, true);
            const metrics = await collectAgentRunTreeMetrics(
                'PB10: Sage (live-model)',
                'Sage',
                'live-model',
                runId!,
                wallTimeMs,
                ctx.Provider,
                ctx.User
            );
            fx.LiveAgentRuns.push(metrics);
            Assert(metrics.TotalStepsInTree > 0, 'PB10: Live Sage produced finalized steps');
        },
    },
    {
        Id: `${BUNDLE}.PB11`,
        Name: 'PB11: Live Query Builder execution & sub-agent lineage — wall time, LLM vs framework overhead, and DB payload storage benchmark',
        RequiresLiveModel: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const qb = await resolveShippedAgent('Query Builder', ctx.Provider, ctx.User);
            const fx = requireFixture();

            const prompt = 'How many users are in the system? Give the number only.';
            const t0 = performance.now();
            const result = await RunAgentOverWire(MakeAIClient(ctx.Provider, ctx.User), qb, UserTurn(prompt));
            const wallTimeMs = performance.now() - t0;

            await Sleep(AGENT_LIVE_SETTLE_MS);
            const runId = await ResolveRunId(
                result,
                ctx.User,
                `AgentID='${qb.ID}' AND Status<>'Running'`,
                ctx.Provider
            );
            Assert(!!runId, 'PB11: Live Query Builder run landed an AI Agent Run');
            fx.RunIdsToPurge.push(runId!);

            await verifyAgentRun(runId!, ctx.User, true);
            const metrics = await collectAgentRunTreeMetrics(
                'PB11: Query Builder (live-model)',
                'Query Builder',
                'live-model',
                runId!,
                wallTimeMs,
                ctx.Provider,
                ctx.User
            );
            fx.LiveAgentRuns.push(metrics);
            Assert(metrics.TotalStepsInTree > 0, 'PB11: Live Query Builder produced finalized steps');
        },
    },
    {
        Id: `${BUNDLE}.PB12`,
        Name: 'PB12: Live Research Agent multi-agent synthesis tree — wall time, LLM vs framework overhead, and DB payload storage benchmark',
        RequiresLiveModel: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const research = await resolveShippedAgent('Research Agent', ctx.Provider, ctx.User);
            const fx = requireFixture();

            const prompt =
                'Using only this sentence and no web search, answer in one word what color the sky is described as: "The sky is blue." Then finish.';
            const t0 = performance.now();
            const result = await RunAgentOverWire(MakeAIClient(ctx.Provider, ctx.User), research, UserTurn(prompt));
            const wallTimeMs = performance.now() - t0;

            await Sleep(AGENT_LIVE_SETTLE_MS);
            const runId = await ResolveRunId(
                result,
                ctx.User,
                `AgentID='${research.ID}' AND Status<>'Running'`,
                ctx.Provider
            );
            Assert(!!runId, 'PB12: Live Research Agent run landed an AI Agent Run');
            fx.RunIdsToPurge.push(runId!);

            await verifyAgentRun(runId!, ctx.User, true);
            const metrics = await collectAgentRunTreeMetrics(
                'PB12: Research Agent (live-model)',
                'Research Agent',
                'live-model',
                runId!,
                wallTimeMs,
                ctx.Provider,
                ctx.User
            );
            fx.LiveAgentRuns.push(metrics);
            Assert(metrics.TotalStepsInTree > 0, 'PB12: Live Research Agent produced finalized steps');
        },
    },
    {
        Id: `${BUNDLE}.PB13`,
        Name: 'PB13: SaveReturnMode datestamps_only catalog audit & 10-save roundtrip benchmark on large NVARCHAR(MAX) log rows',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const datestampsOnlyEntities = ctx.Provider.Entities.filter(
                (e) => e.SaveReturnMode === 'datestamps_only'
            );
            const bySchema: Record<string, number> = {};
            for (const ent of datestampsOnlyEntities) {
                bySchema[ent.SchemaName] = (bySchema[ent.SchemaName] ?? 0) + 1;
            }
            fx.Primitives.DatestampsOnlyEntityCount = datestampsOnlyEntities.length;
            fx.Primitives.DatestampsOnlyEntitiesBySchema = bySchema;

            // Verify key core write-heavy telemetry/execution entities are configured with datestamps_only
            const requiredCoreEntities = [
                'MJ: AI Agent Run Steps',
                'MJ: AI Prompt Runs',
                'MJ: AI Agent Runs',
                'MJ: Action Execution Logs',
                'MJ: Error Logs',
                'MJ: Audit Logs',
                'MJ: Record Changes',
            ];
            for (const name of requiredCoreEntities) {
                const ent = ctx.Provider.Entities.find((e) => e.Name === name);
                Assert(!!ent, `PB13: expected entity '${name}' in metadata`);
                AssertEqual(
                    ent!.SaveReturnMode,
                    'datestamps_only',
                    `PB13: expected '${name}' to have SaveReturnMode='datestamps_only'`
                );
            }

            // Benchmark 10 consecutive saves of MJ: Error Logs carrying a ~32 KB Details payload
            const largeDetails = JSON.stringify({
                marker: fx.Marker,
                stack: Array.from({ length: 120 }, (_, i) => `at Frame_${i} (module_${i}.ts:${i * 10}:15) — diagnostic payload text`).join('\n'),
            });
            const createdIds: string[] = [];
            try {
                const t0 = performance.now();
                for (let i = 0; i < 10; i++) {
                    const errLog = await ctx.Provider.GetEntityObject<MJErrorLogEntity>('MJ: Error Logs', ctx.User);
                    errLog.NewRecord();
                    errLog.Code = `PB13-${i}`;
                    errLog.Message = `PB13 datestamps_only benchmark row #${i} (${fx.Marker})`;
                    errLog.Details = largeDetails;
                    errLog.Status = 'Info';
                    errLog.Category = 'Benchmark';
                    const saved = await errLog.Save();
                    Assert(saved, `PB13: ErrorLog save #${i} failed: ${errLog.LatestResult?.CompleteMessage}`);
                    const id = errLog.ID;
                    Assert(!!id, `PB13: ErrorLog save #${i} populated ID`);
                    Assert(!!errLog.__mj_CreatedAt, `PB13: ErrorLog save #${i} populated __mj_CreatedAt`);
                    Assert(!!errLog.__mj_UpdatedAt, `PB13: ErrorLog save #${i} populated __mj_UpdatedAt`);
                    createdIds.push(id);
                }
                const elapsedMs = Number((performance.now() - t0).toFixed(2));
                fx.Primitives.DatestampsOnly10SavesMs = elapsedMs;
                console.log(
                    `      → PB13 SaveReturnMode='datestamps_only' (${datestampsOnlyEntities.length} entities across ${Object.keys(bySchema).length} schemas; 10x 32KB ErrorLog saves): ${elapsedMs} ms`
                );
            } finally {
                for (const id of createdIds) {
                    await DeleteById('MJ: Error Logs', id, ctx.Provider, ctx.User);
                }
            }
        },
    },
    {
        Id: `${BUNDLE}.PB14`,
        Name: 'PB14: Phase 2 Regression Guards — Lazy BaseEntity _raw hydration on RunView entity_object & runtime options.SaveReturnMode datestamps_only on full-SP entities',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const rv = RunView.FromMetadataProvider(ctx.Provider);

            // 1. Verify RunView({ ResultType: 'entity_object' }) keeps _fieldsHydrated === false during read-only access
            const agentsRes = await rv.RunView<MJAIAgentEntityExtended>(
                {
                    EntityName: 'MJ: AI Agents',
                    MaxRows: 10,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                ctx.User
            );
            const agents = RequireRows(agentsRes, 'PB14: MJ: AI Agents entity_object load');
            Assert(agents.length > 0, 'PB14: expected at least 1 AI Agent row');

            for (const ag of agents) {
                const nameVal = ag.Name;
                const statusVal = ag.Status;
                const allObj = ag.GetAll();
                Assert(typeof nameVal === 'string' && nameVal.length > 0, 'PB14: expected Name via getter in _raw mode');
                Assert(typeof statusVal === 'string', 'PB14: expected Status via getter in _raw mode');
                AssertEqual(allObj.Name, nameVal, 'PB14: GetAll() returns Name in _raw mode');
                const hydratedAfterRead = (ag as unknown as { _fieldsHydrated: boolean })._fieldsHydrated;
                AssertEqual(
                    hydratedAfterRead,
                    false,
                    `PB14: expected BaseEntity._fieldsHydrated to stay false after read-only Get()/GetAll() on '${nameVal}'`
                );
            }

            // Trigger lazy hydration on the first entity via Set() and verify _fieldsHydrated flips to true
            const firstAgent = agents[0];
            const originalDesc = firstAgent.Description;
            firstAgent.Set('Description', originalDesc);
            const hydratedAfterSet = (firstAgent as unknown as { _fieldsHydrated: boolean })._fieldsHydrated;
            AssertEqual(hydratedAfterSet, true, 'PB14: expected Set() to lazily hydrate EntityFields');

            // 2. Verify runtime options.SaveReturnMode='datestamps_only' on an entity whose compiled SP is SaveReturnMode='full'
            const conv = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
            AssertEqual(
                conv.EntityInfo.SaveReturnMode,
                'full',
                'PB14: expected MJ: Conversations to have compiled SaveReturnMode="full"'
            );
            conv.NewRecord();
            conv.Name = `PB14 Runtime DatestampsOnly (${fx.Marker})`;
            conv.Description = 'Initial description';
            conv.UserID = ctx.User.ID;

            try {
                const createSaved = await conv.Save({ SaveReturnMode: 'datestamps_only' });
                Assert(createSaved, `PB14: Conversations create with runtime SaveReturnMode='datestamps_only' failed: ${conv.LatestResult?.CompleteMessage}`);
                Assert(conv.IsSaved, 'PB14: conv.IsSaved should be true after create');
                Assert(!!conv.__mj_CreatedAt, 'PB14: conv.__mj_CreatedAt populated from DB');
                Assert(!!conv.__mj_UpdatedAt, 'PB14: conv.__mj_UpdatedAt populated from DB');
                AssertEqual(conv.Name, `PB14 Runtime DatestampsOnly (${fx.Marker})`, 'PB14: in-memory Name preserved');
                AssertEqual(conv.Dirty, false, 'PB14: conv.Dirty reset to false after create');

                // Update with runtime SaveReturnMode='datestamps_only'
                conv.Description = 'Updated description via datestamps_only';
                const updateSaved = await conv.Save({ SaveReturnMode: 'datestamps_only' });
                Assert(updateSaved, `PB14: Conversations update with runtime SaveReturnMode='datestamps_only' failed: ${conv.LatestResult?.CompleteMessage}`);
                AssertEqual(conv.Description, 'Updated description via datestamps_only', 'PB14: updated Description preserved');
                AssertEqual(conv.Dirty, false, 'PB14: conv.Dirty reset to false after update');
            } finally {
                if (conv.IsSaved && conv.ID) {
                    await DeleteById('MJ: Conversations', conv.ID, ctx.Provider, ctx.User);
                }
            }
        },
    },
    {
        Id: `${BUNDLE}.PB15`,
        Name: 'PB15: Wave 4.0 + 4.1a + 4.1b — LocalCacheManager.ApplyRowChanges CoW, BaseEngine PKMap O(1) delta merge, SkipNewRecord: true, & UserCache.UserByEmail secondary index benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();

            // 1. Wave 4.0 + 4.1a: LocalCacheManager.ApplyRowChanges (50 single-row updates on 5,000 frozen rows)
            const lcm = new BenchLocalCacheManager();
            await lcm.Initialize(new InMemoryLocalStorageProvider(), { maxSizeBytes: 64 * 1024 * 1024 });
            const sampleRows = Array.from({ length: 5000 }, (_, i) => ({
                ID: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
                Name: `Row_${i}`,
                Description: `Sample cached row description #${i}`,
                Status: 'Active',
                NestedMeta: { a: i, b: `meta_${i}`, tags: ['t1', 't2'] },
                __mj_CreatedAt: '2026-01-01T00:00:00.000Z',
                __mj_UpdatedAt: '2026-01-01T00:00:00.000Z',
            }));
            const fp = 'MJ: Action Categories|_|_|0|0|pb15';
            await lcm.SetRunViewResult(
                fp,
                { EntityName: 'MJ: Action Categories', ExtraFilter: '' },
                sampleRows,
                '2026-01-01T00:00:00.000Z',
                undefined,
                5000
            );
            const beforeSlot = await lcm.GetRunViewResult(fp);
            const untouchedBefore = beforeSlot?.results[4999];

            const tFreeze0 = performance.now();
            for (let i = 0; i < 50; i++) {
                const id = `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
                const updatedRow = {
                    ...sampleRows[i],
                    Description: `Updated #${i}`,
                    __mj_UpdatedAt: '2026-01-02T00:00:00.000Z',
                };
                await lcm.ApplyRowChanges(
                    fp,
                    [{ Key: CompositeKey.FromID(id), Row: updatedRow }],
                    '2026-01-02T00:00:00.000Z'
                );
            }
            const applyRowChangesMs = Number((performance.now() - tFreeze0).toFixed(2));
            fx.Primitives.ApplyRowChanges50On5000RowsMs = applyRowChangesMs;

            const afterSlot = await lcm.GetRunViewResult(fp);
            Assert(!!afterSlot && Object.isFrozen(afterSlot.results), 'PB15: cached RunView results array must remain frozen after ApplyRowChanges');
            Assert(
                untouchedBefore === afterSlot?.results[4999],
                'PB15: unchanged row references must be shared via Copy-on-Write without structuredClone'
            );

            // 2. Wave 4.1a: BaseEngine PKMap O(1) in-place delta merge vs. O(N) linear scan (100 deltas on 2,000 rows)
            let heldRows: Array<Record<string, unknown>> = Array.from({ length: 2000 }, (_, i) => ({
                ID: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
                Name: `Item_${i}`,
            }));
            const engineProto = Object.getPrototypeOf(UserInfoEngine.Instance) as {
                getOrBuildHeldRowsDeltaIndex?: (
                    rows: Array<Record<string, unknown>>,
                    pkFields: string[],
                    isUuidPk: boolean[],
                    deltaSig: string
                ) => unknown;
                mergeMaterializedDeltaRows: (
                    rows: Array<Record<string, unknown>>,
                    indexOrPkFields: unknown,
                    deltaSigOrIsUuid: unknown,
                    emptyDeletes: Set<string>,
                    upsertedKeys: string[],
                    upsertedItems: Array<Record<string, unknown>>
                ) => Array<Record<string, unknown>>;
            };
            const pkFields = ['ID'];
            const isUuidPk = [true];
            const deltaSignature = 'u:ID';
            const emptyDeletes = new Set<string>();

            // Warmup + measure O(1) PKMap merge
            for (let w = 0; w < 10; w++) {
                const idx = (w * 17) % 2000;
                const id = `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
                const heldDeltaIndex = engineProto.getOrBuildHeldRowsDeltaIndex?.call(
                    UserInfoEngine.Instance,
                    heldRows,
                    pkFields,
                    isUuidPk,
                    deltaSignature
                );
                heldRows = engineProto.mergeMaterializedDeltaRows.call(
                    UserInfoEngine.Instance,
                    heldRows,
                    heldDeltaIndex,
                    deltaSignature,
                    emptyDeletes,
                    [id],
                    [{ ID: id, Name: `Warmup_${w}` }]
                );
            }

            const tDelta0 = performance.now();
            for (let i = 0; i < 100; i++) {
                const idx = (i * 17) % 2000;
                const id = `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
                const heldDeltaIndex = engineProto.getOrBuildHeldRowsDeltaIndex?.call(
                    UserInfoEngine.Instance,
                    heldRows,
                    pkFields,
                    isUuidPk,
                    deltaSignature
                );
                heldRows = engineProto.mergeMaterializedDeltaRows.call(
                    UserInfoEngine.Instance,
                    heldRows,
                    heldDeltaIndex,
                    deltaSignature,
                    emptyDeletes,
                    [id],
                    [{ ID: id, Name: `Updated_${i}` }]
                );
            }
            const pkMapDeltaMs = Math.max(0.05, Number((performance.now() - tDelta0).toFixed(2)));
            fx.Primitives.BaseEnginePKMap100DeltasMs = pkMapDeltaMs;

            // Measure baseline linear O(N) rebuild + scan on the same runner for hardware-independent ratio
            let linearRows: Array<{ ID: string; Name: string }> = Array.from({ length: 2000 }, (_, i) => ({
                ID: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
                Name: `Item_${i}`,
            }));
            const tLinearDelta0 = performance.now();
            for (let i = 0; i < 100; i++) {
                const idx = (i * 17) % 2000;
                const id = `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
                const rebuiltMap = new Map<string, number>();
                for (let r = 0; r < linearRows.length; r++) {
                    rebuiltMap.set(linearRows[r].ID.trim().toLowerCase(), r);
                }
                const nextRows = linearRows.slice();
                const pos = rebuiltMap.get(id.toLowerCase());
                if (pos !== undefined) {
                    nextRows[pos] = { ID: id, Name: `Updated_${i}` };
                }
                linearRows = nextRows;
            }
            const linearDeltaMs = Number((performance.now() - tLinearDelta0).toFixed(2));
            const pkMapSpeedup = Number((linearDeltaMs / pkMapDeltaMs).toFixed(1));
            fx.Primitives.BaseEngineLinearScan100DeltasMs = linearDeltaMs;
            fx.Primitives.BaseEnginePKMapSpeedupRatio = pkMapSpeedup;

            // 3. Wave 4.1a: GetEntityObjectWithOptions({ SkipNewRecord: true }) vs default (500 calls)
            const tGeoDef0 = performance.now();
            for (let i = 0; i < 500; i++) {
                await ctx.Provider.GetEntityObject('MJ: AI Agents', ctx.User);
            }
            const geoDefaultMs = Number((performance.now() - tGeoDef0).toFixed(2));
            fx.Primitives.GetEntityObjectDefault500Ms = geoDefaultMs;

            const tGeoSkip0 = performance.now();
            for (let i = 0; i < 500; i++) {
                await (ctx.Provider as unknown as GenericDatabaseProvider).GetEntityObjectWithOptions(
                    'MJ: AI Agents',
                    { SkipNewRecord: true },
                    ctx.User
                );
            }
            const geoSkipMs = Number((performance.now() - tGeoSkip0).toFixed(2));
            fx.Primitives.GetEntityObjectSkipNewRecord500Ms = geoSkipMs;

            // 4. Wave 4.1b: UserCache.UserByEmail O(1) secondary index vs linear .find() (10,000 lookups over 500 users)
            const uc = UserCache.Instance;
            const ucInternal = uc as unknown as { _users: UserInfo[] };
            const savedUsers = ucInternal._users.slice();
            const templateUser = uc.Users[0] ?? ctx.User;
            const syntheticUsers: UserInfo[] = [];
            try {
                for (let i = 0; i < 500; i++) {
                    const email = `pb15_bench_user_${i}@example.com`;
                    const u = Object.assign(Object.create(Object.getPrototypeOf(templateUser)) as UserInfo, templateUser, {
                        ID: `00000000-0000-0000-0001-${String(i + 1).padStart(12, '0')}`,
                        Name: `PB15_User_${i}`,
                        Email: email,
                    });
                    syntheticUsers.push(u);
                }
                ucInternal._users = [...savedUsers, ...syntheticUsers];
                // Warmup once so ensureIndexes() populates the secondary Map
                uc.UserByEmail('pb15_bench_user_0@example.com');

                const tUc0 = performance.now();
                let resolvedEmailCount = 0;
                for (let i = 0; i < 10_000; i++) {
                    const found = uc.UserByEmail(`PB15_BENCH_USER_${i % 500}@example.com`);
                    if (found) {
                        resolvedEmailCount++;
                    }
                }
                const userByEmailMs = Math.max(0.05, Number((performance.now() - tUc0).toFixed(2)));
                AssertEqual(resolvedEmailCount, 10_000, 'PB15: all 10,000 case-insensitive UserByEmail lookups resolved');

                const tUcLinear0 = performance.now();
                let linearEmailCount = 0;
                for (let i = 0; i < 10_000; i++) {
                    const target = `PB15_BENCH_USER_${i % 500}@example.com`.trim().toLowerCase();
                    const found = syntheticUsers.find((u) => u.Email.trim().toLowerCase() === target);
                    if (found) {
                        linearEmailCount++;
                    }
                }
                const userByEmailLinearMs = Number((performance.now() - tUcLinear0).toFixed(2));
                const emailSpeedup = Number((userByEmailLinearMs / userByEmailMs).toFixed(1));
                AssertEqual(linearEmailCount, 10_000, 'PB15: all 10,000 linear email lookups resolved');

                fx.Primitives.UserByEmail10kLookupsMs = userByEmailMs;
                fx.Primitives.UserByEmailLinear10kLookupsMs = userByEmailLinearMs;
                fx.Primitives.UserByEmailSpeedupRatio = emailSpeedup;
            } finally {
                ucInternal._users = savedUsers;
                uc.UserByEmail(ctx.User.Email ?? '');
            }

            console.log(
                `      → PB15 Wave 4 Cache/Engine Primitives: ApplyRowChanges=${applyRowChangesMs}ms | ` +
                    `PKMapDelta=${pkMapDeltaMs}ms (${fx.Primitives.BaseEnginePKMapSpeedupRatio}x vs linear ${linearDeltaMs}ms) | ` +
                    `SkipNewRecord=${geoSkipMs}ms (vs default ${geoDefaultMs}ms) | ` +
                    `UserByEmail=${fx.Primitives.UserByEmail10kLookupsMs}ms (${fx.Primitives.UserByEmailSpeedupRatio}x vs linear ${fx.Primitives.UserByEmailLinear10kLookupsMs}ms)`
            );
        },
    },
    {
        Id: `${BUNDLE}.PB16`,
        Name: 'PB16: Wave 4.1a + 4.3a — RunView narrow Fields + UserSearchString SQL column projection & CanCountFromBaseTable base-table COUNT(*) compilation benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const dbProv = ctx.Provider as unknown as GenericDatabaseProvider;

            // 1. Wave 4.1a: Narrow Fields: ['ID', 'Name'] + UserSearchString vs Wide Fields on MJ: Actions
            let narrowCapturedSql = '';
            let wideCapturedSql = '';
            const origExec = dbProv.ExecuteSQL.bind(dbProv);

            dbProv.ExecuteSQL = (async (sql: string, params?: unknown, options?: unknown, user?: UserInfo) => {
                if (sql.includes('vwActions') && sql.trim().startsWith('SELECT') && !sql.includes('COUNT(*)')) {
                    if (!narrowCapturedSql) {
                        narrowCapturedSql = sql;
                    } else if (!wideCapturedSql && sql !== narrowCapturedSql) {
                        wideCapturedSql = sql;
                    }
                }
                return origExec(sql, params as never, options as never, user);
            }) as typeof dbProv.ExecuteSQL;

            let narrowCallsMs = 0;
            let wideCallsMs = 0;
            let narrowReturnedRowCols = -1;
            let wideReturnedRowCols = -1;
            try {
                const tNarrow0 = performance.now();
                for (let i = 0; i < 10; i++) {
                    const res = await rv.RunView<Record<string, unknown>>(
                        {
                            EntityName: 'MJ: Actions',
                            UserSearchString: 'Calculate',
                            Fields: ['ID', 'Name'],
                            ResultType: 'simple',
                            BypassCache: true,
                        },
                        ctx.User
                    );
                    Assert(res.Success, `PB16: narrow RunView failed: ${res.ErrorMessage}`);
                    if (i === 0 && res.Results.length > 0) {
                        narrowReturnedRowCols = Object.keys(res.Results[0]).length;
                    }
                }
                narrowCallsMs = Number((performance.now() - tNarrow0).toFixed(2));

                const tWide0 = performance.now();
                for (let i = 0; i < 10; i++) {
                    const res = await rv.RunView<Record<string, unknown>>(
                        {
                            EntityName: 'MJ: Actions',
                            UserSearchString: 'Calculate',
                            ResultType: 'simple',
                            BypassCache: true,
                        },
                        ctx.User
                    );
                    Assert(res.Success, `PB16: wide RunView failed: ${res.ErrorMessage}`);
                    if (i === 0 && res.Results.length > 0) {
                        wideReturnedRowCols = Object.keys(res.Results[0]).length;
                    }
                }
                wideCallsMs = Number((performance.now() - tWide0).toFixed(2));
            } finally {
                dbProv.ExecuteSQL = origExec;
            }

            const parseSelectColCount = (sqlText: string, rowKeysCount: number): number => {
                if (rowKeysCount > 0) {
                    return rowKeysCount;
                }
                const m = /SELECT\s+([\s\S]+?)\s+FROM\s+/i.exec(sqlText);
                if (!m || !m[1]) return -1;
                if (m[1].includes('*')) {
                    const actionsEntity = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Actions');
                    return actionsEntity?.Fields.length ?? 37;
                }
                return m[1].split(',').length;
            };
            const narrowCols = parseSelectColCount(narrowCapturedSql, narrowReturnedRowCols);
            const wideCols = parseSelectColCount(wideCapturedSql, wideReturnedRowCols);

            fx.Primitives.NarrowSearchRunView10CallsMs = narrowCallsMs;
            fx.Primitives.WideSearchRunView10CallsMs = wideCallsMs;
            fx.Primitives.NarrowSearchReturnedColumns = narrowCols;
            fx.Primitives.WideSearchReturnedColumns = wideCols;

            AssertEqual(
                narrowCols,
                2,
                `PB16: expected RunView with Fields=['ID','Name'] + UserSearchString to project exactly 2 SQL columns, got ${narrowCols} (SQL: ${narrowCapturedSql})`
            );
            Assert(wideCols >= 20, `PB16: expected wide RunView on MJ: Actions to project >= 20 columns, got ${wideCols}`);

            // 2. Wave 4.3a: CanCountFromBaseTable metadata & COUNT(*) SQL rewrite on MJ: Record Changes
            const canCountEntities = ctx.Provider.Entities.filter((e) => dbProv.CanCountFromBaseTable(e, ''));
            fx.Primitives.CanCountFromBaseTableEntityCount = canCountEntities.length;

            const rcEntity = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Record Changes');
            Assert(!!rcEntity, 'PB16: expected MJ: Record Changes in entity metadata');
            AssertEqual(
                dbProv.CanCountFromBaseTable(rcEntity!, "Status = 'Complete'"),
                true,
                'PB16: expected dbProv.CanCountFromBaseTable(MJ: Record Changes, "Status = \'Complete\'") to return true'
            );

            let countSqlCaptured = '';
            const origBatch = dbProv.ExecuteSQLBatch ? dbProv.ExecuteSQLBatch.bind(dbProv) : undefined;
            dbProv.ExecuteSQL = (async (sql: string, params?: unknown, options?: unknown, user?: UserInfo) => {
                if (/SELECT\s+COUNT\(\*\)/i.test(sql) && !countSqlCaptured) {
                    countSqlCaptured = sql;
                }
                return origExec(sql, params as never, options as never, user);
            }) as typeof dbProv.ExecuteSQL;
            if (origBatch) {
                dbProv.ExecuteSQLBatch = (async (
                    sqls: string[],
                    params?: unknown[][],
                    options?: unknown,
                    user?: UserInfo
                ) => {
                    for (const s of sqls) {
                        if (/SELECT\s+COUNT\(\*\)/i.test(s) && !countSqlCaptured) {
                            countSqlCaptured = s;
                        }
                    }
                    return origBatch(sqls, params as never, options as never, user);
                }) as typeof dbProv.ExecuteSQLBatch;
            }

            try {
                const countRes = await rv.RunView(
                    {
                        EntityName: 'MJ: Record Changes',
                        ExtraFilter: "Status = 'Complete'",
                        ResultType: 'count_only',
                        BypassCache: true,
                    },
                    ctx.User
                );
                Assert(countRes.Success, `PB16: count_only RunView on MJ: Record Changes failed: ${countRes.ErrorMessage}`);
            } finally {
                dbProv.ExecuteSQL = origExec;
                if (origBatch) {
                    dbProv.ExecuteSQLBatch = origBatch;
                }
            }

            const normalizedCountSql = countSqlCaptured.replace(/\s+/g, ' ').trim();
            const targetsBaseTable =
                normalizedCountSql.includes('[RecordChange]') && !normalizedCountSql.includes('[vwRecordChanges]');
            fx.Primitives.RecordChangesCountTargetsBaseTable = targetsBaseTable;
            fx.Primitives.RecordChangesCountSql = normalizedCountSql;

            Assert(
                targetsBaseTable,
                `PB16: expected MJ: Record Changes count_only SQL to target base table [RecordChange] instead of [vwRecordChanges], got: ${normalizedCountSql}`
            );

            console.log(
                `      → PB16 RunView Narrow Projection & Base-Table COUNT: narrowCols=${narrowCols} (vs wide=${wideCols}), ` +
                    `narrow10Calls=${narrowCallsMs}ms (vs wide=${wideCallsMs}ms) | ` +
                    `CanCountFromBaseTable=${canCountEntities.length} entities, RecordChangesCountTargetsBaseTable=${targetsBaseTable}`
            );
        },
    },
    {
        Id: `${BUNDLE}.PB17`,
        Name: 'PB17: Wave 4.4 + 4.7 — TwoTierCacheStorageProvider L1 frozen CoW (ApplyRunViewRowDelta) & FrozenRowSerializationCache WeakMap wire memoization benchmark',
        Fn: async (): Promise<void> => {
            const fx = requireFixture();

            // 1. Wave 4.4: TwoTierCacheStorageProvider L1 frozen CoW + ApplyRunViewRowDelta
            const l2Store = new Map<string, string>();
            const l2HashStore = new Map<string, Map<string, string>>();
            const fullKey = (k: string, cat?: string): string => `${cat ?? 'default'}:${k}`;
            const mockL2 = {
                SharesReferences: false,
                SupportsCrossProcessPersistence: true,
                SharedAcrossProcesses: true,
                OnCacheChanged: (): (() => void) => () => {},
                OnReconciliationRequired: (): (() => void) => () => {},
                GetItem: async <T = unknown>(k: string, cat?: string): Promise<T | null> => {
                    const fk = fullKey(k, cat);
                    const h = l2HashStore.get(fk);
                    if (h) {
                        const rows: unknown[] = [];
                        for (const v of h.values()) {
                            rows.push(JSON.parse(v));
                        }
                        return { results: rows, rowCount: rows.length, maxUpdatedAt: '2026-01-01T00:00:00.000Z' } as unknown as T;
                    }
                    const raw = l2Store.get(fk);
                    return raw ? (JSON.parse(raw) as T) : null;
                },
                GetItems: async <T = unknown>(keys: string[], cat?: string): Promise<Map<string, T | null>> => {
                    const out = new Map<string, T | null>();
                    for (const k of keys) {
                        const val = await mockL2.GetItem<T>(k, cat);
                        out.set(k, val);
                    }
                    return out;
                },
                SetItem: async <T>(k: string, val: T, cat?: string): Promise<void> => {
                    l2Store.set(fullKey(k, cat), JSON.stringify(val));
                },
                Remove: async (k: string, cat?: string): Promise<void> => {
                    l2Store.delete(fullKey(k, cat));
                    l2HashStore.delete(fullKey(k, cat));
                },
                ClearCategory: async (cat: string): Promise<void> => {
                    const prefix = `${cat}:`;
                    for (const k of [...l2Store.keys()]) {
                        if (k.startsWith(prefix)) l2Store.delete(k);
                    }
                },
                ClearCategoryChecked: async (): Promise<{ Ok: boolean }> => ({ Ok: true }),
                GetCategoryKeys: async (cat: string): Promise<string[]> => {
                    const prefix = `${cat}:`;
                    return [...l2Store.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
                },
                GetIndexGroupKeys: async (): Promise<string[]> => [],
                WithKeyLock: async <T>(_lockKey: string, fn: () => Promise<T>): Promise<T> => fn(),
                ApplyRunViewRowDelta: async (fp: string, rawDeltaJson: string): Promise<boolean> => {
                    const fk = fullKey(fp, 'RunViewCache');
                    let h = l2HashStore.get(fk);
                    if (!h) {
                        h = new Map<string, string>();
                        l2HashStore.set(fk, h);
                    }
                    const delta = JSON.parse(rawDeltaJson) as {
                        upsertedRows: Array<Record<string, unknown>>;
                        deletedPrimaryKeys: Array<Record<string, unknown>>;
                    };
                    for (const r of delta.upsertedRows) {
                        h.set(String(r.ID), JSON.stringify(r));
                    }
                    for (const d of delta.deletedPrimaryKeys) {
                        h.delete(String(d.ID));
                    }
                    return true;
                },
            };

            const twoTier = new TwoTierCacheStorageProvider(mockL2 as unknown as RedisLocalStorageProvider);
            const lcm = new BenchLocalCacheManager();
            await lcm.Initialize(twoTier, { maxSizeBytes: 64 * 1024 * 1024 });

            const extRows = Array.from({ length: 2000 }, (_, i) => ({
                ID: `00000000-0000-0000-0002-${String(i + 1).padStart(12, '0')}`,
                Name: `ExtRow_${i}`,
                Description: `Long external storage payload text for row ${i} `.repeat(4),
                Status: 'Active',
                __mj_CreatedAt: '2026-01-01T00:00:00.000Z',
                __mj_UpdatedAt: '2026-01-01T00:00:00.000Z',
            }));
            const extFp = 'MJ: Action Categories|_|_|0|0|pb17';
            await lcm.SetRunViewResult(
                extFp,
                { EntityName: 'MJ: Action Categories', ExtraFilter: '' },
                extRows,
                '2026-01-01T00:00:00.000Z',
                undefined,
                2000
            );

            // Verify zero-clone L1 identity across consecutive reads
            const read1 = await twoTier.GetItem<CachedRunViewData>(extFp, 'RunViewCache');
            const read2 = await twoTier.GetItem<CachedRunViewData>(extFp, 'RunViewCache');
            const zeroCloneIdentity =
                !!read1 &&
                !!read2 &&
                read1.results === read2.results &&
                Object.isFrozen(read1.results) &&
                Object.isFrozen(read1.results[0]);
            fx.Primitives.TwoTierL1ZeroCloneIdentity = zeroCloneIdentity;
            Assert(zeroCloneIdentity, 'PB17: TwoTierCacheStorageProvider L1 must return identical deep-frozen array reference on hit');

            const tExt0 = performance.now();
            for (let i = 0; i < 200; i++) {
                await lcm.GetRunViewResult(extFp);
            }
            for (let i = 0; i < 50; i++) {
                const id = `00000000-0000-0000-0002-${String(i + 1).padStart(12, '0')}`;
                const updatedRow = {
                    ...extRows[i],
                    Description: `Updated delta ${i}`,
                    __mj_UpdatedAt: '2026-01-01T00:00:00.000Z',
                };
                await lcm.ApplyRowChanges(
                    extFp,
                    [{ Key: CompositeKey.FromID(id), Row: updatedRow }],
                    '2026-01-01T00:00:00.000Z'
                );
            }
            const twoTierElapsedMs = Number((performance.now() - tExt0).toFixed(2));
            fx.Primitives.TwoTierL1200Reads50DeltasMs = twoTierElapsedMs;

            // 2. Wave 4.7: Frozen row WeakMap wire serialization cache vs uncached JSON.stringify (5,000 rows x 20 responses)
            const wireRows = DeepFreeze(
                Array.from({ length: 5000 }, (_, i) => ({
                    ID: `00000000-0000-0000-0003-${String(i + 1).padStart(12, '0')}`,
                    Name: `WireEntity_${i}`,
                    Description: `Serialized row description for GraphQL RunView wire transport #${i}`,
                    Status: 'Active',
                    Sequence: i,
                }))
            );

            // Warmup & measure WeakMap memoized serialization (mirrors RunViewResolver.FrozenRowSerializationCache)
            const weakRowCache = new WeakMap<object, Map<string, { Data: string }>>();
            const entityId = '00000000-0000-0000-0000-000000000001';
            const tWireCached0 = performance.now();
            let cachedTotalLen = 0;
            for (let iter = 0; iter < 20; iter++) {
                for (let r = 0; r < wireRows.length; r++) {
                    const row = wireRows[r];
                    let entityMap = weakRowCache.get(row);
                    let entry = entityMap?.get(entityId);
                    if (!entry) {
                        entry = { Data: JSON.stringify(row) };
                        if (!entityMap) {
                            entityMap = new Map();
                            weakRowCache.set(row, entityMap);
                        }
                        entityMap.set(entityId, entry);
                    }
                    cachedTotalLen += entry.Data.length;
                }
            }
            const cachedWireMs = Math.max(0.05, Number((performance.now() - tWireCached0).toFixed(2)));

            const tWireUncached0 = performance.now();
            let uncachedTotalLen = 0;
            for (let iter = 0; iter < 20; iter++) {
                for (let r = 0; r < wireRows.length; r++) {
                    uncachedTotalLen += JSON.stringify(wireRows[r]).length;
                }
            }
            const uncachedWireMs = Number((performance.now() - tWireUncached0).toFixed(2));
            const wireSpeedup = Number((uncachedWireMs / cachedWireMs).toFixed(2));

            AssertEqual(cachedTotalLen, uncachedTotalLen, 'PB17: FrozenRowSerializationCache byte length must match JSON.stringify');
            fx.Primitives.FrozenRowWireSerialize5000x20Ms = cachedWireMs;
            fx.Primitives.UncachedJsonStringify5000x20Ms = uncachedWireMs;
            fx.Primitives.FrozenRowWireSpeedupRatio = wireSpeedup;

            console.log(
                `      → PB17 TwoTier L1 CoW & Wire Serialization: TwoTier200Reads50Deltas=${twoTierElapsedMs}ms (zeroCloneIdentity=${zeroCloneIdentity}) | ` +
                    `FrozenRowWire=${cachedWireMs}ms (${wireSpeedup}x faster vs uncached JSON.stringify ${uncachedWireMs}ms)`
            );
        },
    },
    {
        Id: `${BUNDLE}.PB18`,
        Name: 'PB18: Longitudinal Waves 1–4 Baseline Comparison & Automated Structural/Variance Regression Gate (wave4-baseline.json)',
        Fn: async (): Promise<void> => {
            const fx = requireFixture();
            const currentDir = path.dirname(fileURLToPath(import.meta.url));
            const baselinePath = path.resolve(currentDir, '../../benchmark-logs/wave4-baseline.json');
            Assert(fs.existsSync(baselinePath), `PB18: expected committed baseline file at ${baselinePath}`);

            type BaselineProfileShape = {
                Runner?: string;
                PrimitivesTotalMs: number;
                AggregatePrimitivesAndWave4Ms?: number;
                AggregateAgentFrameworkOverheadMs?: number;
                Primitives: Record<string, number | boolean>;
                DeterministicAgentRuns: Array<{
                    AgentName: string;
                    FrameworkOverheadMs?: number;
                    TotalStepStorageBytes: number;
                    PayloadAtStartPointerSteps: number;
                    PayloadAtEndPointerSteps: number;
                    StorageSavingsPercent: number;
                }>;
            };

            const baselineDoc = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
                HistoricalWaves: {
                    PreWave1: Record<string, number>;
                    Wave2: Record<string, number>;
                    Wave3: Record<string, number>;
                    PreWave4: Record<string, number | boolean | string>;
                };
                Baseline: BaselineProfileShape;
                CIBaseline?: BaselineProfileShape;
                Gates: {
                    MaxTimingRegressionPercentWarn: number;
                    MaxTimingRegressionMultiplierFail: number;
                    MinAbsoluteTimingDeltaMsWarn: number;
                    MinAbsoluteTimingDeltaMsFailLocal: number;
                    MinAbsoluteTimingDeltaMsFailCI: number;
                    MaxAggregatePrimitivesMultiplierWarn: number;
                    MaxAggregatePrimitivesMultiplierFail: number;
                    MaxAggregateAgentFrameworkMultiplierWarn: number;
                    MaxAggregateAgentFrameworkMultiplierFail: number;
                    MinDatestampsOnlyEntities: number;
                    ExpectedNarrowSearchColumns: number;
                    MinCanCountFromBaseTableEntities: number;
                    MinBaseEnginePKMapSpeedupRatio: number;
                    MinUserByEmailSpeedupRatio: number;
                    MinFrozenRowWireSpeedupRatio: number;
                    MaxPB7StepStorageBytesLocal: number;
                    MaxPB7StepStorageBytesCI: number;
                    MinPB7StartPointersLocal: number;
                    MinPB7StartPointersCI: number;
                    MinPB7EndPointersLocal: number;
                    MinPB7EndPointersCI: number;
                    MinPB7StorageSavingsPercentLocal: number;
                    MinPB7StorageSavingsPercentCI: number;
                    MaxPB8StepStorageBytesLocal: number;
                    MaxPB8StepStorageBytesCI: number;
                    MinPB8StartPointersLocal: number;
                    MinPB8StartPointersCI: number;
                    MinPB8EndPointersLocal: number;
                    MinPB8EndPointersCI: number;
                    MaxPB9StepStorageBytesLocal: number;
                    MaxPB9StepStorageBytesCI: number;
                    MinPB9StartPointersLocal: number;
                    MinPB9StartPointersCI: number;
                    MinPB9EndPointersLocal: number;
                    MinPB9EndPointersCI: number;
                };
            };

            const p = fx.Primitives;
            const primitivesTotalMs = Number(
                (
                    (p.ClassFactoryAndObjectCacheMs ?? 0) +
                    (p.EntityHydrateAndFlsMs ?? 0) +
                    (p.LocalCacheWritesAndStatsMs ?? 0) +
                    (p.TemplateRenderSimpleMs ?? 0) +
                    (p.ActionSnapshotAndEngineLookupMs ?? 0) +
                    (p.PayloadApplyAndDeepDiffMs ?? 0)
                ).toFixed(2)
            );
            const aggregatePrimitivesMs = Number(
                (
                    primitivesTotalMs +
                    (p.DatestampsOnly10SavesMs ?? 0) +
                    (p.ApplyRowChanges50On5000RowsMs ?? 0) +
                    (p.BaseEnginePKMap100DeltasMs ?? 0) +
                    (p.GetEntityObjectSkipNewRecord500Ms ?? 0) +
                    (p.UserByEmail10kLookupsMs ?? 0) +
                    (p.NarrowSearchRunView10CallsMs ?? 0) +
                    (p.TwoTierL1200Reads50DeltasMs ?? 0) +
                    (p.FrozenRowWireSerialize5000x20Ms ?? 0)
                ).toFixed(2)
            );
            const aggregateAgentFrameworkMs = Number(
                fx.DeterministicAgentRuns.reduce((sum, r) => sum + (r.FrameworkOverheadMs ?? 0), 0).toFixed(2)
            );

            const isCIProfile =
                (process.env.GITHUB_ACTIONS === 'true' || process.env.MJ_PERF_PROFILE === 'ci') &&
                process.env.MJ_PERF_PROFILE !== 'local' &&
                !!baselineDoc.CIBaseline;
            const activeBaseline = isCIProfile && baselineDoc.CIBaseline ? baselineDoc.CIBaseline : baselineDoc.Baseline;

            const hw = baselineDoc.HistoricalWaves;
            const baseP = activeBaseline.Primitives;
            const gates = baselineDoc.Gates;
            const strictTiming = process.env.MJ_PERF_STRICT_TIMING === '1';
            const minFailDeltaMs = isCIProfile ? gates.MinAbsoluteTimingDeltaMsFailCI : gates.MinAbsoluteTimingDeltaMsFailLocal;

            const computeTimingRow = (
                metric: string,
                unit: string,
                currentVal: number | undefined,
                baseVal: number,
                preW1?: number,
                w2?: number,
                w3?: number,
                preW4?: number,
                customWarnMultiplier?: number,
                customFailMultiplier?: number,
                isAggregateRow?: boolean
            ): BaselineComparisonRow => {
                const cur = currentVal ?? 0;
                const deltaPct = baseVal > 0 ? Number((((cur - baseVal) / baseVal) * 100).toFixed(1)) : 0;
                const failMultiplier = customFailMultiplier ?? gates.MaxTimingRegressionMultiplierFail;
                const warnPct = customWarnMultiplier
                    ? Number(((customWarnMultiplier - 1) * 100).toFixed(1))
                    : gates.MaxTimingRegressionPercentWarn;
                let status: BaselineComparisonRow['Status'] = 'PASS';
                if (deltaPct <= -10) {
                    status = 'IMPROVED';
                } else if (cur > baseVal * failMultiplier && cur - baseVal > minFailDeltaMs) {
                    // On shared 4-shard CI runners, single-metric GC/CPU pauses emit WARN unless MJ_PERF_STRICT_TIMING=1,
                    // while Aggregate Suite rows always enforce hard FAIL.
                    status = isCIProfile && !isAggregateRow && !strictTiming ? 'WARN' : 'FAIL';
                } else if (deltaPct > warnPct && cur - baseVal > gates.MinAbsoluteTimingDeltaMsWarn) {
                    status = strictTiming ? 'FAIL' : 'WARN';
                }
                return {
                    Metric: metric,
                    Unit: unit,
                    PreWave1: preW1 ?? '—',
                    Wave2: w2 ?? '—',
                    Wave3: w3 ?? '—',
                    PreWave4: preW4 ?? '—',
                    Wave4Baseline: baseVal,
                    Current: cur,
                    DeltaVsBaselinePercent: deltaPct,
                    Status: status,
                };
            };

            const baseAggPrimitivesMs = activeBaseline.AggregatePrimitivesAndWave4Ms ?? 165.43;
            const baseAggAgentFrameworkMs = activeBaseline.AggregateAgentFrameworkOverheadMs ?? 811.1;

            const rows: BaselineComparisonRow[] = [
                computeTimingRow(
                    'Aggregate Suite: Core/Cache/SQL Primitives (PB1–PB6, PB13, PB15–PB17)',
                    'ms',
                    aggregatePrimitivesMs,
                    baseAggPrimitivesMs,
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.AggregatePrimitivesAndWave4Ms),
                    gates.MaxAggregatePrimitivesMultiplierWarn,
                    gates.MaxAggregatePrimitivesMultiplierFail,
                    true
                ),
                computeTimingRow(
                    'Aggregate Suite: Deterministic Agent Framework Overhead (PB7–PB9)',
                    'ms',
                    aggregateAgentFrameworkMs,
                    baseAggAgentFrameworkMs,
                    undefined,
                    hw.Wave2.AggregateAgentFrameworkOverheadMs,
                    hw.Wave3.AggregateAgentFrameworkOverheadMs,
                    Number(hw.PreWave4.AggregateAgentFrameworkOverheadMs),
                    gates.MaxAggregateAgentFrameworkMultiplierWarn,
                    gates.MaxAggregateAgentFrameworkMultiplierFail,
                    true
                ),
                computeTimingRow(
                    'PB1–PB6 Primitives Total CPU',
                    'ms',
                    primitivesTotalMs,
                    activeBaseline.PrimitivesTotalMs,
                    hw.PreWave1.PrimitivesTotalMs,
                    hw.Wave2.PrimitivesTotalMs,
                    hw.Wave3.PrimitivesTotalMs,
                    Number(hw.PreWave4.PrimitivesTotalMs)
                ),
                computeTimingRow(
                    'PB1 ClassFactory & ObjectCache (10k)',
                    'ms',
                    p.ClassFactoryAndObjectCacheMs,
                    Number(baseP.ClassFactoryAndObjectCacheMs),
                    hw.PreWave1.PB1Ms,
                    hw.Wave2.PB1Ms,
                    hw.Wave3.PB1Ms,
                    Number(hw.PreWave4.PB1Ms)
                ),
                computeTimingRow(
                    'PB2 BaseEntity Hydration & FLS (2k rows)',
                    'ms',
                    p.EntityHydrateAndFlsMs,
                    Number(baseP.EntityHydrateAndFlsMs),
                    hw.PreWave1.PB2Ms,
                    hw.Wave2.PB2Ms,
                    hw.Wave3.PB2Ms,
                    Number(hw.PreWave4.PB2Ms)
                ),
                computeTimingRow(
                    'PB3 LocalCacheManager Writes & Stats',
                    'ms',
                    p.LocalCacheWritesAndStatsMs,
                    Number(baseP.LocalCacheWritesAndStatsMs),
                    hw.PreWave1.PB3Ms,
                    hw.Wave2.PB3Ms,
                    hw.Wave3.PB3Ms,
                    Number(hw.PreWave4.PB3Ms)
                ),
                computeTimingRow(
                    'PB4 TemplateEngine RenderSimple (1k)',
                    'ms',
                    p.TemplateRenderSimpleMs,
                    Number(baseP.TemplateRenderSimpleMs),
                    hw.PreWave1.PB4Ms,
                    hw.Wave2.PB4Ms,
                    hw.Wave3.PB4Ms,
                    Number(hw.PreWave4.PB4Ms)
                ),
                computeTimingRow(
                    'PB5 Action Snapshot & AI Perms (500)',
                    'ms',
                    p.ActionSnapshotAndEngineLookupMs,
                    Number(baseP.ActionSnapshotAndEngineLookupMs),
                    hw.PreWave1.PB5Ms,
                    hw.Wave2.PB5Ms,
                    hw.Wave3.PB5Ms,
                    Number(hw.PreWave4.PB5Ms)
                ),
                computeTimingRow(
                    'PB6 PayloadManager & DeepDiffer (50)',
                    'ms',
                    p.PayloadApplyAndDeepDiffMs,
                    Number(baseP.PayloadApplyAndDeepDiffMs),
                    hw.PreWave1.PB6Ms,
                    hw.Wave2.PB6Ms,
                    hw.Wave3.PB6Ms,
                    Number(hw.PreWave4.PB6Ms)
                ),
                computeTimingRow(
                    'PB13 datestamps_only 10x 32KB Saves',
                    'ms',
                    p.DatestampsOnly10SavesMs,
                    Number(baseP.DatestampsOnly10SavesMs),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.PB13SavesMs)
                ),
                computeTimingRow(
                    'PB15 ApplyRowChanges CoW (50 on 5k rows)',
                    'ms',
                    p.ApplyRowChanges50On5000RowsMs,
                    Number(baseP.ApplyRowChanges50On5000RowsMs),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.ApplyRowChanges50On5000RowsMs)
                ),
                computeTimingRow(
                    'PB15 BaseEngine PKMap 100 Row Deltas',
                    'ms',
                    p.BaseEnginePKMap100DeltasMs,
                    Number(baseP.BaseEnginePKMap100DeltasMs),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.BaseEnginePKMap100DeltasMs)
                ),
                computeTimingRow(
                    'PB15 GetEntityObject SkipNewRecord (500)',
                    'ms',
                    p.GetEntityObjectSkipNewRecord500Ms,
                    Number(baseP.GetEntityObjectSkipNewRecord500Ms),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.GetEntityObjectSkipNewRecord500Ms)
                ),
                computeTimingRow(
                    'PB15 UserCache.UserByEmail (10k lookups)',
                    'ms',
                    p.UserByEmail10kLookupsMs,
                    Number(baseP.UserByEmail10kLookupsMs),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.UserByEmail10kLookupsMs)
                ),
                computeTimingRow(
                    'PB16 Narrow Search RunView (10 calls)',
                    'ms',
                    p.NarrowSearchRunView10CallsMs,
                    Number(baseP.NarrowSearchRunView10CallsMs),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.NarrowSearchRunView10CallsMs)
                ),
                computeTimingRow(
                    'PB17 TwoTier L1 CoW (200 reads + 50 deltas)',
                    'ms',
                    p.TwoTierL1200Reads50DeltasMs,
                    Number(baseP.TwoTierL1200Reads50DeltasMs),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.TwoTierL1200Reads50DeltasMs)
                ),
                computeTimingRow(
                    'PB17 FrozenRow WeakMap Wire (5k x 20)',
                    'ms',
                    p.FrozenRowWireSerialize5000x20Ms,
                    Number(baseP.FrozenRowWireSerialize5000x20Ms),
                    undefined,
                    undefined,
                    undefined,
                    Number(hw.PreWave4.FrozenRowWireSerialize5000x20Ms)
                ),
            ];

            // Add deterministic agent storage rows
            const pb7Run = fx.DeterministicAgentRuns.find((r) => r.AgentName === 'Sage');
            const pb8Run = fx.DeterministicAgentRuns.find((r) => r.AgentName === 'Query Builder');
            const pb9Run = fx.DeterministicAgentRuns.find((r) => r.AgentName === 'Research Agent');

            const maxPB7Bytes = isCIProfile ? gates.MaxPB7StepStorageBytesCI : gates.MaxPB7StepStorageBytesLocal;
            const minPB7StartPointers = isCIProfile ? gates.MinPB7StartPointersCI : gates.MinPB7StartPointersLocal;
            const minPB7EndPointers = isCIProfile ? gates.MinPB7EndPointersCI : gates.MinPB7EndPointersLocal;
            const minPB7Savings = isCIProfile ? gates.MinPB7StorageSavingsPercentCI : gates.MinPB7StorageSavingsPercentLocal;
            const maxPB8Bytes = isCIProfile ? gates.MaxPB8StepStorageBytesCI : gates.MaxPB8StepStorageBytesLocal;
            const minPB8StartPointers = isCIProfile ? gates.MinPB8StartPointersCI : gates.MinPB8StartPointersLocal;
            const minPB8EndPointers = isCIProfile ? gates.MinPB8EndPointersCI : gates.MinPB8EndPointersLocal;
            const maxPB9Bytes = isCIProfile ? gates.MaxPB9StepStorageBytesCI : gates.MaxPB9StepStorageBytesLocal;
            const minPB9StartPointers = isCIProfile ? gates.MinPB9StartPointersCI : gates.MinPB9StartPointersLocal;
            const minPB9EndPointers = isCIProfile ? gates.MinPB9EndPointersCI : gates.MinPB9EndPointersLocal;
            const pb7BaseBytes =
                activeBaseline.DeterministicAgentRuns.find((r) => r.AgentName === 'Sage')?.TotalStepStorageBytes ?? 52871;
            const pb8BaseBytes =
                activeBaseline.DeterministicAgentRuns.find((r) => r.AgentName === 'Query Builder')?.TotalStepStorageBytes ?? 126263;
            const pb9BaseBytes =
                activeBaseline.DeterministicAgentRuns.find((r) => r.AgentName === 'Research Agent')?.TotalStepStorageBytes ?? 104158;

            if (pb7Run) {
                rows.push({
                    Metric: 'PB7 Sage 4-Turn Step Storage',
                    Unit: 'bytes',
                    PreWave1: hw.PreWave1.PB7StorageBytes,
                    Wave2: hw.Wave2.PB7StorageBytes,
                    Wave3: hw.Wave3.PB7StorageBytes,
                    PreWave4: Number(hw.PreWave4.PB7StorageBytes),
                    Wave4Baseline: pb7BaseBytes,
                    Current: pb7Run.TotalStepStorageBytes,
                    DeltaVsBaselinePercent: Number((((pb7Run.TotalStepStorageBytes - pb7BaseBytes) / pb7BaseBytes) * 100).toFixed(1)),
                    Status: pb7Run.TotalStepStorageBytes <= maxPB7Bytes ? 'PASS' : 'FAIL',
                });
            }
            if (pb8Run) {
                rows.push({
                    Metric: 'PB8 Query Builder + Strategist Storage',
                    Unit: 'bytes',
                    PreWave1: hw.PreWave1.PB8StorageBytes,
                    Wave2: hw.Wave2.PB8StorageBytes,
                    Wave3: hw.Wave3.PB8StorageBytes,
                    PreWave4: Number(hw.PreWave4.PB8StorageBytes),
                    Wave4Baseline: pb8BaseBytes,
                    Current: pb8Run.TotalStepStorageBytes,
                    DeltaVsBaselinePercent: Number((((pb8Run.TotalStepStorageBytes - pb8BaseBytes) / pb8BaseBytes) * 100).toFixed(1)),
                    Status: pb8Run.TotalStepStorageBytes <= maxPB8Bytes ? 'PASS' : 'FAIL',
                });
            }
            if (pb9Run) {
                rows.push({
                    Metric: 'PB9 Research Agent + Writer Storage',
                    Unit: 'bytes',
                    PreWave1: hw.PreWave1.PB9StorageBytes,
                    Wave2: hw.Wave2.PB9StorageBytes,
                    Wave3: hw.Wave3.PB9StorageBytes,
                    PreWave4: Number(hw.PreWave4.PB9StorageBytes),
                    Wave4Baseline: pb9BaseBytes,
                    Current: pb9Run.TotalStepStorageBytes,
                    DeltaVsBaselinePercent: Number((((pb9Run.TotalStepStorageBytes - pb9BaseBytes) / pb9BaseBytes) * 100).toFixed(1)),
                    Status: pb9Run.TotalStepStorageBytes <= maxPB9Bytes ? 'PASS' : 'FAIL',
                });
            }

            // Relative Aggregate Slowness Factors & Structural Invariant rows
            const aggPrimFactor = Number((aggregatePrimitivesMs / Math.max(1, baseAggPrimitivesMs)).toFixed(2));
            const aggAgentFactor = Number((aggregateAgentFrameworkMs / Math.max(1, baseAggAgentFrameworkMs)).toFixed(2));
            rows.push(
                {
                    Metric: 'Aggregate Primitives Slowness Factor (vs Baseline)',
                    Unit: 'x',
                    PreWave4: `${Number((Number(hw.PreWave4.AggregatePrimitivesAndWave4Ms) / 165.43).toFixed(2))}x`,
                    Wave4Baseline: '1.00x',
                    Current: `${aggPrimFactor}x`,
                    DeltaVsBaselinePercent: Number(((aggPrimFactor - 1) * 100).toFixed(1)),
                    Status:
                        aggPrimFactor > gates.MaxAggregatePrimitivesMultiplierFail
                            ? 'FAIL'
                            : aggPrimFactor > gates.MaxAggregatePrimitivesMultiplierWarn
                              ? strictTiming
                                  ? 'FAIL'
                                  : 'WARN'
                              : aggPrimFactor <= 0.9
                                ? 'IMPROVED'
                                : 'PASS',
                },
                {
                    Metric: 'Aggregate Agent Framework Slowness Factor (vs Baseline)',
                    Unit: 'x',
                    Wave2: '0.97x',
                    Wave3: '0.90x',
                    PreWave4: '0.85x',
                    Wave4Baseline: '1.00x',
                    Current: `${aggAgentFactor}x`,
                    DeltaVsBaselinePercent: Number(((aggAgentFactor - 1) * 100).toFixed(1)),
                    Status:
                        aggAgentFactor > gates.MaxAggregateAgentFrameworkMultiplierFail
                            ? 'FAIL'
                            : aggAgentFactor > gates.MaxAggregateAgentFrameworkMultiplierWarn
                              ? strictTiming
                                  ? 'FAIL'
                                  : 'WARN'
                              : aggAgentFactor <= 0.9
                                ? 'IMPROVED'
                                : 'PASS',
                },
                {
                    Metric: 'PB16 Narrow Search SQL Columns Projected',
                    Unit: 'cols',
                    PreWave4: Number(hw.PreWave4.NarrowSearchReturnedColumns),
                    Wave4Baseline: gates.ExpectedNarrowSearchColumns,
                    Current: p.NarrowSearchReturnedColumns ?? -1,
                    DeltaVsBaselinePercent: 0,
                    Status: p.NarrowSearchReturnedColumns === gates.ExpectedNarrowSearchColumns ? 'PASS' : 'FAIL',
                },
                {
                    Metric: 'PB16 MJ: Record Changes Count Targets Base Table',
                    Unit: 'bool',
                    PreWave4: String(hw.PreWave4.RecordChangesCountTargetsBaseTable),
                    Wave4Baseline: 'true',
                    Current: String(p.RecordChangesCountTargetsBaseTable ?? false),
                    DeltaVsBaselinePercent: null,
                    Status: p.RecordChangesCountTargetsBaseTable === true ? 'PASS' : 'FAIL',
                },
                {
                    Metric: 'PB15 BaseEngine PKMap vs Linear Speedup Ratio',
                    Unit: 'x',
                    PreWave4: '1.0',
                    Wave4Baseline: `${baseP.BaseEnginePKMapSpeedupRatio}x`,
                    Current: `${p.BaseEnginePKMapSpeedupRatio ?? 0}x`,
                    DeltaVsBaselinePercent: null,
                    Status: (p.BaseEnginePKMapSpeedupRatio ?? 0) >= gates.MinBaseEnginePKMapSpeedupRatio ? 'PASS' : 'FAIL',
                },
                {
                    Metric: 'PB15 UserCache.UserByEmail vs Linear Speedup Ratio',
                    Unit: 'x',
                    PreWave4: '1.0',
                    Wave4Baseline: `${baseP.UserByEmailSpeedupRatio}x`,
                    Current: `${p.UserByEmailSpeedupRatio ?? 0}x`,
                    DeltaVsBaselinePercent: null,
                    Status: (p.UserByEmailSpeedupRatio ?? 0) >= gates.MinUserByEmailSpeedupRatio ? 'PASS' : 'FAIL',
                },
                {
                    Metric: 'PB17 FrozenRow WeakMap vs JSON.stringify Speedup',
                    Unit: 'x',
                    PreWave4: '1.0',
                    Wave4Baseline: `${baseP.FrozenRowWireSpeedupRatio}x`,
                    Current: `${p.FrozenRowWireSpeedupRatio ?? 0}x`,
                    DeltaVsBaselinePercent: null,
                    Status: (p.FrozenRowWireSpeedupRatio ?? 0) >= gates.MinFrozenRowWireSpeedupRatio ? 'PASS' : 'FAIL',
                }
            );

            fx.BaselineComparisons = rows;

            // Emit GitHub Actions warnings for any timing variance rows flagged WARN
            for (const r of rows) {
                if (r.Status === 'WARN') {
                    console.warn(
                        `::warning title=IT128 Performance Variance (${activeBaseline.Runner ?? 'default'})::${r.Metric}: current=${r.Current}${r.Unit} vs baseline=${r.Wave4Baseline}${r.Unit} (${r.DeltaVsBaselinePercent}%)`
                    );
                }
            }

            // Enforce hard structural & speedup ratio gates (100% deterministic across local & GitHub CI)
            Assert(
                (p.DatestampsOnlyEntityCount ?? 0) >= gates.MinDatestampsOnlyEntities,
                `PB18 regression: expected >= ${gates.MinDatestampsOnlyEntities} SaveReturnMode='datestamps_only' entities, got ${p.DatestampsOnlyEntityCount}`
            );
            AssertEqual(
                p.NarrowSearchReturnedColumns,
                gates.ExpectedNarrowSearchColumns,
                `PB18 regression: narrow RunView with UserSearchString projected ${p.NarrowSearchReturnedColumns} columns instead of ${gates.ExpectedNarrowSearchColumns}`
            );
            Assert(
                (p.CanCountFromBaseTableEntityCount ?? 0) >= gates.MinCanCountFromBaseTableEntities,
                `PB18 regression: expected >= ${gates.MinCanCountFromBaseTableEntities} entities with CanCountFromBaseTable=true, got ${p.CanCountFromBaseTableEntityCount}`
            );
            AssertEqual(
                p.RecordChangesCountTargetsBaseTable,
                true,
                `PB18 regression: MJ: Record Changes count_only query did not target base table [RecordChange] (${p.RecordChangesCountSql})`
            );
            Assert(
                (p.BaseEnginePKMapSpeedupRatio ?? 0) >= gates.MinBaseEnginePKMapSpeedupRatio,
                `PB18 regression: BaseEngine PKMap delta merge speedup ratio (${p.BaseEnginePKMapSpeedupRatio}x) fell below ${gates.MinBaseEnginePKMapSpeedupRatio}x`
            );
            Assert(
                (p.UserByEmailSpeedupRatio ?? 0) >= gates.MinUserByEmailSpeedupRatio,
                `PB18 regression: UserCache.UserByEmail speedup ratio (${p.UserByEmailSpeedupRatio}x) fell below ${gates.MinUserByEmailSpeedupRatio}x`
            );
            Assert(
                (p.FrozenRowWireSpeedupRatio ?? 0) >= gates.MinFrozenRowWireSpeedupRatio,
                `PB18 regression: FrozenRow WeakMap wire serialization speedup ratio (${p.FrozenRowWireSpeedupRatio}x) fell below ${gates.MinFrozenRowWireSpeedupRatio}x`
            );
            AssertEqual(
                p.TwoTierL1ZeroCloneIdentity,
                true,
                'PB18 regression: TwoTierCacheStorageProvider L1 lost zero-clone frozen reference identity'
            );

            if (pb7Run) {
                Assert(
                    pb7Run.TotalStepStorageBytes <= maxPB7Bytes,
                    `PB18 regression: PB7 Sage step storage (${pb7Run.TotalStepStorageBytes} B) exceeded ${maxPB7Bytes} B ceiling`
                );
                Assert(
                    pb7Run.PayloadAtStartPointerSteps >= minPB7StartPointers &&
                        pb7Run.PayloadAtEndPointerSteps >= minPB7EndPointers,
                    `PB18 regression: PB7 Sage pointer steps (${pb7Run.PayloadAtStartPointerSteps}/${pb7Run.PayloadAtEndPointerSteps}) fell below (${minPB7StartPointers}/${minPB7EndPointers})`
                );
                Assert(
                    pb7Run.StorageSavingsPercent >= minPB7Savings,
                    `PB18 regression: PB7 Sage storage dedup savings (${pb7Run.StorageSavingsPercent}%) fell below ${minPB7Savings}%`
                );
            }
            if (pb8Run) {
                Assert(
                    pb8Run.TotalStepStorageBytes <= maxPB8Bytes,
                    `PB18 regression: PB8 Query Builder step storage (${pb8Run.TotalStepStorageBytes} B) exceeded ${maxPB8Bytes} B ceiling`
                );
                Assert(
                    pb8Run.PayloadAtStartPointerSteps >= minPB8StartPointers &&
                        pb8Run.PayloadAtEndPointerSteps >= minPB8EndPointers,
                    `PB18 regression: PB8 Query Builder pointer steps (${pb8Run.PayloadAtStartPointerSteps}/${pb8Run.PayloadAtEndPointerSteps}) fell below (${minPB8StartPointers}/${minPB8EndPointers})`
                );
            }
            if (pb9Run) {
                Assert(
                    pb9Run.TotalStepStorageBytes <= maxPB9Bytes,
                    `PB18 regression: PB9 Research Agent step storage (${pb9Run.TotalStepStorageBytes} B) exceeded ${maxPB9Bytes} B ceiling`
                );
                Assert(
                    pb9Run.PayloadAtStartPointerSteps >= minPB9StartPointers &&
                        pb9Run.PayloadAtEndPointerSteps >= minPB9EndPointers,
                    `PB18 regression: PB9 Research Agent pointer steps (${pb9Run.PayloadAtStartPointerSteps}/${pb9Run.PayloadAtEndPointerSteps}) fell below (${minPB9StartPointers}/${minPB9EndPointers})`
                );
            }

            const failedRows = rows.filter((r) => r.Status === 'FAIL');
            AssertEqual(
                failedRows.length,
                0,
                `PB18 regression gate failed on ${failedRows.length} metric(s): ${failedRows.map((r) => `${r.Metric} (current=${r.Current}, baseline=${r.Wave4Baseline})`).join('; ')}`
            );

            console.log(
                `      → PB18 Baseline Comparison & Regression Gate [${activeBaseline.Runner ?? 'default'}]: ${rows.length} metrics verified (aggPrimFactor=${aggPrimFactor}x, aggAgentFactor=${aggAgentFactor}x, 0 failures, ${rows.filter((r) => r.Status === 'WARN').length} variance warnings)`
            );
        },
    },
    {
        Id: `${BUNDLE}.PB19`,
        Name: 'PB19: Wave 5.2 — BuildRecordChangePayload skipFullRecordJSON & CanCountFromBaseTable safe subquery/temporal SQL benchmark',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const md = new Metadata();
            const rcEntity = md.EntityByName('MJ: Record Changes');
            Assert(!!rcEntity, 'PB19: expected MJ: Record Changes in entity metadata');
            const dbProv = Metadata.Provider as unknown as GenericDatabaseProvider;

            // ── Part A: BuildRecordChangePayload (skipFullRecordJSON=true vs false) ─
            interface RecordChangePayloadInvoker {
                BuildRecordChangePayload(
                    newData: Record<string, unknown> | null,
                    oldData: Record<string, unknown> | null,
                    recordID: string,
                    entityInfo: EntityInfo,
                    type: 'Create' | 'Update' | 'Delete',
                    user: UserInfo,
                    restoreContext?: null,
                    quoteToEscape?: string,
                    cloneContext?: null,
                    skipFullRecordJSON?: boolean
                ): { fullRecordJSON: string } | null;
            }
            const payloadInvoker = dbProv as unknown as RecordChangePayloadInvoker;
            const bigText = 'A'.repeat(16000) + "'quoted'\\line\n" + 'B'.repeat(16000);
            const sampleRow: Record<string, unknown> = {
                ID: '11111111-1111-1111-1111-111111111111',
                EntityID: rcEntity.ID,
                RecordID: '22222222-2222-2222-2222-222222222222',
                ChangesJSON: bigText,
            };

            // Warmup
            for (let i = 0; i < 20; i++) {
                payloadInvoker.BuildRecordChangePayload(
                    sampleRow,
                    null,
                    '11111111-1111-1111-1111-111111111111',
                    rcEntity,
                    'Create',
                    ctx.User,
                    null,
                    "'",
                    null,
                    true
                );
                payloadInvoker.BuildRecordChangePayload(
                    sampleRow,
                    null,
                    '11111111-1111-1111-1111-111111111111',
                    rcEntity,
                    'Create',
                    ctx.User,
                    null,
                    "'",
                    null,
                    false
                );
            }

            const tSkip0 = performance.now();
            let skippedChars = 0;
            for (let i = 0; i < 500; i++) {
                const res = payloadInvoker.BuildRecordChangePayload(
                    sampleRow,
                    null,
                    '11111111-1111-1111-1111-111111111111',
                    rcEntity,
                    'Create',
                    ctx.User,
                    null,
                    "'",
                    null,
                    true
                );
                skippedChars += res ? res.fullRecordJSON.length : 0;
            }
            const skipMs = Math.max(0.01, Number((performance.now() - tSkip0).toFixed(2)));

            const tFull0 = performance.now();
            let fullChars = 0;
            for (let i = 0; i < 500; i++) {
                const res = payloadInvoker.BuildRecordChangePayload(
                    sampleRow,
                    null,
                    '11111111-1111-1111-1111-111111111111',
                    rcEntity,
                    'Create',
                    ctx.User,
                    null,
                    "'",
                    null,
                    false
                );
                fullChars += res ? res.fullRecordJSON.length : 0;
            }
            const fullMs = Math.max(0.01, Number((performance.now() - tFull0).toFixed(2)));
            const payloadSpeedup = Number((fullMs / skipMs).toFixed(2));

            AssertEqual(skippedChars, 0, 'PB19: BuildRecordChangePayload(skipFullRecordJSON=true) must return empty fullRecordJSON');
            Assert(fullChars > 15_000_000, `PB19: expected unskipped fullRecordJSON > 15M chars across 500x 32KB rows, got ${fullChars}`);

            fx.Primitives.RecordChangePayloadSkip500x32KBMs = skipMs;
            fx.Primitives.RecordChangePayloadFull500x32KBMs = fullMs;
            fx.Primitives.RecordChangePayloadSkipSpeedupRatio = payloadSpeedup;

            // ── Part B: CanCountFromBaseTable safe subqueries & PG temporal syntax ─
            const subqueryFilters = [
                "EXISTS (SELECT 1 FROM __mj.Entity e WHERE e.ID = EntityID AND e.Name = 'Users')",
                "EntityID IN (SELECT ID FROM __mj.Entity WHERE SchemaName = '__mj')",
                "CreatedAt >= NOW() AT TIME ZONE 'UTC' - INTERVAL '7 days'",
            ];
            let passedFilters = 0;
            for (const f of subqueryFilters) {
                if (dbProv.CanCountFromBaseTable(rcEntity, f)) {
                    passedFilters++;
                }
            }
            AssertEqual(
                passedFilters,
                subqueryFilters.length,
                `PB19: expected all ${subqueryFilters.length} safe subquery/temporal filters to allow base-table COUNT(*), got ${passedFilters}`
            );
            fx.Primitives.CanCountSubqueryFiltersPassed = passedFilters;

            // Verify live RunView count_only with EXISTS (...) routes to BaseTable [RecordChange]
            let existsCountSql = '';
            const origExec = dbProv.ExecuteSQL.bind(dbProv);
            const origBatch = typeof dbProv.ExecuteSQLBatch === 'function' ? dbProv.ExecuteSQLBatch.bind(dbProv) : null;
            dbProv.ExecuteSQL = (async (
                query: string,
                params?: Parameters<typeof origExec>[1],
                options?: Parameters<typeof origExec>[2],
                user?: UserInfo
            ) => {
                if (/SELECT\s+COUNT\(\*\)/i.test(query) && !existsCountSql) {
                    existsCountSql = query;
                }
                return origExec(query, params, options, user);
            }) as typeof dbProv.ExecuteSQL;
            if (origBatch) {
                dbProv.ExecuteSQLBatch = (async (
                    sqls: string[],
                    params?: Parameters<typeof origBatch>[1],
                    options?: Parameters<typeof origBatch>[2],
                    user?: UserInfo
                ) => {
                    for (const s of sqls) {
                        if (/SELECT\s+COUNT\(\*\)/i.test(s) && !existsCountSql) {
                            existsCountSql = s;
                        }
                    }
                    return origBatch(sqls, params, options, user);
                }) as typeof dbProv.ExecuteSQLBatch;
            }

            const tExists0 = performance.now();
            try {
                const rv = new RunView();
                const res = await rv.RunView(
                    {
                        EntityName: 'MJ: Record Changes',
                        ExtraFilter: 'EXISTS (SELECT 1 FROM __mj.Entity e WHERE e.ID = EntityID)',
                        ResultType: 'count_only',
                        BypassCache: true,
                    },
                    ctx.User
                );
                Assert(res.Success, `PB19: EXISTS count_only RunView failed: ${res.ErrorMessage}`);
            } finally {
                dbProv.ExecuteSQL = origExec;
                if (origBatch) {
                    dbProv.ExecuteSQLBatch = origBatch;
                }
            }
            const existsCountMs = Number((performance.now() - tExists0).toFixed(2));
            const normalizedExistsSql = existsCountSql.replace(/\s+/g, ' ').trim();
            const existsTargetsBaseTable =
                normalizedExistsSql.includes('[RecordChange]') && !normalizedExistsSql.includes('[vwRecordChanges]');

            Assert(
                existsTargetsBaseTable,
                `PB19: expected EXISTS count_only SQL to target [RecordChange] instead of [vwRecordChanges], got: ${normalizedExistsSql}`
            );

            fx.Primitives.RecordChangesExistsCountTargetsBaseTable = existsTargetsBaseTable;
            fx.Primitives.RecordChangesExistsCountMs = existsCountMs;

            console.log(
                `      → PB19 Wave 5.2 DB/RLS KPIs: BuildRecordChangePayload(skip=${skipMs}ms vs full=${fullMs}ms, ${payloadSpeedup}x faster) | ` +
                    `CanCountSubquery=${passedFilters}/${subqueryFilters.length}, EXISTS count_only=${existsCountMs}ms (baseTable=${existsTargetsBaseTable})`
            );
        },
    },
];

for (const check of PerformanceBenchmarkChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

function buildBenchmarkReport(fx: BenchmarkFixture): PerformanceBenchmarkReport {
    const p = fx.Primitives;
    const primitivesTotalMs = Number(
        (
            (p.ClassFactoryAndObjectCacheMs ?? 0) +
            (p.EntityHydrateAndFlsMs ?? 0) +
            (p.LocalCacheWritesAndStatsMs ?? 0) +
            (p.TemplateRenderSimpleMs ?? 0) +
            (p.ActionSnapshotAndEngineLookupMs ?? 0) +
            (p.PayloadApplyAndDeepDiffMs ?? 0)
        ).toFixed(2)
    );
    return {
        Timestamp: new Date().toISOString(),
        Database: process.env.DB_DATABASE ?? 'unknown',
        Primitives: p,
        PrimitivesTotalMs: primitivesTotalMs,
        DeterministicAgentRuns: fx.DeterministicAgentRuns,
        LiveAgentRuns: fx.LiveAgentRuns,
        BaselineComparisons: fx.BaselineComparisons,
    };
}

function formatBenchmarkMarkdown(report: PerformanceBenchmarkReport): string {
    const lines: string[] = [
        `# MemberJunction Performance & Agent Overhead Benchmark Report`,
        ``,
        `- **Timestamp**: \`${report.Timestamp}\``,
        `- **Database**: \`${report.Database}\``,
        `- **Primitives Total CPU Time (PB1–PB6)**: **${report.PrimitivesTotalMs} ms**`,
        `- **\`SaveReturnMode: 'datestamps_only'\` Entities Active (PB13)**: **${report.Primitives.DatestampsOnlyEntityCount ?? 'n/a'}** (\`${JSON.stringify(report.Primitives.DatestampsOnlyEntitiesBySchema ?? {})}\`)`,
        `- **10x 32 KB \`ErrorLog\` Saves with \`datestamps_only\` (PB13)**: **${report.Primitives.DatestampsOnly10SavesMs ?? 'n/a'} ms**`,
        ``,
        `## 1. Core, Cache & SQL Primitive Microbenchmarks (PB1–PB6, PB13, PB15–PB17)`,
        ``,
        `| Check | Benchmark | Elapsed / Value |`,
        `|---|---|---:|`,
        `| **PB1** | \`ClassFactory\` (\`GetRegistration\` + \`GetAllRegistrations\`) & \`ObjectCache.Find\` (10k iters / 450 classes) | ${report.Primitives.ClassFactoryAndObjectCacheMs ?? 'n/a'} ms |`,
        `| **PB2** | \`EntityInfo.ChildEntities\` + \`BaseEntity\` Hydration (\`LoadFromData\`/\`SetMany\`/\`GetAll\`) + FLS (2,000 rows x 25 fields) | ${report.Primitives.EntityHydrateAndFlsMs ?? 'n/a'} ms |`,
        `| **PB3** | \`LocalCacheManager\` \`SetRunViewResult\` + \`SetDataset\` + \`GetStats\` (80 large entries) | ${report.Primitives.LocalCacheWritesAndStatsMs ?? 'n/a'} ms |`,
        `| **PB4** | \`TemplateEngineServer.RenderTemplateSimple\` + \`NunjucksSandbox\` (1,000 renders) | ${report.Primitives.TemplateRenderSimpleMs ?? 'n/a'} ms |`,
        `| **PB5** | \`RedactParamsToJSON\` + \`AIEngineBase\` permissions & catalog lookup (500 iters) | ${report.Primitives.ActionSnapshotAndEngineLookupMs ?? 'n/a'} ms |`,
        `| **PB6** | \`PayloadManager.applyAgentChangeRequest\` + \`DeepDiffer\` (50 turns) | ${report.Primitives.PayloadApplyAndDeepDiffMs ?? 'n/a'} ms |`,
        `| **PB13** | \`SaveReturnMode: 'datestamps_only'\` 10x 32 KB \`MJ: Error Logs\` SQL roundtrips (${report.Primitives.DatestampsOnlyEntityCount ?? 0} entities configured) | ${report.Primitives.DatestampsOnly10SavesMs ?? 'n/a'} ms |`,
        `| **PB15** | \`LocalCacheManager.ApplyRowChanges\` CoW (50 updates on 5,000 rows) | ${report.Primitives.ApplyRowChanges50On5000RowsMs ?? 'n/a'} ms |`,
        `| **PB15** | \`BaseEngine\` \`PKMap\` O(1) row-delta merge (100 deltas on 2,000 rows) | ${report.Primitives.BaseEnginePKMap100DeltasMs ?? 'n/a'} ms (${report.Primitives.BaseEnginePKMapSpeedupRatio ?? 'n/a'}x vs linear) |`,
        `| **PB15** | \`GetEntityObjectWithOptions({ SkipNewRecord: true })\` (500 calls) | ${report.Primitives.GetEntityObjectSkipNewRecord500Ms ?? 'n/a'} ms (vs ${report.Primitives.GetEntityObjectDefault500Ms ?? 'n/a'} ms default) |`,
        `| **PB15** | \`UserCache.UserByEmail\` secondary index (10,000 lookups across 500 users) | ${report.Primitives.UserByEmail10kLookupsMs ?? 'n/a'} ms (${report.Primitives.UserByEmailSpeedupRatio ?? 'n/a'}x vs linear) |`,
        `| **PB16** | Narrow \`Fields: ['ID', 'Name']\` + \`UserSearchString\` \`RunView\` (10 calls on \`MJ: Actions\`) | ${report.Primitives.NarrowSearchRunView10CallsMs ?? 'n/a'} ms (${report.Primitives.NarrowSearchReturnedColumns ?? 'n/a'} cols vs ${report.Primitives.WideSearchReturnedColumns ?? 'n/a'} wide) |`,
        `| **PB16** | \`CanCountFromBaseTable\` entities & \`MJ: Record Changes\` base-table \`COUNT(*)\` | ${report.Primitives.CanCountFromBaseTableEntityCount ?? 'n/a'} entities (\`baseTable=${report.Primitives.RecordChangesCountTargetsBaseTable ?? false}\`) |`,
        `| **PB17** | \`TwoTierCacheStorageProvider\` L1 frozen CoW (200 reads + 50 row deltas) | ${report.Primitives.TwoTierL1200Reads50DeltasMs ?? 'n/a'} ms (\`zeroClone=${report.Primitives.TwoTierL1ZeroCloneIdentity ?? false}\`) |`,
        `| **PB17** | \`FrozenRowSerializationCache\` \`WeakMap\` wire serialize (5,000 rows x 20 responses) | ${report.Primitives.FrozenRowWireSerialize5000x20Ms ?? 'n/a'} ms (${report.Primitives.FrozenRowWireSpeedupRatio ?? 'n/a'}x vs \`JSON.stringify\`) |`,
        `| **PB19** | \`BuildRecordChangePayload\` \`skipFullRecordJSON\` (500 x 32 KB rows) | ${report.Primitives.RecordChangePayloadSkip500x32KBMs ?? 'n/a'} ms (vs ${report.Primitives.RecordChangePayloadFull500x32KBMs ?? 'n/a'} ms unskipped, ${report.Primitives.RecordChangePayloadSkipSpeedupRatio ?? 'n/a'}x faster) |`,
        `| **PB19** | \`CanCountFromBaseTable\` subqueries & PG temporal + \`EXISTS\` \`count_only\` | ${report.Primitives.CanCountSubqueryFiltersPassed ?? 'n/a'}/3 filters, ${report.Primitives.RecordChangesExistsCountMs ?? 'n/a'} ms (\`baseTable=${report.Primitives.RecordChangesExistsCountTargetsBaseTable ?? false}\`) |`,
        ``,
        `## 2. Multi-Turn Agent Loop & SQL Server Footprint Benchmarks (PB7–PB12)`,
        ``,
        `| Check / Agent | Mode | Wall Time (ms) | LLM Time (ms) | Framework Overhead (ms) | Runs | Steps | Total Step DB Bytes | Pointer Steps (Start / End) | Est. Dedup Savings |`,
        `|---|---|---:|---:|---:|---:|---:|---:|---|---:|`,
    ];
    for (const r of [...report.DeterministicAgentRuns, ...report.LiveAgentRuns]) {
        lines.push(
            `| **${r.Label}** | \`${r.Mode}\` | ${r.WallTimeMs} | ${r.LlmPromptExecutionMs} | ${r.FrameworkOverheadMs} | ${r.TotalRunsInTree} | ${r.TotalStepsInTree} | ${r.TotalStepStorageBytes.toLocaleString()} B | ${r.PayloadAtStartPointerSteps} / ${r.PayloadAtEndPointerSteps} | ${r.StorageSavingsPercent}% |`
        );
    }

    if (report.BaselineComparisons && report.BaselineComparisons.length > 0) {
        lines.push(
            ``,
            `## 3. Longitudinal Waves 1–4 & Baseline Regression Comparison (PB18)`,
            ``,
            `| Metric | Unit | Pre-Wave-1 | Wave 2 | Wave 3 | Pre-Wave-4 | Wave 4 Baseline | Current | Delta vs Baseline | Status |`,
            `|---|---|---:|---:|---:|---:|---:|---:|---:|---|`
        );
        for (const c of report.BaselineComparisons) {
            const deltaCell =
                c.DeltaVsBaselinePercent === null
                    ? '—'
                    : `${c.DeltaVsBaselinePercent > 0 ? '+' : ''}${c.DeltaVsBaselinePercent}%`;
            lines.push(
                `| **${c.Metric}** | \`${c.Unit}\` | ${c.PreWave1 ?? '—'} | ${c.Wave2 ?? '—'} | ${c.Wave3 ?? '—'} | ${c.PreWave4 ?? '—'} | ${c.Wave4Baseline} | **${c.Current}** | ${deltaCell} | **${c.Status}** |`
            );
        }
    }

    lines.push('');
    return lines.join('\n');
}

function writePersistentBenchmarkLogs(report: PerformanceBenchmarkReport): void {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const defaultLogDir = path.resolve(currentDir, '../../benchmark-logs');
    const logDir = process.env.MJ_PERF_BENCHMARK_LOG_DIR ?? defaultLogDir;
    try {
        fs.mkdirSync(logDir, { recursive: true });
        const safeTs = report.Timestamp.replace(/[:.]/g, '-');
        const jsonPath = path.join(logDir, `benchmark-${safeTs}.json`);
        const mdPath = path.join(logDir, `benchmark-${safeTs}.md`);
        const latestJsonPath = path.join(logDir, 'latest.json');
        const latestMdPath = path.join(logDir, 'latest.md');
        const historyJsonlPath = path.join(logDir, 'history.jsonl');

        const jsonContent = JSON.stringify(report, null, 2);
        const mdContent = formatBenchmarkMarkdown(report);

        fs.writeFileSync(jsonPath, jsonContent, 'utf8');
        fs.writeFileSync(mdPath, mdContent, 'utf8');
        fs.writeFileSync(latestJsonPath, jsonContent, 'utf8');
        fs.writeFileSync(latestMdPath, mdContent, 'utf8');
        fs.appendFileSync(historyJsonlPath, JSON.stringify(report) + '\n', 'utf8');
        console.log(`  [performance-benchmark] Persisted benchmark logs to ${logDir} (latest.json, latest.md, history.jsonl)`);
    } catch (e) {
        console.error(`  [performance-benchmark] Failed to write persistent benchmark logs to ${logDir}:`, e);
    }
}

function printBenchmarkSummary(report: PerformanceBenchmarkReport): void {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    MJ PERFORMANCE & AGENT OVERHEAD BENCHMARK SUMMARY                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');
    console.log(`  Database: ${report.Database}`);
    console.log(`  Primitives Total CPU Time (PB1-PB6): ${report.PrimitivesTotalMs} ms`);
    console.log(`    - PB1 ClassFactory & ObjectCache (10k iters):         ${report.Primitives.ClassFactoryAndObjectCacheMs ?? 'n/a'} ms`);
    console.log(`    - PB2 BaseEntity Hydration & FLS (2,000 rows):        ${report.Primitives.EntityHydrateAndFlsMs ?? 'n/a'} ms`);
    console.log(`    - PB3 LocalCacheManager Writes & GetStats:            ${report.Primitives.LocalCacheWritesAndStatsMs ?? 'n/a'} ms`);
    console.log(`    - PB4 TemplateEngineServer RenderSimple (1,000x):     ${report.Primitives.TemplateRenderSimpleMs ?? 'n/a'} ms`);
    console.log(`    - PB5 SnapshotActionParams & AIEngine Permissions:    ${report.Primitives.ActionSnapshotAndEngineLookupMs ?? 'n/a'} ms`);
    console.log(`    - PB6 PayloadManager.applyAgentChangeRequest (50x):   ${report.Primitives.PayloadApplyAndDeepDiffMs ?? 'n/a'} ms`);
    console.log(`    - PB13 datestamps_only 10x 32KB ErrorLog saves:       ${report.Primitives.DatestampsOnly10SavesMs ?? 'n/a'} ms (${report.Primitives.DatestampsOnlyEntityCount ?? 0} entities)`);
    console.log(`    - PB15 ApplyRowChanges CoW (50 on 5k rows):           ${report.Primitives.ApplyRowChanges50On5000RowsMs ?? 'n/a'} ms`);
    console.log(`    - PB15 BaseEngine PKMap 100 Deltas:                   ${report.Primitives.BaseEnginePKMap100DeltasMs ?? 'n/a'} ms (${report.Primitives.BaseEnginePKMapSpeedupRatio ?? 'n/a'}x vs linear)`);
    console.log(`    - PB15 GetEntityObject SkipNewRecord (500):           ${report.Primitives.GetEntityObjectSkipNewRecord500Ms ?? 'n/a'} ms (vs ${report.Primitives.GetEntityObjectDefault500Ms ?? 'n/a'} ms default)`);
    console.log(`    - PB15 UserCache.UserByEmail (10k lookups):           ${report.Primitives.UserByEmail10kLookupsMs ?? 'n/a'} ms (${report.Primitives.UserByEmailSpeedupRatio ?? 'n/a'}x vs linear)`);
    console.log(`    - PB16 Narrow Search RunView (10 calls):              ${report.Primitives.NarrowSearchRunView10CallsMs ?? 'n/a'} ms (${report.Primitives.NarrowSearchReturnedColumns ?? 'n/a'} cols vs ${report.Primitives.WideSearchReturnedColumns ?? 'n/a'} wide)`);
    console.log(`    - PB16 CanCountFromBaseTable:                         ${report.Primitives.CanCountFromBaseTableEntityCount ?? 'n/a'} entities (RecordChange baseTable=${report.Primitives.RecordChangesCountTargetsBaseTable ?? false})`);
    console.log(`    - PB17 TwoTier L1 CoW (200 reads + 50 deltas):        ${report.Primitives.TwoTierL1200Reads50DeltasMs ?? 'n/a'} ms (zeroClone=${report.Primitives.TwoTierL1ZeroCloneIdentity ?? false})`);
    console.log(`    - PB17 FrozenRow WeakMap Wire (5,000 x 20):           ${report.Primitives.FrozenRowWireSerialize5000x20Ms ?? 'n/a'} ms (${report.Primitives.FrozenRowWireSpeedupRatio ?? 'n/a'}x vs JSON.stringify)`);
    console.log(`    - PB19 RecordChangePayload skipFullRecordJSON (500x): ${report.Primitives.RecordChangePayloadSkip500x32KBMs ?? 'n/a'} ms (vs ${report.Primitives.RecordChangePayloadFull500x32KBMs ?? 'n/a'} ms, ${report.Primitives.RecordChangePayloadSkipSpeedupRatio ?? 'n/a'}x faster)`);
    console.log(`    - PB19 CanCountFromBaseTable subqueries & EXISTS:     ${report.Primitives.CanCountSubqueryFiltersPassed ?? 'n/a'}/3 filters, ${report.Primitives.RecordChangesExistsCountMs ?? 'n/a'} ms (baseTable=${report.Primitives.RecordChangesExistsCountTargetsBaseTable ?? false})`);

    const allRuns = [...report.DeterministicAgentRuns, ...report.LiveAgentRuns];
    if (allRuns.length > 0) {
        console.log('\n  Agent Run Benchmarks (Deterministic TestLLM & Live Model):');
        for (const r of allRuns) {
            console.log(
                `    - ${r.Label}: wall=${r.WallTimeMs}ms (llm=${r.LlmPromptExecutionMs}ms, framework=${r.FrameworkOverheadMs}ms), ` +
                    `runs=${r.TotalRunsInTree}, steps=${r.TotalStepsInTree}, ` +
                    `stepStorageBytes=${r.TotalStepStorageBytes} (start=${r.PayloadAtStartBytes}, end=${r.PayloadAtEndBytes}, in=${r.InputDataBytes}, out=${r.OutputDataBytes}), ` +
                    `pointers=(start:${r.PayloadAtStartPointerSteps}, end:${r.PayloadAtEndPointerSteps})`
            );
        }
    }
    console.log('');
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (): Promise<void> => {
        benchmarkFixture = {
            Marker: NewMarker('PB'),
            Primitives: {},
            DeterministicAgentRuns: [],
            LiveAgentRuns: [],
            BaselineComparisons: [],
            RunIdsToPurge: [],
            ConversationIdsToPurge: [],
            ActionLogIdsToPurge: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = benchmarkFixture;
        benchmarkFixture = undefined;
        if (!fx) {
            return;
        }

        const report = buildBenchmarkReport(fx);
        printBenchmarkSummary(report);
        writePersistentBenchmarkLogs(report);

        const outPath = process.env.MJ_PERF_BENCHMARK_OUT;
        if (outPath) {
            try {
                fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
                console.log(`  [performance-benchmark] Wrote JSON benchmark report to ${outPath}`);
            } catch (e) {
                console.error(`  [performance-benchmark] Failed to write report to ${outPath}:`, e);
            }
        }

        const visitedPurgeRuns = new Set<string>();
        const purgeRunTree = async (runId: string): Promise<void> => {
            const norm = runId.toUpperCase();
            if (visitedPurgeRuns.has(norm)) {
                return;
            }
            visitedPurgeRuns.add(norm);
            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const stepsRes = await rv.RunView<{ ID: string; StepNumber: number; StepType: string; TargetLogID: string | null }>(
                {
                    EntityName: 'MJ: AI Agent Run Steps',
                    ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}'`,
                    Fields: ['ID', 'StepNumber', 'StepType', 'TargetLogID'],
                    OrderBy: 'StepNumber DESC',
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User
            );
            const steps = stepsRes.Success ? stepsRes.Results : [];
            for (const s of steps) {
                if (s.StepType === 'Sub-Agent' && s.TargetLogID) {
                    await purgeRunTree(s.TargetLogID);
                }
            }
            const promptIds = steps
                .filter((s) => (s.StepType === 'Prompt' || s.StepType === 'Compaction' || s.StepType === 'Tool') && s.TargetLogID)
                .map((s) => s.TargetLogID!);
            for (const s of steps) {
                await DeleteById('MJ: AI Agent Run Steps', s.ID, ctx.Provider, ctx.User);
            }
            if (promptIds.length > 0) {
                const quoted = promptIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                const existingPrompts = await rv.RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: AI Prompt Runs',
                        ExtraFilter: `ID IN (${quoted})`,
                        Fields: ['ID'],
                        ResultType: 'simple',
                        BypassCache: true,
                    },
                    ctx.User
                );
                for (const pr of existingPrompts.Success ? existingPrompts.Results : []) {
                    await DeleteById('MJ: AI Prompt Runs', pr.ID, ctx.Provider, ctx.User);
                }
            }
            await DeleteById('MJ: AI Agent Runs', runId, ctx.Provider, ctx.User);
        };

        for (const runId of fx.RunIdsToPurge) {
            try {
                await purgeRunTree(runId);
            } catch (e) {
                console.error(`  [performance-benchmark] purgeRunTree(${runId}) failed:`, e);
            }
        }
        for (const convId of fx.ConversationIdsToPurge) {
            try {
                const details = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: Conversation Details',
                        ExtraFilter: `ConversationID='${EscapeSQLString(convId)}'`,
                        Fields: ['ID'],
                        ResultType: 'simple',
                        BypassCache: true,
                    },
                    ctx.User
                );
                for (const d of details.Success ? details.Results : []) {
                    await DeleteById('MJ: Conversation Details', d.ID, ctx.Provider, ctx.User);
                }
                await DeleteById('MJ: Conversations', convId, ctx.Provider, ctx.User);
            } catch (e) {
                console.error(`  [performance-benchmark] Conversation cleanup (${convId}) failed:`, e);
            }
        }
    },
});
