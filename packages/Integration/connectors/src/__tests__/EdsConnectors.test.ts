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
} from '../index.js';

/**
 * CI-safe unit tests for the EDS-consuming ingestion connector heart + families. No database: a mock EDS
 * driver returns canned catalog/rows and CAPTURES the RunView params, so we can assert the connector's
 * pure logic — descriptor→SourceSchemaInfo mapping, full-record pass-through, and that the connector passes
 * a STRUCTURED `incrementalSince` bound (no dialect SQL) so the EDS driver owns all quoting/predicate
 * rendering. Per-dialect quoting is proven in the EDS provider tests; the live cross-engine proof is the
 * opt-in integration harness (5 real DBs).
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

/**
 * Mock EDS driver: canned introspect/rows, captures the RunView params, and narrows on the STRUCTURED
 * `incrementalSince` bound (the connector no longer builds a filter string — the driver would).
 */
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
        if (params.incrementalSince) {
            const watermark = new Date(params.incrementalSince.Value).getTime();
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

/** A resolved data source. FilterDialect is irrelevant to the connector now — the driver owns quoting. */
function resolvedFor(driver: BaseExternalDataSourceDriver): ResolvedExternalDataSource {
    const dataSource = { ID: 'ds', Name: 'ds', DefaultSchema: 'dbo', DefaultDatabase: 'db' } as unknown as MJExternalDataSourceEntity;
    const dataSourceType = { FilterDialect: 'ansi' } as unknown as MJExternalDataSourceTypeEntity;
    return { dataSource, dataSourceType, driver };
}

class TestSqlConnector extends BaseSqlExternalDataSourceConnector {
    public override get IntegrationName(): string { return 'Test SQL'; }
    constructor(private readonly Resolved: ResolvedExternalDataSource) { super(); }
    protected override async Resolve(): Promise<ResolvedExternalDataSource> { return this.Resolved; }
    protected override async ResolveObjectMeta(): Promise<{ WatermarkField?: string; PrimaryKeyFields: string[] }> { return META; }
    public coerce(value: unknown): Date | undefined { return this.CoerceDate(value); }
    public contentKey(row: Record<string, unknown>, watermarkField?: string): string { return this.ContentKey(row, watermarkField); }
    public readExternalDataSourceID(ci: MJCompanyIntegrationEntity): string { return this.ReadExternalDataSourceID(ci); }
    public buildRecord(row: Record<string, unknown>, objectName: string, primaryKeyFields: string[], watermarkField?: string) {
        return this.BuildRecord(row, objectName, primaryKeyFields, watermarkField);
    }
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
        const c = new TestSqlConnector(resolvedFor(new MockDriver()));
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
        const c = new TestDocConnector(resolvedFor(new MockDriver()));
        const schema = await c.IntrospectSchema(CI, USER);
        expect(schema.IsAuthoritative).toBe(false);
    });

    it('TestConnection passes the driver result through', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver()));
        expect((await c.TestConnection(CI, USER)).Success).toBe(true);
    });
});

describe('FetchChanges — passes STRUCTURED params, never dialect SQL', () => {
    it('incremental: sets incrementalSince {Field, Value} + defaultOrderByColumns [watermark, pk], no filter string', async () => {
        const driver = new MockDriver();
        const c = new TestSqlConnector(resolvedFor(driver));
        await c.FetchChanges(fetchCtx({ WatermarkValue: '2026-02-01T00:00:00.000Z' }));
        expect(driver.LastView?.incrementalSince).toEqual({ Field: 'updated_at', Value: '2026-02-01T00:00:00.000Z' });
        expect(driver.LastView?.defaultOrderByColumns).toEqual(['updated_at', 'id']);
        expect(driver.LastView?.filter).toBeUndefined();
    });

    it('full fetch (no watermark) omits incrementalSince but still orders by [watermark, pk]', async () => {
        const driver = new MockDriver();
        const c = new TestSqlConnector(resolvedFor(driver));
        await c.FetchChanges(fetchCtx());
        expect(driver.LastView?.incrementalSince).toBeUndefined();
        expect(driver.LastView?.defaultOrderByColumns).toEqual(['updated_at', 'id']);
    });

    it('the document family passes the identical structured params (driver translates to a Mongo query)', async () => {
        const driver = new MockDriver();
        const c = new TestDocConnector(resolvedFor(driver));
        await c.FetchChanges(fetchCtx({ WatermarkValue: '2026-02-01T00:00:00.000Z' }));
        expect(driver.LastView?.incrementalSince).toEqual({ Field: 'updated_at', Value: '2026-02-01T00:00:00.000Z' });
        expect(driver.LastView?.filter).toBeUndefined();
    });
});

describe('FetchChanges — records + incremental narrowing', () => {
    it('full fetch returns all rows with full-record pass-through + PK-derived ExternalID', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver()));
        const r = await c.FetchChanges(fetchCtx());
        expect(r.Records).toHaveLength(3);
        const first = r.Records.find(x => x.ExternalID === '1');
        expect(first).toBeDefined();
        expect(Object.keys(first!.Fields).sort()).toEqual(['email', 'id', 'updated_at']);
        expect(r.NewWatermarkValue).toBe('2026-03-01T00:00:00.000Z');
    });

    it('incremental fetch narrows to rows at/after the watermark', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver()));
        const r = await c.FetchChanges(fetchCtx({ WatermarkValue: '2026-03-01T00:00:00.000Z' }));
        expect(r.Records).toHaveLength(1);
        expect(r.Records[0].ExternalID).toBe('3');
    });

    it('HasMore + NextOffset paginate when the batch is full', async () => {
        const c = new TestSqlConnector(resolvedFor(new MockDriver()));
        const r = await c.FetchChanges(fetchCtx({ BatchSize: 2 }));
        expect(r.Records).toHaveLength(2);
        expect(r.HasMore).toBe(true);
        expect(r.NextOffset).toBe(2);
    });
});

