/**
 * Coordinates for TaskGraphSpecs that never had any.
 *
 * Pure primitive layout tests (`LayoutGraphNodes`, `GraphLayoutBounds`, `RankGraphNodes`) live
 * in `@memberjunction/graph`. This file covers `LayoutTaskGraph`, `ResolveTaskGraphPositions`, and
 * parity between `LayoutTaskGraph` and `LayoutGraphNodes`.
 */
import { describe, it, expect } from 'vitest';
import { LayoutGraphNodes } from '@memberjunction/graph';
import { LayoutTaskGraph, ResolveTaskGraphPositions } from '../task-graph/graph-layout';
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

    it('agrees with LayoutGraphNodes on the same graph', () => {
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
});

/**
 * Position resolution for a STORED graph.
 *
 * A workflow compiled from a Flow agent carries the arrangement its author dragged into place, on
 * every node. `LayoutTaskGraph` ignores that and lays the graph out from scratch — right for a graph
 * an agent emitted, wrong for one a person drew. A viewer with no positions at all leaves every node
 * at the origin, and a canvas asked to fit a graph whose nodes are all in one place zooms until that
 * point fills the viewport.
 */
describe('ResolveTaskGraphPositions', () => {
    // Reuses the file's own node/graph builders; `layout` is what a Flow agent's compiler stamps on.
    const spec = graph;
    const task = (tempId: string, layout?: { x: number; y: number }): TaskGraphSpecNode =>
        layout ? { ...node(tempId), layout } : node(tempId);

    it('keeps the arrangement its author drew, exactly', () => {
        const positions = ResolveTaskGraphPositions(spec([
            task('a', { x: -1200, y: -240 }),
            task('b', { x: -860, y: 220 }),
        ]));
        expect(positions.get('a')).toEqual({ X: -1200, Y: -240 });
        expect(positions.get('b')).toEqual({ X: -860, Y: 220 });
    });

    it('computes positions for a graph nobody arranged', () => {
        const positions = ResolveTaskGraphPositions(spec([task('a'), task('b')]));
        expect(positions.size).toBe(2);
        // Distinct, so the canvas is not asked to fit a single point.
        expect(new Set([...positions.values()].map((p) => `${p.X},${p.Y}`)).size).toBe(2);
    });

    it('mixes the two per node, so a partly-arranged graph keeps what it has', () => {
        const positions = ResolveTaskGraphPositions(spec([task('a', { x: 42, y: 7 }), task('b')]));
        expect(positions.get('a')).toEqual({ X: 42, Y: 7 });
        expect(positions.get('b')).toBeDefined();
        expect(positions.get('b')).not.toEqual({ X: 42, Y: 7 });
    });

    it('gives every node a position, so none is left at the origin by default', () => {
        const positions = ResolveTaskGraphPositions(spec([task('a'), task('b'), task('c', { x: 1, y: 2 })]));
        expect(positions.size).toBe(3);
    });

    it('returns nothing for an empty or absent spec', () => {
        expect(ResolveTaskGraphPositions(null).size).toBe(0);
        expect(ResolveTaskGraphPositions(spec([])).size).toBe(0);
    });
});
