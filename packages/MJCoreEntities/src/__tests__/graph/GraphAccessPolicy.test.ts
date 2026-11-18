/**
 * Graph access policies: node policies (Extend, Redacted, Replace), edge policies, fail-closed
 * behaviour, and the built-in provenance policies that make a derived node (concept, chunk, content
 * item) follow the visibility of the record it came from.
 *
 * Driven through GraphEngine's public API against the user-aware fake provider, so every read the
 * policies make runs as the viewer and row-level security (`HiddenFor`) applies.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GraphEngine } from '../../graph/GraphEngine';
import {
    BaseGraphEdgeAccessPolicy,
    BaseGraphNodeAccessPolicy,
    GraphAccessPolicyRegistry,
    LoadGraphEdgeProviders,
    type GraphAccessPolicyContext,
    type GraphAccessPolicyMode,
    type GraphEdgeView,
    type GraphNodeAccessDecision,
    type GraphNodeRef,
    type GraphNodeView,
    type GraphPolicyNode,
} from '../../graph';
import { QueryEngine } from '../../engines/QueryEngine';
import { CanonMetadataRows, FakeGraphProvider, IDS, MakeUser, StandardEntitySpecs, StoredEdge, type FakeEntitySpec, type FakeRow } from './graphTestFixtures';

const analyst = MakeUser('u-analyst', ['Analyst']);
const executive = MakeUser('u-exec', ['Analyst', 'Executive']);

const P = {
    Documents: 'a0000000-0000-4000-8000-000000000001',
    RecordDocs: 'a0000000-0000-4000-8000-000000000002',
    Items: 'a0000000-0000-4000-8000-000000000003',
    Chunks: 'a0000000-0000-4000-8000-000000000004',
    GraphTypeKnowledge: 'a0000000-0000-4000-8000-000000000005',
    GraphKnowledge: 'a0000000-0000-4000-8000-000000000006',
    EdgeTypeSourcedFrom: 'a0000000-0000-4000-8000-000000000007',
    DocPublic: 'd0000000-0000-4000-8000-000000000001',
    DocPrivate: 'd0000000-0000-4000-8000-000000000002',
    ErdPublic: 'e1000000-0000-4000-8000-000000000001',
    ErdPrivate: 'e1000000-0000-4000-8000-000000000002',
    ItemPublic: 'c1000000-0000-4000-8000-000000000001',
    ItemPrivate: 'c1000000-0000-4000-8000-000000000002',
    ItemUpload: 'c1000000-0000-4000-8000-000000000003',
    ChunkPublic: 'c2000000-0000-4000-8000-000000000001',
    ChunkPrivate: 'c2000000-0000-4000-8000-000000000002',
    ConceptPrivate: 'c3000000-0000-4000-8000-000000000001',
    ConceptMixed: 'c3000000-0000-4000-8000-000000000002',
    ConceptCanonPrivate: 'c3000000-0000-4000-8000-000000000003',
    ConceptAuthored: 'c3000000-0000-4000-8000-000000000004',
    ConceptOrphaned: 'c3000000-0000-4000-8000-0000000000aa',
    ConceptProposedCanonPrivate: 'c3000000-0000-4000-8000-000000000005',
} as const;

function provenanceSpecs(): FakeEntitySpec[] {
    return [
        ...StandardEntitySpecs(),
        { ID: P.Documents, Name: 'Documents', NameField: 'Title' },
        { ID: P.RecordDocs, Name: 'MJ: Entity Record Documents' },
        { ID: P.Items, Name: 'MJ: Content Items', NameField: 'Name' },
        { ID: P.Chunks, Name: 'MJ: Content Item Chunks' },
    ];
}

function sourcedFrom(conceptId: string, graphId: string, chunkId: string): FakeRow {
    return StoredEdge(
        graphId,
        P.EdgeTypeSourcedFrom,
        'SourcedFrom',
        { EntityID: IDS.ConceptMeta, EntityName: 'MJ: Graph Concepts', RecordID: conceptId },
        { EntityID: P.Chunks, EntityName: 'MJ: Content Item Chunks', RecordID: chunkId },
        0.8,
    );
}

function concept(
    id: string,
    graphId: string,
    status: 'Approved' | 'Proposed',
    name: string,
    origin: 'Declared' | 'Inferred' = 'Inferred',
): FakeRow {
    return { ID: id, GraphID: graphId, Graph: '', Name: name, Description: `${name} description`, ConceptType: 'Term', Status: status, Origin: origin };
}

function provenanceRows(): Record<string, FakeRow[]> {
    const base = CanonMetadataRows();
    return {
        ...base,
        'MJ: Graph Types': [...base['MJ: Graph Types'], { ID: P.GraphTypeKnowledge, Name: 'Knowledge', IsCanon: false, Status: 'Active' }],
        'MJ: Graphs': [
            ...base['MJ: Graphs'],
            { ID: P.GraphKnowledge, Name: 'Library Knowledge', GraphTypeID: P.GraphTypeKnowledge, GraphType: 'Knowledge', LoadMode: 'OnDemand', Status: 'Active' },
        ],
        'MJ: Graph Concepts': [
            ...base['MJ: Graph Concepts'],
            concept(P.ConceptPrivate, P.GraphKnowledge, 'Approved', 'Private Pricing'),
            concept(P.ConceptMixed, P.GraphKnowledge, 'Approved', 'Shared Pricing'),
            concept(P.ConceptCanonPrivate, IDS.GraphCanon, 'Approved', 'Approved Canon Policy'),
            concept(P.ConceptProposedCanonPrivate, IDS.GraphCanon, 'Proposed', 'Proposed Canon Policy'),
            concept(P.ConceptAuthored, P.GraphKnowledge, 'Approved', 'Authored Concept', 'Declared'),
            concept(P.ConceptOrphaned, P.GraphKnowledge, 'Approved', 'Orphaned Concept', 'Inferred'),
        ],
        'MJ: Graph Edges': [
            sourcedFrom(P.ConceptPrivate, P.GraphKnowledge, P.ChunkPrivate),
            sourcedFrom(P.ConceptMixed, P.GraphKnowledge, P.ChunkPrivate),
            sourcedFrom(P.ConceptMixed, P.GraphKnowledge, P.ChunkPublic),
            sourcedFrom(P.ConceptCanonPrivate, IDS.GraphCanon, P.ChunkPrivate),
            sourcedFrom(P.ConceptProposedCanonPrivate, IDS.GraphCanon, P.ChunkPrivate),
        ],
        Documents: [
            { ID: P.DocPublic, Title: 'Public Handbook' },
            { ID: P.DocPrivate, Title: 'Board Pricing Memo' },
        ],
        'MJ: Entity Record Documents': [
            { ID: P.ErdPublic, EntityID: P.Documents, RecordID: P.DocPublic },
            { ID: P.ErdPrivate, EntityID: P.Documents, RecordID: P.DocPrivate },
        ],
        'MJ: Content Items': [
            { ID: P.ItemPublic, Name: 'Public Handbook', EntityRecordDocumentID: P.ErdPublic },
            { ID: P.ItemPrivate, Name: 'Board Pricing Memo', EntityRecordDocumentID: P.ErdPrivate },
            { ID: P.ItemUpload, Name: 'Uploaded PDF', EntityRecordDocumentID: null },
        ],
        'MJ: Content Item Chunks': [
            { ID: P.ChunkPublic, ContentItemID: P.ItemPublic },
            { ID: P.ChunkPrivate, ContentItemID: P.ItemPrivate },
        ],
        Contacts: [
            { ID: 'ct-1', FullName: 'Ada' },
            { ID: 'ct-2', FullName: 'Grace' },
            { ID: 'ct-3', FullName: 'Linus' },
        ],
        SecretDeals: [{ ID: 'deal-1', Title: 'Project Falcon' }],
        AccountContacts: [{ ID: 'acx-1' }],
    };
}

/** One fake for the whole file: engines bind the first provider they are configured with. */
const sharedProvider = new FakeGraphProvider(provenanceSpecs());

