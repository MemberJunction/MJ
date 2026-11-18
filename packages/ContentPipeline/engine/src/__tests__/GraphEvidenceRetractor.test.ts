/**
 * GraphEvidenceRetractor: deleting a chunk retracts only what the pipeline inferred from it.
 * `Inferred` edges touching the chunk go (inside the retraction scope, so an `Approved` one can be
 * removed without `Graph: Approve Edges`); `Declared` edges stay; a concept that lost its last
 * source goes when it is `Inferred`, has no children and no `Declared` edge, and is not `Approved` in a
 * Canon graph.
 */
import { describe, expect, it } from 'vitest';
import { ServerOperationScopeManager, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { GRAPH_PIPELINE_EVIDENCE_RETRACTION_OPERATION } from '@memberjunction/core-entities';
import { GraphEvidenceRetractor } from '../GraphEvidenceRetractor.js';

const CHUNKS = 'e0000000-0000-4000-8000-0000000000c1';
const CONCEPTS = 'e0000000-0000-4000-8000-0000000000c2';
const OTHER = 'e0000000-0000-4000-8000-0000000000c3';
const ITEMS = 'e0000000-0000-4000-8000-0000000000c4';
const KNOWLEDGE_GRAPH = 'g0000000-0000-4000-8000-000000000001';
const CANON_GRAPH = 'g0000000-0000-4000-8000-000000000002';
const user = { ID: 'u0000000-0000-4000-8000-000000000001', Name: 'Pipeline', UserRoles: [] } as unknown as UserInfo;

interface EdgeRow {
    ID: string;
    EdgeType: string;
    SourceEntityID: string;
    SourceRecordID: string;
    TargetEntityID: string;
    TargetRecordID: string;
    Origin: 'Declared' | 'Inferred';
    Status: 'Approved' | 'Proposed';
}

interface ConceptRow {
    ID: string;
    GraphID: string;
    Name: string;
    Origin: 'Declared' | 'Inferred';
    Status: 'Approved' | 'Proposed';
    ParentID: string | null;
}

function edge(id: string, type: string, src: [string, string], tgt: [string, string], origin: EdgeRow['Origin'] = 'Inferred', status: EdgeRow['Status'] = 'Approved'): EdgeRow {
    return { ID: id, EdgeType: type, SourceEntityID: src[0], SourceRecordID: src[1], TargetEntityID: tgt[0], TargetRecordID: tgt[1], Origin: origin, Status: status };
}

/** A world: chunk c1 is being deleted, c2 survives. */
function world() {
    const edges: EdgeRow[] = [
        edge('e-k1-c1', 'SourcedFrom', [CONCEPTS, 'k1'], [CHUNKS, 'c1']),
        edge('e-k1-k3', 'Broader Than', [CONCEPTS, 'k1'], [CONCEPTS, 'k3']),
        edge('e-k2-c1', 'SourcedFrom', [CONCEPTS, 'k2'], [CHUNKS, 'c1']),
        edge('e-k2-c2', 'SourcedFrom', [CONCEPTS, 'k2'], [CHUNKS, 'c2']),
        edge('e-c1-k2', 'Mentions', [CHUNKS, 'c1'], [CONCEPTS, 'k2']),
        edge('e-k4-c1', 'SourcedFrom', [CONCEPTS, 'k4'], [CHUNKS, 'c1']),
        edge('e-k5-c1', 'SourcedFrom', [CONCEPTS, 'k5'], [CHUNKS, 'c1']),
        edge('e-k5-x', 'Governs', [CONCEPTS, 'k5'], [OTHER, 'x1'], 'Declared'),
        edge('e-k6-c1', 'SourcedFrom', [CONCEPTS, 'k6'], [CHUNKS, 'c1']),
        edge('e-x-c1', 'Describes', [OTHER, 'x1'], [CHUNKS, 'c1'], 'Declared'),
        edge('e-k8-c1', 'SourcedFrom', [CONCEPTS, 'k8'], [CHUNKS, 'c1']),
        edge('e-i1-k8', 'Mentions', [ITEMS, 'i1'], [CONCEPTS, 'k8']),
        edge('e-i1-k2', 'Mentions', [ITEMS, 'i1'], [CONCEPTS, 'k2']),
    ];
    const concepts: ConceptRow[] = [
        { ID: 'k1', GraphID: KNOWLEDGE_GRAPH, Name: 'Only from c1', Origin: 'Inferred', Status: 'Proposed', ParentID: null },
        { ID: 'k2', GraphID: KNOWLEDGE_GRAPH, Name: 'Also from c2', Origin: 'Inferred', Status: 'Proposed', ParentID: null },
        { ID: 'k3', GraphID: KNOWLEDGE_GRAPH, Name: 'Broader', Origin: 'Declared', Status: 'Approved', ParentID: null },
        { ID: 'k4', GraphID: CANON_GRAPH, Name: 'Approved by a steward in Canon', Origin: 'Inferred', Status: 'Approved', ParentID: null },
        { ID: 'k5', GraphID: KNOWLEDGE_GRAPH, Name: 'Connected by a person', Origin: 'Inferred', Status: 'Proposed', ParentID: null },
        { ID: 'k6', GraphID: KNOWLEDGE_GRAPH, Name: 'Has a child', Origin: 'Inferred', Status: 'Proposed', ParentID: null },
        { ID: 'k7', GraphID: KNOWLEDGE_GRAPH, Name: 'Child of k6', Origin: 'Declared', Status: 'Approved', ParentID: 'k6' },
        { ID: 'k8', GraphID: KNOWLEDGE_GRAPH, Name: 'Auto-approved in Knowledge', Origin: 'Inferred', Status: 'Approved', ParentID: null },
    ];
    const deletedEdges: Array<{ ID: string; InScope: boolean }> = [];
    const deletedConcepts: string[] = [];
    return { edges, concepts, deletedEdges, deletedConcepts };
}

type World = ReturnType<typeof world>;

function inValues(filter: string, field: string): string[] {
    const m = new RegExp(`\\[${field}\\] IN \\(([^)]*)\\)`).exec(filter);
    return m ? Array.from(m[1].matchAll(/'([^']*)'/g)).map((x) => x[1]) : [];
}

function touches(row: EdgeRow, entityID: string, ids: string[]): boolean {
    return (row.SourceEntityID === entityID && ids.includes(row.SourceRecordID)) || (row.TargetEntityID === entityID && ids.includes(row.TargetRecordID));
}

function edgeObject(row: EdgeRow, w: World): object {
    return {
        ...row,
        LatestResult: { CompleteMessage: '' },
        Delete: async () => {
            await Promise.resolve(); // the scope must survive an await inside the delete
            const inScope = ServerOperationScopeManager.Instance.IsOperationActive([GRAPH_PIPELINE_EVIDENCE_RETRACTION_OPERATION], 'MJ: Graph Edges', user);
            w.deletedEdges.push({ ID: row.ID, InScope: inScope });
            w.edges.splice(w.edges.indexOf(row), 1);
            return true;
        },
    };
}

function readEdges(params: RunViewParams, w: World): object[] {
    const filter = String(params.ExtraFilter ?? '');
    if (filter.includes("[EdgeType] = 'SourcedFrom'")) {
        const ids = inValues(filter, 'SourceRecordID');
        return w.edges.filter((e) => e.EdgeType === 'SourcedFrom' && e.SourceEntityID === CONCEPTS && ids.includes(e.SourceRecordID)).map((e) => ({ ...e }));
    }
    const entityID = /\[SourceEntityID\] = '([^']+)'/.exec(filter)?.[1] ?? '';
    const ids = inValues(filter, 'SourceRecordID');
    const inferredOnly = filter.includes("[Origin] = 'Inferred'");
    return w.edges.filter((e) => touches(e, entityID, ids) && (!inferredOnly || e.Origin === 'Inferred')).map((e) => edgeObject(e, w));
}

