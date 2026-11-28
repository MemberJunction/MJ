/**
 * EntityGraphOverlayStore: the edges the Graph stage synthesizes are saved inside the
 * `GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION` server operation scope, bound to the run's user, so
 * `MJGraphEdgeEntityServer` can accept the content source's policy-approved `Inferred` edges for a run
 * user who holds no `Graph: Approve Edges` (and nothing outside the save sees the scope).
 */
import { describe, expect, it } from 'vitest';
import { ServerOperationScopeManager, type IMetadataProvider, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION, type MJGraphConceptEntity, type MJGraphEdgeEntity } from '@memberjunction/core-entities';
import type { SynthesizedGraphConcept, SynthesizedGraphEdge } from '@memberjunction/content-pipeline-base';
import { EntityGraphOverlayStore } from '../stages/EntityGraphOverlayStore.js';

const GRAPH_ID = '9C1E2F00-0000-4000-8000-000000000001';
const CONCEPT_ID = '9C1E2F00-0000-4000-8000-000000000002';
const CONTENT_ITEM_ID = '9C1E2F00-0000-4000-8000-000000000003';

const runUser = { ID: '9C1E2F00-0000-4000-8000-0000000000AA', Name: 'Uploader', UserRoles: [] } as unknown as UserInfo;

/** What one edge save saw: its field values and whether the pipeline's approval scope was active for its user. */
interface SaveRecord {
    Origin: string;
    Status: string;
    InScope: boolean;
}

/** Stand-in for the `MJ: Graph Edges` entity object `UpsertEdges` fills and saves. */
class RecordingEdge {
    public GraphID = '';
    public EdgeTypeID = '';
    public SourceEntityID = '';
    public SourceRecordID = '';
    public TargetEntityID = '';
    public TargetRecordID = '';
    public Weight = 0;
    public Confidence: number | null = null;
    public Origin = '';
    public Status = '';
    public Description: string | null = null;
    public Attributes: string | null = null;
    public LatestResult = { CompleteMessage: '' };

    public constructor(private readonly user: UserInfo, private readonly saves: SaveRecord[]) {}

    public NewRecord(): boolean {
        return true;
    }

    public async Save(): Promise<boolean> {
        await Promise.resolve(); // the scope must survive an await inside the save
        this.saves.push({
            Origin: this.Origin,
            Status: this.Status,
            InScope: ServerOperationScopeManager.Instance.IsOperationActive([GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION], 'MJ: Graph Edges', this.user),
        });
        return true;
    }
}

const ENTITY_IDS = {
    Concepts: '9C1E2F00-0000-4000-8000-0000000000E1',
    Items: '9C1E2F00-0000-4000-8000-0000000000E2',
    Queries: '9C1E2F00-0000-4000-8000-0000000000E3',
} as const;
const EDGE_TYPE_IDS = {
    SourcedFrom: '9C1E2F00-0000-4000-8000-0000000000F1',
    Measures: '9C1E2F00-0000-4000-8000-0000000000F2',
} as const;
const QUERY_ID = '9C1E2F00-0000-4000-8000-000000000004';

/** `MJ: Graph Edge Type Endpoints` rows: Measures runs from a query to a concept. */
const MEASURES_ENDPOINTS = [
    { EdgeTypeID: EDGE_TYPE_IDS.Measures, Side: 'Source', EntityID: ENTITY_IDS.Queries },
    { EdgeTypeID: EDGE_TYPE_IDS.Measures, Side: 'Target', EntityID: ENTITY_IDS.Concepts },
];

function viewResult(rows: unknown[]): RunViewResult {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
}

function makeProvider(saves: SaveRecord[], endpoints: unknown[] = MEASURES_ENDPOINTS): IMetadataProvider {
    const entities = [
        { ID: ENTITY_IDS.Concepts, Name: 'MJ: Graph Concepts' },
        { ID: ENTITY_IDS.Items, Name: 'MJ: Content Items' },
        { ID: ENTITY_IDS.Queries, Name: 'MJ: Queries' },
    ];
    const rowsFor = (params: RunViewParams): unknown[] => {
        if (params.EntityName === 'MJ: Graph Edge Types') {
            return [
                { ID: EDGE_TYPE_IDS.SourcedFrom, Name: 'Sourced From', GraphID: null },
                { ID: EDGE_TYPE_IDS.Measures, Name: 'Measures', GraphID: null },
            ];
        }
        return params.EntityName === 'MJ: Graph Edge Type Endpoints' ? endpoints : [];
    };
    const provider = {
        Entities: entities,
        EntityByName: (name: string) => entities.find((e) => e.Name.toLowerCase() === name.trim().toLowerCase()),
        RunView: async (params: RunViewParams): Promise<RunViewResult> => viewResult(rowsFor(params)),
        RunViews: async (params: RunViewParams[]): Promise<RunViewResult[]> => params.map((p) => viewResult(rowsFor(p))),
        GetEntityObject: async (_entityName: string, user: UserInfo): Promise<MJGraphEdgeEntity> =>
            new RecordingEdge(user, saves) as unknown as MJGraphEdgeEntity,
    };
    return provider as unknown as IMetadataProvider;
}

