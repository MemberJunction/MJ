/**
 * @fileoverview Pure helpers for Plain-English Diagnostic Co-Pilot notices and X-Ray telemetry
 * extraction from `MJ: Tasks` rows. Kept pure for zero-TestBed unit testing.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import type { MJTaskEntity } from '@memberjunction/core-entities';
import {
    ComputeTasksToBlock,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';
import type { FlowNodeConfidence, FlowNodeXRayItem } from '@memberjunction/ng-flow-editor';
import type { TaskGraphRunFrame } from './task-graph-run-view.component';

/** One plain-English diagnostic banner rendered at the top of a run view or debugger. */
export interface TaskGraphDiagnosticNotice {
    Kind: 'held' | 'worker-lost' | 'breakpoint' | 'taint' | 'saga' | 'failed';
    Title: string;
    Message: string;
    TaskID?: string;
    TaskName?: string;
    EdgeID?: string;
    ConditionText?: string;
}

/** Per-step telemetry extracted from task rows for X-Ray canvas rendering. */
export interface ExtractedGraphTelemetry {
    XRayItems: Record<string, FlowNodeXRayItem[]>;
    DecisionConfidence: Record<string, FlowNodeConfidence>;
    TaintedTaskIDs: string[];
    VerifiedTaskIDs: string[];
    SagaCompensationLabels: Record<string, string>;
}

/**
 * Translates live frames, pause state, and task rows into a single plain-English Co-Pilot notice.
 * Returns null when the run is healthy and needs no operator intervention.
 */
export function BuildTaskGraphDiagnostic(params: {
    LatestFrame?: TaskGraphRunFrame | null;
    PausedAtTaskID?: string | null;
    GraphPaused?: boolean;
    IsSettled?: boolean;
    Tasks?: readonly MJTaskEntity[];
}): TaskGraphDiagnosticNotice | null {
    const { LatestFrame, PausedAtTaskID, GraphPaused, IsSettled, Tasks = [] } = params;

    if (LatestFrame?.kind === 'GateDecision' && LatestFrame.verdict === 'held') {
        const stepName = LatestFrame.taskName || findTaskName(Tasks, LatestFrame.taskId) || 'A step';
        const reason = LatestFrame.reason ? ` (${LatestFrame.reason})` : '';
        return {
            Kind: 'held',
            Title: 'Path Waiting on Decision',
            Message: `"${stepName}" is held because its path condition could not be answered automatically${reason}. Choose Yes or No to continue.`,
            TaskID: LatestFrame.taskId,
            TaskName: stepName,
            EdgeID: LatestFrame.edgeId,
            ConditionText: LatestFrame.conditionText,
        };
    }

    if (LatestFrame?.kind === 'ClaimChanged' && LatestFrame.claimEvent === 'heartbeat-lost') {
        const stepName = LatestFrame.taskName || findTaskName(Tasks, LatestFrame.taskId) || 'A step';
        return {
            Kind: 'worker-lost',
            Title: 'Worker Heartbeat Lost',
            Message: `"${stepName}" lost its worker heartbeat. The dispatcher will automatically reclaim and resume it from its last checkpoint.`,
            TaskID: LatestFrame.taskId,
            TaskName: stepName,
        };
    }

    const failedTask = Tasks.find((t) => t.Status === 'Failed');
    if (failedTask) {
        const errText = failedTask.ErrorMessage ?? '';
        if (errText.includes('TAINTED_EGRESS_BLOCKED') || errText.toLowerCase().includes('taint')) {
            return {
                Kind: 'taint',
                Title: 'Protected by External Data Safety Gate',
                Message: `"${failedTask.Name}" was stopped because it received unverified external data. Add or approve a Person step before this action.`,
                TaskID: failedTask.ID,
                TaskName: failedTask.Name,
            };
        }
        return {
            Kind: 'failed',
            Title: 'Step Failed',
            Message: `"${failedTask.Name}" failed${errText ? `: ${truncate(errText, 140)}` : ''}. Retry, edit its input, or inspect downstream impact.`,
            TaskID: failedTask.ID,
            TaskName: failedTask.Name,
        };
    }

    if (!IsSettled && PausedAtTaskID) {
        const stepName = findTaskName(Tasks, PausedAtTaskID) || 'this step';
        return {
            Kind: 'breakpoint',
            Title: 'Paused at Breakpoint',
            Message: `Execution paused right before "${stepName}". Inspect its inputs, then press Continue (F5), Step Next (F10), or Step Wave (F11).`,
            TaskID: PausedAtTaskID,
            TaskName: stepName,
        };
    }

    if (!IsSettled && GraphPaused) {
        return {
            Kind: 'breakpoint',
            Title: 'Run Paused',
            Message: 'Nothing new will start until you press Continue (F5), Step Next (F10), or Step Wave (F11).',
        };
    }

    return null;
}

/**
 * Extracts inline X-Ray telemetry (compact I/O summary, Decision confidence, Taint/Person-verified
 * shields, and Saga rollback labels) directly from `MJ: Tasks` rows.
 */
