import { describe, it, expect } from 'vitest';
import {
    DetectCycle,
    FindUnknownDependencyRefs,
    ComputeEligibleTasks,
    ComputeTasksToBlock,
    ComputeParentRollup,
    IsGraphStalled,
    IsGraphSettled,
    type TaskGraphNode,
    type TaskGraphEdge,
    type TaskGraphNodeStatus,
} from '../task-graph/graph-algorithms';

const node = (id: string, status: TaskGraphNodeStatus = 'Pending'): TaskGraphNode => ({ id, status });
const edge = (taskId: string, dependsOnTaskId: string, dependencyType?: TaskGraphEdge['dependencyType']): TaskGraphEdge =>
    ({ taskId, dependsOnTaskId, dependencyType });

const ids = (nodes: TaskGraphNode[]) => nodes.map((n) => n.id).sort();

describe('DetectCycle', () => {
    it('reports no cycle for a linear chain', () => {
        const nodes = [node('a'), node('b'), node('c')];
        const edges = [edge('b', 'a'), edge('c', 'b')];
        expect(DetectCycle(nodes, edges)).toEqual({ hasCycle: false });
    });

    it('reports no cycle for a diamond', () => {
        // b and c both depend on a; d depends on both. Re-visiting `a` must not read as a cycle.
        const nodes = [node('a'), node('b'), node('c'), node('d')];
        const edges = [edge('b', 'a'), edge('c', 'a'), edge('d', 'b'), edge('d', 'c')];
        expect(DetectCycle(nodes, edges).hasCycle).toBe(false);
    });

    it('detects a direct two-node cycle', () => {
        const nodes = [node('a'), node('b')];
        const result = DetectCycle(nodes, [edge('a', 'b'), edge('b', 'a')]);
        expect(result.hasCycle).toBe(true);
        if (result.hasCycle) {
            // Path repeats its entry node to close the loop.
            expect(result.path[0]).toBe(result.path[result.path.length - 1]);
            expect(new Set(result.path)).toEqual(new Set(['a', 'b']));
        }
    });

    it('detects a longer cycle', () => {
        const nodes = [node('a'), node('b'), node('c')];
        const result = DetectCycle(nodes, [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);
        expect(result.hasCycle).toBe(true);
        if (result.hasCycle) expect(result.path.length).toBe(4);
    });

    it('detects a cycle that does not include the first-visited node', () => {
        // a is a clean root; the cycle lives downstream in b <-> c.
        const nodes = [node('a'), node('b'), node('c')];
        const result = DetectCycle(nodes, [edge('a', 'b'), edge('b', 'c'), edge('c', 'b')]);
        expect(result.hasCycle).toBe(true);
        if (result.hasCycle) expect(new Set(result.path)).toEqual(new Set(['b', 'c']));
    });

    it('detects a cycle among ids that appear only on edges', () => {
        expect(DetectCycle([], [edge('x', 'y'), edge('y', 'x')]).hasCycle).toBe(true);
    });

    it('handles a deep chain without exhausting the stack', () => {
        // Recursive DFS would risk a stack overflow here; the implementation is iterative.
        const n = 20_000;
        const nodes = Array.from({ length: n }, (_, i) => node(`n${i}`));
        const edges = Array.from({ length: n - 1 }, (_, i) => edge(`n${i + 1}`, `n${i}`));
        expect(DetectCycle(nodes, edges).hasCycle).toBe(false);
    });

    it('handles empty input', () => {
        expect(DetectCycle([], [])).toEqual({ hasCycle: false });
    });
});

describe('FindUnknownDependencyRefs', () => {
    it('returns edges pointing at unknown ids', () => {
        const nodes = [node('a'), node('b')];
        const bad = edge('b', 'ghost');
        expect(FindUnknownDependencyRefs(nodes, [edge('b', 'a'), bad])).toEqual([bad]);
    });

    it('catches an unknown taskId as well as an unknown dependsOnTaskId', () => {
        const nodes = [node('a')];
        expect(FindUnknownDependencyRefs(nodes, [edge('ghost', 'a')])).toHaveLength(1);
    });

    it('returns empty when every reference resolves', () => {
        expect(FindUnknownDependencyRefs([node('a'), node('b')], [edge('b', 'a')])).toEqual([]);
    });
});

describe('ComputeEligibleTasks', () => {
    it('returns roots when nothing has run', () => {
        const nodes = [node('a'), node('b'), node('c')];
        const edges = [edge('b', 'a'), edge('c', 'a')];
        expect(ids(ComputeEligibleTasks(nodes, edges))).toEqual(['a']);
    });

    it('returns an entire wave at once, not just the first task', () => {
        // This is what makes wave parallelization possible without touching this function.
        const nodes = [node('a', 'Complete'), node('b'), node('c')];
        const edges = [edge('b', 'a'), edge('c', 'a')];
        expect(ids(ComputeEligibleTasks(nodes, edges))).toEqual(['b', 'c']);
    });

    it('withholds a task until every prerequisite is Complete', () => {
        const nodes = [node('a', 'Complete'), node('b', 'In Progress'), node('c')];
        const edges = [edge('c', 'a'), edge('c', 'b')];
        expect(ComputeEligibleTasks(nodes, edges)).toEqual([]);
    });

    it('never returns a task that is not Pending', () => {
        const nodes = [node('a', 'In Progress'), node('b', 'Complete'), node('c', 'Failed'), node('d', 'Blocked')];
        expect(ComputeEligibleTasks(nodes, [])).toEqual([]);
    });

    it('ignores Optional and Corequisite edges when gating', () => {
        // Only Prerequisite gates in Phase 1; the other types are carried for Phase 4 joins.
        const nodes = [node('a', 'Failed'), node('b')];
        const edges = [edge('b', 'a', 'Optional')];
        expect(ids(ComputeEligibleTasks(nodes, edges))).toEqual(['b']);
    });

    it('treats an absent dependencyType as Prerequisite', () => {
        // `a` is a root and therefore eligible; `b` must be withheld because its untyped
        // dependency on the still-Pending `a` gates by default.
        const nodes = [node('a', 'Pending'), node('b')];
        expect(ids(ComputeEligibleTasks(nodes, [edge('b', 'a')]))).toEqual(['a']);
    });
});

describe('ComputeTasksToBlock', () => {
    it('blocks the direct dependent of a failed task', () => {
        const nodes = [node('a', 'Failed'), node('b')];
        expect(ComputeTasksToBlock(nodes, [edge('b', 'a')])).toEqual(['b']);
    });

    it('blocks transitively down the chain', () => {
        const nodes = [node('a', 'Failed'), node('b'), node('c'), node('d')];
        const edges = [edge('b', 'a'), edge('c', 'b'), edge('d', 'c')];
        expect(ComputeTasksToBlock(nodes, edges).sort()).toEqual(['b', 'c', 'd']);
    });

    it('blocks dependents of a Cancelled task too', () => {
        const nodes = [node('a', 'Cancelled'), node('b')];
        expect(ComputeTasksToBlock(nodes, [edge('b', 'a')])).toEqual(['b']);
    });

    it('propagates onward from an already-Blocked task', () => {
        const nodes = [node('a', 'Blocked'), node('b')];
        expect(ComputeTasksToBlock(nodes, [edge('b', 'a')])).toEqual(['b']);
    });

    it('leaves siblings on healthy branches alone', () => {
        const nodes = [node('a', 'Failed'), node('b'), node('x', 'Complete'), node('y')];
        const edges = [edge('b', 'a'), edge('y', 'x')];
        expect(ComputeTasksToBlock(nodes, edges)).toEqual(['b']);
    });

    it('does not touch tasks already running or terminal', () => {
        const nodes = [node('a', 'Failed'), node('b', 'In Progress'), node('c', 'Complete')];
        const edges = [edge('b', 'a'), edge('c', 'a')];
        expect(ComputeTasksToBlock(nodes, edges)).toEqual([]);
    });

    it('returns nothing for a healthy graph', () => {
        const nodes = [node('a', 'Complete'), node('b')];
        expect(ComputeTasksToBlock(nodes, [edge('b', 'a')])).toEqual([]);
    });

    it('terminates on a cyclic graph rather than looping forever', () => {
        // Cycles are rejected at submission, but this must not hang if one slips through.
        const nodes = [node('a', 'Failed'), node('b'), node('c')];
        const edges = [edge('b', 'a'), edge('c', 'b'), edge('b', 'c')];
        expect(ComputeTasksToBlock(nodes, edges).sort()).toEqual(['b', 'c']);
    });

    it('ignores Optional edges — an optional dependency failing does not block', () => {
        const nodes = [node('a', 'Failed'), node('b')];
        expect(ComputeTasksToBlock(nodes, [edge('b', 'a', 'Optional')])).toEqual([]);
    });
});

describe('ComputeParentRollup', () => {
    it('reports Complete at 100% when all children succeed', () => {
        const r = ComputeParentRollup([node('a', 'Complete'), node('b', 'Complete')]);
        expect(r).toEqual({ status: 'Complete', percentComplete: 100, outcome: 'settled' });
    });

    it('reports Failed — not Complete — when any child failed', () => {
        // The bug this replaces: the parent was unconditionally marked Complete/100%.
        const r = ComputeParentRollup([node('a', 'Complete'), node('b', 'Failed')]);
        expect(r.status).toBe('Failed');
        expect(r.percentComplete).toBe(50);
        expect(r.outcome).toBe('settled');
    });

    it('reports Blocked when children are blocked but none failed', () => {
        const r = ComputeParentRollup([node('a', 'Complete'), node('b', 'Blocked')]);
        expect(r.status).toBe('Blocked');
    });

    it('prefers Failed over Blocked and Cancelled', () => {
        const r = ComputeParentRollup([node('a', 'Failed'), node('b', 'Blocked'), node('c', 'Cancelled')]);
        expect(r.status).toBe('Failed');
    });

    it('prefers Blocked over Cancelled', () => {
        expect(ComputeParentRollup([node('a', 'Blocked'), node('b', 'Cancelled')]).status).toBe('Blocked');
    });

    it('stays In Progress while any child is unsettled, even if another failed', () => {
        const r = ComputeParentRollup([node('a', 'Failed'), node('b', 'In Progress')]);
        expect(r.status).toBe('In Progress');
        expect(r.outcome).toBe('active');
    });

    it('counts Deferred as unsettled', () => {
        expect(ComputeParentRollup([node('a', 'Deferred')]).status).toBe('In Progress');
    });

    it('never reports 100% when a child did not complete', () => {
        expect(ComputeParentRollup([node('a', 'Complete'), node('b', 'Failed')]).percentComplete).toBeLessThan(100);
    });

    it('floors partial progress rather than rounding up', () => {
        const r = ComputeParentRollup([node('a', 'Complete'), node('b', 'Failed'), node('c', 'Failed')]);
        expect(r.percentComplete).toBe(33);
    });

    it('treats an empty graph as vacuously complete', () => {
        expect(ComputeParentRollup([])).toEqual({ status: 'Complete', percentComplete: 100, outcome: 'settled' });
    });
});

describe('IsGraphStalled', () => {
    it('detects a deadlock: Pending work with nothing eligible and nothing running', () => {
        // A cyclic graph reaches exactly this state — previously it exited quietly as "complete".
        const nodes = [node('a'), node('b')];
        expect(IsGraphStalled(nodes, [edge('a', 'b'), edge('b', 'a')])).toBe(true);
    });

    it('is not stalled while a task is in flight', () => {
        const nodes = [node('a', 'In Progress'), node('b')];
        expect(IsGraphStalled(nodes, [edge('b', 'a')])).toBe(false);
    });

    it('is not stalled while something is eligible', () => {
        expect(IsGraphStalled([node('a')], [])).toBe(false);
    });

    it('is not stalled when everything is finished', () => {
        expect(IsGraphStalled([node('a', 'Complete')], [])).toBe(false);
    });

    it('is not stalled when remaining work is Blocked rather than Pending', () => {
        // Blocked is a settled outcome, not a wedge — the graph is done, unhappily.
        expect(IsGraphStalled([node('a', 'Failed'), node('b', 'Blocked')], [edge('b', 'a')])).toBe(false);
    });
});

describe('IsGraphSettled', () => {
    it('is settled when all children are terminal', () => {
        expect(IsGraphSettled([node('a', 'Complete'), node('b', 'Failed'), node('c', 'Blocked')])).toBe(true);
    });

    it('is not settled while work remains', () => {
        expect(IsGraphSettled([node('a', 'Complete'), node('b', 'Pending')])).toBe(false);
    });

    it('is not settled while a task is in flight', () => {
        expect(IsGraphSettled([node('a', 'In Progress')])).toBe(false);
    });
});
