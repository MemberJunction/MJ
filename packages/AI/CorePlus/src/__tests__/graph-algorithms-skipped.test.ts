/**
 * The `Skipped` outcome and exclusive fan-outs (Track C1.1, plan §5.2/§5.3).
 *
 * These are pure graph facts, so they are decidable without a database, a dispatcher or a model —
 * which is the whole reason the semantics live in this layer. The differential suite that guards the
 * cutover is built on these functions, so a bug here would be invisible to it: it would compare a
 * wrong answer against itself and agree.
 */
import { describe, it, expect } from 'vitest';
import {
    ComputeEligibleTasks,
    ComputeParentRollup,
    ComputeSkipCascade,
    ComputeTasksToBlock,
    ResolveExclusiveGroups,
    type EvaluatedEdge,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphNodeStatus,
} from '../task-graph/graph-algorithms';

const n = (id: string, status: TaskGraphNodeStatus = 'Pending'): TaskGraphNode => ({ id, status });
const e = (taskId: string, dependsOnTaskId: string, dependencyType?: TaskGraphEdge['dependencyType']): TaskGraphEdge =>
    ({ taskId, dependsOnTaskId, dependencyType });

const xedge = (over: Partial<EvaluatedEdge> & Pick<EvaluatedEdge, 'id' | 'taskId'>): EvaluatedEdge => ({
    dependsOnTaskId: 'origin',
    exclusiveGroup: 'g',
    originStatus: 'Complete',
    priority: 0,
    sequence: 0,
    conditionOutcome: 'satisfied',
    ...over,
});

describe('Skipped satisfies dependents', () => {
    it('lets a join run when one of its predecessors was skipped', () => {
        // The reconvergence case: a fork ran branch B, skipped C, and the join must still run.
        // If Skipped did not satisfy, every branching flow would hang at its first join.
        const nodes = [n('a', 'Complete'), n('b', 'Complete'), n('c', 'Skipped'), n('join')];
        const eligible = ComputeEligibleTasks(nodes, [e('join', 'b'), e('join', 'c')]);
        expect(eligible.map((x) => x.id)).toEqual(['join']);
    });

    it('does NOT make a skipped predecessor block its dependents', () => {
        // Skipped is deliberately absent from UNSATISFIABLE_STATUSES. If it were present, the loser
        // branch would cascade Blocked and poison the parent rollup — the exact outcome this status
        // was introduced to avoid.
        const nodes = [n('loser', 'Skipped'), n('after')];
        expect(ComputeTasksToBlock(nodes, [e('after', 'loser')])).toEqual([]);
    });
});

describe('ComputeSkipCascade', () => {
    it('skips the whole tail of a losing branch', () => {
        const nodes = [n('x'), n('y'), n('z')];
        const edges = [e('y', 'x'), e('z', 'y')];
        expect(ComputeSkipCascade(nodes, edges, ['x']).sort()).toEqual(['y', 'z']);
    });

    it('spares a join that the WINNING branch still reaches', () => {
        // The single most important case. `join` depends on both branches; only one was skipped, so
        // it must survive. A naive forward walk from the loser would take it out.
        const nodes = [n('lose'), n('win', 'Complete'), n('join')];
        const edges = [e('join', 'lose'), e('join', 'win')];
        expect(ComputeSkipCascade(nodes, edges, ['lose'])).toEqual([]);
    });

    it('reaches a fixpoint rather than stopping after one pass', () => {
        // `far` is only decidable AFTER `near` is known to be skipped. A single forward pass in edge
        // order can visit far too early and let a doomed branch run.
        const nodes = [n('near'), n('far')];
        const edges = [e('far', 'near'), e('near', 'seed')];
        expect(ComputeSkipCascade([...nodes, n('seed')], edges, ['seed']).sort()).toEqual(['far', 'near']);
    });

    it('never skips an entry point', () => {
        expect(ComputeSkipCascade([n('entry')], [], [])).toEqual([]);
    });

    it('ignores Optional edges — an edge that does not gate cannot doom', () => {
        const nodes = [n('t')];
        expect(ComputeSkipCascade([...nodes, n('o', 'Skipped')], [e('t', 'o', 'Optional')], [])).toEqual([]);
    });

    it('leaves work that already started alone', () => {
        const nodes = [n('running', 'In Progress')];
        expect(ComputeSkipCascade([...nodes, n('s', 'Skipped')], [e('running', 's')], [])).toEqual([]);
    });
});