export function ExtractGraphTelemetry(tasks: readonly MJTaskEntity[]): ExtractedGraphTelemetry {
    const XRayItems: Record<string, FlowNodeXRayItem[]> = {};
    const DecisionConfidence: Record<string, FlowNodeConfidence> = {};
    const TaintedTaskIDs: string[] = [];
    const VerifiedTaskIDs: string[] = [];
    const SagaCompensationLabels: Record<string, string> = {};

    for (const task of tasks) {
        const outputObj = tryParseRecord(task.OutputPayload);
        const inputObj = tryParseRecord(task.InputPayload);
        const configObj = tryParseRecord(task.Configuration);

        // X-Ray compact key/value preview (up to 3 salient fields from output, falling back to input)
        const source = outputObj ?? inputObj;
        if (source) {
            const entries = Object.entries(source)
                .filter(([k]) => !k.startsWith('$') && !k.startsWith('_'))
                .slice(0, 3)
                .map(([key, value]) => ({
                    Key: key,
                    Value: formatCompactValue(value),
                    Changed: outputObj != null,
                }));
            if (entries.length > 0) {
                XRayItems[task.ID] = entries;
            }
        }

        // AI Decision confidence telemetry
        const rawConfidence = extractConfidence(outputObj);
        if (rawConfidence != null) {
            const threshold = typeof configObj?.['minConfidence'] === 'number'
                ? Math.round(configObj['minConfidence'] * 100)
                : undefined;
            DecisionConfidence[task.ID] = {
                Score: rawConfidence,
                Threshold: threshold,
                Label: 'Confidence',
            };
        }

        // Security Taint vs Person Verified shields
        const isHuman = task.StepType === 'Human' || configObj?.['kind'] === 'Human';
        if (isHuman && task.Status === 'Complete') {
            VerifiedTaskIDs.push(task.ID);
        } else if (
            outputObj?.['IsOutputTainted'] === true ||
            configObj?.['IsOutputTainted'] === true ||
            configObj?.['domain'] != null
        ) {
            TaintedTaskIDs.push(task.ID);
        }

        // Saga rollback / compensation indicators
        const compTarget = typeof configObj?.['CompensatesTaskID'] === 'string'
            ? configObj['CompensatesTaskID']
            : (typeof configObj?.['compensationActionName'] === 'string' ? configObj['compensationActionName'] : null);
        if (compTarget) {
            const targetName = findTaskName(tasks, compTarget) ?? compTarget;
            SagaCompensationLabels[task.ID] = `Undo: ${truncate(targetName, 22)}`;
        }
    }

    return { XRayItems, DecisionConfidence, TaintedTaskIDs, VerifiedTaskIDs, SagaCompensationLabels };
}

/**
 * Computes the transitive What-If failure blast radius for a given step using the dispatcher's own
 * `ComputeTasksToBlock` algorithm, treating the target step as failed and downstream steps as pending.
 */
export function ComputeBlastRadiusTaskIDs(
    spec: TaskGraphSpec | null | undefined,
    targetTaskID: string | null | undefined,
): string[] {
    if (!spec || !targetTaskID || spec.tasks.length === 0) return [];
    const matchedTarget = spec.tasks.find((t) => UUIDsEqual(t.tempId, targetTaskID));
    if (!matchedTarget) return [];

    const nodes: TaskGraphNode[] = spec.tasks.map((t) => ({
        id: t.tempId,
        status: UUIDsEqual(t.tempId, matchedTarget.tempId) ? 'Failed' : 'Pending',
    }));
    const edges: TaskGraphEdge[] = [];
    for (const task of spec.tasks) {
        for (const dep of task.dependsOn ?? []) {
            const depId = typeof dep === 'string' ? dep : dep.tempId;
            const depType = typeof dep === 'string' ? 'Prerequisite' : (dep.dependencyType ?? 'Prerequisite');
            edges.push({
                taskId: task.tempId,
                dependsOnTaskId: depId,
                dependencyType: depType,
            });
        }
    }
    return ComputeTasksToBlock(nodes, edges);
}

function findTaskName(tasks: readonly MJTaskEntity[], taskId?: string): string | null {
    if (!taskId) return null;
    return tasks.find((t) => UUIDsEqual(t.ID, taskId))?.Name ?? null;
}

function tryParseRecord(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function extractConfidence(obj: Record<string, unknown> | null): number | null {
    if (!obj) return null;
    const direct = obj['confidence'];
    if (typeof direct === 'number' && Number.isFinite(direct)) {
        return direct <= 1 ? Math.round(direct * 100) : Math.round(direct);
    }
    const nested = obj['decision'] as Record<string, unknown> | undefined;
    if (nested && typeof nested['confidence'] === 'number' && Number.isFinite(nested['confidence'])) {
        return nested['confidence'] <= 1 ? Math.round(nested['confidence'] * 100) : Math.round(nested['confidence']);
    }
    return null;
}

function formatCompactValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return '—';
    if (typeof value === 'string') return truncate(value, 28);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.slice(0, 2).join(', ')}${keys.length > 2 ? ', …' : ''}}`;
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