async function engineWith(rows: Record<string, FakeRow[]>): Promise<{ engine: GraphEngine; provider: FakeGraphProvider }> {
    const provider = sharedProvider.Reset(rows, provenanceSpecs());
    // The analyst cannot read the private document (row-level security); the executive can.
    provider.HiddenFor[analyst.ID] = [`Documents|${P.DocPrivate}`];
    await GraphEngine.Instance.Config(true, analyst, provider as unknown as IMetadataProvider);
    return { engine: GraphEngine.Instance, provider };
}

async function visibleRecordIds(engine: GraphEngine, nodes: GraphNodeRef[], user: UserInfo, includeProposed = false): Promise<string[]> {
    const visible = await engine.FilterNodesForUser(nodes, user, undefined, { IncludeProposed: includeProposed });
    return Array.from(visible.values())
        .map((v) => v.RecordID)
        .sort();
}

const conceptRef = (id: string): GraphNodeRef => ({ EntityName: 'MJ: Graph Concepts', RecordID: id });

// ----- Test policies ---------------------------------------------------------------------------------

/** What the Contacts test policy decides per record ID; mutated per test. */
const contactDecisions = new Map<string, GraphNodeAccessDecision>();
let contactsPolicyThrows = false;

class ContactsTestPolicy extends BaseGraphNodeAccessPolicy {
    public async FilterNodes(nodes: readonly GraphPolicyNode[]): Promise<Map<string, GraphNodeAccessDecision>> {
        if (contactsPolicyThrows) {
            throw new Error('policy store unavailable');
        }
        return new Map(nodes.map((n) => [n.Key, contactDecisions.get(n.Ref.RecordID) ?? 'Visible']));
    }
}
MJGlobal.Instance.ClassFactory.Register(BaseGraphNodeAccessPolicy, ContactsTestPolicy, 'Contacts');

