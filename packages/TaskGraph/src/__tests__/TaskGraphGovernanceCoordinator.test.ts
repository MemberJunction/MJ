/**
 * Unit & integration tests for TaskGraphGovernanceCoordinator & TaskGraphDispatcher governance:
 * - CR-GRAPH-GOVERNANCE-OPT-IN: Governance enabled by default (enforcing mj.config.cjs / 5-tier limits
 *   on ordinary TaskGraphService submissions) unless explicitly disabled.
 * - CR-GRAPH-MISSING-POLICY-SCOPE: Full 5-tier resolution (AgentOrWorkflowMetadata + UserAgentPolicy
 *   with EnforceUserPolicyAsCeiling: true) and PerRoutine budget enforcement via RoutineID.
 * - CR-GRAPH-NONDURABLE-ACCOUNTING: Durable per-node settlement accounting reconstructed across worker
 *   restarts BEFORE the first pause and across concurrent/sequential dispatchers sharing one budget.
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LimitsConfigResolver,
    RunView,
    type ExecuteSQLOptions,
    type IMetadataProvider,
    type RunViewParams,
    type UserInfo,
} from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentUserPolicyEntity,
    MJTaskDependencyEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import {
    ExtractRunawayCheckpointFromRunData,
    type MJAIAgentRunEntityExtended,
    type RunawayCheckpointState,
    type RunawayJsonObject,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '@memberjunction/ai-core-plus';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { TaskGraphDebugState } from '../debug-state';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { TaskGraphService } from '../TaskGraphService';
import type { TaskActionRunner, TaskAgentRunner, TaskGraphFrame } from '../types';

const capturedErrors: string[] = [];

type GovernanceLogArg = string | number | boolean | object | null | undefined;
type GovernanceSqlArg = string | number | boolean | Date | null | undefined;
type GovernanceRunViewRow =
    | { ID: string; Name: string; Status?: string }
    | { ParentID: string }
    | { ID: string }
    | { ID: string; Status: MJTaskEntity['Status']; Configuration: string | null }
    | {
          ID: string;
          TypeID: string;
          AgentRunID: string | null;
          AgentID: string | null;
          UserID: string | null;
          Status: MJTaskEntity['Status'];
          InputPayload: string | null;
          Configuration: string | null;
      }
    | StoredTaskRow
    | StoredDepRow
    | StoredAgentRunRow
    | Partial<MJAIAgentEntity>
    | Partial<MJAIAgentUserPolicyEntity>
    | MJTaskEntity;

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn((...args: GovernanceLogArg[]) => {
            capturedErrors.push(args.map((a) => String(a)).join(' '));
        }),
        LogStatus: vi.fn(),
        LogErrorEx: vi.fn(),
        LogStatusEx: vi.fn(),
    };
});

const TEST_USER = {
    ID: '10000000-0000-4000-8000-000000000011',
    Name: 'Alice Governance',
    Email: 'alice@example.com',
    Type: 'User',
    IsActive: true,
} as UserInfo;

const WORKFLOW_TYPE_ID = '20000000-0000-4000-8000-000000000011';
const ACTION_ID = '30000000-0000-4000-8000-000000000011';
const AGENT_ID = '40000000-0000-4000-8000-000000000011';
const SUBMIT_RUN_ID = '50000000-0000-4000-8000-000000000011';
const ROUTINE_ID = '60000000-0000-4000-8000-000000000011';

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
    __mj_UpdatedAt: Date;
}

interface StoredDepRow {
    ID: string;
    TaskID: string;
    DependsOnTaskID: string;
    DependencyType: MJTaskDependencyEntity['DependencyType'];
    Condition: string | null;
    ExclusiveGroup: string | null;
    Priority: number;
    Sequence: number;
}

interface StoredAgentRunRow {
    ID: string;
    AgentID: string;
    UserID: string | null;
    ParentRunID: string | null;
    ScheduledJobRunID: string | null;
    Status: string;
    StartedAt: Date;
    CompletedAt: Date | null;
    Success: boolean | null;
    ErrorMessage: string | null;
    Message: string | null;
    TotalCost: number;
    TotalCostRollup: number;
    Data: string | null;
    Steps: MJAIAgentRunEntityExtended['Steps'];
}

class GovernanceInMemoryDb {
    public readonly Tasks = new Map<string, StoredTaskRow>();
    public readonly TasksByParent = new Map<string, StoredTaskRow[]>();
    public readonly DepsByTask = new Map<string, StoredDepRow[]>();
    public readonly AgentRuns = new Map<string, StoredAgentRunRow>();
    public Agents: Array<Partial<MJAIAgentEntity>> = [];
    public UserPolicies: Array<Partial<MJAIAgentUserPolicyEntity>> = [];
    public AgentRunSaveMode: 'ok' | 'false' | 'throw' = 'ok';
    public DebugWriteMode: 'ok' | 'false' | 'throw' = 'ok';
    private readonly dialect = new SQLServerDialect();

    private wrapTask(initial?: StoredTaskRow): MJTaskEntity {
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
        const db = this;
        const wrapper = {
            get ID() { return backing.ID; },
            set ID(v: string) { backing.ID = v; },
            get ParentID() { return backing.ParentID; },
            set ParentID(v: string | null) { backing.ParentID = v; },
            get TypeID() { return backing.TypeID; },
            set TypeID(v: string) { backing.TypeID = v; },
            get Name() { return backing.Name; },
            set Name(v: string) { backing.Name = v; },
            get Description() { return backing.Description; },
            set Description(v: string | null) { backing.Description = v; },
            get Status() { return backing.Status; },
            set Status(v: MJTaskEntity['Status']) { backing.Status = v; },
            get StepType() { return backing.StepType; },
            set StepType(v: MJTaskEntity['StepType']) { backing.StepType = v; },
            get ActionID() { return backing.ActionID; },
            set ActionID(v: string | null) { backing.ActionID = v; },
            get AgentID() { return backing.AgentID; },
            set AgentID(v: string | null) { backing.AgentID = v; },
            get PromptID() { return backing.PromptID; },
            set PromptID(v: string | null) { backing.PromptID = v; },
            get UserID() { return backing.UserID; },
            set UserID(v: string | null) { backing.UserID = v; },
            get AgentRunID() { return backing.AgentRunID; },
            set AgentRunID(v: string | null) { backing.AgentRunID = v; },
            get ConversationDetailID() { return backing.ConversationDetailID; },
            set ConversationDetailID(v: string | null) { backing.ConversationDetailID = v; },
            get ClaimedBy() { return backing.ClaimedBy; },
            set ClaimedBy(v: string | null) { backing.ClaimedBy = v; },
            get ClaimExpiresAt() { return backing.ClaimExpiresAt; },
            set ClaimExpiresAt(v: Date | null) { backing.ClaimExpiresAt = v; },
            get StartedAt() { return backing.StartedAt; },
            set StartedAt(v: Date | null) { backing.StartedAt = v; },
            get CompletedAt() { return backing.CompletedAt; },
            set CompletedAt(v: Date | null) { backing.CompletedAt = v; },
            get PercentComplete() { return backing.PercentComplete; },
            set PercentComplete(v: number) { backing.PercentComplete = v; },
            get ErrorMessage() { return backing.ErrorMessage; },
            set ErrorMessage(v: string | null) { backing.ErrorMessage = v; },
            get InputPayload() { return backing.InputPayload; },
            set InputPayload(v: string | null) { backing.InputPayload = v; },
            get OutputPayload() { return backing.OutputPayload; },
            set OutputPayload(v: string | null) { backing.OutputPayload = v; },
            get Configuration() { return backing.Configuration; },
            set Configuration(v: string | null) { backing.Configuration = v; },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => true,
            Load: async (id: string) => {
                const found = db.Tasks.get(id.toLowerCase());
                if (!found) return false;
                Object.assign(backing, found);
                return true;
            },
            Save: async () => {
                if (!backing.ID) backing.ID = randomUUID();
                backing.__mj_UpdatedAt = new Date();
                const existing = db.Tasks.get(backing.ID.toLowerCase());
                const copy: StoredTaskRow = { ...backing };
                db.Tasks.set(copy.ID.toLowerCase(), copy);
                if (copy.ParentID) {
                    const pKey = copy.ParentID.toLowerCase();
                    const list = db.TasksByParent.get(pKey) ?? [];
                    if (!existing) {
                        list.push(copy);
                        db.TasksByParent.set(pKey, list);
                    } else {
                        const idx = list.findIndex((r) => r.ID.toLowerCase() === copy.ID.toLowerCase());
                        if (idx >= 0) list[idx] = copy;
                        else list.push(copy);
                    }
                }
                return true;
            },
        };
        return wrapper as Partial<MJTaskEntity> as MJTaskEntity;
    }

    private wrapDependency(): MJTaskDependencyEntity {
        const backing: StoredDepRow = {
            ID: '',
            TaskID: '',
            DependsOnTaskID: '',
            DependencyType: 'FinishToStart',
            Condition: null,
            ExclusiveGroup: null,
            Priority: 0,
            Sequence: 0,
        };
        const db = this;
        const wrapper = {
            get ID() { return backing.ID; },
            set ID(v: string) { backing.ID = v; },
            get TaskID() { return backing.TaskID; },
            set TaskID(v: string) { backing.TaskID = v; },
            get DependsOnTaskID() { return backing.DependsOnTaskID; },
            set DependsOnTaskID(v: string) { backing.DependsOnTaskID = v; },
            get DependencyType() { return backing.DependencyType; },
            set DependencyType(v: MJTaskDependencyEntity['DependencyType']) { backing.DependencyType = v; },
            get Condition() { return backing.Condition; },
            set Condition(v: string | null) { backing.Condition = v; },
            get ExclusiveGroup() { return backing.ExclusiveGroup; },
            set ExclusiveGroup(v: string | null) { backing.ExclusiveGroup = v; },
            get Priority() { return backing.Priority; },
            set Priority(v: number) { backing.Priority = v; },
            get Sequence() { return backing.Sequence; },
            set Sequence(v: number) { backing.Sequence = v; },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => true,
            Save: async () => {
                if (!backing.ID) backing.ID = randomUUID();
                const copy: StoredDepRow = { ...backing };
                const list = db.DepsByTask.get(copy.TaskID.toLowerCase()) ?? [];
                list.push(copy);
                db.DepsByTask.set(copy.TaskID.toLowerCase(), list);
                return true;
            },
        };
        return wrapper as Partial<MJTaskDependencyEntity> as MJTaskDependencyEntity;
    }

    private wrapAgentRun(): MJAIAgentRunEntityExtended {
        const db = this;
        const backing: StoredAgentRunRow = {
            ID: randomUUID(),
            AgentID: AGENT_ID,
            UserID: TEST_USER.ID,
            ParentRunID: null,
            ScheduledJobRunID: null,
            Status: 'Running',
            StartedAt: new Date(),
            CompletedAt: null,
            Success: null,
            ErrorMessage: null,
            Message: null,
            TotalCost: 0,
            TotalCostRollup: 0,
            Data: null,
            Steps: [],
        };
        let cpCache: RunawayCheckpointState | null = null;
        const wrapper = {
            get ID() { return backing.ID; },
            set ID(v: string) { backing.ID = v; },
            get AgentID() { return backing.AgentID; },
            set AgentID(v: string) { backing.AgentID = v; },
            get UserID() { return backing.UserID; },
            set UserID(v: string | null) { backing.UserID = v; },
            get ParentRunID() { return backing.ParentRunID; },
            set ParentRunID(v: string | null) { backing.ParentRunID = v; },
            get ScheduledJobRunID() { return backing.ScheduledJobRunID; },
            set ScheduledJobRunID(v: string | null) { backing.ScheduledJobRunID = v; },
            get Status() { return backing.Status; },
            set Status(v: string) { backing.Status = v; },
            get StartedAt() { return backing.StartedAt; },
            set StartedAt(v: Date) { backing.StartedAt = v; },
            get CompletedAt() { return backing.CompletedAt; },
            set CompletedAt(v: Date | null) { backing.CompletedAt = v; },
            get Success() { return backing.Success; },
            set Success(v: boolean | null) { backing.Success = v; },
            get ErrorMessage() { return backing.ErrorMessage; },
            set ErrorMessage(v: string | null) { backing.ErrorMessage = v; },
            get Message() { return backing.Message; },
            set Message(v: string | null) { backing.Message = v; },
            get TotalCost() { return backing.TotalCost; },
            set TotalCost(v: number) { backing.TotalCost = v; },
            get TotalCostRollup() { return backing.TotalCostRollup; },
            set TotalCostRollup(v: number) { backing.TotalCostRollup = v; },
            get Data() { return backing.Data; },
            set Data(v: string | null) { backing.Data = v; },
            get Steps() { return backing.Steps; },
            get RunawayCheckpoint(): RunawayCheckpointState | null {
                return cpCache ?? ExtractRunawayCheckpointFromRunData(backing.Data);
            },
            set RunawayCheckpoint(val: RunawayCheckpointState | null) {
                cpCache = val;
            },
            LatestResult: { CompleteMessage: '' } as MJAIAgentRunEntityExtended['LatestResult'],
            Load: async (id: string) => {
                const found = db.AgentRuns.get(id.toLowerCase());
                if (!found) return false;
                Object.assign(backing, found);
                cpCache = null;
                return true;
            },
            Save: async () => {
                if (db.AgentRunSaveMode === 'false') {
                    wrapper.LatestResult = { CompleteMessage: 'Simulated agent run Save() false' } as MJAIAgentRunEntityExtended['LatestResult'];
                    return false;
                }
                if (db.AgentRunSaveMode === 'throw') {
                    throw new Error('Simulated agent run Save() network drop');
                }
                db.AgentRuns.set(backing.ID.toLowerCase(), { ...backing });
                return true;
            },
        };
        return wrapper as Partial<MJAIAgentRunEntityExtended> as MJAIAgentRunEntityExtended;
    }

    public CreateProvider(): IMetadataProvider {
        const db = this;
        const provider = {
            MJCoreSchemaName: '__mj',
            PlatformKey: 'sqlserver',
            Dialect: db.dialect,
            QuoteIdentifier: (id: string) => `[${id}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            Entities: [],
            EntityByName: () => undefined,
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Tasks') return db.wrapTask();
                if (entityName === 'MJ: Task Dependencies') return db.wrapDependency();
                if (entityName === 'MJ: AI Agent Runs') return db.wrapAgentRun();
                return {
                    LatestResult: { CompleteMessage: '' },
                    Save: async () => true,
                    Load: async () => false,
                };
            },
            ExecuteSQL: async (sql: string, values?: GovernanceSqlArg[], _opts?: ExecuteSQLOptions) => {
                const args = Array.isArray(values) ? values : [];
                if (sql.includes('spTaskGraphClaimTask')) {
                    const [taskId, claimedBy, ttlSec] = args as [string, string, number];
                    const row = db.Tasks.get(taskId.toLowerCase());
                    if (!row || row.Status !== 'Pending') return [{ AffectedRows: 0 }];
                    row.Status = 'In Progress';
                    row.ClaimedBy = claimedBy;
                    row.ClaimExpiresAt = new Date(Date.now() + Number(ttlSec || 60) * 1000);
                    row.StartedAt = row.StartedAt ?? new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphCompleteClaimed')) {
                    const [taskId, claimedBy, status, outputPayload, errorMessage, agentRunID, configuration, setConfiguration] =
                        args as [string, string, MJTaskEntity['Status'], string | null, string | null, string | null, string | null, boolean];
                    const row = db.Tasks.get(taskId.toLowerCase());
                    if (!row || row.Status !== 'In Progress' || row.ClaimedBy !== claimedBy) return [{ AffectedRows: 0 }];
                    row.Status = status;
                    row.OutputPayload = outputPayload;
                    row.ErrorMessage = errorMessage;
                    row.AgentRunID = agentRunID;
                    if (setConfiguration) row.Configuration = configuration;
                    row.ClaimedBy = null;
                    row.ClaimExpiresAt = null;
                    row.CompletedAt = new Date();
                    row.PercentComplete = status === 'Complete' ? 100 : 0;
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphWriteDebugFields')) {
                    if (db.DebugWriteMode === 'false') {
                        return [{ AffectedRows: 0 }];
                    }
                    if (db.DebugWriteMode === 'throw') {
                        throw new Error('Simulated spTaskGraphWriteDebugFields outage');
                    }
                    const [parentId, _typeId, _containersJson, fieldsJson] = args as [string, string, string, string];
                    const row = db.Tasks.get(parentId.toLowerCase());
                    if (!row) return [{ AffectedRows: 0 }];
                    const payload = row.InputPayload ? (JSON.parse(row.InputPayload) as { debug?: TaskGraphDebugState }) : {};
                    const debugBag: TaskGraphDebugState = payload.debug && typeof payload.debug === 'object'
                        ? { ...payload.debug }
                        : {};
                    const fields = JSON.parse(fieldsJson) as Array<{ Path: string; Kind: string; Value?: string | boolean | null }>;
                    for (const field of fields) {
                        if (!field.Path.startsWith('$.debug.')) continue;
                        const prop = field.Path.slice('$.debug.'.length) as keyof TaskGraphDebugState;
                        if (field.Kind === 'null') delete debugBag[prop];
                        else (debugBag as Record<string, string | boolean | null | undefined>)[prop] = field.Value;
                    }
                    payload.debug = debugBag;
                    row.InputPayload = JSON.stringify(payload);
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphSettleParent')) {
                    const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
                    const row = db.Tasks.get(parentId.toLowerCase());
                    if (!row) return [{ AffectedRows: 0 }];
                    row.Status = status;
                    row.PercentComplete = pct;
                    row.CompletedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphSettleRun')) {
                    const [runId, succeeded, errorMessage] = args as [string, boolean, string | null];
                    const run = db.AgentRuns.get(runId.toLowerCase());
                    if (!run || run.Status !== 'Paused') return [{ AffectedRows: 0 }];
                    run.Status = succeeded ? 'Completed' : 'Failed';
                    run.Success = succeeded;
                    run.ErrorMessage = errorMessage;
                    run.CompletedAt = new Date();
                    return [{ AffectedRows: 1 }];
                }
                return [{ AffectedRows: 1 }];
            },
            RunView: async (params: RunViewParams) => db.handleRunView(params),
            RunViews: async (items: RunViewParams[]) => Promise.all(items.map((i) => db.handleRunView(i))),
        };
        return provider as Partial<IMetadataProvider> as IMetadataProvider;
    }

    private handleRunView(params: RunViewParams): { Success: boolean; Results: GovernanceRunViewRow[] } {
        const filter = params.ExtraFilter ?? '';
        if (params.EntityName === 'MJ: Task Types') {
            return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID, Name: 'Workflow' }] };
        }
        if (params.EntityName === 'MJ: Actions') {
            return { Success: true, Results: [{ ID: ACTION_ID, Name: 'StepAction', Status: 'Active' }] };
        }
        if (params.EntityName === 'MJ: AI Agents') {
            return { Success: true, Results: this.Agents };
        }
        if (params.EntityName === 'MJ: AI Agent User Policies') {
            return { Success: true, Results: this.UserPolicies };
        }
        if (params.EntityName === 'MJ: AI Agent Runs') {
            let rows = Array.from(this.AgentRuns.values());
            const idMatch = /\bID='([^']+)'/.exec(filter);
            if (idMatch?.[1]) {
                rows = rows.filter((r) => r.ID.toLowerCase() === idMatch[1].toLowerCase());
            }
            const routineMatch = /ScheduledJobRunID='([^']+)'/.exec(filter);
            if (routineMatch?.[1]) {
                rows = rows.filter((r) => (r.ScheduledJobRunID ?? '').toLowerCase() === routineMatch[1].toLowerCase());
            }
            const userMatch = /UserID='([^']+)'/.exec(filter);
            if (userMatch?.[1]) {
                rows = rows.filter((r) => (r.UserID ?? '').toLowerCase() === userMatch[1].toLowerCase());
            }
            return { Success: true, Results: rows };
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
                const rows = Array.from(this.Tasks.values())
                    .filter((t) => !t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress'))
                    .map((t) => ({ ID: t.ID }));
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
                        ? children.map((c) => ({
                            ID: c.ID,
                            Status: c.Status,
                            Configuration: c.Configuration,
                        }))
                        : children.map((c) => this.wrapTask(c)),
                };
            }
            const idMatch = /\bID='([^']+)'/.exec(filter);
            if (idMatch?.[1]) {
                const single = this.Tasks.get(idMatch[1].toLowerCase());
                return {
                    Success: true,
                    Results: single
                        ? [
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
                                : this.wrapTask(single),
                        ]
                        : [],
                };
            }
        }
        if (params.EntityName === 'MJ: Task Dependencies') {
            const inMatch = /TaskID IN \(([^)]+)\)/.exec(filter);
            if (inMatch?.[1]) {
                const out: StoredDepRow[] = [];
                for (const raw of inMatch[1].split(',')) {
                    const tid = raw.trim().replace(/^'|'$/g, '').toLowerCase();
                    const deps = this.DepsByTask.get(tid);
                    if (deps) out.push(...deps);
                }
                return { Success: true, Results: out };
            }
        }
        return { Success: true, Results: [] };
    }
}

function buildLinearSpec(count: number, workflowName: string, routineId?: string): TaskGraphSpec {
    const tasks: TaskGraphSpecNode[] = [];
    for (let i = 1; i <= count; i++) {
        tasks.push({
            tempId: `step-${i}`,
            name: `Step ${i}`,
            description: `Sequential step ${i}`,
            kind: 'Action',
            configuration: { actionName: 'StepAction' },
            dependsOn: i > 1 ? [`step-${i - 1}`] : [],
        });
    }
    return {
        workflowName,
        ...(routineId ? { routineId } : {}),
        tasks,
    };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, kickFn?: () => void): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        kickFn?.();
        await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for TaskGraph condition; errors=[${capturedErrors.slice(0, 5).join(' | ')}]`);
}

describe('TaskGraphGovernanceCoordinator — default opt-in, 5-tier policy scope, PerRoutine, and durable accounting', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        capturedErrors.length = 0;
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('CR-GRAPH-GOVERNANCE-OPT-IN: enforces mj.config.cjs budgets by default without opt-in flags, and respects explicit opt-out', async () => {
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            Budgets: { PerRun: { MaxCostUsd: 0.25 } },
        });
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = SUBMIT_RUN_ID;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const executed: string[] = [];
        const actionRunner: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                executed.push(ctx.TaskID);
                return { Success: true, Output: { step: executed.length }, CostUsd: 0.10, TokensUsed: 100 };
            },
        };
        const agentRunner: TaskAgentRunner = { RunAgentForTask: async () => ({ Success: true }) };

        // Dispatcher omits Governance config -> enabled by default!
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-default-on',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            actionRunner,
        );
        await dispatcher.Start();
        try {
            const service = new TaskGraphService();
            // Ordinary submission omits EnableGovernance and LimitsOverride
            const res = await service.Submit(buildLinearSpec(5, 'Default Governance Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: SUBMIT_RUN_ID,
            });
            expect(res.Success).toBe(true);

            // Should breach at node 3 ($0.30 >= $0.25) and pause automatically
            await waitUntil(
                () => db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Status === 'Paused',
                5_000,
                () => dispatcher.Kick(),
            );
            expect(executed.length).toBe(3);
        } finally {
            await dispatcher.Stop();
        }

        // Explicit EnableGovernance: false disables governance on that graph
        const service = new TaskGraphService();
        const optOutExecuted: string[] = [];
        const optOutRunner: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                optOutExecuted.push(ctx.TaskID);
                return { Success: true, Output: { ok: true }, CostUsd: 0.20, TokensUsed: 50 };
            },
        };
        const optOutDisp = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-opt-out',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            optOutRunner,
        );
        await optOutDisp.Start();
        try {
            const optOutRes = await service.Submit(buildLinearSpec(3, 'Opt-Out Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                EnableGovernance: false,
            });
            const optOutParentId = optOutRes.ParentTaskID!;
            await waitUntil(
                () => db.Tasks.get(optOutParentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => optOutDisp.Kick(),
            );
            expect(optOutExecuted).toHaveLength(3);
        } finally {
            await optOutDisp.Stop();
        }
    });

    it('CR-GRAPH-MISSING-POLICY-SCOPE: enforces 5-tier AgentOrWorkflowMetadata + UserAgentPolicy ceiling clamping and PerRoutine budget exhaustion', async () => {
        const db = new GovernanceInMemoryDb();
        db.Agents = [
            {
                ID: AGENT_ID,
                Name: 'PolicyScopedAgent',
                MaxCostPerRun: 1.0,
                TypeConfiguration: JSON.stringify({ limits: { Budgets: { PerRoutine: { MaxCostUsd: 0.50 } } } }),
            },
        ];
        // Tier-4 UserAgentPolicy sets a tighter $0.20 PerRun cap and $0.35 PerRoutine cap
        db.UserPolicies = [
            {
                ID: '70000000-0000-4000-8000-000000000001',
                AgentID: AGENT_ID,
                UserID: TEST_USER.ID,
                Status: 'Active',
                InstructionsOverride:
                    '<!-- mj-limits: {"Budgets":{"PerRun":{"MaxCostUsd":0.20},"PerRoutine":{"MaxCostUsd":0.35}}} -->',
            },
        ];
        // Historical completed run sharing ROUTINE_ID already spent $0.25
        db.AgentRuns.set('80000000-0000-4000-8000-000000000001', {
            ID: '80000000-0000-4000-8000-000000000001',
            AgentID: AGENT_ID,
            UserID: TEST_USER.ID,
            ParentRunID: null,
            ScheduledJobRunID: ROUTINE_ID,
            Status: 'Completed',
            StartedAt: new Date(Date.now() - 60_000),
            CompletedAt: new Date(Date.now() - 30_000),
            Success: true,
            ErrorMessage: null,
            Message: null,
            TotalCost: 0.25,
            TotalCostRollup: 0.25,
            Data: null,
            Steps: [],
        });

        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = SUBMIT_RUN_ID;
        submitRun.AgentID = AGENT_ID;
        submitRun.UserID = TEST_USER.ID;
        submitRun.ScheduledJobRunID = ROUTINE_ID;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const executed: string[] = [];
        const actionRunner: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                executed.push(ctx.TaskID);
                return { Success: true, Output: { idx: executed.length }, CostUsd: 0.06, TokensUsed: 50 };
            },
        };
        const agentRunner: TaskAgentRunner = { RunAgentForTask: async () => ({ Success: true }) };

        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-policy-scope',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            actionRunner,
        );
        await dispatcher.Start();
        try {
            const service = new TaskGraphService();
            // Tier-5 RunOverride tries to widen PerRun to $50 and PerRoutine to $50 -> MUST be clamped by UserAgentPolicy!
            const submitRes = await service.Submit(buildLinearSpec(5, 'Routine Policy Graph', ROUTINE_ID), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentID: AGENT_ID,
                AgentRunID: SUBMIT_RUN_ID,
                RoutineID: ROUTINE_ID,
                WorkflowMetadata: { MaxTasksPerGraph: 500 },
                LimitsOverride: {
                    Budgets: {
                        PerRun: { MaxCostUsd: 50 },
                        PerRoutine: { MaxCostUsd: 50 },
                    },
                },
            });
            expect(submitRes.Success).toBe(true);

            // Node 1 ($0.06 -> routine $0.31 < $0.35), Node 2 ($0.12 -> routine $0.37 >= $0.35) => PerRoutine breach!
            await waitUntil(
                () => db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Status === 'Paused',
                5_000,
                () => dispatcher.Kick(),
            );
            expect(executed.length).toBe(2);

            const pausedRun = db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())!;
            const cp = ExtractRunawayCheckpointFromRunData(pausedRun.Data);
            expect(cp).not.toBeNull();
            expect(cp?.RoutineID).toBe(ROUTINE_ID);
            expect(cp?.PauseReason).toBe('BudgetExceeded');
            expect(cp?.Evidence.BudgetBreach?.Scope).toBe('PerRoutine');
            expect(cp?.Evidence.BudgetBreach?.Limit).toBe(0.35);
            expect(cp?.CumulativeLedger.RoutineCostUsd).toBeCloseTo(0.37, 4);
        } finally {
            await dispatcher.Stop();
        }
    });

    it('CR-GRAPH-NONDURABLE-ACCOUNTING: reconstructs node settlement totals across worker restart BEFORE first pause and across two concurrent dispatchers', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = SUBMIT_RUN_ID;
        submitRun.Status = 'Running';
        await submitRun.Save();

        // 1) Worker restart BEFORE first pause:
        // Dispatcher 1 settles 2 of 5 nodes ($0.15 each = $0.30, budget = $0.50 -> no pause yet), then stops.
        let disp1Count = 0;
        const runner1: TaskActionRunner = {
            RunActionForTask: async () => {
                disp1Count++;
                return { Success: true, Output: { w: 1, disp1Count }, CostUsd: 0.15, TokensUsed: 100 };
            },
        };
        const agentRunner: TaskAgentRunner = { RunAgentForTask: async () => ({ Success: true }) };

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'restart-worker-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            runner1,
        );
        const service = new TaskGraphService();
        const sub1 = await service.Submit(buildLinearSpec(5, 'Restart Before Pause Graph'), {
            EnvironmentID: 'env-1',
            Provider: provider,
            ContextUser: TEST_USER,
            AgentRunID: SUBMIT_RUN_ID,
            LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.50 } } },
        });
        expect(sub1.Success).toBe(true);

        await disp1.Start();
        await waitUntil(() => disp1Count >= 2, 5_000, () => disp1.Kick());
        await disp1.Stop();
        expect(db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Status).toBe('Running');

        // Dispatcher 2 (fresh instance, zero in-memory state) starts and runs node 3 ($0.45) and node 4 ($0.60 >= $0.50 -> pause!)
        let disp2Count = 0;
        const runner2: TaskActionRunner = {
            RunActionForTask: async () => {
                disp2Count++;
                return { Success: true, Output: { w: 2, disp2Count }, CostUsd: 0.15, TokensUsed: 100 };
            },
        };
        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'restart-worker-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            runner2,
        );
        await disp2.Start();
        try {
            await waitUntil(
                () => db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Status === 'Paused',
                5_000,
                () => disp2.Kick(),
            );
            const cp = ExtractRunawayCheckpointFromRunData(db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Data);
            expect(cp).not.toBeNull();
            expect(cp?.PauseReason).toBe('BudgetExceeded');
            expect(cp?.CumulativeLedger.RunCostUsd).toBeGreaterThanOrEqual(0.50);
            expect(cp?.CompletedNodeIDs.length).toBeLessThan(5);
        } finally {
            await disp2.Stop();
        }

        // 2) Two concurrent dispatchers sharing one finite graph budget ($0.40, $0.15/node) on a fan-out DAG
        const sharedRunId = '50000000-0000-4000-8000-000000000099';
        const sharedRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        sharedRun.ID = sharedRunId;
        sharedRun.Status = 'Running';
        await sharedRun.Save();

        const fanOutSpec: TaskGraphSpec = {
            workflowName: 'Concurrent Shared Budget DAG',
            tasks: Array.from({ length: 8 }, (_, i) => ({
                tempId: `fan-${i + 1}`,
                name: `Fan ${i + 1}`,
                description: `Parallel task ${i + 1}`,
                kind: 'Action' as const,
                configuration: { actionName: 'StepAction' },
                dependsOn: [],
            })),
        };
        const subConcurrent = await service.Submit(fanOutSpec, {
            EnvironmentID: 'env-1',
            Provider: provider,
            ContextUser: TEST_USER,
            AgentRunID: sharedRunId,
            LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.40 } } },
        });
        expect(subConcurrent.Success).toBe(true);

        const concurrentExecuted: string[] = [];
        const runnerA: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                concurrentExecuted.push(`A:${ctx.TaskID}`);
                await new Promise((r) => setTimeout(r, 10));
                return { Success: true, Output: { disp: 'A', id: ctx.TaskID }, CostUsd: 0.15, TokensUsed: 50 };
            },
        };
        const runnerB: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                concurrentExecuted.push(`B:${ctx.TaskID}`);
                await new Promise((r) => setTimeout(r, 10));
                return { Success: true, Output: { disp: 'B', id: ctx.TaskID }, CostUsd: 0.15, TokensUsed: 50 };
            },
        };

        const dispA = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'conc-A',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            runnerA,
        );
        const dispB = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'conc-B',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            runnerB,
        );

        await Promise.all([dispA.Start(), dispB.Start()]);
        try {
            await waitUntil(
                () => db.AgentRuns.get(sharedRunId.toLowerCase())?.Status === 'Paused',
                5_000,
                () => {
                    dispA.Kick();
                    dispB.Kick();
                },
            );
            const sharedCp = ExtractRunawayCheckpointFromRunData(db.AgentRuns.get(sharedRunId.toLowerCase())?.Data);
            expect(sharedCp).not.toBeNull();
            expect(sharedCp?.PauseReason).toBe('BudgetExceeded');
            expect(sharedCp?.CumulativeLedger.RunCostUsd).toBeGreaterThanOrEqual(0.40);
            expect(concurrentExecuted.length).toBeLessThan(8);
        } finally {
            await Promise.all([dispA.Stop(), dispB.Stop()]);
        }
    });

    it('CR-GRAPH-CHECKPOINT-SAVE-FAILURE: keeps claim barrier active without emitting GraphPaused when Save() returns false or throws, then completes pause and resumes after recovery', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = SUBMIT_RUN_ID;
        submitRun.Status = 'Running';
        await submitRun.Save();

        // Phase A: Save() returns false when breach hits at node 3 ($0.30 >= $0.25)
        db.AgentRunSaveMode = 'false';
        const executedA: string[] = [];
        const framesA: TaskGraphFrame[] = [];
        const actionRunnerA: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                executedA.push(ctx.TaskID);
                return { Success: true, Output: { step: executedA.length }, CostUsd: 0.10, TokensUsed: 100 };
            },
        };
        const agentRunner: TaskAgentRunner = { RunAgentForTask: async () => ({ Success: true }) };
        const dispA = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-save-false',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => framesA.push(frame) },
            actionRunnerA,
        );
        await dispA.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(buildLinearSpec(5, 'Save False Fail-Closed Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: SUBMIT_RUN_ID,
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
            });
            expect(subRes.Success).toBe(true);
            const parentId = subRes.ParentTaskID!;

            await waitUntil(
                () => dispA.Governance.HasPendingPausePersistence(parentId),
                5_000,
                () => dispA.Kick(),
            );

            // Let extra poll cycles run while Save() still returns false
            for (let i = 0; i < 4; i++) {
                dispA.Kick();
                await new Promise((r) => setTimeout(r, 25));
            }

            // Claims MUST remain blocked fail-closed, PausedByGovernance stays false, GraphPaused NOT emitted!
            expect(executedA).toHaveLength(3);
            expect(dispA.Governance.IsLocallyPaused(parentId)).toBe(true);
            expect(await dispA.Governance.CanClaimTasks(provider, parentId, { paused: true }, null, TEST_USER)).toBe(false);
            const diagBeforeRecovery = dispA.Governance.GetGraphDiagnostics(parentId);
            expect(diagBeforeRecovery?.PausedByGovernance).toBe(false);
            expect(diagBeforeRecovery?.PausePersistencePending).toBe(true);
            expect(diagBeforeRecovery?.DebugFieldsPersisted).toBe(true);
            expect(diagBeforeRecovery?.CheckpointPersisted).toBe(false);
            expect(framesA.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(0);
            expect(db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Status).toBe('Running');

            // ApproveAndResumePausedGraph must fail closed while checkpoint persistence is still pending
            const prematureApprove = await dispA.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(prematureApprove.Success).toBe(false);
            expect(prematureApprove.Message).toContain('pause persistence is still pending');

            // Storage recovers -> Flush / poll persists retained checkpoint, transitions Status='Paused', and emits GraphPaused ONCE
            db.AgentRunSaveMode = 'ok';
            await waitUntil(
                () =>
                    db.AgentRuns.get(SUBMIT_RUN_ID.toLowerCase())?.Status === 'Paused' &&
                    framesA.some((f) => f.Kind === 'GraphPaused'),
                5_000,
                () => dispA.Kick(),
            );
            expect(framesA.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(1);
            const diagAfterRecovery = dispA.Governance.GetGraphDiagnostics(parentId);
            expect(diagAfterRecovery?.PausedByGovernance).toBe(true);
            expect(diagAfterRecovery?.PausePersistencePending).toBe(false);
            expect(diagAfterRecovery?.CheckpointPersisted).toBe(true);
            expect(diagAfterRecovery?.DebugFieldsPersisted).toBe(true);

            // Approve and resume remaining 2 nodes without replaying first 3
            const approveRes = await dispA.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(approveRes.Success).toBe(true);
            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispA.Kick(),
            );
            expect(executedA).toHaveLength(5);
        } finally {
            await dispA.Stop();
        }

        // Phase B: Both Save() throwing and DebugFields throwing during execution, followed by recovery
        const runIdB = '50000000-0000-4000-8000-000000000022';
        const submitRunB = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRunB.ID = runIdB;
        submitRunB.Status = 'Running';
        await submitRunB.Save();

        db.AgentRunSaveMode = 'throw';
        db.DebugWriteMode = 'throw';
        const executedB: string[] = [];
        const framesB: TaskGraphFrame[] = [];
        const actionRunnerB: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                executedB.push(ctx.TaskID);
                return { Success: true, Output: { step: executedB.length }, CostUsd: 0.15, TokensUsed: 50 };
            },
        };
        const dispB = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-save-throw',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => framesB.push(frame) },
            actionRunnerB,
        );
        await dispB.Start();
        try {
            const service = new TaskGraphService();
            const subResB = await service.Submit(buildLinearSpec(4, 'Save Throw Fail-Closed Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdB,
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
            });
            expect(subResB.Success).toBe(true);
            const parentIdB = subResB.ParentTaskID!;

            await waitUntil(
                () => dispB.Governance.HasPendingPausePersistence(parentIdB),
                5_000,
                () => dispB.Kick(),
            );

            // Neither debug fields nor checkpoint saved yet; claims remain blocked fail-closed
            expect(executedB).toHaveLength(2);
            expect(await dispB.Governance.CanClaimTasks(provider, parentIdB, {}, null, TEST_USER)).toBe(false);
            expect(framesB.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(0);
            const diagB = dispB.Governance.GetGraphDiagnostics(parentIdB);
            expect(diagB?.PausedByGovernance).toBe(false);
            expect(diagB?.DebugFieldsPersisted).toBe(false);
            expect(diagB?.CheckpointPersisted).toBe(false);

            // Recover debug write first while checkpoint still throws -> still NOT PausedByGovernance or GraphPaused
            db.DebugWriteMode = 'ok';
            const partialFlush = await dispB.Governance.FlushPendingPausePersistence(provider, parentIdB, TEST_USER);
            expect(partialFlush.DebugFieldsPersisted).toBe(true);
            expect(partialFlush.CheckpointPersisted).toBe(false);
            expect(partialFlush.PausedByGovernance).toBe(false);
            expect(framesB.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(0);

            // Now recover AgentRun.Save() and approve/resume via ApproveAndResumePausedGraph (which flushes pending checkpoint automatically)
            db.AgentRunSaveMode = 'ok';
            const approveB = await dispB.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentIdB,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(approveB.Success).toBe(true);
            expect(framesB.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(1);

            await waitUntil(
                () => db.Tasks.get(parentIdB.toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispB.Kick(),
            );
            expect(executedB).toHaveLength(4);
        } finally {
            await dispB.Stop();
        }
    });
});
