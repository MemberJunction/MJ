/**
 * CR-19 Acceptance Tests: Real 5,000-node DAG orchestration through `TaskGraphService.Submit`
 * and `TaskGraphDispatcher` + `TaskClaimStore` backed by a faithful in-memory SQL/provider
 * persistence double and real `TaskActionRunner`.
 *
 * Verifies:
 * 1) End-to-end 5,000-node DAG submission, topological multi-wave dispatch, claim/complete
 *    settlement, parent completion, and telemetry/budget tracking through `TaskGraphService`
 *    and `TaskGraphDispatcher`.
 * 2) Mid-flight budget/stall pause on node 2,500 with persisted `RunawayCheckpointState`
 *    (`CompletedNodeIDs`), followed by human approval/extension and a fresh `TaskGraphDispatcher`
 *    completing ONLY the remaining 2,500 pending nodes with zero replay of completed nodes.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    RunView,
    type ExecuteSQLOptions,
    type IMetadataProvider,
    type RunViewParams,
    type UserInfo,
} from '@memberjunction/core';
import type { MJTaskDependencyEntity, MJTaskEntity } from '@memberjunction/core-entities';
import {
    ExtractRunawayCheckpointFromRunData,
    ValidateTaskGraphSpec,
    type MJAIAgentRunEntityExtended,
    type RunawayCheckpointState,
    type RunawayJsonObject,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '@memberjunction/ai-core-plus';
import type { TaskGraphDebugState } from '../debug-state';
import {
    BudgetEnforcementGuard,
    DeterministicProgressDetector,
    RunawayCheckpointManager,
} from '@memberjunction/ai-agents';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { TaskGraphService } from '../TaskGraphService';
import type { TaskActionRunner, TaskAgentRunner } from '../types';

const capturedLogErrors: string[] = [];

type LogArg = string | number | boolean | object | null | undefined;
type SqlValue = string | number | boolean | Date | null | undefined;
type MockRunViewRow =
    | { ID: string; Name: string; Status?: string }
    | { ParentID: string }
    | { ID: string }
    | { ID: string; Status: MJTaskEntity['Status']; Configuration: string | null }
    | { ID: string; TypeID: string; AgentRunID: string | null; AgentID: string | null; UserID: string | null; Status: MJTaskEntity['Status']; InputPayload: string | null; Configuration: string | null }
    | StoredTaskRow
    | StoredDependencyRow
    | MJAIAgentRunEntityExtended
    | MJTaskEntity;

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn((...args: LogArg[]) => {
            capturedLogErrors.push(args.map((a) => String(a)).join(' '));
        }),
        LogStatus: vi.fn(),
        LogErrorEx: vi.fn((...args: LogArg[]) => {
            capturedLogErrors.push(args.map((a) => String(a)).join(' '));
        }),
        LogStatusEx: vi.fn(),
    };
});

const TEST_USER = {
    ID: '10000000-0000-4000-8000-000000000001',
    Name: 'Alice Orchestrator',
    Email: 'alice@example.com',
    IsActive: true,
} as UserInfo;

const WORKFLOW_TYPE_ID = '20000000-0000-4000-8000-000000000001';
const ACTION_ID = '30000000-0000-4000-8000-000000000001';
const AGENT_ID = '40000000-0000-4000-8000-000000000001';
const SUBMIT_RUN_ID = '50000000-0000-4000-8000-000000000001';

interface StoredTaskRow {
    ID: string;
    ParentID: string | null;
    TypeID: string;
    Name: string;
    Description: string | null;
    Status: MJTaskEntity['Status'];
    StepType: MJTaskEntity['StepType'];
    ActionID: string | null;
    AgentID: string | null;
    PromptID: string | null;
    UserID: string | null;
    AgentRunID: string | null;
    ConversationDetailID: string | null;
    ClaimedBy: string | null;
    ClaimExpiresAt: Date | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    PercentComplete: number;
    ErrorMessage: string | null;
    InputPayload: string | null;
    OutputPayload: string | null;
    Configuration: string | null;
    RetryCount?: number;
    RetryAfter?: Date | null;
    __mj_UpdatedAt: Date;
}

interface StoredDependencyRow {
    ID: string;
    TaskID: string;
    DependsOnTaskID: string;
    DependencyType: MJTaskDependencyEntity['DependencyType'];
    Condition: string | null;
    ExclusiveGroup: string | null;
    Priority: number;
    Sequence: number;
}

const TERMINAL_STATUSES = new Set(['Complete', 'Failed', 'Cancelled', 'Skipped']);

class InMemoryTaskGraphDatabase {
    public readonly Tasks = new Map<string, StoredTaskRow>();
    public readonly TasksByParent = new Map<string, StoredTaskRow[]>();
    public readonly DepsByTask = new Map<string, StoredDependencyRow[]>();
    public readonly AgentRuns = new Map<string, MJAIAgentRunEntityExtended>();
    private readonly dialect = new SQLServerDialect();

    private getTask(id: string | null | undefined): StoredTaskRow | undefined {
        if (!id) return undefined;
        return this.Tasks.get(id.toLowerCase());
    }

    private setTask(row: StoredTaskRow): void {
        this.Tasks.set(row.ID.toLowerCase(), row);
    }

    private wrapTaskEntity(initial?: StoredTaskRow): MJTaskEntity {
        const backing: StoredTaskRow = initial
            ? { ...initial }
            : {
                  ID: '',
                  ParentID: null,
                  TypeID: WORKFLOW_TYPE_ID,
                  Name: '',
                  Description: null,
                  Status: 'Pending',
                  StepType: 'Action',
                  ActionID: null,
                  AgentID: null,
                  PromptID: null,
                  UserID: null,
                  AgentRunID: null,
                  ConversationDetailID: null,
                  ClaimedBy: null,
                  ClaimExpiresAt: null,
                  StartedAt: null,
                  CompletedAt: null,
                  PercentComplete: 0,
                  ErrorMessage: null,
                  InputPayload: null,
                  OutputPayload: null,
                  Configuration: null,
                  __mj_UpdatedAt: new Date(),
              };

        const store = this;
        const wrapper = {
            get ID() {
                return backing.ID;
            },
            set ID(v: string) {
                backing.ID = v;
            },
            get ParentID() {
                return backing.ParentID;
            },
            set ParentID(v: string | null) {
                backing.ParentID = v;
            },
            get TypeID() {
                return backing.TypeID;
            },
            set TypeID(v: string) {
                backing.TypeID = v;
            },
            get Name() {
                return backing.Name;
            },
            set Name(v: string) {
                backing.Name = v;
            },
            get Description() {
                return backing.Description;
            },
            set Description(v: string | null) {
                backing.Description = v;
            },
            get Status() {
                return backing.Status;
            },
            set Status(v: MJTaskEntity['Status']) {
                backing.Status = v;
            },
            get StepType() {
                return backing.StepType;
            },
            set StepType(v: MJTaskEntity['StepType']) {
                backing.StepType = v;
            },
            get ActionID() {
                return backing.ActionID;
            },
            set ActionID(v: string | null) {
                backing.ActionID = v;
            },
            get AgentID() {
                return backing.AgentID;
            },
            set AgentID(v: string | null) {
                backing.AgentID = v;
            },
            get PromptID() {
                return backing.PromptID;
            },
            set PromptID(v: string | null) {
                backing.PromptID = v;
            },
            get UserID() {
                return backing.UserID;
            },
            set UserID(v: string | null) {
                backing.UserID = v;
            },
            get AgentRunID() {
                return backing.AgentRunID;
            },
            set AgentRunID(v: string | null) {
                backing.AgentRunID = v;
            },
            get ConversationDetailID() {
                return backing.ConversationDetailID;
            },
            set ConversationDetailID(v: string | null) {
                backing.ConversationDetailID = v;
            },
            get ClaimedBy() {
                return backing.ClaimedBy;
            },
            set ClaimedBy(v: string | null) {
                backing.ClaimedBy = v;
            },
            get ClaimExpiresAt() {
                return backing.ClaimExpiresAt;
            },
            set ClaimExpiresAt(v: Date | null) {
                backing.ClaimExpiresAt = v;
            },
            get StartedAt() {
                return backing.StartedAt;
            },
            set StartedAt(v: Date | null) {
                backing.StartedAt = v;
            },
            get CompletedAt() {
                return backing.CompletedAt;
            },
            set CompletedAt(v: Date | null) {
                backing.CompletedAt = v;
            },
            get PercentComplete() {
                return backing.PercentComplete;
            },
            set PercentComplete(v: number) {
                backing.PercentComplete = v;
            },
            get ErrorMessage() {
                return backing.ErrorMessage;
            },
            set ErrorMessage(v: string | null) {
                backing.ErrorMessage = v;
            },
            get InputPayload() {
                return backing.InputPayload;
            },
            set InputPayload(v: string | null) {
                backing.InputPayload = v;
            },
            get OutputPayload() {
                return backing.OutputPayload;
            },
            set OutputPayload(v: string | null) {
                backing.OutputPayload = v;
            },
            get Configuration() {
                return backing.Configuration;
            },
            set Configuration(v: string | null) {
                backing.Configuration = v;
            },
            get ConfigurationObject(): RunawayJsonObject | null {
                if (!backing.Configuration) {
                    return null;
                }
                try {
                    return JSON.parse(backing.Configuration) as RunawayJsonObject;
                } catch {
                    return null;
                }
            },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => true,
            Load: async (id: string) => {
                const found = store.getTask(id);
                if (!found) {
                    return false;
                }
                Object.assign(backing, found);
                return true;
            },
            Save: async () => {
                if (!backing.ID) {
                    backing.ID = randomUUID();
                }
                backing.__mj_UpdatedAt = new Date();
                const existing = store.getTask(backing.ID);
                const copy: StoredTaskRow = { ...backing };
                store.setTask(copy);
                if (copy.ParentID) {
                    const pKey = copy.ParentID.toLowerCase();
                    const list = store.TasksByParent.get(pKey) ?? [];
                    if (!existing) {
                        list.push(copy);
                        store.TasksByParent.set(pKey, list);
                    } else {
                        const idx = list.findIndex((r) => r.ID.toLowerCase() === copy.ID.toLowerCase());
                        if (idx >= 0) {
                            list[idx] = copy;
                        } else {
                            list.push(copy);
                        }
                    }
                }
                return true;
            },
        };
        return wrapper as Partial<MJTaskEntity> as MJTaskEntity;
    }

    private wrapDependencyEntity(): MJTaskDependencyEntity {
        const backing: StoredDependencyRow = {
            ID: '',
            TaskID: '',
            DependsOnTaskID: '',
            DependencyType: 'FinishToStart',
            Condition: null,
            ExclusiveGroup: null,
            Priority: 0,
            Sequence: 0,
        };
        const store = this;
        const wrapper = {
            get ID() {
                return backing.ID;
            },
            set ID(v: string) {
                backing.ID = v;
            },
            get TaskID() {
                return backing.TaskID;
            },
            set TaskID(v: string) {
                backing.TaskID = v;
            },
            get DependsOnTaskID() {
                return backing.DependsOnTaskID;
            },
            set DependsOnTaskID(v: string) {
                backing.DependsOnTaskID = v;
            },
            get DependencyType() {
                return backing.DependencyType;
            },
            set DependencyType(v: MJTaskDependencyEntity['DependencyType']) {
                backing.DependencyType = v;
            },
            get Condition() {
                return backing.Condition;
            },
            set Condition(v: string | null) {
                backing.Condition = v;
            },
            get ExclusiveGroup() {
                return backing.ExclusiveGroup;
            },
            set ExclusiveGroup(v: string | null) {
                backing.ExclusiveGroup = v;
            },
            get Priority() {
                return backing.Priority;
            },
            set Priority(v: number) {
                backing.Priority = v;
            },
            get Sequence() {
                return backing.Sequence;
            },
            set Sequence(v: number) {
                backing.Sequence = v;
            },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => true,
            Save: async () => {
                if (!backing.ID) {
                    backing.ID = randomUUID();
                }
                const copy: StoredDependencyRow = { ...backing };
                const tKey = copy.TaskID.toLowerCase();
                const list = store.DepsByTask.get(tKey) ?? [];
                list.push(copy);
                store.DepsByTask.set(tKey, list);
                return true;
            },
        };
        return wrapper as Partial<MJTaskDependencyEntity> as MJTaskDependencyEntity;
    }

    public CreateProvider(): IMetadataProvider {
        const store = this;
        const provider = {
            MJCoreSchemaName: '__mj',
            PlatformKey: 'sqlserver',
            Dialect: store.dialect,
            QuoteIdentifier: (id: string) => `[${id}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            Entities: [],
            EntityByName: () => undefined,
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Tasks') {
                    return store.wrapTaskEntity();
                }
                if (entityName === 'MJ: Task Dependencies') {
                    return store.wrapDependencyEntity();
                }
                if (entityName === 'MJ: AI Agent Runs') {
                    let dataJson: string | null = null;
                    let checkpointObj: RunawayCheckpointState | null = null;
                    const run = {
                        ID: randomUUID(),
                        AgentID: AGENT_ID,
                        Status: 'Running',
                        StartedAt: new Date(),
                        CompletedAt: null as Date | null,
                        Success: null as boolean | null,
                        ErrorMessage: null as string | null,
                        Message: null as string | null,
                        UserID: TEST_USER.ID,
                        Steps: [] as MJAIAgentRunEntityExtended['Steps'],
                        LatestResult: { CompleteMessage: '' } as MJAIAgentRunEntityExtended['LatestResult'],
                        get Data(): string | null {
                            return dataJson;
                        },
                        set Data(val: string | null) {
                            dataJson = val;
                        },
                        get RunawayCheckpoint(): RunawayCheckpointState | null {
                            return checkpointObj ?? ExtractRunawayCheckpointFromRunData(dataJson);
                        },
                        set RunawayCheckpoint(val: RunawayCheckpointState | null) {
                            checkpointObj = val;
                        },
                        Load: async (id: string) => {
                            const existing = store.AgentRuns.get(id);
                            if (!existing) return false;
                            run.ID = existing.ID;
                            run.AgentID = existing.AgentID;
                            run.Status = existing.Status;
                            run.StartedAt = existing.StartedAt;
                            run.CompletedAt = existing.CompletedAt;
                            run.Success = existing.Success;
                            run.ErrorMessage = existing.ErrorMessage;
                            run.Message = existing.Message;
                            run.UserID = existing.UserID;
                            dataJson = existing.Data;
                            checkpointObj = null;
                            return true;
                        },
                        Save: async () => {
                            const snapshot = {
                                ID: run.ID,
                                AgentID: run.AgentID,
                                Status: run.Status,
                                StartedAt: run.StartedAt,
                                CompletedAt: run.CompletedAt,
                                Success: run.Success,
                                ErrorMessage: run.ErrorMessage,
                                Message: run.Message,
                                UserID: run.UserID,
                                Steps: run.Steps,
                                Data: dataJson,
                            } as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
                            store.AgentRuns.set(run.ID, snapshot);
                            return true;
                        },
                    };
                    return run;
                }
                return {
                    LatestResult: { CompleteMessage: '' },
                    Save: async () => true,
                    Load: async () => false,
                };
            },
            ExecuteSQL: async (sql: string, values?: SqlValue[], _opts?: ExecuteSQLOptions) => {
                const args = Array.isArray(values) ? values : [];
                if (sql.includes('spTaskGraphClaimTask')) {
                    const [taskId, claimedBy, ttlSec] = args as [string, string, number];
                    const row = store.getTask(taskId);
                    if (!row || row.Status !== 'Pending') {
                        return [{ AffectedRows: 0 }];
                    }
                    row.Status = 'In Progress';
                    row.ClaimedBy = claimedBy;
                    row.ClaimExpiresAt = new Date(Date.now() + Number(ttlSec || 60) * 1000);
                    row.StartedAt = row.StartedAt ?? new Date();
                    row.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphCompleteClaimed')) {
                    const [taskId, claimedBy, status, outputPayload, errorMessage, agentRunID, configuration, setConfiguration] =
                        args as [string, string, MJTaskEntity['Status'], string | null, string | null, string | null, string | null, boolean];
                    const row = store.getTask(taskId);
                    if (!row || row.Status !== 'In Progress' || row.ClaimedBy !== claimedBy) {
                        return [{ AffectedRows: 0 }];
                    }
                    row.Status = status;
                    row.OutputPayload = outputPayload;
                    row.ErrorMessage = errorMessage;
                    row.AgentRunID = agentRunID;
                    if (setConfiguration) {
                        row.Configuration = configuration;
                    }
                    row.ClaimedBy = null;
                    row.ClaimExpiresAt = null;
                    row.CompletedAt = new Date();
                    row.PercentComplete = status === 'Complete' ? 100 : 0;
                    row.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphStampParentStart')) {
                    const [parentId, startedAt] = args as [string, Date];
                    const row = store.getTask(parentId);
                    if (!row || row.StartedAt) {
                        return [{ AffectedRows: 0 }];
                    }
                    row.StartedAt = startedAt;
                    row.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphUpdateParentProgress')) {
                    const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
                    const row = store.getTask(parentId);
                    if (!row || TERMINAL_STATUSES.has(row.Status)) {
                        return [{ AffectedRows: 0 }];
                    }
                    row.Status = status;
                    row.PercentComplete = pct;
                    row.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphSettleParent')) {
                    const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
                    const row = store.getTask(parentId);
                    if (!row || TERMINAL_STATUSES.has(row.Status)) {
                        return [{ AffectedRows: 0 }];
                    }
                    row.Status = status;
                    row.PercentComplete = pct;
                    row.CompletedAt = new Date();
                    row.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphWriteDebugFields')) {
                    const [parentId, _typeId, _containersJson, fieldsJson] = args as [string, string, string, string];
                    const row = store.getTask(parentId);
                    if (!row) {
                        return [{ AffectedRows: 0 }];
                    }
                    const payload = row.InputPayload ? (JSON.parse(row.InputPayload) as { debug?: TaskGraphDebugState }) : {};
                    const debugBag: TaskGraphDebugState = payload.debug && typeof payload.debug === 'object'
                        ? { ...payload.debug }
                        : {};
                    const fields = JSON.parse(fieldsJson) as Array<{ Path: string; Kind: string; Value?: string | boolean | null }>;
                    for (const field of fields) {
                        const prefix = '$.debug.';
                        if (!field.Path.startsWith(prefix)) continue;
                        const prop = field.Path.slice(prefix.length) as keyof TaskGraphDebugState;
                        if (field.Kind === 'null') {
                            delete debugBag[prop];
                        } else {
                            (debugBag as Record<string, string | boolean | null | undefined>)[prop] = field.Value;
                        }
                    }
                    payload.debug = debugBag;
                    row.InputPayload = JSON.stringify(payload);
                    row.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphSetRunCostRollup')) {
                    const [runId, cost, tokens, promptTokens, completionTokens] = args as [
                        string,
                        number,
                        number,
                        number,
                        number,
                    ];
                    const run = store.AgentRuns.get(runId);
                    if (!run) {
                        return [{ AffectedRows: 0 }];
                    }
                    run.TotalCostRollup = cost;
                    run.TotalTokensUsedRollup = tokens;
                    run.TotalPromptTokensUsedRollup = promptTokens;
                    run.TotalCompletionTokensUsedRollup = completionTokens;
                    run.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphSettleRun')) {
                    const [runId, succeeded, errorMessage] = args as [string, boolean, string | null];
                    const run = store.AgentRuns.get(runId);
                    if (!run || run.Status !== 'Paused') {
                        return [{ AffectedRows: 0 }];
                    }
                    run.Status = succeeded ? 'Completed' : 'Failed';
                    run.Success = succeeded;
                    run.ErrorMessage = errorMessage;
                    run.CompletedAt = new Date();
                    run.__mj_UpdatedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphReleaseExpiredClaims') || sql.includes('spTaskGraphExpireWaitingSteps')) {
                    return [];
                }
                return [{ AffectedRows: 1 }];
            },
            RunView: async (params: RunViewParams) => {
                return store.handleRunView(params);
            },
            RunViews: async (items: RunViewParams[]) => {
                const out = [];
                for (const item of items) {
                    out.push(await store.handleRunView(item));
                }
                return out;
            },
        };
        return provider as Partial<IMetadataProvider> as IMetadataProvider;
    }

    private handleRunView(params: RunViewParams): { Success: boolean; Results: MockRunViewRow[] } {
        const filter = params.ExtraFilter ?? '';
        if (params.EntityName === 'MJ: Task Types') {
            return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID, Name: 'Workflow' }] };
        }
        if (params.EntityName === 'MJ: Actions') {
            return { Success: true, Results: [{ ID: ACTION_ID, Name: 'ExecuteStep', Status: 'Active' }] };
        }
        if (params.EntityName === 'MJ: Tasks') {
            if (filter.includes('ParentID IS NOT NULL') && filter.includes("Status IN ('Pending','In Progress')")) {
                const seen = new Set<string>();
                const rows: Array<{ ParentID: string }> = [];
                for (const t of this.Tasks.values()) {
                    if (t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress') && !seen.has(t.ParentID)) {
                        seen.add(t.ParentID);
                        rows.push({ ParentID: t.ParentID });
                    }
                }
                return { Success: true, Results: rows };
            }
            if (filter.includes('ParentID IS NULL') && filter.includes("Status IN ('Pending','In Progress')")) {
                const rows: Array<{ ID: string }> = [];
                for (const t of this.Tasks.values()) {
                    if (!t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress')) {
                        rows.push({ ID: t.ID });
                    }
                }
                return { Success: true, Results: rows };
            }
            if (filter.includes('ParentID IS NULL') && filter.includes('ID IN (')) {
                const match = /ID IN \(([^)]+)\)/.exec(filter);
                const targetIds = new Set(
                    (match?.[1] ?? '')
                        .split(',')
                        .map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase()),
                );
                const rows = Array.from(this.Tasks.values())
                    .filter((t) => !t.ParentID && targetIds.has(t.ID.toLowerCase()))
                    .map((t) => ({ ID: t.ID }));
                return { Success: true, Results: rows };
            }
            const parentMatch = /ParentID='([^']+)'/.exec(filter);
            if (parentMatch?.[1]) {
                const children = this.TasksByParent.get(parentMatch[1].toLowerCase()) ?? [];
                return {
                    Success: true,
                    Results: params.ResultType === 'simple'
                        ? children.map((row) => ({
                            ID: row.ID,
                            TypeID: row.TypeID,
                            AgentRunID: row.AgentRunID,
                            AgentID: row.AgentID,
                            UserID: row.UserID,
                            Status: row.Status,
                            InputPayload: row.InputPayload,
                            Configuration: row.Configuration,
                        }))
                        : children.map((row) => this.wrapTaskEntity(row)),
                };
            }
            const idMatch = /\bID='([^']+)'/.exec(filter);
            if (idMatch?.[1]) {
                const single = this.getTask(idMatch[1]);
                if (!single) {
                    return { Success: true, Results: [] };
                }
                return {
                    Success: true,
                    Results: [
                        params.ResultType === 'simple'
                            ? {
                                ID: single.ID,
                                TypeID: single.TypeID,
                                AgentRunID: single.AgentRunID,
                                AgentID: single.AgentID,
                                UserID: single.UserID,
                                Status: single.Status,
                                InputPayload: single.InputPayload,
                                Configuration: single.Configuration,
                            }
                            : this.wrapTaskEntity(single),
                    ],
                };
            }
            return { Success: true, Results: [] };
        }
        if (params.EntityName === 'MJ: Task Dependencies') {
            const inMatch = /TaskID IN \(([^)]+)\)/.exec(filter);
            if (inMatch?.[1]) {
                const results: StoredDependencyRow[] = [];
                for (const raw of inMatch[1].split(',')) {
                    const tid = raw.trim().replace(/^'|'$/g, '').toLowerCase();
                    const deps = this.DepsByTask.get(tid);
                    if (deps) {
                        results.push(...deps);
                    }
                }
                return { Success: true, Results: results };
            }
            const singleMatch = /TaskID='([^']+)'/.exec(filter);
            if (singleMatch?.[1]) {
                return { Success: true, Results: this.DepsByTask.get(singleMatch[1].toLowerCase()) ?? [] };
            }
            return { Success: true, Results: [] };
        }
        return { Success: true, Results: [] };
    }
}

/** Builds a valid 5,000-node layered DAG (`waves * width = 5000`). */
function build5000NodeLayeredDag(waves: number, width: number, workflowName: string): TaskGraphSpec {
    const tasks: TaskGraphSpecNode[] = [];
    for (let w = 0; w < waves; w++) {
        for (let i = 0; i < width; i++) {
            const id = w * width + i + 1;
            const prevId = w > 0 ? (w - 1) * width + i + 1 : null;
            tasks.push({
                tempId: `node-${id}`,
                name: `ETL Stage ${w + 1} Slice ${i + 1}`,
                description: `Deterministic wave ${w + 1} slice ${i + 1}`,
                kind: 'Action',
                configuration: {
                    actionName: 'ExecuteStep',
                    inputMapping: JSON.stringify({ sliceId: `static:node-${id}` }),
                },
                dependsOn: prevId ? [`node-${prevId}`] : [],
            });
        }
    }
    return {
        workflowName,
        description: '5,000-node layered orchestration acceptance DAG',
        tasks,
    };
}

