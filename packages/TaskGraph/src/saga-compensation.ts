/**
 * @fileoverview Pure saga-compensation rules for `TaskGraphDispatcher` (WS-4.3).
 *
 * When a task graph runs with `failurePolicy: 'CompensateCompleted'` and a forward step fails
 * unhandled, the dispatcher undoes the completed `Action` steps that declare a compensation action
 * (on the workflow node, {@link ActionCompensationSpec}, or on the `MJ: Actions` row), in **reverse
 * topological order**, one at a time. Each compensation is a child `MJ: Tasks` row linked to the step
 * it undoes through `CompensatesTaskID`, whose unique index is what makes materializing it a claim:
 * two dispatchers can both decide to compensate a step, and only one insert succeeds.
 *
 * Everything here is pure; the dispatcher reads the rows, asks {@link NextSagaStep} what to do, and
 * does it. Because the answer is computed from durable rows on every pass, any dispatcher can pick a
 * saga up where another left it.
 *
 * @module @memberjunction/task-graph
 */
import {
    GetValueFromPath,
    type ActionCompensationFailurePolicy,
    type ActionCompensationSpec,
} from '@memberjunction/ai-core-plus';
import type { MJActionEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { UUIDMap, UUIDSet } from '@memberjunction/global';
import { IsHumanTask } from './task-predicates';

/**
 * Saga lifecycle state recorded on the parent workflow task's metadata (`InputPayload.sagaState`).
 * Informational: every decision is recomputed from the rows, never read back from this.
 */
export type SagaExecutionState =
    | 'Running'
    | 'Compensating'
    | 'Compensated'
    | 'CompensationEscalated'
    | 'CompensationFailed';

/**
 * Compensation settings persisted in `Task.Configuration.compensation`: on a forward step, how to undo
 * it; on a compensation task, the policy for its own failure.
 */
export interface TaskCompensationStepMetadata {
    /** The `MJ: Actions` ID of the compensation action. */
    compensationActionId?: string;
    /** The compensation action's name, resolved to `compensationActionId` at submit or dispatch time. */
    compensationActionName?: string;
    /** Compensation parameter name → path into the forward run (`input.*`, `output.*`, `actionLogId`, `recordChanges`). */
    inputMapping?: Readonly<Record<string, string>> | string;
    /** What to do when the compensation itself fails after its retries. Default `'EscalateToHumanTask'`. */
    onCompensationFailure?: ActionCompensationFailurePolicy;
    /** On a forward step: whether its own action may be retried automatically (overrides `Action.IsIdempotent`). */
    isIdempotent?: boolean;
    /** How many times the compensation task retries, when its action is idempotent. */
    retryCount?: number;
}

/** The `MJ: Actions` fields a saga reads, typed from the generated entity. */
export type CompensatableActionRow = Pick<MJActionEntity, 'ID' | 'CompensationActionID' | 'CompensationInputMapping' | 'IsIdempotent'>;

/** The `MJ: Tasks` columns the saga planner reads. */
export type SagaTaskRow = Pick<
    MJTaskEntity,
    'ID' | 'Name' | 'Status' | 'StepType' | 'UserID' | 'ActionID' | 'CompletedAt' | 'Configuration' | 'CompensatesTaskID'
>;

/** A completed forward step to undo, and how. */
export type CompensationPlanEntry<T extends SagaTaskRow> = { Task: T; Compensation: TaskCompensationStepMetadata };

/** What the dispatcher does next for a saga. */
export type SagaStep<T extends SagaTaskRow> =
    /** A compensation or an escalation is still running, or a forward step is still finishing. */
    | { Kind: 'Wait' }
    /** Create the compensation task for this forward step. */
    | { Kind: 'Compensate'; Forward: T; Compensation: TaskCompensationStepMetadata }
    /** Create the Human step that asks a person to undo this forward step by hand. */
    | { Kind: 'Escalate'; Forward: T; FailedCompensation: T }
    /** Nothing more to do; the saga ended in this state. */
    | { Kind: 'Finished'; State: SagaExecutionState };

/**
 * Reads the compensation settings an `MJ: Actions` row declares through its typed columns:
 * `CompensationActionID`, `CompensationInputMapping` (a JSON object of parameter → path) and
 * `IsIdempotent`. `null` when the action names no compensation action.
 */
export function ReadActionCompensationMetadata(action: CompensatableActionRow | null | undefined): TaskCompensationStepMetadata | null {
    const compensationActionId = asNonEmptyString(action?.CompensationActionID);
    if (!action || !compensationActionId) return null;
    const inputMapping = parseMappingDictionary(action.CompensationInputMapping);
    return {
        compensationActionId,
        ...(inputMapping ? { inputMapping } : {}),
        ...(typeof action.IsIdempotent === 'boolean' ? { isIdempotent: action.IsIdempotent } : {}),
    };
}

/**
 * Combines an action's default compensation with a workflow node's own: every field the node sets
 * wins. `null` when neither names a compensation action.
 */
export function MergeActionCompensationSpecs(
    actionDefault: TaskCompensationStepMetadata | null | undefined,
    nodeOverride: TaskCompensationStepMetadata | null | undefined,
): TaskCompensationStepMetadata | null {
    const compensationActionId = asNonEmptyString(nodeOverride?.compensationActionId) ?? asNonEmptyString(actionDefault?.compensationActionId);
    const compensationActionName = asNonEmptyString(nodeOverride?.compensationActionName) ?? asNonEmptyString(actionDefault?.compensationActionName);
    if (!compensationActionId && !compensationActionName) return null;
    const inputMapping = nodeOverride?.inputMapping ?? actionDefault?.inputMapping;
    const onCompensationFailure = nodeOverride?.onCompensationFailure ?? actionDefault?.onCompensationFailure;
    const retryCount = nodeOverride?.retryCount ?? actionDefault?.retryCount;
    return {
        ...(compensationActionId ? { compensationActionId } : {}),
        ...(compensationActionName ? { compensationActionName } : {}),
        ...(inputMapping !== undefined ? { inputMapping } : {}),
        onCompensationFailure: onCompensationFailure ?? 'EscalateToHumanTask',
        ...(retryCount !== undefined ? { retryCount } : {}),
    };
}

/**
 * The compensation settings a workflow node's spec declares (`configuration.compensation`), in the
 * shape a step stores. `inputMapping` and its alias `compensationInputMapping` are one setting.
 */
export function CompensationFromSpec(spec: ActionCompensationSpec | undefined): TaskCompensationStepMetadata | undefined {
    if (!spec) return undefined;
    const inputMapping = spec.inputMapping ?? spec.compensationInputMapping;
    const retryCount = normalizeRetryCount(spec.retryCount);
    return {
        ...(asNonEmptyString(spec.compensationActionId) ? { compensationActionId: spec.compensationActionId } : {}),
        ...(asNonEmptyString(spec.compensationActionName) ? { compensationActionName: spec.compensationActionName } : {}),
        ...(inputMapping !== undefined ? { inputMapping } : {}),
        ...(spec.onCompensationFailure ? { onCompensationFailure: spec.onCompensationFailure } : {}),
        ...(typeof spec.isIdempotent === 'boolean' ? { isIdempotent: spec.isIdempotent } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
    };
}

/**
 * Reads `Task.Configuration.compensation` from a serialized `Configuration`.
 */
export function ReadTaskCompensationMetadata(configurationJson: string | null | undefined): TaskCompensationStepMetadata | null {
    if (!configurationJson) return null;
    try {
        const parsed: unknown = JSON.parse(configurationJson);
        if (!isRecord(parsed) || !isRecord(parsed.compensation)) return null;
        const comp = parsed.compensation;
        const inputMapping = normalizeMappingField(comp.inputMapping ?? comp.compensationInputMapping);
        const onFailure = normalizeFailurePolicy(comp.onCompensationFailure);
        const retryCount = normalizeRetryCount(comp.retryCount);
        return {
            ...(asNonEmptyString(comp.compensationActionId) ? { compensationActionId: asNonEmptyString(comp.compensationActionId) } : {}),
            ...(asNonEmptyString(comp.compensationActionName) ? { compensationActionName: asNonEmptyString(comp.compensationActionName) } : {}),
            ...(inputMapping !== undefined ? { inputMapping } : {}),
            ...(onFailure ? { onCompensationFailure: onFailure } : {}),
            ...(typeof comp.isIdempotent === 'boolean' ? { isIdempotent: comp.isIdempotent } : {}),
            ...(retryCount !== undefined ? { retryCount } : {}),
        };
    } catch {
        return null;
    }
}

/** True for a task that undoes another (a compensation task, or the Human step escalating a failed one). */
export function IsCompensationTask(row: Pick<MJTaskEntity, 'CompensatesTaskID'>): boolean {
    return !!row.CompensatesTaskID;
}

/**
 * The completed forward `Action` steps a saga undoes, in **reverse topological order**: deeper steps
 * first (by the submit-time `sequence`, else the dependency depth), then later `CompletedAt`, then ID.
 * A step is included when its node or its action names a compensation action.
 *
 * @param actionDefaults the compensation each action's own row declares, keyed by Action ID
 */
export function SelectTasksToCompensate<T extends SagaTaskRow>(
    tasks: readonly T[],
    actionDefaults: UUIDMap<TaskCompensationStepMetadata>,
    dependencies: ReadonlyArray<{ TaskID: string; DependsOnTaskID: string }> = [],
): Array<CompensationPlanEntry<T>> {
    const depthByTask = computeTopologicalDepthByTaskId(tasks, dependencies);
    const candidates: Array<CompensationPlanEntry<T> & { Rank: number; CompletedAtMs: number }> = [];
    for (const row of tasks) {
        if (row.Status !== 'Complete' || IsCompensationTask(row) || !row.ActionID) continue;
        if (row.StepType && row.StepType !== 'Action') continue;
        const compensation = MergeActionCompensationSpecs(
            actionDefaults.Get(row.ActionID),
            ReadTaskCompensationMetadata(row.Configuration),
        );
        if (!compensation) continue;
        const sequence = readSequenceFromConfiguration(row.Configuration);
        candidates.push({
            Task: row,
            Compensation: compensation,
            Rank: sequence >= 0 ? sequence : depthByTask.Get(row.ID) ?? 0,
            CompletedAtMs: parseTimestampMs(row.CompletedAt),
        });
    }
    candidates.sort((a, b) => b.Rank - a.Rank || b.CompletedAtMs - a.CompletedAtMs || b.Task.ID.localeCompare(a.Task.ID));
    return candidates.map(({ Task, Compensation }) => ({ Task, Compensation }));
}

/**
 * What a saga does next, from the rows alone. Walks the plan in order:
 *
 * - no compensation task for a step yet → create it (`Compensate`), one at a time;
 * - a compensation task still `Pending` or `In Progress` → `Wait`;
 * - a compensation that `Complete`d → next step;
 * - a compensation that failed, by its `onCompensationFailure`:
 *   - `'ContinueCompensation'` → next step (the saga ends `CompensationFailed`);
 *   - `'HaltSaga'` → stop: `Finished` with `CompensationFailed`;
 *   - `'EscalateToHumanTask'` (default) → create a Human step (`Escalate`) and wait on it. When the
 *     person completes it, they have undone the step by hand and the saga resumes with the next step;
 *     when the Human step ends any other way (cancelled, skipped, failed, expired), the saga stops:
 *     `Finished` with `CompensationEscalated`.
 *
 * @param compensationFor the task whose `CompensatesTaskID` is the forward step, if any
 * @param escalationFor the Human step whose `CompensatesTaskID` is the failed compensation task, if any
 */
export function NextSagaStep<T extends SagaTaskRow>(args: {
    Plan: ReadonlyArray<CompensationPlanEntry<T>>;
    CompensationFor: (forwardTaskID: string) => T | undefined;
    EscalationFor: (compensationTaskID: string) => T | undefined;
}): SagaStep<T> {
    let anyUnresolvedFailure = false;
    for (const { Task: forward, Compensation } of args.Plan) {
        const compensation = args.CompensationFor(forward.ID);
        if (!compensation) {
            return { Kind: 'Compensate', Forward: forward, Compensation };
        }
        if (isActive(compensation)) {
            return { Kind: 'Wait' };
        }
        if (compensation.Status === 'Complete') {
            continue;
        }
        const policy = ReadTaskCompensationMetadata(compensation.Configuration)?.onCompensationFailure ?? 'EscalateToHumanTask';
        if (policy === 'ContinueCompensation') {
            anyUnresolvedFailure = true;
            continue;
        }
        if (policy === 'HaltSaga') {
            return { Kind: 'Finished', State: 'CompensationFailed' };
        }
        const escalation = args.EscalationFor(compensation.ID);
        if (!escalation) {
            return { Kind: 'Escalate', Forward: forward, FailedCompensation: compensation };
        }
        if (isActive(escalation)) {
            return { Kind: 'Wait' };
        }
        if (escalation.Status !== 'Complete') {
            return { Kind: 'Finished', State: 'CompensationEscalated' };
        }
    }
    return { Kind: 'Finished', State: anyUnresolvedFailure ? 'CompensationFailed' : 'Compensated' };
}

/** Indexes the rows that undo another by the row they undo (`CompensatesTaskID`), split into tasks and Human escalations. */
export function IndexCompensationRows<T extends SagaTaskRow>(rows: readonly T[]): { Compensations: UUIDMap<T>; Escalations: UUIDMap<T> } {
    const compensations = new UUIDMap<T>();
    const escalations = new UUIDMap<T>();
    for (const row of rows) {
        if (!row.CompensatesTaskID) continue;
        (IsHumanTask(row) ? escalations : compensations).Set(row.CompensatesTaskID, row);
    }
    return { Compensations: compensations, Escalations: escalations };
}

/** Exponential backoff before retry `attempt` (1-based): base, 2×base, 4×base…, capped at 30× base. */
export function RetryBackoffMs(attempt: number, baseMs: number): number {
    return Math.min(baseMs * 30, baseMs * 2 ** Math.max(0, attempt - 1));
}

/**
 * Builds the `InputPayload` for a compensation task from the forward step's inputs, outputs,
 * `ActionLogID`, and correlated `RecordChanges` rows.
 */
export function BuildCompensationInputPayload(args: {
    ForwardInput: Record<string, unknown>;
    ForwardOutput: Record<string, unknown>;
    ActionLogID?: string | null;
    RecordChanges?: readonly Record<string, unknown>[];
    InputMapping?: Readonly<Record<string, string>> | string | null;
}): Record<string, unknown> {
    const { ForwardInput, ForwardOutput, ActionLogID = null, RecordChanges = [], InputMapping } = args;

    const envelope: Record<string, unknown> = {
        input: ForwardInput,
        output: ForwardOutput,
        actionLogId: ActionLogID,
        actionLogID: ActionLogID,
        recordChanges: RecordChanges,
        payload: { ...ForwardInput, ...ForwardOutput },
    };

    const mappingDict = parseMappingDictionary(InputMapping);
    if (!mappingDict || Object.keys(mappingDict).length === 0) {
        return {
            ...ForwardInput,
            ...ForwardOutput,
            ...(ActionLogID ? { actionLogId: ActionLogID } : {}),
            ...(RecordChanges.length > 0 ? { recordChanges: RecordChanges } : {}),
        };
    }

    const mapped: Record<string, unknown> = {};
    for (const [paramName, rawSource] of Object.entries(mappingDict)) {
        mapped[paramName] = resolveCompensationMappingExpression(rawSource, envelope);
    }
    return mapped;
}

/**
 * Formats the request a person sees when a compensation fails under
 * `onCompensationFailure: 'EscalateToHumanTask'`.
 */
export function BuildCompensationEscalationSummary(args: {
    WorkflowName: string;
    ForwardTask: Pick<MJTaskEntity, 'ID' | 'Name' | 'InputPayload' | 'OutputPayload'>;
    CompensationTask: Pick<MJTaskEntity, 'ID' | 'Name' | 'InputPayload' | 'ErrorMessage'>;
    ActionLogID?: string | null;
    RecordChanges?: readonly Record<string, unknown>[];
}): { RequestText: string; ContextData: Record<string, unknown> } {
    const errorMessage = args.CompensationTask.ErrorMessage || 'Compensation action failed without an error message.';
    const contextData: Record<string, unknown> = {
        workflowName: args.WorkflowName,
        forwardTaskID: args.ForwardTask.ID,
        forwardTaskName: args.ForwardTask.Name,
        forwardInput: safeParseJsonObject(args.ForwardTask.InputPayload),
        forwardOutput: safeParseJsonObject(args.ForwardTask.OutputPayload),
        actionLogID: args.ActionLogID ?? null,
        recordChanges: args.RecordChanges ?? [],
        compensationTaskID: args.CompensationTask.ID,
        compensationTaskName: args.CompensationTask.Name,
        compensationInput: safeParseJsonObject(args.CompensationTask.InputPayload),
        compensationError: errorMessage,
    };
    const requestText =
        `Saga compensation failed in workflow "${args.WorkflowName}" while rolling back step ` +
        `"${args.ForwardTask.Name}" (${args.ForwardTask.ID}).\n` +
        `Compensation task "${args.CompensationTask.Name}" (${args.CompensationTask.ID}) failed with error: ${errorMessage}\n` +
        'Undo the step by hand, then complete this task to let the rollback continue; cancel it to stop the rollback here.';
    return { RequestText: requestText, ContextData: contextData };
}

function isActive(row: SagaTaskRow): boolean {
    return row.Status === 'Pending' || row.Status === 'In Progress' || row.Status === 'Deferred';
}

function resolveCompensationMappingExpression(rawExpression: string, envelope: Record<string, unknown>): unknown {
    const trimmed = rawExpression.trim();
    if (trimmed.toLowerCase().startsWith('static:')) {
        return rawExpression.substring(rawExpression.indexOf(':') + 1);
    }
    const unwrapped = trimmed.startsWith('{{') && trimmed.endsWith('}}') ? trimmed.slice(2, -2).trim() : trimmed;
    if (['input', 'output', 'actionLogId', 'actionLogID', 'recordChanges', 'payload'].includes(unwrapped)) {
        return envelope[unwrapped];
    }
    const dotIndex = unwrapped.indexOf('.');
    if (dotIndex > 0) {
        const prefix = unwrapped.slice(0, dotIndex);
        if (prefix === 'input' || prefix === 'output' || prefix === 'recordChanges' || prefix === 'payload') {
            return GetValueFromPath(envelope[prefix], unwrapped.slice(dotIndex + 1));
        }
    }
    const fromEnvelope = GetValueFromPath(envelope, unwrapped);
    return fromEnvelope !== undefined ? fromEnvelope : rawExpression;
}

function parseMappingDictionary(mapping: Readonly<Record<string, string>> | string | null | undefined): Record<string, string> | null {
    if (!mapping) return null;
    let raw: unknown = mapping;
    if (typeof mapping === 'string') {
        try {
            raw = JSON.parse(mapping);
        } catch {
            return null;
        }
    }
    if (!isRecord(raw)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string') out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
}

function normalizeMappingField(raw: unknown): Readonly<Record<string, string>> | string | undefined {
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
    if (isRecord(raw)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
            if (typeof v === 'string') out[k] = v;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }
    return undefined;
}

function normalizeFailurePolicy(raw: unknown): ActionCompensationFailurePolicy | undefined {
    return raw === 'EscalateToHumanTask' || raw === 'HaltSaga' || raw === 'ContinueCompensation' ? raw : undefined;
}

function normalizeRetryCount(raw: unknown): number | undefined {
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : undefined;
}

function readSequenceFromConfiguration(configurationJson: string | null): number {
    if (!configurationJson) return -1;
    try {
        const parsed: unknown = JSON.parse(configurationJson);
        return isRecord(parsed) && typeof parsed.sequence === 'number' && Number.isFinite(parsed.sequence) ? parsed.sequence : -1;
    } catch {
        return -1;
    }
}

function parseTimestampMs(value: Date | string | null | undefined): number {
    if (!value) return 0;
    const ms = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
}

function safeParseJsonObject(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function computeTopologicalDepthByTaskId(
    tasks: readonly SagaTaskRow[],
    dependencies: ReadonlyArray<{ TaskID: string; DependsOnTaskID: string }>,
): UUIDMap<number> {
    const depths = new UUIDMap<number>();
    if (dependencies.length === 0) return depths;
    const dependsOnByTask = new UUIDMap<string[]>();
    for (const dep of dependencies) {
        const existing = dependsOnByTask.Get(dep.TaskID) ?? [];
        existing.push(dep.DependsOnTaskID);
        dependsOnByTask.Set(dep.TaskID, existing);
    }
    const visiting = new UUIDSet();
    const visit = (taskId: string): number => {
        const cached = depths.Get(taskId);
        if (cached !== undefined) return cached;
        if (visiting.Has(taskId)) return 0;
        visiting.Add(taskId);
        let maxParentDepth = -1;
        for (const parentId of dependsOnByTask.Get(taskId) ?? []) {
            maxParentDepth = Math.max(maxParentDepth, visit(parentId));
        }
        visiting.Delete(taskId);
        depths.Set(taskId, maxParentDepth + 1);
        return maxParentDepth + 1;
    };
    for (const row of tasks) visit(row.ID);
    return depths;
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
