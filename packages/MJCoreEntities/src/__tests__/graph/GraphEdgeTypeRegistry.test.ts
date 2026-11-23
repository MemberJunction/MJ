/**
 * The edge type rows are the contract (Canon Rule 2): every edge type name a provider or the
 * Content Pipeline synthesizer emits resolves to a seeded `MJ: Graph Edge Types` row, a provider's
 * inverse label matches the row's, no two stored directed types name each other as inverses, and
 * the four concept edges have endpoint rows that point from the artifact to the concept.
 *
 * The emitted names are read from the source files, so a provider or synthesizer that starts
 * emitting a new name fails this test until the name is seeded. The scan also asserts it found the
 * names it knows about, so it cannot pass by reading nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NormalizeGraphEdgeTypeName } from '../../graph/BaseGraphEdgeProvider';
import { GraphEdgeEndpointAllows } from '../../graph/GraphEngine';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');

interface SeedEdgeType {
    fields: { Name: string; InverseName: string | null; IsDirected: boolean; AllowStored: boolean; GraphID: string | null };
    primaryKey: { ID: string };
}

interface SeedEndpoint {
    fields: { EdgeTypeID: string; Side: 'Source' | 'Target'; EntityID: string };
    primaryKey: { ID: string };
}

function readJson<T>(relativePath: string): T {
    return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

function tsFilesUnder(relativeDir: string): string[] {
    const dir = path.join(repoRoot, relativeDir);
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            out.push(...tsFilesUnder(path.relative(repoRoot, full)));
        } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
            out.push(full);
        }
    }
    return out;
}

/** The emitting sources: the graph providers and engine, the synthesizer, and the grounding matcher. */
const EMITTING_SOURCES = [
    ...tsFilesUnder('packages/MJCoreEntities/src/graph'),
    path.join(repoRoot, 'packages/ContentPipeline/engine/src/ManagedPromptConceptSynthesizer.ts'),
    path.join(repoRoot, 'packages/ContentPipeline/base/src/graph/ConceptSeedClustering.ts'),
];

/** Every edge type name a literal in the emitting sources sets, and each literal inverse label it pairs with one. */
function scanEmittedNames(): { Names: Set<string>; Inverses: Array<{ Name: string; Inverse: string; File: string }> } {
    const names = new Set<string>();
    const inverses: Array<{ Name: string; Inverse: string; File: string }> = [];
    const add = (value: string) => names.add(value);
    for (const file of EMITTING_SOURCES) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/(?<!Inverse)TypeName:\s*'([^']+)'/g)) add(m[1]);
        for (const m of text.matchAll(/EdgeTypeName:\s*'([^']+)'/g)) add(m[1]);
        for (const m of text.matchAll(/_EDGE_TYPE\s*=\s*'([^']+)'/g)) add(m[1]);
        for (const m of text.matchAll(/EdgeTypeName\?\.trim\(\)\s*\|\|\s*'([^']+)'/g)) add(m[1]);
        for (const m of text.matchAll(/SuggestedEdgeType:\s*((?:'[^']+'\s*\|?\s*)+)/g)) {
            for (const lit of m[1].matchAll(/'([^']+)'/g)) add(lit[1]);
        }
        for (const m of text.matchAll(/(?<!Inverse)TypeName:\s*'([^']+)',\s*\n\s*InverseTypeName:\s*'([^']+)'/g)) {
            inverses.push({ Name: m[1], Inverse: m[2], File: path.relative(repoRoot, file) });
        }
    }
    return { Names: names, Inverses: inverses };
}

const seededTypes = readJson<SeedEdgeType[]>('metadata/graph-edge-types/.graph-edge-types.json');
const seededEndpoints = readJson<SeedEndpoint[]>('metadata/graph-edge-type-endpoints/.graph-edge-type-endpoints.json');
const seededByName = new Map(seededTypes.map((t) => [NormalizeGraphEdgeTypeName(t.fields.Name), t]));

