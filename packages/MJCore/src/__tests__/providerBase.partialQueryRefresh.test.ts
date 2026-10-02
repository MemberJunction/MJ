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
 * untouched. Anything else stale, an explicit Refresh(), or a failed scoped read still takes
 * the full path.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import {
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    IMetadataProvider,
    ProviderConfigDataBase,
} from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

type Row = Record<string, unknown>;

/** The MJ_Metadata items exactly as the shared mock declares them (Code → entity name). */
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

    constructor() {
        super();
        this.setMockDelay(0);
        for (const item of ITEMS) {
            this.stamps[item.Code] = { UpdatedAt: T0, RowCount: (this.rows[item.Code] ?? []).length };
        }
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

    it('the write-event path stays a hard, full reload when the change cannot be attributed', async () => {
        // Nothing moved according to the status query — a writer with positive evidence must not
        // trust that answer, so the base policy (a HARD Refresh) still applies.
        await provider['RefreshAfterMetadataMemberChange']();

        expect(provider.datasetReads).toHaveLength(2);
        expect(provider.suppressedCodes(provider.lastRead())).toEqual([]);
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

    it('a failed scoped read falls back to the full reload instead of leaving stale queries', async () => {
        provider.touch('Queries', { ID: 'q2', Name: 'Second Query', Status: 'Pending', CategoryID: null });
        provider.failScopedItem = 'Queries';

        await provider.RefreshIfNeeded(undefined, true);

        expect(provider.datasetReads).toHaveLength(3); // scoped attempt, then the full reload
        expect(provider.suppressedCodes(provider.datasetReads[1])).toEqual(EVERYTHING_ELSE);
        expect(provider.suppressedCodes(provider.datasetReads[2])).toEqual([]);
        expect(provider.Queries).toHaveLength(2);
    });
});
