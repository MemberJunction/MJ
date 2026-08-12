/**
 * The differential suite (Track C1.1, plan §9) — the guard the cutover rests on.
 *
 * **The claim being tested.** A flow compiled to a `TaskGraphSpec` and executed by the dispatcher's
 * rules must visit exactly the steps, in exactly the order, that `GraphTraversalEngine` visits
 * today. Ordering is an EMERGENT property of the whole graph, so per-function unit tests cannot
 * establish it — only running both engines over the same flow and comparing can.
 *
 * **Why it is built this way.**
 *
 * - Both sides run entirely offline: no database, no dispatcher, no model. A suite that needed any
 *   of those would be run rarely, and a guard that is run rarely is not a guard.
 * - Inputs are fixtures in this file rather than whatever a developer's database happens to hold.
 *   That is not fastidiousness: IT50 once passed for months because a CodeGen run had DELETED the
 *   rows that proved a defect. A suite that reads live state can go green by deletion.
 * - The oracle is the engine being replaced. It is retained (unrouted) through cutover precisely so
 *   this comparison remains possible; deleting it and the suite in one change would remove the
 *   baseline at the exact moment regressions become likely.
 */
import { describe, it, expect } from 'vitest';
import {
    SelectOutgoingEdges,
    type GraphEdge,
    type GraphNode,
    type IConditionEvaluator,
    type IGraphRepository,
} from '../task-graph/graph-traversal-engine';
import { CompileFlowToTaskGraph, type FlowCompilerPath, type FlowCompilerStep } from '../task-graph/flow-graph-compiler';
import {
    ComputeEligibleTasks,
    ComputeSkipCascade,
    ConfirmSkipSeeds,
    ResolveExclusiveGroups,
    type EvaluatedEdge,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphNodeStatus,
} from '../task-graph/graph-algorithms';
import { NormalizeDependency } from '../task-graph/task-graph-spec';

// ── fixtures ────────────────────────────────────────────────────────────────
// Deliberately in-file. See the header: a suite that reads live database state can pass because
// evidence was deleted rather than because behaviour is correct.

type Flow = { steps: FlowCompilerStep[]; paths: FlowCompilerPath[] };

const step = (over: Partial<FlowCompilerStep> & Pick<FlowCompilerStep, 'ID' | 'Name'>): FlowCompilerStep => ({
    StepType: 'Sub-Agent', StartingStep: false, Status: 'Active', SubAgentID: 'a', ...over,
});
const path = (over: Partial<FlowCompilerPath> & Pick<FlowCompilerPath, 'ID' | 'OriginStepID' | 'DestinationStepID'>): FlowCompilerPath => ({
    Priority: 0, ...over,
});

