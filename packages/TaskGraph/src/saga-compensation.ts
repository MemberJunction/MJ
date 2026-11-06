/**
 * @fileoverview Pure and durable Saga Compensation helpers for `TaskGraphDispatcher` (WS-4.3).
 *
 * When a task graph runs with `failurePolicy: 'CompensateCompleted'` and an unhandled forward step
 * transitions to `Failed`, the dispatcher identifies all completed upstream `Action` steps that
 * declare a compensation action (either on the workflow node via {@link ActionCompensationSpec} or
 * on the `MJ: Actions` metadata record) and materializes child compensation `MJ: Tasks` rows in
 * **reverse topological completion order**.
 *
 * @module @memberjunction/task-graph
 */
import {
    GetValueFromPath,
    type ActionCompensationFailurePolicy,
    type ActionCompensationSpec,
} from '@memberjunction/ai-core-plus';
import { UUIDMap, UUIDSet } from '@memberjunction/global';

/**
 * Saga lifecycle state recorded on the parent workflow task's metadata (`InputPayload`).
 */
export type SagaExecutionState =
    | 'Running'
    | 'Compensating'
    | 'Compensated'
    | 'CompensationEscalated'
    | 'CompensationFailed';

/**
 * Compensation metadata persisted in `Task.Configuration.compensation`.
 */
export interface TaskCompensationStepMetadata {
    /** Resolved `MJ: Actions` ID of the compensation action to invoke if this step must be rolled back. */
    compensationActionId?: string;
    /** Optional action name of the compensation action (resolved to `compensationActionId` at submit/dispatch time). */
    compensationActionName?: string;
    /**
     * Parameter mapping from `{ input, output, actionLogId, recordChanges, payload }` -> compensation action inputs.
     */
    inputMapping?: Readonly<Record<string, string>> | string;
    /**
     * Alias for `inputMapping` matching `CompensationInputMapping` metadata column naming.
     */
    compensationInputMapping?: Readonly<Record<string, string>> | string;
    /** Policy if the compensation task itself fails after retries exhaust. Default `'EscalateToHumanTask'`. */
    onCompensationFailure?: ActionCompensationFailurePolicy;
    /** Signals safe automatic retry and compensation replay. */
    isIdempotent?: boolean;
    /** Optional automatic retry count when `isIdempotent === true` or on the compensation step. */
    retryCount?: number;
    /**
     * Present on a synthesized compensation child `MJ: Tasks` row: the forward `Task.ID` this task compensates.
     */
    compensatesTaskID?: string;
    /**
     * Present on a forward task once its compensation task has been materialized so compensation is idempotent.
     */
    compensatedByTaskID?: string;
    /**
     * Present on a failed compensation task once HITL escalation (`MJ: AI Agent Requests`) has been raised.
     */
    escalatedRequestID?: string;
}

/**
 * Structural slice of an `MJ: Actions` record (or action metadata row) that may carry default
 * compensation metadata either as direct properties or inside its `Config_` JSON column.
 */
export interface CompensatableActionRecord {
    ID?: string;
    Name?: string;
    Config_?: string | null;
    CompensationActionID?: string | null;
    CompensationInputMapping?: Readonly<Record<string, string>> | string | null;
    IsIdempotent?: boolean | null;
}

/**
 * Structural slice of a `MJ: Tasks` row inspected by the reverse-topological saga planner.
 */
export interface CompensatableTaskRow {
    ID: string;
    Name: string;
    Status: string;
    StepType: string | null;
    ActionID: string | null;
    CompletedAt: Date | string | null;
    Configuration: string | null;
    InputPayload: string | null;
    OutputPayload: string | null;
    ErrorMessage?: string | null;
}

/**
 * Reads default `ActionCompensationSpec` metadata from an `MJ: Actions` record (`Config_` JSON or
 * direct `CompensationActionID` / `CompensationInputMapping` / `IsIdempotent` fields).
 */
