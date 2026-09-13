/**
 * ORGANIC-KEY DETECTION USED TO BE KILLED BY ITS OWN STRUCTURAL PHASE before it could emit anything.
 *
 * Three properties compounded on a large schema:
 *
 *  1. `runStructuralPhase` guarded only `clusters.length === 0`. The register asked for a second gate
 *     on "no DECLARED foreign keys" — which would not have helped, because `collectFKEdgesFromState`
 *     also pulls the SOFT FKs the key-detection phase inferred, and on an imported schema those ARE
 *     the edges. The gate has to be on the EDGE SET.
 *  2. `findBridgePaths` ran one BFS per hub × EVERY TABLE IN THE DATABASE, including every table with
 *     no join edge at all, each of which can only ever return nothing.
 *  3. `bfsPaths` pushed a FRESH `Set<string>` and a FRESH path array per neighbour per dequeued node
 *     onto an unbounded queue, drained with `Array.shift()` (O(n)), into an uncapped result array.
 *
 * These tests assert the BOUNDS, not the runtime: a timing assertion on a graph walk is a flake
 * generator, and the bound is the actual contract. They also pin that bounding did not change what
 * an unbounded walk finds on a graph small enough to exhaust.
 */
import { describe, it, expect } from 'vitest';
import { runStructuralPhase } from '../discovery/StructuralPhase';
import { walkBridgePaths, FKEdge } from '../discovery/FKGraphWalker';
import { DatabaseDocumentation } from '../types/state';
import { OrganicKeyCluster } from '../types/organic-keys';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function table(name: string, columns: string[], dependsOn: Array<{ schema: string; table: string; column: string; referencedColumn: string }> = []) {
    return {
        name,
        rowCount: 100,
        dependsOn,
        dependents: [],
        columns: columns.map((c, i) => ({ name: c, dataType: 'int', isNullable: false, isPrimaryKey: i === 0 })),
        descriptionIterations: [],
    };
}

function state(tables: ReturnType<typeof table>[], softFKs: Array<Record<string, unknown>> = []): DatabaseDocumentation {
    return {
        schemas: [{ name: 'dbo', tables, descriptionIterations: [] }],
        phases: { keyDetection: { discovered: { foreignKeys: softFKs } } },
    } as unknown as DatabaseDocumentation;
}

function cluster(members: Array<{ table: string; column: string }>): OrganicKeyCluster {
    return {
        id: 'c1', concept: 'customer_id', normalization: 'LowerCaseTrim',
        members: members.map((m) => ({ schema: 'dbo', table: m.table, column: m.column, participatesInFK: false })),
        confidence: 1, reasoning: 'test', maxIntraDistance: 0,
    } as unknown as OrganicKeyCluster;
}

/** A complete graph on N tables — the densest shape a BFS can be handed. */
function denseGraph(n: number): { edges: FKEdge[]; tables: Array<{ schema: string; table: string }> } {
    const edges: FKEdge[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            edges.push({
                sourceSchema: 'dbo', sourceTable: `T${i}`, sourceColumn: `T${j}ID`,
                targetSchema: 'dbo', targetTable: `T${j}`, targetColumn: 'ID',
                kind: 'hard', confidence: 1,
            });
        }
    }
    const tables = Array.from({ length: n }, (_, i) => ({ schema: 'dbo', table: `T${i}` }));
    return { edges, tables };
}

// ─── The gate ────────────────────────────────────────────────────────────────

