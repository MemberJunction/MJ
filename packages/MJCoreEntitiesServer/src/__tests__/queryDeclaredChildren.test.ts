/**
 * Declared child collections on `MJ: Queries` and the declared-rows-win hook.
 *
 * WHAT THIS PROTECTS
 *
 * - **A graph save writes the query, then its declared children, in one transaction**, and the
 *   extraction that runs after `super.Save()` in `MJQueryEntityServer.Save` runs once the children are
 *   written, with their keys as `DeclaredChildren`.
 * - **A declared row replaces the stored row extraction wrote for the same key**: the stored row is
 *   deleted inside the same transaction, before the declared row's insert, and the declared row keeps
 *   its own ID.
 * - **Authored rows are never touched**: a stored `Manual` row with the same key stays.
 * - **Extraction leaves declared rows alone**: the sync stage adds, updates and deletes nothing whose
 *   key the save declared.
 *
 * The entities run on real `BaseEntity` machinery over a minimal metadata fixture and a recording
 * provider; only the extraction pipeline, the embedding helper and the approval rules are stubbed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity, EntityInfo, Metadata, ProviderBase, RunViewResult } from '@memberjunction/core';
import type { IEntityDataProvider, RunViewParams, UserInfo, IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import type { MJQueryEntityEntity, MJQueryFieldEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import type { QuerySyncContext } from '../custom/query-extraction/types';

const { extractions } = vi.hoisted(() => ({
    extractions: [] as Array<{ ctx: QuerySyncContext; writtenBefore: string[] }>,
}));

vi.mock('../custom/query-extraction/pipeline', () => ({
    RunExtractionPipeline: vi.fn(async (ctx: QuerySyncContext) => {
        extractions.push({ ctx, writtenBefore: [...opLog] });
        return { UsesTemplate: false };
    }),
    CleanupQueryData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('../custom/util', () => ({ EmbedTextLocalHelper: vi.fn().mockResolvedValue(null) }));
vi.mock('../custom/approvalStamp', () => ({
    ApplyApprovalRulesAsync: vi.fn().mockResolvedValue(false),
    ApprovalRefusalResult: vi.fn(),
}));

import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import { SyncParameters } from '../custom/query-extraction/sync';
import { MJQueryParameterEntity as ParameterClass, MJQueryFieldEntity as FieldClass, MJQueryEntityEntity as QueryEntityClass } from '@memberjunction/core-entities';

// ─── Metadata fixture ──────────────────────────────────────────────────────

const USER = { ID: 'user-1', Name: 'Tester', Email: 't@example.com', UserRoles: [] };
type FieldSpec = [name: string, type: string];

const ENTITY_IDS: Record<string, string> = {
    'MJ: Queries': 'E0000000-0000-0000-0000-000000000001',
    'MJ: Query Parameters': 'E0000000-0000-0000-0000-000000000002',
    'MJ: Query Fields': 'E0000000-0000-0000-0000-000000000003',
    'MJ: Query Entities': 'E0000000-0000-0000-0000-000000000004',
};

/** EntityInfo init data: an `ID` primary key plus nullable columns, so validation never refuses. */
function entityData(name: string, fields: FieldSpec[]): Record<string, unknown> {
    const entityID = ENTITY_IDS[name];
    const all: FieldSpec[] = [['ID', 'uniqueidentifier'], ...fields];
    return {
        ID: entityID, Name: name, BaseTable: name, BaseView: `vw${name}`, SchemaName: '__mj',
        AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false,
        Fields: all.map(([fieldName, type], index) => ({
            ID: `${entityID}-${index}`, EntityID: entityID, Entity: name, Name: fieldName, Type: type,
            IsPrimaryKey: fieldName === 'ID', AllowsNull: fieldName !== 'ID', AutoIncrement: false,
            IsVirtual: false, AllowUpdateAPI: true, ValueListType: 'None', Sequence: index + 1, Status: 'Active',
            EntityFieldValues: [],
        })),
        Permissions: [],
        RelatedEntities: [],
    };
}

