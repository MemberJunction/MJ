import { describe, it, expect } from 'vitest';
import { FindTrueCycles } from '../Database/entity-level-tree-cycles';

/**
 * Builds a dependency map from a simple adjacency-list literal.
 * Every node referenced as a dependency is also registered as a key (with no
 * dependencies of its own) unless already present — mirroring how
 * buildEntityLevelsTree initializes every entity with an (initially empty) Set.
 */
function buildMap(adjacency: Record<string, string[]>): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const [node, deps] of Object.entries(adjacency)) {
        map.set(node, new Set(deps));
    }
    for (const deps of Object.values(adjacency)) {
        for (const dep of deps) {
            if (!map.has(dep)) {
                map.set(dep, new Set<string>());
            }
        }
    }
    return map;
}

describe('FindTrueCycles', () => {
    it('should return exactly the one 2-cycle when downstream chains also remain in the graph', () => {
        // The real-world shape: MJ: AI Agents <-> MJ: AI Agent Types, with many entities
        // downstream of the cycle (directly or transitively) but not part of it.
        const map = buildMap({
            'MJ: AI Agents': ['MJ: AI Agent Types'],
            'MJ: AI Agent Types': ['MJ: AI Agents'],
            'MJ: AI Agent Runs': ['MJ: AI Agents'],
            'MJ: AI Agent Run Steps': ['MJ: AI Agent Runs'],
            'MJ: AI Agent Prompts': ['MJ: AI Agents', 'MJ: AI Agent Run Steps']
        });

        const cycles = FindTrueCycles(map);

        expect(cycles).toEqual([['MJ: AI Agent Types', 'MJ: AI Agents']]);
    });

    it('should find two independent cycles', () => {
        const map = buildMap({
            A: ['B'],
            B: ['A'],
            X: ['Y'],
            Y: ['X'],
            Downstream: ['A', 'X']
        });

        const cycles = FindTrueCycles(map);

        expect(cycles).toEqual([
            ['A', 'B'],
            ['X', 'Y']
        ]);
    });

    it('should return an empty array for an acyclic graph', () => {
        const map = buildMap({
            A: ['B', 'C'],
            B: ['C'],
            C: ['D'],
            D: []
        });

        expect(FindTrueCycles(map)).toEqual([]);
    });

    it('should return all members of a larger SCC (A -> B -> C -> A)', () => {
        const map = buildMap({
            A: ['B'],
            B: ['C'],
            C: ['A']
        });

        expect(FindTrueCycles(map)).toEqual([['A', 'B', 'C']]);
    });

    it('should produce identical, alphabetically ordered output regardless of insertion order', () => {
        const forward = buildMap({
            Zebra: ['Apple'],
            Apple: ['Zebra'],
            Mango: ['Lemon'],
            Lemon: ['Mango']
        });

        // Same graph, reversed insertion order
        const reversed = buildMap({
            Lemon: ['Mango'],
            Mango: ['Lemon'],
            Apple: ['Zebra'],
            Zebra: ['Apple']
        });

        const expected = [
            ['Apple', 'Zebra'],
            ['Lemon', 'Mango']
        ];
        expect(FindTrueCycles(forward)).toEqual(expected);
        expect(FindTrueCycles(reversed)).toEqual(expected);
    });

    it('should ignore edges pointing at nodes not present in the map', () => {
        // 'Resolved' was peeled into an earlier level and is no longer a key
        const map = new Map<string, Set<string>>([
            ['A', new Set(['B', 'Resolved'])],
            ['B', new Set(['A'])]
        ]);

        expect(FindTrueCycles(map)).toEqual([['A', 'B']]);
    });

    it('should not report single-node components as cycles', () => {
        const map = buildMap({
            A: ['B'],
            B: []
        });

        expect(FindTrueCycles(map)).toEqual([]);
    });
});
