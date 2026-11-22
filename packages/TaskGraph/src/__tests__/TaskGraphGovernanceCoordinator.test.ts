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
    type AuthorizationInfo,
    type ExecuteSQLOptions,
    type IMetadataProvider,
    type RunViewParams,
    type UserInfo,
} from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentUserPolicyEntity,
    MJAIPromptEntity,
    MJTaskDependencyEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    ExtractRunawayCheckpointFromRunData,
    type FastConvergenceJudgeResult,
    type MJAIAgentRunEntityExtended,
    type RunawayCheckpointState,
    type RunawayJsonObject,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '@memberjunction/ai-core-plus';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { TaskGraphDebugState } from '../debug-state';
import { ParseTaskGraphDebugState } from '../debug-state';
import type { TaskStepConfiguration } from '../decision-node';
import { TaskClaimStore } from '../TaskClaimStore';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { TaskGraphGovernanceCoordinator } from '../TaskGraphGovernanceCoordinator';
import type { LoopCursorSnapshot } from '../TaskLoopExecutor';
import { TaskGraphService } from '../TaskGraphService';
import type { TaskActionRunner, TaskAgentRunner, TaskGraphFrame, TaskPromptRunner } from '../types';

interface LoopTestActionInput {
    val?: string;
}

const capturedErrors: string[] = [];

type GovernanceLogArg = string | number | boolean | object | null | undefined;
type GovernanceSqlArg = string | number | boolean | Date | null | undefined;
type GovernanceRunViewRow =
    | { ID: string; Name: string; Status?: string }
    | { ParentID: string }
    | { ID: string }
    | { ID: string; Status: MJTaskEntity['Status']; StartedAt?: Date | null; Configuration: string | null }
    | {
          ID: string;
          ParentID: string | null;
          Status: MJTaskEntity['Status'];
          AgentRunID: string | null;
          StartedAt: Date | null;
          CompletedAt: Date | null;
          __mj_UpdatedAt: Date;
          Configuration: string | null;
      }
    | {
          ID: string;
          ParentID: string | null;
          TypeID: string;
          AgentRunID: string | null;
          UserID: string | null;
          Status: MJTaskEntity['Status'];
          StartedAt: Date | null;
          CompletedAt: Date | null;
          __mj_UpdatedAt: Date;
          InputPayload: string | null;
          Configuration: string | null;
      }
    | {
          ID: string;
          TypeID: string;
          AgentRunID: string | null;
          AgentID: string | null;
          UserID: string | null;
          Status: MJTaskEntity['Status'];
          StartedAt: Date | null;
          InputPayload: string | null;
          Configuration: string | null;
      }
    | StoredTaskRow
    | StoredDepRow
    | StoredAgentRunRow
    | StoredPromptRunRow
    | Partial<MJAIAgentEntity>
    | Partial<MJAIAgentUserPolicyEntity>
    | Partial<MJAIPromptEntity>
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
    SecurityEnvelope?: string | null;
    AttemptCount?: number;
    NextAttemptAt?: Date | null;
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
    TotalTokensUsed?: number | null;
    TotalTokensUsedRollup?: number | null;
    Data: string | null;
    Steps: MJAIAgentRunEntityExtended['Steps'];
}

interface StoredPromptRunRow {
    ID: string;
    PromptID: string;
    TotalCost: number | null;
    Cost?: number | null;
    TokensUsed: number | null;
    TokensUsedRollup?: number | null;
    TokensPrompt?: number | null;
    TokensCompletion?: number | null;
    Success: boolean;
}

interface GovernanceTestGlobalStore {
    ___SINGLETON__UserCache?: {
        Users: UserInfo[];
        FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
    };
}

class GovernanceInMemoryDb {
    public readonly Tasks = new Map<string, StoredTaskRow>();
    public readonly TasksByParent = new Map<string, StoredTaskRow[]>();
    public readonly DepsByTask = new Map<string, StoredDepRow[]>();
    public readonly AgentRuns = new Map<string, StoredAgentRunRow>();
    public readonly PromptRuns = new Map<string, StoredPromptRunRow>();
    public Agents: Array<Partial<MJAIAgentEntity>> = [];
    public Prompts: Array<Partial<MJAIPromptEntity>> = [];
    public UserPolicies: Array<Partial<MJAIAgentUserPolicyEntity>> = [];
    public Authorizations: AuthorizationInfo[] = [];
    public AgentRunSaveMode: 'ok' | 'false' | 'throw' = 'ok';
    public DebugWriteMode: 'ok' | 'false' | 'throw' = 'ok';
    public TaskSaveMode: 'ok' | 'false' | 'throw' = 'ok';
    private readonly dialect = new SQLServerDialect();

