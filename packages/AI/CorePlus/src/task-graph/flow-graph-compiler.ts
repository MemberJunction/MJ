/**
 * @fileoverview Compiles a design-time Flow into an executable `TaskGraphSpec` (Track C1.1).
 *
 * **The missing edge.** A Flow agent's graph is already persisted metadata (`AIAgentStep` +
 * `AIAgentStepPath`) and `TaskGraphSpec` is already the engine's contract — but nothing turned one
 * into the other, so flows ran on a second traversal engine that wrote `AIAgentRunStep` rows while
 * the dispatcher wrote `Task` rows. This is that edge, and it is a pure function so it can be
 * differentially tested against the engine it replaces before anything changes execution.
 *
 * **`traversalMode` is a compiler input, not a runtime flag** — the single most important idea here.
 * A flow's `sequential` default is NOT "run the branches in order": the walker takes the
 * highest-priority *satisfied* edge and discards the rest. Compiling that to a dependency chain
 * would execute branches the author's flow has never executed. It is an exclusive choice, resolved
 * at run time, so it compiles to an `exclusiveGroup` — and satisfaction, being a property of the
 * live payload, is not knowable at compile time at all.
 *
 * @module @memberjunction/ai-core-plus
 */
import type { MJAIAgentStepEntity } from '@memberjunction/core-entities';
import { DetectCycle, type TaskGraphEdge, type TaskGraphNode } from './graph-algorithms';
import {
    TaskNode,
    type TaskGraphDependency,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type NodeExecutionPolicy,
    type NodeLayout,
    type TaskNodeBase,
} from './task-graph-spec';
import type { ForEachOperation } from '../foreach-operation';
import type { WhileOperation } from '../while-operation';

/**
 * The step columns the compiler reads.
 *
 * Field types are derived from the entity rather than restated, so a value CodeGen adds to a CHECK
 * constraint flows through instead of silently failing to match a hand-copied union. This is a
 * superset of `AgentSpec.AgentStep`, which omits `Status`, the policy columns and the layout columns.
 */
export type FlowCompilerStep = {
    ID: string;
    Name: string;
    Description?: string | null;
    StepType: MJAIAgentStepEntity['StepType'];
    StartingStep: boolean;
    Status: MJAIAgentStepEntity['Status'];

    ActionID?: string | null;
    SubAgentID?: string | null;
    PromptID?: string | null;
    LoopBodyType?: MJAIAgentStepEntity['LoopBodyType'];
    Configuration?: string | null;
    ActionInputMapping?: string | null;
    ActionOutputMapping?: string | null;

    TimeoutSeconds?: number | null;
    RetryCount?: number | null;
    OnErrorBehavior?: MJAIAgentStepEntity['OnErrorBehavior'];

    PositionX?: number | null;
    PositionY?: number | null;
    Width?: number | null;
    Height?: number | null;
};

/** The path columns the compiler reads. */
export type FlowCompilerPath = {
    ID: string;
    OriginStepID: string;
    DestinationStepID: string;
    Condition?: string | null;
    Priority: number;
    PathPoints?: string | null;
};

/** Everything the compiler cannot derive from the graph itself. */
export type FlowCompilerOptions = {
    /** Name for the compiled graph — the agent's name. */
    WorkflowName: string;
    /** Why this graph exists, carried to the parent task's description. */
    Reasoning?: string;
    /** Resolves a sub-agent ID to its name; the spec addresses agents by name. */
    ResolveAgentName: (agentID: string) => string | null;
    /** Resolves an action ID to its name. */
    ResolveActionName: (actionID: string) => string | null;
    /** Resolves a prompt ID to its name. */
    ResolvePromptName: (promptID: string) => string | null;
    /**
     * How the flow advances when more than one outgoing edge is satisfied.
     *
     * Defaults to `'sequential'`, matching the runtime. That default is load-bearing: flows drawn
     * with fan-out shapes were historically walked by a single program counter, so compiling them
     * as parallel would start executing branches their authors have never seen run.
     */
    TraversalMode?: 'sequential' | 'parallel';
    /** Fan-in rule in parallel mode. `'all'` (AND-join) is the default. */
    JoinMode?: 'all' | 'any';
};

