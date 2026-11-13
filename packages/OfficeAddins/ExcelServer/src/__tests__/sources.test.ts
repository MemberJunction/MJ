import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityFieldInfo, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJUserViewEntityExtended, QueryEngine, ViewColumnInfo } from '@memberjunction/core-entities';

/** The slice of a cached query that source resolution reads. */
interface QueryStub {
    ID: string;
    Name: string;
    UserCanRun: () => { canRun: boolean; deniedEntities: string[] };
    QueryFields: Array<{ Name: string; Sequence: number; SQLBaseType: string | null }>;
    QueryParameters: Array<{ Name: string; IsServerSet: boolean }>;
}

const { queryEngineStub } = vi.hoisted(() => {
    const queries: QueryStub[] = [];
    return {
        queryEngineStub: {
            Queries: queries,
            Config: vi.fn(async () => undefined),
            FindQueryByID: (id: string) => queries.find(q => q.ID.trim().toLowerCase() === id.trim().toLowerCase()),
        },
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core-entities')>()),
    // GetProviderInstance: the engine bound to the request provider's connection (the same stub here).
    QueryEngine: { Instance: queryEngineStub, GetProviderInstance: vi.fn(() => queryEngineStub) },
}));
import {
    DataTypeForEntityField,
    DataTypeForSQLType,
    ExcelSourceError,
    ResolveSingleWorkbookSource,
    ResolveViewByNameOrId,
    ResolveWorkbookSources,
} from '../sources';

const VIEW_ID = '6F1D4A6E-0C5E-4B53-9E0B-6F2C1D8E9A10';
const ENTITY_ID = '8B3C4D5E-2F3A-4B5C-9D0E-1F2A3B4C5D6E';
const QUERY_ID = '7A2B3C4D-1E2F-4A5B-8C9D-0E1F2A3B4C5D';
const user = { ID: '11111111-2222-3333-4444-555555555555', Name: 'Ada', Email: 'ada@example.org' } as UserInfo;

function field(name: string, type: string, extra: Partial<Record<'DisplayName' | 'DefaultInView' | 'Sequence', string | boolean | number>> = {}): EntityFieldInfo {
    return new EntityFieldInfo({ Name: name, Type: type, DisplayName: null, DefaultInView: false, Sequence: 0, ...extra });
}

const firstName = field('FirstName', 'nvarchar', { DisplayName: 'First Name', DefaultInView: true, Sequence: 2 });
const joinDate = field('JoinDate', 'date', { DefaultInView: true, Sequence: 3 });
const updated = field('UpdatedAt', 'datetimeoffset', { Sequence: 4 });
const dues = field('Dues', 'decimal', { Sequence: 5 });
const photo = field('Photo', 'varbinary', { DefaultInView: true, Sequence: 1 });

interface ViewStubOptions {
    Loaded?: boolean;
    CanView?: boolean;
    CanRead?: boolean;
    Columns?: ViewColumnInfo[];
}

function viewStub(options: ViewStubOptions = {}): MJUserViewEntityExtended {
    const stub = {
        ID: VIEW_ID,
        Name: 'Active Members',
        Load: vi.fn(async () => options.Loaded ?? true),
        UserCanView: options.CanView ?? true,
        Columns: options.Columns ?? [],
        ViewEntityInfo: {
            Fields: [firstName, joinDate, updated, dues, photo],
            GetUserPermisions: () => ({ CanRead: options.CanRead ?? true }),
        },
    };
    return stub as unknown as MJUserViewEntityExtended;
}

function queryStub(canRun = true): QueryStub {
    return {
        ID: QUERY_ID,
        Name: 'Renewals by Month',
        UserCanRun: () => ({ canRun, deniedEntities: canRun ? [] : ['Members'] }),
        QueryFields: [
            { Name: 'Month', Sequence: 1, SQLBaseType: 'date' },
            { Name: 'Count', Sequence: 2, SQLBaseType: 'int' },
            { Name: 'Notes', Sequence: 3, SQLBaseType: null },
        ],
        QueryParameters: [
            { Name: 'Year', IsServerSet: false },
            { Name: 'ChapterID', IsServerSet: true },
        ],
    };
}

/** A provider whose deprecated query list is empty; `queries` go into the stubbed QueryEngine. */
function providerWith(view: MJUserViewEntityExtended, queries: QueryStub[] = [queryStub()]): IMetadataProvider {
    queryEngineStub.Queries.splice(0, queryEngineStub.Queries.length, ...queries);
    return {
        GetEntityObject: vi.fn(async () => view),
        Queries: [],
    } as unknown as IMetadataProvider;
}

