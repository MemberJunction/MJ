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
import { BaseSqlExternalDataSourceConnector } from '../index.js';

// --- Test Fixtures & Mock Driver ---

const DESCRIPTOR: ExternalSchemaDescriptor = {
    Database: 'sales_db',
    Objects: [
        {
            Name: 'orders',
            ObjectType: 'table',
            Schema: 'dbo',
            Columns: [
                { Name: 'id', NativeType: 'int', Nullable: false, IsPrimaryKey: true },
                { Name: 'tenant_id', NativeType: 'nvarchar', Nullable: false, IsPrimaryKey: true },
                { Name: 'customer_name', NativeType: 'nvarchar', Nullable: true, IsPrimaryKey: false },
                { Name: 'modified_at', NativeType: 'datetimeoffset', Nullable: false, IsPrimaryKey: false },
            ],
            Relationships: [],
        },
    ],
};

const SAMPLE_ROWS: ExternalRow[] = [
    { id: 10, tenant_id: 'T1', customer_name: 'Acme Corp', modified_at: '2026-10-26T01:00:00.000Z' },
    { id: 20, tenant_id: 'T1', customer_name: 'Beta LLC', modified_at: '2026-10-26T01:30:00.000Z' },
    { id: 30, tenant_id: 'T1', customer_name: 'Gamma Inc', modified_at: '2026-10-26T02:00:00.000Z' },
    { id: 40, tenant_id: 'T1', customer_name: 'Delta Co', modified_at: '2026-10-26T02:30:00.000Z' },
    { id: 50, tenant_id: 'T1', customer_name: 'Epsilon Ltd', modified_at: '2026-10-26T03:00:00.000Z' },
];

class MockSeekDriver extends BaseExternalDataSourceDriver {
    public LastView: ExternalViewParams | undefined;

    public async TestConnection(): Promise<ExternalConnectionTestResult> {
        return { success: true, message: 'ok', testedAt: new Date(0) };
    }

    public async IntrospectSchema(): Promise<ExternalSchemaDescriptor> {
        return DESCRIPTOR;
    }

    public async RunView<TRow extends ExternalRow = ExternalRow>(
        _ds: MJExternalDataSourceEntity,
        params: ExternalViewParams
    ): Promise<ExternalViewResult<TRow>> {
        this.LastView = params;
        let rows = [...SAMPLE_ROWS];

        // Filter by incrementalSince if specified
        if (params.incrementalSince) {
            const minDate = new Date(params.incrementalSince.Value).getTime();
            rows = rows.filter(r => new Date(String(r.modified_at)).getTime() >= minDate);
        }

        // Apply pagination slice
        const offset = params.offset ?? 0;
        const maxRows = params.maxRows ?? rows.length;
        const sliced = rows.slice(offset, offset + maxRows);

        return {
            success: true,
            rows: sliced as TRow[],
            executionTimeMs: 1,
        };
    }

    public async LoadSingle(): Promise<null> { return null; }
    public async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(): Promise<ExternalQueryResult<TRow>> {
        return { success: true, rows: [], rowCount: 0, executionTimeMs: 0 };
    }
    protected async getConnection(): Promise<unknown> { throw new Error('not used in mock'); }
    protected async invalidateConnection(): Promise<void> { /* not used */ }
}

const CI = {
    ID: 'ci-seek-01',
    Name: 'CI Keyset Seek Test',
    IntegrationID: 'int-01',
    Configuration: JSON.stringify({ externalDataSourceID: 'ds-01' }),
} as unknown as MJCompanyIntegrationEntity;

const USER = { ID: 'user-seek' } as unknown as UserInfo;

function resolvedFor(driver: BaseExternalDataSourceDriver): ResolvedExternalDataSource {
    const dataSource = { ID: 'ds-01', Name: 'ds-01', DefaultSchema: 'dbo' } as unknown as MJExternalDataSourceEntity;
    const dataSourceType = { FilterDialect: 'sqlserver' } as unknown as MJExternalDataSourceTypeEntity;
    return { dataSource, dataSourceType, driver };
}

class TestSeekConnector extends BaseSqlExternalDataSourceConnector {
    public override get IntegrationName(): string { return 'Test Seek Connector'; }
    constructor(
        private readonly Resolved: ResolvedExternalDataSource,
        private readonly MetaOverride: { WatermarkField?: string; PrimaryKeyFields: string[] }
    ) {
        super();
    }
    protected override async Resolve(): Promise<ResolvedExternalDataSource> { return this.Resolved; }
    protected override async ResolveObjectMeta(): Promise<{ WatermarkField?: string; PrimaryKeyFields: string[] }> {
        return this.MetaOverride;
    }
}

