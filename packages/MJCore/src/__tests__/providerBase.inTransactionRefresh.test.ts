import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    AllMetadata,
    DatasetItemFilterType,
    DatasetReadOptions,
    DatasetResultType,
    DatasetStatusResultType,
    IMetadataProvider,
    ILocalStorageProvider,
    ProviderConfigDataBase,
} from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { ProviderBase } from '../generic/providerBase';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/**
 * AN IN-TRANSACTION METADATA REFRESH NEVER WAITS FOR A POOL RELOAD.
 *
 * `mj sync push` reloads metadata inside its own transaction (RefreshWithinTransaction, MJ#4836).
 * A timer-driven reload already in flight reads the metadata dataset on the POOL (#4514), and those
 * reads block on the row locks the push transaction holds until it commits. The in-transaction
 * refresh used to join that in-flight reload, so the push waited for a reload that waited for the
 * push: a self-deadlock the database's deadlock monitor cannot see (IT94 hung 5 runs in 15).
 *
 * The provider below models the database the way it behaved at the hang: a POOL read of the
 * metadata dataset waits until the test releases it (the "commit"), while a read that joins the
 * transaction is never blocked by that transaction's own locks.
 */

type ReadKind = 'dataset' | 'status';

interface RecordedRead {
    Kind: ReadKind;
    /** Whether the read asked to join the ambient transaction. */
    Joined: boolean;
    /** Unique per read; a dataset read stamps it on the single entity it returns. */
    Label: string;
}

/**
 * A complete in-memory store that, unlike InMemoryLocalStorageProvider, persists across processes as
 * far as the provider can tell (SupportsCrossProcessPersistence is not false), so the provider
 * really writes and reads its metadata snapshot. Values are kept as the strings the snapshot path
 * stores; `as T` mirrors InMemoryLocalStorageProvider's read of its own map.
 */
class MemoryStore implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    private _items = new Map<string, string>();
    /** Every key written, in order — lets a test see whether the provider saved anything. */
    public Writes: string[] = [];
    public async GetItem<T = unknown>(key: string): Promise<T | null> {
        const value = this._items.get(key);
        return value === undefined ? null : (value as T);
    }
    public async GetItems<T = unknown>(keys: string[]): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of keys) {
            const value = this._items.get(key);
            out.set(key, value === undefined ? null : (value as T));
        }
        return out;
    }
    public async SetItem<T>(key: string, value: T): Promise<void> {
        this.Writes.push(key);
        this._items.set(key, String(value));
    }
    public async Remove(key: string): Promise<void> { this._items.delete(key); }
    public async ClearCategory(): Promise<void> { this._items.clear(); }
    public async GetCategoryKeys(): Promise<string[]> { return [...this._items.keys()]; }
    /** Another process saved a snapshot: the stored timestamps no longer match what this one holds. */
    public TouchTimestamps(): void {
        for (const [key, value] of this._items) {
            if (key.toLowerCase().includes('timestamp')) {
                this._items.set(key, `${value} `);
            }
        }
    }
}