function measures(sourceIsConcept: boolean): SynthesizedGraphEdge {
    const concept = { Entity: 'MJ: Graph Concepts', ID: CONCEPT_ID };
    const query = { Entity: 'MJ: Queries', ID: QUERY_ID };
    const [source, target] = sourceIsConcept ? [concept, query] : [query, concept];
    return {
        EdgeTypeName: 'Measures',
        SourceEntityName: source.Entity,
        SourceRecordID: source.ID,
        TargetEntityName: target.Entity,
        TargetRecordID: target.ID,
        Weight: 0.9,
        Confidence: 0.8,
        Description: 'query measures concept',
    };
}

function sourcedFrom(): SynthesizedGraphEdge {
    return {
        EdgeTypeName: 'SourcedFrom',
        SourceEntityName: 'MJ: Graph Concepts',
        SourceRecordID: CONCEPT_ID,
        TargetEntityName: 'MJ: Content Items',
        TargetRecordID: CONTENT_ITEM_ID,
        Weight: 0.9,
        Confidence: 0.8,
        Description: 'concept sourced from item',
    };
}

describe('EntityGraphOverlayStore.UpsertEdges', () => {
    it('saves each synthesized edge inside the pipeline approval scope, bound to the run user', async () => {
        const saves: SaveRecord[] = [];
        const saved = await new EntityGraphOverlayStore().UpsertEdges(GRAPH_ID, CONCEPT_ID, [sourcedFrom()], 'Approved', runUser, makeProvider(saves));
        expect(saved).toBe(1);
        expect(saves).toEqual([{ Origin: 'Inferred', Status: 'Approved', InScope: true }]);
    });

    it('leaves no scope behind once the save is done', async () => {
        await new EntityGraphOverlayStore().UpsertEdges(GRAPH_ID, CONCEPT_ID, [sourcedFrom()], 'Approved', runUser, makeProvider([]));
        expect(ServerOperationScopeManager.Instance.IsOperationActive([GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION], 'MJ: Graph Edges', runUser)).toBe(false);
    });
});

describe('EntityGraphOverlayStore.UpsertEdges — the edge-type contract is checked before writing', () => {
    it('writes an edge whose endpoints the type allows (query -> concept for Measures)', async () => {
        const saves: SaveRecord[] = [];
        const store = new EntityGraphOverlayStore();
        expect(await store.UpsertEdges(GRAPH_ID, CONCEPT_ID, [measures(false)], 'Proposed', runUser, makeProvider(saves))).toBe(1);
        expect(saves).toHaveLength(1);
        expect(store.RejectedEdgeCount).toBe(0);
    });

    it('refuses an edge that breaks its endpoint rows and never calls Save() for it', async () => {
        const saves: SaveRecord[] = [];
        const store = new EntityGraphOverlayStore();
        const written = await store.UpsertEdges(GRAPH_ID, CONCEPT_ID, [measures(true), sourcedFrom()], 'Proposed', runUser, makeProvider(saves));
        expect(written).toBe(1); // only the SourcedFrom edge, which has no endpoint rows
        expect(saves).toHaveLength(1);
        expect(store.RejectedEdgeCount).toBe(1);
    });

    it('refuses an edge type with no seeded row instead of skipping it silently', async () => {
        const saves: SaveRecord[] = [];
        const store = new EntityGraphOverlayStore();
        const unknown: SynthesizedGraphEdge = { ...sourcedFrom(), EdgeTypeName: 'Related To Something Else' };
        expect(await store.UpsertEdges(GRAPH_ID, CONCEPT_ID, [unknown], 'Proposed', runUser, makeProvider(saves))).toBe(0);
        expect(saves).toEqual([]);
        expect(store.RejectedEdgeCount).toBe(1);
    });

    it('lets any endpoint through when the type has no endpoint rows', async () => {
        const saves: SaveRecord[] = [];
        const store = new EntityGraphOverlayStore();
        expect(await store.UpsertEdges(GRAPH_ID, CONCEPT_ID, [measures(true)], 'Proposed', runUser, makeProvider(saves, []))).toBe(1);
        expect(store.RejectedEdgeCount).toBe(0);
    });
});

interface ConceptSaveRecord {
    Name: string;
    Status: string;
    InScope: boolean;
}

class RecordingConcept {
    public ID = '';
    public GraphID = '';
    public ParentID: string | null = null;
    public Name = '';
    public ConceptTypeID = '';
    public AuthorityTierID: string | null = null;
    public Description = '';
    public Specification: string | null = null;
    public Synonyms: string | null = null;
    public Status: MJGraphConceptEntity['Status'] = 'Draft';
    public LatestResult = { CompleteMessage: '' };