describe('CoerceDate — ModifiedAt is timezone-stable', () => {
    const c = new TestSqlConnector(resolvedFor(new MockDriver()));
    it('a ZONELESS ISO watermark is interpreted as UTC (not server-local)', () => {
        expect(c.coerce('2026-05-01T12:00:00')?.toISOString()).toBe('2026-05-01T12:00:00.000Z');
    });
    it('a zoned ISO watermark is preserved exactly', () => {
        expect(c.coerce('2026-05-01T12:00:00Z')?.toISOString()).toBe('2026-05-01T12:00:00.000Z');
        expect(c.coerce('2026-05-01T12:00:00+05:00')?.toISOString()).toBe('2026-05-01T07:00:00.000Z');
    });
    it('a Date passes through unchanged; an unparseable value is undefined', () => {
        const d = new Date('2026-05-01T00:00:00Z');
        expect(c.coerce(d)).toBe(d);
        expect(c.coerce('not-a-date')).toBeUndefined();
    });
    it('a non-ISO shape (date-only) still parses via the Date fallback, not just the ISO helper', () => {
        expect(c.coerce('2026-05-01')?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });
    it('a numeric epoch millis value parses via the Date fallback', () => {
        expect(c.coerce(1767225600000)?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
});

describe('ReadExternalDataSourceID — error paths', () => {
    const c = new TestSqlConnector(resolvedFor(new MockDriver()));

    it('throws a clear error when Configuration is absent', () => {
        const ci = { ID: 'ci', Name: 'no-config', Configuration: null } as unknown as MJCompanyIntegrationEntity;
        expect(() => c.readExternalDataSourceID(ci)).toThrow(/requires Configuration/);
    });

    it('throws when Configuration is not valid JSON', () => {
        const ci = { ID: 'ci', Name: 'bad-json', Configuration: '{not json' } as unknown as MJCompanyIntegrationEntity;
        expect(() => c.readExternalDataSourceID(ci)).toThrow(/not valid JSON/);
    });

    it('throws when the externalDataSourceID key is absent', () => {
        const ci = { ID: 'ci', Name: 'no-key', Configuration: JSON.stringify({ other: 'x' }) } as unknown as MJCompanyIntegrationEntity;
        expect(() => c.readExternalDataSourceID(ci)).toThrow(/is required/);
    });

    it('throws when externalDataSourceID is present but blank', () => {
        const ci = { ID: 'ci', Name: 'blank-id', Configuration: JSON.stringify({ externalDataSourceID: '   ' }) } as unknown as MJCompanyIntegrationEntity;
        expect(() => c.readExternalDataSourceID(ci)).toThrow(/is required/);
    });

    it('accepts the legacy ExternalDataSourceID key as a fallback', () => {
        const ci = { ID: 'ci', Name: 'legacy-key', Configuration: JSON.stringify({ ExternalDataSourceID: 'ds-legacy' }) } as unknown as MJCompanyIntegrationEntity;
        expect(c.readExternalDataSourceID(ci)).toBe('ds-legacy');
    });

    it('trims surrounding whitespace from the resolved ID', () => {
        const ci = { ID: 'ci', Name: 'padded', Configuration: JSON.stringify({ externalDataSourceID: '  ds-1  ' }) } as unknown as MJCompanyIntegrationEntity;
        expect(c.readExternalDataSourceID(ci)).toBe('ds-1');
    });
});

describe('ContentKey — excludes the watermark column so a PK-less row updates in place instead of re-inserting', () => {
    const c = new TestSqlConnector(resolvedFor(new MockDriver()));

    it('two rows differing ONLY in the watermark column produce the SAME content key', () => {
        const before = { email: 'a@x.com', updated_at: '2026-01-01T00:00:00.000Z' };
        const after = { email: 'a@x.com', updated_at: '2026-02-01T00:00:00.000Z' };
        expect(c.contentKey(before, 'updated_at')).toBe(c.contentKey(after, 'updated_at'));
    });

    it('without a watermark field to exclude, the key changes when any column changes', () => {
        const before = { email: 'a@x.com', updated_at: '2026-01-01T00:00:00.000Z' };
        const after = { email: 'a@x.com', updated_at: '2026-02-01T00:00:00.000Z' };
        expect(c.contentKey(before)).not.toBe(c.contentKey(after));
    });

    it('a genuine content change still produces a different key', () => {
        const before = { email: 'a@x.com', updated_at: '2026-01-01T00:00:00.000Z' };
        const after = { email: 'b@x.com', updated_at: '2026-01-01T00:00:00.000Z' };
        expect(c.contentKey(before, 'updated_at')).not.toBe(c.contentKey(after, 'updated_at'));
    });

    it('BuildRecord: a PK-less row keeps the same ExternalID across an update to its watermark column (the regression this fixes)', () => {
        const before = c.buildRecord({ email: 'a@x.com', updated_at: '2026-01-01T00:00:00.000Z' }, 'events', [], 'updated_at');
        const after = c.buildRecord({ email: 'a@x.com', updated_at: '2026-02-01T00:00:00.000Z' }, 'events', [], 'updated_at');
        expect(after.ExternalID).toBe(before.ExternalID);
    });
});