function column(name: string, f: EntityFieldInfo, extra: Partial<ViewColumnInfo> = {}): ViewColumnInfo {
    return new ViewColumnInfo({ ID: name, Name: name, DisplayName: f.DisplayNameOrName, hidden: false, EntityField: f, ...extra });
}

describe('ResolveWorkbookSources — views', () => {
    it('uses the view\'s visible columns in display order, with headers and data types', async () => {
        const view = viewStub({
            Columns: [
                column('JoinDate', joinDate, { orderIndex: 2, userDisplayName: 'Joined' }),
                column('Dues', dues, { orderIndex: 3, hidden: true }),
                column('FirstName', firstName, { orderIndex: 0 }),
                column('UpdatedAt', updated, { orderIndex: 1 }),
                column('Photo', photo, { orderIndex: 4 }),
            ],
        });
        const [source] = await ResolveWorkbookSources([{ Kind: 'View', ID: VIEW_ID }], providerWith(view), user);
        expect(source).toMatchObject({ Key: 's1', Kind: 'View', ID: VIEW_ID, Name: 'Active Members', SheetName: 'Active Members' });
        expect(source.Columns).toEqual([
            { Name: 'FirstName', Header: 'First Name', DataType: 'Text' },
            { Name: 'UpdatedAt', Header: 'UpdatedAt', DataType: 'DateTime' },
            { Name: 'JoinDate', Header: 'Joined', DataType: 'Date' },
        ]);
        expect(source.Parameters).toBeUndefined();
    });

    it('falls back to the entity\'s default columns, leaving out binary fields', async () => {
        const [source] = await ResolveWorkbookSources([{ Kind: 'View', ID: VIEW_ID }], providerWith(viewStub()), user);
        expect(source.Columns.map(c => c.Name)).toEqual(['FirstName', 'JoinDate']);
    });

    it('loads the view as the caller', async () => {
        const provider = providerWith(viewStub());
        await ResolveWorkbookSources([{ Kind: 'View', ID: VIEW_ID }], provider, user);
        expect(provider.GetEntityObject).toHaveBeenCalledWith('MJ: User Views', user);
    });

    it.each([
        ['a missing view', { Loaded: false }],
        ['a view the caller can\'t see', { CanView: false }],
        ['a view over data the caller can\'t read', { CanRead: false }],
    ])('refuses %s', async (_label, options) => {
        await expect(ResolveWorkbookSources([{ Kind: 'View', ID: VIEW_ID }], providerWith(viewStub(options)), user))
            .rejects.toBeInstanceOf(ExcelSourceError);
    });
});

describe('ResolveWorkbookSources — queries', () => {
    it('uses the query\'s fields by sequence and keeps caller parameters under their own names', async () => {
        const [source] = await ResolveWorkbookSources(
            [{ Kind: 'Query', ID: QUERY_ID.toLowerCase(), Parameters: { year: 2026 } }],
            providerWith(viewStub()), user);
        expect(source).toMatchObject({ Kind: 'Query', ID: QUERY_ID, Name: 'Renewals by Month' });
        expect(source.Columns).toEqual([
            { Name: 'Month', Header: 'Month', DataType: 'Date' },
            { Name: 'Count', Header: 'Count', DataType: 'Number' },
            { Name: 'Notes', Header: 'Notes', DataType: 'Text' },
        ]);
        expect(source.Parameters).toEqual({ Year: 2026 });
    });

    it('refuses a server-set parameter', async () => {
        await expect(ResolveWorkbookSources([{ Kind: 'Query', ID: QUERY_ID, Parameters: { ChapterID: 'x' } }], providerWith(viewStub()), user))
            .rejects.toThrow(/set by the server/);
    });

    it('refuses an unknown parameter', async () => {
        await expect(ResolveWorkbookSources([{ Kind: 'Query', ID: QUERY_ID, Parameters: { Region: 'West' } }], providerWith(viewStub()), user))
            .rejects.toThrow(/has no parameter "Region"/);
    });

    it('refuses a query the caller can\'t run', async () => {
        await expect(ResolveWorkbookSources([{ Kind: 'Query', ID: QUERY_ID }], providerWith(viewStub(), [queryStub(false)]), user))
            .rejects.toBeInstanceOf(ExcelSourceError);
    });

    it('loads QueryEngine as the caller, through the request provider', async () => {
        queryEngineStub.Config.mockClear();
        const provider = providerWith(viewStub());
        await ResolveSingleWorkbookSource({ Kind: 'Query', ID: QUERY_ID }, provider, user);
        expect(queryEngineStub.Config).toHaveBeenCalledWith(false, user, provider);
        // The engine is the one bound to the request provider, not the process-wide singleton.
        expect(QueryEngine.GetProviderInstance).toHaveBeenCalledWith(provider, expect.anything());
    });

    it('refuses a missing query and a denied query with the same message', async () => {
        const denied = ResolveSingleWorkbookSource({ Kind: 'Query', ID: QUERY_ID }, providerWith(viewStub(), [queryStub(false)]), user);
        await expect(denied).rejects.toThrow('That saved query doesn\'t exist, or you don\'t have access to it.');
        const missing = ResolveSingleWorkbookSource({ Kind: 'Query', ID: QUERY_ID }, providerWith(viewStub(), []), user);
        await expect(missing).rejects.toThrow('That saved query doesn\'t exist, or you don\'t have access to it.');
    });
});

