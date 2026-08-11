/**
 * Coordinates for graphs that never had any.
 *
 * The bug this exists to prevent is not subtle — with no layout, every node renders at the origin
 * and a four-step workflow draws as one illegible pile. But the *interesting* failures are the ones
 * that still look like a drawing: a dependent placed left of its prerequisite (reads as a backwards
 * edge, i.e. a loop in a graph that has none), a layout that shifts on every re-render (a run view
 * re-projects on every status change), or a cycle in hand-built input hanging the renderer.
 */
import { describe, it, expect } from 'vitest';
import { GraphLayoutBounds, LayoutGraphNodes, LayoutTaskGraph, RankGraphNodes } from '../task-graph/graph-layout';
import { TaskNode, type TaskGraphSpec, type TaskGraphSpecNode } from '../task-graph/task-graph-spec';

const node = (tempId: string, dependsOn: string[] = []): TaskGraphSpecNode =>
    TaskNode.Action({ tempId, name: tempId, description: '', dependsOn }, { actionName: 'X' });

const graph = (tasks: TaskGraphSpecNode[]): TaskGraphSpec => ({
    workflowName: 'G', reasoning: '', tasks,
});

describe('LayoutTaskGraph', () => {
    it('gives every node a distinct position — the pile-at-the-origin bug', () => {
        const positions = LayoutTaskGraph(graph([node('a'), node('b', ['a']), node('c', ['a'])]));
        expect(positions.size).toBe(3);
        const seen = new Set([...positions.values()].map((p) => `${p.X},${p.Y}`));
        expect(seen.size).toBe(3);
    });

    it('places a dependent strictly after its prerequisite', () => {
        // The failure this rules out draws an edge pointing backwards, which reads as a loop.
        const positions = LayoutTaskGraph(graph([node('a'), node('b', ['a']), node('c', ['b'])]));
        expect(positions.get('a')!.X).toBeLessThan(positions.get('b')!.X);
        expect(positions.get('b')!.X).toBeLessThan(positions.get('c')!.X);
    });

    it('uses the LONGEST path, so a node clears every prerequisite', () => {
        // 'd' waits on both a one-hop chain and a two-hop one. Shortest-path would place it beside
        // 'c' and draw the c→d edge backwards.
        const positions = LayoutTaskGraph(graph([
            node('a'),
            node('b', ['a']),
            node('c', ['b']),
            node('d', ['a', 'c']),
        ]));
        expect(positions.get('d')!.X).toBeGreaterThan(positions.get('c')!.X);
    });

    it('separates siblings in a fan-out instead of stacking them', () => {
        const positions = LayoutTaskGraph(graph([node('a'), node('b', ['a']), node('c', ['a'])]));
        expect(positions.get('b')!.X).toBe(positions.get('c')!.X);      // same layer
        expect(positions.get('b')!.Y).not.toBe(positions.get('c')!.Y);  // different rows
    });

    it('is deterministic — a run view re-projects on every status change', () => {
        const g = graph([node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c'])]);
        expect([...LayoutTaskGraph(g)]).toEqual([...LayoutTaskGraph(g)]);
    });

    it('centres a short layer against the tallest one', () => {
        // A single node after a three-way fan-out should sit beside the middle branch, not the top.
        const positions = LayoutTaskGraph(graph([
            node('a'), node('b', ['a']), node('c', ['a']), node('d', ['a']),
            node('join', ['b', 'c', 'd']),
        ]));
        const branchYs = ['b', 'c', 'd'].map((id) => positions.get(id)!.Y).sort((x, y) => x - y);
        const joinY = positions.get('join')!.Y;
        expect(joinY).toBeGreaterThan(branchYs[0]);
        expect(joinY).toBeLessThan(branchYs[2]);
    });

    it('lays out top-to-bottom when asked', () => {
        const positions = LayoutTaskGraph(graph([node('a'), node('b', ['a'])]), { Direction: 'TB' });
        expect(positions.get('a')!.Y).toBeLessThan(positions.get('b')!.Y);
        expect(positions.get('a')!.X).toBe(positions.get('b')!.X);
    });

    it('honours spacing options', () => {
        const positions = LayoutTaskGraph(graph([node('a'), node('b', ['a'])]), {
            NodeWidth: 100, LayerGap: 50, OriginX: 0,
        });
        expect(positions.get('a')!.X).toBe(0);
        expect(positions.get('b')!.X).toBe(150);
    });

    it('places disconnected nodes rather than dropping them', () => {
        const positions = LayoutTaskGraph(graph([node('a'), node('b', ['a']), node('orphan')]));
        expect(positions.has('orphan')).toBe(true);
        expect(positions.get('orphan')!.X).toBe(positions.get('a')!.X); // both are entry points
    });

    it('TERMINATES on a cycle and still places every node', () => {
        // Cycles are rejected at compile time, but a hand-built spec can contain one, and a renderer
        // that spun forever on bad input would be worse than one that drew it imperfectly.
        const positions = LayoutTaskGraph(graph([
            node('a', ['c']), node('b', ['a']), node('c', ['b']),
        ]));
        expect(positions.size).toBe(3);
    });

    it('ignores a dependency on something outside the graph', () => {
        // Validation reports the dangling reference; letting it push a node into a phantom layer
        // would corrupt the drawing of an otherwise fine graph.
        const positions = LayoutTaskGraph(graph([node('a', ['nope']), node('b', ['a'])]));
        expect(positions.get('a')!.X).toBeLessThan(positions.get('b')!.X);
    });

    it('returns nothing for an empty graph rather than throwing', () => {
        expect(LayoutTaskGraph(graph([])).size).toBe(0);
    });

    it('keeps edges short across a crossing-prone shape', () => {
        // a→x and b→y drawn from a layer ordered [a,b] should not order the next layer [y,x].
        const positions = LayoutTaskGraph(graph([
            node('a'), node('b'),
            node('x', ['a']), node('y', ['b']),
        ]));
        const aFirst = positions.get('a')!.Y < positions.get('b')!.Y;
        const xFirst = positions.get('x')!.Y < positions.get('y')!.Y;
        expect(xFirst).toBe(aFirst);
    });
});

/**
 * The form the run views actually need.
 *
 * A graph being watched is `Task` rows joined by `TaskDependency` rows — there is no spec anywhere.
 * Reconstructing one just to lay it out would mean inventing kinds and configuration the renderer
 * does not care about, so the primitive takes bare ids and edges.
 */
describe('LayoutGraphNodes', () => {
    it('lays out from ids and edges, with no spec in sight', () => {
        const positions = LayoutGraphNodes(
            ['task-1', 'task-2', 'task-3'],
            [{ From: 'task-1', To: 'task-2' }, { From: 'task-2', To: 'task-3' }],
        );
        expect(positions.get('task-1')!.X).toBeLessThan(positions.get('task-2')!.X);
        expect(positions.get('task-2')!.X).toBeLessThan(positions.get('task-3')!.X);
    });

    it('agrees with the spec form on the same graph', () => {
        // Two entry points into one algorithm; if they diverged, the editor and the run view would
        // draw the same workflow differently.
        const spec = graph([node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c'])]);
        const fromSpec = LayoutTaskGraph(spec);
        const fromEdges = LayoutGraphNodes(
            ['a', 'b', 'c', 'd'],
            [
                { From: 'a', To: 'b' }, { From: 'a', To: 'c' },
                { From: 'b', To: 'd' }, { From: 'c', To: 'd' },
            ],
        );
        expect([...fromEdges]).toEqual([...fromSpec]);
    });

    it('ignores a self-edge rather than trying to place a node after itself', () => {
        const positions = LayoutGraphNodes(['a', 'b'], [{ From: 'a', To: 'a' }, { From: 'a', To: 'b' }]);
        expect(positions.get('a')!.X).toBeLessThan(positions.get('b')!.X);
    });

    it('tolerates duplicate ids and duplicate edges', () => {
        const positions = LayoutGraphNodes(
            ['a', 'a', 'b'],
            [{ From: 'a', To: 'b' }, { From: 'a', To: 'b' }],
        );
        expect(positions.size).toBe(2);
    });
});

describe('GraphLayoutBounds', () => {
    it('includes the node extent, not just the position extent', () => {
        // A box measured from positions alone clips the last node off the right and bottom edges.
        const positions = LayoutGraphNodes(['a', 'b'], [{ From: 'a', To: 'b' }]);
        const box = GraphLayoutBounds(positions);
        const maxX = Math.max(...[...positions.values()].map((p) => p.X));
        expect(box.Width).toBeGreaterThan(maxX - box.X);
    });

    it('is empty for an empty graph', () => {
        expect(GraphLayoutBounds(new Map())).toEqual({ X: 0, Y: 0, Width: 0, Height: 0 });
    });
});

/**
 * Ranking exists because a `Task` row has no sequence column, so every consumer listing a graph's
 * steps fell back to creation order — the compiler's walk, which matches neither the drawn order nor
 * the execution order. An unstarted graph has no timestamps either, so its structure is the only
 * order available, and it is available from the moment the graph is compiled.
 */
describe('RankGraphNodes', () => {
    it('ranks a chain in dependency order', () => {
        const ranks = RankGraphNodes(['c', 'a', 'b'], [{ From: 'a', To: 'b' }, { From: 'b', To: 'c' }]);
        expect([...ranks.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)).toEqual(['a', 'b', 'c']);
    });

    it('never ranks a step above something it depends on', () => {
        // The shape from the demo workflow: one start, a two-way branch, then a step that waits on
        // both. Whatever order the ids arrive in, step 3 must not precede 2(a) or 2(b).
        const ranks = RankGraphNodes(
            ['s3', 's2b', 's1', 's2a'],
            [
                { From: 's1', To: 's2a' }, { From: 's1', To: 's2b' },
                { From: 's2a', To: 's3' }, { From: 's2b', To: 's3' },
            ],
        );
        expect(ranks.get('s1')!).toBeLessThan(ranks.get('s2a')!);
        expect(ranks.get('s1')!).toBeLessThan(ranks.get('s2b')!);
        expect(ranks.get('s3')!).toBeGreaterThan(ranks.get('s2a')!);
        expect(ranks.get('s3')!).toBeGreaterThan(ranks.get('s2b')!);
    });

    it('gives every node a distinct rank, so it can be used as an ordering key', () => {
        const ranks = RankGraphNodes(['a', 'b', 'c', 'd'], [{ From: 'a', To: 'c' }]);
        expect(new Set(ranks.values()).size).toBe(4);
    });

    it('ranks an edgeless graph without complaint', () => {
        expect(RankGraphNodes(['a', 'b'], []).size).toBe(2);
    });

    it('terminates on a cycle rather than hanging', () => {
        // Cycles are rejected at compile time, but a hand-built spec could still contain one, and a
        // ranker that spun forever would be worse than one that ranked it imperfectly.
        const ranks = RankGraphNodes(['a', 'b'], [{ From: 'a', To: 'b' }, { From: 'b', To: 'a' }]);
        expect(ranks.size).toBe(2);
    });

    it('returns nothing for no nodes', () => {
        expect(RankGraphNodes([], []).size).toBe(0);
    });
});
