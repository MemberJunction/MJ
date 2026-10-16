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
import { performance } from 'node:perf_hooks';
import {
    BaseEntity,
    EntityInfo,
    LocalCacheManager,
    RunView,
    SetProvider,
    Metadata,
    UserInfo,
    type DatasetItemResultType,
    type IEntityDataProvider,
    type ILocalStorageProvider,
    type IMetadataProvider,
} from '@memberjunction/core';
import { ClassFactory, EscapeSQLString, ObjectCache } from '@memberjunction/global';
import { TemplateEngineServer } from '@memberjunction/templates';
import { RedactParamsToJSON, type ActionParam } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { PayloadManager } from '@memberjunction/ai-agents';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { RegisterTestLLM, TestLLM, type TestLLMOutcome } from '@memberjunction/unit-testing';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    Settle,
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
}

interface BenchmarkFixture {
    Marker: string;
    Primitives: PrimitiveBenchmarkMetrics;
    DeterministicAgentRuns: AgentRunTreeMetrics[];
    LiveAgentRuns: AgentRunTreeMetrics[];
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
 * Resolves a shipped agent by name, returning null with a clean skip message if absent or inactive.
 */
async function resolveShippedAgent(
    name: string,
    provider: IMetadataProvider,
    user: UserInfo
): Promise<MJAIAgentEntityExtended | null> {
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
        console.log(`      → SKIPPED: shipped agent '${name}' not found in metadata`);
        return null;
    }
    if (agent.Status !== 'Active') {
        console.log(`      → SKIPPED: '${name}' is ${agent.Status} (not runnable)`);
        return null;
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
): Promise<AgentRunTreeMetrics | null> {
    await AIEngine.Instance.Config(false, ctx.User);
    await ActionEngineServer.Instance.Config(false, ctx.User);

    const agent = await resolveShippedAgent(agentName, ctx.Provider, ctx.User);
    if (!agent) {
        return null;
    }

    const fx = requireFixture();
    const llm = new TestLLM();
    const restore = RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]);
    try {
        llm.Reset();
        llm.SetDefaultOutcome({
            kind: 'succeed',
            content: JSON.stringify({ taskComplete: true, message: `${label} fallback completion` }),
            delayMS: 35,
        });
        const outcomes: TestLLMOutcome[] = scriptedReplies.map((reply) => ({
            kind: 'succeed',
            content: JSON.stringify(reply),
            delayMS: 35,
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
            if (!metrics) {
                return;
            }
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
            if (!metrics) {
                return;
            }
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
            if (!metrics) {
                return;
            }
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
            if (!sage) {
                return;
            }
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
            if (!qb) {
                return;
            }
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
            if (!research) {
                return;
            }
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
    };
}

function printBenchmarkSummary(report: PerformanceBenchmarkReport): void {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    MJ PERFORMANCE & AGENT OVERHEAD BENCHMARK SUMMARY                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');
    console.log(`  Database: ${report.Database}`);
    console.log(`  Primitives Total CPU Time: ${report.PrimitivesTotalMs} ms`);
    console.log(`    - PB1 ClassFactory & ObjectCache (10k iters):         ${report.Primitives.ClassFactoryAndObjectCacheMs ?? 'n/a'} ms`);
    console.log(`    - PB2 BaseEntity Hydration & FLS (2,000 rows):        ${report.Primitives.EntityHydrateAndFlsMs ?? 'n/a'} ms`);
    console.log(`    - PB3 LocalCacheManager Writes & GetStats:            ${report.Primitives.LocalCacheWritesAndStatsMs ?? 'n/a'} ms`);
    console.log(`    - PB4 TemplateEngineServer RenderSimple (1,000x):     ${report.Primitives.TemplateRenderSimpleMs ?? 'n/a'} ms`);
    console.log(`    - PB5 SnapshotActionParams & AIEngine Permissions:    ${report.Primitives.ActionSnapshotAndEngineLookupMs ?? 'n/a'} ms`);
    console.log(`    - PB6 PayloadManager.applyAgentChangeRequest (50x):   ${report.Primitives.PayloadApplyAndDeepDiffMs ?? 'n/a'} ms`);

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