describe('ResolveExclusiveGroups', () => {
    it('keeps the highest-priority satisfied edge and loses the rest', () => {
        const res = ResolveExclusiveGroups([
            xedge({ id: 'lo', taskId: 'B', priority: 1 }),
            xedge({ id: 'hi', taskId: 'C', priority: 5 }),
        ]);
        expect(res.keptEdgeIDs).toEqual(['hi']);
        expect(res.loserEdgeIDs).toEqual(['lo']);
        expect(res.skipSeedTaskIDs).toEqual(['B']);
    });

    it('breaks a priority tie by ascending sequence', () => {
        // Compiled edges get fresh UUIDs, and Priority defaults to 0 — so without sequence the tie
        // would resolve differently than the engine being replaced. This pins the oracle's tiebreak.
        const res = ResolveExclusiveGroups([
            xedge({ id: 'second', taskId: 'B', sequence: 1 }),
            xedge({ id: 'first', taskId: 'C', sequence: 0 }),
        ]);
        expect(res.keptEdgeIDs).toEqual(['first']);
    });

    it('loses EVERY edge when none is satisfied — the walk just ends here', () => {
        const res = ResolveExclusiveGroups([
            xedge({ id: 'a', taskId: 'B', conditionOutcome: 'unsatisfied' }),
            xedge({ id: 'b', taskId: 'C', conditionOutcome: 'unsatisfied' }),
        ]);
        expect(res.keptEdgeIDs).toEqual([]);
        expect(res.skipSeedTaskIDs.sort()).toEqual(['B', 'C']);
        expect(res.holdTaskIDs).toEqual([]);
    });

    it('HOLDS the entire group when any condition is unevaluable', () => {
        // The rule that makes "a broken condition stalls visibly" true. Without it the kept edges of
        // a Complete origin are satisfied prerequisites and EVERY branch fires at once — a typo
        // silently multiplying a fork.
        const res = ResolveExclusiveGroups([
            xedge({ id: 'ok', taskId: 'B', conditionOutcome: 'satisfied' }),
            xedge({ id: 'broken', taskId: 'C', conditionOutcome: 'unevaluable' }),
        ]);
        expect(res.keptEdgeIDs).toEqual([]);
        expect(res.loserEdgeIDs).toEqual([]);
        expect(res.skipSeedTaskIDs).toEqual([]);
        expect(res.holdTaskIDs.sort()).toEqual(['B', 'C']);
    });

    it('does not decide a group whose origin has not finished', () => {
        const res = ResolveExclusiveGroups([xedge({ id: 'a', taskId: 'B', originStatus: 'In Progress' })]);
        expect(res).toEqual({ keptEdgeIDs: [], loserEdgeIDs: [], skipSeedTaskIDs: [], holdTaskIDs: [] });
    });

    it('decides on a Failed origin ONLY under edge failure semantics', () => {
        const edges = [xedge({ id: 'recover', taskId: 'B', originStatus: 'Failed' })];
        expect(ResolveExclusiveGroups(edges).keptEdgeIDs).toEqual([]);
        expect(
            ResolveExclusiveGroups(edges, new Set<TaskGraphNodeStatus>(['Complete', 'Failed'])).keptEdgeIDs,
        ).toEqual(['recover']);
    });

    it('resolves each group independently', () => {
        const res = ResolveExclusiveGroups([
            xedge({ id: 'g1a', taskId: 'B', exclusiveGroup: 'one', priority: 1 }),
            xedge({ id: 'g1b', taskId: 'C', exclusiveGroup: 'one', priority: 0 }),
            xedge({ id: 'g2a', taskId: 'D', exclusiveGroup: 'two', priority: 0 }),
        ]);
        expect(res.keptEdgeIDs.sort()).toEqual(['g1a', 'g2a']);
    });
});