    public wrapTaskPublic(initial: StoredTaskRow): MJTaskEntity {
        return this.wrapTask(initial);
    }

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
                  SecurityEnvelope: null,
                  AttemptCount: 0,
                  NextAttemptAt: null,
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
            get ConfigurationObject() {
                if (!backing.Configuration) return null;
                try {
                    return JSON.parse(backing.Configuration) as MJTaskEntity['ConfigurationObject'];
                } catch {
                    return null;
                }
            },
            set ConfigurationObject(v: MJTaskEntity['ConfigurationObject'] | null) {
                backing.Configuration = v ? JSON.stringify(v) : null;
            },
            get SecurityEnvelope() { return backing.SecurityEnvelope ?? null; },
            set SecurityEnvelope(v: string | null) { backing.SecurityEnvelope = v; },
            get AttemptCount() { return backing.AttemptCount ?? 0; },
            set AttemptCount(v: number) { backing.AttemptCount = v; },
            get NextAttemptAt() { return backing.NextAttemptAt ?? null; },
            set NextAttemptAt(v: Date | null) { backing.NextAttemptAt = v; },
            get __mj_UpdatedAt() { return backing.__mj_UpdatedAt; },
            set __mj_UpdatedAt(v: Date) { backing.__mj_UpdatedAt = v; },
            LatestResult: { CompleteMessage: '' },
            NewRecord: () => true,
            Load: async (id: string) => {
                const found = db.Tasks.get(id.toLowerCase());
                if (!found) return false;
                Object.assign(backing, found);
                return true;
            },
            Save: async () => {
                if (db.TaskSaveMode === 'false') {
                    return false;
                }
                if (db.TaskSaveMode === 'throw') {
                    throw new Error('Simulated Task.Save failure');
                }
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
                if (db.TaskSaveMode === 'false') {
                    return false;
                }
                if (db.TaskSaveMode === 'throw') {
                    throw new Error('Simulated Task.Save failure');
                }
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
            Authorizations: db.Authorizations,
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
                    if (row.NextAttemptAt && row.NextAttemptAt.getTime() > Date.now()) return [{ AffectedRows: 0 }];
                    row.Status = 'In Progress';
                    row.ClaimedBy = claimedBy;
                    row.ClaimExpiresAt = new Date(Date.now() + Number(ttlSec || 60) * 1000);
                    row.StartedAt = row.StartedAt ?? new Date();
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphScheduleRetry')) {
                    const [taskId, claimedBy, maxAttempts, delayMs, errorMessage] =
                        args as [string, string, number, number, string | null];
                    const row = db.Tasks.get(taskId.toLowerCase());
                    const currentAttempt = row?.AttemptCount ?? 0;
                    if (!row || row.Status !== 'In Progress' || row.ClaimedBy !== claimedBy || currentAttempt >= maxAttempts) {
                        return [{ AffectedRows: 0 }];
                    }
                    row.Status = 'Pending';
                    row.ClaimedBy = null;
                    row.ClaimExpiresAt = null;
                    row.AttemptCount = currentAttempt + 1;
                    row.NextAttemptAt = new Date(Date.now() + Math.max(0, Number(delayMs || 0)));
                    row.ErrorMessage = errorMessage;
                    row.__mj_UpdatedAt = new Date();
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
                    const fields = JSON.parse(fieldsJson) as Array<{
                        Path: string;
                        Kind: string;
                        Value?: TaskGraphDebugState[keyof TaskGraphDebugState];
                    }>;
                    for (const field of fields) {
                        if (!field.Path.startsWith('$.debug.')) continue;
                        const prop = field.Path.slice('$.debug.'.length) as keyof TaskGraphDebugState;
                        if (field.Kind === 'null') {
                            Reflect.deleteProperty(debugBag, prop);
                        } else {
                            Reflect.set(debugBag, prop, field.Value);
                        }
                    }
                    payload.debug = debugBag;
                    row.InputPayload = JSON.stringify(payload);
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphConsumeStepMarker')) {
                    const [parentId] = args as [string, string];
                    const row = db.Tasks.get(parentId.toLowerCase());
                    if (!row || !row.InputPayload) return [{ AffectedRows: 0 }];
                    const payload = JSON.parse(row.InputPayload) as { debug?: TaskGraphDebugState };
                    if (!payload.debug || payload.debug.step == null) return [{ AffectedRows: 0 }];
                    Reflect.deleteProperty(payload.debug, 'step');
                    row.InputPayload = JSON.stringify(payload);
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphPauseAtBreakpoint')) {
                    const [parentId, breakpointTaskId] = args as [string, string, string];
                    const row = db.Tasks.get(parentId.toLowerCase());
                    if (!row) return [{ AffectedRows: 0 }];
                    const payload = row.InputPayload ? (JSON.parse(row.InputPayload) as { debug?: TaskGraphDebugState }) : {};
                    const debugBag: TaskGraphDebugState = payload.debug && typeof payload.debug === 'object'
                        ? { ...payload.debug }
                        : {};
                    if (debugBag.paused === true) return [{ AffectedRows: 0 }];
                    debugBag.paused = true;
                    debugBag.pausedReason = 'breakpoint';
                    debugBag.pausedAtTaskID = breakpointTaskId;
                    payload.debug = debugBag;
                    row.InputPayload = JSON.stringify(payload);
                    return [{ AffectedRows: 1 }];
                }
                if (sql.includes('spTaskGraphStampParentStart')) {
                    const [parentId, startedAt] = args as [string, Date];
                    const row = db.Tasks.get(parentId.toLowerCase());
                    if (!row || row.StartedAt != null) return [{ AffectedRows: 0 }];
                    row.StartedAt = startedAt instanceof Date ? startedAt : new Date(startedAt);
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
        if (params.EntityName === 'MJ: AI Prompts') {
            return { Success: true, Results: this.Prompts };
        }
        if (params.EntityName === 'MJ: AI Agent User Policies') {
            return { Success: true, Results: this.UserPolicies };
        }
        if (params.EntityName === 'MJ: AI Prompt Runs') {
            let rows = Array.from(this.PromptRuns.values());
            const inMatch = /\bID IN \(([^)]+)\)/.exec(filter);
            if (inMatch?.[1]) {
                const targetIds = new Set(
                    inMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase()),
                );
                rows = rows.filter((r) => targetIds.has(r.ID.toLowerCase()));
            }
            const idMatch = /\bID='([^']+)'/.exec(filter);
            if (idMatch?.[1]) {
                rows = rows.filter((r) => r.ID.toLowerCase() === idMatch[1].toLowerCase());
            }
            return { Success: true, Results: rows };
        }
        if (params.EntityName === 'MJ: AI Agent Runs') {
            let rows = Array.from(this.AgentRuns.values());
            const inMatch = /\bID IN \(([^)]+)\)/.exec(filter);
            if (inMatch?.[1]) {
                const targetIds = new Set(
                    inMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase()),
                );
                rows = rows.filter((r) => targetIds.has(r.ID.toLowerCase()));
            }
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
            if (filter.includes('ParentID IS NULL') && filter.includes('AgentRunID IS NULL')) {
                let rows = Array.from(this.Tasks.values()).filter((t) => !t.ParentID && !t.AgentRunID);
                if (filter.includes('InputPayload LIKE')) {
                    const routineLike = /InputPayload LIKE '%([^%']+)%'/.exec(filter);
                    if (routineLike?.[1] && !filter.includes('UserID=')) {
                        const needle = routineLike[1].replace(/\\(.)/g, '$1').toLowerCase();
                        rows = rows.filter((t) => (t.InputPayload ?? '').toLowerCase().includes(needle));
                    }
                }
                const userMatch = /UserID='([^']+)'/.exec(filter);
                if (userMatch?.[1]) {
                    const targetUser = userMatch[1].toLowerCase();
                    rows = rows.filter(
                        (t) =>
                            (t.UserID ?? '').toLowerCase() === targetUser ||
                            (t.InputPayload ?? '').toLowerCase().includes(targetUser),
                    );
                }
                const dayEndMatch = /StartedAt < '([^']+)'/.exec(filter);
                if (dayEndMatch?.[1]) {
                    const dayEndMs = Date.parse(dayEndMatch[1]);
                    rows = rows.filter((t) => !t.StartedAt || new Date(t.StartedAt).getTime() < dayEndMs);
                }
                const dayStartMatch = /CompletedAt >= '([^']+)'/.exec(filter);
                if (dayStartMatch?.[1]) {
                    const dayStartMs = Date.parse(dayStartMatch[1]);
                    rows = rows.filter(
                        (t) =>
                            !t.CompletedAt ||
                            new Date(t.CompletedAt).getTime() >= dayStartMs ||
                            new Date(t.__mj_UpdatedAt).getTime() >= dayStartMs,
                    );
                }
                return {
                    Success: true,
                    Results: params.ResultType === 'simple'
                        ? rows.map((t) => ({
                            ID: t.ID,
                            ParentID: t.ParentID,
                            TypeID: t.TypeID,
                            AgentRunID: t.AgentRunID,
                            UserID: t.UserID,
                            Status: t.Status,
                            StartedAt: t.StartedAt,
                            CompletedAt: t.CompletedAt,
                            __mj_UpdatedAt: t.__mj_UpdatedAt,
                            InputPayload: t.InputPayload,
                            Configuration: t.Configuration,
                        }))
                        : rows.map((t) => this.wrapTask(t)),
                };
            }
            const parentInMatch = /ParentID IN \(([^)]+)\)/.exec(filter);
            if (parentInMatch?.[1]) {
                const parentIds = new Set(
                    parentInMatch[1]
                        .split(',')
                        .map((s) => s.trim().replace(/^'|'$/g, '').toLowerCase()),
                );
                const children: StoredTaskRow[] = [];
                for (const pid of parentIds) {
                    const list = this.TasksByParent.get(pid);
                    if (list) children.push(...list);
                }
                return {
                    Success: true,
                    Results: params.ResultType === 'simple'
                        ? children.map((c) => ({
                            ID: c.ID,
                            ParentID: c.ParentID,
                            Status: c.Status,
                            AgentRunID: c.AgentRunID,
                            StartedAt: c.StartedAt,
                            CompletedAt: c.CompletedAt,
                            __mj_UpdatedAt: c.__mj_UpdatedAt,
                            Configuration: c.Configuration,
                        }))
                        : children.map((c) => this.wrapTask(c)),
                };
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
                            AgentRunID: c.AgentRunID,
                            StartedAt: c.StartedAt,
                            CompletedAt: c.CompletedAt,
                            __mj_UpdatedAt: c.__mj_UpdatedAt,
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
                                    StartedAt: single.StartedAt,
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

    it('CR-GRAPH-CHECKPOINT-SAVE-FAILURE: replacement dispatcher reconstructs PendingPauseContext from durable debug state, suppresses GraphPaused while storage fails, flushes checkpoint on recovery, and resumes remaining nodes', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runIdReplace = '50000000-0000-4000-8000-000000000033';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runIdReplace;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const agentRunner: TaskAgentRunner = { RunAgentForTask: async () => ({ Success: true }) };
        const executedDisp1: string[] = [];
        const framesDisp1: TaskGraphFrame[] = [];
        const runner1: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                executedDisp1.push(ctx.TaskID);
                return { Success: true, Output: { step: executedDisp1.length, disp: 1 }, CostUsd: 0.10, TokensUsed: 80 };
            },
        };

        // Fail AgentRun.Save() while root task debug write succeeds
        db.AgentRunSaveMode = 'false';
        db.DebugWriteMode = 'ok';

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-replace-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => framesDisp1.push(frame) },
            runner1,
        );

        let parentId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(buildLinearSpec(5, 'Replacement Dispatcher Checkpoint Recovery Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdReplace,
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;

            await waitUntil(
                () => disp1.Governance.HasPendingPausePersistence(parentId),
                5_000,
                () => disp1.Kick(),
            );
            expect(executedDisp1).toHaveLength(3);
            expect(framesDisp1.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(0);

            // Verify durable root task debug state recorded checkpointPersisted=false + pendingCheckpointContext
            const persistedDebug = ParseTaskGraphDebugState(db.Tasks.get(parentId.toLowerCase())?.InputPayload);
            expect(persistedDebug.paused).toBe(true);
            expect(persistedDebug.pausedReason).toBe('governance');
            expect(persistedDebug.checkpointPersisted).toBe(false);
            expect(persistedDebug.pendingCheckpointContext?.submittingAgentRunId).toBe(runIdReplace);
            expect(persistedDebug.pendingCheckpointContext?.completedTaskIds).toHaveLength(3);
            expect(persistedDebug.pendingCheckpointContext?.scope).toBe('PerRun');
        } finally {
            await disp1.Stop();
        }

        // Replace Dispatcher 1 / Coordinator 1 with a brand-new Dispatcher 2 / Coordinator 2 (zero in-memory state)
        const executedDisp2: string[] = [];
        const framesDisp2: TaskGraphFrame[] = [];
        const runner2: TaskActionRunner = {
            RunActionForTask: async (ctx) => {
                executedDisp2.push(ctx.TaskID);
                return { Success: true, Output: { step: executedDisp2.length, disp: 2 }, CostUsd: 0.10, TokensUsed: 80 };
            },
        };
        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            {
                InstanceID: 'gov-replace-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => framesDisp2.push(frame) },
            runner2,
        );

        await disp2.Start();
        try {
            // While AgentRun.Save() is still failing, Dispatcher 2 hydrates pending pause context,
            // keeps claiming blocked, and MUST NOT emit GraphPaused prematurely.
            await waitUntil(
                () => disp2.Governance.HasPendingPausePersistence(parentId),
                5_000,
                () => disp2.Kick(),
            );
            for (let i = 0; i < 4; i++) {
                disp2.Kick();
                await new Promise((r) => setTimeout(r, 25));
            }
            expect(executedDisp2).toHaveLength(0);
            expect(framesDisp2.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(0);
            expect(db.AgentRuns.get(runIdReplace.toLowerCase())?.Status).toBe('Running');

            const currentDebug = ParseTaskGraphDebugState(db.Tasks.get(parentId.toLowerCase())?.InputPayload);
            expect(await disp2.Governance.CanClaimTasks(provider, parentId, currentDebug, null, TEST_USER)).toBe(false);
            expect(
                await disp2.Governance.IsGraphBlockedByGovernance(provider, parentId, currentDebug, null, TEST_USER),
            ).toBe(true);

            // ApproveAndResumePausedGraph on Dispatcher 2 must fail closed while AgentRun.Save() is down
            const prematureApprove = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(prematureApprove.Success).toBe(false);
            expect(prematureApprove.Message).toContain('pause persistence is still pending');

            // Restore AgentRun storage -> Dispatcher 2 reconstructs & flushes checkpoint, flips checkpointPersisted=true,
            // and emits GraphPaused ONCE.
            db.AgentRunSaveMode = 'ok';
            await waitUntil(
                () =>
                    db.AgentRuns.get(runIdReplace.toLowerCase())?.Status === 'Paused' &&
                    framesDisp2.some((f) => f.Kind === 'GraphPaused'),
                5_000,
                () => disp2.Kick(),
            );
            expect(framesDisp2.filter((f) => f.Kind === 'GraphPaused')).toHaveLength(1);

            const flushedCp = ExtractRunawayCheckpointFromRunData(db.AgentRuns.get(runIdReplace.toLowerCase())?.Data);
            expect(flushedCp).not.toBeNull();
            expect(flushedCp?.CompletedNodeIDs).toHaveLength(3);
            expect(flushedCp?.CumulativeLedger.RunCostUsd).toBeCloseTo(0.30, 4);

            const syncedDebug = ParseTaskGraphDebugState(db.Tasks.get(parentId.toLowerCase())?.InputPayload);
            expect(syncedDebug.checkpointPersisted).toBe(true);
            expect(syncedDebug.pendingCheckpointContext).toBeUndefined();

            // Approve and resume remaining 2 nodes on Dispatcher 2 without replaying the first 3
            const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp2.Kick(),
            );
            expect(executedDisp1).toHaveLength(3);
            expect(executedDisp2).toHaveLength(2);
            expect(executedDisp2.every((id) => !executedDisp1.includes(id))).toBe(true);
        } finally {
            await disp2.Stop();
        }
    });

    it('CR-GRAPH-DEBUG-PAUSE-LATCH: keeps ordinary user and breakpoint pauses separate from governance latch so StepGraph and ResumeGraph complete remaining tasks without dispatcher restart', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const service = new TaskGraphService();
        const ctx = {
            EnvironmentID: 'env-1',
            Provider: provider,
            ContextUser: TEST_USER,
            LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 10.0 } } },
        };

        // Scenario A: PauseGraph (pausedReason: 'user') -> Poll -> StepGraph('one') -> ResumeGraph
        const subA = await service.Submit(buildLinearSpec(4, 'User Pause Step Resume Graph'), ctx);
        expect(subA.Success).toBe(true);
        const parentA = subA.ParentTaskID!;
        const pauseRes = await service.PauseGraph(parentA, ctx, TEST_USER.ID);
        expect(pauseRes.Success).toBe(true);
        expect(pauseRes.Debug?.pausedReason).toBe('user');

        const executedA: string[] = [];
        const framesA: TaskGraphFrame[] = [];
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'debug-pause-latch-test',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => framesA.push(frame) },
            {
                RunActionForTask: async (taskCtx) => {
                    executedA.push(taskCtx.TaskID);
                    return { Success: true, Output: { step: executedA.length }, CostUsd: 0.05, TokensUsed: 50 };
                },
            },
        );

        await dispatcher.Start();
        try {
            // Allow live PollAndDispatch ticks to observe the user-paused graph
            await waitUntil(
                () => framesA.some((f) => f.Kind === 'GraphPaused' && f.ParentTaskID === parentA && f.Reason === 'paused by user'),
                5_000,
                () => dispatcher.Kick(),
            );
            for (let i = 0; i < 3; i++) {
                dispatcher.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executedA).toHaveLength(0);
            expect(dispatcher.Governance.IsLocallyPaused(parentA)).toBe(false);
            expect(dispatcher.Governance.GetGraphDiagnostics(parentA)?.PausedByGovernance).toBe(false);
            expect(
                await dispatcher.Governance.CanClaimTasks(
                    provider,
                    parentA,
                    { paused: true, pausedReason: 'user' },
                    null,
                    TEST_USER,
                ),
            ).toBe(true);

            // Single-step one task without restarting the dispatcher
            const stepRes = await service.StepGraph(parentA, 'one', ctx);
            expect(stepRes.Success).toBe(true);
            await waitUntil(
                () => executedA.length === 1 && db.Tasks.get(executedA[0].toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispatcher.Kick(),
            );
            // Extra poll ticks while still paused must NOT claim step 2
            for (let i = 0; i < 3; i++) {
                dispatcher.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executedA).toHaveLength(1);
            expect(dispatcher.Governance.IsLocallyPaused(parentA)).toBe(false);

            // ResumeGraph without restarting the dispatcher -> remaining 3 tasks complete cleanly
            const resumeA = await service.ResumeGraph(parentA, ctx);
            expect(resumeA.Success).toBe(true);
            await waitUntil(
                () => db.Tasks.get(parentA.toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispatcher.Kick(),
            );
            expect(executedA).toHaveLength(4);
            expect(framesA.some((f) => f.Kind === 'GraphResumed' && f.ParentTaskID === parentA)).toBe(true);

            // Scenario B: Breakpoint pause (pausedReason: 'breakpoint') -> Poll -> StepGraph('one') -> ResumeGraph
            const subB = await service.Submit(buildLinearSpec(4, 'Breakpoint Step Resume Graph'), {
                ...ctx,
                Debug: { paused: true, pausedReason: 'user', pausedBy: TEST_USER.ID },
            });
            expect(subB.Success).toBe(true);
            const parentB = subB.ParentTaskID!;
            const childrenB = (db.TasksByParent.get(parentB.toLowerCase()) ?? []).slice();
            expect(childrenB).toHaveLength(4);
            const step2Id = childrenB[1].ID;

            const bpSet = await service.SetBreakpoints(parentB, [step2Id], ctx);
            expect(bpSet.Success).toBe(true);
            // Resume from initial submit pause so step-1 runs and hits breakpoint at step-2
            const initialResumeB = await service.ResumeGraph(parentB, ctx);
            expect(initialResumeB.Success).toBe(true);

            await waitUntil(
                () =>
                    framesA.some(
                        (f) => f.Kind === 'BreakpointHit' && f.ParentTaskID === parentB && f.TaskID === step2Id,
                    ),
                5_000,
                () => dispatcher.Kick(),
            );
            for (let i = 0; i < 3; i++) {
                dispatcher.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            // Only step-1 ran; step-2 is held at breakpoint
            expect(executedA).toHaveLength(5);
            expect(dispatcher.Governance.IsLocallyPaused(parentB)).toBe(false);
            expect(dispatcher.Governance.GetGraphDiagnostics(parentB)?.PausedByGovernance).toBe(false);
            expect(
                await dispatcher.Governance.CanClaimTasks(
                    provider,
                    parentB,
                    { paused: true, pausedReason: 'breakpoint', pausedAtTaskID: step2Id },
                    null,
                    TEST_USER,
                ),
            ).toBe(true);

            // Single-step across the breakpointed task (step-2)
            const stepB = await service.StepGraph(parentB, 'one', ctx);
            expect(stepB.Success).toBe(true);
            await waitUntil(
                () => executedA.length === 6 && db.Tasks.get(step2Id.toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispatcher.Kick(),
            );
            for (let i = 0; i < 3; i++) {
                dispatcher.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executedA).toHaveLength(6);

            // ResumeGraph completes step-3 and step-4
            const resumeB = await service.ResumeGraph(parentB, ctx);
            expect(resumeB.Success).toBe(true);
            await waitUntil(
                () => db.Tasks.get(parentB.toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispatcher.Kick(),
            );
            expect(executedA).toHaveLength(8);
        } finally {
            await dispatcher.Stop();
        }
    });

    it('CR-GRAPH-DEBUG-PAUSE-LATCH: actual governance pauses still block claiming until ApproveAndResumePausedGraph, and stale local PausedByGovernance clears once durable resume lands', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runIdGov = '50000000-0000-4000-8000-000000000044';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runIdGov;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const executed: string[] = [];
        const frames: TaskGraphFrame[] = [];
        const disp = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'gov-pause-still-blocks',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => frames.push(frame) },
            {
                RunActionForTask: async (ctx) => {
                    executed.push(ctx.TaskID);
                    return { Success: true, Output: { step: executed.length }, CostUsd: 0.15, TokensUsed: 100 };
                },
            },
        );

        await disp.Start();
        try {
            const service = new TaskGraphService();
            const ctx = {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdGov,
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
            };
            const subRes = await service.Submit(buildLinearSpec(4, 'Governance Pause Blocks Step/Resume Graph'), ctx);
            expect(subRes.Success).toBe(true);
            const parentId = subRes.ParentTaskID!;

            await waitUntil(
                () => disp.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true,
                5_000,
                () => disp.Kick(),
            );
            expect(executed).toHaveLength(2);
            expect(disp.Governance.IsLocallyPaused(parentId)).toBe(true);

            // Ordinary StepGraph and ResumeGraph MUST NOT bypass a governance pause with an unapproved checkpoint
            await service.StepGraph(parentId, 'one', ctx);
            for (let i = 0; i < 3; i++) {
                disp.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executed).toHaveLength(2);

            await service.ResumeGraph(parentId, ctx);
            for (let i = 0; i < 3; i++) {
                disp.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executed).toHaveLength(2);
            expect(disp.Governance.IsLocallyPaused(parentId)).toBe(true);
            expect(
                await disp.Governance.IsGraphBlockedByGovernance(provider, parentId, {}, null, TEST_USER),
            ).toBe(true);

            // External ApproveAndResumePausedGraph on a separate coordinator clears durable pause + approves checkpoint
            const externalCoord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('external-approver'));
            const approveRes = await externalCoord.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(approveRes.Success).toBe(true);

            // Active dispatcher detects cleared durable pause, clears stale local PausedByGovernance, and completes remaining nodes
            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp.Kick(),
            );
            expect(executed).toHaveLength(4);
            expect(disp.Governance.IsLocallyPaused(parentId)).toBe(false);
        } finally {
            await disp.Stop();
        }
    });

    it('CR-GRAPH-STANDALONE-GOVERNANCE-RESUME-BYPASS: blocks ordinary ResumeGraph, StepGraph, and PauseGraph on standalone graphs without SubmittingAgentRunID until ApproveAndResumePausedGraph clears durable markers', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const executed: string[] = [];
        const frames: TaskGraphFrame[] = [];
        const disp = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'standalone-gov-resume-bypass',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (frame) => frames.push(frame) },
            {
                RunActionForTask: async (ctx) => {
                    executed.push(ctx.TaskID);
                    return { Success: true, Output: { step: executed.length }, CostUsd: 0.15, TokensUsed: 100 };
                },
            },
        );

        await disp.Start();
        try {
            const service = new TaskGraphService();
            const ctx = {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                // Standalone graph: NO AgentRunID (SubmittingAgentRunID is null)
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
            };
            const subRes = await service.Submit(buildLinearSpec(5, 'Standalone Governance Pause Graph'), ctx);
            expect(subRes.Success).toBe(true);
            const parentId = subRes.ParentTaskID!;

            await waitUntil(
                () =>
                    disp.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    frames.some((f) => f.Kind === 'GraphPaused' && f.ParentTaskID === parentId),
                5_000,
                () => disp.Kick(),
            );
            expect(executed).toHaveLength(2);
            expect(disp.Governance.IsLocallyPaused(parentId)).toBe(true);

            // Verify durable root task $.debug and Configuration checkpoint state
            const pausedRow = db.Tasks.get(parentId.toLowerCase())!;
            const pausedDebug = ParseTaskGraphDebugState(pausedRow.InputPayload);
            expect(pausedDebug.paused).toBe(true);
            expect(pausedDebug.pausedReason).toBe('governance');
            expect(pausedDebug.governancePauseActive).toBe(true);
            expect(pausedDebug.checkpointPersisted).toBe(true);
            expect(pausedDebug.pendingCheckpointContext).not.toBeNull();
            expect(pausedRow.Configuration).toContain('"governanceCheckpoint"');
            expect(pausedRow.Configuration).toContain('"Status":"Paused"');

            // Ordinary ResumeGraph, StepGraph, and PauseGraph MUST fail and NOT clear durable governance markers
            const resumeBlocked = await service.ResumeGraph(parentId, ctx);
            expect(resumeBlocked.Success).toBe(false);
            const stepBlocked = await service.StepGraph(parentId, 'one', ctx);
            expect(stepBlocked.Success).toBe(false);
            const pauseBlocked = await service.PauseGraph(parentId, ctx, TEST_USER.ID);
            expect(pauseBlocked.Success).toBe(false);

            for (let i = 0; i < 6; i++) {
                disp.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executed).toHaveLength(2);
            expect(disp.Governance.IsLocallyPaused(parentId)).toBe(true);

            // Even if an external write strips $.debug.paused/pausedReason while governancePauseActive or Configuration checkpoint remains,
            // reconcileClearedDurablePause MUST keep PausedByGovernance=true and block claiming.
            const rawPayload = JSON.parse(pausedRow.InputPayload!) as { debug: RunawayJsonObject };
            delete rawPayload.debug['paused'];
            delete rawPayload.debug['pausedReason'];
            pausedRow.InputPayload = JSON.stringify(rawPayload);
            expect(
                await disp.Governance.IsGraphBlockedByGovernance(
                    provider,
                    parentId,
                    ParseTaskGraphDebugState(pausedRow.InputPayload),
                    null,
                    TEST_USER,
                ),
            ).toBe(true);
            for (let i = 0; i < 4; i++) {
                disp.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(executed).toHaveLength(2);

            // Non-owner user cannot approve and resume
            const otherUser = {
                ID: '99999999-9999-4999-8999-999999999999',
                Name: 'Unauthorized User',
                Email: 'unauth@example.com',
                Type: 'User',
                IsActive: true,
            } as UserInfo;
            const externalCoord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('standalone-approver'));
            const deniedApprove = await externalCoord.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: otherUser,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(deniedApprove.Success).toBe(false);
            expect(executed).toHaveLength(2);

            // Authorized owner approves with a budget extension via external coordinator -> persists to root Configuration and clears $.debug via ClearDebugPauseFields
            const approveRes = await externalCoord.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
                DecisionNotes: 'Approved standalone graph extension',
            });
            expect(approveRes.Success).toBe(true);
            expect(approveRes.ExtendedBudgets?.PerRun.MaxCostUsd).toBe(1.0);

            const clearedDebug = ParseTaskGraphDebugState(db.Tasks.get(parentId.toLowerCase())?.InputPayload);
            expect(clearedDebug.paused).toBeUndefined();
            expect(clearedDebug.pausedReason).toBeUndefined();
            expect(clearedDebug.governancePauseActive).toBeUndefined();
            expect(clearedDebug.pendingCheckpointContext).toBeUndefined();
            expect(db.Tasks.get(parentId.toLowerCase())?.Configuration).toContain('"Status":"Approved"');

            // Active dispatcher detects cleared durable pause, hydrates extended budget, and completes remaining 3 tasks
            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp.Kick(),
            );
            expect(executed).toHaveLength(5);
            expect(disp.Governance.IsLocallyPaused(parentId)).toBe(false);
        } finally {
            await disp.Stop();
        }
    });

    it('CR-LOOP-GOVERNANCE-WIRING (sequential ForEach): pauses loop mid-execution on budget breach without failing/completing task, persists durable cursor, and completes remaining items on replacement worker without replay', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runIdLoopSeq = '50000000-0000-4000-8000-000000000051';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runIdLoopSeq;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const seenIterationsDisp1: string[] = [];
        const seenIterationsDisp2: string[] = [];
        const frames1: TaskGraphFrame[] = [];

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-seq-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            { OnFrame: (f) => frames1.push(f) },
            {
                RunActionForTask: async (ctx) => {
                    const p = ctx.InputPayload as LoopTestActionInput;
                    seenIterationsDisp1.push(p.val ?? '');
                    return {
                        Success: true,
                        Output: { processed: p.val },
                        CostUsd: 0.10,
                        TokensUsed: 100,
                    };
                },
            },
        );

        const spec: TaskGraphSpec = {
            workflowName: 'Sequential ForEach Governance Graph',
            tasks: [
                {
                    tempId: 'loop-seq',
                    name: 'Sequential Loop Step',
                    description: 'ForEach over 5 items',
                    kind: 'ForEach',
                    configuration: {
                        collectionPath: 'static:["A","B","C","D","E"]',
                        itemVariable: 'item',
                        indexVariable: 'idx',
                        action: {
                            name: 'StepAction',
                            params: { val: 'item' },
                        },
                    },
                },
            ],
        };

        let parentId = '';
        let loopTaskId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(spec, {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdLoopSeq,
                LimitsOverride: {
                    Budgets: {
                        PerRun: { MaxCostUsd: 0.25, MaxWallClockMs: 60_000 },
                        AllowedInFlightOvershootUsd: 0,
                    },
                },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;
            const children = db.TasksByParent.get(parentId.toLowerCase()) ?? [];
            expect(children).toHaveLength(1);
            loopTaskId = children[0].ID;

            await waitUntil(
                () =>
                    disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    db.Tasks.get(loopTaskId.toLowerCase())?.Status === 'Pending',
                5_000,
                () => disp1.Kick(),
            );

            // Budget ($0.25) tripped after 3 items ($0.30); items D & E must NOT have run.
            expect(seenIterationsDisp1).toEqual(['A', 'B', 'C']);
            const pausedTask = db.Tasks.get(loopTaskId.toLowerCase())!;
            expect(pausedTask.Status).toBe('Pending');
            expect(pausedTask.ClaimedBy).toBeNull();
            const pausedCfg = JSON.parse(pausedTask.Configuration!) as {
                runtime?: {
                    governanceCostUsd?: number;
                    loopCursor?: {
                        AccumulatedCostUsd: number;
                        Cursor: LoopCursorSnapshot;
                    };
                };
            };
            expect(pausedCfg.runtime?.loopCursor?.Cursor.NextIterationIndex).toBe(3);
            expect(pausedCfg.runtime?.loopCursor?.Cursor.CompletedIndices).toEqual([0, 1, 2]);
            expect(pausedCfg.runtime?.loopCursor?.AccumulatedCostUsd).toBeCloseTo(0.30, 5);
            expect(frames1.some((f) => f.Kind === 'TaskCompleted' || f.Kind === 'TaskFailed')).toBe(false);
        } finally {
            await disp1.Stop();
        }

        // Replacement worker (fresh Governance coordinator, zero in-memory state)
        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-seq-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async (ctx) => {
                    const p = ctx.InputPayload as LoopTestActionInput;
                    seenIterationsDisp2.push(p.val ?? '');
                    return {
                        Success: true,
                        Output: { processed: p.val },
                        CostUsd: 0.10,
                        TokensUsed: 100,
                    };
                },
            },
        );

        const settlementSpy = vi.spyOn(disp2.Governance, 'RecordNodeSettlementAndEvaluate');
        await disp2.Start();
        try {
            const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp2.Kick(),
            );

            // Replacement worker executed ONLY remaining items D & E without replaying A, B, C!
            expect(seenIterationsDisp2).toEqual(['D', 'E']);
            const completedLoop = db.Tasks.get(loopTaskId.toLowerCase())!;
            expect(completedLoop.Status).toBe('Complete');
            const out = JSON.parse(completedLoop.OutputPayload!) as { results: Array<{ processed: string }> };
            expect(out.results.map((r) => r.processed)).toEqual(['A', 'B', 'C', 'D', 'E']);
            const finalCfg = JSON.parse(completedLoop.Configuration!) as {
                runtime?: { loopCursor?: NonNullable<TaskStepConfiguration['runtime']>['loopCursor']; iterations?: Array<{ cost?: number }> };
            };
            expect(finalCfg.runtime?.loopCursor).toBeUndefined();
            expect(finalCfg.runtime?.iterations).toHaveLength(5);
            const settled = await settlementSpy.mock.results[0]?.value;
            expect(settled?.Ledger?.RunCostUsd).toBeCloseTo(0.50, 5);
        } finally {
            await disp2.Stop();
        }
    });

    it('CR-LOOP-GOVERNANCE-WIRING (While loop): pauses spinning While loop on ProgressStalled with durable cursor and resumes cleanly on replacement worker after approval', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runIdWhile = '50000000-0000-4000-8000-000000000052';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runIdWhile;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const disp1Calls: number[] = [];
        const disp2Calls: number[] = [];

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-while-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async () => {
                    disp1Calls.push(disp1Calls.length);
                    // Identical non-progressing response triggers DeterministicProgressDetector stall
                    return {
                        Success: true,
                        Output: { waiting: true, status: 'unchanged' },
                        CostUsd: 0.02,
                        TokensUsed: 500,
                    };
                },
            },
        );

        const spec: TaskGraphSpec = {
            workflowName: 'While Loop Progress Stall Graph',
            tasks: [
                {
                    tempId: 'loop-while',
                    name: 'While Polling Step',
                    description: 'While loop subject to progress stall',
                    kind: 'While',
                    configuration: {
                        condition: 'payload.done !== true',
                        maxIterations: 50,
                        action: {
                            name: 'StepAction',
                            params: {},
                        },
                    },
                },
            ],
        };

        let parentId = '';
        let loopTaskId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(spec, {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdWhile,
                LimitsOverride: {
                    Budgets: { PerRun: { MaxCostUsd: 10.0 } },
                    ProgressDetector: {
                        Enabled: true,
                        MinIterationsBeforeCheck: 4,
                        WindowSize: 4,
                        NoPayloadDeltaWindowCount: 3,
                        FastJudgeEnabled: false,
                    },
                },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;
            loopTaskId = (db.TasksByParent.get(parentId.toLowerCase()) ?? [])[0].ID;

            await waitUntil(
                () =>
                    disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    db.Tasks.get(loopTaskId.toLowerCase())?.Status === 'Pending',
                5_000,
                () => disp1.Kick(),
            );

            // Paused early at iteration 4 instead of spinning to 50
            expect(disp1Calls).toHaveLength(4);
            expect(disp1.Governance.GetGraphDiagnostics(parentId)?.LastProgressResult?.Classification).toBe('Stalled');
            const pausedTask = db.Tasks.get(loopTaskId.toLowerCase())!;
            expect(pausedTask.Status).toBe('Pending');
            const pausedCfg = JSON.parse(pausedTask.Configuration!) as {
                runtime?: { loopCursor?: { Cursor: { LoopType: string; NextIterationIndex: number; CompletedIndices: number[] } } };
            };
            expect(pausedCfg.runtime?.loopCursor?.Cursor.LoopType).toBe('While');
            expect(pausedCfg.runtime?.loopCursor?.Cursor.NextIterationIndex).toBe(4);
            expect(pausedCfg.runtime?.loopCursor?.Cursor.CompletedIndices).toEqual([0, 1, 2, 3]);
        } finally {
            await disp1.Stop();
        }

        // Replacement worker now returns progressing result that flips `done: true`
        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-while-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async () => {
                    const idx = disp2Calls.length;
                    disp2Calls.push(idx);
                    return {
                        Success: true,
                        Output: idx === 0 ? { progress: 'step-5' } : { done: true, progress: 'finished' },
                        CostUsd: 0.02,
                        TokensUsed: 100,
                    };
                },
            },
        );

        await disp2.Start();
        try {
            const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { ResetProgressDetectorWindow: true },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp2.Kick(),
            );

            expect(disp2Calls).toHaveLength(2);
            const completedLoop = db.Tasks.get(loopTaskId.toLowerCase())!;
            expect(completedLoop.Status).toBe('Complete');
            const out = JSON.parse(completedLoop.OutputPayload!) as { iterations: number; results: Array<{ progress?: string; done?: boolean }> };
            expect(out.iterations).toBe(6);
            expect(out.results).toHaveLength(6);
        } finally {
            await disp2.Stop();
        }
    });

    it('CR-LOOP-GOVERNANCE-WIRING (parallel ForEach): pauses between parallel batches on budget breach, persists cursor across worker replacement, and completes remaining items without replaying completed indices', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runIdParallel = '50000000-0000-4000-8000-000000000053';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runIdParallel;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const disp1Items: string[] = [];
        const disp2Items: string[] = [];

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-par-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async (ctx) => {
                    const p = ctx.InputPayload as LoopTestActionInput;
                    disp1Items.push(p.val ?? '');
                    return {
                        Success: true,
                        Output: { item: p.val },
                        CostUsd: 0.10,
                        TokensUsed: 100,
                    };
                },
            },
        );

        const spec: TaskGraphSpec = {
            workflowName: 'Parallel ForEach Governance Graph',
            tasks: [
                {
                    tempId: 'loop-par',
                    name: 'Parallel Loop Step',
                    description: 'Parallel ForEach over 6 items',
                    kind: 'ForEach',
                    configuration: {
                        collectionPath: 'static:["P0","P1","P2","P3","P4","P5"]',
                        itemVariable: 'item',
                        indexVariable: 'idx',
                        executionMode: 'parallel',
                        maxConcurrency: 2,
                        action: {
                            name: 'StepAction',
                            params: { val: 'item' },
                        },
                    },
                },
            ],
        };

        let parentId = '';
        let loopTaskId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(spec, {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdParallel,
                LimitsOverride: {
                    Budgets: {
                        PerRun: { MaxCostUsd: 0.15, MaxWallClockMs: 60_000 },
                        AllowedInFlightOvershootUsd: 0,
                    },
                },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;
            loopTaskId = (db.TasksByParent.get(parentId.toLowerCase()) ?? [])[0].ID;

            await waitUntil(
                () =>
                    disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    db.Tasks.get(loopTaskId.toLowerCase())?.Status === 'Pending',
                5_000,
                () => disp1.Kick(),
            );

            // Batch 0 ([P0, P1]) cost $0.20 >= $0.15, so batches 1 & 2 did NOT launch
            expect(disp1Items).toHaveLength(2);
            expect(new Set(disp1Items)).toEqual(new Set(['P0', 'P1']));
            const pausedTask = db.Tasks.get(loopTaskId.toLowerCase())!;
            expect(pausedTask.Status).toBe('Pending');
            const pausedCfg = JSON.parse(pausedTask.Configuration!) as {
                runtime?: { loopCursor?: { Cursor: { NextIterationIndex: number; CompletedIndices: number[] } } };
            };
            expect(pausedCfg.runtime?.loopCursor?.Cursor.CompletedIndices).toEqual([0, 1]);
            expect(pausedCfg.runtime?.loopCursor?.Cursor.NextIterationIndex).toBe(2);
        } finally {
            await disp1.Stop();
        }

        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-par-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async (ctx) => {
                    const p = ctx.InputPayload as LoopTestActionInput;
                    disp2Items.push(p.val ?? '');
                    return {
                        Success: true,
                        Output: { item: p.val },
                        CostUsd: 0.10,
                        TokensUsed: 100,
                    };
                },
            },
        );

        const settlementSpy = vi.spyOn(disp2.Governance, 'RecordNodeSettlementAndEvaluate');
        await disp2.Start();
        try {
            const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.5 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp2.Kick(),
            );

            // Replacement worker executed ONLY remaining items [P2, P3, P4, P5]
            expect(disp2Items).toHaveLength(4);
            expect(new Set(disp2Items)).toEqual(new Set(['P2', 'P3', 'P4', 'P5']));
            const completedLoop = db.Tasks.get(loopTaskId.toLowerCase())!;
            expect(completedLoop.Status).toBe('Complete');
            const out = JSON.parse(completedLoop.OutputPayload!) as { results: Array<{ item: string }> };
            expect(out.results.map((r) => r.item)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
            const finalCfg = JSON.parse(completedLoop.Configuration!) as {
                runtime?: { loopCursor?: NonNullable<TaskStepConfiguration['runtime']>['loopCursor']; iterations?: Array<{ cost?: number }> };
            };
            expect(finalCfg.runtime?.loopCursor).toBeUndefined();
            expect(finalCfg.runtime?.iterations).toHaveLength(6);
            const settled = await settlementSpy.mock.results[0]?.value;
            expect(settled?.Ledger?.RunCostUsd).toBeCloseTo(0.60, 5);
        } finally {
            await disp2.Stop();
        }
    });

    it('CR-APPROVAL-CLOSES-PAUSE-EARLY: keeps PausedIntervals open when ClearDebugPauseFields or checkpoint Save() fails at t1 and excludes the entire t0->t2 window upon replacement retry at t2', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runIdPauseEarly = '50000000-0000-4000-8000-000000000061';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runIdPauseEarly;
        submitRun.Status = 'Running';
        await submitRun.Save();

        const executedDisp1: string[] = [];
        const executedDisp2: string[] = [];
        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'pause-early-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async (ctx) => {
                    executedDisp1.push(ctx.TaskID);
                    return { Success: true, Output: { idx: executedDisp1.length }, CostUsd: 0.10, TokensUsed: 50 };
                },
            },
        );

        let parentId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(buildLinearSpec(4, 'CR-APPROVAL-CLOSES-PAUSE-EARLY Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentRunID: runIdPauseEarly,
                LimitsOverride: {
                    Budgets: {
                        PerRun: { MaxCostUsd: 0.15, MaxWallClockMs: 30_000 },
                        CountPausedTimeTowardsWallClock: false,
                    },
                },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;

            await waitUntil(
                () => disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true,
                5_000,
                () => disp1.Kick(),
            );
            expect(executedDisp1).toHaveLength(2);
        } finally {
            await disp1.Stop();
        }

        const pausedCp = ExtractRunawayCheckpointFromRunData(db.AgentRuns.get(runIdPauseEarly.toLowerCase())?.Data);
        expect(pausedCp).not.toBeNull();
        const t0Pause = pausedCp!.PausedAtMs;
        const t1Attempt = t0Pause + 30_000;
        const t2Retry = t0Pause + 180_000;

        let controlledNowMs = t1Attempt;
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => controlledNowMs);
        try {
            // 1) At t1: ClearDebugPauseFields fails -> ApproveAndResumePausedGraph MUST return Success=false
            // and keep PausedIntervals OPEN (ResumedAtMs === null) in the persisted checkpoint.
            db.DebugWriteMode = 'false';
            const failedClearRes = await disp1.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0, NewPerRunMaxWallClockMs: 30_000 },
            });
            expect(failedClearRes.Success).toBe(false);

            const cpAfterFailedClear = ExtractRunawayCheckpointFromRunData(
                db.AgentRuns.get(runIdPauseEarly.toLowerCase())?.Data,
            );
            expect(cpAfterFailedClear?.HumanApproval.Status).toBe('Approved');
            expect(cpAfterFailedClear?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: null },
            ]);

            // 2) At t1 + 5s: ClearDebugPauseFields succeeds, but checkpoint Save() fails -> MUST return
            // Success=false (never Success=true), roll back $.debug pause latch, and keep PausedIntervals open.
            controlledNowMs = t1Attempt + 5_000;
            db.DebugWriteMode = 'ok';
            db.AgentRunSaveMode = 'false';
            const coordSaveFail = new TaskGraphGovernanceCoordinator(new TaskClaimStore('coord-save-fail'));
            const failedSaveRes = await coordSaveFail.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
            });
            expect(failedSaveRes.Success).toBe(false);

            const debugAfterRollback = ParseTaskGraphDebugState(db.Tasks.get(parentId.toLowerCase())?.InputPayload);
            expect(debugAfterRollback.paused).toBe(true);
            expect(debugAfterRollback.pausedReason).toBe('governance');
            expect(debugAfterRollback.governancePauseActive).toBe(true);

            const cpAfterFailedSave = ExtractRunawayCheckpointFromRunData(
                db.AgentRuns.get(runIdPauseEarly.toLowerCase())?.Data,
            );
            expect(cpAfterFailedSave?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: null },
            ]);

            // 3) At t2 (180s after t0): storage recovers, replacement coordinator retries -> succeeds and
            // closes PausedIntervals across the ENTIRE t0 -> t2 window!
            db.AgentRunSaveMode = 'ok';
            controlledNowMs = t2Retry;
            const disp2 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                TEST_USER,
                {
                    InstanceID: 'pause-early-disp-2',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async (ctx) => {
                        executedDisp2.push(ctx.TaskID);
                        return { Success: true, Output: { idx: executedDisp2.length }, CostUsd: 0.10, TokensUsed: 50 };
                    },
                },
            );

            const retryApproveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
            });
            expect(retryApproveRes.Success).toBe(true);

            const cpAfterRetry = ExtractRunawayCheckpointFromRunData(
                db.AgentRuns.get(runIdPauseEarly.toLowerCase())?.Data,
            );
            expect(cpAfterRetry?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: t2Retry },
            ]);
            expect(cpAfterRetry?.CumulativeLedger.PausedWallClockMs).toBe(180_000);

            // Restore real clock so waitUntil polling runs normally, and verify remaining nodes complete
            dateNowSpy.mockRestore();
            await disp2.Start();
            try {
                await waitUntil(
                    () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                    5_000,
                    () => disp2.Kick(),
                );
                expect(executedDisp2).toHaveLength(2);
            } finally {
                await disp2.Stop();
            }
        } finally {
            dateNowSpy.mockRestore();
        }
    });

    it('CR-APPROVAL-CLOSES-PAUSE-EARLY (standalone graph): keeps PausedIntervals open on ClearDebugPauseFields/Save failure at t1 and excludes full t0->t2 window on retry at t2', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'standalone-pause-early-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async () => ({ Success: true, Output: { ok: true }, CostUsd: 0.15, TokensUsed: 50 }),
            },
        );

        let parentId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(buildLinearSpec(4, 'Standalone Pause Early Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                LimitsOverride: {
                    Budgets: {
                        PerRun: { MaxCostUsd: 0.25, MaxWallClockMs: 30_000 },
                        CountPausedTimeTowardsWallClock: false,
                    },
                },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;

            await waitUntil(
                () => disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true,
                5_000,
                () => disp1.Kick(),
            );
        } finally {
            await disp1.Stop();
        }

        const rawCfg0 = JSON.parse(db.Tasks.get(parentId.toLowerCase())!.Configuration!) as {
            governanceCheckpoint?: {
                PausedAtISO: string;
                Status: string;
                CumulativeLedger: { PausedIntervals: Array<{ PausedAtMs: number; ResumedAtMs: number | null }> };
            };
        };
        const t0Pause = rawCfg0.governanceCheckpoint!.CumulativeLedger.PausedIntervals[0]?.PausedAtMs ?? Date.parse(rawCfg0.governanceCheckpoint!.PausedAtISO);
        const t1Attempt = t0Pause + 25_000;
        const t2Retry = t0Pause + 125_000;

        let controlledNowMs = t1Attempt;
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => controlledNowMs);
        try {
            // Force ClearDebugPauseFields to fail at t1 -> standalone checkpoint interval remains open
            db.DebugWriteMode = 'false';
            const res1 = await disp1.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
            });
            expect(res1.Success).toBe(false);
            const cfgAfterClearFail = JSON.parse(db.Tasks.get(parentId.toLowerCase())!.Configuration!) as typeof rawCfg0;
            expect(cfgAfterClearFail.governanceCheckpoint?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: null },
            ]);

            // Force Task.Save() to fail on closing interval at t1 + 5s -> returns Success=false and rolls back debug pause
            controlledNowMs = t1Attempt + 5_000;
            db.DebugWriteMode = 'ok';
            db.TaskSaveMode = 'false';
            const coordSaveFail = new TaskGraphGovernanceCoordinator(new TaskClaimStore('standalone-save-fail'));
            const res2 = await coordSaveFail.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
            });
            expect(res2.Success).toBe(false);
            expect(ParseTaskGraphDebugState(db.Tasks.get(parentId.toLowerCase())?.InputPayload).paused).toBe(true);
            const cfgAfterSaveFail = JSON.parse(db.Tasks.get(parentId.toLowerCase())!.Configuration!) as typeof rawCfg0;
            expect(cfgAfterSaveFail.governanceCheckpoint?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: null },
            ]);

            // Retry with replacement coordinator at t2 -> closes full t0 -> t2 pause window
            db.TaskSaveMode = 'ok';
            controlledNowMs = t2Retry;
            const replacementCoord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('standalone-retry-ok'));
            const res3 = await replacementCoord.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
            });
            expect(res3.Success).toBe(true);
            const cfgAfterRetry = JSON.parse(db.Tasks.get(parentId.toLowerCase())!.Configuration!) as typeof rawCfg0;
            expect(cfgAfterRetry.governanceCheckpoint?.CumulativeLedger.PausedIntervals).toEqual([
                { PausedAtMs: t0Pause, ResumedAtMs: t2Retry },
            ]);
        } finally {
            dateNowSpy.mockRestore();
        }
    });

    it('CR-CONFIGURED-CEILING-CONTEXT: clamps larger and null graph overrides to mj.config.cjs and agent/workflow metadata ceilings for standard users across dispatcher restarts and approval, while allowing authorized increases', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const daemonOwnerUser: UserInfo = {
            ID: '10000000-0000-4000-8000-000000000099',
            Name: 'Daemon Owner',
            Email: 'daemon@example.com',
            Type: 'Owner',
            IsActive: true,
        } as UserInfo;

        const store = globalThis as GovernanceTestGlobalStore;
        const previousCache = store.___SINGLETON__UserCache;
        store.___SINGLETON__UserCache = {
            Users: [TEST_USER, daemonOwnerUser],
            FindUser: async ({ ID }) => {
                if (ID?.toLowerCase() === TEST_USER.ID.toLowerCase()) return TEST_USER;
                if (ID?.toLowerCase() === daemonOwnerUser.ID.toLowerCase()) return daemonOwnerUser;
                return undefined;
            },
        };

        try {
            // 1) Finite mj.config.cjs budget ($0.25) with NO UserAgentPolicy; standard user submits larger ($50) and null overrides.
            // Dispatcher runs under a privileged Owner daemon user — ceiling check MUST evaluate the submitting principal (TEST_USER), not daemonOwnerUser!
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                Budgets: { PerRun: { MaxCostUsd: 0.25 } },
            });

            const service = new TaskGraphService();
            const largerDisp = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                daemonOwnerUser,
                {
                    InstanceID: 'ceiling-disp-1',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => ({ Success: true, Output: { ok: true }, CostUsd: 0.15, TokensUsed: 50 }),
                },
            );

            await largerDisp.Start();
            let largerParentId = '';
            let nullParentId = '';
            try {
                const subLarger = await service.Submit(buildLinearSpec(4, 'MJConfig Larger Override Graph'), {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: TEST_USER,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 50 } } },
                });
                expect(subLarger.Success).toBe(true);
                largerParentId = subLarger.ParentTaskID!;

                await waitUntil(
                    () => largerDisp.Governance.GetGraphDiagnostics(largerParentId)?.PausedByGovernance === true,
                    5_000,
                    () => largerDisp.Kick(),
                );
                const largerDiag = largerDisp.Governance.GetGraphDiagnostics(largerParentId)!;
                expect(largerDiag.LastResolvedLimits?.Budgets.PerRun.MaxCostUsd).toBe(0.25);
                expect(largerDiag.LastBudgetResult?.Breach?.Limit).toBe(0.25);

                const subNull = await service.Submit(buildLinearSpec(4, 'MJConfig Null Override Graph'), {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: TEST_USER,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: null } } },
                });
                expect(subNull.Success).toBe(true);
                nullParentId = subNull.ParentTaskID!;

                await waitUntil(
                    () => largerDisp.Governance.GetGraphDiagnostics(nullParentId)?.PausedByGovernance === true,
                    5_000,
                    () => largerDisp.Kick(),
                );
                const nullDiag = largerDisp.Governance.GetGraphDiagnostics(nullParentId)!;
                expect(nullDiag.LastResolvedLimits?.Budgets.PerRun.MaxCostUsd).toBe(0.25);
                expect(nullDiag.LastBudgetResult?.Breach?.Limit).toBe(0.25);
            } finally {
                await largerDisp.Stop();
            }

            // 2) Agent & workflow metadata ceiling ($0.20) across a dispatcher restart + approval baseBudgets reconstruction
            LimitsConfigResolver.Instance.ClearMjConfigLimits();
            db.Agents = [
                {
                    ID: AGENT_ID,
                    Name: 'MetadataCeilingAgent',
                    MaxCostPerRun: 0.20,
                },
            ];

            let disp1Count = 0;
            let disp1Ref: TaskGraphDispatcher | null = null;
            const disp1 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                daemonOwnerUser,
                {
                    InstanceID: 'ceiling-restart-disp-1',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => {
                        disp1Count++;
                        if (disp1Count === 1 && disp1Ref) {
                            // Stop dispatcher after step 1 settles so step 2 runs cold on disp2 after restart
                            void disp1Ref.Stop();
                        }
                        return { Success: true, Output: { step: disp1Count }, CostUsd: 0.12, TokensUsed: 40 };
                    },
                },
            );
            disp1Ref = disp1;
            const subMeta = await service.Submit(buildLinearSpec(4, 'Agent Metadata Ceiling Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                AgentID: AGENT_ID,
                WorkflowMetadata: { Budgets: { PerRun: { MaxCostUsd: 0.20 } } },
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 25, MaxWallClockMs: null } } },
            });
            expect(subMeta.Success).toBe(true);
            const metaParentId = subMeta.ParentTaskID!;

            await disp1.Start();
            await waitUntil(
                () => Array.from(db.TasksByParent.get(metaParentId.toLowerCase()) ?? []).some((t) => t.Status === 'Complete'),
                5_000,
                () => disp1.Kick(),
            );
            await disp1.Stop();
            // Ensure step 1 settled below $0.20 and disp2 handles step 2 & the pause cold after restart
            expect(disp1.Governance.GetGraphDiagnostics(metaParentId)?.PausedByGovernance).not.toBe(true);

            const disp2 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                daemonOwnerUser,
                {
                    InstanceID: 'ceiling-restart-disp-2',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => ({ Success: true, Output: { step: 2 }, CostUsd: 0.12, TokensUsed: 40 }),
                },
            );
            await disp2.Start();
            try {
                await waitUntil(
                    () => disp2.Governance.GetGraphDiagnostics(metaParentId)?.PausedByGovernance === true,
                    5_000,
                    () => disp2.Kick(),
                );
                const metaDiag = disp2.Governance.GetGraphDiagnostics(metaParentId)!;
                expect(metaDiag.LastResolvedLimits?.Budgets.PerRun.MaxCostUsd).toBe(0.20);
                expect(metaDiag.LastBudgetResult?.Breach?.Limit).toBe(0.20);

                // Approving as Owner WITHOUT BudgetExtension must still reconstruct clamped baseBudgets ($0.20),
                // NOT silently widen baseBudgets to the user's clamped $25 LimitsOverride!
                const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                    ParentTaskID: metaParentId,
                    Provider: provider,
                    ContextUser: daemonOwnerUser,
                });
                expect(approveRes.Success).toBe(true);
                expect(approveRes.ExtendedBudgets?.PerRun.MaxCostUsd).toBe(0.20);
            } finally {
                await disp2.Stop();
            }

            // 3) Authorized increase: Owner submits graph with LimitsOverride > mj.config.cjs ($0.25 -> $1.00) and completes all 3 steps ($0.45) cleanly
            const authDb = new GovernanceInMemoryDb();
            const authProvider = authDb.CreateProvider();
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                Budgets: { PerRun: { MaxCostUsd: 0.25 } },
            });
            let authExecutedSteps = 0;
            const authDisp = new TaskGraphDispatcher(
                { CreateProvider: async () => authProvider },
                { RunAgentForTask: async () => ({ Success: true }) },
                daemonOwnerUser,
                {
                    InstanceID: 'ceiling-auth-disp',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => {
                        authExecutedSteps++;
                        return { Success: true, Output: { ok: true }, CostUsd: 0.15, TokensUsed: 50 };
                    },
                },
            );
            let capturedAuthorizedLimit: number | null | undefined;
            const origRecord = authDisp.Governance.RecordNodeSettlementAndEvaluate.bind(authDisp.Governance);
            vi.spyOn(authDisp.Governance, 'RecordNodeSettlementAndEvaluate').mockImplementation(async (callArgs) => {
                const res = await origRecord(callArgs);
                const parentId = callArgs.Task.ParentID ?? callArgs.Task.ID;
                capturedAuthorizedLimit =
                    authDisp.Governance.GetGraphDiagnostics(parentId)?.LastResolvedLimits?.Budgets.PerRun.MaxCostUsd;
                return res;
            });
            await authDisp.Start();
            try {
                const subAuthorized = await service.Submit(buildLinearSpec(3, 'Authorized Override Graph'), {
                    EnvironmentID: 'env-1',
                    Provider: authProvider,
                    ContextUser: daemonOwnerUser,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 1.0 } } },
                });
                expect(subAuthorized.Success).toBe(true);
                const authParentId = subAuthorized.ParentTaskID!;

                await waitUntil(
                    () => authDb.Tasks.get(authParentId.toLowerCase())?.Status === 'Complete',
                    5_000,
                    () => authDisp.Kick(),
                );
                expect(authExecutedSteps).toBe(3);
                expect(capturedAuthorizedLimit).toBe(1.0);

                // 4) Loop governance path also enforces mj.config.cjs ceiling when standard user supplies null/larger override
                const loopSpec: TaskGraphSpec = {
                    workflowName: 'Loop Ceiling Clamp Graph',
                    tasks: [
                        {
                            tempId: 'loop-1',
                            name: 'Loop Step',
                            description: 'ForEach loop clamped to mj.config.cjs',
                            kind: 'ForEach',
                            configuration: {
                                collectionPath: 'static:["a","b","c","d"]',
                                executionMode: 'sequential',
                                itemVariable: 'val',
                                action: { name: 'StepAction', params: { val: 'val' } },
                            },
                        },
                    ],
                };
                const subLoop = await service.Submit(loopSpec, {
                    EnvironmentID: 'env-1',
                    Provider: authProvider,
                    ContextUser: TEST_USER,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: null } } },
                });
                expect(subLoop.Success).toBe(true);
                const loopParentId = subLoop.ParentTaskID!;

                await waitUntil(
                    () => authDisp.Governance.GetGraphDiagnostics(loopParentId)?.PausedByGovernance === true,
                    5_000,
                    () => authDisp.Kick(),
                );
                const loopDiag = authDisp.Governance.GetGraphDiagnostics(loopParentId)!;
                expect(loopDiag.LastResolvedLimits?.Budgets.PerRun.MaxCostUsd).toBe(0.25);
                expect(loopDiag.LastBudgetResult?.Breach?.Limit).toBe(0.25);
            } finally {
                await authDisp.Stop();
            }
        } finally {
            store.___SINGLETON__UserCache = previousCache;
        }
    });

    it('CR-STANDALONE-SHARED-LEDGER: shares PerRoutine and PerUserPerDay dollar and wall-clock budgets across standalone workflows (completed, restarted, concurrent) without double-counting agent-submitted workflows', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const sharedRoutineId = '60000000-0000-4000-8000-000000000077';
        const service = new TaskGraphService();

        // Scenario A (Dollar dimension across restart): Graph 1 (standalone) completes at $0.20;
        // dispatcher restarts cold; Graph 2 (standalone) spends $0.10 + $0.10 -> shared $0.40 >= $0.35 -> pause!
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            Budgets: {
                PerRun: { MaxCostUsd: 1.0 },
                PerRoutine: { MaxCostUsd: 0.35 },
                PerUserPerDay: { MaxCostUsd: 0.35, DayBoundaryTimezone: 'UTC' },
            },
        });

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'standalone-shared-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async () => ({ Success: true, Output: { ok: true }, CostUsd: 0.10, TokensUsed: 25 }),
            },
        );

        await disp1.Start();
        let g1ParentId = '';
        try {
            const sub1 = await service.Submit(buildLinearSpec(2, 'Standalone Routine Graph 1', sharedRoutineId), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                RoutineID: sharedRoutineId,
            });
            expect(sub1.Success).toBe(true);
            g1ParentId = sub1.ParentTaskID!;
            await waitUntil(
                () => db.Tasks.get(g1ParentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp1.Kick(),
            );
        } finally {
            await disp1.Stop();
        }

        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'standalone-shared-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async () => ({ Success: true, Output: { ok: true }, CostUsd: 0.10, TokensUsed: 25 }),
            },
        );

        await disp2.Start();
        let g2ParentId = '';
        try {
            const sub2 = await service.Submit(buildLinearSpec(4, 'Standalone Routine Graph 2', sharedRoutineId), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                RoutineID: sharedRoutineId,
            });
            expect(sub2.Success).toBe(true);
            g2ParentId = sub2.ParentTaskID!;

            await waitUntil(
                () => disp2.Governance.GetGraphDiagnostics(g2ParentId)?.PausedByGovernance === true,
                5_000,
                () => disp2.Kick(),
            );
            const g2Diag = disp2.Governance.GetGraphDiagnostics(g2ParentId)!;
            expect(g2Diag.LastBudgetResult?.Exceeded).toBe(true);
            expect(g2Diag.LastBudgetResult?.Breach?.Scope).toBe('PerRoutine');
            expect(g2Diag.LastBudgetResult?.Breach?.Dimension).toBe('CostUsd');
            expect(g2Diag.LastBudgetResult?.Ledger.RunCostUsd).toBeCloseTo(0.20, 5);
            expect(g2Diag.LastBudgetResult?.Ledger.RoutineCostUsd).toBeCloseTo(0.40, 5);
            expect(g2Diag.LastBudgetResult?.Ledger.UserDailyCostUsd).toBeCloseTo(0.40, 5);
        } finally {
            await disp2.Stop();
        }

        // Scenario B (Wall-clock dimension + concurrent standalone graphs + paused interval exclusion + no agent-run double count):
        const wallUser: UserInfo = {
            ...TEST_USER,
            ID: '10000000-0000-4000-8000-000000000088',
        } as UserInfo;
        const wallRoutineId = '60000000-0000-4000-8000-000000000088';
        const nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
        try {
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                Budgets: {
                    PerRun: { MaxCostUsd: null, MaxWallClockMs: 50_000 },
                    PerRoutine: { MaxCostUsd: null, MaxWallClockMs: 30_000 },
                    PerUserPerDay: { MaxCostUsd: null, MaxWallClockMs: 30_000, DayBoundaryTimezone: 'UTC' },
                    CountPausedTimeTowardsWallClock: false,
                },
            });

            // Concurrent standalone Graph A started 45s ago, paused for 25s -> 20s active wall-clock today
            const concurrentParentId = randomUUID();
            const concurrentChildId = randomUUID();
            db.Tasks.set(concurrentParentId.toLowerCase(), {
                ID: concurrentParentId,
                ParentID: null,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Concurrent Standalone A',
                Description: null,
                Status: 'In Progress',
                StepType: 'Action',
                ActionID: null,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 45_000),
                CompletedAt: null,
                PercentComplete: 50,
                ErrorMessage: null,
                InputPayload: JSON.stringify({
                    continuation: 'message',
                    reinvokeDepth: 0,
                    failureSemantics: 'block',
                    submittedByAgentRunID: null,
                    submittedByUserID: wallUser.ID,
                    routineID: wallRoutineId,
                }),
                Configuration: JSON.stringify({
                    governanceCheckpoint: {
                        CheckpointID: randomUUID(),
                        Status: 'Approved',
                        PauseReason: 'BudgetExceeded',
                        Summary: 'Prior pause',
                        PausedAtISO: new Date(nowMs - 35_000).toISOString(),
                        CompletedNodeCount: 1,
                        CompletedNodeIDs: [concurrentChildId],
                        CumulativeLedger: {
                            RunCostUsd: 0.05,
                            RunWallClockMs: 10_000,
                            RunTokens: 10,
                            RoutineCostUsd: 0.05,
                            RoutineWallClockMs: 10_000,
                            UserDailyCostUsd: 0.05,
                            UserDailyWallClockMs: 10_000,
                            PausedWallClockMs: 25_000,
                            PausedIntervals: [{ PausedAtMs: nowMs - 35_000, ResumedAtMs: nowMs - 10_000 }],
                            DayBucketUTC: '2026-11-22',
                            DayBoundaryTimezone: 'UTC',
                            AsOfISO: new Date(nowMs - 10_000).toISOString(),
                        },
                    },
                }),
                __mj_UpdatedAt: new Date(nowMs),
            });
            const concurrentChildRow: StoredTaskRow = {
                ID: concurrentChildId,
                ParentID: concurrentParentId,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Concurrent Child 1',
                Description: null,
                Status: 'Complete',
                StepType: 'Action',
                ActionID: ACTION_ID,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 45_000),
                CompletedAt: new Date(nowMs - 35_000),
                PercentComplete: 100,
                ErrorMessage: null,
                InputPayload: null,
                OutputPayload: null,
                Configuration: JSON.stringify({ runtime: { governanceCostUsd: 0.05, governanceTokensUsed: 10 } }),
                __mj_UpdatedAt: new Date(nowMs - 35_000),
            };
            db.Tasks.set(concurrentChildId.toLowerCase(), concurrentChildRow);
            db.TasksByParent.set(concurrentParentId.toLowerCase(), [concurrentChildRow]);

            // Agent-submitted graph sharing same routine/user with an AgentRun row ($0.01, 2s) — MUST NOT be double-counted!
            const agentSubmittedRunId = randomUUID();
            db.AgentRuns.set(agentSubmittedRunId.toLowerCase(), {
                ID: agentSubmittedRunId,
                AgentID: AGENT_ID,
                UserID: wallUser.ID,
                ParentRunID: null,
                ScheduledJobRunID: wallRoutineId,
                Status: 'Completed',
                StartedAt: new Date(nowMs - 5_000),
                CompletedAt: new Date(nowMs - 3_000), // 2,000ms
                Success: true,
                ErrorMessage: null,
                Message: null,
                TotalCost: 0.01,
                TotalCostRollup: 0.01,
                Data: null,
                Steps: [],
            });
            const agentSubmittedParentId = randomUUID();
            const agentSubmittedChildId = randomUUID();
            db.Tasks.set(agentSubmittedParentId.toLowerCase(), {
                ID: agentSubmittedParentId,
                ParentID: null,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Agent-Submitted Graph',
                Description: null,
                Status: 'Complete',
                StepType: 'Action',
                ActionID: null,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: agentSubmittedRunId,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 5_000),
                CompletedAt: new Date(nowMs - 3_000),
                PercentComplete: 100,
                ErrorMessage: null,
                InputPayload: JSON.stringify({
                    continuation: 'message',
                    reinvokeDepth: 0,
                    failureSemantics: 'block',
                    submittedByAgentRunID: agentSubmittedRunId,
                    submittedByUserID: wallUser.ID,
                    routineID: wallRoutineId,
                }),
                Configuration: null,
                __mj_UpdatedAt: new Date(nowMs - 3_000),
            });
            const agentSubmittedChildRow: StoredTaskRow = {
                ID: agentSubmittedChildId,
                ParentID: agentSubmittedParentId,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Agent-Submitted Child',
                Description: null,
                Status: 'Complete',
                StepType: 'Action',
                ActionID: ACTION_ID,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 5_000),
                CompletedAt: new Date(nowMs - 3_000),
                PercentComplete: 100,
                ErrorMessage: null,
                InputPayload: null,
                OutputPayload: null,
                Configuration: JSON.stringify({ runtime: { governanceCostUsd: 0.99, governanceTokensUsed: 500 } }),
                __mj_UpdatedAt: new Date(nowMs - 3_000),
            };
            db.Tasks.set(agentSubmittedChildId.toLowerCase(), agentSubmittedChildRow);
            db.TasksByParent.set(agentSubmittedParentId.toLowerCase(), [agentSubmittedChildRow]);

            // Current standalone Graph B ran for 12s (20s + 2s + 12s = 34s >= 30s -> PerRoutine WallClockMs breach!)
            const graphBParentId = randomUUID();
            const graphBParentRow: StoredTaskRow = {
                ID: graphBParentId,
                ParentID: null,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Standalone Wall Graph B',
                Description: null,
                Status: 'In Progress',
                StepType: 'Action',
                ActionID: null,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 12_000),
                CompletedAt: null,
                PercentComplete: 0,
                ErrorMessage: null,
                InputPayload: JSON.stringify({
                    continuation: 'message',
                    reinvokeDepth: 0,
                    failureSemantics: 'block',
                    submittedByAgentRunID: null,
                    submittedByUserID: wallUser.ID,
                    routineID: wallRoutineId,
                }),
                Configuration: null,
                __mj_UpdatedAt: new Date(nowMs),
            };
            db.Tasks.set(graphBParentId.toLowerCase(), graphBParentRow);
            const graphBChildId = randomUUID();
            const graphBChildRow: StoredTaskRow = {
                ID: graphBChildId,
                ParentID: graphBParentId,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Graph B Step 1',
                Description: null,
                Status: 'Complete',
                StepType: 'Action',
                ActionID: ACTION_ID,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 12_000),
                CompletedAt: new Date(nowMs),
                PercentComplete: 100,
                ErrorMessage: null,
                InputPayload: null,
                OutputPayload: null,
                Configuration: JSON.stringify({ runtime: { governanceCostUsd: 0.02, governanceTokensUsed: 10 } }),
                __mj_UpdatedAt: new Date(nowMs),
            };
            db.Tasks.set(graphBChildId.toLowerCase(), graphBChildRow);
            db.TasksByParent.set(graphBParentId.toLowerCase(), [graphBChildRow]);

            const coord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('wall-coord', 60));
            const wallEval = await coord.RecordNodeSettlementAndEvaluate({
                Provider: provider,
                ContextUser: wallUser,
                Parent: db.wrapTaskPublic(graphBParentRow),
                Task: db.wrapTaskPublic(graphBChildRow),
                Success: true,
                CostUsd: 0.02,
                TokensUsed: 10,
            });
            expect(wallEval?.Exceeded).toBe(true);
            expect(wallEval?.Breach?.Scope).toBe('PerRoutine');
            expect(wallEval?.Breach?.Dimension).toBe('WallClockMs');
            // 20,000ms (standalone A excluding 25s pause) + 2,000ms (agent-submitted run) + 12,000ms (graph B) = 34,000ms
            expect(wallEval?.Ledger.RoutineWallClockMs).toBe(34_000);
            expect(wallEval?.Ledger.UserDailyWallClockMs).toBe(34_000);
            // Cost: $0.05 (standalone A) + $0.01 (agent-submitted run, NOT $0.99 child!) + $0.02 (graph B) = $0.08
            expect(wallEval?.Ledger.RoutineCostUsd).toBeCloseTo(0.08, 5);
            expect(coord.GetGraphDiagnostics(graphBParentId)?.PausedByGovernance).toBe(true);
        } finally {
            dateNowSpy.mockRestore();
        }
    });

    it('CR-DIAGNOSTICS-AUTH-FIRST-MATCH (graph approval): evaluates all matching authorizations rather than stopping at an ungranted System Administrator entry', async () => {
        const db = new GovernanceInMemoryDb();
        const makeAuth = (id: string, name: string, allowedRoleId: string): AuthorizationInfo =>
            ({
                ID: id,
                Name: name,
                ParentID: null,
                UserCanExecute: (u: UserInfo) => (u.UserRoles ?? []).some((r) => r.RoleID === allowedRoleId),
            }) as Partial<AuthorizationInfo> as AuthorizationInfo;

        const sysAdminAuth = makeAuth('auth-sys', 'System Administrator', 'role-sys');
        const aiAdminAuth = makeAuth('auth-ai', 'AI: Manage Agents', 'role-ai');
        db.Authorizations = [sysAdminAuth, aiAdminAuth];

        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const aiAdminApprover: UserInfo = {
            ID: '10000000-0000-4000-8000-000000000055',
            Name: 'AI Admin Approver',
            Email: 'aiadmin@example.com',
            Type: 'User',
            IsActive: true,
            UserRoles: [{ RoleID: 'role-ai', Role: 'AI Admin' }],
        } as Partial<UserInfo> as UserInfo;

        const otherStandardUser: UserInfo = {
            ID: '10000000-0000-4000-8000-000000000056',
            Name: 'Other User',
            Email: 'other@example.com',
            Type: 'User',
            IsActive: true,
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;

        const disp = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'auth-approve-disp',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            {
                RunActionForTask: async () => ({ Success: true, Output: { ok: true }, CostUsd: 0.15, TokensUsed: 20 }),
            },
        );

        await disp.Start();
        let parentId = '';
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(buildLinearSpec(3, 'Approval Multi-Auth Graph'), {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: TEST_USER,
                LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.20 } } },
            });
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;

            await waitUntil(
                () => disp.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true,
                5_000,
                () => disp.Kick(),
            );
        } finally {
            await disp.Stop();
        }

        // Unprivileged non-owner must be denied
        const deniedRes = await disp.Governance.ApproveAndResumePausedGraph({
            ParentTaskID: parentId,
            Provider: provider,
            ContextUser: otherStandardUser,
        });
        expect(deniedRes.Success).toBe(false);
        expect(deniedRes.Message).toContain('authorized administrator');

        // User holding AI: Manage Agents succeeds even when ungranted System Administrator comes first
        const allowedRes = await disp.Governance.ApproveAndResumePausedGraph({
            ParentTaskID: parentId,
            Provider: provider,
            ContextUser: aiAdminApprover,
            BudgetExtension: { NewPerRunMaxCostUsd: 1.0 },
        });
        expect(allowedRes.Success).toBe(true);
    });

    it('CR-STANDALONE-SHARED-LEDGER (overnight paused loop): attributes post-midnight Pending loop cursor spend to today while excluding pre-midnight completed child, pauses second standalone graph at daily ceiling, and reconciles on resume/complete without cost loss or double-counting', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const overnightUser: UserInfo = {
            ...TEST_USER,
            ID: '10000000-0000-4000-8000-000000000091',
            Name: 'Overnight User',
            Email: 'overnight@example.com',
        } as UserInfo;

        const beforeMidnightMs = Date.UTC(2026, 10, 21, 23, 30, 0);
        const afterMidnightMs = Date.UTC(2026, 10, 22, 1, 0, 0);
        const laterTodayMs = Date.UTC(2026, 10, 22, 2, 0, 0);

        // Use performance.now() for polling deadlines since vi.setSystemTime advances Date.now() across midnight.
        const waitUntilRealTime = async (predicate: () => boolean, timeoutMs: number, kickFn?: () => void): Promise<void> => {
            const deadline = performance.now() + timeoutMs;
            while (performance.now() < deadline) {
                if (predicate()) return;
                kickFn?.();
                await new Promise((r) => setTimeout(r, 15));
            }
            throw new Error(`Timed out after ${timeoutMs}ms waiting for TaskGraph condition; errors=[${capturedErrors.slice(0, 5).join(' | ')}]`);
        };

        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(beforeMidnightMs);
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                Budgets: {
                    PerRun: { MaxCostUsd: 0.85, MaxWallClockMs: 86_400_000 },
                    PerUserPerDay: { MaxCostUsd: 1.0, MaxWallClockMs: 86_400_000, DayBoundaryTimezone: 'UTC' },
                    AllowedInFlightOvershootUsd: 0,
                },
            });

            const g1Spec: TaskGraphSpec = {
                workflowName: 'Overnight Standalone Graph 1',
                tasks: [
                    {
                        tempId: 'pre-midnight-step',
                        name: 'Pre-Midnight Child',
                        description: 'Completes before midnight for $0.10',
                        kind: 'Action',
                        configuration: {
                            actionName: 'StepAction',
                        },
                    },
                    {
                        tempId: 'post-midnight-loop',
                        name: 'Post-Midnight Loop',
                        description: 'ForEach loop incurring $0.80 after midnight before governance pause',
                        kind: 'ForEach',
                        dependsOn: ['pre-midnight-step'],
                        configuration: {
                            collectionPath: 'static:["I0","I1","I2","I3","I4"]',
                            itemVariable: 'item',
                            indexVariable: 'idx',
                            action: {
                                name: 'StepAction',
                                params: { val: 'item' },
                            },
                        },
                    },
                ],
            };

            const seenDisp1LoopItems: string[] = [];
            let ranPreMidnightStep = false;
            const disp1 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                overnightUser,
                {
                    InstanceID: 'overnight-disp-1',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async (ctx) => {
                        const p = ctx.InputPayload as LoopTestActionInput;
                        if (!ranPreMidnightStep) {
                            ranPreMidnightStep = true;
                            return { Success: true, Output: { done: true }, CostUsd: 0.10, TokensUsed: 25 };
                        }
                        // Advance clock across midnight when the loop begins executing
                        vi.setSystemTime(afterMidnightMs);
                        seenDisp1LoopItems.push(p.val ?? '');
                        return { Success: true, Output: { item: p.val }, CostUsd: 0.20, TokensUsed: 50 };
                    },
                },
            );

            const service = new TaskGraphService();
            let g1ParentId = '';
            let g1FirstChildId = '';
            let g1LoopChildId = '';
            await disp1.Start();
            try {
                const sub1 = await service.Submit(g1Spec, {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: overnightUser,
                });
                expect(sub1.Success).toBe(true);
                g1ParentId = sub1.ParentTaskID!;
                const g1Children = db.TasksByParent.get(g1ParentId.toLowerCase()) ?? [];
                expect(g1Children).toHaveLength(2);
                g1FirstChildId = g1Children.find((c) => c.Name === 'Pre-Midnight Child')!.ID;
                g1LoopChildId = g1Children.find((c) => c.Name === 'Post-Midnight Loop')!.ID;

                await waitUntilRealTime(
                    () =>
                        disp1.Governance.GetGraphDiagnostics(g1ParentId)?.PausedByGovernance === true &&
                        db.Tasks.get(g1LoopChildId.toLowerCase())?.Status === 'Pending',
                    5_000,
                    () => disp1.Kick(),
                );

                // First child completed before midnight ($0.10); loop paused after 4 iterations ($0.80) after midnight
                expect(seenDisp1LoopItems).toEqual(['I0', 'I1', 'I2', 'I3']);
                const firstChild = db.Tasks.get(g1FirstChildId.toLowerCase())!;
                expect(firstChild.Status).toBe('Complete');
                expect(firstChild.CompletedAt!.getTime()).toBeLessThan(Date.UTC(2026, 10, 22, 0, 0, 0));

                const pausedLoopRow = db.Tasks.get(g1LoopChildId.toLowerCase())!;
                expect(pausedLoopRow.Status).toBe('Pending');
                const pausedLoopCfg = JSON.parse(pausedLoopRow.Configuration!) as TaskStepConfiguration;
                expect(pausedLoopCfg.runtime?.loopCursor?.AccumulatedCostUsd).toBeCloseTo(0.80, 5);
                expect(pausedLoopCfg.runtime?.loopCursor?.CostEvents).toHaveLength(4);
            } finally {
                await disp1.Stop();
            }

            // Now after midnight on a fresh dispatcher, Graph 2 runs for the same user.
            // Step 1 ($0.15) + $0.80 paused loop = $0.95 < $1.00 (proves yesterday's $0.10 was excluded!).
            // Step 2 ($0.15) + $0.95 = $1.10 >= $1.00 -> breaches PerUserPerDay and pauses Graph 2!
            vi.setSystemTime(laterTodayMs);
            const g2StepsExecuted: number[] = [];
            const disp2 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                overnightUser,
                {
                    InstanceID: 'overnight-disp-2',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => {
                        g2StepsExecuted.push(g2StepsExecuted.length + 1);
                        return { Success: true, Output: { ok: true }, CostUsd: 0.15, TokensUsed: 30 };
                    },
                },
            );

            let g2ParentId = '';
            await disp2.Start();
            try {
                const sub2 = await service.Submit(buildLinearSpec(3, 'Next-Day Standalone Graph 2'), {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: overnightUser,
                });
                expect(sub2.Success).toBe(true);
                g2ParentId = sub2.ParentTaskID!;

                await waitUntilRealTime(
                    () => disp2.Governance.GetGraphDiagnostics(g2ParentId)?.PausedByGovernance === true,
                    5_000,
                    () => disp2.Kick(),
                );

                // Step 1 did NOT trip ($0.80 + $0.15 = $0.95 < $1.00), Step 2 tripped ($0.80 + $0.30 = $1.10 >= $1.00)
                expect(g2StepsExecuted).toEqual([1, 2]);
                const g2Diag = disp2.Governance.GetGraphDiagnostics(g2ParentId)!;
                expect(g2Diag.LastBudgetResult?.Exceeded).toBe(true);
                expect(g2Diag.LastBudgetResult?.Breach?.Scope).toBe('PerUserPerDay');
                expect(g2Diag.LastBudgetResult?.Breach?.Dimension).toBe('CostUsd');
                expect(g2Diag.LastBudgetResult?.Ledger.RunCostUsd).toBeCloseTo(0.30, 5);
                expect(g2Diag.LastBudgetResult?.Ledger.UserDailyCostUsd).toBeCloseTo(1.10, 5);
            } finally {
                await disp2.Stop();
            }

            // Replacement dispatcher (disp3) approves/resumes Graph 1 with higher ceiling and completes the loop (I4 for $0.20)
            const seenDisp3LoopItems: string[] = [];
            const disp3 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                overnightUser,
                {
                    InstanceID: 'overnight-disp-3',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async (ctx) => {
                        const p = ctx.InputPayload as LoopTestActionInput;
                        seenDisp3LoopItems.push(p.val ?? '');
                        return { Success: true, Output: { item: p.val }, CostUsd: 0.20, TokensUsed: 50 };
                    },
                },
            );

            const g1SettlementSpy = vi.spyOn(disp3.Governance, 'RecordNodeSettlementAndEvaluate');
            await disp3.Start();
            try {
                const approveRes = await disp3.Governance.ApproveAndResumePausedGraph({
                    ParentTaskID: g1ParentId,
                    Provider: provider,
                    ContextUser: overnightUser,
                    BudgetExtension: {
                        NewPerRunMaxCostUsd: 5.0,
                        NewPerUserDailyMaxCostUsd: 5.0,
                    },
                });
                expect(approveRes.Success).toBe(true);

                await waitUntilRealTime(
                    () => db.Tasks.get(g1ParentId.toLowerCase())?.Status === 'Complete',
                    5_000,
                    () => disp3.Kick(),
                );

                // Only remaining iteration I4 ran; loop completed cleanly with $1.00 total loop spend ($1.10 graph total)
                expect(seenDisp3LoopItems).toEqual(['I4']);
                const completedLoop = db.Tasks.get(g1LoopChildId.toLowerCase())!;
                expect(completedLoop.Status).toBe('Complete');
                const completedCfg = JSON.parse(completedLoop.Configuration!) as TaskStepConfiguration;
                expect(completedCfg.runtime?.loopCursor).toBeUndefined();
                expect(completedCfg.runtime?.governanceCostUsd).toBeCloseTo(1.00, 5);
                expect(completedCfg.runtime?.governanceCostEvents).toHaveLength(5);

                const settledEval = await g1SettlementSpy.mock.results[0]?.value;
                expect(settledEval?.Ledger?.RunCostUsd).toBeCloseTo(1.10, 5);
                expect(settledEval?.Ledger?.UserDailyCostUsd).toBeCloseTo(1.30, 5); // $1.00 (G1 today) + $0.30 (G2 today)
            } finally {
                await disp3.Stop();
            }

            // Fresh replacement coordinator (disp4) evaluates Graph 3 for the same user today:
            // Must include $1.00 (completed G1 loop today, excluding yesterday's $0.10) + $0.30 (G2) + $0.10 (G3) = $1.40
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                Budgets: {
                    PerRun: { MaxCostUsd: 5.0, MaxWallClockMs: 86_400_000 },
                    PerUserPerDay: { MaxCostUsd: 1.35, MaxWallClockMs: 86_400_000, DayBoundaryTimezone: 'UTC' },
                    AllowedInFlightOvershootUsd: 0,
                },
            });

            const disp4 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                overnightUser,
                {
                    InstanceID: 'overnight-disp-4',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => ({ Success: true, Output: { ok: true }, CostUsd: 0.10, TokensUsed: 20 }),
                },
            );

            await disp4.Start();
            try {
                const sub3 = await service.Submit(buildLinearSpec(2, 'Post-Completion Verification Graph 3'), {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: overnightUser,
                });
                expect(sub3.Success).toBe(true);
                const g3ParentId = sub3.ParentTaskID!;

                await waitUntilRealTime(
                    () => disp4.Governance.GetGraphDiagnostics(g3ParentId)?.PausedByGovernance === true,
                    5_000,
                    () => disp4.Kick(),
                );

                const g3Diag = disp4.Governance.GetGraphDiagnostics(g3ParentId)!;
                expect(g3Diag.LastBudgetResult?.Exceeded).toBe(true);
                expect(g3Diag.LastBudgetResult?.Breach?.Scope).toBe('PerUserPerDay');
                expect(g3Diag.LastBudgetResult?.Ledger.RunCostUsd).toBeCloseTo(0.10, 5);
                expect(g3Diag.LastBudgetResult?.Ledger.UserDailyCostUsd).toBeCloseTo(1.40, 5);
            } finally {
                await disp4.Stop();
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('CR-STANDALONE-SHARED-LEDGER (cursor without CostEvents fallback): replacement coordinator attributes Pending and In Progress loop cursor spend via task/cursor timestamps without dropping or double-counting', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const fallbackUser: UserInfo = {
            ...TEST_USER,
            ID: '10000000-0000-4000-8000-000000000092',
            Name: 'Overnight Fallback User',
            Email: 'overnight-fallback@example.com',
        } as UserInfo;

        const yesterdayMs = Date.UTC(2026, 10, 21, 22, 0, 0);
        const afterMidnightMs = Date.UTC(2026, 10, 22, 1, 30, 0);
        const nowMs = Date.UTC(2026, 10, 22, 3, 0, 0);
        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
        try {
            LimitsConfigResolver.Instance.RegisterMjConfigLimits({
                Budgets: {
                    PerRun: { MaxCostUsd: 5.0 },
                    PerUserPerDay: { MaxCostUsd: 0.90, DayBoundaryTimezone: 'UTC' },
                    AllowedInFlightOvershootUsd: 0,
                },
            });

            // Overnight graph with:
            // - Completed child yesterday ($0.10, no governanceCostEvents)
            // - Pending paused loop today ($0.80 in loopCursor.AccumulatedCostUsd, no CostEvents on cursor or cp)
            const overnightParentId = randomUUID();
            const yesterdayChildId = randomUUID();
            const pausedLoopId = randomUUID();

            db.Tasks.set(overnightParentId.toLowerCase(), {
                ID: overnightParentId,
                ParentID: null,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Overnight Legacy Cursor Graph',
                Description: null,
                Status: 'In Progress',
                StepType: 'Action',
                ActionID: null,
                AgentID: null,
                PromptID: null,
                UserID: fallbackUser.ID,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(yesterdayMs),
                CompletedAt: null,
                PercentComplete: 50,
                ErrorMessage: null,
                InputPayload: JSON.stringify({
                    continuation: 'message',
                    reinvokeDepth: 0,
                    failureSemantics: 'block',
                    submittedByAgentRunID: null,
                    submittedByUserID: fallbackUser.ID,
                }),
                Configuration: JSON.stringify({
                    governanceCheckpoint: {
                        CheckpointID: randomUUID(),
                        Status: 'Paused',
                        PauseReason: 'BudgetExceeded',
                        Summary: 'Loop paused after midnight',
                        PausedAtISO: new Date(afterMidnightMs).toISOString(),
                        CompletedNodeCount: 1,
                        CompletedNodeIDs: [yesterdayChildId],
                        CumulativeLedger: {
                            RunCostUsd: 0.90,
                            RunWallClockMs: 50_000,
                            RunTokens: 200,
                            RoutineCostUsd: 0,
                            RoutineWallClockMs: 0,
                            UserDailyCostUsd: 0.80,
                            UserDailyWallClockMs: 50_000,
                            PausedWallClockMs: 0,
                            PausedIntervals: [{ PausedAtMs: afterMidnightMs, ResumedAtMs: null }],
                            DayBucketUTC: '2026-11-22',
                            DayBoundaryTimezone: 'UTC',
                            AsOfISO: new Date(afterMidnightMs).toISOString(),
                        },
                    },
                }),
                __mj_UpdatedAt: new Date(afterMidnightMs),
            });

            const yesterdayChildRow: StoredTaskRow = {
                ID: yesterdayChildId,
                ParentID: overnightParentId,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Yesterday Child',
                Description: null,
                Status: 'Complete',
                StepType: 'Action',
                ActionID: ACTION_ID,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(yesterdayMs),
                CompletedAt: new Date(yesterdayMs + 60_000),
                PercentComplete: 100,
                ErrorMessage: null,
                InputPayload: null,
                OutputPayload: null,
                Configuration: JSON.stringify({ runtime: { governanceCostUsd: 0.10, governanceTokensUsed: 20 } }),
                __mj_UpdatedAt: new Date(yesterdayMs + 60_000),
            };
            const pausedLoopRow: StoredTaskRow = {
                ID: pausedLoopId,
                ParentID: overnightParentId,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Pending Paused Loop Without Events',
                Description: null,
                Status: 'Pending',
                StepType: 'ForEach',
                ActionID: ACTION_ID,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(afterMidnightMs - 60_000),
                CompletedAt: null,
                PercentComplete: 0,
                ErrorMessage: null,
                InputPayload: null,
                OutputPayload: null,
                Configuration: JSON.stringify({
                    runtime: {
                        loopCursor: {
                            Cursor: {
                                LoopType: 'ForEach',
                                NextIterationIndex: 4,
                                CompletedIndices: [0, 1, 2, 3],
                                PartialResults: [],
                                SucceededCount: 4,
                                FailedCount: 0,
                            },
                            LivePayload: {},
                            IterationTrace: [],
                            AccumulatedCostUsd: 0.80,
                            AccumulatedTokensUsed: 160,
                            IsOutputTainted: false,
                        },
                    },
                }),
                __mj_UpdatedAt: new Date(afterMidnightMs),
            };
            db.Tasks.set(yesterdayChildId.toLowerCase(), yesterdayChildRow);
            db.Tasks.set(pausedLoopId.toLowerCase(), pausedLoopRow);
            db.TasksByParent.set(overnightParentId.toLowerCase(), [yesterdayChildRow, pausedLoopRow]);

            // Current standalone Graph B incurs $0.15 today -> $0.80 (paused loop today) + $0.15 = $0.95 >= $0.90!
            const graphBParentId = randomUUID();
            const graphBParentRow: StoredTaskRow = {
                ID: graphBParentId,
                ParentID: null,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Current Standalone Graph B',
                Description: null,
                Status: 'In Progress',
                StepType: 'Action',
                ActionID: null,
                AgentID: null,
                PromptID: null,
                UserID: fallbackUser.ID,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 5_000),
                CompletedAt: null,
                PercentComplete: 0,
                ErrorMessage: null,
                InputPayload: JSON.stringify({
                    continuation: 'message',
                    reinvokeDepth: 0,
                    failureSemantics: 'block',
                    submittedByAgentRunID: null,
                    submittedByUserID: fallbackUser.ID,
                }),
                Configuration: null,
                __mj_UpdatedAt: new Date(nowMs),
            };
            const graphBChildId = randomUUID();
            const graphBChildRow: StoredTaskRow = {
                ID: graphBChildId,
                ParentID: graphBParentId,
                TypeID: WORKFLOW_TYPE_ID,
                Name: 'Graph B Step 1',
                Description: null,
                Status: 'Complete',
                StepType: 'Action',
                ActionID: ACTION_ID,
                AgentID: null,
                PromptID: null,
                UserID: null,
                AgentRunID: null,
                ConversationDetailID: null,
                ClaimedBy: null,
                ClaimExpiresAt: null,
                StartedAt: new Date(nowMs - 5_000),
                CompletedAt: new Date(nowMs),
                PercentComplete: 100,
                ErrorMessage: null,
                InputPayload: null,
                OutputPayload: null,
                Configuration: JSON.stringify({ runtime: { governanceCostUsd: 0.15, governanceTokensUsed: 30 } }),
                __mj_UpdatedAt: new Date(nowMs),
            };
            db.Tasks.set(graphBParentId.toLowerCase(), graphBParentRow);
            db.Tasks.set(graphBChildId.toLowerCase(), graphBChildRow);
            db.TasksByParent.set(graphBParentId.toLowerCase(), [graphBChildRow]);

            // Replacement coordinator 1 checks Pending loop cursor
            const coord1 = new TaskGraphGovernanceCoordinator(new TaskClaimStore('fallback-coord-1', 60));
            const evalPending = await coord1.RecordNodeSettlementAndEvaluate({
                Provider: provider,
                ContextUser: fallbackUser,
                Parent: db.wrapTaskPublic(graphBParentRow),
                Task: db.wrapTaskPublic(graphBChildRow),
                Success: true,
                CostUsd: 0.15,
                TokensUsed: 30,
            });
            expect(evalPending?.Exceeded).toBe(true);
            expect(evalPending?.Breach?.Scope).toBe('PerUserPerDay');
            expect(evalPending?.Ledger.UserDailyCostUsd).toBeCloseTo(0.95, 5);

            // Also verify In Progress resumed loop cursor is included without double-counting
            db.Tasks.delete(graphBParentId.toLowerCase());
            db.Tasks.delete(graphBChildId.toLowerCase());
            db.TasksByParent.delete(graphBParentId.toLowerCase());

            pausedLoopRow.Status = 'In Progress';
            const graphCParentId = randomUUID();
            const graphCParentRow: StoredTaskRow = {
                ...graphBParentRow,
                ID: graphCParentId,
                Name: 'Current Standalone Graph C',
                InputPayload: JSON.stringify({
                    continuation: 'message',
                    reinvokeDepth: 0,
                    failureSemantics: 'block',
                    submittedByAgentRunID: null,
                    submittedByUserID: fallbackUser.ID,
                }),
                Configuration: null,
            };
            const graphCChildId = randomUUID();
            const graphCChildRow: StoredTaskRow = {
                ...graphBChildRow,
                ID: graphCChildId,
                ParentID: graphCParentId,
                Name: 'Graph C Step 1',
            };
            db.Tasks.set(graphCParentId.toLowerCase(), graphCParentRow);
            db.Tasks.set(graphCChildId.toLowerCase(), graphCChildRow);
            db.TasksByParent.set(graphCParentId.toLowerCase(), [graphCChildRow]);

            const coord2 = new TaskGraphGovernanceCoordinator(new TaskClaimStore('fallback-coord-2', 60));
            const evalInProgress = await coord2.RecordNodeSettlementAndEvaluate({
                Provider: provider,
                ContextUser: fallbackUser,
                Parent: db.wrapTaskPublic(graphCParentRow),
                Task: db.wrapTaskPublic(graphCChildRow),
                Success: true,
                CostUsd: 0.15,
                TokensUsed: 30,
            });
            expect(evalInProgress?.Exceeded).toBe(true);
            expect(evalInProgress?.Ledger.UserDailyCostUsd).toBeCloseTo(0.95, 5);
        } finally {
            dateNowSpy.mockRestore();
        }
    });
});

