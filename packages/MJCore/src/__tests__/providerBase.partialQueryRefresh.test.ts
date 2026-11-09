/**
 * Partial metadata refresh for the saved-query family.
 *
 * Agents (Skip persists a saved query per analysis step) write MJ: Queries / Query Fields /
 * Query Entities / Query Parameters continuously. Every such write moves the timestamps of
 * those MJ_Metadata dataset items, and the provider used to answer with a FULL reload —
 * rebuilding every EntityInfo / EntityFieldInfo (hundreds of MB on a large schema) to pick
 * up a handful of QueryInfo rows. On a busy server that was a fresh half-gigabyte graph every
 * refresh window until the process hit its memory guard.
 *
 * These tests pin the scoped behaviour: when the only stale items are the query family, the
 * provider reloads just those items (the rest of the dataset is requested with a `1=0`
 * filter, so the dataset definition — columns, where clauses, post-processing — is reused
 * verbatim and nothing else is read), swaps them in, and leaves every other metadata array
 * untouched. A change only to items the metadata build never reads (Dashboards) reloads
 * nothing. Anything else stale, or an explicit Refresh(), still takes the full path. A refresh
 * prompted by a member-entity write knows something changed, so for it "no item moved at all" is
 * a full reload, not "nothing to do": a committed write can leave the item's max stamp and row
 * count where they were (PostgreSQL stamps `NOW()`, the transaction start).
 *
 * They also pin the retry policy: a failed timestamp read, scoped reload or full reload keeps
 * the metadata already loaded and is retried on a backoff, instead of escalating to a full
 * reload at the moment the server is least able to afford one. Only the
 * `MetadataScopedReloadAttempts`-th scoped failure in a row falls back to the full reload.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ProviderBase } from '../generic/providerBase';
import { LogEntry, RegisterLogSink } from '../generic/logging';
import {
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
    ProviderConfigDataBase,
} from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

type Row = Record<string, unknown>;

/** The retry ladder a failed refresh climbs; the last delay repeats. */
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

/**
 * The MJ_Metadata items as the shared mock declares them (Code → entity name), plus the two
 * Dashboards items the shipped MJ_Metadata dataset carries (metadata/datasets/.datasets.json)
 * that GetAllMetadata never reads.
 */
const ITEMS: ReadonlyArray<{ Code: string; EntityName: string; EntityID: string }> = [
    { Code: 'Applications', EntityName: 'MJ: Applications', EntityID: '1' },
    { Code: 'Entities', EntityName: 'MJ: Entities', EntityID: '2' },
    { Code: 'EntityFields', EntityName: 'MJ: Entity Fields', EntityID: '3' },
    { Code: 'EntityFieldValues', EntityName: 'MJ: Entity Field Values', EntityID: '4' },
    { Code: 'EntityPermissions', EntityName: 'MJ: Entity Permissions', EntityID: '5' },
    { Code: 'EntityRelationships', EntityName: 'MJ: Entity Relationships', EntityID: '6' },
    { Code: 'EntitySettings', EntityName: 'MJ: Entity Settings', EntityID: '7' },
    { Code: 'ApplicationEntities', EntityName: 'MJ: Application Entities', EntityID: '8' },
    { Code: 'ApplicationSettings', EntityName: 'MJ: Application Settings', EntityID: '9' },
    { Code: 'Roles', EntityName: 'MJ: Roles', EntityID: '10' },
    { Code: 'RowLevelSecurityFilters', EntityName: 'MJ: Row Level Security Filters', EntityID: '11' },
    { Code: 'AuditLogTypes', EntityName: 'MJ: Audit Log Types', EntityID: '12' },
    { Code: 'Authorizations', EntityName: 'MJ: Authorizations', EntityID: '13' },
    { Code: 'QueryCategories', EntityName: 'MJ: Query Categories', EntityID: '14' },
    { Code: 'Queries', EntityName: 'MJ: Queries', EntityID: '15' },
    { Code: 'QueryFields', EntityName: 'MJ: Query Fields', EntityID: '16' },
    { Code: 'QueryPermissions', EntityName: 'MJ: Query Permissions', EntityID: '17' },
    { Code: 'QueryEntities', EntityName: 'MJ: Query Entities', EntityID: '18' },
    { Code: 'QueryParameters', EntityName: 'MJ: Query Parameters', EntityID: '19' },
    { Code: 'EntityDocumentTypes', EntityName: 'MJ: Entity Document Types', EntityID: '20' },
    { Code: 'Libraries', EntityName: 'MJ: Libraries', EntityID: '21' },
    { Code: 'ExplorerNavigationItems', EntityName: 'MJ: Explorer Navigation Items', EntityID: '22' },
    { Code: 'EntityOrganicKeys', EntityName: 'MJ: Entity Organic Keys', EntityID: '23' },
    { Code: 'EntityOrganicKeyRelatedEntities', EntityName: 'MJ: Entity Organic Key Related Entities', EntityID: '24' },
    { Code: 'Dashboards', EntityName: 'MJ: Dashboards', EntityID: '25' },
    { Code: 'Dashboard_Categories', EntityName: 'MJ: Dashboard Categories', EntityID: '26' },
];