describe('ComputeParentRollup with Skipped', () => {
    it('settles Complete when the only non-complete children were skipped', () => {
        // Without this a sequential flow containing ONE fork would settle Blocked every time.
        const roll = ComputeParentRollup([n('a', 'Complete'), n('b', 'Skipped')]);
        expect(roll.status).toBe('Complete');
        expect(roll.isTerminal).toBe(true);
    });

    it('counts a skipped child as done, so a branching flow can reach 100%', () => {
        expect(ComputeParentRollup([n('a', 'Complete'), n('b', 'Skipped')]).percentComplete).toBe(100);
    });

    it('still fails on a genuine failure alongside a skip', () => {
        expect(ComputeParentRollup([n('a', 'Failed'), n('b', 'Skipped')]).status).toBe('Failed');
    });

    it('settles Complete when a failure was HANDLED by a recovery path', () => {
        // failureSemantics: 'edges'. A flow that failed a step, recovered, and reached the end is a
        // success — which is what the flow engine reports today.
        const roll = ComputeParentRollup([n('a', 'Failed'), n('b', 'Complete')], new Set(['a']));
        expect(roll.status).toBe('Complete');
    });

    it('still fails when the failure was NOT handled', () => {
        expect(ComputeParentRollup([n('a', 'Failed'), n('b', 'Complete')]).status).toBe('Failed');
    });
});

describe('handled failures do not block dependents', () => {
    it('blocks dependents of an unhandled failure', () => {
        expect(ComputeTasksToBlock([n('f', 'Failed'), n('d')], [e('d', 'f')])).toEqual(['d']);
    });

    it('leaves dependents alone when the failure had a recovery path', () => {
        expect(ComputeTasksToBlock([n('f', 'Failed'), n('d')], [e('d', 'f')], new Set(['f']))).toEqual([]);
    });
});

describe('a handled failure releases its recovery path', () => {
    it('makes the recovery target eligible when the failure is handled', () => {
        // Under failureSemantics 'edges', a Failed origin with a satisfied outgoing edge is a
        // HANDLED failure: the author drew a way out and it is live. Its target was previously
        // neither Blocked (handled failures are excluded from blocking) nor Skipped nor eligible —
        // so the graph sat In Progress forever. Before the recovery machinery existed it at least
        // settled Failed; turning a wrong answer into NO answer is worse.
        const nodes = [n('risky', 'Failed'), n('recover')];
        const edges = [e('recover', 'risky')];

        expect(ComputeEligibleTasks(nodes, edges)).toHaveLength(0);
        expect(ComputeEligibleTasks(nodes, edges, new Set(['risky'])).map((x) => x.id)).toEqual(['recover']);
    });

    it('leaves an UNhandled failure blocking, which is the whole point of the distinction', () => {
        // Nobody drew a recovery route here, so the failure is terminal for its dependents. If this
        // released too, a graph would sail past every failure it never anticipated.
        const nodes = [n('risky', 'Failed'), n('after')];
        const edges = [e('after', 'risky')];

        expect(ComputeEligibleTasks(nodes, edges, new Set(['someone-else']))).toHaveLength(0);
    });

    it('still requires the OTHER prerequisites to be satisfied', () => {
        // A handled failure satisfies its own edge, not the node's other edges.
        const nodes = [n('risky', 'Failed'), n('slow', 'Pending'), n('recover')];
        const edges = [e('recover', 'risky'), e('recover', 'slow')];

        // `slow` is itself eligible — it has no prerequisites. The assertion is about `recover`.
        const eligible = ComputeEligibleTasks(nodes, edges, new Set(['risky'])).map((x) => x.id);
        expect(eligible).not.toContain('recover');
    });
});