const QUERY_FIELDS: FieldSpec[] = [
    ['Name', 'nvarchar'], ['SQL', 'nvarchar'], ['Status', 'nvarchar'], ['Description', 'nvarchar'],
    ['UserQuestion', 'nvarchar'], ['UsesTemplate', 'bit'], ['SQLDialectID', 'uniqueidentifier'],
    ['EmbeddingVector', 'nvarchar'], ['EmbeddingVectorBinary', 'nvarchar'], ['EmbeddingModelID', 'uniqueidentifier'],
];
const CHILD_FIELDS: FieldSpec[] = [['QueryID', 'uniqueidentifier'], ['Name', 'nvarchar'], ['DetectionMethod', 'nvarchar']];
const QUERY_ENTITY_FIELDS: FieldSpec[] = [
    ['QueryID', 'uniqueidentifier'], ['EntityID', 'uniqueidentifier'], ['AlternateBaseViewID', 'uniqueidentifier'],
    ['DetectionMethod', 'nvarchar'],
];

let infos: Map<string, EntityInfo>;

// ─── Recording provider ────────────────────────────────────────────────────

/** Ordered log of writes and transaction boundaries. */
let opLog: string[] = [];
/** Rows the database holds, per entity, as plain field maps. */
let stored: Map<string, Record<string, unknown>[]>;

function describeRow(entity: BaseEntity): string {
    const key = entity.EntityInfo.Name === 'MJ: Query Entities' ? entity.Get('EntityID') : entity.Get('Name');
    return `${entity.EntityInfo.Name}:${String(key)}:${String(entity.Get('ID'))}`;
}