class TransactionModelProvider extends TestMetadataProvider {
    public readonly Store = new MemoryStore();
    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.Store;
    }
    /** How many times the stored snapshot was loaded (swapped in) from local storage. */
    public StoredSnapshotLoads = 0;
    protected override async LoadLocalMetadataFromStorage(): Promise<void> {
        this.StoredSnapshotLoads++;
        await super.LoadLocalMetadataFromStorage();
    }
    /** What the next Refresh() reports, when set — models a reload that fails (e.g. SQL Server's save wait timing out). */
    public NextRefreshResult: boolean | null = null;
    public override async Refresh(providerToUse?: IMetadataProvider): Promise<boolean> {
        const forced = this.NextRefreshResult;
        if (forced !== null) {
            this.NextRefreshResult = null;
            return forced;
        }
        return super.Refresh(providerToUse);
    }
    /** How many times a loaded dataset was recorded as this provider's metadata membership. */
    public MembershipRegistrations = 0;
    protected override registerMetadataDatasetMembership(dataset: DatasetResultType): void {
        this.MembershipRegistrations++;
        super.registerMetadataDatasetMembership(dataset);
    }
    /**
     * How many upcoming POOL reads of the metadata dataset fail the way a lost connection does: the
     * provider answers `Success: false` and GetAllMetadata records the failure. Reads that join the
     * transaction are not affected.
     */
    public FailingPoolReads = 0;
    /** Models a new ambient transaction being open when a deferred refresh comes due. */
    public RefreshMustWaitNow = false;
    protected override get MetadataMemberRefreshMustWait(): boolean {
        return this.RefreshMustWaitNow;
    }
    public Reads: RecordedRead[] = [];
    /** Entity name of every snapshot swapped in, in order. */
    public Adopted: string[] = [];
    public HoldPoolReads = false;
    public HoldJoinedReads = false;
    private _held = new Map<string, () => void>();
    private _sequence = 0;

    public override async GetDatasetByName(
        datasetName: string,
        itemFilters?: DatasetItemFilterType[],
        contextUser?: UserInfo,
        providerToUse?: IMetadataProvider,
        forceRefresh?: boolean,
        options?: DatasetReadOptions,
    ): Promise<DatasetResultType> {
        if (datasetName !== 'MJ_Metadata') {
            return super.GetDatasetByName(datasetName, itemFilters, contextUser, providerToUse);
        }
        const read = this.record('dataset', options);
        await this.waitIfHeld(read);
        if (!read.Joined && this.FailingPoolReads > 0) {
            this.FailingPoolReads--;
            return { DatasetID: '', DatasetName: datasetName, Success: false, Status: 'connection lost (test)', LatestUpdateDate: new Date(), Results: [] };
        }
        const result = await super.GetDatasetByName(datasetName, itemFilters, contextUser, providerToUse);
        const entities = result.Results.find(r => r.Code === 'Entities');
        if (entities && entities.Results.length > 0) {
            entities.Results = [{ ...entities.Results[0], Name: read.Label }];
        }
        return result;
    }

    public override async GetDatasetStatusByName(
        datasetName: string,
        itemFilters?: DatasetItemFilterType[],
        contextUser?: UserInfo,
        providerToUse?: IMetadataProvider,
        options?: DatasetReadOptions,
    ): Promise<DatasetStatusResultType> {
        if (datasetName === 'MJ_Metadata') {
            this.record('status', options);
        }
        return super.GetDatasetStatusByName(datasetName, itemFilters, contextUser, providerToUse);
    }

    protected override UpdateLocalMetadata(res: AllMetadata): void {
        this.Adopted.push(res.AllEntities?.[0]?.Name ?? '');
        super.UpdateLocalMetadata(res);
    }

    public DatasetReads(): RecordedRead[] {
        return this.Reads.filter(r => r.Kind === 'dataset');
    }

    // ── Ambient transaction model ──────────────────────────────────────
    /** Whether the provider is inside an ambient transaction (a database provider derives this). */
    public InTransaction = false;
    protected override get HasOpenAmbientTransaction(): boolean {
        return this.InTransaction;
    }
    /** What a database provider does when its transaction reaches depth 0. */
    public async EndTransaction(committed: boolean): Promise<void> {
        this.InTransaction = false;
        await this.OnAmbientTransactionEnded(committed);
    }

    // ── Late refresh probe (the follow-up lost between the flight's last check and its clear) ──
    private _lateRefreshDepth: number | null = null;
    public LateRefresh: Promise<boolean> | null = null;
    public DatasetReadsAtLateRefresh = -1;
    /** The next snapshot save schedules a Refresh() `depth` microtasks after the save returns. */
    public ArmLateRefresh(depth: number): void {
        this._lateRefreshDepth = depth;
    }
    public override async SaveLocalMetadataToStorage(): Promise<void> {
        await super.SaveLocalMetadataToStorage();
        const depth = this._lateRefreshDepth;
        if (depth === null) {
            return;
        }
        this._lateRefreshDepth = null;
        const fire = (remaining: number): void => {
            if (remaining > 0) {
                queueMicrotask(() => fire(remaining - 1));
                return;
            }
            this.DatasetReadsAtLateRefresh = this.DatasetReads().length;
            this.LateRefresh = this.Refresh();
        };
        fire(depth);
    }

    /** Lets one held read finish — for a pool read, the moment the blocking transaction ends. */
    public Release(label: string): void {
        const release = this._held.get(label);
        this._held.delete(label);
        release?.();
    }

    public ReleaseAll(): void {
        this.HoldPoolReads = false;
        this.HoldJoinedReads = false;
        for (const label of [...this._held.keys()]) {
            this.Release(label);
        }
    }

    private record(kind: ReadKind, options?: DatasetReadOptions): RecordedRead {
        const read: RecordedRead = { Kind: kind, Joined: options?.JoinAmbientTransaction === true, Label: `${kind}-${++this._sequence}` };
        this.Reads.push(read);
        return read;
    }

    private async waitIfHeld(read: RecordedRead): Promise<void> {
        if (read.Joined ? this.HoldJoinedReads : this.HoldPoolReads) {
            await new Promise<void>(resolve => this._held.set(read.Label, resolve));
        }
    }
}

