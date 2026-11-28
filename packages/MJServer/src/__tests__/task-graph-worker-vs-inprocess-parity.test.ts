/**
 * @fileoverview Side-by-side behavioral parity matrix comparing model-written task graphs
 * executed under `Worker` (`WorkerIsolationRunner`, now default) against `InProcess`
 * (`InProcessIsolationRunner`, explicit opt-in).
 *
 * Drives the real `TaskGraphService`, real `TaskGraphDispatcher`, and real
 * `CreateDefaultIsolationRunners()` end-to-end across:
 *   1. Default resolution (`Worker`) + explicit `'InProcess'` opt-in + `LimitsConfigResolver` override
 *   2. Sequential pipeline with `inputMapping` / `outputMapping` payload accumulation
 *   3. Parallel fan-out & diamond join with dependency output merging
 *   4. Conditional / exclusive-group (switch) branching & skip cascade
 *   5. Error propagation (`failureSemantics: 'block'` vs `'edges'`) & durable retry (`policy.retryCount`)
 *   6. Waiting steps (`Wait` + `External` signal) with payload & taint carry-through
 *   7. User context (`ExecutionUser`) & `SecurityEnvelope` (taint, run scope, bound params, tenant) propagation
 *   8. Cancellation & step timeout (`policy.timeoutSeconds` -> `TimeoutMs`)
 *   9. `InlineScript` parity (`WorkerIsolationRunner` vs `InProcessIsolationRunner`) + dangling timer cleanup
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LimitsConfigResolver,
    Metadata,
    UserInfo,
    type IMetadataProvider,
    type RunViewParams,
    type TaskGraphIsolationLevel,
} from '@memberjunction/core';
import type { MJTaskDependencyEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import {
    TASK_SECURITY_ENVELOPE_VERSION,
    TaskNode,
    type TaskGraphSpec,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import {
    InProcessIsolationRunner,
    ParseTaskGraphParentMetadata,
    TaskGraphDispatcher,
    TaskGraphService,
    TaskGraphWaitingSteps,
    WAITING_STEP_MARKER,
    type TaskActionRunner,
    type TaskActionRunParams,
    type TaskActionRunResult,
    type TaskAgentRunner,
    type TaskAgentRunParams,
    type TaskAgentRunResult,
    type TaskGraphIsolationExecutionResult,
    type TaskGraphIsolationRunRequest,
    type TaskGraphIsolationRunner,
    type TaskGraphIsolationRunnerMap,
    type TaskGraphIsolationStepOutcome,
    type TaskPromptRunner,
    type TaskPromptRunParams,
    type TaskPromptRunResult,
} from '@memberjunction/task-graph';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { CreateDefaultIsolationRunners, WorkerIsolationRunner } from '../services/isolation/index.js';

const SUBMITTER_USER_ID = '10000000-0000-4000-8000-000000000101';
const DAEMON_USER_ID = '10000000-0000-4000-8000-000000000102';
const WORKFLOW_TYPE_ID = '20000000-0000-4000-8000-000000000101';
const ENV_ID = '60000000-0000-4000-8000-000000000101';

const ACTION_IDS: Readonly<Record<string, string>> = {
    FetchRecord: '30000000-0000-4000-8000-000000000101',
    TransformData: '30000000-0000-4000-8000-000000000102',
    LeftBranch: '30000000-0000-4000-8000-000000000103',
    RightBranch: '30000000-0000-4000-8000-000000000104',
    MergeResults: '30000000-0000-4000-8000-000000000105',
    PremiumPath: '30000000-0000-4000-8000-000000000106',
    StandardPath: '30000000-0000-4000-8000-000000000107',
    StandardFollowUp: '30000000-0000-4000-8000-000000000108',
    FailingStep: '30000000-0000-4000-8000-000000000109',
    RecoveryStep: '30000000-0000-4000-8000-000000000110',
    SlowStep: '30000000-0000-4000-8000-000000000111',
};

const AGENT_IDS: Readonly<Record<string, string>> = {
    PlannerAgent: '40000000-0000-4000-8000-000000000101',
    SummaryAgent: '40000000-0000-4000-8000-000000000102',
};

const PROMPT_IDS: Readonly<Record<string, string>> = {
    SummarizePrompt: '50000000-0000-4000-8000-000000000101',
    FlakyPrompt: '50000000-0000-4000-8000-000000000102',
};

const SUBMITTER_USER = new UserInfo(null, {
    ID: SUBMITTER_USER_ID,
    Name: 'Parity Submitter',
    Email: 'submitter@example.com',
    IsActive: true,
    UserRoles: [],
});

const DAEMON_USER = new UserInfo(null, {
    ID: DAEMON_USER_ID,
    Name: 'Dispatcher Daemon',
    Email: 'daemon@example.com',
    IsActive: true,
    UserRoles: [],
});

const TERMINAL_STATUSES = new Set(['Complete', 'Failed', 'Cancelled', 'Skipped', 'Blocked']);
const POLL_WAIT_INTERVAL_MS = 20; // short polling interval for in-memory parity tests

interface StoredTaskRow {
    ID: string;
    ParentID: string | null;
    TypeID: string;
    EnvironmentID: string;
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
    DueAt: Date | null;
    CorrelationKey: string | null;
    NextAttemptAt: Date | null;
    AttemptCount: number;
    PercentComplete: number;
    ErrorMessage: string | null;
    InputPayload: string | null;
    OutputPayload: string | null;
    Configuration: string | null;
    SecurityEnvelope: string | null;
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

function parseJsonObject(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'string') {
        try {
            const parsed: unknown = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
        } catch {
            return {};
        }
    }
    return raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
}

/**
 * Strongly-typed in-memory backing store implementing all `TaskClaimStore` guarded procedures
 * (`Claim`, `CompleteClaimed`, `ScheduleRetry`, `SkipPending`, `CancelTask`, `MarkWaiting`,
 * `CompleteWaitingStep`, `CompleteDueWait`, `SettleParent`) so the real `TaskGraphService`
 * and `TaskGraphDispatcher` run identically under `Worker` and `InProcess`.
 */
class ParityTaskGraphStore {
    public readonly Tasks = new Map<string, StoredTaskRow>();
    public readonly Deps: StoredDepRow[] = [];
    private readonly dialect = new SQLServerDialect();

    public GetRow(id: string): StoredTaskRow | undefined {
        return this.Tasks.get(id.toLowerCase());
    }