const makeFetchContext = (overrides: Partial<FetchContext> = {}): FetchContext => ({
    CompanyIntegration: CI,
    ObjectName: 'orders',
    WatermarkValue: null,
    BatchSize: 2,
    ContextUser: USER,
    CurrentOffset: 0,
    ...overrides,
});

// --- Test Suites ---

describe('BaseExternalDataSourceConnector — Keyset Marker Extraction & Parsing', () => {
    const connector = new TestSeekConnector(resolvedFor(new MockSeekDriver()), { PrimaryKeyFields: ['id'] });

    describe('ExtractKeysetMarker', () => {
        it('extracts scalar string marker for single PK without watermark', () => {
            const row = { id: 101, customer_name: 'Acme' };
            const marker = connector.ExtractKeysetMarker(row, ['id']);
            expect(marker).toBe('101');
        });

        it('extracts compound JSON marker when watermarkField is provided', () => {
            const row = { id: 101, modified_at: '2026-10-26T01:00:00.000Z', customer_name: 'Acme' };
            const marker = connector.ExtractKeysetMarker(row, ['id'], 'modified_at');
            expect(marker).toBeDefined();

            const parsed = JSON.parse(marker!);
            expect(parsed.w).toBe('2026-10-26T01:00:00.000Z');
            expect(parsed.k).toEqual({ id: 101 });
        });

        it('extracts composite PK marker as JSON object', () => {
            const row = { tenant_id: 'CORP1', id: 500, customer_name: 'Acme' };
            const marker = connector.ExtractKeysetMarker(row, ['tenant_id', 'id']);
            expect(marker).toBeDefined();

            const parsed = JSON.parse(marker!);
            expect(parsed.k).toEqual({ tenant_id: 'CORP1', id: 500 });
        });

        it('returns undefined when row or primaryKeyFields is empty', () => {
            expect(connector.ExtractKeysetMarker({}, [])).toBeUndefined();
            expect(connector.ExtractKeysetMarker({ id: 1 }, [])).toBeUndefined();
        });

        it('preserves full-precision timestamp string in marker', () => {
            const row = { id: 101, modified_at: '2026-10-26T01:00:00.123456Z' };
            const marker = connector.ExtractKeysetMarker(row, ['id'], 'modified_at');
            expect(marker).toBeDefined();

            const parsed = JSON.parse(marker!);
            expect(parsed.w).toBe('2026-10-26T01:00:00.123456Z');
            expect(parsed.k).toEqual({ id: 101 });
        });

        it('omits w property when watermark on row is null or undefined', () => {
            const rowNull = { id: 101, modified_at: null };
            const markerNull = connector.ExtractKeysetMarker(rowNull, ['id'], 'modified_at');
            expect(markerNull).toBe(JSON.stringify({ k: { id: 101 } }));
            const parsedNull = JSON.parse(markerNull!);
            expect(parsedNull.w).toBeUndefined();
            expect(parsedNull.k).toEqual({ id: 101 });

            const rowUndef = { id: 102 };
            const markerUndef = connector.ExtractKeysetMarker(rowUndef, ['id'], 'modified_at');
            expect(markerUndef).toBe(JSON.stringify({ k: { id: 102 } }));
            const parsedUndef = JSON.parse(markerUndef!);
            expect(parsedUndef.w).toBeUndefined();
            expect(parsedUndef.k).toEqual({ id: 102 });
        });
    });

    describe('ParseKeysetMarker', () => {
        it('parses scalar string marker for single PK', () => {
            const parsed = connector.ParseKeysetMarker('101', ['id']);
            expect(parsed).toEqual({ Keys: { id: '101' } });
        });

        it('parses structured JSON compound marker with watermark and PK', () => {
            const marker = JSON.stringify({ w: '2026-10-26T01:00:00.000Z', k: { id: 101 } });
            const parsed = connector.ParseKeysetMarker(marker, ['id'], 'modified_at');
            expect(parsed).toEqual({
                Watermark: '2026-10-26T01:00:00.000Z',
                Keys: { id: 101 },
            });
        });

        it('parses composite PK JSON marker', () => {
            const marker = JSON.stringify({ k: { tenant_id: 'CORP1', id: 500 } });
            const parsed = connector.ParseKeysetMarker(marker, ['tenant_id', 'id']);
            expect(parsed?.Keys).toEqual({ tenant_id: 'CORP1', id: 500 });
        });

        it('handles malformed JSON gracefully', () => {
            const parsed = connector.ParseKeysetMarker('{not-json', ['id']);
            // Falls back to treating as scalar string for single PK
            expect(parsed?.Keys).toEqual({ id: '{not-json' });
        });
    });

    describe('BuildKeysetFilter', () => {
        it('builds single column numeric seek filter', () => {
            const filter = connector.BuildKeysetFilter({ Keys: { id: 101 } }, ['id'], undefined, 'sqlserver');
            expect(filter).toBe('[id] > 101');
        });

        it('builds single column string seek filter with SQL escaping', () => {
            const filter = connector.BuildKeysetFilter({ Keys: { code: "O'Reilly" } }, ['code'], undefined, 'sqlserver');
            expect(filter).toBe("[code] > 'O''Reilly'");
        });

        it('builds composite PK seek filter: (k1 > v1) OR (k1 = v1 AND k2 > v2)', () => {
            const filter = connector.BuildKeysetFilter(
                { Keys: { tenant_id: 'T1', id: 100 } },
                ['tenant_id', 'id'],
                undefined,
                'sqlserver'
            );
            expect(filter).toBe("(([tenant_id] > 'T1') OR ([tenant_id] = 'T1' AND [id] > 100))");
        });

        it('builds compound (Watermark, PK) seek filter for SQL Server', () => {
            const filter = connector.BuildKeysetFilter(
                { Watermark: '2026-10-26T01:00:00.000Z', Keys: { id: 100 } },
                ['id'],
                'modified_at',
                'sqlserver'
            );
            expect(filter).toBe("([modified_at] > '2026-10-26T01:00:00.000Z') OR ([modified_at] = '2026-10-26T01:00:00.000Z' AND [id] > 100)");
        });

        it('builds compound seek filter for Postgres / ANSI dialect', () => {
            const filter = connector.BuildKeysetFilter(
                { Watermark: '2026-10-26T01:00:00.000Z', Keys: { id: 100 } },
                ['id'],
                'modified_at',
                'postgres'
            );
            expect(filter).toBe('("modified_at" > \'2026-10-26T01:00:00.000Z\') OR ("modified_at" = \'2026-10-26T01:00:00.000Z\' AND "id" > 100)');
        });

        it('builds compound seek filter for MySQL / Databricks dialect', () => {
            const filter = connector.BuildKeysetFilter(
                { Watermark: '2026-10-26T01:00:00.000Z', Keys: { id: 100 } },
                ['id'],
                'modified_at',
                'mysql'
            );
            expect(filter).toBe("(`modified_at` > '2026-10-26T01:00:00.000Z') OR (`modified_at` = '2026-10-26T01:00:00.000Z' AND `id` > 100)");
        });

        it('quotes numeric-looking varchar PK strings instead of stripping quotes', () => {
            const filter = connector.BuildKeysetFilter(
                { Keys: { code: '00123' } },
                ['code'],
                undefined,
                'sqlserver'
            );
            expect(filter).toBe("[code] > '00123'");
        });

        it('generates seek solely on PK condition when watermark is absent, empty, or null', () => {
            const filterAbsent = connector.BuildKeysetFilter(
                { Keys: { id: 101 } },
                ['id'],
                'modified_at',
                'sqlserver'
            );
            expect(filterAbsent).toBe('[id] > 101');
            expect(filterAbsent).not.toContain('null');
            expect(filterAbsent).not.toContain('modified_at');

            const filterNull = connector.BuildKeysetFilter(
                { Watermark: undefined, Keys: { id: 101 } },
                ['id'],
                'modified_at',
                'sqlserver'
            );
            expect(filterNull).toBe('[id] > 101');
            expect(filterNull).not.toContain('null');

            const filterEmpty = connector.BuildKeysetFilter(
                { Watermark: '', Keys: { id: 101 } },
                ['id'],
                'modified_at',
                'sqlserver'
            );
            expect(filterEmpty).toBe('[id] > 101');
            expect(filterEmpty).not.toContain('null');
        });
    });

    describe('StableOrderingKey', () => {
        it('returns null for objects with or without watermarks to preserve timestamp ingestion', () => {
            expect(connector.StableOrderingKey('orders')).toBeNull();
            expect(connector.StableOrderingKey('customers')).toBeNull();
        });
    });
});