const config = (): ProviderConfigDataBase => new ProviderConfigDataBase({}, '__mj', [], [], true);

async function configuredProvider(): Promise<TransactionModelProvider> {
    const provider = new TransactionModelProvider();
    provider.setMockDelay(0);
    await provider.Config(config());
    provider.Reads = [];
    provider.Adopted = [];
    return provider;
}

/** The release-retry delay of the provider under test (the base member-change window). */
function retryDelayMs(): number {
    return ProviderBase.MetadataDatasetRefreshDebounceMs;
}

/** Lets every queued microtask and the next macrotask run, so any follow-up pass would have started. */
async function flushTasks(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
}

/** Resolves with the promise's value, or rejects when it has not settled within `ms` (a hang). */
async function withinMs<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stuck = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, stuck]);
    } finally {
        clearTimeout(timer);
    }
}

// The background and pre-validation passes announce themselves with console.log (⚡ [Metadata Cache] …);
// every describe restores its mocks afterwards.
beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('RefreshWithinTransaction while a pool reload is in flight', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns without waiting for the pool reload whose reads are blocked by the transaction', async () => {
        const provider = await configuredProvider();
        provider.HoldPoolReads = true;
        const poolReload = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(1));

        const inTransaction = provider.RefreshWithinTransaction();
        let outcome: 'returned' | Error;
        try {
            await withinMs(inTransaction, 2000, 'RefreshWithinTransaction');
            outcome = 'returned';
        } catch (e) {
            outcome = e instanceof Error ? e : new Error(String(e));
        }

        // The "commit": the pool reads may finish now. Done either way so nothing is left hanging.
        provider.ReleaseAll();
        await poolReload;
        await inTransaction;
        expect(outcome).toBe('returned');
    });

    it('adopts its own transaction-joined snapshot, discards the older pool pass, and reruns the pool reload once', async () => {
        const provider = await configuredProvider();
        provider.HoldPoolReads = true;
        const poolReload = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(1));
        const olderPoolRead = provider.DatasetReads()[0];
        expect(olderPoolRead.Joined).toBe(false);

        await withinMs(provider.RefreshWithinTransaction(), 2000, 'RefreshWithinTransaction');
        const transactionRead = provider.DatasetReads()[1];
        expect(transactionRead.Joined).toBe(true);
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);

        // The older pool pass finishes after the in-transaction pass: its snapshot must not win.
        provider.Release(olderPoolRead.Label);
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(3));
        const followUpRead = provider.DatasetReads()[2];
        expect(followUpRead.Joined).toBe(false);
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);

        // The follow-up's reads start after the transaction's writes, so its snapshot is adopted.
        provider.Release(followUpRead.Label);
        await withinMs(poolReload, 2000, 'pool reload');
        expect(provider.Entities[0].Name).toBe(followUpRead.Label);
        expect(provider.Adopted).toEqual([transactionRead.Label, followUpRead.Label]);
        expect(provider.DatasetReads()).toHaveLength(3); // exactly one follow-up
    });

    it('queues no follow-up when no pool reload is in flight', async () => {
        const provider = await configuredProvider();
        await withinMs(provider.RefreshWithinTransaction(), 2000, 'RefreshWithinTransaction');
        expect(provider.DatasetReads().map(r => r.Joined)).toEqual([true]);
        expect(provider.Adopted).toEqual([provider.DatasetReads()[0].Label]);
        await flushTasks();
        expect(provider.DatasetReads()).toHaveLength(1);
    });
});