function readConcepts(params: RunViewParams, w: World): object[] {
    const filter = String(params.ExtraFilter ?? '');
    if (filter.startsWith('[ParentID]')) {
        const ids = inValues(filter, 'ParentID');
        return w.concepts.filter((c) => c.ParentID && ids.includes(c.ParentID)).map((c) => ({ ID: c.ID, ParentID: c.ParentID }));
    }
    const ids = inValues(filter, 'ID');
    return w.concepts
        .filter((c) => ids.includes(c.ID) && c.Origin === 'Inferred')
        .map((c) => ({ ...c, LatestResult: { CompleteMessage: '' }, Delete: async () => (w.deletedConcepts.push(c.ID), true) }));
}

function makeProvider(w: World): IMetadataProvider {
    const runView = async (params: RunViewParams) => {
        const rows =
            params.EntityName === 'MJ: Graph Edges'
                ? readEdges(params, w)
                : params.EntityName === 'MJ: Graph Concepts'
                  ? readConcepts(params, w)
                  : params.EntityName === 'MJ: Graphs'
                    ? [{ ID: KNOWLEDGE_GRAPH, GraphTypeID: 'type-knowledge' }, { ID: CANON_GRAPH, GraphTypeID: 'type-canon' }]
                    : params.EntityName === 'MJ: Graph Types'
                      ? [{ ID: 'type-knowledge', IsCanon: false }, { ID: 'type-canon', IsCanon: true }]
                      : [];
        return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    };
    const provider = {
        EntityByName: (name: string) =>
            name === 'MJ: Content Item Chunks'
                ? { ID: CHUNKS, Name: name }
                : name === 'MJ: Graph Concepts'
                  ? { ID: CONCEPTS, Name: name }
                  : name === 'MJ: Content Items'
                    ? { ID: ITEMS, Name: name }
                    : undefined,
        RunView: runView,
        RunViews: async (list: RunViewParams[]) => Promise.all(list.map((p) => runView(p))),
    };
    return provider as unknown as IMetadataProvider;
}

