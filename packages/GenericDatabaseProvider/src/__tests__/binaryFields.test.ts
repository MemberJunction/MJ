/**
 * Binary fields at the provider boundary (GenericDatabaseProvider).
 *
 * A binary DB column (varbinary / binary / image on SQL Server, bytea on PostgreSQL) reaches
 * JavaScript from the driver as a byte array (Node Buffer). Above the provider, MJ's
 * representation is a base64 string. These tests pin:
 *
 *  - PostProcessRows / ProcessEntityRows convert an entity's binary fields to base64 (step 0);
 *  - ConvertByteArrayValuesToBase64 converts metadata-less rows (RunQuery / ad-hoc SQL) by value,
 *    and executeQueryWithTiming applies it;
 *  - getRunTimeViewFieldArray leaves binary columns out of every IMPLICIT field list (saved-view
 *    columns, the no-Fields wildcard) unless IncludeBinaryFields is set, while an explicit
 *    params.Fields entry is honoured;
 *  - RunViewsWithCacheCheck widening resolves IncludeBinaryFields before computing fetch fields.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                Decrypt: vi.fn(),
                IsEncrypted: vi.fn().mockReturnValue(false),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveSQLResult, DeleteSQLResult } from '@memberjunction/core';
import { EntityInfo, EntityFieldInfo, RunViewParams, RunViewResult, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Test provider exposing the protected members under test
// ---------------------------------------------------------------------------
class BinaryTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    private _entities: EntityInfo[] = [];

    /** Rows ExecuteSQL hands back (simulating the driver). */
    public SqlRows: Row[] | null = [];
    /** Params each InternalRunView call received (cache-check widening tests). */
    public RunViewParamsSeen: RunViewParams[] = [];
    /** Rows InternalRunView returns. */
    public RunViewRows: Row[] = [];

    public SeedEntities(entities: EntityInfo[]): void {
        this._entities = entities;
    }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByID(id: string): EntityInfo | undefined {
        return this._entities.find(e => e.ID === id);
    }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }

    // --- exposures ---
    public ConvertBinaryFields(rows: Row[], fields: EntityFieldInfo[]): void {
        this.ConvertBinaryFieldsToBase64(rows, fields);
    }
    public ConvertByteArrayValues(rows: Row[] | null | undefined): void {
        this.ConvertByteArrayValuesToBase64(rows);
    }
    public FieldNames(params: RunViewParams, view: MJUserViewEntityExtended | null, user?: UserInfo): string[] {
        return this.getRunTimeViewFieldArray(params, view, user).map(f => f.Name);
    }
    public FieldString(params: RunViewParams, view: MJUserViewEntityExtended | null, user?: UserInfo): string {
        return this.getRunTimeViewFieldString(params, view, user);
    }
    public DatasetColumns(item: Row): string | null {
        return this.getColumnsForDatasetItem(item, 'TestDataset');
    }
    public RunQueryWithTiming(sql: string): Promise<{ result: Row[]; executionTime: number }> {
        return this.executeQueryWithTiming(sql);
    }

    // --- seams ---
    public override async ExecuteSQL<T>(): Promise<Array<T>> {
        return this.SqlRows as unknown as Array<T>;
    }
    protected override runViewCacheEligible(): boolean {
        return true;
    }
    protected override async InternalRunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.RunViewParamsSeen.push({ ...params, Fields: params.Fields ? [...params.Fields] : params.Fields });
        const rows = this.RunViewRows as T[];
        return { Success: true, Results: rows, UserViewRunID: '', RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }

    // --- abstract-member stubs ---
    protected get UUIDFunctionPattern(): RegExp { return BinaryTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return BinaryTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ENTITY_ID = 'entity-documents';
const ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const OTHER_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';

function openTo(fieldId: string, roles: string[]): Row[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: 'Allow',
        UpdateAccess: 'Allow',
        CreateAccess: 'Allow',
    }));
}