const T0 = new Date('2026-01-01T00:00:00.000Z');

const ENTITY_FIELDS: Row[] = [
    { ID: 'f1', EntityID: 'e1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
    { ID: 'f2', EntityID: 'e1', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
];

/**
 * A provider whose MJ_Metadata dataset and status are fully scripted: per-item rows, per-item
 * timestamps, and a record of every dataset read (with the item filters it carried).
 */
class PartialRefreshProvider extends TestMetadataProvider {
    public rows: Record<string, Row[]> = {
        Entities: [{ ID: 'e1', Name: 'Test Entity', SchemaName: 'dbo', BaseView: 'vwTestEntity', BaseTable: 'TestEntity', EntityFields: ENTITY_FIELDS }],
        EntityFields: ENTITY_FIELDS,
        Queries: [{ ID: 'q1', Name: 'First Query', Status: 'Approved', CategoryID: null }],
        QueryFields: [{ ID: 'qf1', QueryID: 'q1', Name: 'Total', Sequence: 1 }],
    };
    /** Per-item stamps the status query reports; the test moves one to make that item stale. */
    public stamps: Record<string, { UpdatedAt: Date; RowCount: number }> = {};
    /** Every MJ_Metadata dataset read, with the item filters it was asked for. */
    public datasetReads: DatasetItemFilterType[][] = [];
    /** For each dataset read, whether it ran inside the RefreshWithinTransaction window (MJ#4836). */
    public readsJoinedTransaction: boolean[] = [];
    /** How many staleness checks ran (CheckToSeeIfRefreshNeeded calls). */
    public refreshChecks = 0;
    /** When set, a scoped read (one carrying `1=0` filters) reports this item as failed. */
    public failScopedItem: string | null = null;
    /** When set, a full read (no `1=0` filters) fails — the shape a dropped connection gives. */
    public failFullRead = false;
    /** When set, the status query answers unsuccessfully — what an exhausted pool gives. */
    public failStatus = false;
    /** How many status queries ran. */
    public statusReads = 0;
    /** Runs once during the next scoped read, after the read has suspended, then clears. */
    public onScopedRead: (() => void) | null = null;

    constructor(private readonly store?: ILocalStorageProvider) {
        super();
        this.setMockDelay(0);
        for (const item of ITEMS) {
            this.stamps[item.Code] = { UpdatedAt: T0, RowCount: (this.rows[item.Code] ?? []).length };
        }
    }

    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.store ?? super.LocalStorageProvider;
    }

    /** Moves one item's stamp forward and grows its row count — what a saved write does. */
    public touch(code: string, extraRow?: Row): void {
        const s = this.stamps[code];
        s.UpdatedAt = new Date(s.UpdatedAt.getTime() + 1000);
        if (extraRow) {
            (this.rows[code] ??= []).push(extraRow);
        }
        s.RowCount = (this.rows[code] ?? []).length;
    }

    public override async CheckToSeeIfRefreshNeeded(providerToUse?: IMetadataProvider, bypassMinCheckInterval?: boolean): Promise<boolean> {
        this.refreshChecks++;
        return super.CheckToSeeIfRefreshNeeded(providerToUse, bypassMinCheckInterval);
    }

    public override async GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], _contextUser?: UserInfo, _providerToUse?: IMetadataProvider): Promise<DatasetResultType> {
        this.datasetReads.push(itemFilters ?? []);
        this.readsJoinedTransaction.push(this.MetadataReadsJoinTransaction);
        const suppressed = new Set((itemFilters ?? []).filter(f => f.Filter === '1=0').map(f => f.ItemCode));
        const scoped = suppressed.size > 0;
        if (!scoped && this.failFullRead) {
            return { DatasetID: 'md', DatasetName: datasetName, Success: false, Status: 'scripted full-read failure', LatestUpdateDate: new Date(0), Results: [] };
        }
        if (scoped && this.onScopedRead) {
            await new Promise(resolve => setTimeout(resolve, 0)); // a real read suspends here
            const hook = this.onScopedRead;
            this.onScopedRead = null;
            hook();
        }
        return {
            DatasetID: 'md',
            DatasetName: datasetName,
            Success: true,
            Status: 'Success',
            LatestUpdateDate: new Date(),
            Results: ITEMS.map(item => {
                const failed = scoped && this.failScopedItem === item.Code;
                return {
                    Code: item.Code,
                    EntityName: item.EntityName,
                    EntityID: item.EntityID,
                    Results: suppressed.has(item.Code) || failed ? [] : [...(this.rows[item.Code] ?? [])],
                    LatestUpdateDate: this.stamps[item.Code].UpdatedAt,
                    Success: !failed,
                    Status: failed ? 'scripted failure' : undefined,
                };
            }),
        };
    }

    public override async GetDatasetStatusByName(datasetName: string): Promise<DatasetStatusResultType> {
        this.statusReads++;
        if (this.failStatus) {
            return { DatasetID: 'md', DatasetName: datasetName, Success: false, Status: 'No update dates found', LatestUpdateDate: new Date(0), EntityUpdateDates: [] };
        }
        const dates = ITEMS.map(item => ({
            EntityName: item.EntityName,
            EntityID: item.EntityID,
            UpdateDate: this.stamps[item.Code].UpdatedAt,
            RowCount: this.stamps[item.Code].RowCount,
        }));
        return {
            DatasetID: 'md',
            DatasetName: datasetName,
            Success: true,
            Status: 'Ready',
            LatestUpdateDate: new Date(Math.max(...dates.map(d => d.UpdateDate.getTime()))),
            EntityUpdateDates: dates,
        };
    }

    /** The scoped-read signature: the codes this read asked to skip. */
    public suppressedCodes(read: DatasetItemFilterType[]): string[] {
        return read.filter(f => f.Filter === '1=0').map(f => f.ItemCode).sort();
    }

    public lastRead(): DatasetItemFilterType[] {
        return this.datasetReads[this.datasetReads.length - 1];
    }
}