describe('runStructuralPhase — gated on the edge set, not on declared FKs', () => {
    it('returns immediately when there are no clusters', () => {
        const r = runStructuralPhase(state([table('A', ['ID'])]), []);
        expect(r.bridges).toEqual([]);
        expect(r.summary.walked).toBe(false);
        expect(r.summary.skipReason).toBe('no-clusters');
    });

    it('returns immediately when the state yields NO edges, declared or soft', () => {
        const r = runStructuralPhase(state([table('A', ['ID']), table('B', ['ID'])]), [cluster([{ table: 'A', column: 'ID' }])]);
        expect(r.summary.walked).toBe(false);
        expect(r.summary.skipReason).toBe('no-edges');
    });

    it('DOES walk a state with zero declared FKs but soft FKs present — the register\'s gate would not have', () => {
        const s = state(
            [table('A', ['ID', 'CustNo']), table('B', ['ID', 'CustNo']), table('C', ['ID', 'BID'])],
            [
                { schemaName: 'dbo', sourceTable: 'C', sourceColumn: 'BID', targetSchema: 'dbo', targetTable: 'B', targetColumn: 'ID', confidence: 90 },
                { schemaName: 'dbo', sourceTable: 'B', sourceColumn: 'CustNo', targetSchema: 'dbo', targetTable: 'A', targetColumn: 'CustNo', confidence: 90 },
            ]
        );
        const r = runStructuralPhase(s, [cluster([{ table: 'A', column: 'CustNo' }])]);
        expect(r.summary.walked).toBe(true);
        expect(r.summary.skipReason).toBeUndefined();
    });

    it('can be skipped outright, so a large schema still gets its semantic-phase keys', () => {
        const s = state([table('A', ['ID', 'BID'], [{ schema: 'dbo', table: 'B', column: 'BID', referencedColumn: 'ID' }]), table('B', ['ID'])]);
        const r = runStructuralPhase(s, [cluster([{ table: 'A', column: 'ID' }])], { skip: true });
        expect(r.summary.walked).toBe(false);
        expect(r.summary.skipReason).toBe('disabled');
    });
});

// ─── The bounds ──────────────────────────────────────────────────────────────

