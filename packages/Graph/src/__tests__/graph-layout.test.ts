/**
 * Pure layered graph layout tests (zero-dependency primitives).
 */
import { describe, it, expect } from 'vitest';
import { GraphLayoutBounds, LayoutGraphNodes, RankGraphNodes } from '../index';

describe('LayoutGraphNodes', () => {
    it('lays out from ids and edges, with no spec in sight', () => {
        const positions = LayoutGraphNodes(
            ['task-1', 'task-2', 'task-3'],
            [{ From: 'task-1', To: 'task-2' }, { From: 'task-2', To: 'task-3' }],
        );
        expect(positions.get('task-1')!.X).toBeLessThan(positions.get('task-2')!.X);
        expect(positions.get('task-2')!.X).toBeLessThan(positions.get('task-3')!.X);
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
