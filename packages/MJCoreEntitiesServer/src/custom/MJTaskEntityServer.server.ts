import {
    BaseEntity,
    EntitySaveOptions,
    IRunViewProvider,
    RunView,
    ServerOperationScopeManager,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION, TASK_GRAPH_WORKFLOW_TYPE_NAME } from '@memberjunction/ai-core-plus';

/**
 * Why a save must not write `Task.SecurityEnvelope`, or null when it may.
 *
 * The envelope holds the constraints of the agent run that submitted a task graph — its bound
 * parameters, audience, tenant scope and taint — and the dispatcher enforces it on every node. It is
 * written once, when the row is created (the server's own graph submission and its compensation
 * tasks), and never changed: a later edit could only loosen what the submitting run was held to, so
 * any change to it on an existing row is refused, whoever makes it.
 */
export function SecurityEnvelopeChangeRefusal(isSaved: boolean, securityEnvelopeDirty: boolean): string | null {
    if (!isSaved || !securityEnvelopeDirty) {
        return null;
    }
    return 'SecurityEnvelope cannot be changed after the task is created: it holds the constraints of the run that ' +
        'submitted the workflow, and the dispatcher enforces it on every step.';
}

/**
 * Why a save must not write `Configuration` as given, or null when it may: it changes a key of its
 * `runtime` object.
 *
 * Those keys record what happened when a step ran (whether its output was tainted, the parameters its
 * action was given, who completed a Human step, which action log and prompt run it produced, the loop's
 * iterations), and the dispatcher reads them back: for taint, and for what a compensation undoes (the
 * action log names the record changes it reverts). Only the dispatcher writes them: through
 * its guarded completion procedure, beneath the entity layer, or inside its server operation scope
 * ({@link TASK_GRAPH_RUNTIME_SECURITY_OPERATION}, which `MJTaskEntityServer` checks before calling
 * this). So any other change to them through the entity layer is refused, whoever makes it: a client,
 * or server code such as the Update Record action a tainted agent calls on its own graph's rows.
 * Setting `isOutputTainted` back to false would otherwise run every step downstream of an untrusted
 * fetch clean. A create counts as a change from nothing, and a `Configuration` that does not parse
 * reads as having none of them, so neither can slip one in.
 *
 * @param storedConfiguration the column before this save (`null` for a create)
 * @param nextConfiguration the column being saved
 * @param serverStamped keys this save's own server stamp sets ({@link MJTaskEntityServer.Save}), not compared
 */
export function RuntimeSecurityChangeRefusal(
    storedConfiguration: string | null | undefined,
    nextConfiguration: string | null | undefined,
    serverStamped: readonly string[] = [],
): string | null {
    const stored = runtimeOf(storedConfiguration);
    const next = runtimeOf(nextConfiguration);
    const changed = [...new Set([...Object.keys(stored), ...Object.keys(next)])].find(
        (key) => !serverStamped.includes(key) && JSON.stringify(stored[key]) !== JSON.stringify(next[key]),
    );
    if (!changed) {
        return null;
    }
    return `Configuration.runtime.${changed} cannot be set or changed: only the task-graph dispatcher records what a step ` +
        'did when it ran, which decides how far its output is trusted and what its compensation undoes.';
}

