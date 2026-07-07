import { describe, it, expect } from 'vitest';
import type { UserInfo, ExternalSchemaDescriptor } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJExternalDataSourceEntity, MJExternalDataSourceTypeEntity } from '@memberjunction/core-entities';
import {
    BaseExternalDataSourceDriver,
    type ResolvedExternalDataSource,
    type ExternalViewParams,
    type ExternalViewResult,
    type ExternalConnectionTestResult,
    type ExternalRow,
    type ExternalQueryResult,
} from '@memberjunction/external-data-sources';
import type { FetchContext } from '@memberjunction/integration-engine';
import {
    BaseSqlExternalDataSourceConnector,
    BaseDocumentDataSourceConnector,
    type ExternalDataSourceFilterDialect,
} from '../index.js';

/**
 * CI-safe unit tests for the EDS-consuming ingestion connector heart + families. No database: a mock EDS
 * driver returns canned catalog/rows and CAPTURES the RunView params, so we can assert the connector's
 * pure logic — descriptor→SourceSchemaInfo mapping, per-dialect watermark quoting, full-record pass-through,
 * and incremental narrowing. The live cross-engine proof is the opt-in integration harness (5 real DBs).
 */

const DESCRIPTOR: ExternalSchemaDescriptor = {
    Database: 'db',
    Objects: [
        {
            Name: 'customers', ObjectType: 'table', Schema: 'dbo',
            Columns: [
                { Name: 'id', NativeType: 'int', Nullable: false, IsPrimaryKey: true },
                { Name: 'email', NativeType: 'nvarchar', Nullable: true, IsPrimaryKey: false },
                { Name: 'updated_at', NativeType: 'datetime2', Nullable: false, IsPrimaryKey: false },
            ],
            Relationships: [],
        },
        {
            Name: 'orders', ObjectType: 'table', Schema: 'dbo',
            Columns: [
                { Name: 'id', NativeType: 'int', Nullable: false, IsPrimaryKey: true },
                { Name: 'customer_id', NativeType: 'int', Nullable: false, IsPrimaryKey: false },
            ],
            Relationships: [{ ReferencedObject: 'customers', Columns: [{ Column: 'customer_id', ReferencedColumn: 'id' }] }],
        },
    ],
};

const ROWS: ExternalRow[] = [
    { id: 1, email: 'a@x.com', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 2, email: null, updated_at: '2026-02-01T00:00:00.000Z' },
    { id: 3, email: 'c@x.com', updated_at: '2026-03-01T00:00:00.000Z' },
];

/** Mock EDS driver: canned introspect/rows, captures the RunView params, narrows on a `>= '<iso>'` filter. */
class MockDriver extends BaseExternalDataSourceDriver {
    public LastView: ExternalViewParams | undefined;
    public async TestConnection(): Promise<ExternalConnectionTestResult> {
        return { success: true, message: 'ok', testedAt: new Date(0) };
    }
    public async IntrospectSchema(): Promise<ExternalSchemaDescriptor> {
        return DESCRIPTOR;
    }
    public async RunView<TRow extends ExternalRow = ExternalRow>(_ds: MJExternalDataSourceEntity, params: ExternalViewParams): Promise<ExternalViewResult<TRow>> {
        this.LastView = params;
        let rows = ROWS;
        const m = params.filter?.match(/>=\s*(?:TO_TIMESTAMP\()?'([^']+)'/);
        if (m) {
            const watermark = new Date(m[1]).getTime();
            rows = rows.filter(r => new Date(String(r.updated_at)).getTime() >= watermark);
        }
        const offset = params.offset ?? 0;
        return { success: true, rows: rows.slice(offset, offset + (params.maxRows ?? rows.length)) as TRow[], executionTimeMs: 0 };
    }
    public async LoadSingle(): Promise<null> { return null; }
    public async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(): Promise<ExternalQueryResult<TRow>> {
        return { success: true, rows: [], rowCount: 0, executionTimeMs: 0 };
    }
    protected async getConnection(): Promise<unknown> { throw new Error('not used in mock'); }
    protected async invalidateConnection(): Promise<void> { /* not used in mock */ }
}

const CI = { ID: 'ci', Name: 'ci', IntegrationID: 'int', Configuration: JSON.stringify({ externalDataSourceID: 'ds' }) } as unknown as MJCompanyIntegrationEntity;
const USER = {} as unknown as UserInfo;
const META = { WatermarkField: 'updated_at', PrimaryKeyFields: ['id'] };

function resolvedFor(driver: BaseExternalDataSourceDriver, dialect: ExternalDataSourceFilterDialect): ResolvedExternalDataSource {
    const dataSource = { ID: 'ds', Name: 'ds', DefaultSchema: 'dbo', DefaultDatabase: 'db' } as unknown as MJExternalDataSourceEntity;
    const dataSourceType = { FilterDialect: dialect } as unknown as MJExternalDataSourceTypeEntity;
    return { dataSource, dataSourceType, driver };
}

