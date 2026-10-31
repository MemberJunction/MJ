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
    type ExternalSeekAfter,
} from '@memberjunction/external-data-sources';
import type { FetchContext, FetchBatchResult } from '@memberjunction/integration-engine';
import { BaseSqlExternalDataSourceConnector } from '../index.js';

/**
 * Whole-walk tests: a simulated driver applies `seekAfter`, ordering, offset and maxRows to an in-memory
 * table, and a loop hands each batch's NextOffset/NextAfterKeyValue back exactly as IntegrationEngine
 * does. Every test asserts that the walk visits every row exactly once.
 */

/** One stored row: what the driver returns, plus the watermark at full (100 ns) precision. */
interface StoredRow {
    Row: ExternalRow;
    /** Full-precision watermark in 100 ns ticks; null for a NULL watermark. */
    Ticks?: number | null;
}

const WATERMARK = 'modified_at';
const TICKS_PER_MS = 10_000;

/** ISO literal → ticks (the literal carries whole milliseconds). */
const literalTicks = (iso: string): number => new Date(iso).getTime() * TICKS_PER_MS;

class SimulatedDriver extends BaseExternalDataSourceDriver {
    public Views: ExternalViewParams[] = [];
    /**
     * Mongo-style type bracketing: a number never compares to a string, so `{ id: { $gt: '2' } }` matches
     * no numeric id. Off = SQL-style implicit conversion.
     */
    public StrictTypes = false;

    constructor(private readonly Table: StoredRow[]) { super(); }

    public async TestConnection(): Promise<ExternalConnectionTestResult> {
        return { success: true, message: 'ok', testedAt: new Date(0) };
    }
    public async IntrospectSchema(): Promise<ExternalSchemaDescriptor> {
        return { Database: 'db', Objects: [] };
    }
    public async RunView<TRow extends ExternalRow = ExternalRow>(_ds: MJExternalDataSourceEntity, params: ExternalViewParams): Promise<ExternalViewResult<TRow>> {
        this.Views.push(params);
        const seek = params.seekAfter;
        const matched = this.Table.filter(r => !seek || this.after(r, seek));
        const order = params.defaultOrderByColumns ?? [];
        matched.sort((a, b) => this.compareRows(a, b, order));
        const offset = params.offset ?? 0;
        const page = matched.slice(offset, offset + (params.maxRows ?? matched.length));
        return { success: true, rows: page.map(r => ({ ...r.Row })) as TRow[], executionTimeMs: 0 };
    }
    public async LoadSingle(): Promise<null> { return null; }
    public async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(): Promise<ExternalQueryResult<TRow>> {
        return { success: true, rows: [], rowCount: 0, executionTimeMs: 0 };
    }
    protected async getConnection(): Promise<unknown> { throw new Error('not used'); }
    protected async invalidateConnection(): Promise<void> { /* not used */ }

    /** NULL (and a missing value) sorts first, as in SQL Server and BSON. */
    private compareValues(a: unknown, b: unknown): number {
        if (a == null || b == null) {
            return a == null ? (b == null ? 0 : -1) : 1;
        }
        return a < b ? -1 : a > b ? 1 : 0;
    }
    private compareRows(a: StoredRow, b: StoredRow, order: string[]): number {
        for (const column of order) {
            const c = column === WATERMARK ? this.compareValues(a.Ticks, b.Ticks) : this.compareValues(a.Row[column], b.Row[column]);
            if (c !== 0) return c;
        }
        return 0;
    }

    /** `value > bound` / `value = bound` under the configured type rules; false when incomparable. */
    private keyCompare(value: unknown, bound: string | number): number | undefined {
        if (value == null) return undefined;
        if (this.StrictTypes && typeof value !== typeof bound) return undefined;
        const left = typeof bound === 'number' ? Number(value) : value;
        const right = typeof value === 'number' ? Number(bound) : bound;
        return left < right ? -1 : left > right ? 1 : 0;
    }
    private keysAfter(row: ExternalRow, keys: ExternalSeekAfter['Keys']): boolean {
        return keys.some((key, i) =>
            keys.slice(0, i).every(k => this.keyCompare(row[k.Field], k.Value) === 0) && this.keyCompare(row[key.Field], key.Value) === 1);
    }

    /** The contract of ExternalSeekAfter, evaluated at full precision. */
    private after(r: StoredRow, seek: ExternalSeekAfter): boolean {
        const keysAfter = seek.Keys.length > 0 ? this.keysAfter(r.Row, seek.Keys) : undefined;
        if (!seek.Watermark) return keysAfter === true;
        const ticks = r.Ticks ?? null;
        const { Value, ExclusiveUpper, WithinRange } = seek.Watermark;
        if (Value === null) return ticks === null ? keysAfter === true : true;
        if (ticks === null) return false;
        const lower = literalTicks(Value);
        if (ExclusiveUpper) {
            const upper = literalTicks(ExclusiveUpper);
            const inRange = ticks >= lower && ticks < upper;
            if (WithinRange) return inRange && (keysAfter ?? true);
            return ticks >= upper || (inRange && keysAfter === true);
        }
        return ticks > lower || (ticks === lower && keysAfter === true);
    }
}