const QUERY_FAMILY = ['QueryCategories', 'Queries', 'QueryFields', 'QueryPermissions', 'QueryEntities', 'QueryParameters'];
const EVERYTHING_ELSE = ITEMS.map(i => i.Code).filter(c => !QUERY_FAMILY.includes(c)).sort();

describe('ProviderBase — partial refresh of the saved-query family', () => {
    let provider: PartialRefreshProvider;
    let config: ProviderConfigDataBase;

    beforeEach(async () => {
        provider = new PartialRefreshProvider();
        config = new ProviderConfigDataBase({}, '__mj', [], [], true);
        await provider.Config(config);
        expect(provider.datasetReads).toHaveLength(1);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]); // the first load is a full one
        expect(provider.Entities).toHaveLength(1);
        expect(provider.Queries).toHaveLength(1);
    });

    it('exposes the refreshable family as the query dataset items', () => {
        expect([...ProviderBase.PartialRefreshMetadataItemCodes].sort()).toEqual(expect.arrayContaining(QUERY_FAMILY.slice().sort()));
        expect(ProviderBase.PartialRefreshMetadataItemCodes).not.toContain('Entities');
    });

    it('a saved-query write reloads only the query items and leaves every other array untouched', async () => {
        const entitiesBefore = provider.Entities;
        const applicationsBefore = provider.Applications;
        const entityObjectBefore = provider.Entities[0];

        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider.touch('QueryFields', { ID: 'qf2', QueryID: 'q2', Name: 'Count', Sequence: 1 });

        expect(await provider.RefreshIfNeeded(undefined, true)).toBe(true);

        expect(provider.datasetReads).toHaveLength(2);
        // The dataset definition is reused: every non-query item is asked for with `1=0`, no query item is.
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);

        // The query family is new…
        expect(provider.Queries).toHaveLength(2);
        expect(provider.Queries.find(q => q.ID === 'q2')?.Name).toBe('Second Query');
        expect(provider.QueryFields).toHaveLength(2);
        // …and nothing else was rebuilt: same arrays, same objects.
        expect(provider.Entities).toBe(entitiesBefore);
        expect(provider.Entities[0]).toBe(entityObjectBefore);
        expect(provider.Applications).toBe(applicationsBefore);

        // The snapshot is stamped with the timestamps it was built from: nothing is stale afterwards.
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
        expect(provider.datasetReads).toHaveLength(2);
    });

    it('the whole family reloads together even when only one member moved (QueryInfo memoizes its children)', async () => {
        provider.touch('QueryFields', { ID: 'qf2', QueryID: 'q1', Name: 'Count', Sequence: 2 });
        const queryObjectBefore = provider.Queries[0];

        await provider.RefreshIfNeeded(undefined, true);

        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Queries[0]).not.toBe(queryObjectBefore); // rebuilt, so its Fields cache cannot be stale
        expect(provider.QueryFields).toHaveLength(2);
    });

    it('a change outside the family still takes the full path', async () => {
        const entitiesBefore = provider.Entities;
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider.touch('Entities'); // an entity row changed in place (same count, newer stamp)

        await provider.RefreshIfNeeded(undefined, true);

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]);
        expect(provider.Entities).not.toBe(entitiesBefore); // rebuilt by the full reload
        expect(provider.Entities).toHaveLength(1);
        expect(provider.Queries).toHaveLength(2);
    });

    it('an explicit Refresh() is always a full reload, whatever moved', async () => {
        const entitiesBefore = provider.Entities;
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });

        await provider.Refresh();

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]);
        expect(provider.Entities).not.toBe(entitiesBefore);
        expect(provider.Queries).toHaveLength(2);
    });

    it('the write-event path (RefreshAfterMetadataMemberChange) scopes the reload the same way', async () => {
        const entitiesBefore = provider.Entities;
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });

        await provider['RefreshAfterMetadataMemberChange']();

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Entities).toBe(entitiesBefore);
        expect(provider.Queries).toHaveLength(2);
    });

    it('the write-event path reloads everything when no item timestamp moved: the writer must see its own write', async () => {
        // A write committed with a stamp older than the item's current max leaves the max stamp
        // and the row count where they were. On PostgreSQL `__mj_UpdatedAt` is `NOW()`, the
        // transaction start, so an in-place edit inside a transaction that outlived a peer's later
        // write does exactly this; on SQL Server the statement-to-commit window does. The status
        // query cannot see it, but the writer knows it happened, so the hard Refresh() stands.
        provider.rows.Queries[0] = { ...provider.rows.Queries[0], Name: 'Renamed In Place' }; // no touch()

        expect(await provider['RefreshAfterMetadataMemberChange']()).toBe(true);

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]); // a full read
        expect(provider.Queries[0].Name).toBe('Renamed In Place');
    });

    it('a write event that arrives mid-reload, and moves no item, still gets a full follow-up pass', async () => {
        // The same rule governs the follow-up pass that a write arriving during a reload queues.
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        let queued: Promise<boolean> | null = null;
        provider.onScopedRead = () => {
            provider.rows.Queries[0] = { ...provider.rows.Queries[0], Name: 'Renamed In Place' }; // no touch()
            queued = provider['RefreshAfterMetadataMemberChange']();
        };

        await provider['RefreshAfterMetadataMemberChange']();
        expect(queued).not.toBeNull();
        await queued;

        expect(provider.datasetReads).toHaveLength(3); // the cold boot, the scoped pass, the full follow-up
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]);
        expect(provider.Queries.find(q => q.ID === 'q1')?.Name).toBe('Renamed In Place');
    });

    it('a Refresh() that joins an in-flight scoped reload still gets its full reload', async () => {
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        let queued: Promise<boolean> | null = null;
        provider.onScopedRead = () => {
            queued = provider.Refresh();
        };

        await provider.RefreshIfNeeded(undefined, true);
        expect(queued).not.toBeNull();
        await queued;

        expect(provider.datasetReads).toHaveLength(3);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]); // the promised full reload
    });

    it('after a Dashboards row is added, scoped reloads report no row-count mismatch and leave Dashboards current', async () => {
        // Dashboards is never read by the metadata build, so its recorded row count is whatever the
        // last full load saw. Comparing that stale count on every scoped adopt logged a false
        // "Row count mismatch", invalidated the Dashboards caches, and held the local Dashboards
        // stamp back — so every saved-query write re-ran the check and warned again.
        const warnings: LogEntry[] = [];
        const unsubscribe = RegisterLogSink(entry => { if (entry.severity === 'warning') warnings.push(entry); });
        try {
            provider.touch('Dashboards', { ID: 'd1', Name: 'Sales' });
            provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
            await provider.RefreshIfNeeded(undefined, true);
            expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);

            expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);

            provider.touch('Queries', { ID: 'q3', Name: 'Third Query', Status: 'Pending', CategoryID: null });
            await provider.RefreshIfNeeded(undefined, true);
            expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
            expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);

            const dashboardsLocal = provider.LatestLocalMetadata.find(m => m.Type === 'MJ: Dashboards');
            expect(dashboardsLocal?.UpdatedAt?.getTime()).toBe(provider.stamps.Dashboards.UpdatedAt.getTime());
            expect(warnings.filter(w => w.message.includes('Row count mismatch'))).toEqual([]);
        }
        finally {
            unsubscribe();
        }
    });

    it('MetadataBuildItemCodes is the shipped MJ_Metadata dataset minus the items the build never reads', () => {
        // The allowlist's unsafe default is "not read": an item folded into the build but missing
        // here would classify as unread, and its changes would never be reloaded. Pin it to the
        // shipped dataset so a new item fails this test instead.
        type DatasetRecord = { fields: { Name: string }; relatedEntities?: Record<string, Array<{ fields: { Code: string } }>> };
        const datasets = JSON.parse(readFileSync(resolve(__dirname, '../../../../metadata/datasets/.datasets.json'), 'utf8')) as DatasetRecord[];
        const mjMetadata = datasets.find(d => d.fields.Name === 'MJ_Metadata');
        const shipped = (mjMetadata?.relatedEntities?.['MJ: Dataset Items'] ?? []).map(i => i.fields.Code).sort();
        expect(shipped.length).toBeGreaterThan(0);
        const neverRead = ['Dashboards', 'Dashboard_Categories'];
        expect([...ProviderBase.MetadataBuildItemCodes].sort()).toEqual(shipped.filter(c => !neverRead.includes(c)));
    });

    it('a write only to items the metadata build never reads (Dashboards) reloads nothing, and stamps the snapshot current', async () => {
        const entitiesBefore = provider.Entities;
        const queriesBefore = provider.Queries;
        provider.touch('Dashboards', { ID: 'd1', Name: 'Sales' });

        expect(await provider.RefreshIfNeeded(undefined, true)).toBe(true);

        expect(provider.datasetReads).toHaveLength(1);
        expect(provider.Entities).toBe(entitiesBefore);
        expect(provider.Queries).toBe(queriesBefore);
        // Stamped current: the next check does not see the Dashboards change again.
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
    });

    it('the write-event path reloads nothing for a Dashboards-only change either', async () => {
        provider.touch('Dashboard_Categories', { ID: 'dc1', Name: 'Finance' });

        await provider['RefreshAfterMetadataMemberChange']();

        expect(provider.datasetReads).toHaveLength(1);
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
    });

    it('a Dashboards change beside a saved-query change does not widen the scoped reload', async () => {
        const entitiesBefore = provider.Entities;
        provider.touch('Dashboards', { ID: 'd1', Name: 'Sales' });
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });

        await provider.RefreshIfNeeded(undefined, true);

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Entities).toBe(entitiesBefore);
        expect(provider.Queries).toHaveLength(2);
    });

    it('MetadataRefreshScope answers none, scoped or full, and names the reason for a full reload', async () => {
        await provider.RefreshRemoteMetadataTimestamps();
        expect(provider['MetadataRefreshScope']()).toEqual({ Kind: 'none', AnyItemMoved: false });

        provider.touch('Dashboards');
        await provider.RefreshRemoteMetadataTimestamps();
        expect(provider['MetadataRefreshScope']()).toEqual({ Kind: 'none', AnyItemMoved: true });

        provider.touch('QueryFields');
        await provider.RefreshRemoteMetadataTimestamps();
        const scoped = provider['MetadataRefreshScope']();
        expect(scoped.Kind).toBe('scoped');
        expect(scoped.Kind === 'scoped' ? [...scoped.Codes].sort() : []).toEqual(QUERY_FAMILY.slice().sort());

        provider.touch('EntityFields');
        await provider.RefreshRemoteMetadataTimestamps();
        expect(provider['MetadataRefreshScope']()).toEqual({ Kind: 'full', Reason: expect.stringContaining('MJ: Entity Fields') });
    });

    it("Config()'s periodic staleness check scopes the reload too", async () => {
        const entitiesBefore = provider.Entities;
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider['_lastRefreshCheckAt'] = 0; // step past the min-interval throttle

        await provider.Config(config);

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Entities).toBe(entitiesBefore);
        expect(provider.Queries).toHaveLength(2);
    });

    it('RefreshWithinTransaction stays a full reload, read inside the transaction, when only the query family moved', async () => {
        // MJ#4836: `mj sync push` reloads inside its own transaction to see the metadata rows it has not
        // committed. That reload must not be narrowed to the query family by the scoped path.
        const entitiesBefore = provider.Entities;
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });

        await provider.RefreshWithinTransaction();

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]);
        expect(provider.readsJoinedTransaction[1]).toBe(true);
        expect(provider.Entities).not.toBe(entitiesBefore);
        expect(provider.Queries).toHaveLength(2);
    });

    it('a scoped reload does not claim the cold-boot pre-validation skip', async () => {
        // #4887: a pre-validation right after Config() loaded the whole graph from the server skips its
        // check, because that load also fetched the current user. A scoped reload fetches no user, so
        // the pre-validation after it must still check (and refresh the user).
        const checksAfterColdBoot = provider.refreshChecks;
        await provider.preValidateAndRefresh();
        expect(provider.refreshChecks).toBe(checksAfterColdBoot); // the cold boot's full load: skipped

        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider['_lastRefreshCheckAt'] = 0; // step past the min-interval throttle
        await provider.Config(config);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE); // it was the scoped path

        const checksAfterScoped = provider.refreshChecks;
        await provider.preValidateAndRefresh();
        expect(provider.refreshChecks).toBe(checksAfterScoped + 1);
    });

    it('a scoped member-change refresh reads the status once', async () => {
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider.statusReads = 0;

        await provider['RefreshAfterMetadataMemberChange']();

        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Queries).toHaveLength(2);
        expect(provider.statusReads).toBe(1);
    });

    it('the scoped branch of RefreshIfNeeded reads the status once', async () => {
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider.statusReads = 0;

        await provider.RefreshIfNeeded(undefined, true);

        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Queries).toHaveLength(2);
        expect(provider.statusReads).toBe(1);
    });

    it('a follow-up pass queued during a scoped reload reads the status again', async () => {
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider.statusReads = 0;
        let queued: Promise<boolean> | null = null;
        provider.onScopedRead = () => {
            provider.touch('Queries', { ID: 'q3', Name: 'Third Query', Status: 'Pending', CategoryID: null });
            queued = provider['RefreshAfterMetadataMemberChange']();
        };

        await provider['RefreshAfterMetadataMemberChange']();
        expect(queued).not.toBeNull();
        await queued;

        expect(provider.datasetReads).toHaveLength(3); // the cold boot, the first pass, the queued pass
        expect(provider.Queries).toHaveLength(3);
        expect(provider.statusReads).toBe(2);
    });
});

