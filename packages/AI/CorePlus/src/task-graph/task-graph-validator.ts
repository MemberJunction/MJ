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
 * @module @memberjunction/ai-core-plus
 */
import { DetectCycle, type TaskGraphEdge, type TaskGraphNode } from './graph-algorithms';
import {
    MAX_TASKS_PER_GRAPH,
    TaskGraphSpec,
    TaskGraphSpecNode,
    TaskGraphValidationError,
    TaskGraphValidationResult,
    NormalizeDependency,
    type TaskGraphNodeConfigMap,
    type TaskGraphNodeKind,
} from './task-graph-spec';

/** Kinds this build knows how to configure. Derived from the map so the two can never drift. */
const KNOWN_KINDS: readonly TaskGraphNodeKind[] = [
    'Agent', 'Action', 'Human', 'Prompt', 'ForEach', 'While', 'External',
];

/**
 * Which `configuration` fields each kind requires.
 *
 * `Human` requires nothing — an unassigned person step is a legitimate "somebody needs to look at
 * this", and `assignToUserID` stays optional until self-assignment lands (#3524).
 */
const REQUIRED_CONFIG_FIELDS: Record<TaskGraphNodeKind, readonly string[]> = {
    Agent: ['agentName'],
    Action: ['actionName'],
    Human: [],
    Prompt: ['promptName'],
    ForEach: ['collectionPath', 'itemVariable'],
    While: ['condition', 'itemVariable'],
    External: ['domain'],
};

/** Reports a node whose `configuration` is missing something its `kind` needs. */
function checkConfiguration(task: TaskGraphSpecNode, errors: TaskGraphValidationError[]): void {
    if (!task.kind) return;   // absence is reported as NoAssignment, not as a configuration fault

    if (!KNOWN_KINDS.includes(task.kind)) {
        errors.push({
            Code: 'UnknownKind',
            Message: `Task "${task.tempId}" has kind "${task.kind}", which this version does not know how to run.`,
            TempId: task.tempId,
        });
        return;
    }

    const config = (task.configuration ?? {}) as Record<string, unknown>;
    const missing = REQUIRED_CONFIG_FIELDS[task.kind].filter((f) => {
        const v = config[f];
        return v === undefined || v === null || (typeof v === 'string' && v.trim().length === 0);
    });
    if (missing.length > 0) {
        errors.push({
            Code: 'InvalidConfiguration',
            Message: `Task "${task.tempId}" is a ${task.kind} step but its configuration is missing ${missing.join(' and ')}.`,
            TempId: task.tempId,
        });
    }
}

/**
 * Exclusive groups must be sibling edges — every member has to leave the SAME origin.
 *
 * A group spanning two origins is not an exclusive choice at all: the two origins complete
 * independently, so "pick one winner" has no single moment at which to be decided, and the loser
 * subtree would be Skipped on the say-so of a branch that never ran.
 */
function checkExclusiveGroups(tasks: readonly TaskGraphSpecNode[], errors: TaskGraphValidationError[]): void {
    // group key -> the set of origin tempIds its member edges leave from
    const originsByGroup = new Map<string, Set<string>>();
    for (const task of tasks) {
        for (const raw of task.dependsOn ?? []) {
            const dep = NormalizeDependency(raw);
            if (!dep.exclusiveGroup) continue;
            let origins = originsByGroup.get(dep.exclusiveGroup);
            if (!origins) { origins = new Set<string>(); originsByGroup.set(dep.exclusiveGroup, origins); }
            origins.add(dep.tempId);
        }
    }
    for (const [group, origins] of originsByGroup) {
        if (origins.size > 1) {
            errors.push({
                Code: 'InvalidExclusiveGroup',
                Message: `Exclusive group "${group}" contains edges from ${origins.size} different origins (${[...origins].join(', ')}). An exclusive choice is decided at one origin; edges from different origins cannot be alternatives to each other.`,
            });
        }
    }
}

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

        // A node carries exactly one `kind`, so a CONFLICTING assignment is unrepresentable — there
        // is no rule to write, which is the point of the union. Only absence is still reachable, and
        // only from a JavaScript caller the compiler never saw.
        if (!task.kind) {
            errors.push({
                Code: 'NoAssignment',
                Message: `Task "${task.tempId}" has no kind; nothing would execute it.`,
                TempId: task.tempId,
            });
        }

        checkConfiguration(task, errors);

        for (const raw of task.dependsOn ?? []) {
            // NORMALISE before comparing. The object form `{ tempId: <own> }` used to slip past this
            // check (it compared the raw union against a string), and because a self-dependency is
            // then excluded from BOTH the UnknownDependency check and cycle detection, an
            // object-form self-edge passed validation entirely and produced a task that could never
            // become eligible.
            if (NormalizeDependency(raw).tempId === task.tempId) {
                errors.push({
                    Code: 'SelfDependency',
                    Message: `Task "${task.tempId}" depends on itself.`,
                    TempId: task.tempId,
                });
            }
        }
    }

    checkExclusiveGroups(tasks, errors);

    // --- graph-level checks --------------------------------------------------
    const known = new Set(tasks.map((t) => t.tempId).filter(Boolean));
    for (const task of tasks) {
        for (const raw of task.dependsOn ?? []) {
            const dep = NormalizeDependency(raw).tempId;
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
            .map(NormalizeDependency)
            .filter((d) => known.has(d.tempId) && d.tempId !== t.tempId)
            .map((d) => ({ taskId: t.tempId, dependsOnTaskId: d.tempId, dependencyType: d.dependencyType })),
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