const CI = { ID: 'ci', Name: 'ci', IntegrationID: 'int', Configuration: JSON.stringify({ externalDataSourceID: 'ds' }) } as unknown as MJCompanyIntegrationEntity;
const USER = {} as unknown as UserInfo;

class WalkConnector extends BaseSqlExternalDataSourceConnector {
    public override get IntegrationName(): string { return 'Walk'; }
    constructor(private readonly Driver: SimulatedDriver, private readonly Meta: { WatermarkField?: string; PrimaryKeyFields: string[] }) { super(); }
    protected override async Resolve(): Promise<ResolvedExternalDataSource> {
        const dataSource = { ID: 'ds', Name: 'ds', DefaultSchema: 'dbo' } as unknown as MJExternalDataSourceEntity;
        return { dataSource, dataSourceType: {} as unknown as MJExternalDataSourceTypeEntity, driver: this.Driver };
    }
    protected override async ResolveObjectMeta(): Promise<{ WatermarkField?: string; PrimaryKeyFields: string[] }> { return this.Meta; }
}

/** Runs FetchChanges to completion the way IntegrationEngine does and returns every ExternalID in order. */
async function walk(connector: WalkConnector, batchSize: number): Promise<string[]> {
    const ids: string[] = [];
    let currentOffset: number | undefined;
    let afterKey: string | undefined;
    for (let i = 0; i < 100; i++) {
        const ctx: FetchContext = {
            CompanyIntegration: CI, ObjectName: 't', WatermarkValue: null, BatchSize: batchSize, ContextUser: USER,
            CurrentOffset: currentOffset, AfterKeyValue: afterKey ?? null,
        };
        const batch: FetchBatchResult = await connector.FetchChanges(ctx);
        ids.push(...batch.Records.map(r => r.ExternalID));
        if (!batch.HasMore) return ids;
        currentOffset = batch.NextOffset;
        afterKey = batch.NextAfterKeyValue ?? afterKey;
    }
    throw new Error(`walk did not finish; read so far: ${ids.join(',')}`);
}

/** A row whose watermark is `ms` milliseconds plus `subTicks` 100 ns ticks; the driver hands back a whole-ms Date. */
const stamped = (id: number, ms: number, subTicks = 0): StoredRow => ({
    Row: { id, [WATERMARK]: new Date(ms) },
    Ticks: ms * TICKS_PER_MS + subTicks,
});

describe('keyset walk — every row exactly once', () => {
    it('numeric single keys stay numeric across batches (Mongo type bracketing would otherwise end the walk)', async () => {
        const driver = new SimulatedDriver([1, 2, 3, 4, 5].map(id => ({ Row: { id } })));
        driver.StrictTypes = true;
        const ids = await walk(new WalkConnector(driver, { PrimaryKeyFields: ['id'] }), 2);
        expect(ids).toEqual(['1', '2', '3', '4', '5']);
        expect(driver.Views[1].seekAfter).toEqual({ Keys: [{ Field: 'id', Value: 2 }] });
    });

    it('a bucket of distinct sub-millisecond stamps larger than the batch is walked by key, skipping nothing', async () => {
        const base = Date.UTC(2026, 9, 26, 1, 0, 0, 500);
        // Six rows in one millisecond; the sub-millisecond order runs AGAINST the key order.
        const bucket = [6, 5, 4, 3, 2, 1].map((id, i) => stamped(id, base, i + 1));
        const driver = new SimulatedDriver([stamped(10, base - 5), ...bucket, stamped(20, base + 7)]);
        const ids = await walk(new WalkConnector(driver, { WatermarkField: WATERMARK, PrimaryKeyFields: ['id'] }), 2);
        expect([...ids].sort()).toEqual(['1', '10', '2', '20', '3', '4', '5', '6']);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('a bulk-stamped bucket (identical stamps) larger than the batch is read once', async () => {
        const base = Date.UTC(2026, 9, 26, 1, 0, 0, 500);
        const driver = new SimulatedDriver([1, 2, 3, 4, 5].map(id => stamped(id, base)));
        const ids = await walk(new WalkConnector(driver, { WatermarkField: WATERMARK, PrimaryKeyFields: ['id'] }), 2);
        expect(ids).toEqual(['1', '2', '3', '4', '5']);
    });

    it('a marker that cannot seek mid-walk resumes at the walk position, not at row 0', async () => {
        // A composite key whose second part is missing on one document: the marker built from it holds
        // only part of the key, so it cannot seek. The walk must continue from its position.
        const rows: StoredRow[] = [
            { Row: { t: 'A', id: 1 } }, { Row: { t: 'A', id: 2 } }, { Row: { t: 'A', id: 3 } },
            { Row: { t: 'B', id: 1 } }, { Row: { t: 'B', id: 2 } }, { Row: { t: 'C' } },
            { Row: { t: 'D', id: 1 } }, { Row: { t: 'D', id: 2 } },
        ];
        const driver = new SimulatedDriver(rows);
        const ids = await walk(new WalkConnector(driver, { PrimaryKeyFields: ['t', 'id'] }), 2);
        expect(ids).toEqual(['A|1', 'A|2', 'A|3', 'B|1', 'B|2', 'C|', 'D|1', 'D|2']);
    });
});