describe('BaseExternalDataSourceConnector — FetchChanges with Keyset Seek Pagination', () => {
    it('initial batch returns NextAfterKeyValue and NextOffset for seamless engine transition', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), {
            WatermarkField: 'modified_at',
            PrimaryKeyFields: ['id'],
        });

        // Batch size = 2, total sample rows = 4. Initial fetch has no AfterKeyValue.
        const result = await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            WatermarkValue: '2026-10-26T00:00:00.000Z',
        }));

        expect(result.Records).toHaveLength(2);
        expect(result.HasMore).toBe(true);

        // Driver received offset = 0 and no filter on initial batch
        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.filter).toBeUndefined();

        // NextAfterKeyValue is extracted from the 2nd row (id=20, modified_at=2026-10-26T01:30:00.000Z)
        expect(result.NextAfterKeyValue).toBeDefined();
        const parsedMarker = JSON.parse(result.NextAfterKeyValue!);
        expect(parsedMarker.k).toEqual({ id: 20 });
        expect(parsedMarker.w).toBe('2026-10-26T01:30:00.000Z');
    });

    it('subsequent batch with AfterKeyValue sets offset=0 and applies keyset seek filter', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), {
            WatermarkField: 'modified_at',
            PrimaryKeyFields: ['id'],
        });

        const resumeMarker = JSON.stringify({
            w: '2026-10-26T01:30:00.000Z',
            k: { id: 20 },
        });

        // Subsequent call passes AfterKeyValue
        const result = await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            WatermarkValue: '2026-10-26T00:00:00.000Z',
            CurrentOffset: 2, // Would have been offset 2 in legacy pagination
            AfterKeyValue: resumeMarker,
        }));

        expect(result.Records).toHaveLength(2);

        // Crucial verification: offset is 0, eliminating deep index scanning penalty
        expect(driver.LastView?.offset).toBe(0);

        // Keyset filter was emitted
        expect(driver.LastView?.filter).toBeDefined();
        expect(driver.LastView?.filter).toContain("[modified_at] > '2026-10-26T01:30:00.000Z'");
        expect(driver.LastView?.filter).toContain('[id] > 20');

        // NextOffset is undefined when using keyset seek
        expect(result.NextOffset).toBeUndefined();

        // NextAfterKeyValue points to newest row in this batch
        expect(result.NextAfterKeyValue).toBeDefined();
    });

    it('pure PK keyset seek (without watermark) sets filter [id] > value and offset=0', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), {
            PrimaryKeyFields: ['id'], // No WatermarkField
        });

        const result = await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            CurrentOffset: 100000,
            AfterKeyValue: '25',
        }));

        // Offset bypassed
        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.filter).toBe("[id] > '25'");
        expect(result.NextOffset).toBeUndefined();
    });

    it('pure PK keyset seek with numeric JSON marker produces unquoted numeric filter', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), {
            PrimaryKeyFields: ['id'],
        });

        await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            AfterKeyValue: JSON.stringify({ k: { id: 25 } }),
        }));

        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.filter).toBe('[id] > 25');
    });

    it('composite PK keyset seek applies composite condition and offset=0', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), {
            PrimaryKeyFields: ['tenant_id', 'id'],
        });

        const compositeMarker = JSON.stringify({
            k: { tenant_id: 'T1', id: 50 },
        });

        await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            CurrentOffset: 50000,
            AfterKeyValue: compositeMarker,
        }));

        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.filter).toBe("(([tenant_id] > 'T1') OR ([tenant_id] = 'T1' AND [id] > 50))");
    });

    describe('Fallback to Offset Pagination', () => {
        it('falls back to standard offset pagination when PrimaryKeyFields is empty', async () => {
            const driver = new MockSeekDriver();
            const connector = new TestSeekConnector(resolvedFor(driver), {
                WatermarkField: 'modified_at',
                PrimaryKeyFields: [], // No PK available!
            });

            const result = await connector.FetchChanges(makeFetchContext({
                BatchSize: 2,
                CurrentOffset: 2,
                AfterKeyValue: 'some-key',
            }));

            // Because no PK exists, keyset is not applicable; uses CurrentOffset
            expect(driver.LastView?.offset).toBe(2);
            expect(driver.LastView?.filter).toBeUndefined();

            // NextOffset is populated and NextAfterKeyValue is undefined
            expect(result.NextOffset).toBe(4);
            expect(result.NextAfterKeyValue).toBeUndefined();
        });
    });
});
