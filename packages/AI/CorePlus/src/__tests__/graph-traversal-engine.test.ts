/**
 * Tests for the shared graph-traversal engine.
 *
 * Two jobs here. The first is **parity**: the behavior `FlowAgentType` had — priority ordering,
 * unconditional edges, inactive-destination fallback, failure-as-an-edge — has to survive the
 * extraction unchanged, because design-time flows in the field depend on it.
 *
 * The second is **pinning the deliberate divergences**. Four behaviors changed, each because the
 * original was wrong rather than merely different, and each is asserted here so a future "restore
 * parity" refactor has to argue with a named test instead of quietly undoing the fix:
 *
 *   1. fan-out returns every satisfied edge, not just the highest-priority one;
 *   2. a missing destination is a rejection like an inactive one, not a fatal error;
 *   3. a condition that throws is distinguishable from one that evaluated false;
 *   4. results are addressed by node id, not by the tail of the execution path.
 */
import { describe, it, expect } from 'vitest';
import {
    SelectOutgoingEdges,
    IsJoinSatisfied,
    AdvanceFrontier,
    CreateTraversalState,
    MarkNodeStarted,
    MarkNodeCompleted,
    GetNodeResult,
    IsTraversalSettled,
    type GraphEdge,
    type GraphNode,
    type IConditionEvaluator,
    type IGraphRepository,
} from '../task-graph/graph-traversal-engine';

/** Plain-object repository — possible only because the seam is synchronous. */
function repoOf(nodes: GraphNode[], edges: GraphEdge[]): IGraphRepository {
    return {
        GetNode: (id) => nodes.find((n) => n.id === id) ?? null,
        GetOutgoingEdges: (id) => edges.filter((e) => e.originNodeId === id),
        GetIncomingEdges: (id) => edges.filter((e) => e.destinationNodeId === id),
        GetStartNodes: () => nodes.filter((n) => n.isStartNode),
    };
}

/** Evaluates `ctx.<key>` truthiness; the literal `BOOM` throws, standing in for a broken expression. */
const evaluator: IConditionEvaluator = {
    Evaluate: (expression, context) => {
        if (expression === 'BOOM') return { Success: false, ErrorMessage: 'unexpected token' };
        return { Success: true, Value: Boolean(context[expression]) };
    },
};

const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, name: id, status: 'Active', ...over });
const edge = (id: string, from: string, to: string, over: Partial<GraphEdge> = {}): GraphEdge =>
    ({ id, originNodeId: from, destinationNodeId: to, priority: 0, ...over });