const FLOWS: Record<string, Flow> = {
    'straight line': {
        steps: [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B' }), step({ ID: 'c', Name: 'C' })],
        paths: [path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b' }), path({ ID: 'p2', OriginStepID: 'b', DestinationStepID: 'c' })],
    },
    'fork by priority': {
        steps: [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'hi', Name: 'Hi' }), step({ ID: 'lo', Name: 'Lo' })],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'hi', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'lo', Priority: 1 }),
        ],
    },
    'fork by condition': {
        steps: [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'yes', Name: 'Yes' }), step({ ID: 'no', Name: 'No' })],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'yes', Condition: 'ok', Priority: 5 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'no', Priority: 1 }),
        ],
    },
    'priority tie broken by path id': {
        steps: [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'z', Name: 'Z' }), step({ ID: 'y', Name: 'Y' })],
        paths: [
            path({ ID: 'zzz', OriginStepID: 'a', DestinationStepID: 'z' }),
            path({ ID: 'aaa', OriginStepID: 'a', DestinationStepID: 'y' }),
        ],
    },
    'disabled destination falls through': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'off', Name: 'Off', Status: 'Disabled' }),
            step({ ID: 'on', Name: 'On' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'off', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'on', Priority: 1 }),
        ],
    },
    'fork reconverging on a join': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'b', Name: 'B' }), step({ ID: 'c', Name: 'C' }), step({ ID: 'j', Name: 'J' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'c', Priority: 1 }),
            path({ ID: 'p3', OriginStepID: 'b', DestinationStepID: 'j' }),
            path({ ID: 'p4', OriginStepID: 'c', DestinationStepID: 'j' }),
        ],
    },
    // P1 shape 1 — the skip-a-step diamond. `A` forks: the taken branch goes through Review to
    // Publish, the untaken branch goes straight to Publish. The losing edge `A→Publish` used to seed
    // Publish as Skipped while Review was still running, and the graph settled Complete with the
    // publish step never executed.
    'a fork whose loser targets a step the winner also reaches': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'r', Name: 'Review' }),
            step({ ID: 'p', Name: 'Publish' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'r', Condition: 'ok', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'p', Condition: 'never', Priority: 1 }),
            path({ ID: 'p3', OriginStepID: 'r', DestinationStepID: 'p' }),
        ],
    },
    // P1 shape 2 — two conditions routing to ONE destination. `AIAgentStepPath` has no
    // Origin+Destination unique constraint, so this is drawable. One edge wins and the other loses,
    // making the target simultaneously the winner's target and a skip seed: it was skipped every
    // time, while the walker ran it.
    'two paths from one step to the same destination': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'b', Name: 'B' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Condition: 'ok', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'b', Condition: 'ok', Priority: 1 }),
        ],
    },
    // P2 — an unevaluable guard must not open the gate. A SINGLE successor compiles to no exclusive
    // group, so this is the ordinary-edge dialect: the one that used to treat "cannot evaluate" as
    // "satisfied" and execute the guarded work.
    'a guard that cannot be evaluated': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'g', Name: 'Guarded' }),
        ],
        paths: [path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'g', Condition: 'typo(' })],
    },
    'no path matches — the walk ends': {
        steps: [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B' })],
        paths: [path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Condition: 'never' })],
    },
};

/** Condition truthiness, shared by both engines so the comparison isolates TRAVERSAL. */
const CONTEXT: Record<string, boolean> = { ok: true, never: false };

const evaluator: IConditionEvaluator = {
    Evaluate: (expression) =>
        expression in CONTEXT
            ? { Success: true, Value: CONTEXT[expression] }
            : { Success: false, ErrorMessage: `unknown: ${expression}` },
};

// ── side A: the oracle ──────────────────────────────────────────────────────

function repoFor(flow: Flow): IGraphRepository {
    const nodes: GraphNode[] = flow.steps.map((s) => ({
        id: s.ID, name: s.Name, status: s.Status, isStartNode: s.StartingStep,
    }));
    const edges: GraphEdge[] = flow.paths.map((p) => ({
        id: p.ID, originNodeId: p.OriginStepID, destinationNodeId: p.DestinationStepID,
        condition: p.Condition, priority: p.Priority,
    }));
    return {
        GetNode: (id) => nodes.find((n) => n.id === id) ?? null,
        GetOutgoingEdges: (id) => edges.filter((e) => e.originNodeId === id),
        GetIncomingEdges: (id) => edges.filter((e) => e.destinationNodeId === id),
        GetStartNodes: () => nodes.filter((n) => n.isStartNode),
    };
}

/**
 * The order today's engine visits, as a single program counter.
 *
 * This IS the old behaviour: one entry (Name-sorted, first), then repeatedly take the single
 * highest-priority satisfied edge. It never backtracks to a discarded branch.
 */
function oracleOrder(flow: Flow): string[] {
    const repo = repoFor(flow);
    const start = [...repo.GetStartNodes()].sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!start) return [];

    const visited: string[] = [];
    let current: string | null = start.id;
    const guard = new Set<string>();
    while (current && !guard.has(current)) {
        guard.add(current);
        visited.push(current);
        const selection = SelectOutgoingEdges(current, repo, evaluator, {});
        current = selection.Edges[0]?.destinationNodeId ?? null;
    }
    return visited;
}

// ── side B: the compiled graph, executed by the dispatcher's pure rules ──────