    public constructor(
        private readonly user: UserInfo,
        private readonly saves: ConceptSaveRecord[],
        private readonly existingById: ReadonlyMap<string, { Name: string; Status: MJGraphConceptEntity['Status'] }>,
    ) {}

    public async InnerLoad(key: { GetValueByIndex(idx: number): unknown }): Promise<boolean> {
        const id = String(key.GetValueByIndex(0) ?? '');
        const found = this.existingById.get(id);
        if (!found) {
            return false;
        }
        this.ID = id;
        this.Name = found.Name;
        this.Status = found.Status;
        return true;
    }

    public NewRecord(): boolean {
        this.ID = CONCEPT_ID;
        return true;
    }

    public async Save(): Promise<boolean> {
        await Promise.resolve();
        this.saves.push({
            Name: this.Name,
            Status: this.Status,
            InScope: ServerOperationScopeManager.Instance.IsOperationActive([GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION], 'MJ: Graph Concepts', this.user),
        });
        return true;
    }
}

function makeConceptProvider(
    saves: ConceptSaveRecord[],
    existingById: ReadonlyMap<string, { Name: string; Status: MJGraphConceptEntity['Status'] }> = new Map(),
): IMetadataProvider {
    const provider = {
        Entities: [],
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            if (params.EntityName === 'MJ: Graph Concept Types') {
                return {
                    Success: true,
                    Results: [{ ID: '9C1E2F00-0000-4000-8000-0000000000C1', Name: 'Policy', Description: null, Rank: 10, IconClass: null }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 0,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            if (params.EntityName === 'MJ: Graph Authority Tiers') {
                return {
                    Success: true,
                    Results: [{ ID: '9C1E2F00-0000-4000-8000-0000000000A1', Name: 'Reference', Description: null, Rank: 20, IconClass: null }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 0,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        },
        GetEntityObject: async (_entityName: string, user: UserInfo): Promise<MJGraphConceptEntity> =>
            new RecordingConcept(user, saves, existingById) as unknown as MJGraphConceptEntity,
    };
    return provider as unknown as IMetadataProvider;
}

function synthesizedConcept(existingId?: string): SynthesizedGraphConcept {
    return {
        Name: 'Grace Period',
        ConceptType: 'Policy',
        AuthorityTier: 'Reference',
        Description: 'Grace period rule.',
        Specification: '60 days.',
        Synonyms: ['Grace Window'],
        Confidence: 0.9,
        Citations: [],
        ExistingConceptID: existingId,
    };
}

describe('EntityGraphOverlayStore.UpsertConcept', () => {
    it('saves a newly created Approved concept inside the pipeline approval scope bound to the run user', async () => {
        const saves: ConceptSaveRecord[] = [];
        const id = await new EntityGraphOverlayStore().UpsertConcept(GRAPH_ID, synthesizedConcept(), 'Approved', runUser, makeConceptProvider(saves));
        expect(id).toBe(CONCEPT_ID);
        expect(saves).toEqual([{ Name: 'Grace Period', Status: 'Approved', InScope: true }]);
        expect(ServerOperationScopeManager.Instance.IsOperationActive([GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION], 'MJ: Graph Concepts', runUser)).toBe(false);
    });

    it('preserves existing Approved and Deprecated concepts without calling Save(), while still updating Proposed ones', async () => {
        for (const protectedStatus of ['Approved', 'Deprecated'] as const) {
            const saves: ConceptSaveRecord[] = [];
            const existing = new Map([[CONCEPT_ID, { Name: 'Grace Period', Status: protectedStatus }]]);
            const id = await new EntityGraphOverlayStore().UpsertConcept(GRAPH_ID, synthesizedConcept(CONCEPT_ID), 'Approved', runUser, makeConceptProvider(saves, existing));
            expect(id).toBe(CONCEPT_ID);
            expect(saves).toEqual([]);
        }

        const proposedSaves: ConceptSaveRecord[] = [];
        const existingProposed = new Map([[CONCEPT_ID, { Name: 'Grace Period', Status: 'Proposed' as const }]]);
        await new EntityGraphOverlayStore().UpsertConcept(GRAPH_ID, synthesizedConcept(CONCEPT_ID), 'Approved', runUser, makeConceptProvider(proposedSaves, existingProposed));
        expect(proposedSaves).toEqual([{ Name: 'Grace Period', Status: 'Proposed', InScope: true }]);
    });

    it('fails closed when ExistingConceptID is provided but cannot be loaded', async () => {
        const saves: ConceptSaveRecord[] = [];
        await expect(
            new EntityGraphOverlayStore().UpsertConcept(GRAPH_ID, synthesizedConcept(CONCEPT_ID), 'Approved', runUser, makeConceptProvider(saves, new Map())),
        ).rejects.toThrow(`Could not load existing MJ: Graph Concepts record '${CONCEPT_ID}'`);
        expect(saves).toEqual([]);
    });
});