describe('only the in-transaction pass joins the transaction', () => {
    afterEach(() => vi.restoreAllMocks());

    it('a pool reload that starts while the in-transaction pass is reading keeps every read on the pool', async () => {
        const provider = await configuredProvider();
        provider.HoldJoinedReads = true;
        const inTransaction = provider.RefreshWithinTransaction();
        await vi.waitFor(() => expect(provider.DatasetReads().filter(r => r.Joined)).toHaveLength(1));
        const readsOfTransactionPass = provider.Reads.length;

        // The in-transaction pass is mid-read; a pool reload starts now.
        const poolReload = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(2));
        await withinMs(poolReload, 2000, 'pool reload');
        const poolPassReads = provider.Reads.slice(readsOfTransactionPass);
        expect(poolPassReads.map(r => r.Kind)).toEqual(['status', 'dataset']);
        expect(poolPassReads.every(r => !r.Joined)).toBe(true);

        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.ReleaseAll();
        // Outside a transaction the newer pool pass superseding this one leaves metadata current:
        // that is success, not "not adopted".
        expect(await withinMs(inTransaction, 2000, 'RefreshWithinTransaction')).toBe(true);
        expect(errors).not.toHaveBeenCalled();
        // The in-transaction pass's own reads — its status read and its dataset read — joined.
        expect(provider.Reads.slice(0, readsOfTransactionPass).map(r => [r.Kind, r.Joined])).toEqual([['status', true], ['dataset', true]]);
    });

    it('a pool reload after the in-transaction refresh returned reads on the pool again', async () => {
        const provider = await configuredProvider();
        await provider.RefreshWithinTransaction();
        provider.Reads = [];
        await provider.Refresh();
        expect(provider.Reads.length).toBeGreaterThan(0);
        expect(provider.Reads.every(r => !r.Joined)).toBe(true);
    });
});

describe('metadata pinned to the open transaction (RCSI)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('(i) a pool pass that does not block (RCSI) and finishes after the in-transaction pass is held back, then rerun after commit', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.HoldPoolReads = true;
        const poolReload = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(1));
        const poolRead = provider.DatasetReads()[0];

        expect(await withinMs(provider.RefreshWithinTransaction(), 2000, 'RefreshWithinTransaction')).toBe(true);
        const transactionRead = provider.DatasetReads()[1];

        // Under RCSI the pool read returns committed (pre-push) state without waiting for the commit.
        provider.HoldPoolReads = false;
        provider.Release(poolRead.Label);
        await withinMs(poolReload, 2000, 'pool reload');
        await flushTasks();
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);
        expect(provider.Adopted).toEqual([transactionRead.Label]);
        expect(provider.DatasetReads()).toHaveLength(2); // no pool pass ran mid-transaction

        await provider.EndTransaction(true);
        const afterCommit = provider.DatasetReads()[2];
        expect(afterCommit.Joined).toBe(false);
        expect(provider.Adopted).toEqual([transactionRead.Label, afterCommit.Label]);
        expect(provider.Entities[0].Name).toBe(afterCommit.Label);
    });

    it('(ii) a pool pass that starts after the in-transaction pass and finishes first is not adopted, and the in-transaction pass is', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.HoldJoinedReads = true;
        const inTransaction = provider.RefreshWithinTransaction();
        await vi.waitFor(() => expect(provider.DatasetReads().filter(r => r.Joined)).toHaveLength(1));
        const transactionRead = provider.DatasetReads()[0];

        // Starts later (higher generation), does not block, finishes first.
        await withinMs(provider.Refresh(), 2000, 'pool reload');
        const poolRead = provider.DatasetReads()[1];
        expect(poolRead.Joined).toBe(false);
        expect(provider.Adopted).toEqual([]);

        provider.ReleaseAll();
        expect(await withinMs(inTransaction, 2000, 'RefreshWithinTransaction')).toBe(true);
        expect(provider.Adopted).toEqual([transactionRead.Label]);
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);
    });

    it('returns false when the in-transaction pass was not adopted', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.setMockMetadata({ Entities: [], EntityFields: [], Applications: [] }); // a failed (empty) read
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await provider.RefreshWithinTransaction()).toBe(false);
        expect(errors.mock.calls.some(c => String(c[0]).includes('MJ#4836'))).toBe(true);
        provider.setMockMetadata(null);
        await provider.EndTransaction(false);
    });

    it('a rollback always reloads from the pool, even with nothing held back', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const transactionRead = provider.DatasetReads()[0];
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);

        await provider.EndTransaction(false);
        const afterRollback = provider.DatasetReads()[1];
        expect(afterRollback.Joined).toBe(false);
        expect(provider.Entities[0].Name).toBe(afterRollback.Label);
    });

    it('a commit reloads too (the pinned snapshot was never persisted), and pool passes adopt again afterwards', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        await provider.EndTransaction(true);
        expect(provider.DatasetReads().map(r => r.Joined)).toEqual([true, false]);
        expect(provider.Adopted).toHaveLength(2);

        await provider.Refresh();
        expect(provider.Adopted).toHaveLength(3);
    });

    it('an abandoned transaction (ended without a commit) releases the pin like a rollback', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        provider.HoldPoolReads = false;
        await provider.Refresh(); // held back while pinned
        expect(provider.Adopted).toHaveLength(1);
        await provider.EndTransaction(false);
        expect(provider.Adopted).toHaveLength(2);
        expect(provider.DatasetReads()[2].Joined).toBe(false);
    });

    it('nothing pinned: the end of a transaction does not reload', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.EndTransaction(true);
        await provider.EndTransaction(false);
        expect(provider.Reads).toEqual([]);
    });

    it('outside a transaction RefreshWithinTransaction pins nothing', async () => {
        const provider = await configuredProvider();
        await provider.RefreshWithinTransaction();
        await provider.Refresh();
        expect(provider.Adopted).toHaveLength(2);
    });

    it('the stored snapshot is not swapped in while pinned', async () => {
        const provider = await configuredProvider();
        provider.StoredSnapshotLoads = 0; // count from here, not from Config's own loads
        provider.Store.TouchTimestamps();
        await provider.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(provider.StoredSnapshotLoads).toBe(1);

        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        provider.StoredSnapshotLoads = 0;
        provider.Store.TouchTimestamps();
        await provider.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(provider.StoredSnapshotLoads).toBe(0);

        await provider.EndTransaction(true);
        provider.StoredSnapshotLoads = 0;
        provider.Store.TouchTimestamps();
        await provider.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(provider.StoredSnapshotLoads).toBe(1);
    });
});