describe('CR-DURABLE-LOOP-CEILING: 5-tier loop iteration & concurrency bounds in TaskGraphDispatcher', () => {
    beforeEach(() => {
        capturedErrors.length = 0;
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    it('enforces WorkflowMetadata, UserAgentPolicy, and unauthorized vs authorized RunOverride ceilings for ForEach and While loops including resume', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const ownerUser = {
            ID: '10000000-0000-4000-8000-000000000099',
            Name: 'Owner User',
            Email: 'owner@example.com',
            Type: 'Owner',
            IsActive: true,
        } as UserInfo;

        const store = globalThis as GovernanceTestGlobalStore;
        const priorUserCache = store.___SINGLETON__UserCache;
        store.___SINGLETON__UserCache = {
            Users: [TEST_USER, ownerUser],
            FindUser: async ({ ID }) => [TEST_USER, ownerUser].find((u) => u.ID.toLowerCase() === (ID ?? '').toLowerCase()),
        };

        try {
            db.UserPolicies = [
                {
                    ID: 'policy-loop-1',
                    AgentID: AGENT_ID,
                    UserID: TEST_USER.ID,
                    Status: 'Active',
                    InstructionsOverride:
                        '<!-- mj-limits: {"ForEachMaxIterations":3,"WhileLoopMaxIterations":4,"ResourceGuards":{"MaxLoopConcurrency":2}} -->',
                },
            ];

            // 1) Unauthorized explicit op.maxIterations (10) + unauthorized RunOverride (8) MUST clamp to UserAgentPolicy (3) and concurrency (2)
            let peakConcurrency = 0;
            let inFlight = 0;
            const forEachSeen: number[] = [];
            const disp1 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                TEST_USER,
                {
                    InstanceID: 'loop-ceiling-disp-1',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async (ctx) => {
                        inFlight++;
                        peakConcurrency = Math.max(peakConcurrency, inFlight);
                        forEachSeen.push(forEachSeen.length);
                        await new Promise((r) => setTimeout(r, 10));
                        inFlight--;
                        return { Success: true, Output: { ran: ctx.TaskID }, CostUsd: 0.01, TokensUsed: 10 };
                    },
                },
            );
            await disp1.Start();
            try {
                const service = new TaskGraphService();
                const subRes = await service.Submit(
                    {
                        workflowName: 'Unauthorized ForEach Ceiling Test',
                        tasks: [
                            {
                                tempId: 'fe-step',
                                name: 'ForEach Step',
                                description: 'Bounded ForEach',
                                kind: 'ForEach',
                                configuration: {
                                    collectionPath: 'static:[1,2,3,4,5,6,7,8,9,10]',
                                    maxIterations: 10,
                                    executionMode: 'parallel',
                                    maxConcurrency: 6,
                                    action: { name: 'StepAction', params: {} },
                                },
                            },
                        ],
                    },
                    {
                        EnvironmentID: 'env-1',
                        Provider: provider,
                        ContextUser: TEST_USER,
                        AgentID: AGENT_ID,
                        WorkflowMetadata: { ForEachMaxIterations: 7 },
                        LimitsOverride: { ForEachMaxIterations: 8, ResourceGuards: { MaxLoopConcurrency: 5 } },
                    },
                );
                expect(subRes.Success).toBe(true);
                await waitUntil(
                    () => db.Tasks.get(subRes.ParentTaskID!.toLowerCase())?.Status === 'Complete',
                    5_000,
                    () => disp1.Kick(),
                );
                expect(forEachSeen).toHaveLength(3);
                expect(peakConcurrency).toBeLessThanOrEqual(2);
            } finally {
                await disp1.Stop();
            }

            // 2) While loop: WorkflowMetadata (WhileLoopMaxIterations=3) + budget pause at 2 iterations -> resume in disp2 enforces ceiling 3 across resume!
            db.UserPolicies = [];
            AgentUserPolicyEngine.Instance.ClearCache();
            const whileRunId = '50000000-0000-4000-8000-000000000071';
            const whileRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
            whileRun.ID = whileRunId;
            whileRun.AgentID = AGENT_ID;
            whileRun.UserID = TEST_USER.ID;
            whileRun.Status = 'Running';
            await whileRun.Save();

            const whileCalls1: number[] = [];
            const dispWhile1 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                TEST_USER,
                {
                    InstanceID: 'while-ceiling-disp-1',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => {
                        whileCalls1.push(whileCalls1.length);
                        return { Success: true, Output: { keepGoing: true }, CostUsd: 0.05, TokensUsed: 50 };
                    },
                },
            );
            let whileParentId = '';
            let whileChildId = '';
            await dispWhile1.Start();
            try {
                const service = new TaskGraphService();
                const subWhile = await service.Submit(
                    {
                        workflowName: 'While Ceiling Pause/Resume Graph',
                        tasks: [
                            {
                                tempId: 'while-step',
                                name: 'While Step',
                                description: 'While with ceiling across resume',
                                kind: 'While',
                                configuration: {
                                    condition: 'true',
                                    maxIterations: 20, // above WorkflowMetadata=3 and UserPolicy=4 -> clamped to 3!
                                    action: { name: 'StepAction', params: {} },
                                },
                            },
                        ],
                    },
                    {
                        EnvironmentID: 'env-1',
                        Provider: provider,
                        ContextUser: TEST_USER,
                        AgentID: AGENT_ID,
                        AgentRunID: whileRunId,
                        WorkflowMetadata: { WhileLoopMaxIterations: 3 },
                        LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.09 } } },
                    },
                );
                expect(subWhile.Success).toBe(true);
                whileParentId = subWhile.ParentTaskID!;
                whileChildId = (db.TasksByParent.get(whileParentId.toLowerCase()) ?? [])[0].ID;

                await waitUntil(
                    () =>
                        dispWhile1.Governance.GetGraphDiagnostics(whileParentId)?.PausedByGovernance === true &&
                        db.Tasks.get(whileChildId.toLowerCase())?.Status === 'Pending',
                    5_000,
                    () => dispWhile1.Kick(),
                );
                expect(whileCalls1).toHaveLength(2);
            } finally {
                await dispWhile1.Stop();
            }

            // Resume in a fresh dispatcher: only 1 remaining iteration (index 2) runs before hitting the 3-iteration ceiling
            const whileCalls2: number[] = [];
            const dispWhile2 = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                TEST_USER,
                {
                    InstanceID: 'while-ceiling-disp-2',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => {
                        whileCalls2.push(whileCalls2.length);
                        return { Success: true, Output: { keepGoing: true }, CostUsd: 0.05, TokensUsed: 50 };
                    },
                },
            );
            await dispWhile2.Start();
            try {
                const approveRes = await dispWhile2.Governance.ApproveAndResumePausedGraph({
                    ParentTaskID: whileParentId,
                    Provider: provider,
                    ContextUser: TEST_USER,
                    BudgetExtension: { NewPerRunMaxCostUsd: 5.0 },
                });
                expect(approveRes.Success).toBe(true);

                await waitUntil(
                    () => db.Tasks.get(whileParentId.toLowerCase())?.Status === 'Complete',
                    5_000,
                    () => dispWhile2.Kick(),
                );
                expect(whileCalls2).toHaveLength(1);
                const completedWhileOut = JSON.parse(db.Tasks.get(whileChildId.toLowerCase())!.OutputPayload!) as { iterations: number };
                expect(completedWhileOut.iterations).toBe(3);
            } finally {
                await dispWhile2.Stop();
            }

            // 3) Authorized Owner principal raising ceiling via Tier-5 RunOverride (ForEachMaxIterations: 5 > UserPolicy: 3)
            AgentUserPolicyEngine.Instance.ClearCache();
            db.UserPolicies = [
                {
                    ID: 'policy-loop-owner',
                    AgentID: AGENT_ID,
                    UserID: ownerUser.ID,
                    Status: 'Active',
                    InstructionsOverride: '<!-- mj-limits: {"ForEachMaxIterations":3} -->',
                },
            ];
            const ownerSeen: number[] = [];
            const dispOwner = new TaskGraphDispatcher(
                { CreateProvider: async () => provider },
                { RunAgentForTask: async () => ({ Success: true }) },
                ownerUser,
                {
                    InstanceID: 'owner-ceiling-disp',
                    MaxConcurrentTasks: 1,
                    PollIntervalSeconds: 0.01,
                    HeartbeatIntervalSeconds: 60,
                    ReconciliationIntervalSeconds: 60,
                },
                undefined,
                undefined,
                {
                    RunActionForTask: async () => {
                        ownerSeen.push(ownerSeen.length);
                        return { Success: true, Output: { idx: ownerSeen.length }, CostUsd: 0.01, TokensUsed: 10 };
                    },
                },
            );
            await dispOwner.Start();
            try {
                const service = new TaskGraphService();
                const ownerSub = await service.Submit(
                    {
                        workflowName: 'Authorized Owner ForEach Override',
                        tasks: [
                            {
                                tempId: 'fe-owner',
                                name: 'ForEach Owner',
                                description: 'Authorized override',
                                kind: 'ForEach',
                                configuration: {
                                    collectionPath: 'static:[1,2,3,4,5,6,7]',
                                    action: { name: 'StepAction', params: {} },
                                },
                            },
                        ],
                    },
                    {
                        EnvironmentID: 'env-1',
                        Provider: provider,
                        ContextUser: ownerUser,
                        AgentID: AGENT_ID,
                        LimitsOverride: { ForEachMaxIterations: 5 },
                    },
                );
                expect(ownerSub.Success).toBe(true);
                await waitUntil(
                    () => db.Tasks.get(ownerSub.ParentTaskID!.toLowerCase())?.Status === 'Complete',
                    5_000,
                    () => dispOwner.Kick(),
                );
                expect(ownerSeen).toHaveLength(5);
            } finally {
                await dispOwner.Stop();
            }
        } finally {
            store.___SINGLETON__UserCache = priorUserCache;
        }
    });
});