describe('graph edge type registry (seed metadata vs. code)', () => {
    const scan = scanEmittedNames();

    it('scans the sources it means to: the known provider, constant and synthesizer names are found', () => {
        for (const known of ['Subsets', 'Is A', 'References', 'Reads', 'Composes', 'Field Of', 'RelatedTo', 'LinksTo',
            'SharesConceptWith', 'SourcedFrom', 'Mentions', 'BroaderThan', 'Contradicts', 'Describes', 'Defines', 'Measures', 'Implements']) {
            expect([...scan.Names].map(NormalizeGraphEdgeTypeName), `scan did not find '${known}'`).toContain(NormalizeGraphEdgeTypeName(known));
        }
        expect(scan.Inverses.length).toBeGreaterThanOrEqual(6);
    });

    it('resolves every emitted edge type name to a seeded MJ: Graph Edge Types row', () => {
        const missing = [...scan.Names].filter((name) => !seededByName.has(NormalizeGraphEdgeTypeName(name)));
        expect(missing, `emitted edge type names with no seeded row: ${missing.join(', ')}`).toEqual([]);
    });

    it("gives each provider-emitted inverse label the seeded row's InverseName", () => {
        const mismatched = scan.Inverses.filter(
            (pair) => NormalizeGraphEdgeTypeName(seededByName.get(NormalizeGraphEdgeTypeName(pair.Name))?.fields.InverseName) !== NormalizeGraphEdgeTypeName(pair.Inverse),
        );
        expect(mismatched.map((p) => `${p.File}: ${p.Name} -> ${p.Inverse}`)).toEqual([]);
    });

    it('seeds Same As and Preferred Over, which the Canon document renderer reads', () => {
        expect(seededByName.has(NormalizeGraphEdgeTypeName('Same As'))).toBe(true);
        expect(seededByName.has(NormalizeGraphEdgeTypeName('Preferred Over'))).toBe(true);
    });

    it('has one seeded row per name, whatever its spacing or case', () => {
        expect(seededByName.size).toBe(seededTypes.length);
    });

    it('never seeds two storable directed types that are each other\'s inverse (one is only a label)', () => {
        const stored = seededTypes.filter((t) => t.fields.IsDirected && t.fields.AllowStored);
        const storedNames = new Set(stored.map((t) => NormalizeGraphEdgeTypeName(t.fields.Name)));
        const pairs = stored.filter((t) => t.fields.InverseName && storedNames.has(NormalizeGraphEdgeTypeName(t.fields.InverseName)));
        expect(pairs.map((t) => `${t.fields.Name} <-> ${t.fields.InverseName}`)).toEqual([]);
        expect(seededByName.get(NormalizeGraphEdgeTypeName('NarrowerThan'))?.fields.AllowStored).toBe(false);
    });

    it('marks every provider-only type (emitted by a derived provider only) as AllowStored = false', () => {
        for (const name of ['Subsets', 'Is A', 'References', 'Reads', 'Composes', 'Field Of', 'SharesConceptWith']) {
            expect(seededByName.get(NormalizeGraphEdgeTypeName(name))?.fields.AllowStored, name).toBe(false);
        }
    });
});

describe('graph edge type endpoint rows', () => {
    const typeNameById = new Map(seededTypes.map((t) => [t.primaryKey.ID.toUpperCase(), t.fields.Name]));

    it('reference only seeded edge types, and give every row a primary key', () => {
        for (const ep of seededEndpoints) {
            expect(typeNameById.has(ep.fields.EdgeTypeID.toUpperCase()), `endpoint ${ep.primaryKey.ID} names an unseeded edge type`).toBe(true);
            expect(ep.primaryKey.ID).toMatch(/^[0-9A-F-]{36}$/);
        }
    });

    it('point the four concept edges from the artifact to the concept (one direction per type)', () => {
        for (const name of ['Defines', 'Describes', 'Measures', 'Implements']) {
            const rows = seededEndpoints.filter((ep) => typeNameById.get(ep.fields.EdgeTypeID.toUpperCase()) === name);
            const targets = rows.filter((ep) => ep.fields.Side === 'Target').map((ep) => ep.fields.EntityID);
            const sources = rows.filter((ep) => ep.fields.Side === 'Source').map((ep) => ep.fields.EntityID);
            expect(targets, name).toEqual(['@lookup:MJ: Entities.Name=MJ: Graph Concepts']);
            expect(sources.length, name).toBeGreaterThan(0);
            expect(sources, name).not.toContain('@lookup:MJ: Entities.Name=MJ: Graph Concepts');
        }
    });

    it('allow the entity each grounding edge type is suggested for as its source', () => {
        const clustering = readFileSync(path.join(repoRoot, 'packages/ContentPipeline/base/src/graph/ConceptSeedClustering.ts'), 'utf8');
        const body = clustering.slice(clustering.indexOf('function edgeTypeForTargetEntity'));
        for (const m of body.matchAll(/((?:case '[^']+':\s*)+)return '([^']+)';/g)) {
            const typeName = m[2];
            const allowed = seededEndpoints
                .filter((ep) => typeNameById.get(ep.fields.EdgeTypeID.toUpperCase()) === typeName && ep.fields.Side === 'Source')
                .map((ep) => ep.fields.EntityID);
            for (const entity of m[1].matchAll(/case '([^']+)'/g)) {
                expect(allowed, `${entity[1]} must be an allowed Source for ${typeName}`).toContain(`@lookup:MJ: Entities.Name=${entity[1]}`);
            }
        }
    });
});

describe('GraphEdgeEndpointAllows', () => {
    const measures = '88888888-8888-4888-8888-888888888802';
    const queries = '22222222-2222-4222-8222-2222222222A1';
    const concepts = '22222222-2222-4222-8222-2222222222A2';
    const rules = [
        { EdgeTypeID: measures, Side: 'Source' as const, EntityID: queries },
        { EdgeTypeID: measures, Side: 'Target' as const, EntityID: concepts },
    ];

    it('allows an entity a row names, comparing IDs without regard to case', () => {
        expect(GraphEdgeEndpointAllows(rules, measures.toLowerCase(), 'Source', queries.toLowerCase())).toBe(true);
        expect(GraphEdgeEndpointAllows(rules, measures, 'Target', concepts)).toBe(true);
    });

    it('refuses an entity no row for that side names (the old concept -> artifact direction)', () => {
        expect(GraphEdgeEndpointAllows(rules, measures, 'Source', concepts)).toBe(false);
        expect(GraphEdgeEndpointAllows(rules, measures, 'Target', queries)).toBe(false);
    });

    it('allows any entity when the type has no row for that side', () => {
        expect(GraphEdgeEndpointAllows(rules, '88888888-8888-4888-8888-888888888899', 'Source', concepts)).toBe(true);
    });
});