describe('SelectOutgoingEdges', () => {
    it('returns unconditional edges', () => {
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b')]);
        const sel = SelectOutgoingEdges('a', repo, evaluator, {});
        expect(sel.Edges.map((e) => e.id)).toEqual(['e1']);
        expect(sel.Rejected).toHaveLength(0);
    });

    it('orders by priority descending — parity with the original', () => {
        const repo = repoOf(
            [node('a'), node('b'), node('c')],
            [edge('lo', 'a', 'b', { priority: 1 }), edge('hi', 'a', 'c', { priority: 9 })],
        );
        expect(SelectOutgoingEdges('a', repo, evaluator, {}).Edges.map((e) => e.id)).toEqual(['hi', 'lo']);
    });

    it('breaks priority ties by edge id, so ordering never depends on array order', () => {
        // The original inherited whatever order the cache happened to hold, which made a tie
        // resolve differently between processes for no reason the author could see.
        const repo = repoOf([node('a'), node('b'), node('c')], [edge('zzz', 'a', 'b'), edge('aaa', 'a', 'c')]);
        expect(SelectOutgoingEdges('a', repo, evaluator, {}).Edges.map((e) => e.id)).toEqual(['aaa', 'zzz']);
    });

    it('drops an edge whose condition is false, and says so', () => {
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b', { condition: 'go' })]);
        const sel = SelectOutgoingEdges('a', repo, evaluator, { go: false });
        expect(sel.Edges).toHaveLength(0);
        expect(sel.Rejected[0]).toMatchObject({ EdgeId: 'e1', Reason: 'ConditionFalse' });
    });

    it('keeps an edge whose condition is true', () => {
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b', { condition: 'go' })]);
        expect(SelectOutgoingEdges('a', repo, evaluator, { go: true }).Edges).toHaveLength(1);
    });

    it('treats a whitespace-only condition as unconditional', () => {
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b', { condition: '   ' })]);
        expect(SelectOutgoingEdges('a', repo, evaluator, {}).Edges).toHaveLength(1);
    });

    // ── divergence 3 ────────────────────────────────────────────────────────
    it('distinguishes a BROKEN condition from a false one', () => {
        // The original logged both and dropped both, so "your expression is malformed" and "your
        // expression said no" were indistinguishable at the call site — and a graph that stalled
        // because of a typo looked exactly like one that completed normally.
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b', { condition: 'BOOM' })]);
        const sel = SelectOutgoingEdges('a', repo, evaluator, {});
        expect(sel.Edges).toHaveLength(0);
        expect(sel.Rejected[0]).toMatchObject({ Reason: 'ConditionError', Detail: 'unexpected token' });
    });

    it('never treats a broken condition as true', () => {
        // The failure mode that must not exist: a malformed expression opening a gate.
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b', { condition: 'BOOM' })]);
        expect(SelectOutgoingEdges('a', repo, evaluator, {}).Edges).toHaveLength(0);
    });

    it('rejects an edge into an inactive node — parity with the original fallback', () => {
        const repo = repoOf(
            [node('a'), node('disabled', { status: 'Disabled' }), node('c')],
            [edge('hi', 'a', 'disabled', { priority: 9 }), edge('lo', 'a', 'c', { priority: 1 })],
        );
        const sel = SelectOutgoingEdges('a', repo, evaluator, {});
        expect(sel.Edges.map((e) => e.id)).toEqual(['lo']);
        expect(sel.Rejected[0]).toMatchObject({ Reason: 'DestinationInactive', Detail: 'Disabled' });
    });

    // ── divergence 2 ────────────────────────────────────────────────────────
    it('treats a MISSING destination as a rejection, not a fatal error', () => {
        // The original failed the whole graph on a dangling edge while merely stepping around a
        // deliberately-disabled one. A data problem should not be more fatal than an intentional
        // configuration choice, so both now fall through to the next alternate.
        const repo = repoOf(
            [node('a'), node('c')],
            [edge('hi', 'a', 'ghost', { priority: 9 }), edge('lo', 'a', 'c', { priority: 1 })],
        );
        const sel = SelectOutgoingEdges('a', repo, evaluator, {});
        expect(sel.Edges.map((e) => e.id)).toEqual(['lo']);
        expect(sel.Rejected[0]).toMatchObject({ Reason: 'DestinationMissing' });
    });

    it('reports every rejection, so a dead end can always be explained', () => {
        const repo = repoOf(
            [node('a'), node('off', { status: 'Disabled' })],
            [edge('e1', 'a', 'off'), edge('e2', 'a', 'ghost'), edge('e3', 'a', 'off', { condition: 'no' })],
        );
        const sel = SelectOutgoingEdges('a', repo, evaluator, { no: false });
        expect(sel.Edges).toHaveLength(0);
        expect(sel.Rejected.map((r) => r.Reason).sort()).toEqual(
            ['ConditionFalse', 'DestinationInactive', 'DestinationMissing'],
        );
    });
});

