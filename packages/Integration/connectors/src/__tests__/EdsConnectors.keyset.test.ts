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

/**
 * Records the view params it receives and serves pages out of a row list. The seek itself is the driver's
 * job in production (each dialect renders `seekAfter`); here the mock only slices, so the tests assert
 * what the connector hands the driver and what it hands back to the engine.
 */
class MockSeekDriver extends BaseExternalDataSourceDriver {
    public LastView: ExternalViewParams | undefined;
    public Rows: ExternalRow[] = [...SAMPLE_ROWS];

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
        let rows = [...this.Rows];

        if (params.incrementalSince) {
            const minDate = new Date(params.incrementalSince.Value).getTime();
            rows = rows.filter(r => new Date(String(r.modified_at)).getTime() >= minDate);
        }

        const offset = params.offset ?? 0;
        const maxRows = params.maxRows ?? rows.length;
        return { success: true, rows: rows.slice(offset, offset + maxRows) as TRow[], executionTimeMs: 1 };
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
    const dataSourceType = { FilterDialect: 'tsql' } as unknown as MJExternalDataSourceTypeEntity;
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
            expect(connector.ExtractKeysetMarker({ id: 101, customer_name: 'Acme' }, ['id'])).toBe('101');
        });

        it('extracts compound JSON marker with an exact (string) watermark', () => {
            const marker = connector.ExtractKeysetMarker({ id: 101, modified_at: '2026-10-26T01:00:00.123456Z' }, ['id'], 'modified_at');
            expect(JSON.parse(marker!)).toEqual({ w: '2026-10-26T01:00:00.123456Z', k: { id: 101 } });
        });

        it('extracts composite PK marker as JSON object', () => {
            const marker = connector.ExtractKeysetMarker({ tenant_id: 'CORP1', id: 500 }, ['tenant_id', 'id']);
            expect(JSON.parse(marker!)).toEqual({ k: { tenant_id: 'CORP1', id: 500 } });
        });

        it('returns undefined when row or primaryKeyFields is empty', () => {
            expect(connector.ExtractKeysetMarker({}, [])).toBeUndefined();
            expect(connector.ExtractKeysetMarker({ id: 1 }, [])).toBeUndefined();
        });

        it('serializes a Date watermark as a millisecond range [w, wx) with the keys', () => {
            const marker = connector.ExtractKeysetMarker({ id: 7, modified_at: new Date('2026-10-26T01:00:00.123Z') }, ['id'], 'modified_at');
            expect(JSON.parse(marker!)).toEqual({ w: '2026-10-26T01:00:00.123Z', wx: '2026-10-26T01:00:00.124Z', k: { id: 7 } });
        });

        it('drops the keys from a Date marker when the whole range was consumed', () => {
            const marker = connector.ExtractKeysetMarker({ id: 7, modified_at: new Date('2026-10-26T01:00:00.123Z') }, ['id'], 'modified_at', true);
            expect(JSON.parse(marker!)).toEqual({ w: '2026-10-26T01:00:00.123Z', wx: '2026-10-26T01:00:00.124Z', k: {} });
        });

        it('records a NULL watermark explicitly (w: null) so the seek resumes inside the NULL run', () => {
            expect(JSON.parse(connector.ExtractKeysetMarker({ id: 101, modified_at: null }, ['id'], 'modified_at')!))
                .toEqual({ w: null, k: { id: 101 } });
            expect(JSON.parse(connector.ExtractKeysetMarker({ id: 102 }, ['id'], 'modified_at')!))
                .toEqual({ w: null, k: { id: 102 } });
        });
    });

    describe('ParseKeysetMarker', () => {
        it('parses scalar string marker for single PK', () => {
            expect(connector.ParseKeysetMarker('101', ['id'])).toEqual({ Keys: { id: '101' } });
        });

        it('parses the structured marker with watermark, range and keys', () => {
            const marker = JSON.stringify({ w: '2026-10-26T01:00:00.000Z', wx: '2026-10-26T01:00:00.001Z', k: { id: 101 } });
            expect(connector.ParseKeysetMarker(marker, ['id'], 'modified_at')).toEqual({
                Watermark: '2026-10-26T01:00:00.000Z',
                WatermarkUpper: '2026-10-26T01:00:00.001Z',
                Keys: { id: 101 },
            });
        });

        it('preserves a NULL watermark as null and omits an absent one', () => {
            expect(connector.ParseKeysetMarker(JSON.stringify({ w: null, k: { id: 1 } }), ['id'], 'modified_at')).toEqual({ Watermark: null, Keys: { id: 1 } });
            expect(connector.ParseKeysetMarker(JSON.stringify({ k: { id: 1 } }), ['id'], 'modified_at')).toEqual({ Keys: { id: 1 } });
        });

        it('parses composite PK JSON marker', () => {
            const parsed = connector.ParseKeysetMarker(JSON.stringify({ k: { tenant_id: 'CORP1', id: 500 } }), ['tenant_id', 'id']);
            expect(parsed?.Keys).toEqual({ tenant_id: 'CORP1', id: 500 });
        });

        it('handles malformed JSON gracefully', () => {
            expect(connector.ParseKeysetMarker('{not-json', ['id'])?.Keys).toEqual({ id: '{not-json' });
        });
    });

    describe('BuildSeekAfter', () => {
        it('builds a key-only seek with numbers kept numeric and strings stringified', () => {
            expect(connector.BuildSeekAfter({ Keys: { tenant_id: 'T1', id: 100 } }, ['tenant_id', 'id'])).toEqual({
                Keys: [{ Field: 'tenant_id', Value: 'T1' }, { Field: 'id', Value: 100 }],
            });
        });

        it('builds a (watermark, key) seek carrying the range bounds', () => {
            const seek = connector.BuildSeekAfter(
                { Watermark: '2026-10-26T01:00:00.000Z', WatermarkUpper: '2026-10-26T01:00:00.001Z', Keys: { id: 100 } },
                ['id'],
                'modified_at'
            );
            expect(seek).toEqual({
                Watermark: { Field: 'modified_at', Value: '2026-10-26T01:00:00.000Z', ExclusiveUpper: '2026-10-26T01:00:00.001Z' },
                Keys: [{ Field: 'id', Value: 100 }],
            });
        });

        it('allows empty keys only when a consumed range is present', () => {
            expect(connector.BuildSeekAfter({ Watermark: '2026-10-26T01:00:00.000Z', WatermarkUpper: '2026-10-26T01:00:00.001Z', Keys: {} }, ['id'], 'modified_at'))
                .toEqual({ Watermark: { Field: 'modified_at', Value: '2026-10-26T01:00:00.000Z', ExclusiveUpper: '2026-10-26T01:00:00.001Z' }, Keys: [] });
            expect(connector.BuildSeekAfter({ Watermark: '2026-10-26T01:00:00.000Z', Keys: {} }, ['id'], 'modified_at')).toBeUndefined();
            expect(connector.BuildSeekAfter({ Watermark: null, Keys: {} }, ['id'], 'modified_at')).toBeUndefined();
        });

        it('refuses to seek a watermark-ordered walk from a marker without a watermark', () => {
            expect(connector.BuildSeekAfter({ Keys: { id: 100 } }, ['id'], 'modified_at')).toBeUndefined();
        });

        it('refuses to seek when the marker holds only part of a composite key', () => {
            expect(connector.BuildSeekAfter({ Keys: { tenant_id: 'T1' } }, ['tenant_id', 'id'])).toBeUndefined();
        });
    });

    describe('TrimPageToWatermarkBucket', () => {
        const at = (ms: number, id: number) => ({ id, modified_at: new Date(ms) });

        it('keeps the page and reports the bucket consumed when the next row is in a later bucket', () => {
            const page = connector.TrimPageToWatermarkBucket([at(1000, 1), at(1000, 2)], at(1001, 3), 'modified_at');
            expect(page.Rows.map(r => r.id)).toEqual([1, 2]);
            expect(page.BucketConsumed).toBe(true);
        });

        it('drops the trailing rows of a bucket that straddles the page boundary', () => {
            const page = connector.TrimPageToWatermarkBucket([at(1000, 1), at(1001, 2), at(1001, 3)], at(1001, 4), 'modified_at');
            expect(page.Rows.map(r => r.id)).toEqual([1]);
            expect(page.BucketConsumed).toBe(true);
        });

        it('keeps a page that is one bucket and resumes by key inside it', () => {
            const page = connector.TrimPageToWatermarkBucket([at(1000, 1), at(1000, 2)], at(1000, 3), 'modified_at');
            expect(page.Rows.map(r => r.id)).toEqual([1, 2]);
            expect(page.BucketConsumed).toBe(false);
        });

        it('leaves non-Date and NULL watermarks alone (they are exact)', () => {
            const rows = [{ id: 1, modified_at: '2026-10-26T01:00:00.000Z' }, { id: 2, modified_at: null }];
            expect(connector.TrimPageToWatermarkBucket(rows, { id: 3, modified_at: null }, 'modified_at')).toEqual({ Rows: rows, BucketConsumed: false });
            expect(connector.TrimPageToWatermarkBucket(rows, { id: 3 }, undefined)).toEqual({ Rows: rows, BucketConsumed: false });
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
    it('initial batch returns NextAfterKeyValue and no seek for seamless engine transition', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), { WatermarkField: 'modified_at', PrimaryKeyFields: ['id'] });

        const result = await connector.FetchChanges(makeFetchContext({ BatchSize: 2, WatermarkValue: '2026-10-26T00:00:00.000Z' }));

        expect(result.Records).toHaveLength(2);
        expect(result.HasMore).toBe(true);
        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.seekAfter).toBeUndefined();
        expect(driver.LastView?.filter).toBeUndefined();

        // The marker comes from the 2nd row (id=20); string watermarks are exact, so no range is emitted.
        expect(JSON.parse(result.NextAfterKeyValue!)).toEqual({ w: '2026-10-26T01:30:00.000Z', k: { id: 20 } });
    });

    it('subsequent batch with AfterKeyValue sets offset=0 and hands the driver a structured seek, never SQL', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), { WatermarkField: 'modified_at', PrimaryKeyFields: ['id'] });

        const result = await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            WatermarkValue: '2026-10-26T00:00:00.000Z',
            CurrentOffset: 2,
            AfterKeyValue: JSON.stringify({ w: '2026-10-26T01:30:00.000Z', k: { id: 20 } }),
        }));

        expect(result.Records).toHaveLength(2);
        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.filter).toBeUndefined();
        expect(driver.LastView?.seekAfter).toEqual({
            Watermark: { Field: 'modified_at', Value: '2026-10-26T01:30:00.000Z', ExclusiveUpper: undefined },
            Keys: [{ Field: 'id', Value: 20 }],
        });
        expect(result.NextOffset).toBeUndefined();
        expect(result.NextAfterKeyValue).toBeDefined();
    });

    it('pure PK keyset seek (without watermark) passes the key and offset=0', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), { PrimaryKeyFields: ['id'] });

        const result = await connector.FetchChanges(makeFetchContext({ BatchSize: 2, CurrentOffset: 100000, AfterKeyValue: '25' }));

        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.seekAfter).toEqual({ Keys: [{ Field: 'id', Value: '25' }] });
        expect(result.NextOffset).toBeUndefined();
    });

    it('composite PK keyset seek passes every key component in order', async () => {
        const driver = new MockSeekDriver();
        const connector = new TestSeekConnector(resolvedFor(driver), { PrimaryKeyFields: ['tenant_id', 'id'] });

        await connector.FetchChanges(makeFetchContext({
            BatchSize: 2,
            CurrentOffset: 50000,
            AfterKeyValue: JSON.stringify({ k: { tenant_id: 'T1', id: 50 } }),
        }));

        expect(driver.LastView?.offset).toBe(0);
        expect(driver.LastView?.seekAfter).toEqual({ Keys: [{ Field: 'tenant_id', Value: 'T1' }, { Field: 'id', Value: 50 }] });
    });

    it('trims a page at a millisecond-bucket boundary so the next seek is exact', async () => {
        const driver = new MockSeekDriver();
        const t = (iso: string) => new Date(iso);
        driver.Rows = [
            { id: 1, modified_at: t('2026-10-26T01:00:00.100Z') },
            { id: 2, modified_at: t('2026-10-26T01:00:00.200Z') },
            { id: 3, modified_at: t('2026-10-26T01:00:00.200Z') },
            { id: 4, modified_at: t('2026-10-26T01:00:00.300Z') },
        ];
        const connector = new TestSeekConnector(resolvedFor(driver), { WatermarkField: 'modified_at', PrimaryKeyFields: ['id'] });

        const result = await connector.FetchChanges(makeFetchContext({ BatchSize: 2 }));

        // Rows 2 and 3 share a bucket that straddles the page boundary: row 2 is dropped (re-read next
        // batch) and the marker says the .100 bucket is fully consumed.
        expect(result.Records.map(r => r.Fields.id)).toEqual([1]);
        expect(result.HasMore).toBe(true);
        expect(JSON.parse(result.NextAfterKeyValue!)).toEqual({ w: '2026-10-26T01:00:00.100Z', wx: '2026-10-26T01:00:00.101Z', k: {} });
    });

    it('seeks by key inside a bucket when a whole page shares one watermark (bulk update)', async () => {
        const driver = new MockSeekDriver();
        const same = new Date('2026-10-26T01:00:00.500Z');
        driver.Rows = [1, 2, 3, 4].map(id => ({ id, modified_at: same }));
        const connector = new TestSeekConnector(resolvedFor(driver), { WatermarkField: 'modified_at', PrimaryKeyFields: ['id'] });

        const result = await connector.FetchChanges(makeFetchContext({ BatchSize: 2 }));

        expect(result.Records.map(r => r.Fields.id)).toEqual([1, 2]);
        expect(JSON.parse(result.NextAfterKeyValue!)).toEqual({ w: '2026-10-26T01:00:00.500Z', wx: '2026-10-26T01:00:00.501Z', k: { id: 2 } });

        await connector.FetchChanges(makeFetchContext({ BatchSize: 2, AfterKeyValue: result.NextAfterKeyValue }));
        expect(driver.LastView?.seekAfter).toEqual({
            Watermark: { Field: 'modified_at', Value: '2026-10-26T01:00:00.500Z', ExclusiveUpper: '2026-10-26T01:00:00.501Z' },
            Keys: [{ Field: 'id', Value: 2 }],
        });
    });

    describe('Fallback to Offset Pagination', () => {
        it('falls back to standard offset pagination when PrimaryKeyFields is empty', async () => {
            const driver = new MockSeekDriver();
            const connector = new TestSeekConnector(resolvedFor(driver), { WatermarkField: 'modified_at', PrimaryKeyFields: [] });

            const result = await connector.FetchChanges(makeFetchContext({ BatchSize: 2, CurrentOffset: 2, AfterKeyValue: 'some-key' }));

            expect(driver.LastView?.offset).toBe(2);
            expect(driver.LastView?.seekAfter).toBeUndefined();
            expect(result.NextOffset).toBe(4);
            expect(result.NextAfterKeyValue).toBeUndefined();
        });

        it('falls back to offset when the marker cannot resume the watermark ordering', async () => {
            const driver = new MockSeekDriver();
            const connector = new TestSeekConnector(resolvedFor(driver), { WatermarkField: 'modified_at', PrimaryKeyFields: ['id'] });

            await connector.FetchChanges(makeFetchContext({ BatchSize: 2, CurrentOffset: 2, AfterKeyValue: JSON.stringify({ k: { id: 20 } }) }));

            expect(driver.LastView?.offset).toBe(2);
            expect(driver.LastView?.seekAfter).toBeUndefined();
        });
    });
});