function documentsEntity(opts: { fls?: boolean; withBinary?: boolean } = {}): EntityInfo {
    const { fls = false, withBinary = true } = opts;
    const both = [ROLE_ID, OTHER_ROLE_ID];
    const fields: Row[] = [
        { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Documents', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Documents', Type: 'nvarchar', Length: 100, EntityFieldPermissions: openTo('f-name', both) },
        // Secret is denied to OTHER_ROLE_ID when FLS is on
        { ID: 'f-secret', EntityID: ENTITY_ID, Sequence: 3, Name: 'Secret', Entity: 'Documents', Type: 'nvarchar', Length: 50, EntityFieldPermissions: openTo('f-secret', [ROLE_ID]) },
    ];
    if (withBinary) {
        fields.push(
            { ID: 'f-content', EntityID: ENTITY_ID, Sequence: 4, Name: 'Content', Entity: 'Documents', Type: 'varbinary', Length: -1, EntityFieldPermissions: openTo('f-content', both) },
            { ID: 'f-thumb', EntityID: ENTITY_ID, Sequence: 5, Name: 'Thumbnail', Entity: 'Documents', Type: 'image', EntityFieldPermissions: openTo('f-thumb', both) },
        );
    }
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Documents',
        SchemaName: 'dbo',
        BaseTable: 'Document',
        BaseView: 'vwDocuments',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: fls,
        Permissions: both.map(roleId => ({ EntityID: ENTITY_ID, RoleID: roleId, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: fields,
    });
}

function buildUser(roleIds: string[], id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Test User';
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

function setup(opts: Parameters<typeof documentsEntity>[0] = {}): { provider: BinaryTestProvider; entity: EntityInfo } {
    const provider = new BinaryTestProvider();
    const entity = documentsEntity(opts);
    provider.SeedEntities([entity]);
    return { provider, entity };
}

function fakeView(entity: EntityInfo, columnNames: string[], hidden: string[] = []): MJUserViewEntityExtended {
    return {
        ViewEntityInfo: entity,
        Columns: columnNames.map(name => ({
            hidden: hidden.includes(name),
            Name: name,
            EntityField: entity.Fields.find(f => f.Name === name),
        })),
    } as unknown as MJUserViewEntityExtended;
}

const params = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Documents', ...extra }) as RunViewParams;

const user = () => buildUser([ROLE_ID]);
const restricted = () => buildUser([OTHER_ROLE_ID], 'user-2');

// ═══════════════════════════════════════════════════════════════════════════
// EntityInfo / EntityFieldInfo plumbing the provider relies on
// ═══════════════════════════════════════════════════════════════════════════
describe('binary field metadata', () => {
    it('recognises varbinary and image fields as binary, others not', () => {
        const entity = documentsEntity();
        expect(entity.BinaryFields.map(f => f.Name)).toEqual(['Content', 'Thumbnail']);
        expect(entity.HasBinaryFields).toBe(true);
    });

    it('reports no binary fields for an entity without them', () => {
        const entity = documentsEntity({ withBinary: false });
        expect(entity.BinaryFields).toEqual([]);
        expect(entity.HasBinaryFields).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ConvertBinaryFieldsToBase64
// ═══════════════════════════════════════════════════════════════════════════
describe('ConvertBinaryFieldsToBase64', () => {
    it('converts a Buffer value on a binary field to base64, in place', () => {
        const { provider, entity } = setup();
        const rows: Row[] = [{ ID: '1', Name: 'a', Content: Buffer.from([1, 2, 3, 255]) }];
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows[0].Content).toBe(Buffer.from([1, 2, 3, 255]).toString('base64'));
        expect(rows[0].Name).toBe('a');
    });

    it('converts a plain Uint8Array (not a Buffer)', () => {
        const { provider, entity } = setup();
        const rows: Row[] = [{ ID: '1', Thumbnail: new Uint8Array([0, 10, 20]) }];
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows[0].Thumbnail).toBe('AAoU');
    });

    it('encodes only the viewed range of a Uint8Array that is a view into a larger buffer', () => {
        const { provider, entity } = setup();
        const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
        const rows: Row[] = [{ ID: '1', Content: backing.subarray(2, 5) }];
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows[0].Content).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    });

    it('converts a zero-length byte array to the empty string', () => {
        const { provider, entity } = setup();
        const rows: Row[] = [{ ID: '1', Content: Buffer.alloc(0) }];
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows[0].Content).toBe('');
    });

    it('leaves null, undefined, absent and already-string values untouched (idempotent)', () => {
        const { provider, entity } = setup();
        const rows: Row[] = [
            { ID: '1', Content: null, Thumbnail: undefined },
            { ID: '2' },
            { ID: '3', Content: 'AQID', Thumbnail: 'not even base64!' },
        ];
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows[0].Content).toBeNull();
        expect(rows[0].Thumbnail).toBeUndefined();
        expect('Content' in rows[1]).toBe(false);
        expect(rows[2].Content).toBe('AQID');
        expect(rows[2].Thumbnail).toBe('not even base64!');

        // Running twice gives the same result
        const twice: Row[] = [{ ID: '1', Content: Buffer.from([7]) }];
        provider.ConvertBinaryFields(twice, entity.BinaryFields);
        provider.ConvertBinaryFields(twice, entity.BinaryFields);
        expect(twice[0].Content).toBe('Bw==');
    });

    it('does not touch byte arrays on non-binary fields', () => {
        const { provider, entity } = setup();
        const buf = Buffer.from([1]);
        const rows: Row[] = [{ ID: '1', Name: buf }];
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows[0].Name).toBe(buf);
    });

    it('is a no-op when the entity has no binary fields', () => {
        const { provider } = setup({ withBinary: false });
        const buf = Buffer.from([1]);
        const rows: Row[] = [{ ID: '1', Content: buf }];
        provider.ConvertBinaryFields(rows, []);
        expect(rows[0].Content).toBe(buf);
    });

    it('converts every row', () => {
        const { provider, entity } = setup();
        const rows: Row[] = [1, 2, 3].map(n => ({ ID: String(n), Content: Buffer.from([n]) }));
        provider.ConvertBinaryFields(rows, entity.BinaryFields);
        expect(rows.map(r => r.Content)).toEqual(['AQ==', 'Ag==', 'Aw==']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ConvertByteArrayValuesToBase64 (metadata-less rows)
// ═══════════════════════════════════════════════════════════════════════════
describe('ConvertByteArrayValuesToBase64', () => {
    it('converts any byte-array value regardless of column name', () => {
        const { provider } = setup();
        const rows: Row[] = [{ a: Buffer.from([1, 2]), b: new Uint8Array([3]), c: 'text', d: 5, e: null }];
        provider.ConvertByteArrayValues(rows);
        expect(rows[0]).toEqual({ a: 'AQI=', b: 'Aw==', c: 'text', d: 5, e: null });
    });

    it('tolerates null / undefined row arrays and non-object entries', () => {
        const { provider } = setup();
        expect(() => provider.ConvertByteArrayValues(null)).not.toThrow();
        expect(() => provider.ConvertByteArrayValues(undefined)).not.toThrow();
        const rows = [null, { x: Buffer.from([1]) }] as unknown as Row[];
        expect(() => provider.ConvertByteArrayValues(rows)).not.toThrow();
        expect((rows[1] as Row).x).toBe('AQ==');
    });

    it('does not descend into nested objects (top-level values only)', () => {
        const { provider } = setup();
        const nested = { inner: Buffer.from([1]) };
        const rows: Row[] = [{ obj: nested }];
        provider.ConvertByteArrayValues(rows);
        expect(rows[0].obj).toBe(nested);
        expect(Buffer.isBuffer(nested.inner)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// PostProcessRows / ProcessEntityRows + executeQueryWithTiming
// ═══════════════════════════════════════════════════════════════════════════
describe('ProcessEntityRows (PostProcessRows step 0)', () => {
    it('returns rows with binary fields as base64', async () => {
        const { provider, entity } = setup();
        const rows: Row[] = [{ ID: '1', Name: 'n', Content: Buffer.from('hello'), Thumbnail: null }];
        const out = await provider.ProcessEntityRows(rows, entity, user());
        expect(out[0].Content).toBe(Buffer.from('hello').toString('base64'));
        expect(out[0].Thumbnail).toBeNull();
        expect(out[0].Name).toBe('n');
    });

    it('returns empty / missing input unchanged', async () => {
        const { provider, entity } = setup();
        const empty: Row[] = [];
        expect(await provider.ProcessEntityRows(empty, entity)).toBe(empty);
        const missing = null as unknown as Row[];
        expect(await provider.ProcessEntityRows(missing, entity)).toBeNull();
    });
});

describe('executeQueryWithTiming', () => {
    it('converts byte-array values in raw query results to base64', async () => {
        const { provider } = setup();
        provider.SqlRows = [{ Blob: Buffer.from([0xde, 0xad]), Label: 'x' }];
        const { result } = await provider.RunQueryWithTiming('SELECT 1');
        expect(result).toEqual([{ Blob: '3q0=', Label: 'x' }]);
    });

    it('still throws when the driver returns no result', async () => {
        const { provider } = setup();
        provider.SqlRows = null;
        await expect(provider.RunQueryWithTiming('SELECT 1')).rejects.toThrow(/Error executing query SQL/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// getRunTimeViewFieldArray — binary columns only on request
// ═══════════════════════════════════════════════════════════════════════════
describe('getRunTimeViewFieldArray — binary exclusion', () => {
    describe('no Fields, no saved view (implicit wildcard)', () => {
        it('emits an explicit non-binary column list instead of *', () => {
            const { provider } = setup();
            expect(provider.FieldNames(params(), null, user())).toEqual(['ID', 'Name', 'Secret']);
            expect(provider.FieldString(params(), null, user())).toBe('[ID],[Name],[Secret]');
        });

        it('keeps * when IncludeBinaryFields is true', () => {
            const { provider } = setup();
            expect(provider.FieldNames(params({ IncludeBinaryFields: true }), null, user())).toEqual([]);
            expect(provider.FieldString(params({ IncludeBinaryFields: true }), null, user())).toBe('*');
        });

        it('keeps * for an entity with no binary fields', () => {
            const { provider } = setup({ withBinary: false });
            expect(provider.FieldString(params(), null, user())).toBe('*');
        });

        it('combines with field-level security: denied AND binary columns both dropped', () => {
            const { provider } = setup({ fls: true });
            expect(provider.FieldNames(params(), null, restricted())).toEqual(['ID', 'Name']);
        });

        it('with FLS and IncludeBinaryFields, binary columns return but denied ones stay out', () => {
            const { provider } = setup({ fls: true });
            expect(provider.FieldNames(params({ IncludeBinaryFields: true }), null, restricted()))
                .toEqual(['ID', 'Name', 'Content', 'Thumbnail']);
        });

        it('never drops a binary PRIMARY KEY from the explicit list', () => {
            const provider = new BinaryTestProvider();
            const entity = new EntityInfo({
                ID: 'e-hash', Name: 'Hashes', SchemaName: 'dbo', BaseTable: 'Hash', BaseView: 'vwHashes',
                Fields: [
                    { ID: 'h-key', EntityID: 'e-hash', Sequence: 1, Name: 'HashKey', Entity: 'Hashes', Type: 'binary', Length: 32, IsPrimaryKey: true },
                    { ID: 'h-label', EntityID: 'e-hash', Sequence: 2, Name: 'Label', Entity: 'Hashes', Type: 'nvarchar', Length: 50 },
                    { ID: 'h-data', EntityID: 'e-hash', Sequence: 3, Name: 'Data', Entity: 'Hashes', Type: 'varbinary', Length: -1 },
                ],
            });
            provider.SeedEntities([entity]);
            expect(provider.FieldNames(({ EntityName: 'Hashes' }) as RunViewParams, null, user())).toEqual(['HashKey', 'Label']);
        });

        it('applies to entity_object requests too (binary is opt-in, unlike FLS)', () => {
            const { provider } = setup();
            expect(provider.FieldNames(params({ ResultType: 'entity_object' }), null, user())).toEqual(['ID', 'Name', 'Secret']);
        });
    });

    describe('saved-view columns', () => {
        it('drops binary view columns by default (PK force-added)', () => {
            const { provider, entity } = setup();
            const view = fakeView(entity, ['Name', 'Content', 'Thumbnail']);
            expect(provider.FieldNames(params(), view, user())).toEqual(['Name', 'ID']);
        });

        it('keeps binary view columns when IncludeBinaryFields is true', () => {
            const { provider, entity } = setup();
            const view = fakeView(entity, ['Name', 'Content']);
            expect(provider.FieldNames(params({ IncludeBinaryFields: true }), view, user())).toEqual(['Name', 'Content', 'ID']);
        });

        it('still honours hidden columns', () => {
            const { provider, entity } = setup();
            const view = fakeView(entity, ['Name', 'Content'], ['Content']);
            expect(provider.FieldNames(params({ IncludeBinaryFields: true }), view, user())).toEqual(['Name', 'ID']);
        });
    });

    describe('explicit params.Fields', () => {
        it('honours an explicitly named binary field even without IncludeBinaryFields', () => {
            const { provider } = setup();
            expect(provider.FieldNames(params({ Fields: ['Name', 'Content'] }), null, user())).toEqual(['ID', 'Name', 'Content']);
        });

        it('does not add unrequested binary fields to an explicit list', () => {
            const { provider } = setup();
            expect(provider.FieldNames(params({ Fields: ['Name'], IncludeBinaryFields: true }), null, user())).toEqual(['ID', 'Name']);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// RunViewsWithCacheCheck — widening resolves IncludeBinaryFields
// ═══════════════════════════════════════════════════════════════════════════
describe('RunViewsWithCacheCheck — binary widening', () => {
    it('widens to all NON-binary fields when the caller named no binary field', async () => {
        const { provider } = setup();
        await provider.RunViewsWithCacheCheck([{ params: params({ Fields: ['Name'] }) }], user());
        expect(provider.RunViewParamsSeen).toHaveLength(1);
        const seen = provider.RunViewParamsSeen[0];
        expect(seen.Fields).toEqual(['ID', 'Name', 'Secret']);
        expect(seen.IncludeBinaryFields).not.toBe(true);
    });

    it('auto-sets IncludeBinaryFields and widens to every field when a binary field is named', async () => {
        const { provider } = setup();
        await provider.RunViewsWithCacheCheck([{ params: params({ Fields: ['name', ' content '] }) }], user());
        const seen = provider.RunViewParamsSeen[0];
        expect(seen.IncludeBinaryFields).toBe(true);
        expect(seen.Fields).toEqual(['ID', 'Name', 'Secret', 'Content', 'Thumbnail']);
    });

    it('widens to every field when IncludeBinaryFields is set explicitly', async () => {
        const { provider } = setup();
        await provider.RunViewsWithCacheCheck([{ params: params({ IncludeBinaryFields: true }) }], user());
        expect(provider.RunViewParamsSeen[0].Fields).toEqual(['ID', 'Name', 'Secret', 'Content', 'Thumbnail']);
    });

    it('projects widened rows back to the caller\'s requested fields (plus PK)', async () => {
        const { provider } = setup();
        provider.RunViewRows = [{ ID: '1', Name: 'n', Secret: 's', Content: 'AQ==', Thumbnail: null }];
        const result = await provider.RunViewsWithCacheCheck([{ params: params({ Fields: ['Name', 'Content'] }) }], user());
        const rows = (result.results[0] as { results?: Row[] }).results ?? [];
        expect(rows).toHaveLength(1);
        expect(Object.keys(rows[0]).sort()).toEqual(['Content', 'ID', 'Name']);
        expect(rows[0].Content).toBe('AQ==');
    });

    it('does not mutate the caller\'s params object', async () => {
        const { provider } = setup();
        const callerParams = params({ Fields: ['Content'] });
        await provider.RunViewsWithCacheCheck([{ params: callerParams }], user());
        expect(callerParams.Fields).toEqual(['Content']);
        expect(callerParams.IncludeBinaryFields).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dataset items — binary columns are opt-in there too
// ═══════════════════════════════════════════════════════════════════════════
describe('getColumnsForDatasetItem: binary columns', () => {
    it('selects every non-binary column instead of * when the item names no columns', () => {
        const { provider } = setup();
        expect(provider.DatasetColumns({ EntityID: ENTITY_ID, Code: 'Docs' })).toBe('[ID],[Name],[Secret]');
    });

    it('keeps * for an entity with no binary columns', () => {
        const { provider } = setup({ withBinary: false });
        expect(provider.DatasetColumns({ EntityID: ENTITY_ID, Code: 'Docs' })).toBe('*');
    });

    it('keeps * when the entity metadata is not loaded yet (first MJ_Metadata read at boot)', () => {
        const provider = new BinaryTestProvider();
        expect(provider.DatasetColumns({ EntityID: ENTITY_ID, Code: 'Docs' })).toBe('*');
    });

    it('honours a binary column named explicitly in Columns', () => {
        const { provider } = setup();
        expect(provider.DatasetColumns({ EntityID: ENTITY_ID, Code: 'Docs', Columns: 'ID, Content' })).toBe('[ID],[Content]');
    });
});