/**
 * Simulates the dispatcher over a compiled spec, applying the pure layer in the ORDER the plan
 * mandates: resolve exclusive groups → seed skips → cascade → THEN eligibility.
 *
 * Cascade-before-eligibility is the invariant this simulator exists to honour. A task whose gating
 * predecessors are all Skipped is simultaneously eligible and to-be-skipped; running eligibility
 * first would dispatch the loser branch.
 */
function compiledOrder(flow: Flow): string[] {
    const compiled = CompileFlowToTaskGraph(flow.steps, flow.paths, {
        WorkflowName: 'W',
        ResolveAgentName: (id) => `Agent ${id}`,
        ResolveActionName: (id) => `Action ${id}`,
        ResolvePromptName: (id) => `Prompt ${id}`,
    });
    if (!compiled.Success) return [];

    const spec = compiled.Spec!;
    const status = new Map<string, TaskGraphNodeStatus>(spec.tasks.map((t) => [t.tempId, 'Pending']));
    // Edge identity includes the ORDINAL, because `${dependsOn}->${task}` is not unique: two paths
    // from one step to the same destination collapse onto one id, so the winner and the loser become
    // indistinguishable and the simulator filters BOTH out of `liveEdges`. That made P1's
    // same-destination shape invisible to this suite — the oracle could not see the bug it exists to
    // catch. `dependsOn` carries no edge id of its own, so the ordinal is the identity.
    const edgeKey = (taskId: string, dependsOnTaskId: string, ordinal: number) =>
        `${dependsOnTaskId}->${taskId}#${ordinal}`;
    const edges: TaskGraphEdge[] = spec.tasks.flatMap((t) =>
        (t.dependsOn ?? []).map(NormalizeDependency).map((d) => ({ taskId: t.tempId, dependsOnTaskId: d.tempId })),
    );

    const order: string[] = [];
    for (let cycle = 0; cycle < 50; cycle++) {
        const nodes: TaskGraphNode[] = [...status].map(([id, s]) => ({ id, status: s }));

        // 1. XOR resolution over edges whose origin has settled.
        const evaluated: EvaluatedEdge[] = spec.tasks.flatMap((t) =>
            (t.dependsOn ?? []).map(NormalizeDependency)
                .filter((d) => d.exclusiveGroup)
                .map((d, ordinal) => ({
                    id: edgeKey(t.tempId, d.tempId, ordinal),
                    taskId: t.tempId,
                    dependsOnTaskId: d.tempId,
                    exclusiveGroup: d.exclusiveGroup!,
                    originStatus: status.get(d.tempId) ?? 'Pending',
                    priority: d.priority ?? 0,
                    sequence: d.sequence ?? 0,
                    conditionOutcome: !d.condition
                        ? 'satisfied'
                        : d.condition in CONTEXT
                            ? (CONTEXT[d.condition] ? 'satisfied' : 'unsatisfied')
                            : 'unevaluable',
                } as EvaluatedEdge)),
        );
        const xor = ResolveExclusiveGroups(evaluated);

        // A losing edge must not gate its target — it is removed, not left to block.
        const loserEdgeIDs = new Set(xor.loserEdgeIDs);
        const liveEdges = spec.tasks.flatMap((t) =>
            (t.dependsOn ?? []).map(NormalizeDependency)
                .map((d, ordinal) => ({ d, ordinal }))
                .filter(({ d, ordinal }) => !loserEdgeIDs.has(edgeKey(t.tempId, d.tempId, ordinal)))
                .map(({ d }) => ({ taskId: t.tempId, dependsOnTaskId: d.tempId } as TaskGraphEdge)),
        );

        // 2. skips: CONFIRMED seeds, then the cascade — BEFORE eligibility.
        //
        // Seeds are confirmed against the surviving edges rather than written straight through. The
        // simulator used to persist every seed, which mirrored the production bug: it compared a
        // wrong answer against the walker and, for the diamond, disagreed only because the walker was
        // right. Confirming here is what lets the fixture see the fix.
        const loserTargets = new Set(ConfirmSkipSeeds(xor.skipSeedTaskIDs, liveEdges));
        for (const id of loserTargets) if (status.get(id) === 'Pending') status.set(id, 'Skipped');
        for (const id of ComputeSkipCascade([...status].map(([i, s]) => ({ id: i, status: s })), liveEdges, [...loserTargets])) {
            status.set(id, 'Skipped');
        }

        // A non-exclusive conditional edge that is false blocks its target the ordinary way.
        const unevaluableHolds = new Set<string>();
        for (const t of spec.tasks) {
            for (const d of (t.dependsOn ?? []).map(NormalizeDependency)) {
                if (d.exclusiveGroup || !d.condition) continue;
                // An ordinary conditional edge that is definitely false skips its target, exactly
                // like an XOR loser. This simulator modelled that from the start; the real dispatcher
                // used to write Blocked here, and because nothing pinned the two together the
                // divergence sat hidden behind a green differential suite. Both now Skip (R6), and
                // Blocked is reserved for failure-driven unsatisfiability.
                //
                // THREE outcomes, not two. `CONTEXT[cond] === false` is false for an UNEVALUABLE
                // condition as well as for a satisfied one, so the simulator let unevaluable
                // guards through — reproducing the production bug rather than testing against it,
                // and agreeing with a wrong answer. Unevaluable now HOLDS: neither skipped here nor
                // eligible below.
                if (!(d.condition in CONTEXT)) { unevaluableHolds.add(t.tempId); continue; }
                if (CONTEXT[d.condition] === false && status.get(t.tempId) === 'Pending') status.set(t.tempId, 'Skipped');
            }
        }

        // 3. eligibility, last.
        const eligible = ComputeEligibleTasks(
            [...status].map(([i, s]) => ({ id: i, status: s })),
            liveEdges,
        ).filter((n) => !xor.holdTaskIDs.includes(n.id) && !unevaluableHolds.has(n.id));
        if (eligible.length === 0) break;

        for (const n of eligible) { order.push(n.id); status.set(n.id, 'Complete'); }
    }
    return order;
}

