import { describe, it, expect } from 'vitest';
import { DimensionalityReducer } from '../DimensionalityReducer';

/** Build a keyed map of random high-dimensional vectors. */
function buildMap(count: number, dim: number): Map<string, number[]> {
    const map = new Map<string, number[]>();
    for (let i = 0; i < count; i++) {
        const v: number[] = [];
        for (let d = 0; d < dim; d++) {
            v.push(Math.random());
        }
        map.set(`k${i}`, v);
    }
    return map;
}

describe('DimensionalityReducer', () => {
    it('produces a 2D coordinate for every key', () => {
        const reducer = new DimensionalityReducer();
        const out = reducer.Reduce(buildMap(12, 8), 2);
        expect(out.size).toBe(12);
        for (const coord of out.values()) {
            expect(coord.length).toBe(2);
            expect(Number.isFinite(coord[0])).toBe(true);
            expect(Number.isFinite(coord[1])).toBe(true);
        }
    });

    it('produces 3 components when asked for 3D', () => {
        const reducer = new DimensionalityReducer();
        const out = reducer.Reduce(buildMap(12, 8), 3);
        for (const coord of out.values()) {
            expect(coord.length).toBe(3);
        }
    });

    it('returns a trivial layout when there are too few points', () => {
        const reducer = new DimensionalityReducer();
        const map = new Map<string, number[]>([
            ['a', [1, 2, 3]],
            ['b', [4, 5, 6]],
        ]);
        const out = reducer.Reduce(map, 2);
        expect(out.size).toBe(2);
        expect(out.get('a')!.length).toBe(2);
    });

    it('normalizes coordinates within the padded viewbox', () => {
        const reducer = new DimensionalityReducer();
        const out = reducer.Reduce(buildMap(30, 10), 2);
        for (const coord of out.values()) {
            // padding=60, viewbox=1000 => coords land within [0, 1000]
            expect(coord[0]).toBeGreaterThanOrEqual(0);
            expect(coord[0]).toBeLessThanOrEqual(1000);
            expect(coord[1]).toBeGreaterThanOrEqual(0);
            expect(coord[1]).toBeLessThanOrEqual(1000);
        }
    });
});