describe('pin release: passes that outlive the pin, persistence, failed reloads', () => {
    afterEach(() => vi.restoreAllMocks());

    it('m1: an in-transaction pass still running when its transaction ends is not adopted, and nothing it read is persisted', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.HoldJoinedReads = true;
        const inTransaction = provider.RefreshWithinTransaction();
        await vi.waitFor(() => expect(provider.DatasetReads().filter(r => r.Joined)).toHaveLength(1));
        const transactionRead = provider.DatasetReads()[0];
        vi.spyOn(console, 'error').mockImplementation(() => undefined); // the not-adopted error is expected

        // The transaction rolls back while its own pass is still reading; the release reloads.
        await provider.EndTransaction(false);
        const releaseRead = provider.DatasetReads()[1];
        expect(provider.Entities[0].Name).toBe(releaseRead.Label);
        provider.Store.Writes = [];

        provider.ReleaseAll();
        expect(await withinMs(inTransaction, 2000, 'RefreshWithinTransaction')).toBe(false);
        expect(provider.Adopted).toEqual([releaseRead.Label]);
        expect(provider.Entities[0].Name).toBe(releaseRead.Label);
        expect(provider.Entities[0].Name).not.toBe(transactionRead.Label);
        expect(provider.Store.Writes).toEqual([]);
    });

    it('m2: a pool pass that started while pinned and finishes after the release is discarded; the release reload wins', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const transactionRead = provider.DatasetReads()[0];

        // A pool pass starts during the pin and is still reading when the transaction commits.
        provider.HoldPoolReads = true;
        const poolReload = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(2));
        const pinnedPoolRead = provider.DatasetReads()[1];
        provider.HoldPoolReads = false;

        const release = provider.EndTransaction(true);
        // The release joins the flight (one queued follow-up); the pool read held during the pin finishes now.
        provider.Release(pinnedPoolRead.Label);
        await withinMs(release, 2000, 'release');
        await withinMs(poolReload, 2000, 'pool reload');
        const releaseRead = provider.DatasetReads()[2];
        expect(releaseRead.Joined).toBe(false);
        expect(provider.Adopted).toEqual([transactionRead.Label, releaseRead.Label]);
        expect(provider.Entities[0].Name).toBe(releaseRead.Label);
    });

    it('m2: a background pass that started during the pin and finishes after the release, before the release reload, is neither adopted nor persisted', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const transactionRead = provider.DatasetReads()[0];
        vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded').mockResolvedValue(true);
        provider.HoldPoolReads = true;
        const background = provider.backgroundValidateAndRefresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(2));
        const pinnedPoolRead = provider.DatasetReads()[1];

        // The transaction commits; the release reload starts and is held too.
        const release = provider.EndTransaction(true);
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(3));
        const releaseRead = provider.DatasetReads()[2];
        provider.Store.Writes = [];

        // The pass from during the pin finishes first: it must not be adopted or written to shared storage.
        provider.Release(pinnedPoolRead.Label);
        await withinMs(background, 2000, 'background validation');
        expect(provider.Adopted).toEqual([transactionRead.Label]);
        expect(provider.Store.Writes).toEqual([]);

        provider.ReleaseAll();
        await withinMs(release, 2000, 'release');
        expect(provider.Adopted).toEqual([transactionRead.Label, releaseRead.Label]);
    });

    it('m3: nothing reaches shared storage while pinned — not the reload pass, not RefreshCurrentUser, not a direct save', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.Store.Writes = [];
        await provider.RefreshWithinTransaction();
        await provider.RefreshCurrentUser();
        await provider.SaveLocalMetadataToStorage();
        await flushTasks();
        expect(provider.Store.Writes).toEqual([]);

        await provider.EndTransaction(true);
        expect(provider.Store.Writes.length).toBeGreaterThan(0); // the release reload persists
    });

    it('m4: a release whose reload READ fails (Refresh still answers true) is logged as an error and retried once, and the retry replaces the snapshot', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const pinnedLabel = provider.Entities[0].Name;
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.FailingPoolReads = 1; // the release's own read fails inside the real Refresh → Config → pass path

        await provider.EndTransaction(false);
        expect(provider.Entities[0].Name).toBe(pinnedLabel); // still the uncommitted snapshot
        expect(errors.mock.calls.flat().map(String).join(' ')).toMatch(/Metadata reload after the pinned transaction ended failed \(.*connection lost \(test\).*\); the metadata in memory may show rows that never committed\. Retrying once/);

        // The retry runs after the delay, reads on the pool, and replaces the pinned snapshot.
        const readsBefore = provider.DatasetReads().length;
        await vi.waitFor(() => expect(provider.DatasetReads().length).toBeGreaterThan(readsBefore), { timeout: 3000 });
        const retryRead = provider.DatasetReads()[provider.DatasetReads().length - 1];
        expect(retryRead.Joined).toBe(false);
        await vi.waitFor(() => expect(provider.Entities[0].Name).toBe(retryRead.Label));
    });

    it('m4: a retry that fails too is logged once more and not re-armed', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.FailingPoolReads = 2;

        await provider.EndTransaction(true);
        await vi.waitFor(() => expect(errors.mock.calls.flat().map(String).join(' ')).toMatch(/failed again on retry .*still the snapshot read inside the transaction until the next metadata change/), { timeout: 3000 });
        const readsAfterRetry = provider.DatasetReads().length;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs() * 2));
        expect(provider.DatasetReads().length).toBe(readsAfterRetry); // no third attempt
    });

    it('m4: the retry does not read when a reload already replaced the pinned snapshot', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.FailingPoolReads = 1;
        await provider.EndTransaction(false);
        await provider.Refresh(); // something else reloads before the retry comes due
        const reads = provider.DatasetReads().length;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs() * 2));
        expect(provider.DatasetReads().length).toBe(reads);
    });

    it('m4: the retry waits while a new transaction is open, then reloads', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.FailingPoolReads = 1;
        await provider.EndTransaction(false);
        provider.RefreshMustWaitNow = true;
        const reads = provider.DatasetReads().length;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs() * 2));
        expect(provider.DatasetReads().length).toBe(reads); // deferred, not run inside the transaction
        provider.RefreshMustWaitNow = false;
        await vi.waitFor(() => expect(provider.DatasetReads().length).toBeGreaterThan(reads), { timeout: 3000 });
    });

    it('m4: a release whose Refresh reports false (SQL Server gave up waiting for saves) is retried too', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.NextRefreshResult = false;

        await provider.EndTransaction(false);
        expect(errors.mock.calls.flat().map(String).join(' ')).toMatch(/failed \(the reload reported failure\); the metadata in memory may show rows that never committed/);
        const readsBefore = provider.DatasetReads().length;
        await vi.waitFor(() => expect(provider.DatasetReads().length).toBeGreaterThan(readsBefore), { timeout: 3000 });
    });

    it('a retry still waiting on an open transaction after the cap is dropped with an error, never run inside it', async () => {
        const cap = ProviderBase.MaxMetadataMemberRefreshWaits;
        ProviderBase.MaxMetadataMemberRefreshWaits = 2;
        try {
            const provider = await configuredProvider();
            provider.InTransaction = true;
            await provider.RefreshWithinTransaction();
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            provider.FailingPoolReads = 1;
            await provider.EndTransaction(false);
            provider.RefreshMustWaitNow = true; // a new transaction stays open past every window
            const reads = provider.DatasetReads().length;
            await vi.waitFor(() => expect(errors.mock.calls.flat().map(String).join(' '))
                .toMatch(/retry after the pinned transaction ended is still waiting on an ambient transaction after 2 windows of \d+ms; dropping it/), { timeout: 3000 });
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs() * 2));
            expect(provider.DatasetReads().length).toBe(reads); // no reload ran inside the open transaction
        } finally {
            ProviderBase.MaxMetadataMemberRefreshWaits = cap;
        }
    });

    it('a release reload held back because a new transaction pinned the metadata meanwhile is not an error', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let newPin: Promise<boolean> | null = null;
        vi.spyOn(provider, 'Refresh').mockImplementationOnce(async () => {
            // a new transaction on the same provider pins while the release reload runs; its own pass is still reading
            provider.InTransaction = true;
            provider.HoldJoinedReads = true;
            newPin = provider.RefreshWithinTransaction();
            await flushTasks();
            return true;
        });
        await provider.EndTransaction(true);
        expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/Metadata reload after the pinned transaction ended failed/);
        provider.ReleaseAll();
        expect(await newPin).toBe(true);
        await provider.EndTransaction(true); // that pin's own release reloads
        expect(errors).not.toHaveBeenCalled();
    });

    it('when no reload pass ran, the error says so and never repeats an older load error', async () => {
        const provider = await configuredProvider();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        provider.FailingPoolReads = 1;
        await provider.Refresh(); // an earlier, unrelated read failure
        expect(provider.LastMetadataLoadError?.message).toContain('connection lost (test)');
        errors.mockClear();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        provider.setAllowRefresh(false); // the release's Refresh runs no pass
        await provider.EndTransaction(false);
        const logged = errors.mock.calls.flat().map(String).join(' ');
        expect(logged).toMatch(/failed \(no reload pass ran \(the provider did not allow a refresh\)\)/);
        expect(logged).not.toContain('connection lost (test)');
        provider.setAllowRefresh(true);
        const reads = provider.DatasetReads().length;
        await vi.waitFor(() => expect(provider.DatasetReads().length).toBeGreaterThan(reads), { timeout: 3000 }); // the retry reloads
    });

    it('while the subclass suspends refreshes, RefreshWithinTransaction reads nothing, pins nothing and answers true', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.setAllowRefresh(false);
        expect(await provider.RefreshWithinTransaction()).toBe(true);
        expect(provider.Reads).toEqual([]);
        provider.setAllowRefresh(true);
        await provider.Refresh(); // not held back: nothing was pinned
        expect(provider.Adopted).toHaveLength(1);
    });

    it('a held-back pass does not re-record the metadata membership; an adopted one does', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        provider.MembershipRegistrations = 0;
        await provider.Refresh(); // pool pass, held back while pinned
        expect(provider.MembershipRegistrations).toBe(0);
        await provider.EndTransaction(true); // the release reload is adopted
        expect(provider.MembershipRegistrations).toBe(1);
    });

    it('two overlapping RefreshWithinTransaction calls in one transaction both answer true when the newer pass wins', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        provider.HoldJoinedReads = true;
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const older = provider.RefreshWithinTransaction();
        await vi.waitFor(() => expect(provider.DatasetReads().filter(r => r.Joined)).toHaveLength(1));
        const newer = provider.RefreshWithinTransaction();
        await vi.waitFor(() => expect(provider.DatasetReads().filter(r => r.Joined)).toHaveLength(2));
        const [olderRead, newerRead] = provider.DatasetReads();

        provider.Release(newerRead.Label); // the newer pass finishes first and is adopted
        expect(await withinMs(newer, 2000, 'newer')).toBe(true);
        provider.Release(olderRead.Label); // the older one is superseded by a pass of the same pin
        expect(await withinMs(older, 2000, 'older')).toBe(true);
        expect(provider.Adopted).toEqual([newerRead.Label]);
        expect(errors).not.toHaveBeenCalled();
        provider.ReleaseAll();
        await provider.EndTransaction(true);
    });

    it('a second RefreshWithinTransaction in the same transaction keeps the pin and adopts its newer pass', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        await provider.RefreshWithinTransaction();
        const [first, second] = provider.DatasetReads();
        expect(provider.Adopted).toEqual([first.Label, second.Label]);
        await provider.Refresh(); // a pool pass is still held back: the pin from the first call is still in force
        expect(provider.Adopted).toEqual([first.Label, second.Label]);
        await provider.EndTransaction(true);
        expect(provider.Adopted).toHaveLength(3);
    });
});