/** Replaces the default check for SecretDeals, which only Executives may read by permission. */
class SecretDealsReplacePolicy extends BaseGraphNodeAccessPolicy {
    public override get Mode(): GraphAccessPolicyMode {
        return 'Replace';
    }
    public override async ReadNodes(nodes: readonly GraphPolicyNode[]): Promise<Map<string, GraphNodeView>> {
        return new Map(
            nodes.map((n) => [n.Key, { Key: n.Key, EntityName: 'SecretDeals', RecordID: n.Ref.RecordID, Label: 'Shared deal', Icon: null, Description: null }]),
        );
    }
    public async FilterNodes(nodes: readonly GraphPolicyNode[]): Promise<Map<string, GraphNodeAccessDecision>> {
        return new Map(nodes.map((n) => [n.Key, 'Visible' as const]));
    }
}
MJGlobal.Instance.ClassFactory.Register(BaseGraphNodeAccessPolicy, SecretDealsReplacePolicy, 'SecretDeals');

/** Registered but cannot be created: whatever it governs must be hidden, not left to the default. */
class BrokenPolicy extends BaseGraphNodeAccessPolicy {
    public constructor() {
        super();
        throw new Error('cannot construct');
    }
    public async FilterNodes(): Promise<Map<string, GraphNodeAccessDecision>> {
        return new Map();
    }
}
MJGlobal.Instance.ClassFactory.Register(BaseGraphNodeAccessPolicy, BrokenPolicy, 'AccountContacts');

/** Hides every `Related To` edge whose weight is below 0.6. */
class RelatedToEdgePolicy extends BaseGraphEdgeAccessPolicy {
    public async FilterEdges(edges: readonly GraphEdgeView[], ctx: GraphAccessPolicyContext): Promise<Set<string>> {
        RelatedToEdgePolicy.Principals.push(ctx.Principal.ID);
        return new Set(edges.filter((e) => e.Weight >= 0.6).map((e) => e.ID));
    }
    public static Principals: string[] = [];
}
MJGlobal.Instance.ClassFactory.Register(BaseGraphEdgeAccessPolicy, RelatedToEdgePolicy, 'Related To');