function makeProvider() {
    let depth = 0;
    const provider = {
        CurrentUser: USER,
        SupportsEntityTransactions: true,
        get IsInTransaction() { return depth > 0; },
        async BeginEntityTransaction() {
            depth++;
            opLog.push('begin');
            return {
                IsNested: depth > 1,
                async Commit() { opLog.push('commit'); depth--; },
                async Rollback() { opLog.push('rollback'); depth--; },
            };
        },
        async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
            return createEntity(entityName, provider) as T;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            opLog.push(`save ${describeRow(entity)}`);
            return entity.GetAll();
        },
        async Delete(entity: BaseEntity): Promise<boolean> {
            opLog.push(`delete ${describeRow(entity)}`);
            return true;
        },
        async RunViews(params: RunViewParams[]): Promise<RunViewResult[]> {
            return params.map(p => {
                const rows = stored.get(p.EntityName!) ?? [];
                const results = rows.map(row => {
                    const entity = createEntity(p.EntityName!, provider);
                    entity.LoadFromData(row);
                    return entity;
                });
                return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
            });
        },
        async RunView(params: RunViewParams): Promise<RunViewResult> {
            return (await provider.RunViews([params]))[0];
        },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

type Provider = ReturnType<typeof makeProvider>;

function createEntity(entityName: string, provider: Provider): BaseEntity {
    const info = infos.get(entityName)!;
    const dataProvider = provider as unknown as IEntityDataProvider;
    switch (entityName) {
        case 'MJ: Queries': return new MJQueryEntityServer(info, dataProvider);
        case 'MJ: Query Parameters': return new ParameterClass(info, dataProvider);
        case 'MJ: Query Fields': return new FieldClass(info, dataProvider);
        default: return new QueryEntityClass(info, dataProvider);
    }
}

beforeAll(() => {
    const entities = [
        entityData('MJ: Queries', QUERY_FIELDS),
        entityData('MJ: Query Parameters', CHILD_FIELDS),
        entityData('MJ: Query Fields', CHILD_FIELDS),
        entityData('MJ: Query Entities', QUERY_ENTITY_FIELDS),
    ].map(d => new EntityInfo(d));
    infos = new Map(entities.map(e => [e.Name, e]));
    Metadata.Provider = { Entities: entities, CurrentUser: USER } as unknown as ProviderBase;
    vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(true);
});

afterAll(() => {
    vi.restoreAllMocks();
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    opLog = [];
    extractions.length = 0;
    stored = new Map();
});

const QUERY_ID = 'A0000000-0000-0000-0000-00000000000A';
const DECLARED_ID = 'D0000000-0000-0000-0000-00000000000D';
const EXTRACTED_ID = 'B0000000-0000-0000-0000-00000000000B';
const ENTITY_A = 'C0000000-0000-0000-0000-0000000000C1';

function newQuery(provider: Provider): MJQueryEntityServer {
    const query = createEntity('MJ: Queries', provider) as MJQueryEntityServer;
    query.NewRecord();
    query.ID = QUERY_ID;
    query.Name = 'Orders By Region';
    query.SQL = 'SELECT Region FROM Orders WHERE Region = {{ region | sqlString }}';
    return query;
}

/** A saved query, as a later save sees it. */
function savedQuery(provider: Provider): MJQueryEntityServer {
    const query = createEntity('MJ: Queries', provider) as MJQueryEntityServer;
    query.LoadFromData({ ID: QUERY_ID, Name: 'Orders By Region', SQL: 'SELECT Region FROM Orders WHERE Region = {{ region | sqlString }}', Status: 'Pending' });
    return query;
}

async function declareParameter(query: MJQueryEntityServer, name: string, id: string): Promise<MJQueryParameterEntity> {
    const parameter = await query.DeclaredParameters.Create();
    parameter.ID = id;
    parameter.Name = name;
    parameter.DetectionMethod = 'Manual';
    return parameter;
}

describe('MJ: Queries declared collections', () => {
    it('declares Parameters, Fields and Entities as writable, explicitly loaded database collections', () => {
        const query = newQuery(makeProvider());
        const byName = new Map(query.Companions.map(c => [c.Name, c]));
        expect([...byName.keys()].sort()).toEqual(['Entities', 'Fields', 'Parameters']);
        expect(query.DeclaredParameters.RelatedEntityName).toBe('MJ: Query Parameters');
        expect(query.DeclaredFields.RelatedEntityName).toBe('MJ: Query Fields');
        expect(query.DeclaredEntities.RelatedEntityName).toBe('MJ: Query Entities');
        for (const collection of [query.DeclaredParameters, query.DeclaredFields, query.DeclaredEntities]) {
            expect(collection.RelatedEntityJoinField).toBe('QueryID');
            expect(collection.LoadMode).toBe('explicit');
            expect(collection.Source).toBe('database');
            expect(collection.IsReadOnly).toBe(false);
            expect(collection.Items).toHaveLength(0);
        }
    });

    it('saves a query with no declared children as a single row, outside any graph transaction', async () => {
        const query = newQuery(makeProvider());
        expect(await query.Save()).toBe(true);
        expect(opLog[0]).toBe(`save MJ: Queries:Orders By Region:${QUERY_ID}`);
        expect(opLog).not.toContain('begin');
    });

    it('writes the query, then its declared children, in one transaction, before extraction runs', async () => {
        const provider = makeProvider();
        const query = newQuery(provider);
        await declareParameter(query, 'region', DECLARED_ID);
        const field = await query.DeclaredFields.Create();
        field.Name = 'Region';

        expect(await query.Save()).toBe(true);

        const graph = opLog.slice(0, opLog.indexOf('commit') + 1);
        expect(graph).toEqual([
            'begin',
            `save MJ: Queries:Orders By Region:${QUERY_ID}`,
            `save MJ: Query Parameters:region:${DECLARED_ID}`,
            `save MJ: Query Fields:Region:${field.ID}`,
            'commit',
        ]);
        expect(extractions).toHaveLength(1);
        // Extraction ran after the graph committed, so the declared children were already written.
        expect(extractions[0].writtenBefore).toEqual(graph);
        expect(query.DeclaredParameters.Items[0].Get('QueryID')).toBe(QUERY_ID);
        expect([...extractions[0].ctx.DeclaredChildren!.ParameterNames]).toEqual(['region']);
        expect([...extractions[0].ctx.DeclaredChildren!.FieldNames]).toEqual(['region']);
    });

    it('replaces a stored extraction row with the declared row of the same name, inside the graph', async () => {
        const provider = makeProvider();
        stored.set('MJ: Query Parameters', [{ ID: EXTRACTED_ID, QueryID: QUERY_ID, Name: 'Region', DetectionMethod: 'AI' }]);
        const query = savedQuery(provider);
        await declareParameter(query, 'region', DECLARED_ID);

        expect(await query.Save()).toBe(true);

        expect(opLog).toEqual([
            'begin',
            `save MJ: Queries:Orders By Region:${QUERY_ID}`,
            `delete MJ: Query Parameters:Region:${EXTRACTED_ID}`,
            `save MJ: Query Parameters:region:${DECLARED_ID}`,
            'commit',
        ]);
        expect(query.DeclaredParameters.Items.map(p => p.ID)).toEqual([DECLARED_ID]);
    });

    it('replaces a stored extraction row already loaded into the collection', async () => {
        const provider = makeProvider();
        stored.set('MJ: Query Entities', [{ ID: EXTRACTED_ID, QueryID: QUERY_ID, EntityID: ENTITY_A, DetectionMethod: 'AI' }]);
        const query = savedQuery(provider);
        await query.DeclaredEntities.Load();
        const link = await query.DeclaredEntities.Create();
        link.ID = DECLARED_ID;
        link.EntityID = ENTITY_A.toLowerCase();
        link.DetectionMethod = 'Manual';

        expect(await query.Save()).toBe(true);

        expect(opLog).toContain(`delete MJ: Query Entities:${ENTITY_A}:${EXTRACTED_ID}`);
        expect(opLog.indexOf(`delete MJ: Query Entities:${ENTITY_A}:${EXTRACTED_ID}`))
            .toBeLessThan(opLog.indexOf(`save MJ: Query Entities:${ENTITY_A.toLowerCase()}:${DECLARED_ID}`));
        expect(query.DeclaredEntities.Items.map(e => e.ID)).toEqual([DECLARED_ID]);
    });

    it('never deletes an authored row, even when a declared row has its name', async () => {
        const provider = makeProvider();
        stored.set('MJ: Query Fields', [{ ID: EXTRACTED_ID, QueryID: QUERY_ID, Name: 'Region', DetectionMethod: 'Manual' }]);
        const query = savedQuery(provider);
        const field = await query.DeclaredFields.Create();
        field.ID = DECLARED_ID;
        field.Name = 'Region';

        await query.Save();

        expect(opLog.some(op => op.startsWith('delete'))).toBe(false);
    });

    it('leaves a stored row with the declared row\'s own ID alone (an update, not a replacement)', async () => {
        const provider = makeProvider();
        stored.set('MJ: Query Parameters', [{ ID: DECLARED_ID, QueryID: QUERY_ID, Name: 'region', DetectionMethod: 'AI' }]);
        const query = savedQuery(provider);
        await query.DeclaredParameters.Load();
        query.DeclaredParameters.Items[0].DetectionMethod = 'Manual';

        expect(await query.Save()).toBe(true);

        expect(opLog.some(op => op.startsWith('delete'))).toBe(false);
        expect(opLog).toContain(`save MJ: Query Parameters:region:${DECLARED_ID}`);
    });
});

describe('extraction sync honours declared parameters', () => {
    it('adds, updates and deletes nothing whose name the save declared', async () => {
        const provider = makeProvider();
        stored.set('MJ: Query Parameters', [
            { ID: DECLARED_ID, QueryID: QUERY_ID, Name: 'region', DetectionMethod: 'Manual' },
            { ID: EXTRACTED_ID, QueryID: QUERY_ID, Name: 'stale', DetectionMethod: 'AI' },
        ]);
        const runViewProvider: Pick<IRunViewProvider, 'RunView'> = { RunView: params => provider.RunView(params) };

        await SyncParameters(
            QUERY_ID,
            [{ name: 'Region', type: 'string', isRequired: true, description: 'Extracted', usage: [], DefaultValue: null, SampleValue: null }],
            USER as unknown as UserInfo,
            provider as unknown as IMetadataProvider,
            runViewProvider as IRunViewProvider,
            true,
            new Set(['region']),
        );

        // The declared row is neither re-added, updated nor deleted; the undeclared stale row goes.
        expect(opLog).toEqual([`delete MJ: Query Parameters:stale:${EXTRACTED_ID}`]);
    });
});