describe('CR-PRODUCTION-WORKFLOW-USAGE: Prompt/Agent billing propagation, durable recovery, and no double-counting', () => {
    beforeEach(() => {
        capturedErrors.length = 0;
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    it('recovers billing from persisted PromptRunID and AgentRunID without double-counting across graph & agent ledgers, including prompt-bodied loop pause & resume', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const PROMPT_ID = '70000000-0000-4000-8000-000000000001';
        db.Prompts = [{ ID: PROMPT_ID, Name: 'LoopPrompt' }];
        db.Agents = [{ ID: AGENT_ID, Name: 'WorkerAgent' }];

        // 1) Pre-populated settled Prompt & Agent nodes with NO inline governanceCostUsd -> Coordinator hydration MUST recover from PromptRuns & AgentRuns!
        const parentId = randomUUID();
        const submitRunId = randomUUID();
        const childAgentRunId = randomUUID();
        const childPromptRunId = randomUUID();

        db.AgentRuns.set(submitRunId.toLowerCase(), {
            ID: submitRunId,
            AgentID: AGENT_ID,
            UserID: TEST_USER.ID,
            ParentRunID: null,
            ScheduledJobRunID: ROUTINE_ID,
            Status: 'Running',
            StartedAt: new Date(Date.now() - 10_000),
            CompletedAt: null,
            Success: null,
            ErrorMessage: null,
            Message: null,
            TotalCost: 0,
            TotalCostRollup: 0,
            Data: null,
            Steps: [],
        });
        db.AgentRuns.set(childAgentRunId.toLowerCase(), {
            ID: childAgentRunId,
            AgentID: AGENT_ID,
            UserID: TEST_USER.ID,
            ParentRunID: null, // intentionally unlinked ParentRunID to prove KnownChildAgentRunIDs prevents double-counting!
            ScheduledJobRunID: ROUTINE_ID,
            Status: 'Completed',
            StartedAt: new Date(Date.now() - 8_000),
            CompletedAt: new Date(Date.now() - 6_000),
            Success: true,
            ErrorMessage: null,
            Message: null,
            TotalCost: 0.30,
            TotalCostRollup: 0.30,
            TotalTokensUsed: 1500,
            Data: null,
            Steps: [],
        });
        db.PromptRuns.set(childPromptRunId.toLowerCase(), {
            ID: childPromptRunId,
            PromptID: PROMPT_ID,
            TotalCost: 0.20,
            TokensUsed: 800,
            Success: true,
        });

        const parentRow: StoredTaskRow = {
            ID: parentId,
            ParentID: null,
            TypeID: WORKFLOW_TYPE_ID,
            Name: 'Hydrated Billing Graph',
            Description: null,
            Status: 'In Progress',
            StepType: 'Action',
            ActionID: null,
            AgentID: AGENT_ID,
            PromptID: null,
            UserID: TEST_USER.ID,
            AgentRunID: submitRunId,
            ConversationDetailID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: new Date(Date.now() - 10_000),
            CompletedAt: null,
            PercentComplete: 50,
            ErrorMessage: null,
            InputPayload: JSON.stringify({
                continuation: 'message',
                reinvokeDepth: 0,
                failureSemantics: 'block',
                submittedByAgentRunID: submitRunId,
                submittedByAgentID: AGENT_ID,
                submittedByUserID: TEST_USER.ID,
                routineID: ROUTINE_ID,
                governanceEnabled: true,
                limitsOverride: {
                    Budgets: {
                        PerRun: { MaxCostUsd: 2.0 },
                        PerRoutine: { MaxCostUsd: 0.65 },
                    },
                },
            }),
            Configuration: null,
            __mj_UpdatedAt: new Date(),
        };
        const settledAgentTaskRow: StoredTaskRow = {
            ID: randomUUID(),
            ParentID: parentId,
            TypeID: WORKFLOW_TYPE_ID,
            Name: 'Child Agent Task',
            Description: null,
            Status: 'Complete',
            StepType: 'Agent',
            ActionID: null,
            AgentID: AGENT_ID,
            PromptID: null,
            UserID: null,
            AgentRunID: childAgentRunId,
            ConversationDetailID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: new Date(Date.now() - 8_000),
            CompletedAt: new Date(Date.now() - 6_000),
            PercentComplete: 100,
            ErrorMessage: null,
            InputPayload: null,
            OutputPayload: '{"ok":true}',
            Configuration: JSON.stringify({ runtime: {} }), // no governanceCostUsd!
            __mj_UpdatedAt: new Date(),
        };
        const settlingPromptTaskRow: StoredTaskRow = {
            ...settledAgentTaskRow,
            ID: randomUUID(),
            Name: 'Child Prompt Task',
            StepType: 'Prompt',
            AgentID: null,
            PromptID: PROMPT_ID,
            AgentRunID: null,
            Configuration: JSON.stringify({ runtime: { promptRunID: childPromptRunId } }),
        };
        db.Tasks.set(parentId.toLowerCase(), parentRow);
        db.Tasks.set(settledAgentTaskRow.ID.toLowerCase(), settledAgentTaskRow);
        db.Tasks.set(settlingPromptTaskRow.ID.toLowerCase(), settlingPromptTaskRow);
        db.TasksByParent.set(parentId.toLowerCase(), [settledAgentTaskRow, settlingPromptTaskRow]);

        const coordHydrate = new TaskGraphGovernanceCoordinator(new TaskClaimStore('billing-hydrate-coord', 60));
        // Settle the prompt task WITHOUT inline CostUsd/TokensUsed -> recovers $0.20 + 800 tokens from PromptRuns AND hydrates $0.30 + 1500 tokens from AgentRuns without double-counting childAgentRunId!
        const evalRes = await coordHydrate.RecordNodeSettlementAndEvaluate({
            Provider: provider,
            ContextUser: TEST_USER,
            Parent: db.wrapTaskPublic(parentRow),
            Task: db.wrapTaskPublic(settlingPromptTaskRow),
            Success: true,
            PromptRunID: childPromptRunId,
        });
        expect(evalRes?.Ledger.RunCostUsd).toBeCloseTo(0.50, 5);
        expect(evalRes?.Ledger.RunTokens).toBe(2300);
        // Routine cost MUST be $0.50 (NOT $0.80 double-counting childAgentRunId!)
        expect(evalRes?.Ledger.RoutineCostUsd).toBeCloseTo(0.50, 5);
        expect(evalRes?.Exceeded).toBe(false);

        // 2) End-to-end prompt-bodied ForEach loop through TaskGraphDispatcher: propagates prompt CostUsd/TokensUsed,
        //    triggers budget checkpoint pause at 2 items, and accumulates correctly after approve & resume!
        const loopRunId = '50000000-0000-4000-8000-000000000072';
        const loopRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        loopRun.ID = loopRunId;
        loopRun.AgentID = AGENT_ID;
        loopRun.UserID = TEST_USER.ID;
        loopRun.Status = 'Running';
        await loopRun.Save();

        let promptPass = 0;
        const makePromptRunner = (): TaskPromptRunner => ({
            RunPromptForTask: async () => {
                promptPass++;
                const prId = randomUUID();
                db.PromptRuns.set(prId.toLowerCase(), {
                    ID: prId,
                    PromptID: PROMPT_ID,
                    TotalCost: 0.15,
                    TokensUsed: 300,
                    Success: true,
                });
                return {
                    Success: true,
                    Output: { pass: promptPass },
                    PromptRunID: prId,
                    CostUsd: 0.15,
                    TokensUsed: 300,
                };
            },
        });

        const dispLoop1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'prompt-loop-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            undefined,
            makePromptRunner(),
        );
        let loopParentId = '';
        let loopChildId = '';
        await dispLoop1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(
                {
                    workflowName: 'Prompt ForEach Billing Graph',
                    tasks: [
                        {
                            tempId: 'prompt-fe',
                            name: 'Prompt ForEach',
                            description: 'Prompt-bodied loop',
                            kind: 'ForEach',
                            configuration: {
                                collectionPath: 'static:["a","b","c"]',
                                prompt: { name: 'LoopPrompt' },
                            },
                        },
                    ],
                },
                {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: TEST_USER,
                    AgentID: AGENT_ID,
                    AgentRunID: loopRunId,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
                },
            );
            expect(subRes.Success).toBe(true);
            loopParentId = subRes.ParentTaskID!;
            loopChildId = (db.TasksByParent.get(loopParentId.toLowerCase()) ?? [])[0].ID;

            await waitUntil(
                () =>
                    dispLoop1.Governance.GetGraphDiagnostics(loopParentId)?.PausedByGovernance === true &&
                    db.Tasks.get(loopChildId.toLowerCase())?.Status === 'Pending',
                5_000,
                () => dispLoop1.Kick(),
            );
            expect(promptPass).toBe(2);
            expect(dispLoop1.Governance.GetGraphDiagnostics(loopParentId)?.CumulativeCostUsd).toBeCloseTo(0.30, 5);
            expect(dispLoop1.Governance.GetGraphDiagnostics(loopParentId)?.TokensUsed).toBe(600);
        } finally {
            await dispLoop1.Stop();
        }

        const dispLoop2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'prompt-loop-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
            },
            undefined,
            undefined,
            undefined,
            makePromptRunner(),
        );
        await dispLoop2.Start();
        try {
            const approveRes = await dispLoop2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: loopParentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 2.0 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(loopParentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => dispLoop2.Kick(),
            );
            expect(promptPass).toBe(3);
            const settledTask = db.Tasks.get(loopChildId.toLowerCase())!;
            const settledCfg = JSON.parse(settledTask.Configuration!) as TaskStepConfiguration;
            expect(settledCfg.runtime?.governanceCostUsd).toBeCloseTo(0.45, 5);
            expect(settledCfg.runtime?.governanceTokensUsed).toBe(900);
        } finally {
            await dispLoop2.Stop();
        }
    });
});