describe('Graph access policies', () => {
    beforeEach(() => {
        LoadGraphEdgeProviders();
        vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockReturnValue(undefined);
        contactDecisions.clear();
        contactsPolicyThrows = false;
        RelatedToEdgePolicy.Principals = [];
    });

    describe('node policies', () => {
        it('an Extend policy can hide and redact nodes the default check let through', async () => {
            const { engine } = await engineWith(provenanceRows());
            contactDecisions.set('ct-2', 'Hidden');
            contactDecisions.set('ct-3', 'Redacted');
            const refs = ['ct-1', 'ct-2', 'ct-3'].map((id) => ({ EntityName: 'Contacts', RecordID: id }));
            const visible = await engine.FilterNodesForUser(refs, analyst);
            const byId = new Map(Array.from(visible.values()).map((v) => [v.RecordID, v]));
            expect(Array.from(byId.keys()).sort()).toEqual(['ct-1', 'ct-3']);
            expect(byId.get('ct-1')!.Label).toBe('Ada');
            expect(byId.get('ct-3')!.Label).not.toBe('Linus');
            expect(byId.get('ct-3')!.Description).toBeNull();
        });

        it('a policy that throws hides every node it governs', async () => {
            const { engine } = await engineWith(provenanceRows());
            contactsPolicyThrows = true;
            const refs = ['ct-1', 'ct-2'].map((id) => ({ EntityName: 'Contacts', RecordID: id }));
            expect(await visibleRecordIds(engine, refs, analyst)).toEqual([]);
        });

        it('a registered policy that cannot be created hides its nodes instead of falling back to the default', async () => {
            const { engine } = await engineWith(provenanceRows());
            expect(GraphAccessPolicyRegistry.GetNodePolicy('AccountContacts')).not.toBeNull();
            expect(await visibleRecordIds(engine, [{ EntityName: 'AccountContacts', RecordID: 'acx-1' }], analyst)).toEqual([]);
        });

        it('a Replace policy decides on its own, skipping the default permission check', async () => {
            const { engine } = await engineWith(provenanceRows());
            const visible = await engine.FilterNodesForUser([{ EntityName: 'SecretDeals', RecordID: 'deal-1' }], analyst);
            const views = Array.from(visible.values());
            expect(views).toHaveLength(1);
            expect(views[0].Label).toBe('Shared deal');
        });

        it('entities with no policy keep the default check', async () => {
            expect(GraphAccessPolicyRegistry.GetNodePolicy('Accounts')).toBeNull();
        });
    });

    describe('edge policies', () => {
        it('an edge policy narrows edges for every principal', async () => {
            const rows = provenanceRows();
            rows['Accounts'] = [
                { ID: 'acc-1', Name: 'Acme' },
                { ID: 'acc-2', Name: 'Globex' },
            ];
            const seed = { EntityID: IDS.ConceptMeta, EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptOpenAr };
            rows['MJ: Graph Edges'] = [
                StoredEdge(IDS.GraphNetwork, IDS.EdgeTypeRelated, 'Related To', seed, { EntityID: IDS.Accounts, EntityName: 'Accounts', RecordID: 'acc-1' }, 0.9, 'Approved', 'e0000000-0000-4000-8000-0000000000a1'),
                StoredEdge(IDS.GraphNetwork, IDS.EdgeTypeRelated, 'Related To', seed, { EntityID: IDS.Accounts, EntityName: 'Accounts', RecordID: 'acc-2' }, 0.3, 'Approved', 'e0000000-0000-4000-8000-0000000000a2'),
            ];
            const { engine } = await engineWith(rows);
            const edges = await engine.GetEdges('Member Network', { EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptOpenAr }, { AudienceReaders: [executive] }, analyst);
            expect(edges.map((e) => e.Target.RecordID)).toEqual(['acc-1']);
            expect(new Set(RelatedToEdgePolicy.Principals)).toEqual(new Set([analyst.ID, executive.ID]));
        });
    });

    describe('provenance policies', () => {
        it('hides a chunk and its content item when the viewer cannot read the source document', async () => {
            const { engine } = await engineWith(provenanceRows());
            const refs: GraphNodeRef[] = [
                { EntityName: 'MJ: Content Item Chunks', RecordID: P.ChunkPublic },
                { EntityName: 'MJ: Content Item Chunks', RecordID: P.ChunkPrivate },
                { EntityName: 'MJ: Content Items', RecordID: P.ItemPrivate },
                { EntityName: 'MJ: Content Items', RecordID: P.ItemUpload },
            ];
            expect(await visibleRecordIds(engine, refs, analyst)).toEqual([P.ItemUpload, P.ChunkPublic].sort());
            expect(await visibleRecordIds(engine, refs, executive)).toEqual([P.ItemPrivate, P.ItemUpload, P.ChunkPublic, P.ChunkPrivate].sort());
        });

        it('hides a concept synthesized only from a private document, but not from someone who can read it', async () => {
            const { engine } = await engineWith(provenanceRows());
            expect(await visibleRecordIds(engine, [conceptRef(P.ConceptPrivate)], analyst)).toEqual([]);
            expect(await visibleRecordIds(engine, [conceptRef(P.ConceptPrivate)], executive)).toEqual([P.ConceptPrivate]);
        });

        it('redacts a concept when only some of its sources are visible, since its text can quote any of them', async () => {
            const { engine } = await engineWith(provenanceRows());
            const visible = Array.from((await engine.FilterNodesForUser([conceptRef(P.ConceptMixed)], analyst)).values());
            expect(visible.map((v) => v.RecordID)).toEqual([P.ConceptMixed]);
            expect(visible[0].Label).not.toBe('Shared Pricing');
            expect(visible[0].Description).toBeNull();

            const forExecutive = Array.from((await engine.FilterNodesForUser([conceptRef(P.ConceptMixed)], executive)).values());
            expect(forExecutive[0].Label).toBe('Shared Pricing');
        });

        it('shows an Approved Canon concept even when every source is private, but not a Proposed one', async () => {
            const { engine } = await engineWith(provenanceRows());
            const refs = [conceptRef(P.ConceptCanonPrivate), conceptRef(P.ConceptProposedCanonPrivate)];
            expect(await visibleRecordIds(engine, refs, analyst, true)).toEqual([P.ConceptCanonPrivate]);
        });

        it('shows an authored concept that has no recorded sources', async () => {
            const { engine } = await engineWith(provenanceRows());
            expect(await visibleRecordIds(engine, [conceptRef(P.ConceptAuthored)], analyst)).toEqual([P.ConceptAuthored]);
        });

        it('hides a synthesized concept whose sources were all retracted, instead of treating it as authored', async () => {
            const { engine } = await engineWith(provenanceRows());
            expect(await visibleRecordIds(engine, [conceptRef(P.ConceptOrphaned)], executive)).toEqual([]);
        });

        it('applies the audience intersection: a concept shared with a reader who cannot see its source is hidden', async () => {
            const { engine } = await engineWith(provenanceRows());
            const visible = await engine.FilterNodesForUser([conceptRef(P.ConceptPrivate)], executive, [analyst]);
            expect(visible.size).toBe(0);
        });

        it('reads provenance as the viewer, in batches, never once per node', async () => {
            const { engine, provider } = await engineWith(provenanceRows());
            await engine.FilterNodesForUser([conceptRef(P.ConceptPrivate), conceptRef(P.ConceptMixed), conceptRef(P.ConceptAuthored)], analyst);
            const policyEdgeReads = provider.PolicyReadsOf('MJ: Graph Edges');
            expect(policyEdgeReads).toHaveLength(1);
            expect(policyEdgeReads[0].UserID).toBe(analyst.ID);
            expect(provider.ReadLog.filter((r) => r.EntityName === 'MJ: Entity Record Documents').every((r) => r.UserID === analyst.ID)).toBe(true);
        });
    });
});