export function ReadActionCompensationMetadata(
    action: CompensatableActionRecord | null | undefined,
): ActionCompensationSpec | null {
    if (!action) return null;

    let fromConfig: Partial<ActionCompensationSpec> = {};
    if (typeof action.Config_ === 'string' && action.Config_.trim().length > 0) {
        try {
            const parsed: unknown = JSON.parse(action.Config_);
            if (isRecord(parsed)) {
                const nested = isRecord(parsed.compensation) ? parsed.compensation : parsed;
                const mapped = normalizeMappingField(
                    nested.inputMapping ?? nested.compensationInputMapping ?? nested.CompensationInputMapping,
                );
                fromConfig = {
                    compensationActionId: asNonEmptyString(nested.compensationActionId ?? nested.CompensationActionID),
                    compensationActionName: asNonEmptyString(nested.compensationActionName ?? nested.CompensationActionName),
                    inputMapping: mapped,
                    compensationInputMapping: mapped,
                    onCompensationFailure: normalizeFailurePolicy(nested.onCompensationFailure),
                    isIdempotent: typeof (nested.isIdempotent ?? nested.IsIdempotent) === 'boolean'
                        ? Boolean(nested.isIdempotent ?? nested.IsIdempotent)
                        : undefined,
                    retryCount: typeof nested.retryCount === 'number' && Number.isFinite(nested.retryCount)
                        ? Math.max(0, Math.floor(nested.retryCount))
                        : undefined,
                };
            }
        } catch {
            // Non-JSON or unrelated action Config_ is ignored.
        }
    }

    const compensationActionId = asNonEmptyString(action.CompensationActionID) ?? fromConfig.compensationActionId;
    const compensationActionName = fromConfig.compensationActionName;
    const inputMapping = normalizeMappingField(action.CompensationInputMapping) ?? fromConfig.inputMapping;
    const isIdempotent = typeof action.IsIdempotent === 'boolean' ? action.IsIdempotent : fromConfig.isIdempotent;
    const onCompensationFailure = fromConfig.onCompensationFailure;
    const retryCount = fromConfig.retryCount;

    if (
        !compensationActionId &&
        !compensationActionName &&
        !inputMapping &&
        isIdempotent === undefined &&
        !onCompensationFailure &&
        retryCount === undefined
    ) {
        return null;
    }

    return {
        ...(compensationActionId ? { compensationActionId } : {}),
        ...(compensationActionName ? { compensationActionName } : {}),
        ...(inputMapping ? { inputMapping, compensationInputMapping: inputMapping } : {}),
        ...(onCompensationFailure ? { onCompensationFailure } : {}),
        ...(isIdempotent !== undefined ? { isIdempotent } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
    };
}

/**
 * Merges an action's default compensation metadata with a workflow node's explicit override.
 * Node-level fields take precedence over action-level defaults.
 */
export function MergeActionCompensationSpecs(
    actionDefault: ActionCompensationSpec | null | undefined,
    nodeOverride: ActionCompensationSpec | TaskCompensationStepMetadata | null | undefined,
): TaskCompensationStepMetadata | null {
    if (!actionDefault && !nodeOverride) return null;

    const compensationActionId =
        asNonEmptyString(nodeOverride?.compensationActionId) ??
        asNonEmptyString(actionDefault?.compensationActionId);
    const compensationActionName =
        asNonEmptyString(nodeOverride?.compensationActionName) ??
        asNonEmptyString(actionDefault?.compensationActionName);
    const inputMapping =
        nodeOverride?.inputMapping ??
        nodeOverride?.compensationInputMapping ??
        actionDefault?.inputMapping ??
        actionDefault?.compensationInputMapping;
    const onCompensationFailure =
        normalizeFailurePolicy(nodeOverride?.onCompensationFailure) ??
        normalizeFailurePolicy(actionDefault?.onCompensationFailure) ??
        'EscalateToHumanTask';
    const isIdempotent =
        typeof nodeOverride?.isIdempotent === 'boolean'
            ? nodeOverride.isIdempotent
            : typeof actionDefault?.isIdempotent === 'boolean'
                ? actionDefault.isIdempotent
                : undefined;
    const retryCount =
        typeof nodeOverride?.retryCount === 'number' && Number.isFinite(nodeOverride.retryCount)
            ? Math.max(0, Math.floor(nodeOverride.retryCount))
            : typeof actionDefault?.retryCount === 'number' && Number.isFinite(actionDefault.retryCount)
                ? Math.max(0, Math.floor(actionDefault.retryCount))
                : undefined;

    const existingMeta = nodeOverride as TaskCompensationStepMetadata | null | undefined;
    return {
        ...(compensationActionId ? { compensationActionId } : {}),
        ...(compensationActionName ? { compensationActionName } : {}),
        ...(inputMapping !== undefined ? { inputMapping, compensationInputMapping: inputMapping } : {}),
        onCompensationFailure,
        ...(isIdempotent !== undefined ? { isIdempotent } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
        ...(existingMeta?.compensatesTaskID ? { compensatesTaskID: existingMeta.compensatesTaskID } : {}),
        ...(existingMeta?.compensatedByTaskID ? { compensatedByTaskID: existingMeta.compensatedByTaskID } : {}),
        ...(existingMeta?.escalatedRequestID ? { escalatedRequestID: existingMeta.escalatedRequestID } : {}),
    };
}

/**
 * Reads `Task.Configuration.compensation` from a serialized `Configuration` JSON string.
 */
export function ReadTaskCompensationMetadata(
    configurationJson: string | null | undefined,
): TaskCompensationStepMetadata | null {
    if (!configurationJson) return null;
    try {
        const parsed: unknown = JSON.parse(configurationJson);
        if (!isRecord(parsed) || !isRecord(parsed.compensation)) return null;
        const comp = parsed.compensation;
        const mapping = normalizeMappingField(comp.inputMapping ?? comp.compensationInputMapping);
        const retryCount = typeof comp.retryCount === 'number' && Number.isFinite(comp.retryCount)
            ? Math.max(0, Math.floor(comp.retryCount))
            : undefined;
        return {
            ...(asNonEmptyString(comp.compensationActionId) ? { compensationActionId: asNonEmptyString(comp.compensationActionId) } : {}),
            ...(asNonEmptyString(comp.compensationActionName) ? { compensationActionName: asNonEmptyString(comp.compensationActionName) } : {}),
            ...(mapping !== undefined ? { inputMapping: mapping, compensationInputMapping: mapping } : {}),
            ...(normalizeFailurePolicy(comp.onCompensationFailure)
                ? { onCompensationFailure: normalizeFailurePolicy(comp.onCompensationFailure) }
                : {}),
            ...(typeof comp.isIdempotent === 'boolean' ? { isIdempotent: comp.isIdempotent } : {}),
            ...(retryCount !== undefined ? { retryCount } : {}),
            ...(asNonEmptyString(comp.compensatesTaskID) ? { compensatesTaskID: asNonEmptyString(comp.compensatesTaskID) } : {}),
            ...(asNonEmptyString(comp.compensatedByTaskID) ? { compensatedByTaskID: asNonEmptyString(comp.compensatedByTaskID) } : {}),
            ...(asNonEmptyString(comp.escalatedRequestID) ? { escalatedRequestID: asNonEmptyString(comp.escalatedRequestID) } : {}),
        };
    } catch {
        return null;
    }
}

/**
 * Returns true when `row` is a synthesized saga compensation task (`Configuration.compensation.compensatesTaskID` is set).
 */
export function IsCompensationTask(row: Pick<CompensatableTaskRow, 'Configuration'>): boolean {
    const meta = ReadTaskCompensationMetadata(row.Configuration);
    return typeof meta?.compensatesTaskID === 'string' && meta.compensatesTaskID.length > 0;
}

/**
 * Selects all completed forward `Action` tasks that require compensation, ordered in **reverse
 * topological completion order**:
 * 1. Higher topological depth / `sequence` first when ranks differ;
 * 2. Later `CompletedAt` timestamp first when ranks are equal or absent;
 * 3. Deterministic `ID` tie-breaker.
 *
 * Excludes tasks that are themselves compensation tasks or already have a materialized compensation
 * task (`compensatedByTaskID` or an existing child task with `compensatesTaskID === row.ID`).
 */
export function SelectTasksToCompensate<T extends CompensatableTaskRow>(
    tasks: readonly T[],
    actionDefaultsOrDependencies?:
        | ReadonlyMap<string, ActionCompensationSpec>
        | ReadonlyArray<{ TaskID: string; DependsOnTaskID: string }>,
    dependencies?: ReadonlyArray<{ TaskID: string; DependsOnTaskID: string }>,
): Array<{ task: T; compensation: TaskCompensationStepMetadata }> {
    const alreadyCompensatedTaskIDs = new UUIDSet();
    for (const row of tasks) {
        const meta = ReadTaskCompensationMetadata(row.Configuration);
        if (meta?.compensatesTaskID) {
            alreadyCompensatedTaskIDs.Add(meta.compensatesTaskID);
        }
    }

    const actionDefaultsByActionId = Array.isArray(actionDefaultsOrDependencies)
        ? undefined
        : (actionDefaultsOrDependencies as ReadonlyMap<string, ActionCompensationSpec> | undefined);
    const effectiveDeps = Array.isArray(actionDefaultsOrDependencies)
        ? actionDefaultsOrDependencies
        : dependencies;

    const normalizedActionDefaults = new UUIDMap<ActionCompensationSpec>();
    if (actionDefaultsByActionId) {
        for (const [key, spec] of actionDefaultsByActionId.entries()) {
            normalizedActionDefaults.Set(key, spec);
        }
    }

    const topoDepthByTaskId = computeTopologicalDepthByTaskId(tasks, effectiveDeps);

    const candidates: Array<{
        task: T;
        compensation: TaskCompensationStepMetadata;
        sequence: number;
        completedAtMs: number;
    }> = [];

    for (const row of tasks) {
        if (row.Status !== 'Complete') continue;
        if (row.StepType && row.StepType !== 'Action') continue;
        if (!row.ActionID && !ReadTaskCompensationMetadata(row.Configuration)?.compensationActionId && !ReadTaskCompensationMetadata(row.Configuration)?.compensationActionName) {
            continue;
        }

        const nodeComp = ReadTaskCompensationMetadata(row.Configuration);
        if (nodeComp?.compensatesTaskID) continue;
        if (nodeComp?.compensatedByTaskID) continue;
        if (alreadyCompensatedTaskIDs.Has(row.ID)) continue;

        const actionDefault = row.ActionID ? normalizedActionDefaults.Get(row.ActionID) : undefined;
        const merged = MergeActionCompensationSpecs(actionDefault, nodeComp);
        if (!merged?.compensationActionId && !merged?.compensationActionName) continue;

        const explicitSeq = readSequenceFromConfiguration(row.Configuration);
        const topoDepth = topoDepthByTaskId.Get(row.ID) ?? 0;
        candidates.push({
            task: row,
            compensation: merged,
            sequence: explicitSeq >= 0 ? explicitSeq : topoDepth,
            completedAtMs: parseTimestampMs(row.CompletedAt),
        });
    }

    candidates.sort((a, b) => {
        if (a.sequence !== b.sequence) {
            return b.sequence - a.sequence;
        }
        if (a.completedAtMs !== b.completedAtMs) {
            return b.completedAtMs - a.completedAtMs;
        }
        return b.task.ID.localeCompare(a.task.ID);
    });

    return candidates.map(({ task, compensation }) => ({ task, compensation }));
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
    const {
        ForwardInput,
        ForwardOutput,
        ActionLogID = null,
        RecordChanges = [],
        InputMapping,
    } = args;

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
 * Formats a structured human escalation request body when a compensation task fails under
 * `onCompensationFailure: 'EscalateToHumanTask'`.
 */
export function BuildCompensationEscalationSummary(args: {
    WorkflowName: string;
    ForwardTask: Pick<CompensatableTaskRow, 'ID' | 'Name' | 'InputPayload' | 'OutputPayload'>;
    CompensationTask: Pick<CompensatableTaskRow, 'ID' | 'Name' | 'InputPayload' | 'ErrorMessage'>;
    ActionLogID?: string | null;
    RecordChanges?: readonly Record<string, unknown>[];
}): { RequestText: string; ContextData: Record<string, unknown> } {
    const forwardInput = safeParseJsonObject(args.ForwardTask.InputPayload);
    const forwardOutput = safeParseJsonObject(args.ForwardTask.OutputPayload);
    const compInput = safeParseJsonObject(args.CompensationTask.InputPayload);
    const errorMessage = args.CompensationTask.ErrorMessage || 'Compensation action failed without an error message.';

    const contextData: Record<string, unknown> = {
        workflowName: args.WorkflowName,
        forwardTaskID: args.ForwardTask.ID,
        forwardTaskName: args.ForwardTask.Name,
        forwardInput,
        forwardOutput,
        actionLogID: args.ActionLogID ?? null,
        recordChanges: args.RecordChanges ?? [],
        compensationTaskID: args.CompensationTask.ID,
        compensationTaskName: args.CompensationTask.Name,
        compensationInput: compInput,
        compensationError: errorMessage,
    };

    const requestText =
        `Saga compensation failed in workflow "${args.WorkflowName}" while rolling back step ` +
        `"${args.ForwardTask.Name}" (${args.ForwardTask.ID}).\n` +
        `Compensation task "${args.CompensationTask.Name}" (${args.CompensationTask.ID}) failed with error: ${errorMessage}`;

    return { RequestText: requestText, ContextData: contextData };
}

function resolveCompensationMappingExpression(
    rawExpression: string,
    envelope: Record<string, unknown>,
): unknown {
    const trimmed = rawExpression.trim();
    if (trimmed.toLowerCase().startsWith('static:')) {
        return rawExpression.substring(rawExpression.indexOf(':') + 1);
    }
    const unwrapped = trimmed.startsWith('{{') && trimmed.endsWith('}}')
        ? trimmed.slice(2, -2).trim()
        : trimmed;

    if (unwrapped === 'input' || unwrapped === 'output' || unwrapped === 'actionLogId' || unwrapped === 'actionLogID' || unwrapped === 'recordChanges' || unwrapped === 'payload') {
        return envelope[unwrapped];
    }

    const dotIndex = unwrapped.indexOf('.');
    if (dotIndex > 0) {
        const prefix = unwrapped.slice(0, dotIndex);
        const remainder = unwrapped.slice(dotIndex + 1);
        if (prefix === 'input' || prefix === 'output' || prefix === 'recordChanges' || prefix === 'payload') {
            return GetValueFromPath(envelope[prefix], remainder);
        }
    }

    const fromEnvelope = GetValueFromPath(envelope, unwrapped);
    return fromEnvelope !== undefined ? fromEnvelope : rawExpression;
}

function parseMappingDictionary(
    mapping: Readonly<Record<string, string>> | string | null | undefined,
): Record<string, string> | null {
    if (!mapping) return null;
    if (typeof mapping === 'string') {
        try {
            const parsed: unknown = JSON.parse(mapping);
            if (!isRecord(parsed)) return null;
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string') out[k] = v;
            }
            return out;
        } catch {
            return null;
        }
    }
    if (isRecord(mapping)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(mapping)) {
            if (typeof v === 'string') out[k] = v;
        }
        return out;
    }
    return null;
}

function normalizeMappingField(
    raw: unknown,
): Readonly<Record<string, string>> | string | undefined {
    if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim();
    }
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
    if (raw === 'EscalateToHumanTask' || raw === 'HaltSaga' || raw === 'ContinueCompensation') {
        return raw;
    }
    return undefined;
}

function readSequenceFromConfiguration(configurationJson: string | null): number {
    if (!configurationJson) return -1;
    try {
        const parsed: unknown = JSON.parse(configurationJson);
        if (isRecord(parsed) && typeof parsed.sequence === 'number' && Number.isFinite(parsed.sequence)) {
            return parsed.sequence;
        }
        return -1;
    } catch {
        return -1;
    }
}

function parseTimestampMs(value: Date | string | null | undefined): number {
    if (!value) return 0;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
    const ms = Date.parse(value);
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
    tasks: readonly CompensatableTaskRow[],
    dependencies?: ReadonlyArray<{ TaskID: string; DependsOnTaskID: string }>,
): UUIDMap<number> {
    const depths = new UUIDMap<number>();
    if (!dependencies || dependencies.length === 0) return depths;

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
        const parents = dependsOnByTask.Get(taskId) ?? [];
        let maxParentDepth = -1;
        for (const parentId of parents) {
            maxParentDepth = Math.max(maxParentDepth, visit(parentId));
        }
        visiting.Delete(taskId);
        const depth = maxParentDepth + 1;
        depths.Set(taskId, depth);
        return depth;
    };

    for (const row of tasks) {
        visit(row.ID);
    }
    return depths;
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