async function waitForCondition(
    predicate: () => boolean,
    timeoutMs: number,
    kickFn?: () => void,
    diagFn?: () => string,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }
        kickFn?.();
        await new Promise((r) => setTimeout(r, 15));
    }
    const diag = diagFn ? ` (${diagFn()})` : '';
    const errPreview = capturedLogErrors.slice(0, 5).join(' | ');
    throw new Error(`Timed out after ${timeoutMs}ms waiting for TaskGraphDispatcher condition${diag}; errors=[${errPreview}]`);
}

interface MockRunViewCapableProvider {
    RunView: (params: RunViewParams) => Promise<{ Success: boolean; Results: MockRunViewRow[] }>;
    RunViews: (items: RunViewParams[]) => Promise<Array<{ Success: boolean; Results: MockRunViewRow[] }>>;
}

function isMockRunViewCapableProvider(val: object): val is MockRunViewCapableProvider {
    return 'RunView' in val && 'RunViews' in val && typeof val.RunView === 'function' && typeof val.RunViews === 'function';
}

describe('CR-19: 5,000-node workflow acceptance through real TaskGraphService and TaskGraphDispatcher', () => {
    it('submits and executes a 5,000-node DAG to Complete through TaskGraphService + TaskGraphDispatcher with zero duplicate node executions', async () => {
        capturedLogErrors.length = 0;
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        const db = new InMemoryTaskGraphDatabase();
        const provider = db.CreateProvider();
        const spyFromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => {
            if (!isMockRunViewCapableProvider(p)) {
                throw new Error('Unexpected provider in CR-19 test');
            }
            return {
                RunView: (params: RunViewParams) => p.RunView(params),
                RunViews: (items: RunViewParams[]) => p.RunViews(items),
            } as Partial<RunView> as RunView;
        });

        try {
            const spec = build5000NodeLayeredDag(50, 100, 'Enterprise 5000-Node Dispatcher DAG');
            expect(spec.tasks).toHaveLength(5_000);
            expect(CODE_FALLBACK_LIMITS.MaxTasksPerGraph).toBe(100_000);
            const validation = ValidateTaskGraphSpec(spec);
            expect(validation.Valid).toBe(true);

            const executedSliceIds: string[] = [];

            const actionRunner: TaskActionRunner = {
                RunActionForTask: async (ctx) => {
                    const inputObj = ctx.InputPayload && typeof ctx.InputPayload === 'object'
                        ? (ctx.InputPayload as RunawayJsonObject)
                        : {};
                    const sliceId = String(inputObj['sliceId'] ?? ctx.TaskID);
                    executedSliceIds.push(sliceId);
                    return {
                        Success: true,
                        Output: { sliceId, ok: true },
                        CostUsd: 0.0001,
                        TokensUsed: 50,
                    };
                },
            };
            const agentRunner: TaskAgentRunner = {
                RunAgentForTask: async () => ({ Success: true, Output: {} }),
            };

            // Omit Governance.Enabled & EnableGovernance to prove production governance is enabled by default.
            const dispatcher = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                agentRunner,
                TEST_USER,
                {
                    InstanceID: 'cr19-disp-1',
                    MaxConcurrentTasks: 300,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                actionRunner,
            );
            const recordSpy = vi.spyOn(dispatcher.Governance, 'RecordNodeSettlementAndEvaluate');
            let capturedDiagBeforeForget: ReturnType<typeof dispatcher.Governance.GetGraphDiagnostics> = null;
            const forgetOrig = dispatcher.Governance.ForgetGraph.bind(dispatcher.Governance);
            vi.spyOn(dispatcher.Governance, 'ForgetGraph').mockImplementation((gid: string) => {
                if (!capturedDiagBeforeForget) {
                    capturedDiagBeforeForget = dispatcher.Governance.GetGraphDiagnostics(gid);
                }
                forgetOrig(gid);
            });

            await dispatcher.Start();
            try {
                const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
                submitRun.ID = SUBMIT_RUN_ID;
                submitRun.Status = 'Paused';
                await submitRun.Save();

                const service = new TaskGraphService();
                const submitRes = await service.Submit(spec, {
                    Provider: provider,
                    ContextUser: TEST_USER,
                    AgentID: AGENT_ID,
                    AgentRunID: SUBMIT_RUN_ID,
                });
                expect(submitRes.ErrorMessage).toBeUndefined();
                expect(submitRes.Success).toBe(true);
                expect(submitRes.TaskIDMap?.size).toBe(5_000);
                const parentId = submitRes.ParentTaskID!;

                await waitForCondition(
                    () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete' && capturedDiagBeforeForget !== null,
                    35_000,
                    () => dispatcher.Kick(),
                    () => `executed=${executedSliceIds.length}, parentStatus=${db.Tasks.get(parentId.toLowerCase())?.Status}`,
                );

                expect(executedSliceIds).toHaveLength(5_000);
                expect(new Set(executedSliceIds).size).toBe(5_000);
                expect(recordSpy).toHaveBeenCalledTimes(5_000);
                expect(capturedDiagBeforeForget).not.toBeNull();
                expect(capturedDiagBeforeForget?.GovernanceEnabled).toBe(true);
                expect(capturedDiagBeforeForget?.EvaluationCount).toBe(5_000);
                expect(capturedDiagBeforeForget?.CompletedNodeCount).toBe(5_000);
                expect(capturedDiagBeforeForget?.CumulativeCostUsd).toBeCloseTo(0.5, 4);
                expect(capturedDiagBeforeForget?.TokensUsed).toBe(250_000);
                expect(capturedDiagBeforeForget?.LastBudgetResult?.Exceeded).toBe(false);
                expect(capturedDiagBeforeForget?.LastProgressResult?.Classification).toBe('Converging');
                expect(capturedDiagBeforeForget?.LastResolvedLimits?.MaxTasksPerGraph).toBe(100_000);
                const parentRow = db.Tasks.get(parentId.toLowerCase());
                expect(parentRow?.Status).toBe('Complete');
                expect(parentRow?.PercentComplete).toBe(100);
            } finally {
                await dispatcher.Stop();
            }
        } finally {
            spyFromProvider.mockRestore();
        }
    }, 60_000);

    it('pauses mid-5000-node DAG automatically via production governance, blocks unapproved restart, and finishes remaining nodes after production approval without replaying completed nodes', async () => {
        capturedLogErrors.length = 0;
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        const db = new InMemoryTaskGraphDatabase();
        const provider = db.CreateProvider();
        const spyFromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => {
            if (!isMockRunViewCapableProvider(p)) {
                throw new Error('Unexpected provider in CR-19 test');
            }
            return {
                RunView: (params: RunViewParams) => p.RunView(params),
                RunViews: (items: RunViewParams[]) => p.RunViews(items),
            } as Partial<RunView> as RunView;
        });

        try {
            const spec = build5000NodeLayeredDag(50, 100, 'Enterprise 5000-Node Pause/Resume DAG');
            const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
            submitRun.ID = SUBMIT_RUN_ID;
            submitRun.Status = 'Running';
            await submitRun.Save();

            const executedOrder: string[] = [];
            const actionRunner: TaskActionRunner = {
                RunActionForTask: async (ctx) => {
                    const inputObj = ctx.InputPayload && typeof ctx.InputPayload === 'object'
                        ? (ctx.InputPayload as RunawayJsonObject)
                        : {};
                    const sliceId = String(inputObj['sliceId'] ?? ctx.TaskID);
                    executedOrder.push(sliceId);
                    // External action execution only — reports per-node cost/tokens; governance lives in TaskGraphDispatcher.
                    return { Success: true, Output: { sliceId }, CostUsd: 0.0001, TokensUsed: 50 };
                },
            };
            const agentRunner: TaskAgentRunner = {
                RunAgentForTask: async () => ({ Success: true, Output: {} }),
            };

            const dispatcher1 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                agentRunner,
                TEST_USER,
                {
                    InstanceID: 'cr19-disp-phase1',
                    MaxConcurrentTasks: 100,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                    Governance: { Enabled: true },
                },
                undefined,
                undefined,
                actionRunner,
            );

            await dispatcher1.Start();
            const service = new TaskGraphService();
            const submitRes = await service.Submit(spec, {
                Provider: provider,
                ContextUser: TEST_USER,
                AgentID: AGENT_ID,
                AgentRunID: SUBMIT_RUN_ID,
                EnableGovernance: true,
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
            });
            expect(submitRes.ErrorMessage).toBeUndefined();
            expect(submitRes.Success).toBe(true);
            const parentId = submitRes.ParentTaskID!;

            // Production TaskGraphGovernanceCoordinator automatically breaches at >= 2500 nodes ($0.25),
            // writes $.debug.paused=true, and persists RunawayCheckpoint onto submitRun.
            await waitForCondition(
                () => {
                    const storedRun = db.AgentRuns.get(SUBMIT_RUN_ID);
                    return storedRun?.Status === 'Paused' && ExtractRunawayCheckpointFromRunData(storedRun.Data) !== null;
                },
                35_000,
                () => dispatcher1.Kick(),
                () => `executed=${executedOrder.length}, runStatus=${db.AgentRuns.get(SUBMIT_RUN_ID)?.Status}`,
            );
            await dispatcher1.Stop();

            const executedBeforePause = executedOrder.length;
            expect(executedBeforePause).toBeGreaterThanOrEqual(2_500);
            expect(executedBeforePause).toBeLessThan(5_000);
            const childrenAfterPause = db.TasksByParent.get(parentId.toLowerCase()) ?? [];
            const completedCountAfterPause = childrenAfterPause.filter((c) => c.Status === 'Complete').length;
            const pendingCountAfterPause = childrenAfterPause.filter((c) => c.Status === 'Pending').length;
            expect(completedCountAfterPause).toBe(executedBeforePause);
            expect(completedCountAfterPause + pendingCountAfterPause).toBe(5_000);

            const pausedRunRow = db.AgentRuns.get(SUBMIT_RUN_ID)!;
            const persistedCp = ExtractRunawayCheckpointFromRunData(pausedRunRow.Data);
            expect(persistedCp).not.toBeNull();
            expect(persistedCp?.PauseReason).toBe('BudgetExceeded');
            expect(persistedCp?.HumanApproval.Status).toBe('Pending');
            expect(persistedCp?.CompletedNodeIDs.length).toBeGreaterThanOrEqual(2_500);

            // Restarting a fresh TaskGraphDispatcher BEFORE human approval MUST block all remaining pending nodes
            const unapprovedRestartDisp = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                agentRunner,
                TEST_USER,
                {
                    InstanceID: 'cr19-disp-unapproved-restart',
                    MaxConcurrentTasks: 100,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                    Governance: { Enabled: true },
                },
                undefined,
                undefined,
                actionRunner,
            );
            await unapprovedRestartDisp.Start();
            unapprovedRestartDisp.Kick();
            await new Promise((r) => setTimeout(r, 80));
            await unapprovedRestartDisp.Stop();
            expect(executedOrder.length).toBe(executedBeforePause);

            // Invoke production governance approval & resume with extended $1.00 budget
            const resumeRes = await dispatcher1.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                ApprovedByUserID: TEST_USER.ID,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
                DecisionNotes: 'Approved extended $1.00 budget for remaining DAG waves',
            });
            expect(resumeRes.Success).toBe(true);
            expect(resumeRes.ExtendedBudgets?.PerRun.MaxCostUsd).toBe(1.0);

            // Fresh TaskGraphDispatcher hydrates approved checkpoint automatically and finishes remaining Pending nodes
            const dispatcher2 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                agentRunner,
                TEST_USER,
                {
                    InstanceID: 'cr19-disp-phase2',
                    MaxConcurrentTasks: 300,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                    Governance: { Enabled: true },
                },
                undefined,
                undefined,
                actionRunner,
            );
            await dispatcher2.Start();
            try {
                await waitForCondition(
                    () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                    35_000,
                    () => dispatcher2.Kick(),
                    () => `executedTotal=${executedOrder.length}, parentStatus=${db.Tasks.get(parentId.toLowerCase())?.Status}`,
                );
            } finally {
                await dispatcher2.Stop();
            }

            expect(executedOrder).toHaveLength(5_000);
            expect(new Set(executedOrder).size).toBe(5_000);
            expect(db.Tasks.get(parentId.toLowerCase())?.Status).toBe('Complete');
            expect(db.Tasks.get(parentId.toLowerCase())?.PercentComplete).toBe(100);
            expect(db.AgentRuns.get(SUBMIT_RUN_ID)?.Status).toBe('Completed');
        } finally {
            spyFromProvider.mockRestore();
        }
    }, 60_000);
});