/** Why a flow could not be compiled, in workflow vocabulary (D18 — never graph/DAG/node). */
export type FlowCompileError = {
    Code: 'NoStartingStep' | 'LoopDetected' | 'UnresolvedReference' | 'UnsupportedStepType';
    Message: string;
    /** The offending step, when attributable. */
    StepID?: string;
};

export type FlowCompileResult = {
    Success: boolean;
    Spec?: TaskGraphSpec;
    Errors: FlowCompileError[];
    /** Steps excluded from the compiled graph, and why — reported rather than silently dropped. */
    Excluded: Array<{ StepID: string; Reason: 'NotActive' | 'Unreachable' }>;
};

/**
 * Compiles a flow's steps and paths into a `TaskGraphSpec`.
 *
 * The order of the phases below is load-bearing and is the plan's §7:
 * exclusion → single entry → reachability prune → cycle rejection → emission.
 */
export function CompileFlowToTaskGraph(
    steps: readonly FlowCompilerStep[],
    paths: readonly FlowCompilerPath[],
    options: FlowCompilerOptions,
): FlowCompileResult {
    const errors: FlowCompileError[] = [];
    const excluded: FlowCompileResult['Excluded'] = [];

    // ── 1. Exclusion ─────────────────────────────────────────────────────────
    // Non-Active steps are excluded ENTIRELY — no node, and no dependency from any path touching
    // them in either direction. Never emit-with-dropped-edges: a node whose edges were dropped has
    // no prerequisites left, which makes it immediately eligible and it would run at wave one.
    const active = steps.filter((s) => s.Status === 'Active');
    for (const s of steps) if (s.Status !== 'Active') excluded.push({ StepID: s.ID, Reason: 'NotActive' });

    const activeIDs = new Set(active.map((s) => s.ID));
    const livePaths = paths.filter((p) => activeIDs.has(p.OriginStepID) && activeIDs.has(p.DestinationStepID));

    // ── 2. Single entry ──────────────────────────────────────────────────────
    // The walker starts at ONE step: `getStartingSteps` sorts by Name and takes the first. Other
    // steps flagged StartingStep are not entries, and compiling them as additional roots would run
    // work the flow never ran.
    const startingSteps = active.filter((s) => s.StartingStep === true).sort((a, b) => a.Name.localeCompare(b.Name));
    if (startingSteps.length === 0) {
        errors.push({
            Code: 'NoStartingStep',
            Message: 'This workflow has no active first step, so there is nothing to run. Mark one step as the starting step and make sure it is active.',
        });
        return { Success: false, Errors: errors, Excluded: excluded };
    }
    const entry = startingSteps[0];

    // ── 3. Reachability prune ────────────────────────────────────────────────
    // Anything the walker can never reach from the entry must not become a second root.
    const reachable = computeReachable(entry.ID, livePaths);
    const compiledSteps = active.filter((s) => reachable.has(s.ID));
    for (const s of active) if (!reachable.has(s.ID)) excluded.push({ StepID: s.ID, Reason: 'Unreachable' });

    const compiledIDs = new Set(compiledSteps.map((s) => s.ID));
    const compiledPaths = livePaths.filter((p) => compiledIDs.has(p.OriginStepID) && compiledIDs.has(p.DestinationStepID));

    // ── 4. Cycle rejection ───────────────────────────────────────────────────
    // The in-run walker tolerates a back-edge; a run-once task DAG cannot — nothing downstream would
    // ever become eligible. Rejected HERE, in workflow vocabulary, because letting it reach the
    // task-graph validator would report it in graph vocabulary to a workflow author (D18).
    const cycleNodes: TaskGraphNode[] = compiledSteps.map((s) => ({ id: s.ID, status: 'Pending' }));
    const cycleEdges: TaskGraphEdge[] = compiledPaths.map((p) => ({
        taskId: p.DestinationStepID,
        dependsOnTaskId: p.OriginStepID,
    }));
    const cycle = DetectCycle(cycleNodes, cycleEdges);
    if (cycle.hasCycle) {
        const names = cycle.path.map((id) => compiledSteps.find((s) => s.ID === id)?.Name ?? id);
        errors.push({
            Code: 'LoopDetected',
            Message: `These steps form a loop: ${names.join(' → ')}. A workflow runs each step once, so express repetition with a ForEach or While step instead.`,
        });
        return { Success: false, Errors: errors, Excluded: excluded };
    }

    // ── 5. Emission ──────────────────────────────────────────────────────────
    const dependenciesByDestination = buildDependencies(compiledPaths, options);

    const tasks: TaskGraphSpecNode[] = [];
    for (const step of compiledSteps) {
        const node = emitNode(step, dependenciesByDestination.get(step.ID) ?? [], options, errors);
        if (node) tasks.push(node);
    }

    if (errors.length > 0) return { Success: false, Errors: errors, Excluded: excluded };

    return {
        Success: true,
        Spec: {
            workflowName: options.WorkflowName,
            reasoning: options.Reasoning,
            tasks,
            // A flow's failure handling IS its outgoing edges: after a failed step the walker
            // evaluates its paths with the failure in context, and a satisfied one is a recovery
            // path. The dispatcher's default is the opposite, so every compiled flow says so.
            failureSemantics: 'edges',
        },
        Errors: [],
        Excluded: excluded,
    };
}