/**
 * A store that declares itself in-process, so the metadata snapshot is never serialized. The
 * snapshot's gzip runs on the libuv threadpool, which fake timers cannot advance; without it, a
 * retry fired by a fake timer settles entirely inside `advanceTimersByTimeAsync`.
 */
class InProcessStore extends MockCacheStorageProvider {
    public readonly SupportsCrossProcessPersistence = false;
}

describe('ProviderBase — a failed metadata refresh is retried, not escalated', () => {
    let provider: PartialRefreshProvider;
    let entitiesBefore: PartialRefreshProvider['Entities'];

    beforeEach(async () => {
        provider = new PartialRefreshProvider(new InProcessStore());
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        expect(provider.datasetReads).toHaveLength(1);
        entitiesBefore = provider.Entities;
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
        provider['CancelPendingMetadataMemberRefresh']();
        vi.useRealTimers();
    });

    const touchQueries = () => provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });

    it('climbs the published retry ladder', () => {
        expect([...ProviderBase.MetadataRefreshRetryDelaysMs]).toEqual(RETRY_DELAYS_MS);
        expect(ProviderBase.MetadataScopedReloadAttempts).toBe(3);
    });

    it('a write-event refresh that cannot read the timestamps keeps the metadata and retries later, with no full reload', async () => {
        touchQueries();
        provider.failStatus = true;

        expect(await provider['RefreshAfterMetadataMemberChange']()).toBe(true);

        expect(provider.datasetReads).toHaveLength(1); // no full reload
        expect(provider.Entities).toBe(entitiesBefore);
        expect(provider.Queries).toHaveLength(1);

        // The retry waits out the first delay, then re-reads the timestamps and reloads only the
        // saved-query family.
        const statusBefore = provider.statusReads;
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] - 1);
        expect(provider.statusReads).toBe(statusBefore);
        provider.failStatus = false;
        await vi.advanceTimersByTimeAsync(1);
        expect(provider.statusReads).toBeGreaterThan(statusBefore);
        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Queries).toHaveLength(2);
        expect(provider.Entities).toBe(entitiesBefore);
    });

    it('a timestamp read that keeps failing backs off 15 s, 30 s, 60 s, 120 s, then every 5 min, and never reloads in full', async () => {
        provider.failStatus = true;
        await provider['RefreshAfterMetadataMemberChange']();

        let reads = provider.statusReads;
        for (const delay of [...RETRY_DELAYS_MS, RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]]) {
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(provider.statusReads).toBe(reads);
            await vi.advanceTimersByTimeAsync(1);
            expect(provider.statusReads).toBe(reads + 1);
            reads = provider.statusReads;
        }
        expect(provider.datasetReads).toHaveLength(1);
        expect(provider.Entities).toBe(entitiesBefore);
    });

    it('a failed scoped reload is retried; only the third failure in a row takes the full reload', async () => {
        touchQueries();
        provider.failScopedItem = 'Queries';

        await provider.RefreshIfNeeded(undefined, true);
        expect(provider.datasetReads).toHaveLength(2); // the scoped attempt, no full reload
        expect(provider.suppressedCodes(provider.datasetReads[1])).toEqual(EVERYTHING_ELSE);
        expect(provider.Queries).toHaveLength(1); // kept, not torn down

        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
        expect(provider.datasetReads).toHaveLength(3); // the second scoped attempt
        expect(provider.suppressedCodes(provider.datasetReads[2])).toEqual(EVERYTHING_ELSE);
        expect(provider.Entities).toBe(entitiesBefore);

        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);
        expect(provider.datasetReads).toHaveLength(5); // the third scoped attempt, then the full reload
        expect(provider.suppressedCodes(provider.datasetReads[3])).toEqual(EVERYTHING_ELSE);
        expect(provider.suppressedCodes(provider.datasetReads[4])).toEqual([]);
        expect(provider.Queries).toHaveLength(2);

        // Current again: nothing is left pending.
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] * 2);
        expect(provider.datasetReads).toHaveLength(5);
    });

    it('a scoped reload that recovers resets the failure count and the backoff', async () => {
        touchQueries();
        provider.failScopedItem = 'Queries';
        await provider.RefreshIfNeeded(undefined, true); // failure 1 of 3
        provider.failScopedItem = null;
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
        expect(provider.Queries).toHaveLength(2);
        expect(provider.datasetReads).toHaveLength(3);

        // A later failure starts over: first retry after the first delay, and scoped, not full.
        provider.touch('Queries', { ID: 'q3', Name: 'Third Query', Status: 'Pending', CategoryID: null });
        provider.failScopedItem = 'Queries';
        await provider.RefreshIfNeeded(undefined, true); // failure 1 of 3 again
        expect(provider.datasetReads).toHaveLength(4);
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
        expect(provider.datasetReads).toHaveLength(5);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(provider.Entities).toBe(entitiesBefore);
    });

    it('a failed full reload keeps the metadata loaded and is retried', async () => {
        provider.touch('Entities');
        provider.failFullRead = true;

        await provider.RefreshIfNeeded(undefined, true);
        expect(provider.datasetReads).toHaveLength(2); // the failed full read
        expect(provider.Entities).toBe(entitiesBefore);

        provider.failFullRead = false;
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
        expect(provider.datasetReads).toHaveLength(3);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]);
        expect(provider.Entities).not.toBe(entitiesBefore);
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
    });

    it('a pending member-change refresh covers the retry: one timer, one refresh', async () => {
        provider.failStatus = true;
        provider['scheduleMetadataMemberRefresh']();
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs); // fails, arms a retry
        const reads = provider.statusReads;

        // A new write arrives while the retry is armed: the debounce replaces it rather than adding a second timer.
        // (A saved-query write, so the refresh it prompts is scoped and reads the status exactly once.)
        touchQueries();
        provider.failStatus = false;
        provider['scheduleMetadataMemberRefresh']();
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs);
        expect(provider.statusReads).toBe(reads + 1);
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] * 2);
        expect(provider.statusReads).toBe(reads + 1);
    });

    it('teardown cancels a pending retry', async () => {
        provider.failStatus = true;
        await provider['RefreshAfterMetadataMemberChange']();
        const reads = provider.statusReads;

        provider['CancelPendingMetadataMemberRefresh']();
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] * 2);

        expect(provider.statusReads).toBe(reads);
    });
});