/** The `runtime` object of a serialized `Task.Configuration`, or `{}` when it has none or does not parse. */
function runtimeOf(configuration: string | null | undefined): Record<string, unknown> {
    if (!configuration) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(configuration);
        const runtime = isRecord(parsed) ? parsed.runtime : undefined;
        return isRecord(runtime) ? runtime : {};
    } catch {
        return {};
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The columns of a workflow step the dispatcher owns: its data (what it was given, what it produced, what a person
 * is asked) and what it is (its kind, what it runs, where it sits). `Configuration` is checked separately, by
 * {@link ExecutableConfigurationChanged}. Left writable: progress (status, timing, claim, errors), the assignee,
 * and the rest, which decide nothing a step runs or reads.
 */
const WORKFLOW_STEP_OWNED_FIELDS = [
    'InputPayload', 'OutputPayload', 'Name', 'Description', 'Status', 'UserID',
    'StepType', 'ActionID', 'AgentID', 'PromptID', 'ParentID', 'TypeID', 'CompensatesTaskID',
] as const;

/**
 * The columns of a workflow (a task graph's parent task) the dispatcher owns: its metadata (`InputPayload`: who the
 * graph runs as, the `data`/`context` its steps read, its continuation and saga state), its result, and what it is
 * attached to. Its status and progress stay writable; the dispatcher settles it through guarded statements.
 */
const WORKFLOW_PARENT_OWNED_FIELDS = [
    'InputPayload', 'OutputPayload', 'AgentRunID', 'UserID', 'ConversationDetailID', 'TypeID', 'EnvironmentID', 'StepType', 'ParentID',
] as const;

/** What the person completing their own Human step may set in that save: its status, and its output, their answer. */
const PERSON_COMPLETION_FIELDS = ['Status', 'OutputPayload'];

/** `Configuration` keys anyone may write: `layout` is presentation, and `runtime` has its own guard. */
const FREE_CONFIGURATION_KEYS = ['layout', 'runtime'];

/**
 * Whether a save changes what a step's `Configuration` tells it to do (input mapping, action, human step,
 * compensation and the rest), as opposed to its `layout` or `runtime` keys. A `Configuration` that does not
 * parse counts as changed.
 */
export function ExecutableConfigurationChanged(stored: string | null | undefined, next: string | null | undefined): boolean {
    const executable = (configuration: string | null | undefined): string | undefined => {
        if (!configuration) return '[]';
        try {
            const parsed: unknown = JSON.parse(configuration);
            if (!isRecord(parsed)) return undefined;
            const kept = Object.keys(parsed).filter((key) => !FREE_CONFIGURATION_KEYS.includes(key)).sort();
            return JSON.stringify(kept.map((key) => [key, parsed[key]]));
        } catch {
            return undefined;
        }
    };
    const before = executable(stored);
    const after = executable(next);
    return before === undefined || after === undefined || before !== after;
}

/**
 * Why a save must not change a workflow step this way, or null when it may.
 *
 * A workflow step (a task with a parent and a `StepType`) feeds what it produced into the steps after it,
 * runs what its definition names, waits on whom it is assigned to, and its name and description become the
 * question its Human step's request asks. The submitter's own code (an agent run calling Update Record, which
 * runs as the submitter) could otherwise rewrite the output of a step that ran clean, the input or the action
 * of a step waiting to run, the answer a Human step will carry before its person approves it, or who that
 * person is; or rerun, skip or settle a step by its status. The graph would treat the result as trusted. So
 * outside the dispatcher's scope those cannot change on a saved step, except that the person a Human step is
 * assigned to may complete it and give its output, their answer, in their own client request.
 *
 * @param changedFields the owned columns this save changes
 * @param personCompletesOwnHumanStep this save is the assignee completing their Human step, as their own client request
 */
export function WorkflowStepDataChangeRefusal(changedFields: readonly string[], personCompletesOwnHumanStep: boolean): string | null {
    const refused = changedFields.filter((field) => !(personCompletesOwnHumanStep && PERSON_COMPLETION_FIELDS.includes(field)));
    if (refused.length === 0) {
        return null;
    }
    return `${refused.join(', ')} of a workflow step cannot be changed: only the task-graph dispatcher writes what a step is ` +
        'and the data it carries, which the steps after it trust as its result.';
}

/** The workflow task type's ID once found. Never cached while absent: the task-graph service creates the row on first use. */
let workflowTaskTypeIDCache: string | undefined;

/**
 * The ID of the `MJ: Task Types` row a workflow is filed under ({@link TASK_GRAPH_WORKFLOW_TYPE_NAME}), or null while it
 * does not exist. Read as the system user, so a caller who cannot read task types cannot make the guards miss it.
 */
export async function ResolveWorkflowTaskTypeID(provider: IRunViewProvider, user: UserInfo | undefined): Promise<string | null> {
    if (workflowTaskTypeIDCache) return workflowTaskTypeIDCache;
    const result = await new RunView(provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Task Types', ExtraFilter: `Name='${TASK_GRAPH_WORKFLOW_TYPE_NAME}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        UserCache.Instance.GetSystemUser() ?? user,
    );
    const id = result.Success ? result.Results?.[0]?.ID : undefined;
    if (id) workflowTaskTypeIDCache = id;
    return id ?? null;
}

/** A task's membership columns, as stored. Undefined when the ID is not a readable task. */
async function loadTaskShape(provider: IRunViewProvider, user: UserInfo | undefined, taskID: string): Promise<{ ParentID: string | null; StepType: string | null; TypeID: string } | undefined> {
    if (!IsValidUUID(taskID)) return undefined;
    const result = await new RunView(provider).RunView<{ ParentID: string | null; StepType: string | null; TypeID: string }>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${taskID}'`, Fields: ['ParentID', 'StepType', 'TypeID'], ResultType: 'simple', MaxRows: 1, BypassCache: true },
        user,
    );
    return result.Success ? result.Results?.[0] : undefined;
}

