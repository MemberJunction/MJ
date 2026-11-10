import {
    BaseEntity,
    EntitySaveOptions,
    ServerOperationScopeManager,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION, TASK_RUNTIME_SECURITY_KEYS } from '@memberjunction/ai-core-plus';

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
 * Why a save must not write `Configuration` as given, or null when it may: it changes one of the
 * runtime fields the dispatcher's security decisions read ({@link TASK_RUNTIME_SECURITY_KEYS}).
 *
 * Those fields record what happened when a step ran (whether its output was tainted, the parameters
 * its action was given, and who completed a Human step), and only the dispatcher writes them: through
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
    const changed = TASK_RUNTIME_SECURITY_KEYS.find(
        (key) => !serverStamped.includes(key) && JSON.stringify(stored[key]) !== JSON.stringify(next[key]),
    );
    if (!changed) {
        return null;
    }
    return `Configuration.runtime.${changed} cannot be set or changed: only the task-graph dispatcher records it, ` +
        'and it decides how far the step\'s output is trusted.';
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
    'InputPayload', 'OutputPayload', 'Name', 'Description',
    'StepType', 'ActionID', 'AgentID', 'PromptID', 'ParentID', 'TypeID', 'CompensatesTaskID',
] as const;

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
 * A workflow step (`StepType` set, other than an A2A store's `External` row) feeds what it produced into
 * the steps after it, runs what its definition names, and its name and description become the question its
 * Human step's request asks. The submitter's own code (an agent run calling Update Record, which runs as the
 * submitter) could otherwise rewrite the output of a step that ran clean, the input or the action of a step
 * waiting to run, or the answer a Human step will carry before its person approves it, and the graph would
 * treat that as trusted. So outside the dispatcher's scope those cannot change on a saved step. The person
 * completing their own Human step may set its output, which is their answer.
 *
 * @param changedFields the data columns this save changes
 * @param personCompletesHumanStep this save is the step's own Human completion, made as the person's client request
 */
export function WorkflowStepDataChangeRefusal(changedFields: readonly string[], personCompletesHumanStep: boolean): string | null {
    const refused = changedFields.filter((field) => !(personCompletesHumanStep && field === 'OutputPayload'));
    if (refused.length === 0) {
        return null;
    }
    return `${refused.join(', ')} of a workflow step cannot be changed: only the task-graph dispatcher writes what a step is ` +
        'and the data it carries, which the steps after it trust as its result.';
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
 * ({@link SecurityEnvelopeChangeRefusal}), its runtime security fields and a workflow step's data
 * dispatcher-owned ({@link RuntimeSecurityChangeRefusal}, {@link WorkflowStepDataChangeRefusal}), and records
 * who completes a Human step.
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
        if (this.completesHumanStep() && !this.inDispatcherScope()) {
            const completer = ServerOperationScopeManager.Instance.IsInDirectClientCrud() ? (this.ContextCurrentUser?.ID ?? null) : null;
            this.Configuration = WithCompletedByUserID(this.Configuration, completer);
        }
        return super.Save(options);
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
            if (this.IsSaved && this.StepType != null && this.StepType !== 'External') {
                const changed: string[] = WORKFLOW_STEP_OWNED_FIELDS.filter((field) => this.GetFieldByName(field)?.Dirty);
                if (ExecutableConfigurationChanged(storedConfiguration, this.Configuration)) {
                    changed.push('Configuration');
                }
                const person = this.completesHumanStep() && ServerOperationScopeManager.Instance.IsInDirectClientCrud();
                const dataRefusal = WorkflowStepDataChangeRefusal(changed, person);
                if (dataRefusal) {
                    result.Errors.push(new ValidationErrorInfo(changed[0], dataRefusal, null, ValidationErrorType.Failure));
                    result.Success = false;
                }
            }
        }
        return result;
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