describe('IsJoinSatisfied', () => {
    it('is always satisfied for a node with no predecessors', () => {
        const repo = repoOf([node('a')], []);
        expect(IsJoinSatisfied('a', repo, CreateTraversalState())).toBe(true);
    });

    it("AND-join waits for ALL predecessors", () => {
        const repo = repoOf([node('a'), node('b'), node('j')], [edge('e1', 'a', 'j'), edge('e2', 'b', 'j')]);
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', {});
        expect(IsJoinSatisfied('j', repo, state, 'all')).toBe(false);
        MarkNodeCompleted(state, 'b', {});
        expect(IsJoinSatisfied('j', repo, state, 'all')).toBe(true);
    });

    it('OR-join needs only one', () => {
        const repo = repoOf([node('a'), node('b'), node('j')], [edge('e1', 'a', 'j'), edge('e2', 'b', 'j')]);
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', {});
        expect(IsJoinSatisfied('j', repo, state, 'any')).toBe(true);
    });

    it('counts a FAILED predecessor as settled, so failure routing is reachable', () => {
        // A join that only accepted successes could never be the target of a recovery edge.
        const repo = repoOf([node('a'), node('b'), node('j')], [edge('e1', 'a', 'j'), edge('e2', 'b', 'j')]);
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', {}, true);
        MarkNodeCompleted(state, 'b', { err: 'x' }, false);
        expect(IsJoinSatisfied('j', repo, state, 'all')).toBe(true);
    });

    it('does not wait forever on a predecessor that can never run', () => {
        // Without this an AND-join behind an untaken branch deadlocks: the graph is neither
        // finished nor able to progress, which is precisely the stall state the durable executor
        // has to detect and report. Cheaper not to create it.
        const repo = repoOf([node('a'), node('skipped'), node('j')], [edge('e1', 'a', 'j'), edge('e2', 'skipped', 'j')]);
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', {});
        expect(IsJoinSatisfied('j', repo, state, 'all')).toBe(false);
        expect(IsJoinSatisfied('j', repo, state, 'all', new Set(['skipped']))).toBe(true);
    });

    it('dedupes parallel edges from the same predecessor', () => {
        const repo = repoOf([node('a'), node('j')], [edge('e1', 'a', 'j'), edge('e2', 'a', 'j')]);
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', {});
        expect(IsJoinSatisfied('j', repo, state, 'all')).toBe(true);
    });
});