describe('GraphEvidenceRetractor', () => {
    it('removes the inferred edges of a deleted chunk inside the retraction scope, and keeps declared ones', async () => {
        const w = world();
        await new GraphEvidenceRetractor(makeProvider(w), user).RetractChunks(['c1']);
        const chunkEdgeIDs = ['e-k1-c1', 'e-k2-c1', 'e-c1-k2', 'e-k4-c1', 'e-k5-c1', 'e-k6-c1', 'e-k8-c1'];
        expect(w.deletedEdges.filter((d) => chunkEdgeIDs.includes(d.ID)).map((d) => d.ID).sort()).toEqual([...chunkEdgeIDs].sort());
        expect(w.deletedEdges.every((d) => d.InScope)).toBe(true);
        expect(w.edges.map((e) => e.ID)).toContain('e-x-c1');
        expect(w.edges.map((e) => e.ID)).toContain('e-k2-c2');
    });

    it('removes a concept left with no source when it is Inferred, childless, not connected by a person and not Approved in Canon', async () => {
        const w = world();
        const result = await new GraphEvidenceRetractor(makeProvider(w), user).RetractChunks(['c1']);
        // k1 (Proposed) and k8 (auto-approved in a Knowledge graph) go; k4 (Approved in Canon), k5
        // (a Declared edge), k6 (a child) and k2 (still sourced from c2) stay.
        expect([...w.deletedConcepts].sort()).toEqual(['k1', 'k8']);
        // Their remaining inferred edges go with them.
        expect(w.deletedEdges.map((d) => d.ID)).toEqual(expect.arrayContaining(['e-k1-k3', 'e-i1-k8']));
        expect(w.edges.map((e) => e.ID)).toEqual(expect.arrayContaining(['e-k5-x', 'e-i1-k2']));
        expect(result).toEqual({ EdgesRemoved: 9, ConceptsRemoved: 2 });
    });

    it("retracts a content item's Mentions edges, keeping a concept that is still sourced", async () => {
        const w = world();
        const result = await new GraphEvidenceRetractor(makeProvider(w), user).RetractContentItems(['i1']);
        expect(w.deletedEdges.map((d) => d.ID).sort()).toEqual(['e-i1-k2', 'e-i1-k8']);
        expect(w.deletedConcepts).toEqual([]);
        expect(result).toEqual({ EdgesRemoved: 2, ConceptsRemoved: 0 });
    });

    it('is idempotent: a second retraction of the same chunk finds nothing', async () => {
        const w = world();
        const retractor = new GraphEvidenceRetractor(makeProvider(w), user);
        await retractor.RetractChunks(['c1']);
        expect(await retractor.RetractChunks(['c1'])).toEqual({ EdgesRemoved: 0, ConceptsRemoved: 0 });
    });

    it('throws when an edge cannot be deleted, so the chunk stays pending', async () => {
        const w = world();
        const provider = makeProvider(w);
        const original = provider.RunView.bind(provider);
        (provider as unknown as { RunView: typeof original }).RunView = async (params, u) => {
            const result = await original(params, u);
            if (params.EntityName === 'MJ: Graph Edges' && !String(params.ExtraFilter).includes('SourcedFrom')) {
                for (const row of result.Results as Array<{ Delete: () => Promise<boolean> }>) {
                    row.Delete = async () => false;
                }
            }
            return result;
        };
        await expect(new GraphEvidenceRetractor(provider, user).RetractChunks(['c1'])).rejects.toThrow(/could not delete graph edge/);
    });
});
