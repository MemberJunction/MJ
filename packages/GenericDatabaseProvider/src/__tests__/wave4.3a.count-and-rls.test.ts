import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    CompositeKey,
    BaseEntity,
    ExecuteSQLOptions,
} from '@memberjunction/core';
import type { RowFilterParameterBinder } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { NamedQueryParameter } from '../typedQueryParameter';

class TestCountAndRLSProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestCountAndRLSProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestCountAndRLSProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<never> { throw new Error('Not implemented'); }
    protected GenerateDeleteSQL(): never { throw new Error('Not implemented'); }
    protected BuildRecordChangeSQL(): null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    public override async ExecuteSQL<T = Record<string, unknown>>(
        _sql: string,
        _params?: unknown[],
        _options?: ExecuteSQLOptions,
        _user?: UserInfo
    ): Promise<T[]> {
        return [] as T[];
    }

    public getDialectOverride = new SQLServerDialect();
    protected override getDialect(): SQLServerDialect {
        return this.getDialectOverride;
    }

    public override CanCountFromBaseTable(entityInfo: EntityInfo, whereSQL: string): boolean {
        return super.CanCountFromBaseTable(entityInfo, whereSQL);
    }

    public override BuildTotalRowCountSQL(
        entityInfo: EntityInfo,
        usingPagination: boolean,
        maxRowsForQuery: number,
        baseViewOverride?: string,
        schemaNameOverride?: string,
        whereSQL?: string
    ): string | null {
        return super.BuildTotalRowCountSQL(entityInfo, usingPagination, maxRowsForQuery, baseViewOverride, schemaNameOverride, whereSQL);
    }

    public override async CheckCreateRLS(entity: BaseEntity, user: UserInfo): Promise<boolean> {
        return super.CheckCreateRLS(entity, user);
    }

    public override async InternalLoad(entityInfo: EntityInfo, compositeKey: CompositeKey, user?: UserInfo): Promise<Record<string, unknown> | null> {
        return super.InternalLoad(entityInfo, compositeKey, user);
    }
}

function makeField(name: string, isVirtual: boolean, isPrimaryKey: boolean = false, type: string = 'nvarchar'): EntityFieldInfo {
    return new EntityFieldInfo({
        ID: `F-${name}`,
        EntityID: 'E-1',
        Sequence: 1,
        Name: name,
        Type: type,
        Length: 100,
        Precision: 0,
        Scale: 0,
        AllowsNull: !isPrimaryKey,
        DefaultValue: null,
        AutoIncrement: false,
        IsVirtual: isVirtual,
        IsPrimaryKey: isPrimaryKey,
        IsUnique: isPrimaryKey,
        AllowUpdateAPI: true,
        IsComputed: false,
        Status: 'Active',
    });
}

function makeTestEntityInfo(overrides?: Partial<ConstructorParameters<typeof EntityInfo>[0]>): EntityInfo {
    return new EntityInfo({
        ID: '10000000-0000-0000-0000-000000000001',
        Name: 'Widgets',
        CodeName: 'Widgets',
        SchemaName: 'dbo',
        BaseTable: 'Widget',
        BaseView: 'vwWidgets',
        BaseViewGenerated: true,
        VirtualEntity: false,
        DeleteType: 'Hard',
        Status: 'Active',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: [
            makeField('ID', false, true, 'uniqueidentifier'),
            makeField('Status', false, false, 'nvarchar'),
            makeField('CreatedAt', false, false, 'datetimeoffset'),
            makeField('Score', false, false, 'int'),
            makeField('Company', true, false, 'nvarchar'), // Virtual lookup field
        ],
        EntityPermissions: [],
        ...overrides,
    });
}