describe('ProviderBase — a process that started from the stored snapshot reloads only what changed', () => {
    let store: MockCacheStorageProvider;
    let warm: PartialRefreshProvider;
    const config = () => new ProviderConfigDataBase({}, '__mj', [], [], true);

    beforeEach(async () => {
        store = new MockCacheStorageProvider();
        const writer = new PartialRefreshProvider(store);
        await writer.Config(config()); // a cold boot: loads from the server, saves the snapshot
        expect(writer.datasetReads).toHaveLength(1);

        warm = new PartialRefreshProvider(store);
        await warm.Config(config()); // the stale-while-revalidate fast start: served from the snapshot
        expect(warm.datasetReads).toHaveLength(0);
        expect(warm.Entities).toHaveLength(1);
    });

    afterEach(() => warm['CancelPendingMetadataMemberRefresh']());

    const touchQueries = () => warm.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });

    it('a saved-query write reloads only the query family, not everything', async () => {
        const entitiesBefore = warm.Entities;
        touchQueries();

        await warm.RefreshIfNeeded(undefined, true);

        expect(warm.datasetReads).toHaveLength(1);
        expect(warm.suppressedCodes(warm.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(warm.Entities).toBe(entitiesBefore);
        expect(warm.Queries).toHaveLength(2);
    });

    it('background revalidation reloads only the query family, and refreshes the current user', async () => {
        const entitiesBefore = warm.Entities;
        const getCurrentUser = vi.spyOn(warm as never, 'GetCurrentUser' as never);
        touchQueries();

        await warm.backgroundValidateAndRefresh();

        expect(warm.datasetReads).toHaveLength(1);
        expect(warm.suppressedCodes(warm.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(warm.Entities).toBe(entitiesBefore);
        expect(warm.Queries).toHaveLength(2);
        expect(getCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('pre-validation reloads only the query family', async () => {
        const entitiesBefore = warm.Entities;
        touchQueries();

        await warm.preValidateAndRefresh();

        expect(warm.datasetReads).toHaveLength(1);
        expect(warm.suppressedCodes(warm.lastRead())).toEqual(EVERYTHING_ELSE);
        expect(warm.Entities).toBe(entitiesBefore);
        expect(warm.Queries).toHaveLength(2);
    });

    it('background revalidation reloads nothing for a Dashboards-only change', async () => {
        warm.touch('Dashboards', { ID: 'd1', Name: 'Sales' });

        await warm.backgroundValidateAndRefresh();

        expect(warm.datasetReads).toHaveLength(0);
        expect(await warm.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
    });

    it('a change outside the query family still reloads everything', async () => {
        const entitiesBefore = warm.Entities;
        warm.touch('Entities');

        await warm.backgroundValidateAndRefresh();

        expect(warm.datasetReads).toHaveLength(1);
        expect(warm.suppressedCodes(warm.lastRead())).toEqual([]);
        expect(warm.Entities).not.toBe(entitiesBefore);
    });
});