/** Everything reachable from the entry by following paths forward. */
function computeReachable(entryID: string, paths: readonly FlowCompilerPath[]): Set<string> {
    const forward = new Map<string, string[]>();
    for (const p of paths) {
        const list = forward.get(p.OriginStepID);
        if (list) list.push(p.DestinationStepID); else forward.set(p.OriginStepID, [p.DestinationStepID]);
    }
    const seen = new Set<string>([entryID]);
    const stack = [entryID];
    while (stack.length > 0) {
        for (const next of forward.get(stack.pop()!) ?? []) {
            if (seen.has(next)) continue;
            seen.add(next);
            stack.push(next);
        }
    }
    return seen;
}

/**
 * Turns paths into dependencies, flipping direction and marking exclusive fan-outs.
 *
 * A path points forward (`Origin → Destination`); a dependency points back at the prerequisite.
 *
 * In sequential mode every fan-out (an origin with more than one outgoing path) becomes ONE
 * exclusive group keyed by the origin. `sequence` is assigned in the walker's own tiebreak order —
 * `Priority` descending, then path ID ascending — because compiled edges get fresh identity and a
 * `Priority` tie (the column defaults to 0, so ties are the common case) would otherwise pick a
 * different winner than the engine being replaced.
 */
function buildDependencies(
    paths: readonly FlowCompilerPath[],
    options: FlowCompilerOptions,
): Map<string, TaskGraphDependency[]> {
    const sequential = (options.TraversalMode ?? 'sequential') === 'sequential';

    const byOrigin = new Map<string, FlowCompilerPath[]>();
    for (const p of paths) {
        const list = byOrigin.get(p.OriginStepID);
        if (list) list.push(p); else byOrigin.set(p.OriginStepID, [p]);
    }

    const sequenceByPathID = new Map<string, number>();
    const exclusiveOrigins = new Set<string>();
    for (const [originID, group] of byOrigin) {
        if (!sequential || group.length < 2) continue;
        exclusiveOrigins.add(originID);
        [...group]
            .sort((a, b) => (b.Priority - a.Priority) || a.ID.localeCompare(b.ID))
            .forEach((p, index) => sequenceByPathID.set(p.ID, index));
    }

    const byDestination = new Map<string, TaskGraphDependency[]>();
    for (const p of paths) {
        const dep: TaskGraphDependency = {
            tempId: p.OriginStepID,
            condition: p.Condition?.trim() ? p.Condition : undefined,
            priority: p.Priority,
            pathPoints: p.PathPoints ?? undefined,
            // Joins stay Prerequisite even on the sequential path: it is the Skipped-satisfies rule
            // that makes them safe. Rewriting them to Optional would be wrong — an Optional edge
            // does not gate at all today.
            dependencyType: !sequential && options.JoinMode === 'any' ? 'Optional' : undefined,
        };
        if (exclusiveOrigins.has(p.OriginStepID)) {
            dep.exclusiveGroup = p.OriginStepID;
            dep.sequence = sequenceByPathID.get(p.ID) ?? 0;
        }
        const list = byDestination.get(p.DestinationStepID);
        if (list) list.push(dep); else byDestination.set(p.DestinationStepID, [dep]);
    }
    return byDestination;
}