describe('the other adoption sites are guarded too', () => {
    afterEach(() => vi.restoreAllMocks());

    it('backgroundValidateAndRefresh does not adopt while pinned', async () => {
        const provider = await configuredProvider();
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const pinnedLabel = provider.Entities[0].Name;
        vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded').mockResolvedValue(true);
        await provider.backgroundValidateAndRefresh();
        expect(provider.Entities[0].Name).toBe(pinnedLabel);
        expect(provider.Adopted).toEqual([pinnedLabel]);
        await provider.EndTransaction(true);
    });

    it('preValidateAndRefresh does not adopt while pinned', async () => {
        const provider = await configuredProvider();
        await provider.preValidateAndRefresh(); // consumes the cold-boot skip
        provider.InTransaction = true;
        await provider.RefreshWithinTransaction();
        const pinnedLabel = provider.Entities[0].Name;
        vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded').mockResolvedValue(true);
        await provider.preValidateAndRefresh();
        expect(provider.Entities[0].Name).toBe(pinnedLabel);
        expect(provider.Adopted).toEqual([pinnedLabel]);
        await provider.EndTransaction(true);
    });

    it('a backgroundValidateAndRefresh pass that started first and finishes last is discarded', async () => {
        const provider = await configuredProvider();
        vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded').mockResolvedValue(true);
        provider.HoldPoolReads = true;
        const background = provider.backgroundValidateAndRefresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(1));
        const refresh = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(2));
        const [older, newer] = provider.DatasetReads();

        provider.Release(newer.Label);
        await withinMs(refresh, 2000, 'refresh');
        provider.Release(older.Label);
        await withinMs(background, 2000, 'background validation');
        expect(provider.Adopted).toEqual([newer.Label]);
        expect(provider.Entities[0].Name).toBe(newer.Label);
    });

    it('a preValidateAndRefresh pass that started first and finishes last is discarded', async () => {
        const provider = await configuredProvider();
        await provider.preValidateAndRefresh(); // consumes the cold-boot skip
        vi.spyOn(provider, 'CheckToSeeIfRefreshNeeded').mockResolvedValue(true);
        provider.HoldPoolReads = true;
        const preValidate = provider.preValidateAndRefresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(1));
        const refresh = provider.Refresh();
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(2));
        const [older, newer] = provider.DatasetReads();

        provider.Release(newer.Label);
        await withinMs(refresh, 2000, 'refresh');
        provider.Release(older.Label);
        await withinMs(preValidate, 2000, 'pre-validation');
        expect(provider.Adopted).toEqual([newer.Label]);
    });
});

describe('a refresh request at any point near the end of a pool flight is never lost', () => {
    afterEach(() => vi.restoreAllMocks());

    it('every request is followed by a pass whose reads start after it', async () => {
        // Sweeps the request across the microtasks between the flight's last adoption and the
        // return of the Config() that owns the flight. Before the fix, a request landing after the
        // loop's last `while (queued)` check but before the flight was cleared only flagged a
        // follow-up that no loop would run, and returned with no reload of its own.
        for (let depth = 0; depth <= 12; depth++) {
            const provider = await configuredProvider();
            provider.ArmLateRefresh(depth);
            await provider.Refresh();
            await vi.waitFor(() => expect(provider.LateRefresh).not.toBeNull());
            await provider.LateRefresh;
            expect({ depth, readsAfterRequest: provider.DatasetReads().length > provider.DatasetReadsAtLateRefresh })
                .toEqual({ depth, readsAfterRequest: true });
        }
    });
});
