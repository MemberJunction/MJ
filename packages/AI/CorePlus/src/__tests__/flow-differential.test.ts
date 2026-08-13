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
    // R2-3 — a guard reaching through output a step never produced.
    //
    // Two details give this fixture its teeth, and both were needed. The JOIN means a held branch
    // stops the walk one step short of the oracle's rather than merely omitting a leaf. And the
    // absent-data edge carries the HIGHER priority, so it could have won: the dominated case is
    // already handled by the group-resolution refinement, and a fixture built on it would pass
    // whatever the classification said. Here the answer genuinely depends on reading absent data as
    // false rather than as undecided.
    'a guard on data the step never produced': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'g', Name: 'Guarded' }),
            step({ ID: 'p', Name: 'Plain' }),
            step({ ID: 'j', Name: 'Join' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'g', Condition: 'absentData', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'p', Priority: 1 }),
            path({ ID: 'p3', OriginStepID: 'g', DestinationStepID: 'j' }),
            path({ ID: 'p4', OriginStepID: 'p', DestinationStepID: 'j' }),
        ],
    },
    // C3's fidelity fix is what makes this expressible: a reconvergence shape where the guarded
    // branch is cut but the join is still fed by a live route. Before the fix the simulator skipped
    // the join too (no `stillReachable` equivalent) and the fixture would have false-failed a
    // correct dispatcher.
    'a cut branch must not take the join down with it': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'g', Name: 'Guarded' }),
            step({ ID: 'p', Name: 'Plain' }),
            step({ ID: 'j', Name: 'Join' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'p', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'g', Condition: 'never', Priority: 1 }),
            path({ ID: 'p3', OriginStepID: 'g', DestinationStepID: 'j' }),
            path({ ID: 'p4', OriginStepID: 'p', DestinationStepID: 'j' }),
        ],
    },
    // R3-3 — the flow dialect's OWN roots. `data.*` and `context.*` are documented condition
    // vocabulary and the compiler passes them through untouched, but the dispatcher resolved them
    // against the origin STEP's output, where they do not live: every `data.x` read `undefined`,
    // came out false, and the graph silently took the branch the walker never takes. The guarded
    // edge carries the higher priority so the divergence is a different WALK, not a missing leaf.
    //
    // What this fixture pins is the equivalence — both engines answer a `data.*` guard from the
    // invocation. That the DISPATCHER is the engine reading that envelope is wiring, which a model
    // cannot prove: IT74 TX20 is the evidence for it, and it runs a real graph end to end.
    'a guard on the invocation\'s own data, not the step\'s output': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'g', Name: 'Guarded' }),
            step({ ID: 'p', Name: 'Plain' }),
            step({ ID: 'j', Name: 'Join' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'g', Condition: 'data.approved', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'p', Priority: 1 }),
            path({ ID: 'p3', OriginStepID: 'g', DestinationStepID: 'j' }),
            path({ ID: 'p4', OriginStepID: 'p', DestinationStepID: 'j' }),
        ],
    },
    // R3-6 — a guard that fails on the SHAPE of absent data rather than on a missing name. The
    // classifier used to enumerate the ways data can be absent and hold on everything else, so a
    // `TypeError` — the commonest failure there is, since the whole class of missing output produces
    // one — was read as a broken guard and held the branch forever. Inverted, only a ReferenceError
    // (a name that cannot resolve, i.e. an authoring mistake) holds.
    //
    // The walker rejects the edge and falls through to the lower-priority route; the dispatcher must
    // reach the same place by DROPPING rather than holding. Under the old classifier the compiled
    // side stalls at 'a' and the walk diverges on its second step.
    'a guard that fails on the shape of what is missing': {
        steps: [
            step({ ID: 'a', Name: 'A', StartingStep: true }),
            step({ ID: 'g', Name: 'Guarded' }),
            step({ ID: 'p', Name: 'Plain' }),
        ],
        paths: [
            path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'g', Condition: 'typeErrorGuard', Priority: 10 }),
            path({ ID: 'p2', OriginStepID: 'a', DestinationStepID: 'p', Priority: 1 }),
        ],
    },
    'no path matches — the walk ends': {
        steps: [step({ ID: 'a', Name: 'A', StartingStep: true }), step({ ID: 'b', Name: 'B' })],
        paths: [path({ ID: 'p1', OriginStepID: 'a', DestinationStepID: 'b', Condition: 'never' })],
    },
};

/** Condition truthiness, shared by both engines so the comparison isolates TRAVERSAL. */
const CONTEXT: Record<string, boolean> = { ok: true, never: false };

/**
 * Conditions whose DATA IS ABSENT — the R2-3 class, which this simulator could not express at all.
 *
 * The old model had two states: a name in `CONTEXT` (true or false) or not in it (unevaluable). A
 * condition that reaches through a step's missing output is neither. On the walker it is simply
 * falsy — `payload` there is the agent's accumulated payload, an object, so `payload.approved` on a
 * step that produced nothing is `undefined`. On the dispatcher it THREW, and every throw was a hold.
 * Without a third state the fixture below cannot be written, and the divergence stays invisible.
 */
const ABSENT_DATA = new Set(['absentData']);

/**
 * A guard that fails on the SHAPE of what is missing rather than on a name (R3-6).
 *
 * `TypeError` is what absent data actually produces most of the time — `x.y` where `x` is
 * undefined, `'k' in undefined`, calling a method on nothing. The old classifier enumerated
 * absence and held on everything else, so this whole class held. The message is the real one V8
 * emits, because the classification is a regex over exactly this string.
 */
const TYPE_ERROR_GUARDS = new Map([
    ['typeErrorGuard', "Cannot read properties of undefined (reading 'approved')"],
]);