    public GetChildren(parentID: string): StoredTaskRow[] {
        const key = parentID.toLowerCase();
        return [...this.Tasks.values()]
            .filter((t) => t.ParentID?.toLowerCase() === key)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    public CreateProvider(): IMetadataProvider {
        const store = this;
        const baseProvider = Metadata.Provider;
        const provider = {
            MJCoreSchemaName: '__mj',
            PlatformKey: 'sqlserver',
            Dialect: store.dialect,
            QuoteIdentifier: (id: string) => `[${id}]`,
            BuildParameterPlaceholder: (i: number) => `@p${i}`,
            Entities: baseProvider?.Entities ?? [],
            EntityByName: () => undefined,
            CurrentUser: SUBMITTER_USER,
            GetEntityObject: async <T>(entityName: string): Promise<T> => {
                if (entityName === 'MJ: Tasks') {
                    return store.createTaskWrapper() as T;
                }
                if (entityName === 'MJ: Task Dependencies') {
                    return store.createDepWrapper() as T;
                }
                throw new Error(`Unexpected entity requested: ${entityName}`);
            },
            RunView: async (params: RunViewParams) => store.runView(params),
            RunViews: async (items: RunViewParams[]) => items.map((item) => store.runView(item)),
            ExecuteSQL: async (sql: string, values?: ReadonlyArray<string | number | boolean | Date | null>) =>
                store.executeSQL(sql, values ?? []),
        };
        return provider as IMetadataProvider;
    }

    private createTaskWrapper(initial?: StoredTaskRow): MJTaskEntity {
        const row: StoredTaskRow = initial
            ? { ...initial }
            : {
                  ID: '',
                  ParentID: null,
                  TypeID: WORKFLOW_TYPE_ID,
                  EnvironmentID: ENV_ID,
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
                  DueAt: null,
                  CorrelationKey: null,
                  NextAttemptAt: null,
                  AttemptCount: 0,
                  PercentComplete: 0,
                  ErrorMessage: null,
                  InputPayload: null,
                  OutputPayload: null,
                  Configuration: null,
                  SecurityEnvelope: null,
                  __mj_UpdatedAt: new Date(),
              };
        const store = this;
        const wrapper = {
            get ID() { return row.ID; },
            set ID(v: string) { row.ID = v; },
            get ParentID() { return row.ParentID; },
            set ParentID(v: string | null) { row.ParentID = v; },
            get TypeID() { return row.TypeID; },
            set TypeID(v: string) { row.TypeID = v; },
            get EnvironmentID() { return row.EnvironmentID; },
            set EnvironmentID(v: string) { row.EnvironmentID = v; },
            get Name() { return row.Name; },
            set Name(v: string) { row.Name = v; },
            get Description() { return row.Description; },
            set Description(v: string | null) { row.Description = v; },
            get Status() { return row.Status; },
            set Status(v: MJTaskEntity['Status']) { row.Status = v; },
            get StepType() { return row.StepType; },
            set StepType(v: MJTaskEntity['StepType']) { row.StepType = v; },
            get ActionID() { return row.ActionID; },
            set ActionID(v: string | null) { row.ActionID = v; },
            get AgentID() { return row.AgentID; },
            set AgentID(v: string | null) { row.AgentID = v; },
            get PromptID() { return row.PromptID; },
            set PromptID(v: string | null) { row.PromptID = v; },
            get UserID() { return row.UserID; },
            set UserID(v: string | null) { row.UserID = v; },
            get AgentRunID() { return row.AgentRunID; },
            set AgentRunID(v: string | null) { row.AgentRunID = v; },
            get ConversationDetailID() { return row.ConversationDetailID; },
            set ConversationDetailID(v: string | null) { row.ConversationDetailID = v; },
            get ClaimedBy() { return row.ClaimedBy; },
            set ClaimedBy(v: string | null) { row.ClaimedBy = v; },
            get ClaimExpiresAt() { return row.ClaimExpiresAt; },
            set ClaimExpiresAt(v: Date | null) { row.ClaimExpiresAt = v; },
            get StartedAt() { return row.StartedAt; },
            set StartedAt(v: Date | null) { row.StartedAt = v; },
            get CompletedAt() { return row.CompletedAt; },
            set CompletedAt(v: Date | null) { row.CompletedAt = v; },
            get DueAt() { return row.DueAt; },
            set DueAt(v: Date | null) { row.DueAt = v; },
            get CorrelationKey() { return row.CorrelationKey; },
            set CorrelationKey(v: string | null) { row.CorrelationKey = v; },
            get NextAttemptAt() { return row.NextAttemptAt; },
            set NextAttemptAt(v: Date | null) { row.NextAttemptAt = v; },
            get AttemptCount() { return row.AttemptCount; },
            set AttemptCount(v: number) { row.AttemptCount = v; },
            get PercentComplete() { return row.PercentComplete; },
            set PercentComplete(v: number) { row.PercentComplete = v; },
            get ErrorMessage() { return row.ErrorMessage; },
            set ErrorMessage(v: string | null) { row.ErrorMessage = v; },
            get InputPayload() { return row.InputPayload; },
            set InputPayload(v: string | null) { row.InputPayload = v; },
            get OutputPayload() { return row.OutputPayload; },
            set OutputPayload(v: string | null) { row.OutputPayload = v; },
            get Configuration() { return row.Configuration; },
            set Configuration(v: string | null) { row.Configuration = v; },
            get SecurityEnvelope() { return row.SecurityEnvelope; },
            set SecurityEnvelope(v: string | null) { row.SecurityEnvelope = v; },
            get __mj_UpdatedAt() { return row.__mj_UpdatedAt; },
            get ConfigurationObject() {
                if (!row.Configuration) return null;
                try {
                    return JSON.parse(row.Configuration) as MJTaskEntity['ConfigurationObject'];
                } catch {
                    return null;
                }
            },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => {
                if (!row.ID) row.ID = randomUUID();
                return true;
            },
            Load: async (id: string) => {
                const found = store.GetRow(id);
                if (!found) return false;
                Object.assign(row, found);
                return true;
            },
            Save: async () => {
                if (!row.ID) row.ID = randomUUID();
                row.__mj_UpdatedAt = new Date();
                store.Tasks.set(row.ID.toLowerCase(), { ...row });
                return true;
            },
        };
        return wrapper as MJTaskEntity;
    }

    private createDepWrapper(): MJTaskDependencyEntity {
        const dep: StoredDepRow = {
            ID: '',
            TaskID: '',
            DependsOnTaskID: '',
            DependencyType: 'Prerequisite',
            Condition: null,
            ExclusiveGroup: null,
            Priority: 0,
            Sequence: 0,
        };
        const store = this;
        const wrapper = {
            get ID() { return dep.ID; },
            set ID(v: string) { dep.ID = v; },
            get TaskID() { return dep.TaskID; },
            set TaskID(v: string) { dep.TaskID = v; },
            get DependsOnTaskID() { return dep.DependsOnTaskID; },
            set DependsOnTaskID(v: string) { dep.DependsOnTaskID = v; },
            get DependencyType() { return dep.DependencyType; },
            set DependencyType(v: MJTaskDependencyEntity['DependencyType']) { dep.DependencyType = v; },
            get Condition() { return dep.Condition; },
            set Condition(v: string | null) { dep.Condition = v; },
            get ExclusiveGroup() { return dep.ExclusiveGroup; },
            set ExclusiveGroup(v: string | null) { dep.ExclusiveGroup = v; },
            get Priority() { return dep.Priority; },
            set Priority(v: number) { dep.Priority = v; },
            get Sequence() { return dep.Sequence; },
            set Sequence(v: number) { dep.Sequence = v; },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => {
                if (!dep.ID) dep.ID = randomUUID();
                return true;
            },
            Save: async () => {
                if (!dep.ID) dep.ID = randomUUID();
                store.Deps.push({ ...dep });
                return true;
            },
        };
        return wrapper as MJTaskDependencyEntity;
    }

    private runView(params: RunViewParams): { Success: boolean; Results: object[] } {
        const filter = params.ExtraFilter ?? '';
        if (params.EntityName === 'MJ: Task Types') {
            return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID, Name: 'Orchestrated Workflow' }] };
        }
        if (params.EntityName === 'MJ: Actions') {
            return {
                Success: true,
                Results: Object.entries(ACTION_IDS).map(([Name, ID]) => ({ ID, Name, Status: 'Active', IsIdempotent: true })),
            };
        }
        if (params.EntityName === 'MJ: AI Agents') {
            return {
                Success: true,
                Results: Object.entries(AGENT_IDS).map(([Name, ID]) => ({ ID, Name, Status: 'Active' })),
            };
        }
        if (params.EntityName === 'MJ: AI Prompts') {
            return {
                Success: true,
                Results: Object.entries(PROMPT_IDS).map(([Name, ID]) => ({ ID, Name, Status: 'Active' })),
            };
        }
        if (params.EntityName === 'MJ: Task Dependencies') {
            const idsMatch = /TaskID IN \(([^)]+)\)/.exec(filter);
            if (!idsMatch) return { Success: true, Results: [...this.Deps] };
            const ids = new Set(idsMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase()));
            return { Success: true, Results: this.Deps.filter((d) => ids.has(d.TaskID.toLowerCase())) };
        }
        if (params.EntityName === 'MJ: Tasks') {
            if (filter.includes('ParentID IS NOT NULL') && filter.includes("Status IN ('Pending','In Progress')")) {
                const seen = new Set<string>();
                const rows: Array<{ ParentID: string }> = [];
                for (const t of this.Tasks.values()) {
                    if (t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress') && !seen.has(t.ParentID.toLowerCase())) {
                        seen.add(t.ParentID.toLowerCase());
                        rows.push({ ParentID: t.ParentID });
                    }
                }
                return { Success: true, Results: rows };
            }
            if (filter.includes('ParentID IS NULL') && filter.includes("Status IN ('Complete','Failed','Cancelled')")) {
                const parents = [...this.Tasks.values()].filter(
                    (t) => !t.ParentID && (t.Status === 'Complete' || t.Status === 'Failed' || t.Status === 'Cancelled'),
                );
                return { Success: true, Results: parents.map((p) => this.createTaskWrapper(p)) };
            }
            if (filter.includes('ParentID IS NULL') && filter.includes("Status IN ('Pending','In Progress')")) {
                return {
                    Success: true,
                    Results: [...this.Tasks.values()]
                        .filter((t) => !t.ParentID && (t.Status === 'Pending' || t.Status === 'In Progress'))
                        .map((p) => ({ ID: p.ID })),
                };
            }
            const corrMatch = /CorrelationKey='([^']+)'/.exec(filter);
            if (corrMatch?.[1]) {
                const targetKey = corrMatch[1];
                const stepMatch = /StepType='([^']+)'/.exec(filter);
                const matches = [...this.Tasks.values()].filter(
                    (t) => t.CorrelationKey === targetKey && (!stepMatch || t.StepType === stepMatch[1]),
                );
                return { Success: true, Results: matches.map((m) => this.createTaskWrapper(m)) };
            }
            const parentMatch = /ParentID='([^']+)'/.exec(filter);
            if (parentMatch?.[1]) {
                const pid = parentMatch[1].toLowerCase();
                const children = [...this.Tasks.values()].filter((t) => t.ParentID?.toLowerCase() === pid);
                return {
                    Success: true,
                    Results: params.ResultType === 'simple'
                        ? children
                        : children.map((c) => this.createTaskWrapper(c)),
                };
            }
            const idMatch = /\bID='([^']+)'/.exec(filter);
            if (idMatch?.[1]) {
                const found = this.GetRow(idMatch[1]);
                return { Success: true, Results: found ? [this.createTaskWrapper(found)] : [] };
            }
            return { Success: true, Results: [] };
        }
        return { Success: true, Results: [] };
    }

    private executeSQL(sql: string, args: ReadonlyArray<string | number | boolean | Date | null>): object[] {
        if (sql.includes('spTaskGraphClaimTask')) {
            const [taskId, claimedBy, ttlSec] = args as [string, string, number];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending' || row.ClaimedBy === WAITING_STEP_MARKER) {
                return [{ AffectedRows: 0 }];
            }
            if (row.NextAttemptAt && row.NextAttemptAt.getTime() > Date.now()) {
                return [{ AffectedRows: 0 }];
            }
            row.Status = 'In Progress';
            row.ClaimedBy = claimedBy;
            // Convert claim TTL seconds to milliseconds (1s = 1000ms).
            row.ClaimExpiresAt = new Date(Date.now() + Number(ttlSec || 60) * 1000);
            row.StartedAt = row.StartedAt ?? new Date();
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphCompleteClaimed')) {
            const [taskId, claimedBy, status, outputPayload, errorMessage, agentRunID, configuration, setConfiguration] =
                args as [string, string, MJTaskEntity['Status'], string | null, string | null, string | null, string | null, boolean];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'In Progress' || row.ClaimedBy !== claimedBy) {
                return [{ AffectedRows: 0 }];
            }
            row.Status = status;
            row.OutputPayload = outputPayload;
            row.ErrorMessage = errorMessage;
            row.AgentRunID = agentRunID;
            if (setConfiguration) row.Configuration = configuration;
            row.ClaimedBy = null;
            row.ClaimExpiresAt = null;
            row.CompletedAt = new Date();
            row.PercentComplete = status === 'Complete' ? 100 : 0;
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphScheduleRetry')) {
            const [taskId, claimedBy, maxAttempts, delayMs, errorMessage] = args as [string, string, number, number, string | null];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'In Progress' || row.ClaimedBy !== claimedBy || row.AttemptCount >= maxAttempts) {
                return [{ AffectedRows: 0 }];
            }
            row.Status = 'Pending';
            row.ClaimedBy = null;
            row.ClaimExpiresAt = null;
            row.AttemptCount += 1;
            row.NextAttemptAt = new Date(Date.now() + Number(delayMs || 0));
            row.ErrorMessage = errorMessage;
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphSkipPending')) {
            const [taskId] = args as [string];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending') return [{ AffectedRows: 0 }];
            row.Status = 'Skipped';
            row.CompletedAt = new Date();
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphCancelTask')) {
            const [taskId] = args as [string];
            const row = this.GetRow(taskId);
            if (!row || TERMINAL_STATUSES.has(row.Status)) return [{ AffectedRows: 0 }];
            row.Status = 'Cancelled';
            row.ClaimedBy = null;
            row.ClaimExpiresAt = null;
            row.CompletedAt = new Date();
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphMarkWaiting')) {
            const [taskId, marker, dueAt, correlationKey, payloadAtStart, inputTainted] = args as [
                string,
                string,
                Date | null,
                string | null,
                string | null,
                boolean,
            ];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending' || row.ClaimedBy) {
                return [{ AffectedRows: 0 }];
            }
            row.ClaimedBy = marker;
            row.DueAt = dueAt;
            row.CorrelationKey = correlationKey ?? row.CorrelationKey;
            const cfg = parseJsonObject(row.Configuration);
            const rt = parseJsonObject(cfg['runtime']);
            rt['payloadAtStart'] = payloadAtStart ? parseJsonObject(payloadAtStart) : undefined;
            rt['isInputTainted'] = inputTainted;
            cfg['runtime'] = rt;
            row.Configuration = JSON.stringify(cfg);
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphCompleteWaitingStep')) {
            const [taskId, marker, status, outputPayload, errorMessage, signalJson, outputTainted] = args as [
                string,
                string,
                MJTaskEntity['Status'],
                string | null,
                string | null,
                string,
                boolean,
            ];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending') {
                return [{ AffectedRows: 0, Outcome: 'Refused' }];
            }
            const cfg = parseJsonObject(row.Configuration);
            const rt = parseJsonObject(cfg['runtime']);
            if (row.ClaimedBy === marker) {
                row.Status = status;
                row.OutputPayload = outputPayload;
                row.ErrorMessage = errorMessage;
                row.ClaimedBy = null;
                row.CompletedAt = new Date();
                row.PercentComplete = status === 'Complete' ? 100 : 0;
                rt['isOutputTainted'] = outputTainted;
                delete rt['pendingSignal'];
                cfg['runtime'] = rt;
                row.Configuration = JSON.stringify(cfg);
                row.__mj_UpdatedAt = new Date();
                return [{ AffectedRows: 1, Outcome: 'Completed' }];
            }
            if (!rt['pendingSignal']) {
                rt['pendingSignal'] = parseJsonObject(signalJson);
                cfg['runtime'] = rt;
                row.Configuration = JSON.stringify(cfg);
                row.__mj_UpdatedAt = new Date();
                return [{ AffectedRows: 1, Outcome: 'Buffered' }];
            }
            return [{ AffectedRows: 0, Outcome: 'Refused' }];
        }
        if (sql.includes('spTaskGraphCompleteDueWait')) {
            const [taskId, marker, outputPayload, outputTainted] = args as [string, string, string, boolean];
            const row = this.GetRow(taskId);
            if (!row || row.Status !== 'Pending' || row.ClaimedBy !== marker) {
                return [{ AffectedRows: 0 }];
            }
            if (row.DueAt && row.DueAt.getTime() > Date.now()) {
                return [{ AffectedRows: 0 }];
            }
            row.Status = 'Complete';
            row.OutputPayload = outputPayload;
            row.ClaimedBy = null;
            row.CompletedAt = new Date();
            row.PercentComplete = 100;
            const cfg = parseJsonObject(row.Configuration);
            const rt = parseJsonObject(cfg['runtime']);
            rt['isOutputTainted'] = outputTainted;
            cfg['runtime'] = rt;
            row.Configuration = JSON.stringify(cfg);
            row.__mj_UpdatedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphExpireWaitingSteps')) {
            return [];
        }
        if (sql.includes('spTaskGraphStampParentStart')) {
            const [parentId, startedAt] = args as [string, Date];
            const row = this.GetRow(parentId);
            if (!row || row.StartedAt) return [{ AffectedRows: 0 }];
            row.StartedAt = startedAt;
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphUpdateParentProgress')) {
            const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
            const row = this.GetRow(parentId);
            if (!row || TERMINAL_STATUSES.has(row.Status)) return [{ AffectedRows: 0 }];
            row.Status = status;
            row.PercentComplete = pct;
            return [{ AffectedRows: 1 }];
        }
        if (sql.includes('spTaskGraphSettleParent')) {
            const [parentId, status, pct] = args as [string, MJTaskEntity['Status'], number];
            const row = this.GetRow(parentId);
            if (!row || TERMINAL_STATUSES.has(row.Status)) return [{ AffectedRows: 0 }];
            row.Status = status;
            row.PercentComplete = pct;
            row.CompletedAt = new Date();
            return [{ AffectedRows: 1 }];
        }
        return [{ AffectedRows: 1 }];
    }
}