describe('walkBridgePaths — the walk is bounded and says when a bound fired', () => {
    it('skips every (hub, spoke) pair whose spoke has no edge at all', () => {
        const { edges } = denseGraph(3);
        const spokes = [
            { schema: 'dbo', table: 'T1' }, { schema: 'dbo', table: 'T2' },
            // 20 tables that are in the database and in no relationship
            ...Array.from({ length: 20 }, (_, i) => ({ schema: 'dbo', table: `Orphan${i}` })),
        ];
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'T0', keyField: 'ID' }], spokes);
        expect(r.pairsSearched).toBe(2);
        expect(r.pairsSkipped).toBe(20);
    });

    it('skips every spoke for a HUB that has no edge — it is unreachable from all of them', () => {
        const { edges, tables } = denseGraph(4);
        // Hub H is a real table in the database and in no relationship.
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'H', keyField: 'ID' }], tables);
        expect(r.pairsSearched).toBe(0);
        expect(r.pairsSkipped).toBe(tables.length);
        expect(r.paths).toEqual([]);
    });

    it('returns immediately on an empty edge set without searching any pair', () => {
        const r = walkBridgePaths([], [{ schema: 'dbo', table: 'T0', keyField: 'ID' }], [{ schema: 'dbo', table: 'T1' }]);
        expect(r.paths).toEqual([]);
        expect(r.pairsSearched).toBe(0);
        expect(r.truncated).toBe(false);
    });

    it('caps paths per pair and reports the cap, rather than growing the result array', () => {
        const { edges, tables } = denseGraph(8);
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'T0', keyField: 'ID' }], tables.slice(1), { maxPathsPerPair: 2 });
        expect(r.truncated).toBe(true);
        expect(r.truncationReasons).toContain('pathsPerPair');
        // 7 spokes, at most 2 paths each, and length-1 paths are dropped as direct FKs.
        expect(r.paths.length).toBeLessThanOrEqual(7 * 2);
    });

    it('caps the total result array and reports the cap', () => {
        const { edges, tables } = denseGraph(8);
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'T0', keyField: 'ID' }], tables.slice(1), { maxTotalPaths: 5 });
        expect(r.paths.length).toBe(5);
        expect(r.truncationReasons).toContain('totalPaths');
    });

    it('caps the live BFS frontier and reports the cap', () => {
        const { edges, tables } = denseGraph(10);
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'T0', keyField: 'ID' }], tables.slice(1), { maxFrontier: 2 });
        expect(r.truncated).toBe(true);
        expect(r.truncationReasons).toContain('frontier');
    });

    it('an explicitly-undefined bound does not UNSET the ceiling', () => {
        const { edges, tables } = denseGraph(8);
        // The one way a caller could accidentally un-bound the walk: spreading an options object
        // whose keys are present but undefined. Defaults must survive that.
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'T0', keyField: 'ID' }], tables.slice(1), {
            maxFrontier: undefined, maxPathsPerPair: undefined, maxTotalPaths: undefined, maxHops: undefined,
        });
        // maxHops back at its default of 3, so no path is longer than that.
        expect(r.paths.every((p) => p.pathLength <= 3)).toBe(true);
        expect(r.paths.length).toBeLessThanOrEqual(25_000);
    });

    it('a graph small enough to exhaust is unaffected by the bounds', () => {
        // A → B → C chain. C reaches A in 2 hops; that is the one bridge.
        const edges: FKEdge[] = [
            { sourceSchema: 'dbo', sourceTable: 'B', sourceColumn: 'AID', targetSchema: 'dbo', targetTable: 'A', targetColumn: 'ID', kind: 'hard', confidence: 1 },
            { sourceSchema: 'dbo', sourceTable: 'C', sourceColumn: 'BID', targetSchema: 'dbo', targetTable: 'B', targetColumn: 'ID', kind: 'hard', confidence: 1 },
        ];
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'A', keyField: 'ID' }], [{ schema: 'dbo', table: 'B' }, { schema: 'dbo', table: 'C' }]);
        expect(r.truncated).toBe(false);
        expect(r.paths).toHaveLength(1);
        expect(r.paths[0].spokeTable).toBe('C');
        expect(r.paths[0].pathLength).toBe(2);
    });

    it('does NOT return a path longer than maxHops', () => {
        // A ← B ← C ← D ← E: E reaches A in 4 hops, one more than the default 3.
        const chain = ['B', 'C', 'D', 'E'];
        const edges: FKEdge[] = chain.map((t, i) => ({
            sourceSchema: 'dbo', sourceTable: t, sourceColumn: 'ParentID',
            targetSchema: 'dbo', targetTable: i === 0 ? 'A' : chain[i - 1], targetColumn: 'ID',
            kind: 'hard' as const, confidence: 1,
        }));
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'A', keyField: 'ID' }], [{ schema: 'dbo', table: 'E' }]);
        expect(r.paths).toEqual([]);
        // ...and the 3-hop spoke on the same chain IS found, so this is the bound and not a bug.
        const r3 = walkBridgePaths(edges, [{ schema: 'dbo', table: 'A', keyField: 'ID' }], [{ schema: 'dbo', table: 'D' }]);
        expect(r3.paths.map((p) => p.pathLength)).toEqual([3]);
    });

    it('still finds a maxHops-length path — the index cursor did not break the queue drain', () => {
        // A ← B ← C ← D, so D reaches A in exactly 3 hops (the default maxHops).
        const edges: FKEdge[] = [
            { sourceSchema: 'dbo', sourceTable: 'B', sourceColumn: 'AID', targetSchema: 'dbo', targetTable: 'A', targetColumn: 'ID', kind: 'hard', confidence: 1 },
            { sourceSchema: 'dbo', sourceTable: 'C', sourceColumn: 'BID', targetSchema: 'dbo', targetTable: 'B', targetColumn: 'ID', kind: 'hard', confidence: 1 },
            { sourceSchema: 'dbo', sourceTable: 'D', sourceColumn: 'CID', targetSchema: 'dbo', targetTable: 'C', targetColumn: 'ID', kind: 'hard', confidence: 1 },
        ];
        const r = walkBridgePaths(edges, [{ schema: 'dbo', table: 'A', keyField: 'ID' }], [{ schema: 'dbo', table: 'D' }]);
        expect(r.paths).toHaveLength(1);
        expect(r.paths[0].pathLength).toBe(3);
        expect(r.paths[0].hops.map((h) => h.fromTable)).toEqual(['D', 'C', 'B']);
    });
});