describe('ResolveSingleWorkbookSource — entities', () => {
    function makeEntity(overrides: Partial<Pick<EntityInfo, 'IncludeInAPI' | 'Status'>> & { CanRead?: boolean; Fields?: EntityFieldInfo[] } = {}): EntityInfo {
        const entity = Object.create(EntityInfo.prototype) as EntityInfo;
        const fields = overrides.Fields ?? [firstName, joinDate, updated, photo];
        Object.assign(entity, {
            ID: ENTITY_ID,
            Name: 'MJ: People',
            DisplayName: 'People',
            IncludeInAPI: overrides.IncludeInAPI ?? true,
            Status: overrides.Status ?? 'Active',
            GetUserPermisions: () => ({ CanRead: overrides.CanRead ?? true }),
        });
        Object.defineProperty(entity, 'Fields', { get: () => fields });
        return entity;
    }

    it('resolves an entity using its non-binary default columns and records canonical EntityName', async () => {
        const p = Object.assign(providerWith(viewStub()), { Entities: [makeEntity()] });
        const resolved = await ResolveSingleWorkbookSource({ Kind: 'Entity', ID: ENTITY_ID }, p, user);
        expect(resolved).toEqual({
            Kind: 'Entity',
            ID: ENTITY_ID,
            Name: 'People',
            EntityName: 'MJ: People',
            Columns: [
                { Name: 'FirstName', Header: 'First Name', DataType: 'Text' },
                { Name: 'JoinDate', Header: 'JoinDate', DataType: 'Date' },
            ],
        });
    });

    it('falls back to non-system non-binary fields when an entity marks no DefaultInView fields', async () => {
        const mjCreated = field('__mj_CreatedAt', 'datetimeoffset', { Sequence: 10 });
        const p = Object.assign(providerWith(viewStub()), {
            Entities: [makeEntity({ Fields: [updated, dues, mjCreated, photo] })],
        });
        const resolved = await ResolveSingleWorkbookSource({ Kind: 'Entity', ID: ENTITY_ID }, p, user);
        expect(resolved.Columns.map(c => c.Name)).toEqual(['UpdatedAt', 'Dues']);
    });

    it.each([
        ['unreadable entity', { CanRead: false }],
        ['non-API entity', { IncludeInAPI: false }],
        ['disabled entity', { Status: 'Disabled' as const }],
    ])('refuses %s', async (_label, overrides) => {
        const p = Object.assign(providerWith(viewStub()), { Entities: [makeEntity(overrides)] });
        await expect(ResolveSingleWorkbookSource({ Kind: 'Entity', ID: ENTITY_ID }, p, user)).rejects.toBeInstanceOf(ExcelSourceError);
    });
});

describe('ResolveWorkbookSources — requests', () => {
    it('numbers sources and keeps sheet names unique', async () => {
        const sources = await ResolveWorkbookSources(
            [{ Kind: 'View', ID: VIEW_ID }, { Kind: 'View', ID: VIEW_ID }], providerWith(viewStub()), user);
        expect(sources.map(s => s.Key)).toEqual(['s1', 's2']);
        expect(sources.map(s => s.SheetName)).toEqual(['Active Members', 'Active Members (2)']);
    });

    it.each([
        ['no sources', []],
        ['too many sources', Array.from({ length: 11 }, () => ({ Kind: 'View' as const, ID: VIEW_ID }))],
        ['a bad ID', [{ Kind: 'View' as const, ID: 'not-a-guid' }]],
    ])('refuses %s', async (_label, requests) => {
        await expect(ResolveWorkbookSources(requests, providerWith(viewStub()), user)).rejects.toBeInstanceOf(ExcelSourceError);
    });
});