/** Projects one step onto a spec node, or records why it cannot be. */
function emitNode(
    step: FlowCompilerStep,
    dependsOn: TaskGraphDependency[],
    options: FlowCompilerOptions,
    errors: FlowCompileError[],
): TaskGraphSpecNode | null {
    const base: TaskNodeBase = {
        tempId: step.ID,
        name: step.Name,
        description: step.Description ?? '',
        dependsOn,
        policy: emitPolicy(step),
        layout: emitLayout(step),
    };

    const unresolved = (what: string, id: string): null => {
        errors.push({
            Code: 'UnresolvedReference',
            Message: `Step "${step.Name}" refers to ${what} that no longer exists (${id}). Point it at an existing one, or remove the step.`,
            StepID: step.ID,
        });
        return null;
    };

    switch (step.StepType) {
        case 'Sub-Agent': {
            if (!step.SubAgentID) return unresolved('a sub-agent', '(none set)');
            const agentName = options.ResolveAgentName(step.SubAgentID);
            if (!agentName) return unresolved('an agent', step.SubAgentID);
            // The step's description IS the sub-agent's task, matching the runtime.
            return TaskNode.Agent(base, { agentName, message: step.Description ?? '' });
        }
        case 'Action': {
            if (!step.ActionID) return unresolved('an action', '(none set)');
            const actionName = options.ResolveActionName(step.ActionID);
            if (!actionName) return unresolved('an action', step.ActionID);
            return TaskNode.Action(base, {
                actionName,
                inputMapping: step.ActionInputMapping ?? undefined,
                outputMapping: step.ActionOutputMapping ?? undefined,
            });
        }
        case 'Prompt': {
            if (!step.PromptID) return unresolved('a prompt', '(none set)');
            const promptName = options.ResolvePromptName(step.PromptID);
            if (!promptName) return unresolved('a prompt', step.PromptID);
            return TaskNode.Prompt(base, { promptName });
        }
        case 'ForEach':
            return TaskNode.ForEach(base, buildForEach(step, options, errors));
        case 'While':
            return TaskNode.While(base, buildWhile(step, options, errors));
        default:
            errors.push({
                Code: 'UnsupportedStepType',
                Message: `Step "${step.Name}" is a ${String(step.StepType)} step, which cannot run in a workflow yet.`,
                StepID: step.ID,
            });
            return null;
    }
}

/**
 * Policy columns → `policy`.
 *
 * Carried for round-trip fidelity. Behaviour comes from the spec's `failureSemantics`, not from
 * `OnErrorBehavior` — a flow's real error handling is its recovery-path edges.
 */
function emitPolicy(step: FlowCompilerStep): NodeExecutionPolicy | undefined {
    const policy: NodeExecutionPolicy = {};
    if (step.TimeoutSeconds != null) policy.timeoutSeconds = step.TimeoutSeconds;
    if (step.RetryCount != null) policy.retryCount = step.RetryCount;
    if (step.OnErrorBehavior === 'continue' || step.OnErrorBehavior === 'fail') policy.onError = step.OnErrorBehavior;
    return Object.keys(policy).length > 0 ? policy : undefined;
}

/** Geometry → `layout`, so a compiled graph reopens on the canvas where its author left it. */
function emitLayout(step: FlowCompilerStep): NodeLayout | undefined {
    const layout: NodeLayout = {};
    if (step.PositionX != null) layout.x = step.PositionX;
    if (step.PositionY != null) layout.y = step.PositionY;
    if (step.Width != null) layout.width = step.Width;
    if (step.Height != null) layout.height = step.Height;
    return Object.keys(layout).length > 0 ? layout : undefined;
}

