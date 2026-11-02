import { describe, it, expect, vi } from 'vitest';
import { EntityFieldInfo, EntityInfo, IMetadataProvider, QueryInfo, UserInfo } from '@memberjunction/core';
import { MJUserViewEntityExtended, ViewColumnInfo } from '@memberjunction/core-entities';
import {
    DataTypeForEntityField,
    DataTypeForSQLType,
    ExcelSourceError,
    ResolveSingleWorkbookSource,
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

function queryStub(canRun = true): QueryInfo {
    return {
        ID: QUERY_ID,
        Name: 'Renewals by Month',
        UserCanRun: () => canRun,
        Fields: [
            { Name: 'Month', Sequence: 1, SQLBaseType: 'date' },
            { Name: 'Count', Sequence: 2, SQLBaseType: 'int' },
            { Name: 'Notes', Sequence: 3, SQLBaseType: null },
        ],
        Parameters: [
            { Name: 'Year', IsServerSet: false },
            { Name: 'ChapterID', IsServerSet: true },
        ],
    } as unknown as QueryInfo;
}

function providerWith(view: MJUserViewEntityExtended, queries: QueryInfo[] = [queryStub()]): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => view),
        Queries: queries,
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