describe('data types', () => {
    it('maps entity fields', () => {
        expect(DataTypeForEntityField(field('A', 'int'))).toBe('Number');
        expect(DataTypeForEntityField(field('A', 'bit'))).toBe('Boolean');
        expect(DataTypeForEntityField(field('A', 'date'))).toBe('Date');
        expect(DataTypeForEntityField(field('A', 'datetime2'))).toBe('DateTime');
        expect(DataTypeForEntityField(field('A', 'uniqueidentifier'))).toBe('Text');
    });

    it('maps SQL base types, treating an unknown type as text', () => {
        expect(DataTypeForSQLType('decimal')).toBe('Number');
        expect(DataTypeForSQLType('DATE')).toBe('Date');
        expect(DataTypeForSQLType('datetimeoffset')).toBe('DateTime');
        expect(DataTypeForSQLType('')).toBe('Text');
        expect(DataTypeForSQLType(undefined)).toBe('Text');
    });
});

describe('ResolveViewByNameOrId — =MJ.VIEW resolution', () => {
    function makeEntity(id: string = ENTITY_ID): EntityInfo {
        const entity = Object.create(EntityInfo.prototype) as EntityInfo;
        const fields = [firstName, joinDate, updated, photo];
        Object.assign(entity, {
            ID: id,
            Name: 'MJ: People',
            DisplayName: 'People',
            IncludeInAPI: true,
            Status: 'Active',
            GetUserPermisions: () => ({ CanRead: true }),
        });
        Object.defineProperty(entity, 'Fields', { get: () => fields });
        return entity;
    }

    it('resolves a saved view by view Name on the target entity', async () => {
        const entity = makeEntity();
        const view = viewStub({
            Columns: [
                column('FirstName', firstName, { orderIndex: 0 }),
                column('JoinDate', joinDate, { orderIndex: 1 }),
            ],
        });
        Object.assign(view, { EntityID: ENTITY_ID });
        const runViewSpy = vi.fn(async () => ({
            Success: true,
            Results: [{ ID: VIEW_ID, Name: 'Active Members', EntityID: ENTITY_ID, UserID: user.ID, IsShared: true }],
        }));
        const provider = Object.assign(providerWith(view), {
            Entities: [entity],
            RunView: runViewSpy,
        }) as unknown as IMetadataProvider;

        const resolved = await ResolveViewByNameOrId(entity, 'Active Members', provider, user);
        expect(runViewSpy).toHaveBeenCalledTimes(1);
        expect(resolved).toMatchObject({
            Kind: 'View',
            ID: VIEW_ID,
            Name: 'Active Members',
            EntityName: 'MJ: People',
        });
        expect(resolved.Columns.map(c => c.Name)).toEqual(['FirstName', 'JoinDate']);
    });

    it('refuses a view UUID that belongs to a different entity', async () => {
        const entity = makeEntity();
        const otherEntityId = '99999999-2F3A-4B5C-9D0E-1F2A3B4C5D6E';
        const mismatchedView = viewStub({
            Columns: [column('FirstName', firstName, { orderIndex: 0 })],
        });
        Object.assign(mismatchedView, { EntityID: otherEntityId });
        const provider = Object.assign(providerWith(mismatchedView), {
            Entities: [entity],
        }) as unknown as IMetadataProvider;

        await expect(ResolveViewByNameOrId(entity, VIEW_ID, provider, user))
            .rejects.toThrow(/does not belong to entity/);
    });

    it('falls back to the entity\'s default columns when viewNameOrId is (Default) or omitted', async () => {
        const entity = makeEntity();
        const provider = Object.assign(providerWith(viewStub()), {
            Entities: [entity],
        }) as unknown as IMetadataProvider;

        const fromDefault = await ResolveViewByNameOrId(entity, '(Default)', provider, user);
        expect(fromDefault.Kind).toBe('Entity');
        expect(fromDefault.Columns.map(c => c.Name)).toEqual(['FirstName', 'JoinDate']);

        const fromEmpty = await ResolveViewByNameOrId(entity, undefined, provider, user);
        expect(fromEmpty.Kind).toBe('Entity');
    });
});
