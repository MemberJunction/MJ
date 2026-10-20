/**
 * Decrypt-on-load when a field's value was encrypted with a key this install doesn't have (an app's
 * own key the install wasn't given): one warning per key, no per-row error, and the value is left
 * encrypted. Any other decrypt failure is still logged as an error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

const { decrypt, report } = vi.hoisted(() => ({ decrypt: vi.fn(), report: vi.fn() }));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                Decrypt: decrypt,
                IsEncrypted: (v: unknown) => typeof v === 'string' && v.startsWith('$ENC$'),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
    IsEncryptionKeyUnavailable: (err: unknown) => (err as { Code?: string })?.Code === 'ENCRYPTION_KEY_UNAVAILABLE',
    ReportEncryptionKeyUnavailable: report,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() };
});

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveSQLResult, DeleteSQLResult } from '@memberjunction/core';
import { EntityInfo, LogError, RunViewParams, RunViewResult, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';

type Row = Record<string, unknown>;

class KeyTestProvider extends GenericDatabaseProviderTestBase {
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
    protected get UUIDFunctionPattern(): RegExp { return KeyTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return KeyTestProvider._defaultPattern; }
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

const ENTITY_ID = 'entity-credentials';
const KEY_ID = '11111111-2222-3333-4444-555555555555';
const SEALED = `$ENC$${KEY_ID}$AES-256-GCM$aXY=$Y2lwaGVy$dGFn`;

function setup(): { provider: KeyTestProvider; entity: EntityInfo; user: UserInfo } {
    const entity = new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Credentials',
        SchemaName: 'dbo',
        BaseTable: 'Credential',
        BaseView: 'vwCredentials',
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Credentials', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-values', EntityID: ENTITY_ID, Sequence: 2, Name: 'Values', Entity: 'Credentials', Type: 'nvarchar', Length: -1, Encrypt: true, EncryptionKeyID: 'base-key' },
        ],
    });
    const provider = new KeyTestProvider();
    provider.SeedEntities([entity]);
    const user = new UserInfo();
    user.ID = 'user-1';
    (user as unknown as Row)['_UserRoles'] = [new UserRoleInfo({ UserID: 'user-1', RoleID: 'r', Role: 'r' })];
    return { provider, entity, user };
}

describe('decrypt on load with a key this install does not have', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reports the key instead of logging an error per row, and leaves the value encrypted', async () => {
        const unavailable = Object.assign(new Error('not configured'), { Code: 'ENCRYPTION_KEY_UNAVAILABLE', KeyID: KEY_ID });
        decrypt.mockRejectedValue(unavailable);
        const { provider, entity, user } = setup();

        const out = await provider.ProcessEntityRows([{ ID: '1', Values: SEALED }, { ID: '2', Values: SEALED }], entity, user);

        expect(out.map((r) => r.Values)).toEqual([SEALED, SEALED]);
        expect(report).toHaveBeenCalledWith(unavailable);
        expect(LogError).not.toHaveBeenCalled();
    });

    it('still logs any other decrypt failure as an error', async () => {
        decrypt.mockRejectedValue(new Error('auth tag mismatch'));
        const { provider, entity, user } = setup();

        await provider.ProcessEntityRows([{ ID: '1', Values: SEALED }], entity, user);

        expect(report).not.toHaveBeenCalled();
        expect(vi.mocked(LogError).mock.calls[0][0]).toContain('auth tag mismatch');
    });
});