describe('CR-WORKFLOW-AMBIGUOUS-JUDGE: FastConvergenceJudge integration in TaskGraphGovernanceCoordinator', () => {
    beforeEach(() => {
        capturedErrors.length = 0;
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    function buildNodeAndParent(db: GovernanceInMemoryDb, limitsOverride: NonNullable<TaskGraphSpec['limitsOverride']>, submitRunId: string | null = null) {
        const parentId = randomUUID();
        const parentRow: StoredTaskRow = {
            ID: parentId,
            ParentID: null,
            TypeID: WORKFLOW_TYPE_ID,
            Name: 'Ambiguous Judge Graph',
            Description: null,
            Status: 'In Progress',
            StepType: 'Action',
            ActionID: null,
            AgentID: AGENT_ID,
            PromptID: null,
            UserID: TEST_USER.ID,
            AgentRunID: submitRunId,
            ConversationDetailID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: new Date(),
            CompletedAt: null,
            PercentComplete: 0,
            ErrorMessage: null,
            InputPayload: JSON.stringify({
                continuation: 'message',
                reinvokeDepth: 0,
                failureSemantics: 'block',
                submittedByAgentRunID: submitRunId,
                submittedByAgentID: AGENT_ID,
                submittedByUserID: TEST_USER.ID,
                routineID: ROUTINE_ID,
                governanceEnabled: true,
                limitsOverride,
            }),
            Configuration: null,
            __mj_UpdatedAt: new Date(),
        };
        db.Tasks.set(parentId.toLowerCase(), parentRow);
        return { parentId, parentRow };
    }

    function makeChildTask(db: GovernanceInMemoryDb, parentId: string, name: string, outputPayload: string): StoredTaskRow {
        const row: StoredTaskRow = {
            ID: randomUUID(),
            ParentID: parentId,
            TypeID: WORKFLOW_TYPE_ID,
            Name: name,
            Description: null,
            Status: 'Complete',
            StepType: 'Action',
            ActionID: ACTION_ID,
            AgentID: null,
            PromptID: null,
            UserID: null,
            AgentRunID: null,
            ConversationDetailID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: new Date(),
            CompletedAt: new Date(),
            PercentComplete: 100,
            ErrorMessage: null,
            InputPayload: null,
            OutputPayload: outputPayload,
            Configuration: JSON.stringify({ runtime: { governanceCostUsd: 0.02, governanceTokensUsed: 100 } }),
            __mj_UpdatedAt: new Date(),
        };
        db.Tasks.set(row.ID.toLowerCase(), row);
        const list = db.TasksByParent.get(parentId.toLowerCase()) ?? [];
        list.push(row);
        db.TasksByParent.set(parentId.toLowerCase(), list);
        return row;
    }

    it('never invokes FastConvergenceJudge on Converging or Stalled, invokes strictly on Ambiguous, attributes judge usage, and pauses on non-convergence with resume', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const judgeCalls: Array<{ Iteration: number; StateSummary: string }> = [];
        let nextVerdict: FastConvergenceJudgeResult = {
            Converging: true,
            Reason: 'Making incremental progress across batches',
            LatencyMs: 12,
            TimedOut: false,
            UsedFallback: false,
            Source: 'Model',
            CostUsd: 0.03,
            TokensUsed: 150,
        };

        const coord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('judge-coord-1', 60), {
            EvaluateProgress: true,
            FastConvergenceJudgeEvaluator: async (input) => {
                judgeCalls.push({ Iteration: input.Iteration, StateSummary: input.StateSummary });
                return nextVerdict;
            },
        });

        // 1) Progressing (Converging) samples -> judge NOT called
        const { parentId: convParentId, parentRow: convParent } = buildNodeAndParent(db, {
            Budgets: { PerRun: { MaxCostUsd: 10 } },
            ProgressDetector: {
                Enabled: true,
                MinIterationsBeforeCheck: 3,
                WindowSize: 3,
                FastJudgeEnabled: true,
            },
        });
        for (let i = 1; i <= 3; i++) {
            const child = makeChildTask(db, convParentId, `ConvStep-${i}`, JSON.stringify({ step: i, detail: `distinct-${i}` }));
            await coord.RecordNodeSettlementAndEvaluate({
                Provider: provider,
                ContextUser: TEST_USER,
                Parent: db.wrapTaskPublic(convParent),
                Task: db.wrapTaskPublic(child),
                Success: true,
                CostUsd: 0.02,
                TokensUsed: 100,
            });
        }
        expect(coord.GetGraphDiagnostics(convParentId)?.LastProgressResult?.Classification).toBe('Converging');
        expect(judgeCalls).toHaveLength(0);

        // 2) Stalled samples (via EvaluateLoopIterationGovernance with identical outputs) -> judge NOT called, pauses as ProgressStalled
        const { parentId: stallParentId, parentRow: stallParent } = buildNodeAndParent(db, {
            Budgets: { PerRun: { MaxCostUsd: 10 } },
            ProgressDetector: {
                Enabled: true,
                MinIterationsBeforeCheck: 3,
                WindowSize: 3,
                NoPayloadDeltaWindowCount: 3,
                FastJudgeEnabled: true,
            },
        });
        const stallLoopTask = makeChildTask(db, stallParentId, 'StallLoop', '{}');
        stallLoopTask.Status = 'In Progress';
        for (let i = 0; i < 3; i++) {
            const verdict = await coord.EvaluateLoopIterationGovernance({
                Provider: provider,
                ContextUser: TEST_USER,
                Parent: db.wrapTaskPublic(stallParent),
                Task: db.wrapTaskPublic(stallLoopTask),
                LoopType: 'While',
                IterationIndex: i,
                CompletedIterations: i + 1,
                AccumulatedLoopCostUsd: (i + 1) * 0.02,
                AccumulatedLoopTokensUsed: (i + 1) * 100,
                LivePayload: { fixed: true },
                LastOutcome: { Success: true, Output: { same: 'output' }, CostUsd: 0.02, TokensUsed: 100 },
            });
            if (i < 2) expect(verdict.ShouldPause).toBe(false);
            else expect(verdict.ShouldPause).toBe(true);
        }
        expect(coord.GetGraphDiagnostics(stallParentId)?.LastProgressResult?.Classification).toBe('Stalled');
        expect(judgeCalls).toHaveLength(0);

        // 3) Ambiguous samples in EvaluateLoopIterationGovernance:
        //    - distinct outputs (novel) with 0 records/tasks closed & token spend -> composite score ~0.48 in [0.25, 0.65) => Ambiguous!
        const submitRunId = randomUUID();
        db.AgentRuns.set(submitRunId.toLowerCase(), {
            ID: submitRunId,
            AgentID: AGENT_ID,
            UserID: TEST_USER.ID,
            ParentRunID: null,
            ScheduledJobRunID: ROUTINE_ID,
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
        });
        const { parentId: ambParentId, parentRow: ambParent } = buildNodeAndParent(
            db,
            {
                Budgets: { PerRun: { MaxCostUsd: 10 } },
                ProgressDetector: {
                    Enabled: true,
                    MinIterationsBeforeCheck: 3,
                    WindowSize: 3,
                    NoPayloadDeltaWindowCount: 5,
                    AmbiguityLowScoreThreshold: 0.25,
                    AmbiguityHighScoreThreshold: 0.65,
                    FastJudgeEnabled: true,
                    FastJudgeMinIntervalIterations: 2,
                    FastJudgeMaxInputChars: 120,
                    FastJudgeTimeoutMs: 150,
                    FastJudgeFailureFallback: 'ContinueWithWarning',
                },
            },
            submitRunId,
        );
        const ambLoopTask = makeChildTask(db, ambParentId, 'AmbiguousLoop', '{}');
        ambLoopTask.Status = 'In Progress';

        const ambLoopOutputs = [
            'Evaluating partition 1 candidate index selectivity and residual filter predicates',
            'Evaluating partition 2 candidate index selectivity and residual filter predicates',
            'Evaluating partition 3 candidate index selectivity and residual filter predicates',
            'Evaluating partition 4 candidate index selectivity and residual filter predicates',
            'Evaluating partition 5 candidate index selectivity and residual filter predicates',
        ];

        // Iterations 0..2: at iter 2 (3rd sample), detector classifies Ambiguous -> judge called (Converging: true, CostUsd: 0.03, TokensUsed: 150)
        for (let i = 0; i < 3; i++) {
            const verdict = await coord.EvaluateLoopIterationGovernance({
                Provider: provider,
                ContextUser: TEST_USER,
                Parent: db.wrapTaskPublic(ambParent),
                Task: db.wrapTaskPublic(ambLoopTask),
                LoopType: 'While',
                IterationIndex: i,
                CompletedIterations: i + 1,
                AccumulatedLoopCostUsd: (i + 1) * 0.02,
                AccumulatedLoopTokensUsed: (i + 1) * 200,
                LivePayload: { phase: i % 2 },
                LastOutcome: {
                    Success: true,
                    Output: ambLoopOutputs[i],
                    CostUsd: 0.02,
                    TokensUsed: 200,
                },
            });
            expect(verdict.ShouldPause).toBe(false);
        }
        expect(judgeCalls).toHaveLength(1);
        expect(judgeCalls[0].StateSummary.length).toBeLessThanOrEqual(120);
        const diagAfterConverging = coord.GetGraphDiagnostics(ambParentId)!;
        expect(diagAfterConverging.FastJudgeCostUsd).toBeCloseTo(0.03, 5);
        expect(diagAfterConverging.FastJudgeTokensUsed).toBe(150);
        expect(diagAfterConverging.CumulativeCostUsd).toBeCloseTo(0.09, 5); // 0.06 loop + 0.03 judge
        expect(diagAfterConverging.FastJudgeEntries).toHaveLength(1);
        expect(diagAfterConverging.FastJudgeEntries[0].Converging).toBe(true);

        // Iteration 3 (within FastJudgeMinIntervalIterations=2 cooldown: 4 - 3 < 2) -> judge NOT invoked!
        const cooldownVerdict = await coord.EvaluateLoopIterationGovernance({
            Provider: provider,
            ContextUser: TEST_USER,
            Parent: db.wrapTaskPublic(ambParent),
            Task: db.wrapTaskPublic(ambLoopTask),
            LoopType: 'While',
            IterationIndex: 3,
            CompletedIterations: 4,
            AccumulatedLoopCostUsd: 0.08,
            AccumulatedLoopTokensUsed: 800,
            LivePayload: { phase: 1 },
            LastOutcome: { Success: true, Output: ambLoopOutputs[3], CostUsd: 0.02, TokensUsed: 200 },
        });
        expect(cooldownVerdict.ShouldPause).toBe(false);
        expect(judgeCalls).toHaveLength(1);

        // Iteration 4 (after cooldown: 5 - 3 >= 2) with Converging: false -> pauses non-destructively as FastJudgeStalled and supports ApproveAndResumePausedGraph!
        nextVerdict = {
            Converging: false,
            Reason: 'Oscillating without converging toward exit condition',
            LatencyMs: 18,
            TimedOut: false,
            UsedFallback: false,
            Source: 'Model',
            CostUsd: 0.04,
            TokensUsed: 200,
        };
        const stalledVerdict = await coord.EvaluateLoopIterationGovernance({
            Provider: provider,
            ContextUser: TEST_USER,
            Parent: db.wrapTaskPublic(ambParent),
            Task: db.wrapTaskPublic(ambLoopTask),
            LoopType: 'While',
            IterationIndex: 4,
            CompletedIterations: 5,
            AccumulatedLoopCostUsd: 0.10,
            AccumulatedLoopTokensUsed: 1000,
            LivePayload: { phase: 0 },
            LastOutcome: { Success: true, Output: ambLoopOutputs[4], CostUsd: 0.02, TokensUsed: 200 },
        });
        expect(judgeCalls).toHaveLength(2);
        expect(stalledVerdict.ShouldPause).toBe(true);
        expect(coord.GetGraphDiagnostics(ambParentId)?.PausedByGovernance).toBe(true);
        expect(coord.GetGraphDiagnostics(ambParentId)?.FastJudgeCostUsd).toBeCloseTo(0.07, 5);
        expect(coord.GetGraphDiagnostics(ambParentId)?.CumulativeCostUsd).toBeCloseTo(0.17, 5);

        const persistedCp = ExtractRunawayCheckpointFromRunData(db.AgentRuns.get(submitRunId.toLowerCase())?.Data);
        expect(persistedCp?.PauseReason).toBe('FastJudgeStalled');
        expect(persistedCp?.Evidence.FastJudgeResult?.Converging).toBe(false);

        const resumeRes = await coord.ApproveAndResumePausedGraph({
            ParentTaskID: ambParentId,
            Provider: provider,
            ContextUser: TEST_USER,
            BudgetExtension: { ResetProgressDetectorWindow: true },
        });
        expect(resumeRes.Success).toBe(true);
        expect(coord.GetGraphDiagnostics(ambParentId)?.PausedByGovernance).toBe(false);

        // 4) RecordNodeSettlementAndEvaluate ALSO invokes FastConvergenceJudge on Ambiguous node settlements
        const { parentId: nodeAmbParentId, parentRow: nodeAmbParent } = buildNodeAndParent(db, {
            Budgets: { PerRun: { MaxCostUsd: 10 } },
            ProgressDetector: {
                Enabled: true,
                MinIterationsBeforeCheck: 3,
                WindowSize: 3,
                NoPayloadDeltaWindowCount: 5,
                RepeatingErrorWindowCount: 5,
                AmbiguityLowScoreThreshold: 0.25,
                AmbiguityHighScoreThreshold: 0.65,
                FastJudgeEnabled: true,
                FastJudgeMinIntervalIterations: 1,
            },
        });
        for (let i = 0; i < 3; i++) {
            const child = makeChildTask(db, nodeAmbParentId, `AmbStep-${i}`, ambLoopOutputs[i]);
            child.Status = 'Failed';
            child.ErrorMessage = `retryable-transient-${i}`;
            await coord.RecordNodeSettlementAndEvaluate({
                Provider: provider,
                ContextUser: TEST_USER,
                Parent: db.wrapTaskPublic(nodeAmbParent),
                Task: db.wrapTaskPublic(child),
                Success: false,
                CostUsd: 0.02,
                TokensUsed: 200,
            });
        }
        expect(judgeCalls).toHaveLength(3);
        expect(coord.GetGraphDiagnostics(nodeAmbParentId)?.PausedByGovernance).toBe(true);
        expect(coord.GetGraphDiagnostics(nodeAmbParentId)?.LastProgressResult?.FastJudgeInvoked).toBe(true);
    });

    it('applies ContinueWithWarning fallback on sub-200ms timeout and invalid judge responses, attributing late-settled judge usage', async () => {
        const db = new GovernanceInMemoryDb();
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        let mode: 'timeout' | 'invalid' = 'timeout';
        const coord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('judge-fallback-coord', 60), {
            EvaluateProgress: true,
            FastConvergenceJudgeEvaluator: async () => {
                if (mode === 'timeout') {
                    await new Promise((resolve) => setTimeout(resolve, 120));
                    return {
                        Converging: true,
                        Reason: 'Late response after 40ms deadline',
                        LatencyMs: 120,
                        TimedOut: false,
                        UsedFallback: false,
                        Source: 'Model',
                        CostUsd: 0.05,
                        TokensUsed: 250,
                    };
                }
                // Invalid response missing required boolean Converging
                const malformed = {
                    Converging: true,
                    Reason: 'malformed',
                    LatencyMs: 1,
                    TimedOut: false,
                    UsedFallback: false,
                    Source: 'Model' as const,
                };
                Reflect.deleteProperty(malformed, 'Converging');
                return malformed;
            },
        });

        const parentId = randomUUID();
        const parentRow: StoredTaskRow = {
            ID: parentId,
            ParentID: null,
            TypeID: WORKFLOW_TYPE_ID,
            Name: 'Timeout Fallback Judge Graph',
            Description: null,
            Status: 'In Progress',
            StepType: 'Action',
            ActionID: null,
            AgentID: AGENT_ID,
            PromptID: null,
            UserID: TEST_USER.ID,
            AgentRunID: null,
            ConversationDetailID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: new Date(),
            CompletedAt: null,
            PercentComplete: 0,
            ErrorMessage: null,
            InputPayload: JSON.stringify({
                continuation: 'message',
                reinvokeDepth: 0,
                failureSemantics: 'block',
                submittedByUserID: TEST_USER.ID,
                governanceEnabled: true,
                limitsOverride: {
                    Budgets: { PerRun: { MaxCostUsd: 10 } },
                    ProgressDetector: {
                        Enabled: true,
                        MinIterationsBeforeCheck: 3,
                        WindowSize: 3,
                        NoPayloadDeltaWindowCount: 5,
                        AmbiguityLowScoreThreshold: 0.25,
                        AmbiguityHighScoreThreshold: 0.65,
                        FastJudgeEnabled: true,
                        FastJudgeTimeoutMs: 40,
                        FastJudgeMinIntervalIterations: 1,
                        FastJudgeFailureFallback: 'ContinueWithWarning',
                    },
                },
            }),
            Configuration: null,
            __mj_UpdatedAt: new Date(),
        };
        db.Tasks.set(parentId.toLowerCase(), parentRow);

        const loopTask: StoredTaskRow = {
            ID: randomUUID(),
            ParentID: parentId,
            TypeID: WORKFLOW_TYPE_ID,
            Name: 'FallbackLoop',
            Description: null,
            Status: 'In Progress',
            StepType: 'While',
            ActionID: ACTION_ID,
            AgentID: null,
            PromptID: null,
            UserID: null,
            AgentRunID: null,
            ConversationDetailID: null,
            ClaimedBy: null,
            ClaimExpiresAt: null,
            StartedAt: new Date(),
            CompletedAt: null,
            PercentComplete: 0,
            ErrorMessage: null,
            InputPayload: null,
            OutputPayload: null,
            Configuration: null,
            __mj_UpdatedAt: new Date(),
        };
        db.Tasks.set(loopTask.ID.toLowerCase(), loopTask);

        const fallbackOutputs = [
            'Evaluating partition 1 candidate index selectivity and residual filter predicates',
            'Evaluating partition 2 candidate index selectivity and residual filter predicates',
            'Evaluating partition 3 candidate index selectivity and residual filter predicates',
            'Evaluating partition 4 candidate index selectivity and residual filter predicates',
        ];

        // 1) Timeout fallback does NOT block beyond ~40ms, returns ShouldPause: false, and records late-settled usage after WaitForPendingJudgeEvaluations
        for (let i = 0; i < 3; i++) {
            const t0 = Date.now();
            const verdict = await coord.EvaluateLoopIterationGovernance({
                Provider: provider,
                ContextUser: TEST_USER,
                Parent: db.wrapTaskPublic(parentRow),
                Task: db.wrapTaskPublic(loopTask),
                LoopType: 'While',
                IterationIndex: i,
                CompletedIterations: i + 1,
                AccumulatedLoopCostUsd: (i + 1) * 0.01,
                AccumulatedLoopTokensUsed: (i + 1) * 200,
                LivePayload: { phase: i % 2 },
                LastOutcome: {
                    Success: true,
                    Output: fallbackOutputs[i],
                    CostUsd: 0.01,
                    TokensUsed: 200,
                },
            });
            expect(verdict.ShouldPause).toBe(false);
            if (i === 2) {
                expect(Date.now() - t0).toBeLessThan(110);
            }
        }
        expect(coord.GetGraphDiagnostics(parentId)?.LastProgressResult?.FastJudgeResult?.TimedOut).toBe(true);
        expect(coord.GetGraphDiagnostics(parentId)?.LastProgressResult?.FastJudgeResult?.UsedFallback).toBe(true);
        await coord.WaitForPendingJudgeEvaluations(parentId);
        expect(coord.GetGraphDiagnostics(parentId)?.FastJudgeCostUsd).toBeCloseTo(0.05, 5);
        expect(coord.GetGraphDiagnostics(parentId)?.FastJudgeTokensUsed).toBe(250);

        // 2) Invalid judge response applies ContinueWithWarning fallback
        mode = 'invalid';
        const invalidVerdict = await coord.EvaluateLoopIterationGovernance({
            Provider: provider,
            ContextUser: TEST_USER,
            Parent: db.wrapTaskPublic(parentRow),
            Task: db.wrapTaskPublic(loopTask),
            LoopType: 'While',
            IterationIndex: 3,
            CompletedIterations: 4,
            AccumulatedLoopCostUsd: 0.04,
            AccumulatedLoopTokensUsed: 800,
            LivePayload: { phase: 1 },
            LastOutcome: { Success: true, Output: fallbackOutputs[3], CostUsd: 0.01, TokensUsed: 200 },
        });
        expect(invalidVerdict.ShouldPause).toBe(false);
        expect(coord.GetGraphDiagnostics(parentId)?.LastProgressResult?.FastJudgeResult?.UsedFallback).toBe(true);
        expect(coord.GetGraphDiagnostics(parentId)?.LastProgressResult?.FastJudgeResult?.Reason).toContain('invalid response');
    });
});