interface IsolationInvocationRecord {
    readonly Level: TaskGraphIsolationLevel;
    readonly TaskName: string;
    readonly TimeoutMs?: number;
}

/**
 * Wraps the real `CreateDefaultIsolationRunners()` so every task execution runs through the real
 * `InProcessIsolationRunner` / `WorkerIsolationRunner` while recording which runner handled each step.
 */
function createInstrumentedRealRunners(records: IsolationInvocationRecord[]): TaskGraphIsolationRunnerMap {
    const real = CreateDefaultIsolationRunners();
    const wrap = (runner: TaskGraphIsolationRunner): TaskGraphIsolationRunner => ({
        Level: runner.Level,
        Execute: async <TOutcome extends TaskGraphIsolationStepOutcome = TaskGraphIsolationStepOutcome>(
            request: TaskGraphIsolationRunRequest<TOutcome>,
        ): Promise<TaskGraphIsolationExecutionResult<TOutcome>> => {
            records.push({
                Level: runner.Level,
                TaskName: request.TaskName,
                TimeoutMs: request.TimeoutMs,
            });
            return runner.Execute(request);
        },
    });
    return {
        InProcess: wrap(real.InProcess!),
        Worker: wrap(real.Worker!),
        Process: wrap(real.Process!),
        Container: wrap(real.Container!),
    };
}