class TestSqlConnector extends BaseSqlExternalDataSourceConnector {
    public override get IntegrationName(): string { return 'Test SQL'; }
    constructor(private readonly Resolved: ResolvedExternalDataSource) { super(); }
    protected override async Resolve(): Promise<ResolvedExternalDataSource> { return this.Resolved; }
    protected override async ResolveObjectMeta(): Promise<{ WatermarkField?: string; PrimaryKeyFields: string[] }> { return META; }
}

class TestDocConnector extends BaseDocumentDataSourceConnector {
    public override get IntegrationName(): string { return 'Test Doc'; }
    constructor(private readonly Resolved: ResolvedExternalDataSource) { super(); }
    protected override async Resolve(): Promise<ResolvedExternalDataSource> { return this.Resolved; }
    protected override async ResolveObjectMeta(): Promise<{ WatermarkField?: string; PrimaryKeyFields: string[] }> { return META; }
}

const fetchCtx = (overrides: Partial<FetchContext> = {}): FetchContext => ({
    CompanyIntegration: CI, ObjectName: 'customers', WatermarkValue: null, BatchSize: 10, ContextUser: USER, CurrentOffset: 0, ...overrides,
});

describe('BaseExternalDataSourceConnector — descriptor → SourceSchemaInfo mapping', () => {
    it('maps objects, PK, composite FK, and nullability; SQL discovery is authoritative', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver(), 'tsql'));
        const schema = await c.IntrospectSchema(CI, USER);
        expect(schema.IsAuthoritative).toBe(true);
        const customers = schema.Objects.find(o => o.ExternalName === 'customers');
        expect(customers?.PrimaryKeyFields).toEqual(['id']);
        expect(customers?.Fields.find(f => f.Name === 'email')?.AllowsNull).toBe(true);
        expect(customers?.IncrementalWatermarkField).toBe('updated_at');
        const orders = schema.Objects.find(o => o.ExternalName === 'orders');
        expect(orders?.Relationships).toEqual([{ FieldName: 'customer_id', TargetObject: 'customers', TargetField: 'id' }]);
        const fkField = orders?.Fields.find(f => f.Name === 'customer_id');
        expect(fkField?.IsForeignKey).toBe(true);
        expect(fkField?.ForeignKeyTarget).toBe('customers');
    });

    it('document (sampled) discovery is NOT authoritative', async () => {
        const c = new TestDocConnector(resolvedFor(new MockDriver(), 'mongo-ast'));
        const schema = await c.IntrospectSchema(CI, USER);
        expect(schema.IsAuthoritative).toBe(false);
    });

    it('TestConnection passes the driver result through', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver(), 'tsql'));
        expect((await c.TestConnection(CI, USER)).Success).toBe(true);
    });
});

describe('FetchChanges — per-dialect watermark quoting', () => {
    const cases: Array<[ExternalDataSourceFilterDialect, RegExp]> = [
        ['tsql', /^\[updated_at\] >= '2026-02-01/],
        ['pgsql', /^"updated_at" >= '2026-02-01/],
        ['mysql', /^`updated_at` >= '2026-02-01/],
        ['oracle', /^"updated_at" >= TO_TIMESTAMP\('2026-02-01/],
    ];
    it.each(cases)('%s quotes the watermark predicate correctly', async (dialect, expected) => {
        const driver = new MockDriver();
        const c = new TestSqlConnector(resolvedFor(driver, dialect));
        await c.FetchChanges(fetchCtx({ WatermarkValue: '2026-02-01T00:00:00.000Z' }));
        expect(driver.LastView?.filter).toMatch(expected);
    });
});

describe('FetchChanges — records + incremental narrowing', () => {
    it('full fetch returns all rows with full-record pass-through + PK-derived ExternalID', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver(), 'pgsql'));
        const r = await c.FetchChanges(fetchCtx());
        expect(r.Records).toHaveLength(3);
        const first = r.Records.find(x => x.ExternalID === '1');
        expect(first).toBeDefined();
        expect(Object.keys(first!.Fields).sort()).toEqual(['email', 'id', 'updated_at']);
        expect(r.NewWatermarkValue).toBe('2026-03-01T00:00:00.000Z');
    });

    it('incremental fetch narrows to rows at/after the watermark', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver(), 'pgsql'));
        const r = await c.FetchChanges(fetchCtx({ WatermarkValue: '2026-03-01T00:00:00.000Z' }));
        expect(r.Records).toHaveLength(1);
        expect(r.Records[0].ExternalID).toBe('3');
    });

    it('HasMore + NextOffset paginate when the batch is full', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver(), 'pgsql'));
        const r = await c.FetchChanges(fetchCtx({ BatchSize: 2 }));
        expect(r.Records).toHaveLength(2);
        expect(r.HasMore).toBe(true);
        expect(r.NextOffset).toBe(2);
    });
});