/**
 * Whether `taskID` is a workflow: a task graph's parent, a parentless task of the workflow type. A task this user
 * cannot read counts as one, so whatever hangs under it is judged as a workflow step (fail closed).
 */
export async function IsWorkflowTask(provider: IRunViewProvider, user: UserInfo | undefined, taskID: string, workflowTypeID: string | null): Promise<boolean> {
    const row = await loadTaskShape(provider, user, taskID);
    if (!row) return true;
    return row.ParentID == null && workflowTypeID != null && UUIDsEqual(row.TypeID, workflowTypeID);
}

/**
 * Whether `taskID` is a step of a workflow: a task with a parent and a `StepType` or the workflow type, or any task
 * whose parent is a workflow. A task this user cannot read counts as one (fail closed).
 */
export async function IsWorkflowStepTask(provider: IRunViewProvider, user: UserInfo | undefined, taskID: string, workflowTypeID: string | null): Promise<boolean> {
    const row = await loadTaskShape(provider, user, taskID);
    if (!row) return true;
    if (row.ParentID == null) return false;
    if (row.StepType != null || (workflowTypeID != null && UUIDsEqual(row.TypeID, workflowTypeID))) return true;
    return IsWorkflowTask(provider, user, row.ParentID, workflowTypeID);
}

/** What a save needs to know about workflow membership, resolved before it validates (the lookups are asynchronous). */
interface WorkflowFacts {
    WorkflowTypeID: string | null;
    StoredParentIsWorkflow: boolean;
    NextParentIsWorkflow: boolean;
}

/**
 * `configuration` with `runtime.completedByUserID` set to `userID` (removed when `null`). A
 * `Configuration` that does not parse is returned unchanged: the step then records no completer, so its
 * completion clears nothing.
 */
export function WithCompletedByUserID(configuration: string | null, userID: string | null): string | null {
    let parsed: Record<string, unknown> = {};
    if (configuration) {
        try {
            const value: unknown = JSON.parse(configuration);
            if (!isRecord(value)) return configuration;
            parsed = value;
        } catch {
            return configuration;
        }
    }
    const runtime: Record<string, unknown> = isRecord(parsed.runtime) ? { ...parsed.runtime } : {};
    if (userID) {
        runtime.completedByUserID = userID;
    } else {
        delete runtime.completedByUserID;
    }
    return JSON.stringify({ ...parsed, runtime });
}

/**
 * Server-side `MJ: Tasks` entity: keeps a task's security envelope immutable after insert
 * ({@link SecurityEnvelopeChangeRefusal}), its runtime record, a workflow step's definition and data, and a
 * workflow's metadata dispatcher-owned ({@link RuntimeSecurityChangeRefusal}, {@link WorkflowStepDataChangeRefusal}),
 * and records who completes a Human step.
 */