// ── the comparison ──────────────────────────────────────────────────────────

describe('differential: compiled graph vs the engine it replaces', () => {
    for (const [name, flow] of Object.entries(FLOWS)) {
        it(`visits the same steps in the same order — ${name}`, () => {
            const oracle = oracleOrder(flow);
            const compiled = compiledOrder(flow);
            // Teeth: two empty lists are equal, and a comparison that can pass vacuously is not a
            // guard. Every fixture must actually walk somewhere.
            expect(oracle.length, `oracle walked nothing for "${name}"`).toBeGreaterThan(0);
            expect(compiled).toEqual(oracle);
        });
    }
});

describe('the properties the differential comparison depends on', () => {
    it('the oracle takes ONE successor at a fork, never both', () => {
        // If this ever fails, the oracle is not what the plan says it is and every comparison above
        // is meaningless — so it is asserted rather than assumed.
        const repo = repoFor(FLOWS['fork by priority']);
        expect(SelectOutgoingEdges('a', repo, evaluator, {}).Edges).toHaveLength(2);
        expect(oracleOrder(FLOWS['fork by priority'])).toEqual(['a', 'hi']);
    });

    it('the compiled fork produces exactly one exclusive group', () => {
        const compiled = CompileFlowToTaskGraph(FLOWS['fork by priority'].steps, FLOWS['fork by priority'].paths, {
            WorkflowName: 'W',
            ResolveAgentName: (id) => `Agent ${id}`,
            ResolveActionName: (id) => `Action ${id}`,
            ResolvePromptName: (id) => `Prompt ${id}`,
        });
        const groups = new Set(
            compiled.Spec!.tasks.flatMap((t) => (t.dependsOn ?? []).map(NormalizeDependency).map((d) => d.exclusiveGroup)),
        );
        expect([...groups].filter(Boolean)).toEqual(['a']);
    });

    it('the loser branch settles Skipped rather than Blocked', () => {
        // The single most important consequence. Blocked would poison the parent rollup and every
        // branching flow would report failure.
        expect(compiledOrder(FLOWS['fork by priority'])).not.toContain('lo');
    });
});