describe('Wave 4.3a Base-Table COUNT(*) Rewrite', () => {
    const provider = new TestCountAndRLSProvider();

    it('CanCountFromBaseTable returns true for empty or whitespace WHERE clause on generated views', () => {
        const info = makeTestEntityInfo();
        expect(provider.CanCountFromBaseTable(info, '')).toBe(true);
        expect(provider.CanCountFromBaseTable(info, '   ')).toBe(true);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, '');
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."Widget"');
    });

    it('CanCountFromBaseTable returns true when filter only uses physical non-virtual columns', () => {
        const info = makeTestEntityInfo();
        const where = "Status = 'Active' AND Score > 10";
        expect(provider.CanCountFromBaseTable(info, where)).toBe(true);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, where);
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."Widget"');
    });

    it('CanCountFromBaseTable supports brackets, quotes, and parameters on physical columns', () => {
        const info = makeTestEntityInfo();
        const where = "[Status] = 'Active' AND [CreatedAt] >= @p0 AND Score <= @p1";
        expect(provider.CanCountFromBaseTable(info, where)).toBe(true);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, where);
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."Widget"');
    });

    it('CanCountFromBaseTable returns false when filter references a virtual field', () => {
        const info = makeTestEntityInfo();
        const where = "Company = 'Acme Inc' AND Status = 'Active'";
        expect(provider.CanCountFromBaseTable(info, where)).toBe(false);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, where);
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."vwWidgets"');
    });

    it('CanCountFromBaseTable unlocks safe RLS/filter subqueries and PG AT TIME ZONE while rejecting outer joins or BaseView/virtual references', () => {
        const info = makeTestEntityInfo();
        expect(provider.CanCountFromBaseTable(info, 'ID IN (SELECT ID FROM OtherTable)')).toBe(true);
        expect(provider.CanCountFromBaseTable(info, 'EXISTS (SELECT 1 FROM OtherTable WHERE OtherTable.ID = Widget.ID)')).toBe(true);
        expect(provider.CanCountFromBaseTable(info, 'Status = (SELECT TOP 1 Name FROM Statuses)')).toBe(true);
        expect(provider.CanCountFromBaseTable(info, "CreatedAt >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'")).toBe(true);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, 'ID IN (SELECT ID FROM OtherTable)');
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."Widget"');

        // Subquery referencing BaseView or unqualified virtual field falls back to BaseView
        expect(provider.CanCountFromBaseTable(info, 'EXISTS (SELECT 1 FROM OtherTable WHERE OtherTable.ID = vwWidgets.ID)')).toBe(false);
        expect(provider.CanCountFromBaseTable(info, 'EXISTS (SELECT 1 FROM OtherTable WHERE OtherTable.Name = Company)')).toBe(false);
        // Outer JOIN / UNION / bare SELECT still rejected
        expect(provider.CanCountFromBaseTable(info, '1=1 JOIN OtherTable ON 1=1')).toBe(false);
        expect(provider.CanCountFromBaseTable(info, '1=1 UNION SELECT 1')).toBe(false);
        expect(provider.CanCountFromBaseTable(info, 'vwWidgets.ID = 1')).toBe(false);
    });

    it('CanCountFromBaseTable returns false when BaseViewGenerated is false (custom view)', () => {
        const info = makeTestEntityInfo({ BaseViewGenerated: false });
        expect(provider.CanCountFromBaseTable(info, '')).toBe(false);
        expect(provider.CanCountFromBaseTable(info, "Status = 'Active'")).toBe(false);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, '');
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."vwWidgets"');
    });

    it('CanCountFromBaseTable returns false for VirtualEntity', () => {
        const info = makeTestEntityInfo({ VirtualEntity: true });
        expect(provider.CanCountFromBaseTable(info, '')).toBe(false);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, '');
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."vwWidgets"');
    });

    it('CanCountFromBaseTable returns false for Soft Delete entities', () => {
        const info = makeTestEntityInfo({ DeleteType: 'Soft' });
        expect(provider.CanCountFromBaseTable(info, '')).toBe(false);
        const countSQL = provider.BuildTotalRowCountSQL(info, true, 100, undefined, undefined, '');
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."vwWidgets"');
    });

    it('CanCountFromBaseTable returns false for IS-A child entities or entities with ParentID', () => {
        const childInfo = makeTestEntityInfo({
            ParentID: '20000000-0000-0000-0000-000000000002',
        });
        expect(provider.CanCountFromBaseTable(childInfo, '')).toBe(false);
        const countSQL = provider.BuildTotalRowCountSQL(childInfo, true, 100, undefined, undefined, '');
        expect(countSQL).toBe('SELECT COUNT(*) AS "TotalRowCount" FROM "dbo"."vwWidgets"');
    });
});