/** The `Configuration` JSON a loop step stores, parsed defensively. */
type LoopConfigJSON = {
    collectionPath?: string;
    itemVariable?: string;
    indexVariable?: string;
    maxIterations?: number;
    continueOnError?: boolean;
    delayBetweenIterationsMs?: number;
    executionMode?: 'sequential' | 'parallel';
    maxConcurrency?: number;
    condition?: string;
};

function parseLoopConfig(step: FlowCompilerStep, errors: FlowCompileError[]): LoopConfigJSON {
    if (!step.Configuration?.trim()) return {};
    try {
        return JSON.parse(step.Configuration) as LoopConfigJSON;
    } catch {
        // Reported, not thrown: the author gets every problem with their workflow at once, and a
        // malformed setting on one step should not hide a different problem on another.
        errors.push({
            Code: 'UnsupportedStepType',
            Message: `Step "${step.Name}" has settings that could not be read. Re-save the step to repair them.`,
            StepID: step.ID,
        });
        return {};
    }
}

/** Loop body → the operation's `action` / `subAgent` arm, shared by ForEach and While. */
function buildLoopBody(
    step: FlowCompilerStep,
    options: FlowCompilerOptions,
    errors: FlowCompileError[],
): Pick<ForEachOperation, 'action' | 'subAgent'> {
    switch (step.LoopBodyType) {
        case 'Action': {
            const actionName = step.ActionID ? options.ResolveActionName(step.ActionID) : null;
            if (!actionName) break;
            return {
                action: {
                    name: actionName,
                    params: {},
                    outputMapping: step.ActionOutputMapping ?? undefined,
                },
            };
        }
        case 'Sub-Agent': {
            const agentName = step.SubAgentID ? options.ResolveAgentName(step.SubAgentID) : null;
            if (!agentName) break;
            return { subAgent: { name: agentName, message: step.Description ?? '' } };
        }
        case 'Prompt':
            // The in-run engine fails outright on a Prompt loop body ("not yet fully supported"), so
            // this is not a parity gap — the capability arrives with the Prompt runner in C1.5.
            errors.push({
                Code: 'UnsupportedStepType',
                Message: `Step "${step.Name}" repeats a prompt, which is not supported yet. Use an action or a sub-agent as the repeated step.`,
                StepID: step.ID,
            });
            return {};
    }
    errors.push({
        Code: 'UnresolvedReference',
        Message: `Step "${step.Name}" repeats something that no longer exists. Choose what it should repeat.`,
        StepID: step.ID,
    });
    return {};
}

function buildForEach(step: FlowCompilerStep, options: FlowCompilerOptions, errors: FlowCompileError[]): ForEachOperation {
    const config = parseLoopConfig(step, errors);
    return {
        // collectionPath resolves against the live payload, so a loop can NEVER be unrolled at
        // compile time — the dispatcher expands it, honouring executionMode and maxConcurrency.
        collectionPath: config.collectionPath ?? '',
        itemVariable: config.itemVariable,
        indexVariable: config.indexVariable,
        maxIterations: config.maxIterations,
        continueOnError: config.continueOnError,
        delayBetweenIterationsMs: config.delayBetweenIterationsMs,
        executionMode: config.executionMode,
        maxConcurrency: config.maxConcurrency,
        ...buildLoopBody(step, options, errors),
    };
}

function buildWhile(step: FlowCompilerStep, options: FlowCompilerOptions, errors: FlowCompileError[]): WhileOperation {
    const config = parseLoopConfig(step, errors);
    return {
        condition: config.condition ?? '',
        itemVariable: config.itemVariable,
        maxIterations: config.maxIterations,
        continueOnError: config.continueOnError,
        delayBetweenIterationsMs: config.delayBetweenIterationsMs,
        ...buildLoopBody(step, options, errors),
    };
}