describe('CR-PRODUCTION-WORKFLOW-USAGE: failed retryable attempt billing, budget pause before retry, and durable recovery', () => {
    const PROMPT_ID = '70000000-0000-4000-8000-000000000099';

    beforeEach(() => {
        capturedErrors.length = 0;
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    it('pauses non-destructively before retrying a paid prompt failure exceeding PerRun budget, survives dispatcher replacement, and settles with exact sum of all attempts', async () => {
        const db = new GovernanceInMemoryDb();
        db.Agents.push({ ID: AGENT_ID, Name: 'Retry Budget Agent', Status: 'Active' });
        db.Prompts.push({ ID: PROMPT_ID, Name: 'RetryablePrompt' });
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const runId = '50000000-0000-4000-8000-000000000091';
        const submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        submitRun.ID = runId;
        submitRun.AgentID = AGENT_ID;
        submitRun.UserID = TEST_USER.ID;
        submitRun.Status = 'Running';
        await submitRun.Save();

        let promptAttempts = 0;
        const attempt1PromptRunId = '80000000-0000-4000-8000-000000000001';
        const attempt2PromptRunId = '80000000-0000-4000-8000-000000000002';
        const makePromptRunner = (): TaskPromptRunner => ({
            RunPromptForTask: async () => {
                promptAttempts++;
                if (promptAttempts === 1) {
                    db.PromptRuns.set(attempt1PromptRunId, {
                        ID: attempt1PromptRunId,
                        PromptID: PROMPT_ID,
                        TotalCost: 0.30,
                        TokensUsed: 1000,
                        Success: false,
                    });
                    return {
                        Success: false,
                        ErrorMessage: 'Transient provider timeout',
                        PromptRunID: attempt1PromptRunId,
                        CostUsd: 0.30,
                        TokensUsed: 1000,
                    };
                }
                db.PromptRuns.set(attempt2PromptRunId, {
                    ID: attempt2PromptRunId,
                    PromptID: PROMPT_ID,
                    TotalCost: 0.20,
                    TokensUsed: 700,
                    Success: true,
                });
                return {
                    Success: true,
                    Output: { summary: 'Recovered on attempt 2' },
                    PromptRunID: attempt2PromptRunId,
                    CostUsd: 0.20,
                    TokensUsed: 700,
                };
            },
        });

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'retry-budget-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
                RetryBackoffBaseMs: 5,
            },
            undefined,
            undefined,
            undefined,
            makePromptRunner(),
        );

        let parentId = '';
        let promptTaskId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(
                {
                    workflowName: 'Retry Budget Graph',
                    tasks: [
                        {
                            tempId: 'p1',
                            name: 'Retryable Prompt Step',
                            description: 'Fails once expensively then succeeds',
                            kind: 'Prompt',
                            configuration: { promptName: 'RetryablePrompt' },
                            policy: { retryCount: 2 },
                        },
                    ],
                },
                {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: TEST_USER,
                    AgentID: AGENT_ID,
                    AgentRunID: runId,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
                },
            );
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;
            promptTaskId = (db.TasksByParent.get(parentId.toLowerCase()) ?? [])[0].ID;

            await waitUntil(
                () =>
                    disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    db.Tasks.get(promptTaskId.toLowerCase())?.Status === 'Pending' &&
                    (db.Tasks.get(promptTaskId.toLowerCase())?.AttemptCount ?? 0) === 1,
                5_000,
                () => disp1.Kick(),
            );
            // Retry MUST NOT execute before approval
            await new Promise((r) => setTimeout(r, 40));
            expect(promptAttempts).toBe(1);

            const pausedTask = db.Tasks.get(promptTaskId.toLowerCase())!;
            expect(pausedTask.Status).toBe('Pending');
            expect(pausedTask.AttemptCount).toBe(1);
            const pausedCfg = JSON.parse(pausedTask.Configuration!) as TaskStepConfiguration;
            expect(pausedCfg.runtime?.governanceCostUsd).toBeCloseTo(0.30, 5);
            expect(pausedCfg.runtime?.governanceTokensUsed).toBe(1000);
            expect(pausedCfg.runtime?.priorPromptRunIDs).toEqual([attempt1PromptRunId]);
            expect(pausedCfg.runtime?.attempts).toHaveLength(1);
            expect(pausedCfg.runtime?.attempts?.[0]).toMatchObject({
                attemptId: `${promptTaskId}:0`,
                attemptIndex: 0,
                promptRunID: attempt1PromptRunId,
                success: false,
                costUsd: 0.30,
                tokensUsed: 1000,
            });
            expect(db.AgentRuns.get(runId.toLowerCase())?.Status).toBe('Paused');
        } finally {
            await disp1.Stop();
        }

        // Replacement dispatcher hydrates durable failed attempt billing & stays paused until approval
        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'retry-budget-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
                RetryBackoffBaseMs: 5,
            },
            undefined,
            undefined,
            undefined,
            makePromptRunner(),
        );
        await disp2.Start();
        try {
            for (let i = 0; i < 3; i++) {
                disp2.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(promptAttempts).toBe(1);
            const hydratedDiag = disp2.Governance.GetGraphDiagnostics(parentId);
            expect(hydratedDiag?.PausedByGovernance).toBe(true);
            expect(hydratedDiag?.CumulativeCostUsd).toBeCloseTo(0.30, 5);
            expect(hydratedDiag?.TokensUsed).toBe(1000);

            const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 1.00 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp2.Kick(),
            );
            expect(promptAttempts).toBe(2);

            const settledTask = db.Tasks.get(promptTaskId.toLowerCase())!;
            const settledCfg = JSON.parse(settledTask.Configuration!) as TaskStepConfiguration;
            expect(settledCfg.runtime?.governanceCostUsd).toBeCloseTo(0.50, 5);
            expect(settledCfg.runtime?.governanceTokensUsed).toBe(1700);
            expect(settledCfg.runtime?.priorPromptRunIDs).toEqual([attempt1PromptRunId, attempt2PromptRunId]);
            expect(settledCfg.runtime?.attempts).toHaveLength(2);
            expect(settledCfg.runtime?.attempts?.[0]).toMatchObject({
                attemptId: `${promptTaskId}:0`,
                attemptIndex: 0,
                promptRunID: attempt1PromptRunId,
                success: false,
                costUsd: 0.30,
                tokensUsed: 1000,
            });
            expect(settledCfg.runtime?.attempts?.[1]).toMatchObject({
                attemptId: `${promptTaskId}:1`,
                attemptIndex: 1,
                promptRunID: attempt2PromptRunId,
                success: true,
                costUsd: 0.20,
                tokensUsed: 700,
            });

            // Fresh coordinator hydrating from durable database sees exact sum (0.30 + 0.20 = 0.50) once
            const coord3 = new TaskGraphGovernanceCoordinator(new TaskClaimStore('hydrate-verify', 60));
            await coord3.HydrateGraphIfNeeded(provider, parentId, {}, db.wrapTaskPublic(db.Tasks.get(parentId.toLowerCase())!), TEST_USER);
            const coord3Diag = coord3.GetGraphDiagnostics(parentId);
            expect(coord3Diag?.CumulativeCostUsd).toBeCloseTo(0.50, 5);
            expect(coord3Diag?.TokensUsed).toBe(1700);
        } finally {
            await disp2.Stop();
        }
    });

    it('accounts for repeated paid retryable failures under PerRoutine ceiling and recovers missing metrics across all PromptRunIDs', async () => {
        const db = new GovernanceInMemoryDb();
        db.Agents.push({ ID: AGENT_ID, Name: 'Repeated Retry Agent', Status: 'Active' });
        db.Prompts.push({ ID: PROMPT_ID, Name: 'RepeatedPrompt' });
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        const routineRunId = '50000000-0000-4000-8000-000000000092';
        const routineRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', TEST_USER);
        routineRun.ID = routineRunId;
        routineRun.AgentID = AGENT_ID;
        routineRun.UserID = TEST_USER.ID;
        routineRun.ScheduledJobRunID = ROUTINE_ID;
        routineRun.Status = 'Running';
        await routineRun.Save();

        let callNum = 0;
        const promptRunIds = [
            '80000000-0000-4000-8000-000000000011',
            '80000000-0000-4000-8000-000000000012',
            '80000000-0000-4000-8000-000000000013',
        ];
        const attemptCosts = [0.15, 0.25, 0.10];
        const attemptTokens = [400, 600, 300];
        const promptRunner: TaskPromptRunner = {
            RunPromptForTask: async () => {
                const idx = callNum++;
                const prId = promptRunIds[idx];
                const cost = attemptCosts[idx];
                const tokens = attemptTokens[idx];
                const ok = idx === 2;
                db.PromptRuns.set(prId, {
                    ID: prId,
                    PromptID: PROMPT_ID,
                    TotalCost: cost,
                    TokensUsed: tokens,
                    Success: ok,
                });
                return {
                    Success: ok,
                    ...(ok ? { Output: { step: 'ok' } } : { ErrorMessage: `Transient failure #${idx + 1}` }),
                    PromptRunID: prId,
                    CostUsd: cost,
                    TokensUsed: tokens,
                };
            },
        };

        const disp = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'repeated-retry-disp',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
                RetryBackoffBaseMs: 5,
            },
            undefined,
            undefined,
            undefined,
            promptRunner,
        );

        let parentId = '';
        let childTaskId = '';
        await disp.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(
                {
                    workflowName: 'Repeated Retry Graph',
                    tasks: [
                        {
                            tempId: 'rep',
                            name: 'Repeated Retry Prompt',
                            description: 'Fails twice then succeeds',
                            kind: 'Prompt',
                            configuration: { promptName: 'RepeatedPrompt' },
                            policy: { retryCount: 3 },
                        },
                    ],
                },
                {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: TEST_USER,
                    AgentID: AGENT_ID,
                    AgentRunID: routineRunId,
                    RoutineID: ROUTINE_ID,
                    LimitsOverride: {
                        Budgets: {
                            PerRun: { MaxCostUsd: 5.0 },
                            PerRoutine: { MaxCostUsd: 0.35 },
                        },
                    },
                },
            );
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;
            childTaskId = (db.TasksByParent.get(parentId.toLowerCase()) ?? [])[0].ID;

            // Attempt 0 ($0.15) is under $0.35 -> auto-retries; Attempt 1 ($0.25 -> $0.40 total) breaches PerRoutine ($0.35) -> pauses before Attempt 2
            await waitUntil(
                () =>
                    disp.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    (db.Tasks.get(childTaskId.toLowerCase())?.AttemptCount ?? 0) === 2,
                5_000,
                () => disp.Kick(),
            );
            await new Promise((r) => setTimeout(r, 30));
            expect(callNum).toBe(2);
            expect(disp.Governance.GetGraphDiagnostics(parentId)?.LastBudgetResult?.Breach?.Scope).toBe('PerRoutine');
            expect(disp.Governance.GetGraphDiagnostics(parentId)?.CumulativeCostUsd).toBeCloseTo(0.40, 5);
            expect(db.Tasks.get(childTaskId.toLowerCase())?.Status).toBe('Pending');

            const approveRes = await disp.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRoutineMaxCostUsd: 2.00 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp.Kick(),
            );
            expect(callNum).toBe(3);

            const storedChild = db.Tasks.get(childTaskId.toLowerCase())!;
            const settledCfg = JSON.parse(storedChild.Configuration!) as TaskStepConfiguration;
            expect(settledCfg.runtime?.governanceCostUsd).toBeCloseTo(0.50, 5);
            expect(settledCfg.runtime?.governanceTokensUsed).toBe(1300);
            expect(settledCfg.runtime?.attempts).toHaveLength(3);
            expect(settledCfg.runtime?.priorPromptRunIDs).toEqual(promptRunIds);

            const hydratedCoord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('settled-hydrate-verify', 60));
            await hydratedCoord.HydrateGraphIfNeeded(provider, parentId, {}, db.wrapTaskPublic(db.Tasks.get(parentId.toLowerCase())!), TEST_USER);
            expect(hydratedCoord.GetGraphDiagnostics(parentId)?.CumulativeCostUsd).toBeCloseTo(0.50, 5);
            expect(hydratedCoord.GetGraphDiagnostics(parentId)?.TokensUsed).toBe(1300);

            // Verify durable DB recovery from MJ: AI Prompt Runs across ALL 3 attempts when inline governanceCostUsd is cleared
            const strippedCfg = JSON.parse(storedChild.Configuration!) as TaskStepConfiguration;
            delete strippedCfg.runtime!.governanceCostUsd;
            delete strippedCfg.runtime!.governanceTokensUsed;
            for (const att of strippedCfg.runtime!.attempts ?? []) {
                att.costUsd = 0;
                att.tokensUsed = 0;
            }
            storedChild.Configuration = JSON.stringify(strippedCfg);

            const recoveryCoord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('recovery-verify', 60));
            await recoveryCoord.HydrateGraphIfNeeded(provider, parentId, {}, db.wrapTaskPublic(db.Tasks.get(parentId.toLowerCase())!), TEST_USER);
            const recoveredDiag = recoveryCoord.GetGraphDiagnostics(parentId);
            expect(recoveredDiag?.CumulativeCostUsd).toBeCloseTo(0.50, 5);
            expect(recoveredDiag?.TokensUsed).toBe(1300);
        } finally {
            await disp.Stop();
        }
    });

    it('accounts for prompt-bodied ForEach loop retry attempts, pauses before loop retry on budget breach, and sums all loop iterations across retries', async () => {
        const db = new GovernanceInMemoryDb();
        db.Agents.push({ ID: AGENT_ID, Name: 'Loop Retry Agent', Status: 'Active' });
        db.Prompts.push({ ID: PROMPT_ID, Name: 'LoopRetryPrompt' });
        const provider = db.CreateProvider();
        vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation((p) => p as Partial<RunView> as RunView);

        let loopPromptCalls = 0;
        const loopPromptRunner: TaskPromptRunner = {
            RunPromptForTask: async (params) => {
                loopPromptCalls++;
                const prId = randomUUID();
                // Call 1 ("a") succeeds ($0.15), Call 2 ("b") fails ($0.15) -> Attempt 0 total $0.30 (> $0.25)
                // Calls 3 & 4 (Attempt 1 after approval) both succeed ($0.15 each) -> Attempt 1 total $0.30
                const shouldFail = loopPromptCalls === 2;
                db.PromptRuns.set(prId.toLowerCase(), {
                    ID: prId,
                    PromptID: PROMPT_ID,
                    TotalCost: 0.15,
                    TokensUsed: 300,
                    Success: !shouldFail,
                });
                return {
                    Success: !shouldFail,
                    ...(shouldFail
                        ? { ErrorMessage: 'Transient failure on item b' }
                        : { Output: { item: params.TemplateParameters?.item ?? 'ok', call: loopPromptCalls } }),
                    PromptRunID: prId,
                    CostUsd: 0.15,
                    TokensUsed: 300,
                };
            },
        };

        const disp1 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-retry-disp-1',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
                RetryBackoffBaseMs: 5,
            },
            undefined,
            undefined,
            undefined,
            loopPromptRunner,
        );

        let parentId = '';
        let loopTaskId = '';
        await disp1.Start();
        try {
            const service = new TaskGraphService();
            const subRes = await service.Submit(
                {
                    workflowName: 'Prompt Loop Retry Graph',
                    tasks: [
                        {
                            tempId: 'fe-retry',
                            name: 'Retryable Prompt ForEach',
                            description: 'Prompt-bodied loop with retryCount',
                            kind: 'ForEach',
                            configuration: {
                                collectionPath: 'static:["a","b"]',
                                prompt: { name: 'LoopRetryPrompt' },
                            },
                            policy: { retryCount: 1 },
                        },
                    ],
                },
                {
                    EnvironmentID: 'env-1',
                    Provider: provider,
                    ContextUser: TEST_USER,
                    AgentID: AGENT_ID,
                    LimitsOverride: { Budgets: { PerRun: { MaxCostUsd: 0.25 } } },
                },
            );
            expect(subRes.Success).toBe(true);
            parentId = subRes.ParentTaskID!;
            loopTaskId = (db.TasksByParent.get(parentId.toLowerCase()) ?? [])[0].ID;

            await waitUntil(
                () =>
                    disp1.Governance.GetGraphDiagnostics(parentId)?.PausedByGovernance === true &&
                    db.Tasks.get(loopTaskId.toLowerCase())?.Status === 'Pending' &&
                    (db.Tasks.get(loopTaskId.toLowerCase())?.AttemptCount ?? 0) === 1,
                5_000,
                () => disp1.Kick(),
            );
            await new Promise((r) => setTimeout(r, 40));
            expect(loopPromptCalls).toBe(2);
            expect(disp1.Governance.GetGraphDiagnostics(parentId)?.CumulativeCostUsd).toBeCloseTo(0.30, 5);
        } finally {
            await disp1.Stop();
        }

        const disp2 = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            { RunAgentForTask: async () => ({ Success: true }) },
            TEST_USER,
            {
                InstanceID: 'loop-retry-disp-2',
                MaxConcurrentTasks: 1,
                PollIntervalSeconds: 0.01,
                HeartbeatIntervalSeconds: 60,
                ReconciliationIntervalSeconds: 60,
                RetryBackoffBaseMs: 5,
            },
            undefined,
            undefined,
            undefined,
            loopPromptRunner,
        );
        await disp2.Start();
        try {
            for (let i = 0; i < 3; i++) {
                disp2.Kick();
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(loopPromptCalls).toBe(2);
            expect(disp2.Governance.GetGraphDiagnostics(parentId)?.CumulativeCostUsd).toBeCloseTo(0.30, 5);

            const approveRes = await disp2.Governance.ApproveAndResumePausedGraph({
                ParentTaskID: parentId,
                Provider: provider,
                ContextUser: TEST_USER,
                BudgetExtension: { NewPerRunMaxCostUsd: 2.00 },
            });
            expect(approveRes.Success).toBe(true);

            await waitUntil(
                () => db.Tasks.get(parentId.toLowerCase())?.Status === 'Complete',
                5_000,
                () => disp2.Kick(),
            );
            expect(loopPromptCalls).toBe(4);

            const settledLoop = db.Tasks.get(loopTaskId.toLowerCase())!;
            const settledCfg = JSON.parse(settledLoop.Configuration!) as TaskStepConfiguration;
            expect(settledCfg.runtime?.governanceCostUsd).toBeCloseTo(0.60, 5);
            expect(settledCfg.runtime?.governanceTokensUsed).toBe(1200);
            expect(settledCfg.runtime?.attempts).toHaveLength(2);
            expect(settledCfg.runtime?.priorPromptRunIDs).toHaveLength(4);

            const hydratedLoopCoord = new TaskGraphGovernanceCoordinator(new TaskClaimStore('loop-hydrate-verify', 60));
            await hydratedLoopCoord.HydrateGraphIfNeeded(provider, parentId, {}, db.wrapTaskPublic(db.Tasks.get(parentId.toLowerCase())!), TEST_USER);
            expect(hydratedLoopCoord.GetGraphDiagnostics(parentId)?.CumulativeCostUsd).toBeCloseTo(0.60, 5);
            expect(hydratedLoopCoord.GetGraphDiagnostics(parentId)?.TokensUsed).toBe(1200);
        } finally {
            await disp2.Stop();
        }
    });
});