describe('AdvanceFrontier', () => {
    const diamond = () => repoOf(
        [node('a'), node('b'), node('c'), node('d')],
        [edge('ab', 'a', 'b'), edge('ac', 'a', 'c'), edge('bd', 'b', 'd'), edge('cd', 'c', 'd')],
    );

    it('sequential follows exactly one successor — parity with the single program counter', () => {
        const state = CreateTraversalState();
        const { NextNodeIds } = AdvanceFrontier('a', diamond(), evaluator, state, {}, 'sequential');
        expect(NextNodeIds).toHaveLength(1);
    });

    it('sequential picks the highest-priority successor', () => {
        const repo = repoOf(
            [node('a'), node('lo'), node('hi')],
            [edge('e1', 'a', 'lo', { priority: 1 }), edge('e2', 'a', 'hi', { priority: 5 })],
        );
        const { NextNodeIds } = AdvanceFrontier('a', repo, evaluator, CreateTraversalState(), {}, 'sequential');
        expect(NextNodeIds).toEqual(['hi']);
    });

    // ── divergence 1 ────────────────────────────────────────────────────────
    it('parallel follows EVERY satisfied successor', () => {
        // The original fetched the full edge list and then indexed [0], so a genuine fan-out ran
        // one branch and dropped the rest with no diagnostic at all. An agent that expressed
        // independent work as independent nodes meant them to run at once.
        const { NextNodeIds } = AdvanceFrontier('a', diamond(), evaluator, CreateTraversalState(), {}, 'parallel');
        expect(NextNodeIds.sort()).toEqual(['b', 'c']);
    });

    it('parallel still respects an AND-join at the fan-in', () => {
        const repo = diamond();
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', {});

        // b finishes first — d must NOT start, because c is still outstanding.
        MarkNodeCompleted(state, 'b', {});
        expect(AdvanceFrontier('b', repo, evaluator, state, {}, 'parallel').NextNodeIds).toEqual([]);

        // c finishes — now d is eligible.
        MarkNodeCompleted(state, 'c', {});
        expect(AdvanceFrontier('c', repo, evaluator, state, {}, 'parallel').NextNodeIds).toEqual(['d']);
    });

    it('starts a node once even when several edges reach it', () => {
        const repo = repoOf([node('a'), node('t')], [edge('e1', 'a', 't'), edge('e2', 'a', 't')]);
        const { NextNodeIds } = AdvanceFrontier('a', repo, evaluator, CreateTraversalState(), {}, 'parallel');
        expect(NextNodeIds).toEqual(['t']);
    });

    it('routes on failure, because a failed node still traverses its edges', () => {
        const repo = repoOf(
            [node('a'), node('ok'), node('recover')],
            [edge('happy', 'a', 'ok', { condition: 'succeeded', priority: 5 }),
             edge('sad', 'a', 'recover', { condition: 'failed', priority: 1 })],
        );
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'a', { err: 'boom' }, false);
        const { NextNodeIds } = AdvanceFrontier('a', repo, evaluator, state, { succeeded: false, failed: true });
        expect(NextNodeIds).toEqual(['recover']);
    });

    it('returns no successors at a terminal node', () => {
        const repo = repoOf([node('a')], []);
        const { NextNodeIds } = AdvanceFrontier('a', repo, evaluator, CreateTraversalState(), {});
        expect(NextNodeIds).toEqual([]);
    });

    it('surfaces the rejections alongside the successors', () => {
        const repo = repoOf([node('a'), node('b')], [edge('e1', 'a', 'b', { condition: 'no' })]);
        const { NextNodeIds, Selection } = AdvanceFrontier('a', repo, evaluator, CreateTraversalState(), { no: false });
        expect(NextNodeIds).toEqual([]);
        expect(Selection.Rejected).toHaveLength(1);
    });
});

describe('TraversalState', () => {
    // ── divergence 4 ────────────────────────────────────────────────────────
    it('addresses results by node id, not by the tail of the path', () => {
        // The original read executionPath[length-1] and called it "the last step result". Because
        // the path was deduped on push, a revisited node did not move to the tail — so the value a
        // condition saw could belong to an entirely different node.
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'first', { v: 1 });
        MarkNodeCompleted(state, 'second', { v: 2 });
        expect(GetNodeResult(state, 'first')).toEqual({ v: 1 });
        expect(GetNodeResult(state, 'second')).toEqual({ v: 2 });
    });

    it('records revisits in the execution path', () => {
        // Deduping made a cycle indistinguishable from a straight line in the audit trail.
        const state = CreateTraversalState();
        MarkNodeStarted(state, 'a');
        MarkNodeStarted(state, 'b');
        MarkNodeStarted(state, 'a');
        expect(state.ExecutionPath).toEqual(['a', 'b', 'a']);
    });

    it('tracks the frontier as a set, so several nodes can be active at once', () => {
        const state = CreateTraversalState();
        MarkNodeStarted(state, 'a');
        MarkNodeStarted(state, 'b');
        expect(state.ActiveNodeIds.size).toBe(2);
        expect(IsTraversalSettled(state)).toBe(false);

        MarkNodeCompleted(state, 'a', {});
        expect(IsTraversalSettled(state)).toBe(false);
        MarkNodeCompleted(state, 'b', {});
        expect(IsTraversalSettled(state)).toBe(true);
    });

    it('separates failure from completion', () => {
        const state = CreateTraversalState();
        MarkNodeCompleted(state, 'ok', {}, true);
        MarkNodeCompleted(state, 'bad', {}, false);
        expect(state.CompletedNodeIds.has('bad')).toBe(true);
        expect(state.FailedNodeIds.has('bad')).toBe(true);
        expect(state.FailedNodeIds.has('ok')).toBe(false);
    });
});
