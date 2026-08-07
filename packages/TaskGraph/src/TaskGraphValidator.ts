/**
 * @fileoverview Pure validation of a submitted task graph.
 *
 * Kept free of database access on purpose so it runs identically in three places: inside the agent
 * loop (where a failure becomes a retry corrective rather than an exception), inside
 * `TaskGraphService.Submit` as the server-side source of truth, and in unit tests without a
 * database. Agent-name resolution is the one check that genuinely needs the database, so it lives
 * in the service rather than here.
 *
 * Every check returns ALL failures rather than throwing on the first — a producer fixing a
 * malformed graph should see every problem at once, not discover them one round-trip at a time.
 *
 * @module @memberjunction/task-graph
 */
import { DetectCycle, type TaskGraphEdge, type TaskGraphNode } from '@memberjunction/ai-core-plus';
import {
    MAX_TASKS_PER_GRAPH,
    TaskGraphSpec,
    TaskGraphValidationError,
    TaskGraphValidationResult,
} from './TaskGraphSpec';

/**
 * Validates a spec's structure.
 *
 * Does NOT verify that agent names resolve — that requires metadata and is done by the service,
 * which reports unresolvable agents as a hard error rather than silently dropping those nodes.
 */
export function ValidateTaskGraphSpec(spec: TaskGraphSpec): TaskGraphValidationResult {
    const errors: TaskGraphValidationError[] = [];

    if (!spec.workflowName || spec.workflowName.trim().length === 0) {
        errors.push({ Code: 'MissingWorkflowName', Message: 'workflowName is required.' });
    }

    const tasks = spec.tasks ?? [];
    if (tasks.length === 0) {
        errors.push({ Code: 'EmptyGraph', Message: 'A task graph must contain at least one task.' });
        // Nothing further is meaningful without nodes.
        return { Valid: errors.length === 0, Errors: errors };
    }

    if (tasks.length > MAX_TASKS_PER_GRAPH) {
        errors.push({
            Code: 'TooManyTasks',
            Message: `A task graph may contain at most ${MAX_TASKS_PER_GRAPH} tasks; received ${tasks.length}.`,
        });
    }

    // --- per-node checks -----------------------------------------------------
    const seen = new Set<string>();
    for (const task of tasks) {
        if (!task.tempId || task.tempId.trim().length === 0) {
            errors.push({ Code: 'MissingTempId', Message: `Task "${task.name ?? '(unnamed)'}" has no tempId.` });
            continue;
        }
        if (seen.has(task.tempId)) {
            errors.push({
                Code: 'DuplicateTempId',
                Message: `Duplicate tempId "${task.tempId}". Each task needs a unique handle so dependencies resolve unambiguously.`,
                TempId: task.tempId,
            });
        }
        seen.add(task.tempId);

        // Mirrors the Task table's UserID-xor-AgentID constraint, caught here so the producer gets
        // a useful message instead of a constraint violation at persist time.
        const hasAgent = !!task.agentName;
        const hasUser = task.assignToUser === true;
        if (hasAgent && hasUser) {
            errors.push({
                Code: 'AssignmentConflict',
                Message: `Task "${task.tempId}" sets both agentName and assignToUser; a task is executed by an agent OR a person, never both.`,
                TempId: task.tempId,
            });
        }
        if (!hasAgent && !hasUser) {
            errors.push({
                Code: 'NoAssignment',
                Message: `Task "${task.tempId}" has neither agentName nor assignToUser; nothing would execute it.`,
                TempId: task.tempId,
            });
        }

        for (const dep of task.dependsOn ?? []) {
            if (dep === task.tempId) {
                errors.push({
                    Code: 'SelfDependency',
                    Message: `Task "${task.tempId}" depends on itself.`,
                    TempId: task.tempId,
                });
            }
        }
    }

    // --- graph-level checks --------------------------------------------------
    const known = new Set(tasks.map((t) => t.tempId).filter(Boolean));
    for (const task of tasks) {
        for (const dep of task.dependsOn ?? []) {
            if (dep !== task.tempId && !known.has(dep)) {
                errors.push({
                    Code: 'UnknownDependency',
                    Message: `Task "${task.tempId}" depends on "${dep}", which is not a task in this graph.`,
                    TempId: task.tempId,
                });
            }
        }
    }

    // Cycle detection reuses the Phase 1 algorithm rather than reimplementing traversal — the same
    // code that guards execution guards submission, so the two can never disagree.
    const nodes: TaskGraphNode[] = tasks.filter((t) => !!t.tempId).map((t) => ({ id: t.tempId, status: 'Pending' }));
    const edges: TaskGraphEdge[] = tasks.flatMap((t) =>
        (t.dependsOn ?? [])
            .filter((d) => known.has(d) && d !== t.tempId)
            .map((d) => ({ taskId: t.tempId, dependsOnTaskId: d })),
    );
    const cycle = DetectCycle(nodes, edges);
    if (cycle.hasCycle) {
        errors.push({
            Code: 'CycleDetected',
            Message: `Dependency cycle detected: ${cycle.path.join(' -> ')}. A cyclic graph can never execute — nothing would ever become eligible.`,
        });
    }

    return { Valid: errors.length === 0, Errors: errors };
}

/** Renders validation errors as one human/LLM-readable message. */
export function FormatValidationErrors(errors: readonly TaskGraphValidationError[]): string {
    return errors.map((e) => `[${e.Code}] ${e.Message}`).join('\n');
}