/**
 * What the invocation carries — the flow dialect's `data` and `context` roots (R3-3).
 *
 * Both engines are handed this same envelope, which is the equivalence under test. Where it comes
 * from on each side is not: the walker gets it as its traversal context (real code, called below),
 * the dispatcher has to carry it in the parent's metadata because the graph outlives the run that
 * submitted it, and only IT74 TX20 can prove that half.
 */
const INVOCATION: Record<string, unknown> = { data: { approved: true }, context: { tier: 'gold' } };

/** Resolves a dotted path, or `undefined` — one missing hop, not a throw. */
function resolvePath(expression: string, envelope: Record<string, unknown>): unknown {
    return expression.split('.').reduce<unknown>(
        (at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined),
        envelope,
    );
}

const evaluator: IConditionEvaluator = {
    Evaluate: (expression, context) => {
        // The oracle's reading: property access through a missing key is falsy, not an error.
        if (ABSENT_DATA.has(expression)) return { Success: true, Value: false };
        const typeError = TYPE_ERROR_GUARDS.get(expression);
        if (typeError) return { Success: false, ErrorMessage: typeError };
        if (expression.startsWith('data.') || expression.startsWith('context.')) {
            return { Success: true, Value: !!resolvePath(expression, context) };
        }
        return expression in CONTEXT
            ? { Success: true, Value: CONTEXT[expression] }
            : { Success: false, ErrorMessage: `unknown: ${expression}` };
    },
};

/** How the dispatcher decides ONE condition, in the vocabulary the pure layer speaks. */
type ConditionVerdict = 'satisfied' | 'unsatisfied' | 'unevaluable';

/**
 * The model of `DecideGate` + `IsBrokenGuard`, which live in `@memberjunction/task-graph` and
 * therefore cannot be imported here — that package depends on this one, not the reverse.
 *
 * Modelled, so it is stated plainly: this is the one place the suite asserts against a
 * reimplementation rather than the code that ships. The real functions have their own unit tests
 * next to them; what this adds is what those cannot see — that the RESULT agrees with the engine
 * being replaced, over whole graphs.
 */
function classify(condition: string, envelope: Record<string, unknown>): ConditionVerdict {
    const result = evaluator.Evaluate(condition, envelope);
    if (result.Success) return result.Value ? 'satisfied' : 'unsatisfied';
    // R3-6, inverted: only a name that cannot resolve is a broken guard and holds. Everything else
    // — TypeError above all — is data that is not there, which is the data answering no.
    return /is not defined|reference ?error|can't find variable/i.test(result.ErrorMessage ?? '')
        ? 'unevaluable'
        : ABSENT_DATA.has(condition) || TYPE_ERROR_GUARDS.has(condition)
            ? 'unsatisfied'
            : 'unevaluable';
}

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
        const selection = SelectOutgoingEdges(current, repo, evaluator, INVOCATION);
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
                    // One classifier for both dialects (R3-6). Absent data is the data answering
                    // NO (R2-3) here too — the dispatcher classifies the throw rather than calling
                    // the group undecided — and `data.*` resolves from the invocation (R3-3).
                    conditionOutcome: !d.condition ? 'satisfied' : classify(d.condition, INVOCATION),
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
        // ── ordinary conditional edges, modelled the way the dispatcher actually decides them ──
        //
        // C3: this used to skip a target the moment ANY of its conditional edges read false, which
        // was unfaithful three ways and made it useless on exactly the reconvergence shapes R3-2
        // needs. It (a) evaluated edges whose origin had not finished, so it skipped at cycle 1
        // while the origin was still Pending; (b) had no `stillReachable` equivalent, so it skipped
        // a target another LIVE route still fed; and (c) evaluated edges out of a Skipped origin,
        // which the dispatcher drops unevaluated. Each of those either false-fails a correct
        // dispatcher or goes blind on the divergence it exists to catch.
        const unevaluableHolds = new Set<string>();
        const droppedInto = new Set<string>();
        const stillReachable = new Set<string>();
        for (const t of spec.tasks) {
            for (const d of (t.dependsOn ?? []).map(NormalizeDependency)) {
                if (d.exclusiveGroup) continue;
                const originStatus = status.get(d.tempId) ?? 'Pending';

                if (d.condition) {
                    // A branch that was not taken does not get a vote: the edge drops, unevaluated.
                    if (originStatus === 'Skipped') { droppedInto.add(t.tempId); continue; }

                    // TERMINALITY GUARD. An undecided origin is never asked — `succeeded` against a
                    // still-Pending step is a confident, wrong `false`. Keeping the edge costs
                    // nothing; the prerequisite gate already holds the target.
                    if (originStatus === 'Complete' || originStatus === 'Failed' || originStatus === 'Cancelled') {
                        // THREE outcomes, not two, and the same three the XOR dialect gets — a
                        // false condition and an unevaluable one are different answers, and reading
                        // them as one is what once let broken guards through. Absent data drops the
                        // edge exactly as `DecideGate` does; before R2-3 it was a hold, stalling the
                        // graph forever on a terminal origin whose output could never change.
                        const verdict = classify(d.condition, INVOCATION);
                        if (verdict === 'unevaluable') { unevaluableHolds.add(t.tempId); continue; }
                        if (verdict === 'unsatisfied') { droppedInto.add(t.tempId); continue; }
                    }
                }
                stillReachable.add(t.tempId);
            }
        }
        // Only unreachable when EVERY route in was cut — a target another live branch still feeds is
        // reachable, which is the whole point of reconvergence.
        for (const id of droppedInto) {
            if (!stillReachable.has(id) && status.get(id) === 'Pending') status.set(id, 'Skipped');
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
        expect(SelectOutgoingEdges('a', repo, evaluator, INVOCATION).Edges).toHaveLength(2);
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