describe('Wave 4.3a Parameterized RLS on Load & CheckCreateRLS', () => {
    const provider = new TestCountAndRLSProvider();
    const mockUser = {
        ID: 'U-001',
        Email: 'test@example.com',
        UserRoles: [],
    } as unknown as UserInfo;

    it('InternalLoad collects and binds RLS query parameters when RLS filter exists', async () => {
        const info = makeTestEntityInfo();
        const execSpy = vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ ID: 'w-1', Status: 'Active' }]);
        vi.spyOn(provider as unknown as { PostProcessRows: (rows: unknown) => Promise<unknown> }, 'PostProcessRows').mockImplementation(async (rows) => rows);

        vi.spyOn(info, 'GetEffectiveRowFilterWhereClause').mockImplementation((_u, _type, _prefix, binder?: RowFilterParameterBinder) => {
            if (binder) {
                const placeholder = binder.Bind('Status', 'Active');
                return `Status = ${placeholder}`;
            }
            return "Status = 'Active'";
        });

        const key = new CompositeKey();
        key.LoadFromSingleKeyValuePair('ID', '10000000-0000-0000-0000-000000000001');

        const entity = {
            EntityInfo: info,
            Fields: info.Fields,
            PrimaryKey: key,
            Get: (n: string) => n === 'ID' ? '10000000-0000-0000-0000-000000000001' : null,
            GetFieldByName: (n: string) => info.Fields.find(f => f.Name === n) ?? null,
        } as unknown as BaseEntity;

        await provider.Load(entity, key, null, mockUser);

        expect(execSpy).toHaveBeenCalledTimes(1);
        const [sql, params] = execSpy.mock.calls[0];
        expect(sql).toContain('"ID"=\'10000000-0000-0000-0000-000000000001\' AND (Status = @p0)');
        expect(params).toBeDefined();
        expect(params).toHaveLength(1);
        expect((params![0] as NamedQueryParameter).Name).toBe('p0');
        expect((params![0] as NamedQueryParameter).Value).toBe('Active');
    });

    it('CheckCreateRLS parameterizes both synthetic row values and RLS tokens', async () => {
        const info = makeTestEntityInfo();
        const execSpy = vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ pass: 1 }]);

        vi.spyOn(info, 'GetEffectiveRowFilterWhereClause').mockImplementation((_u, _type, _prefix, binder?: RowFilterParameterBinder) => {
            if (binder) {
                const placeholder = binder.Bind('OwnerID', 'U-001');
                return `Score > 0 AND OwnerID = ${placeholder}`;
            }
            return "Score > 0 AND OwnerID = 'U-001'";
        });

        const entity = {
            EntityInfo: info,
            Fields: [
                { Name: 'ID', Value: '10000000-0000-0000-0000-000000000001' },
                { Name: 'Status', Value: 'Active' },
                { Name: 'Score', Value: 42 },
                { Name: 'CreatedAt', Value: null },
            ],
            Get: (f: string) => {
                if (f === 'ID') return '10000000-0000-0000-0000-000000000001';
                if (f === 'Status') return 'Active';
                if (f === 'Score') return 42;
                if (f === 'CreatedAt') return null;
                return null;
            },
            GetFieldByName: (n: string) => {
                if (n === 'ID') return { Name: 'ID', Value: '10000000-0000-0000-0000-000000000001' };
                if (n === 'Status') return { Name: 'Status', Value: 'Active' };
                if (n === 'Score') return { Name: 'Score', Value: 42 };
                if (n === 'CreatedAt') return { Name: 'CreatedAt', Value: null };
                return null;
            },
        } as unknown as BaseEntity;

        const passes = await provider.CheckCreateRLS(entity, mockUser);

        expect(passes).toBe(true);
        expect(execSpy).toHaveBeenCalledTimes(1);
        const [sql, params] = execSpy.mock.calls[0];
        expect(sql).toContain('SELECT CASE WHEN (Score > 0 AND OwnerID = @p0) THEN 1 ELSE 0 END AS pass');
        expect(params).toBeDefined();
        // Should include rls parameter @p0 AND synthetic row parameters (@p1, @p2, @p3)
        const paramNames = (params as NamedQueryParameter[]).map(p => p.Name);
        expect(paramNames).toContain('p0');
        expect(paramNames).toContain('p1');
        expect(paramNames).toContain('p2');
        expect(paramNames).toContain('p3');
    });
});