@RegisterClass(BaseEntity, 'MJ: Tasks')
export class MJTaskEntityServer extends MJTaskEntity {
    /**
     * Records who completed a Human step (`runtime.completedByUserID`) when this save moves one to
     * `Complete`, whatever the caller put there: the user the save runs as when it arrived as a direct
     * client CRUD request (`ServerOperationScopeManager.IsInDirectClientCrud`), and nobody otherwise. A completed Human step
     * clears taint only when the record names its assignee (`HumanReviewClearsTaint` in
     * `@memberjunction/task-graph`). The assignee is the graph's submitter, and the graph's agents and
     * actions run as that same user, so the user alone cannot tell a person's review from server code
     * completing the step; where the save came from can. The dispatcher, settling a step from the
     * answered request, records the request's responder itself, inside {@link TASK_GRAPH_RUNTIME_SECURITY_OPERATION}.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.inDispatcherScope()) {
            this.workflowFacts = await this.resolveWorkflowFacts();
            if (this.completesHumanStep()) {
                const completer = ServerOperationScopeManager.Instance.IsInDirectClientCrud() ? (this.ContextCurrentUser?.ID ?? null) : null;
                this.Configuration = WithCompletedByUserID(this.Configuration, completer);
            }
        }
        try {
            return await super.Save(options);
        } finally {
            this.workflowFacts = undefined;
        }
    }

    /** Workflow membership of this row before and after the save, for {@link Validate}. */
    private workflowFacts: WorkflowFacts | undefined;

    /** Resolves {@link WorkflowFacts}: the workflow type, and whether the stored and the new parent are workflows. */
    protected async resolveWorkflowFacts(): Promise<WorkflowFacts> {
        const provider = this.RunViewProviderToUse;
        const user = this.ContextCurrentUser;
        const workflowTypeID = await ResolveWorkflowTaskTypeID(provider, user);
        const storedParent = this.stored('ParentID') as string | null | undefined;
        const nextParent = this.ParentID;
        const storedParentIsWorkflow = storedParent ? await IsWorkflowTask(provider, user, storedParent, workflowTypeID) : false;
        const nextParentIsWorkflow = !nextParent
            ? false
            : storedParent && UUIDsEqual(nextParent, storedParent)
                ? storedParentIsWorkflow
                : await IsWorkflowTask(provider, user, nextParent, workflowTypeID);
        return { WorkflowTypeID: workflowTypeID, StoredParentIsWorkflow: storedParentIsWorkflow, NextParentIsWorkflow: nextParentIsWorkflow };
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        const refusal = SecurityEnvelopeChangeRefusal(this.IsSaved, this.GetFieldByName('SecurityEnvelope')?.Dirty ?? false);
        if (refusal) {
            result.Errors.push(new ValidationErrorInfo('SecurityEnvelope', refusal, this.SecurityEnvelope, ValidationErrorType.Failure));
            result.Success = false;
        }
        if (!this.inDispatcherScope()) {
            const storedConfiguration = this.IsSaved ? (this.GetFieldByName('Configuration')?.OldValue as string | null | undefined) : null;
            const serverStamped = this.completesHumanStep() ? ['completedByUserID'] : [];
            const runtimeRefusal = RuntimeSecurityChangeRefusal(storedConfiguration, this.Configuration, serverStamped);
            if (runtimeRefusal) {
                result.Errors.push(new ValidationErrorInfo('Configuration', runtimeRefusal, this.Configuration, ValidationErrorType.Failure));
                result.Success = false;
            }
            const wasWorkflowRow = this.IsSaved && (this.isWorkflowStep('stored') || this.isWorkflowParent('stored'));
            if (!wasWorkflowRow && (this.isWorkflowStep('next') || this.isWorkflowParent('next'))) {
                // A workflow, or a step of one, made by an ordinary save: created, or an existing task retyped or
                // re-parented into one. The dispatcher would run it as the user its metadata names.
                const field = this.ParentID ? 'ParentID' : 'TypeID';
                result.Errors.push(new ValidationErrorInfo(field,
                    'Only the task-graph service creates a workflow or adds a step to one: a workflow\'s steps run as the user it was submitted by.',
                    null, ValidationErrorType.Failure));
                result.Success = false;
            } else if (this.IsSaved && this.isWorkflowStep('stored')) {
                const changed: string[] = WORKFLOW_STEP_OWNED_FIELDS.filter((field) => this.GetFieldByName(field)?.Dirty);
                if (this.GetFieldByName('Configuration')?.Dirty && ExecutableConfigurationChanged(storedConfiguration, this.Configuration)) {
                    changed.push('Configuration');
                }
                const dataRefusal = WorkflowStepDataChangeRefusal(changed, this.personCompletesOwnHumanStep());
                if (dataRefusal) {
                    result.Errors.push(new ValidationErrorInfo(changed[0], dataRefusal, null, ValidationErrorType.Failure));
                    result.Success = false;
                }
            } else if (this.IsSaved && this.isWorkflowParent('stored')) {
                const changed = WORKFLOW_PARENT_OWNED_FIELDS.filter((field) => this.GetFieldByName(field)?.Dirty);
                if (changed.length > 0) {
                    const message = `${changed.join(', ')} of a workflow cannot be changed: only the task-graph dispatcher writes who it ` +
                        'runs as, the data its steps read, and what it is attached to.';
                    result.Errors.push(new ValidationErrorInfo(changed[0], message, null, ValidationErrorType.Failure));
                    result.Success = false;
                }
            }
        }
        return result;
    }

