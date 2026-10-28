/**
 * `WriteExtractedChildRows`: facts vs annotations on a query's child rows (M8, M9, E6, M4).
 *
 * - Facts are corrected on every row, `Manual` ones included: a field's name casing, sequence,
 *   types, nullability, source and computed flag; a parameter's existence and name casing; the
 *   entity and dependency rows.
 * - Annotations are kept when authored: descriptions, a `Manual` parameter's type / required /
 *   default / sample / validation filters / server-set flag. A doc-comment description fills an
 *   empty one and replaces an extracted one.
 * - An authored parameter the SQL no longer uses is kept; an auto-detected one is deleted.
 * - Stored rows are read from the database (BypassCache), and keep their IDs.
 *
 * Real entity classes over a minimal metadata fixture and a recording provider.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity, EntityInfo, Metadata, ProviderBase, RunViewResult } from '@memberjunction/core';
import type { IEntityDataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import {
    MJQueryDependencyEntity, MJQueryEntityEntity, MJQueryFieldEntity, MJQueryParameterEntity,
} from '@memberjunction/core-entities';
import { WriteExtractedChildRows } from '../custom/query-extraction/childRowWriter';
import type { ChildRowWriteContext } from '../custom/query-extraction/childRowWriter';
import type { QueryExtractionResult, QueryFieldFact, QueryParameterFact } from '../custom/query-extraction/extractionTypes';

const USER = { ID: 'system', Name: 'System', Email: 's@example.com', UserRoles: [] };
const QUERY_ID = 'A0000000-0000-0000-0000-00000000000A';
type FieldSpec = [name: string, type: string];

const SPECS: Record<string, { id: string; fields: FieldSpec[] }> = {
    'MJ: Query Fields': { id: 'E0000000-0000-0000-0000-000000000003', fields: [
        ['QueryID', 'uniqueidentifier'], ['Name', 'nvarchar'], ['Description', 'nvarchar'], ['Sequence', 'int'], ['SQLBaseType', 'nvarchar'],
        ['SQLFullType', 'nvarchar'], ['SourceEntityID', 'uniqueidentifier'], ['SourceFieldName', 'nvarchar'], ['IsComputed', 'bit'],
        ['ComputationDescription', 'nvarchar'], ['IsSummary', 'bit'], ['SummaryDescription', 'nvarchar'], ['DetectionMethod', 'nvarchar'],
        ['AutoDetectConfidenceScore', 'decimal'], ['SourceEntityFieldID', 'uniqueidentifier'], ['IsNullable', 'bit'], ['SourceObjectName', 'nvarchar'],
    ] },
    'MJ: Query Parameters': { id: 'E0000000-0000-0000-0000-000000000002', fields: [
        ['QueryID', 'uniqueidentifier'], ['Name', 'nvarchar'], ['Type', 'nvarchar'], ['IsRequired', 'bit'], ['DefaultValue', 'nvarchar'],
        ['Description', 'nvarchar'], ['SampleValue', 'nvarchar'], ['ValidationFilters', 'nvarchar'], ['DetectionMethod', 'nvarchar'],
        ['AutoDetectConfidenceScore', 'decimal'], ['IsServerSet', 'bit'],
    ] },
    'MJ: Query Entities': { id: 'E0000000-0000-0000-0000-000000000004', fields: [
        ['QueryID', 'uniqueidentifier'], ['EntityID', 'uniqueidentifier'], ['DetectionMethod', 'nvarchar'],
        ['AutoDetectConfidenceScore', 'decimal'], ['AlternateBaseViewID', 'uniqueidentifier'],
    ] },
    'MJ: Query Dependencies': { id: 'E0000000-0000-0000-0000-000000000005', fields: [
        ['QueryID', 'uniqueidentifier'], ['DependsOnQueryID', 'uniqueidentifier'], ['ReferencePath', 'nvarchar'], ['Alias', 'nvarchar'],
        ['ParameterMapping', 'nvarchar'], ['DetectionMethod', 'nvarchar'],
    ] },
};

function entityInfo(name: string): EntityInfo {
    const { id, fields } = SPECS[name];
    const all: FieldSpec[] = [['ID', 'uniqueidentifier'], ...fields];
    return new EntityInfo({
        ID: id, Name: name, BaseTable: name, BaseView: `vw${name}`, SchemaName: '__mj',
        AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false,
        Fields: all.map(([fieldName, type], index) => ({
            ID: `${id}-${index}`, EntityID: id, Entity: name, Name: fieldName, Type: type, IsPrimaryKey: fieldName === 'ID',
            AllowsNull: fieldName !== 'ID', AutoIncrement: false, IsVirtual: false, AllowUpdateAPI: true, ValueListType: 'None',
            Sequence: index + 1, Status: 'Active', EntityFieldValues: [],
        })),
        Permissions: [], RelatedEntities: [],
    });
}

let infos: Map<string, EntityInfo>;
let ops: string[];
let stored: Map<string, Record<string, unknown>[]>;
let lookups: RunViewParams[];

function createEntity(entityName: string, provider: IEntityDataProvider): BaseEntity {
    const info = infos.get(entityName)!;
    switch (entityName) {
        case 'MJ: Query Fields': return new MJQueryFieldEntity(info, provider);
        case 'MJ: Query Parameters': return new MJQueryParameterEntity(info, provider);
        case 'MJ: Query Entities': return new MJQueryEntityEntity(info, provider);
        default: return new MJQueryDependencyEntity(info, provider);
    }
}

function makeProvider() {
    const provider = {
        CurrentUser: USER,
        IsInTransaction: false,
        async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
            const entity = createEntity(entityName, provider as unknown as IEntityDataProvider);
            entity.NewRecord();
            return entity as T;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            ops.push(`${entity.IsSaved ? 'update' : 'create'} ${entity.EntityInfo.Name}:${String(entity.Get('Name') ?? entity.Get('EntityID') ?? entity.Get('ReferencePath'))}`);
            return entity.GetAll();
        },
        async Delete(entity: BaseEntity): Promise<boolean> {
            ops.push(`delete ${entity.EntityInfo.Name}:${String(entity.Get('Name') ?? entity.Get('EntityID') ?? entity.Get('ReferencePath'))}`);
            return true;
        },
        async RunView(params: RunViewParams): Promise<RunViewResult> {
            lookups.push(params);
            const results = (stored.get(params.EntityName!) ?? []).map(row => {
                const entity = createEntity(params.EntityName!, provider as unknown as IEntityDataProvider);
                entity.LoadFromData(row);
                return entity;
            });
            return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

function context(): ChildRowWriteContext {
    return { QueryID: QUERY_ID, Provider: makeProvider() as unknown as ChildRowWriteContext['Provider'], User: USER as unknown as UserInfo };
}

function field(name: string, sequence: number, overrides: Partial<QueryFieldFact> = {}): QueryFieldFact {
    return {
        Name: name, Sequence: sequence, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)', IsNullable: false, IsComputed: false,
        SourceEntityID: null, SourceEntityFieldID: null, SourceFieldName: name, SourceObjectName: '__mj.vwThings', DocDescription: null,
        SourceDescription: null, ...overrides,
    };
}

function parameter(name: string, overrides: Partial<QueryParameterFact> = {}): QueryParameterFact {
    return { Name: name, Type: 'string', IsRequired: true, DefaultValue: null, SampleValue: null, DocDescription: null, InheritedDescription: null, ...overrides };
}

function result(overrides: Partial<QueryExtractionResult>): QueryExtractionResult {
    return { UsesTemplate: true, Refusal: null, Status: 'OK', Messages: [], Hash: 'h', Fields: [], Parameters: [], Entities: [], Dependencies: [], ...overrides };
}

beforeAll(() => {
    infos = new Map(Object.keys(SPECS).map(name => [name, entityInfo(name)]));
    Metadata.Provider = { Entities: [...infos.values()], CurrentUser: USER } as unknown as ProviderBase;
    vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(true);
});

afterAll(() => {
    vi.restoreAllMocks();
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    ops = [];
    lookups = [];
    stored = new Map();
});

describe('WriteExtractedChildRows — fields', () => {
    it('M9: corrects the facts of a Manual field and keeps its authored description and ID', async () => {
        stored.set('MJ: Query Fields', [{ ID: 'F1', QueryID: QUERY_ID, Name: 'userid', Sequence: 9, SQLBaseType: 'int', SQLFullType: 'int', IsComputed: true, IsSummary: true, Description: 'Authored.', DetectionMethod: 'Manual' }]);
        let saved: MJQueryFieldEntity | undefined;
        vi.spyOn(MJQueryFieldEntity.prototype, 'Save').mockImplementationOnce(async function (this: MJQueryFieldEntity) { saved = this; return true; });
        await WriteExtractedChildRows(context(), result({ Fields: [field('UserID', 1, { SQLBaseType: 'uniqueidentifier', SQLFullType: 'uniqueidentifier', DocDescription: 'From a doc comment.' })] }));

        expect([saved!.ID, saved!.Name, saved!.Sequence, saved!.SQLFullType, saved!.IsComputed, saved!.IsSummary, saved!.Description, saved!.DetectionMethod])
            .toEqual(['F1', 'UserID', 1, 'uniqueidentifier', false, true, 'Authored.', 'Manual']);
    });

    it('adds a new field as Database with its doc or source description, and deletes a field the output no longer has', async () => {
        stored.set('MJ: Query Fields', [{ ID: 'F9', QueryID: QUERY_ID, Name: 'Gone', Sequence: 1, SQLBaseType: 'int', SQLFullType: 'int', DetectionMethod: 'Manual' }]);
        const summary = await WriteExtractedChildRows(context(), result({ Fields: [field('Name', 1, { SourceDescription: 'The name.' }), field('Code', 2)] }));

        expect(ops.sort()).toEqual(['create MJ: Query Fields:Code', 'create MJ: Query Fields:Name', 'delete MJ: Query Fields:Gone']);
        expect(summary.FieldsWithoutDescription).toEqual(['Code']);
        expect([summary.Added, summary.Removed]).toEqual([2, 1]);
    });

    it('writes nothing for a field whose facts already match', async () => {
        stored.set('MJ: Query Fields', [{ ID: 'F1', QueryID: QUERY_ID, Name: 'Name', Sequence: 1, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)', IsNullable: false, IsComputed: false,
            SourceEntityID: null, SourceEntityFieldID: null, SourceFieldName: 'Name', SourceObjectName: '__mj.vwThings', Description: 'x', DetectionMethod: 'Manual' }]);
        const summary = await WriteExtractedChildRows(context(), result({ Fields: [field('Name', 1)] }));

        expect(ops).toEqual([]);
        expect(summary.Updated).toBe(0);
    });

    it('leaves the fields alone when their facts are unknown (a describe failure)', async () => {
        stored.set('MJ: Query Fields', [{ ID: 'F1', QueryID: QUERY_ID, Name: 'Stale', Sequence: 1, SQLBaseType: 'int', SQLFullType: 'int', DetectionMethod: 'Database' }]);
        await WriteExtractedChildRows(context(), result({ Fields: null }));

        expect(ops).toEqual([]);
    });
});

describe('WriteExtractedChildRows — parameters (M8, E6)', () => {
    it('E6: keeps every annotation of a Manual parameter, correcting only its name casing', async () => {
        stored.set('MJ: Query Parameters', [{ ID: 'P1', QueryID: QUERY_ID, Name: 'region', Type: 'array', IsRequired: false, DefaultValue: '["W"]', SampleValue: '["E"]', Description: 'Authored.', ValidationFilters: '[]', IsServerSet: true, DetectionMethod: 'Manual' }]);
        const ctx = context();
        let saved: MJQueryParameterEntity | undefined;
        vi.spyOn(MJQueryParameterEntity.prototype, 'Save').mockImplementationOnce(async function (this: MJQueryParameterEntity) { saved = this; return true; });
        await WriteExtractedChildRows(ctx, result({ Parameters: [parameter('Region', { Type: 'string', IsRequired: true, DocDescription: 'Doc.' })] }));

        expect(saved).toBeDefined();
        expect([saved!.ID, saved!.Name, saved!.Type, saved!.IsRequired, saved!.DefaultValue, saved!.SampleValue, saved!.Description, saved!.ValidationFilters, saved!.IsServerSet, saved!.DetectionMethod])
            .toEqual(['P1', 'Region', 'array', false, '["W"]', '["E"]', 'Authored.', '[]', true, 'Manual']);
    });

    it('updates an auto-detected parameter from the template and marks it Parser, keeping a non-empty sample', async () => {
        stored.set('MJ: Query Parameters', [{ ID: 'P2', QueryID: QUERY_ID, Name: 'Top', Type: 'string', IsRequired: true, SampleValue: '10', Description: 'Old.', DetectionMethod: 'AI' }]);
        let saved: MJQueryParameterEntity | undefined;
        vi.spyOn(MJQueryParameterEntity.prototype, 'Save').mockImplementationOnce(async function (this: MJQueryParameterEntity) { saved = this; return true; });
        await WriteExtractedChildRows(context(), result({ Parameters: [parameter('Top', { Type: 'number', IsRequired: false, DefaultValue: '5', SampleValue: '99' })] }));

        expect([saved!.Type, saved!.IsRequired, saved!.DefaultValue, saved!.SampleValue, saved!.Description, saved!.DetectionMethod]).toEqual(['number', false, '5', '10', 'Old.', 'Parser']);
    });

    it('M8: keeps an authored parameter the SQL no longer uses, and deletes an auto-detected one', async () => {
        stored.set('MJ: Query Parameters', [
            { ID: 'P1', QueryID: QUERY_ID, Name: 'Authored', Type: 'string', DetectionMethod: 'Manual' },
            { ID: 'P2', QueryID: QUERY_ID, Name: 'Detected', Type: 'string', DetectionMethod: 'Parser' },
            { ID: 'P3', QueryID: QUERY_ID, Name: 'Legacy', Type: 'string', DetectionMethod: 'AI' },
        ]);
        await WriteExtractedChildRows(context(), result({ Parameters: [] }));

        expect(ops.sort()).toEqual(['delete MJ: Query Parameters:Detected', 'delete MJ: Query Parameters:Legacy']);
    });

    it('adds a new parameter as Parser with its doc or inherited description', async () => {
        const summary = await WriteExtractedChildRows(context(), result({ Parameters: [parameter('Region', { InheritedDescription: 'Inherited.' }), parameter('Plain')] }));

        expect(ops.sort()).toEqual(['create MJ: Query Parameters:Plain', 'create MJ: Query Parameters:Region']);
        expect(summary.ParametersWithoutDescription).toEqual(['Plain']);
    });
});

describe('WriteExtractedChildRows — entities and dependencies', () => {
    const ENTITY_A = 'C0000000-0000-0000-0000-0000000000C1';
    const ENTITY_B = 'C0000000-0000-0000-0000-0000000000C2';

    it('follows the SQL for entity links, Manual ones included, and updates the alternate base view of a kept link', async () => {
        stored.set('MJ: Query Entities', [
            { ID: 'QE1', QueryID: QUERY_ID, EntityID: ENTITY_A, AlternateBaseViewID: null, DetectionMethod: 'Manual' },
            { ID: 'QE2', QueryID: QUERY_ID, EntityID: ENTITY_B, AlternateBaseViewID: null, DetectionMethod: 'Manual' },
        ]);
        await WriteExtractedChildRows(context(), result({ Entities: [{ EntityID: ENTITY_A.toLowerCase(), AlternateBaseViewID: 'ABV-1' }] }));

        expect(ops.sort()).toEqual([`delete MJ: Query Entities:${ENTITY_B}`, `update MJ: Query Entities:${ENTITY_A}`]);
    });

    it('adds and removes dependency rows by target and path', async () => {
        stored.set('MJ: Query Dependencies', [{ ID: 'D1', QueryID: QUERY_ID, DependsOnQueryID: ENTITY_B, ReferencePath: 'Old/Path', DetectionMethod: 'Manual' }]);
        await WriteExtractedChildRows(context(), result({ Dependencies: [{ DependsOnQueryID: ENTITY_A, ReferencePath: 'Sales/Totals', Alias: 't', ParameterMapping: null }] }));

        expect(ops.sort()).toEqual(['create MJ: Query Dependencies:Sales/Totals', 'delete MJ: Query Dependencies:Old/Path']);
    });

    it('M4: reads every stored row from the database, never a cache', async () => {
        await WriteExtractedChildRows(context(), result({}));

        expect(lookups.map(l => l.EntityName).sort()).toEqual(['MJ: Query Dependencies', 'MJ: Query Entities', 'MJ: Query Fields', 'MJ: Query Parameters']);
        expect(lookups.every(l => l.BypassCache === true)).toBe(true);
    });
});