interface ParityRunSnapshot {
    readonly PersistedIsolation: TaskGraphIsolationLevel | undefined;
    readonly ParentStatus: MJTaskEntity['Status'];
    readonly ChildSnapshots: ReadonlyArray<{
        readonly Name: string;
        readonly Status: MJTaskEntity['Status'];
        readonly AttemptCount: number;
        readonly Output: Record<string, unknown> | null;
        readonly ErrorMessage: string | null;
        readonly IsOutputTainted: boolean | undefined;
    }>;
    readonly RunnerLevelsUsed: readonly TaskGraphIsolationLevel[];
    readonly ObservedTimeouts: Readonly<Record<string, number | undefined>>;
    readonly ObservedUserIDs: Readonly<Record<string, string>>;
    readonly ObservedEnvelopes: Readonly<Record<string, TaskSecurityEnvelope | undefined>>;
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, onTick?: () => void): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        onTick?.();
        await new Promise((r) => setTimeout(r, POLL_WAIT_INTERVAL_MS));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for parity task graph to settle.`);
}

describe('TaskGraph Isolation Default & Worker vs InProcess Behavioral Parity', () => {
    const activeDispatchers: TaskGraphDispatcher[] = [];

    beforeEach(() => {
        vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockResolvedValue(true);
        vi.spyOn(AIAgentPermissionHelper, 'FilterRunnableAgents').mockImplementation(async (agents) => agents);
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(true);
        vi.spyOn(AIEngine.Instance, 'GetAgentConfigurationPresets').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'FindActiveAgentConfigurationPreset').mockReturnValue(undefined);
    });

    afterEach(async () => {
        while (activeDispatchers.length > 0) {
            const d = activeDispatchers.pop();
            if (d) await d.Stop();
        }
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        vi.restoreAllMocks();
    });

    async function executeGraphInMode(args: {
        Spec: TaskGraphSpec;
        Isolation?: TaskGraphIsolationLevel;
        SecurityEnvelope?: TaskSecurityEnvelope;
        FlakyPromptFailures?: number;
        AfterSubmit?: (ctx: {
            Store: ParityTaskGraphStore;
            Provider: IMetadataProvider;
            ParentTaskID: string;
            Dispatcher: TaskGraphDispatcher;
        }) => Promise<void>;
    }): Promise<ParityRunSnapshot> {
        const store = new ParityTaskGraphStore();
        const provider = store.CreateProvider();
        const isolationRecords: IsolationInvocationRecord[] = [];
        const observedUserIDs: Record<string, string> = {};
        const observedEnvelopes: Record<string, TaskSecurityEnvelope | undefined> = {};

        let remainingFlakyFailures = args.FlakyPromptFailures ?? 0;

        const actionRunner: TaskActionRunner = {
            EnforcesSecurityEnvelope: true,
            RunActionForTask: async (params: TaskActionRunParams): Promise<TaskActionRunResult> => {
                const taskRow = store.GetRow(params.TaskID);
                const stepName = taskRow?.Name ?? params.TaskID;
                observedUserIDs[stepName] = params.ContextUser.ID;
                observedEnvelopes[stepName] = params.SecurityEnvelope;
                const input = parseJsonObject(params.InputPayload);

                if (params.ActionID === ACTION_IDS.FetchRecord) {
                    return {
                        Success: true,
                        Output: {
                            customerId: input['customerId'] ?? 'cust-42',
                            tier: input['tier'] ?? 'premium',
                            baseAmount: 100,
                        },
                    };
                }
                if (params.ActionID === ACTION_IDS.TransformData) {
                    const base = Number(input['amount'] ?? 0);
                    return {
                        Success: true,
                        Output: { totalAmount: base * 2, transformed: true },
                    };
                }
                if (params.ActionID === ACTION_IDS.LeftBranch) {
                    return { Success: true, Output: { leftScore: 10, fromLeft: true } };
                }
                if (params.ActionID === ACTION_IDS.RightBranch) {
                    return { Success: true, Output: { rightScore: 32, fromRight: true } };
                }
                if (params.ActionID === ACTION_IDS.MergeResults) {
                    const left = Number(input['left'] ?? 0);
                    const right = Number(input['right'] ?? 0);
                    return { Success: true, Output: { combined: left + right } };
                }
                if (params.ActionID === ACTION_IDS.PremiumPath) {
                    return { Success: true, Output: { chosenPlan: 'premium', discountPct: 20 } };
                }
                if (params.ActionID === ACTION_IDS.StandardPath) {
                    return { Success: true, Output: { chosenPlan: 'standard', discountPct: 0 } };
                }
                if (params.ActionID === ACTION_IDS.StandardFollowUp) {
                    return { Success: true, Output: { followUpRan: true } };
                }
                if (params.ActionID === ACTION_IDS.FailingStep) {
                    return { Success: false, ErrorMessage: 'simulated action failure' };
                }
                if (params.ActionID === ACTION_IDS.RecoveryStep) {
                    return { Success: true, Output: { recovered: true } };
                }
                return { Success: true, Output: { ok: true } };
            },
        };

        const agentRunner: TaskAgentRunner = {
            EnforcesSecurityEnvelope: true,
            RunAgentForTask: async (params: TaskAgentRunParams): Promise<TaskAgentRunResult> => {
                const taskRow = store.GetRow(params.TaskID);
                const stepName = taskRow?.Name ?? params.TaskID;
                observedUserIDs[stepName] = params.ContextUser.ID;
                observedEnvelopes[stepName] = params.SecurityEnvelope;

                const mergedDeps: Record<string, unknown> = {};
                for (const out of params.DependencyOutputs.values()) {
                    if (out && typeof out === 'object' && !Array.isArray(out)) {
                        Object.assign(mergedDeps, out);
                    }
                }
                return {
                    Success: true,
                    AgentRunID: null,
                    Output: {
                        agentCompleted: true,
                        seenKeys: Object.keys(mergedDeps).sort(),
                        tierSeen: mergedDeps['tier'] ?? null,
                        signalSeen: mergedDeps['approved'] ?? null,
                    },
                };
            },
        };

        const promptRunner: TaskPromptRunner = {
            RunPromptForTask: async (params: TaskPromptRunParams): Promise<TaskPromptRunResult> => {
                const taskRow = store.GetRow(params.TaskID);
                const stepName = taskRow?.Name ?? params.TaskID;
                observedUserIDs[stepName] = params.ContextUser.ID;
                observedEnvelopes[stepName] = params.SecurityEnvelope;
                const input = parseJsonObject(params.InputPayload);

                if (params.PromptID === PROMPT_IDS.FlakyPrompt && remainingFlakyFailures > 0) {
                    remainingFlakyFailures -= 1;
                    return { Success: false, ErrorMessage: 'transient prompt failure' };
                }
                return {
                    Success: true,
                    Output: {
                        summaryReady: true,
                        totalSeen: input['totalAmount'] ?? null,
                    },
                };
            },
        };

        const specToSubmit: TaskGraphSpec = args.Isolation
            ? { ...args.Spec, isolation: args.Isolation }
            : args.Spec;

        const submitted = await new TaskGraphService().Submit(specToSubmit, {
            EnvironmentID: ENV_ID,
            ContextUser: SUBMITTER_USER,
            Provider: provider,
            ...(args.SecurityEnvelope ? { SecurityEnvelope: args.SecurityEnvelope } : {}),
        });
        expect(submitted.Success).toBe(true);
        expect(submitted.ParentTaskID).toBeTruthy();

        const parentID = submitted.ParentTaskID!;
        const parentAtSubmit = store.GetRow(parentID);
        const persistedIsolation = ParseTaskGraphParentMetadata(parentAtSubmit?.InputPayload).isolation;

        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            DAEMON_USER,
            {
                InstanceID: `parity-${args.Isolation ?? 'default'}-${randomUUID().slice(0, 8)}`,
                PollIntervalSeconds: 0.05,
                ReconciliationIntervalSeconds: 3600,
                RetryBackoffBaseMs: 25,
                MaxConcurrentTasks: 4,
                IsolationRunners: createInstrumentedRealRunners(isolationRecords),
            },
            undefined,
            undefined,
            actionRunner,
            promptRunner,
        );
        activeDispatchers.push(dispatcher);
        await dispatcher.Start();

        if (args.AfterSubmit) {
            await args.AfterSubmit({ Store: store, Provider: provider, ParentTaskID: parentID, Dispatcher: dispatcher });
        }

        await waitUntil(
            () => {
                const parent = store.GetRow(parentID);
                return !!parent && TERMINAL_STATUSES.has(parent.Status);
            },
            10_000,
            () => dispatcher.Kick(),
        );

        const settledParent = store.GetRow(parentID)!;
        const children = store.GetChildren(parentID);
        const observedTimeouts: Record<string, number | undefined> = {};
        for (const rec of isolationRecords) {
            observedTimeouts[rec.TaskName] = rec.TimeoutMs;
        }

        return {
            PersistedIsolation: persistedIsolation,
            ParentStatus: settledParent.Status,
            ChildSnapshots: children.map((c) => {
                const cfg = parseJsonObject(c.Configuration);
                const rt = parseJsonObject(cfg['runtime']);
                return {
                    Name: c.Name,
                    Status: c.Status,
                    AttemptCount: c.AttemptCount,
                    Output: c.OutputPayload ? parseJsonObject(c.OutputPayload) : null,
                    ErrorMessage: c.ErrorMessage,
                    IsOutputTainted: typeof rt['isOutputTainted'] === 'boolean' ? rt['isOutputTainted'] : undefined,
                };
            }),
            RunnerLevelsUsed: isolationRecords.map((r) => r.Level),
            ObservedTimeouts: observedTimeouts,
            ObservedUserIDs: observedUserIDs,
            ObservedEnvelopes: observedEnvelopes,
        };
    }

    it('defaults model-written task graphs (no isolation field) to Worker while honoring explicit InProcess and MjConfig opt-ins', async () => {
        const modelWrittenSpec: TaskGraphSpec = {
            workflowName: 'Model-Written Default Isolation Check',
            continuation: 'none',
            tasks: [
                TaskNode.Action(
                    { tempId: 's1', name: 'Step 1', description: 'Fetch', dependsOn: [] },
                    { actionName: 'FetchRecord' },
                ),
            ],
        };

        // 1. Default (model omits isolation) -> Worker
        const defaultRun = await executeGraphInMode({ Spec: modelWrittenSpec });
        expect(defaultRun.PersistedIsolation).toBe('Worker');
        expect(defaultRun.ParentStatus).toBe('Complete');
        expect(defaultRun.RunnerLevelsUsed).toEqual(['Worker']);

        // 2. Explicit opt-in on spec -> InProcess
        const optInRun = await executeGraphInMode({ Spec: modelWrittenSpec, Isolation: 'InProcess' });
        expect(optInRun.PersistedIsolation).toBe('InProcess');
        expect(optInRun.ParentStatus).toBe('Complete');
        expect(optInRun.RunnerLevelsUsed).toEqual(['InProcess']);

        // 3. Host mj.config.cjs override -> InProcess
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            Isolation: { DefaultIsolation: 'InProcess' },
        });
        const hostOverrideRun = await executeGraphInMode({ Spec: modelWrittenSpec });
        expect(hostOverrideRun.PersistedIsolation).toBe('InProcess');
        expect(hostOverrideRun.ParentStatus).toBe('Complete');
        expect(hostOverrideRun.RunnerLevelsUsed).toEqual(['InProcess']);
    });

    it('matches Worker and InProcess behavior identically for sequential pipelines with input/output mappings', async () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Sequential Pipeline Parity',
            continuation: 'none',
            tasks: [
                TaskNode.Action(
                    { tempId: 'fetch', name: '1-Fetch', description: 'Fetch record', dependsOn: [] },
                    {
                        actionName: 'FetchRecord',
                        inputMapping: JSON.stringify({ customerId: 'cust-99', tier: 'premium' }),
                        outputMapping: JSON.stringify({ customerId: 'customerId', tier: 'tier', baseAmount: 'baseAmount' }),
                    },
                ),
                TaskNode.Action(
                    { tempId: 'transform', name: '2-Transform', description: 'Double amount', dependsOn: ['fetch'] },
                    {
                        actionName: 'TransformData',
                        inputMapping: JSON.stringify({ amount: 'payload.baseAmount' }),
                        outputMapping: JSON.stringify({ totalAmount: 'totalAmount', transformed: 'transformed' }),
                    },
                ),
                TaskNode.Prompt(
                    { tempId: 'summarize', name: '3-Summarize', description: 'Summarize', dependsOn: ['transform'] },
                    { promptName: 'SummarizePrompt' },
                ),
            ],
        };

        const workerRun = await executeGraphInMode({ Spec: spec });
        const inProcessRun = await executeGraphInMode({ Spec: spec, Isolation: 'InProcess' });

        expect(workerRun.PersistedIsolation).toBe('Worker');
        expect(workerRun.RunnerLevelsUsed).toEqual(['Worker', 'Worker', 'Worker']);
        expect(inProcessRun.RunnerLevelsUsed).toEqual(['InProcess', 'InProcess', 'InProcess']);

        expect(workerRun.ParentStatus).toBe('Complete');
        expect(workerRun.ParentStatus).toBe(inProcessRun.ParentStatus);
        expect(workerRun.ChildSnapshots).toEqual(inProcessRun.ChildSnapshots);
        expect(workerRun.ChildSnapshots[2].Output?.['totalSeen']).toBe(200);
    });

    it('matches Worker and InProcess behavior identically for parallel fan-out and diamond join', async () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Diamond Fan-Out Join Parity',
            continuation: 'none',
            tasks: [
                TaskNode.Action(
                    { tempId: 'root', name: '0-Root', description: 'Seed', dependsOn: [] },
                    { actionName: 'FetchRecord' },
                ),
                TaskNode.Action(
                    { tempId: 'left', name: '1-Left', description: 'Left branch', dependsOn: ['root'] },
                    { actionName: 'LeftBranch', outputMapping: JSON.stringify({ leftScore: 'leftScore' }) },
                ),
                TaskNode.Action(
                    { tempId: 'right', name: '1-Right', description: 'Right branch', dependsOn: ['root'] },
                    { actionName: 'RightBranch', outputMapping: JSON.stringify({ rightScore: 'rightScore' }) },
                ),
                TaskNode.Action(
                    { tempId: 'join', name: '2-Join', description: 'Merge', dependsOn: ['left', 'right'] },
                    {
                        actionName: 'MergeResults',
                        inputMapping: JSON.stringify({ left: 'payload.leftScore', right: 'payload.rightScore' }),
                        outputMapping: JSON.stringify({ combined: 'combined' }),
                    },
                ),
            ],
        };

        const workerRun = await executeGraphInMode({ Spec: spec });
        const inProcessRun = await executeGraphInMode({ Spec: spec, Isolation: 'InProcess' });

        expect(workerRun.RunnerLevelsUsed).toEqual(['Worker', 'Worker', 'Worker', 'Worker']);
        expect(inProcessRun.RunnerLevelsUsed).toEqual(['InProcess', 'InProcess', 'InProcess', 'InProcess']);
        expect(workerRun.ParentStatus).toBe('Complete');
        expect(workerRun.ParentStatus).toBe(inProcessRun.ParentStatus);
        expect(workerRun.ChildSnapshots).toEqual(inProcessRun.ChildSnapshots);
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '2-Join')?.Output?.['combined']).toBe(42);
    });

    it('matches Worker and InProcess behavior identically for conditional exclusive-group switch branching and skip cascade', async () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Exclusive Switch Branching Parity',
            continuation: 'none',
            tasks: [
                TaskNode.Action(
                    { tempId: 'classify', name: '0-Classify', description: 'Classify', dependsOn: [] },
                    {
                        actionName: 'FetchRecord',
                        inputMapping: JSON.stringify({ tier: 'premium' }),
                        outputMapping: JSON.stringify({ tier: 'tier' }),
                    },
                ),
                TaskNode.Action(
                    {
                        tempId: 'premium',
                        name: '1-Premium',
                        description: 'Premium branch',
                        dependsOn: [{ tempId: 'classify', condition: "payload.tier === 'premium'", exclusiveGroup: 'tier-fork', priority: 10, sequence: 1 }],
                    },
                    { actionName: 'PremiumPath', outputMapping: JSON.stringify({ chosenPlan: 'chosenPlan', discountPct: 'discountPct' }) },
                ),
                TaskNode.Action(
                    {
                        tempId: 'standard',
                        name: '1-Standard',
                        description: 'Standard branch',
                        dependsOn: [{ tempId: 'classify', condition: "payload.tier !== 'premium'", exclusiveGroup: 'tier-fork', priority: 5, sequence: 2 }],
                    },
                    { actionName: 'StandardPath', outputMapping: JSON.stringify({ chosenPlan: 'chosenPlan' }) },
                ),
                TaskNode.Action(
                    {
                        tempId: 'standard-child',
                        name: '2-StandardFollowUp',
                        description: 'Cascade-skipped descendant',
                        dependsOn: ['standard'],
                    },
                    { actionName: 'StandardFollowUp' },
                ),
                TaskNode.Agent(
                    { tempId: 'join', name: '3-SummaryAgent', description: 'Post-fork join', dependsOn: ['premium', 'standard-child'] },
                    { agentName: 'SummaryAgent' },
                ),
            ],
        };

        const workerRun = await executeGraphInMode({ Spec: spec });
        const inProcessRun = await executeGraphInMode({ Spec: spec, Isolation: 'InProcess' });

        expect(workerRun.ParentStatus).toBe('Complete');
        expect(workerRun.ParentStatus).toBe(inProcessRun.ParentStatus);
        expect(workerRun.ChildSnapshots).toEqual(inProcessRun.ChildSnapshots);
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '1-Premium')?.Status).toBe('Complete');
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '1-Standard')?.Status).toBe('Skipped');
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '2-StandardFollowUp')?.Status).toBe('Skipped');
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '3-SummaryAgent')?.Status).toBe('Complete');
        expect(workerRun.RunnerLevelsUsed.every((l) => l === 'Worker')).toBe(true);
        expect(inProcessRun.RunnerLevelsUsed.every((l) => l === 'InProcess')).toBe(true);
    });

    it('matches Worker and InProcess behavior identically for failureSemantics (block vs edges) and durable retries', async () => {
        // 1. failureSemantics: 'block'
        const blockSpec: TaskGraphSpec = {
            workflowName: 'Block Failure Parity',
            continuation: 'none',
            failureSemantics: 'block',
            tasks: [
                TaskNode.Action({ tempId: 'boom', name: '0-Boom', description: 'Fails', dependsOn: [] }, { actionName: 'FailingStep' }),
                TaskNode.Action({ tempId: 'after', name: '1-After', description: 'Blocked', dependsOn: ['boom'] }, { actionName: 'RecoveryStep' }),
            ],
        };
        const workerBlock = await executeGraphInMode({ Spec: blockSpec });
        const inProcessBlock = await executeGraphInMode({ Spec: blockSpec, Isolation: 'InProcess' });
        expect(workerBlock.ParentStatus).toBe('Failed');
        expect(workerBlock.ParentStatus).toBe(inProcessBlock.ParentStatus);
        expect(workerBlock.ChildSnapshots).toEqual(inProcessBlock.ChildSnapshots);

        // 2. failureSemantics: 'edges' recovery route
        const recoverySpec: TaskGraphSpec = {
            workflowName: 'Edge Recovery Parity',
            continuation: 'none',
            failureSemantics: 'edges',
            tasks: [
                TaskNode.Action({ tempId: 'boom', name: '0-Boom', description: 'Fails', dependsOn: [] }, { actionName: 'FailingStep' }),
                TaskNode.Action(
                    {
                        tempId: 'recover',
                        name: '1-Recover',
                        description: 'Recovers on failure edge',
                        dependsOn: [{ tempId: 'boom', condition: "stepResult.step === 'Failed'" }],
                    },
                    { actionName: 'RecoveryStep' },
                ),
            ],
        };
        const workerRecovery = await executeGraphInMode({ Spec: recoverySpec });
        const inProcessRecovery = await executeGraphInMode({ Spec: recoverySpec, Isolation: 'InProcess' });
        expect(workerRecovery.ParentStatus).toBe(inProcessRecovery.ParentStatus);
        expect(workerRecovery.ChildSnapshots).toEqual(inProcessRecovery.ChildSnapshots);
        expect(workerRecovery.ChildSnapshots.find((c) => c.Name === '1-Recover')?.Status).toBe('Complete');

        // 3. Durable retry on flaky Prompt step
        const retrySpec: TaskGraphSpec = {
            workflowName: 'Durable Retry Parity',
            continuation: 'none',
            tasks: [
                TaskNode.Prompt(
                    {
                        tempId: 'flaky',
                        name: '0-FlakyPrompt',
                        description: 'Fails once then succeeds',
                        dependsOn: [],
                        policy: { retryCount: 2, timeoutSeconds: 45 },
                    },
                    { promptName: 'FlakyPrompt' },
                ),
            ],
        };
        const workerRetry = await executeGraphInMode({ Spec: retrySpec, FlakyPromptFailures: 1 });
        const inProcessRetry = await executeGraphInMode({ Spec: retrySpec, Isolation: 'InProcess', FlakyPromptFailures: 1 });
        expect(workerRetry.ParentStatus).toBe('Complete');
        expect(workerRetry.ParentStatus).toBe(inProcessRetry.ParentStatus);
        expect(workerRetry.ChildSnapshots).toEqual(inProcessRetry.ChildSnapshots);
        expect(workerRetry.ChildSnapshots[0].AttemptCount).toBe(1);
        expect(workerRetry.ObservedTimeouts['0-FlakyPrompt']).toBe(45_000);
        expect(inProcessRetry.ObservedTimeouts['0-FlakyPrompt']).toBe(45_000);
    });

    it('matches Worker and InProcess behavior identically for Wait + External waiting steps, ExecutionUser, and SecurityEnvelope taint/tenant propagation', async () => {
        const correlationKey = `parity-signal-${randomUUID().slice(0, 8)}`;
        const envelope: TaskSecurityEnvelope = {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            IsRunTainted: false,
            RunScope: { PrimaryScopeEntityName: 'Accounts', PrimaryScopeRecordID: 'acct-777', SecondaryScopes: null },
            BoundActionParams: { FetchRecord: { customerId: 'bound-cust-1' } },
        };

        const buildSpec = (key: string): TaskGraphSpec => ({
            workflowName: 'Waiting + Security Parity',
            continuation: 'none',
            tasks: [
                TaskNode.Action(
                    { tempId: 'a1', name: '0-Fetch', description: 'Initial fetch', dependsOn: [] },
                    { actionName: 'FetchRecord', outputMapping: JSON.stringify({ tier: 'tier' }) },
                ),
                TaskNode.Wait(
                    { tempId: 'w1', name: '1-ShortWait', description: 'Zero-second wait', dependsOn: ['a1'] },
                    { until: new Date(Date.now() - 1_000).toISOString() },
                ),
                TaskNode.External(
                    { tempId: 'x1', name: '2-AwaitExternal', description: 'Await signal', dependsOn: ['w1'] },
                    { domain: 'parity', correlationKey: key },
                ),
                TaskNode.Agent(
                    { tempId: 'ag1', name: '3-AfterSignal', description: 'Consume signal', dependsOn: ['x1'] },
                    { agentName: 'SummaryAgent' },
                ),
            ],
        });

        const signalExternalWhenReached = (key: string) => async ({
            Store,
            Provider,
            ParentTaskID,
            Dispatcher,
        }: {
            Store: ParityTaskGraphStore;
            Provider: IMetadataProvider;
            ParentTaskID: string;
            Dispatcher: TaskGraphDispatcher;
        }): Promise<void> => {
            await waitUntil(
                () => {
                    const ext = Store.GetChildren(ParentTaskID).find((c) => c.Name === '2-AwaitExternal');
                    return ext?.ClaimedBy === WAITING_STEP_MARKER;
                },
                5_000,
                () => Dispatcher.Kick(),
            );
            const sig = await TaskGraphWaitingSteps.CompleteWaitingStep(
                { CorrelationKey: key, Payload: { approved: true } },
                Provider,
                SUBMITTER_USER,
            );
            expect(sig.Success).toBe(true);
            expect(sig.Completed).toHaveLength(1);
            Dispatcher.Kick();
        };

        const workerKey = `${correlationKey}-worker`;
        const inProcessKey = `${correlationKey}-inprocess`;

        const workerRun = await executeGraphInMode({
            Spec: buildSpec(workerKey),
            SecurityEnvelope: envelope,
            AfterSubmit: signalExternalWhenReached(workerKey),
        });
        const inProcessRun = await executeGraphInMode({
            Spec: buildSpec(inProcessKey),
            Isolation: 'InProcess',
            SecurityEnvelope: envelope,
            AfterSubmit: signalExternalWhenReached(inProcessKey),
        });

        expect(workerRun.ParentStatus).toBe('Complete');
        expect(workerRun.ParentStatus).toBe(inProcessRun.ParentStatus);
        // Compare child statuses, taint propagation, and downstream output (excluding wall-clock waitedUntil timestamp)
        const stripWaitedUntil = (snap: ParityRunSnapshot['ChildSnapshots'][number]) => ({
            ...snap,
            Output: snap.Output
                ? Object.fromEntries(Object.entries(snap.Output).filter(([k]) => k !== 'waitedUntil'))
                : null,
        });
        expect(workerRun.ChildSnapshots.map(stripWaitedUntil)).toEqual(inProcessRun.ChildSnapshots.map(stripWaitedUntil));
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '0-Fetch')?.IsOutputTainted).toBe(false);
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '3-AfterSignal')?.IsOutputTainted).toBe(true);
        expect(workerRun.ChildSnapshots.find((c) => c.Name === '3-AfterSignal')?.Output?.['signalSeen']).toBe(true);

        // SecurityEnvelope & ExecutionUser parity
        expect(workerRun.ObservedUserIDs).toEqual(inProcessRun.ObservedUserIDs);
        expect(workerRun.ObservedEnvelopes).toEqual(inProcessRun.ObservedEnvelopes);
        expect(workerRun.ObservedEnvelopes['0-Fetch']?.RunScope?.PrimaryScopeRecordID).toBe('acct-777');
        expect(workerRun.ObservedEnvelopes['3-AfterSignal']?.IsRunTainted).toBe(true);
    });

    it('matches Worker and InProcess behavior identically for cancellation of active graphs', async () => {
        const cancelSpec: TaskGraphSpec = {
            workflowName: 'Cancel Parity Graph',
            continuation: 'none',
            tasks: [
                TaskNode.External(
                    { tempId: 'wait-forever', name: '0-ExternalWait', description: 'Stays pending until cancelled', dependsOn: [] },
                    { domain: 'parity', correlationKey: 'never-signalled' },
                ),
                TaskNode.Action(
                    { tempId: 'downstream', name: '1-Downstream', description: 'Never runs', dependsOn: ['wait-forever'] },
                    { actionName: 'FetchRecord' },
                ),
            ],
        };

        const runCancel = async (isolation?: TaskGraphIsolationLevel) => {
            const store = new ParityTaskGraphStore();
            const provider = store.CreateProvider();
            const submitted = await new TaskGraphService().Submit(
                isolation ? { ...cancelSpec, isolation } : cancelSpec,
                { EnvironmentID: ENV_ID, ContextUser: SUBMITTER_USER, Provider: provider },
            );
            expect(submitted.Success).toBe(true);
            const cancelResult = await new TaskGraphService().Cancel(submitted.ParentTaskID!, {
                EnvironmentID: ENV_ID,
                ContextUser: SUBMITTER_USER,
                Provider: provider,
            });
            return {
                PersistedIsolation: ParseTaskGraphParentMetadata(store.GetRow(submitted.ParentTaskID!)?.InputPayload).isolation,
                CancelSuccess: cancelResult.Success,
                Cancelled: cancelResult.Cancelled,
                ParentStatus: store.GetRow(submitted.ParentTaskID!)?.Status,
                ChildStatuses: store.GetChildren(submitted.ParentTaskID!).map((c) => [c.Name, c.Status]),
            };
        };

        const workerCancel = await runCancel();
        const inProcessCancel = await runCancel('InProcess');
        expect(workerCancel.PersistedIsolation).toBe('Worker');
        expect(inProcessCancel.PersistedIsolation).toBe('InProcess');
        expect(workerCancel.CancelSuccess).toBe(true);
        expect(workerCancel.Cancelled).toBe(true);
        expect(workerCancel.ParentStatus).toBe(inProcessCancel.ParentStatus);
        expect(workerCancel.ChildStatuses).toEqual(inProcessCancel.ChildStatuses);
    });

    it('matches InlineScript output, strict-mode, and error behavior identically between WorkerIsolationRunner and InProcessIsolationRunner while cleaning up dangling timers', async () => {
        const inProcess = new InProcessIsolationRunner();
        const worker = new WorkerIsolationRunner();

        const cases: Array<{
            Name: string;
            Script: string;
            Input?: Record<string, unknown>;
            ExpectSuccess: boolean;
        }> = [
            {
                Name: 'sync object return',
                Script: 'return { sum: Number(input.a) + Number(input.b), label: String(input.label) };',
                Input: { a: 17, b: 25, label: 'parity' },
                ExpectSuccess: true,
            },
            {
                Name: 'async promise return',
                Script: 'await new Promise((r) => setTimeout(r, 10)); return { asyncOk: true, count: input.items.length };',
                Input: { items: [1, 2, 3] },
                ExpectSuccess: true,
            },
            {
                Name: 'primitive normalization',
                Script: 'return 12345;',
                ExpectSuccess: true,
            },
            {
                Name: 'array normalization',
                Script: 'return ["alpha", "beta"];',
                ExpectSuccess: true,
            },
            {
                Name: 'strict-mode undeclared assignment failure',
                Script: 'undeclaredStrictModeVar = 42; return { leaked: true };',
                ExpectSuccess: false,
            },
            {
                Name: 'thrown error propagation',
                Script: 'throw new Error("deterministic script failure");',
                ExpectSuccess: false,
            },
        ];

        for (const tc of cases) {
            const [ipRes, wRes] = await Promise.all([
                inProcess.Execute({
                    Level: 'InProcess',
                    TaskID: `ip-${tc.Name}`,
                    TaskName: tc.Name,
                    GraphID: 'inline-parity',
                    Workload: { Kind: 'InlineScript', Script: tc.Script, Input: tc.Input },
                }),
                worker.Execute({
                    Level: 'Worker',
                    TaskID: `w-${tc.Name}`,
                    TaskName: tc.Name,
                    GraphID: 'inline-parity',
                    Workload: { Kind: 'InlineScript', Script: tc.Script, Input: tc.Input },
                }),
            ]);

            expect(ipRes.Success, `${tc.Name} (InProcess)`).toBe(tc.ExpectSuccess);
            expect(wRes.Success, `${tc.Name} (Worker)`).toBe(tc.ExpectSuccess);
            expect(wRes.TerminationReason, `${tc.Name} termination reason`).toBe(ipRes.TerminationReason);
            if (tc.ExpectSuccess) {
                expect(wRes.Output, `${tc.Name} output parity`).toEqual(ipRes.Output);
            } else {
                expect(wRes.ErrorMessage, `${tc.Name} error parity`).toBe(ipRes.ErrorMessage);
            }
        }

        // Verify WorkerIsolationRunner terminates cleanly even when an InlineScript leaves a dangling interval handle
        const danglingResult = await worker.Execute({
            Level: 'Worker',
            TaskID: 'w-dangling-timer',
            TaskName: 'Dangling Timer Cleanup',
            GraphID: 'inline-parity',
            TimeoutMs: 5_000,
            Workload: {
                Kind: 'InlineScript',
                Script: 'setInterval(() => {}, 1000); return { cleanedUp: true };',
            },
        });
        expect(danglingResult.Success).toBe(true);
        expect(danglingResult.Output).toEqual({ cleanedUp: true });
    }, 20_000);
});