    /** The column's value before this save (its current value on a create). */
    private stored(field: string): unknown {
        return this.IsSaved ? this.GetFieldByName(field)?.OldValue : this.GetFieldByName(field)?.Value;
    }

    /**
     * Whether the row, as stored or as this save leaves it, is a step of a task graph: it has a parent, and a `StepType`,
     * the workflow type (the dispatcher finds graphs by their steps' type), or a parent that is a workflow. Without
     * resolved facts (a save that skipped {@link Save}), any task with a parent counts (fail closed).
     */
    private isWorkflowStep(state: 'stored' | 'next'): boolean {
        const parent = state === 'stored' ? this.stored('ParentID') : this.ParentID;
        if (parent == null) return false;
        const stepType = state === 'stored' ? this.stored('StepType') : this.StepType;
        if (stepType != null) return true;
        const facts = this.workflowFacts;
        if (!facts) return true;
        const typeID = (state === 'stored' ? this.stored('TypeID') : this.TypeID) as string | null | undefined;
        if (facts.WorkflowTypeID != null && typeof typeID === 'string' && UUIDsEqual(typeID, facts.WorkflowTypeID)) return true;
        return state === 'stored' ? facts.StoredParentIsWorkflow : facts.NextParentIsWorkflow;
    }

    /**
     * Whether the row, as stored or as this save leaves it, is a task graph's workflow (parent) task: no parent, no
     * `StepType`, filed under the workflow type. Without resolved facts, the joined type name decides for the stored row,
     * and a changed type counts (fail closed).
     */
    private isWorkflowParent(state: 'stored' | 'next'): boolean {
        const parent = state === 'stored' ? this.stored('ParentID') : this.ParentID;
        const stepType = state === 'stored' ? this.stored('StepType') : this.StepType;
        if (parent != null || stepType != null) return false;
        const typeID = (state === 'stored' ? this.stored('TypeID') : this.TypeID) as string | null | undefined;
        const facts = this.workflowFacts;
        if (facts) return facts.WorkflowTypeID != null && typeof typeID === 'string' && UUIDsEqual(typeID, facts.WorkflowTypeID);
        return state === 'stored' ? this.Type === TASK_GRAPH_WORKFLOW_TYPE_NAME : (this.GetFieldByName('TypeID')?.Dirty === true || this.Type === TASK_GRAPH_WORKFLOW_TYPE_NAME);
    }

    /** Whether this save is the assignee completing their own Human step, as their own client request. */
    private personCompletesOwnHumanStep(): boolean {
        const assignee = this.stored('UserID');
        return this.completesHumanStep() &&
            ServerOperationScopeManager.Instance.IsInDirectClientCrud() &&
            typeof assignee === 'string' && this.ContextCurrentUser != null && UUIDsEqual(assignee, this.ContextCurrentUser.ID);
    }

    /** Whether this save moves a Human step to `Complete` (a create already `Complete` included). */
    private completesHumanStep(): boolean {
        const storedStatus = this.IsSaved ? this.GetFieldByName('Status')?.OldValue : null;
        return this.StepType === 'Human' && this.Status === 'Complete' && storedStatus !== 'Complete';
    }

    /** Whether this save runs inside the dispatcher's runtime-security scope, bound to this row's user. */
    private inDispatcherScope(): boolean {
        // No user, no scope: without one, IsOperationActive would match a frame bound to anybody.
        return this.ContextCurrentUser != null &&
            ServerOperationScopeManager.Instance.IsOperationActive([TASK_GRAPH_RUNTIME_SECURITY_OPERATION], 'MJ: Tasks', this.ContextCurrentUser);
    }
}
