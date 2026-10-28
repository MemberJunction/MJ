/**
 * @fileoverview A failed FRESHNESS question must not destroy the thing it was asking about.
 *
 * `GetDatasetStatusByName` is the one network call behind every staleness check. It was
 * reached unguarded through `GetLatestMetadataUpdates` → `RefreshRemoteMetadataTimestamps`
 * → `CheckToSeeIfRefreshNeeded` → `Config`, with no `try` anywhere on the path, so a single
 * slow or 504'd status query threw all the way out of the provider's bootstrap. In the
 * Explorer that landed in one boot catch and was classified as a non-retryable `unknown`
 * error, i.e. the whole app dead over a question it did not need an answer to.
 *
 * Two paths are pinned here:
 *
 *  1. {@link ProviderBase.CheckToSeeIfRefreshNeeded} — answers instead of throwing, and its
 *     answer depends on whether there is a cached snapshot to serve.
 *  2. {@link ProviderBase.GetAndCacheDatasetByName} — holds a complete cached dataset and
 *     asks only whether it is current; a failed ask serves the cache rather than throwing
 *     it away (the re-fetch below would hit the same unreachable server anyway).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { AllMetadata } from '../generic/interfaces';
import type {
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
} from '../generic/interfaces';
import type { EntityInfo } from '../generic/entityInfo';

const DATASET = 'MJ_Metadata';

/** A storage provider that serves exactly the two keys `GetAndCacheDatasetByName` batches. */
function fakeStorage(entries: Map<string, unknown>): ILocalStorageProvider {
    return {
        SharesReferences: true,
        GetItem: async <T>(key: string): Promise<T | null> => (entries.get(key) as T) ?? null,
        GetItems: async <T>(keys: string[]): Promise<Map<string, T | null>> => {
            const out = new Map<string, T | null>();
            for (const key of keys) {
                out.set(key, (entries.get(key) as T) ?? null);
            }
            return out;
        },
        SetItem: async <T>(key: string, value: T): Promise<void> => {
            entries.set(key, value);
        },
        Remove: async (key: string): Promise<void> => {
            entries.delete(key);
        },
    } as unknown as ILocalStorageProvider;
}

interface ProbeOptions {
    /** When set, every status query rejects with this message. */
    statusRejectsWith?: string;
    /** When set, every status query rejects with exactly this value (any shape, not only an Error). */
    statusRejectsWithError?: unknown;
    /** When set, status queries resolve with this result. */
    statusResolvesWith?: DatasetStatusResultType;
    storage?: ILocalStorageProvider;
}

/**
 * The smallest concrete ProviderBase that can answer a freshness question. Only
 * `GetDatasetStatusByName` / `GetDatasetByName` carry behaviour; everything else exists to
 * satisfy the abstract contract and is never reached by these tests.
 */
class ProbeProvider extends ProviderBase {
    public statusCalls = 0;
    public datasetFetches = 0;
    public obsoleteAnswer = false;
    public obsoleteCalls = 0;

    constructor(private readonly opts: ProbeOptions) {
        super();
    }

    // ── the two members under test ─────────────────────────────────────────────
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        this.statusCalls++;
        if (this.opts.statusRejectsWithError !== undefined) {
            throw this.opts.statusRejectsWithError;
        }
        if (this.opts.statusRejectsWith) {
            throw new Error(this.opts.statusRejectsWith);
        }
        return this.opts.statusResolvesWith as DatasetStatusResultType;
    }

    public async GetDatasetByName(): Promise<DatasetResultType> {
        this.datasetFetches++;
        return {
            DatasetID: 'fresh',
            DatasetName: DATASET,
            Success: true,
            Status: 'OK',
            LatestUpdateDate: new Date('2030-01-01T00:00:00Z'),
            Results: [],
        };
    }

    /**
     * Overridden so the test controls the comparison rather than constructing timestamp
     * fixtures: these tests are about whether the comparison is REACHED and what happens
     * when it cannot be, not about the comparison itself (which has its own coverage).
     */
    public override LocalMetadataObsolete(): boolean {
        this.obsoleteCalls++;
        return this.obsoleteAnswer;
    }

    // ── test seams ─────────────────────────────────────────────────────────────
    public seedLocalMetadata(entityCount: number): void {
        const md = new AllMetadata();
        md.AllEntities = Array.from(
            { length: entityCount },
            (_, i) => ({ ID: `e-${i}`, Name: `Entity ${i}`, Fields: [] }) as unknown as EntityInfo,
        );
        this.UpdateLocalMetadata(md);
    }

    public callRefreshRemoteTimestamps(): Promise<boolean> {
        return this.RefreshRemoteMetadataTimestamps();
    }

    public cacheKeyFor(datasetName: string, itemFilters?: DatasetItemFilterType[]): string {
        return this.GetDatasetCacheKey(datasetName, itemFilters);
    }

    // ── abstract contract, unused here ─────────────────────────────────────────
    protected get AllowRefresh() { return true; }
    get LocalStorageProvider() { return (this.opts.storage ?? null) as never; }
    get ProviderType() { return 0 as never; }
    get StartedAt() { return new Date(); }
    async GetEntityRecordName() { return null as never; }
    async GetEntityRecordNames() { return [] as never; }
    async GetRecordFavoriteStatus() { return false; }
    async SetRecordFavoriteStatus() { /* not reached */ }
    async GetRecordDuplicates() { return null as never; }
    async MergeRecords() { return null as never; }
    async GetRecordDependencies() { return [] as never; }
    async CreateTransactionGroup() { return null as never; }
    async Refresh() { return true; }
    get AllEntities() { return []; }
    get AllApplications() { return []; }
    get CurrentUser() { return null as never; }
    get Entities() { return []; }
    get Applications() { return []; }
    get LatestLocalMetadataTimestamps() { return []; }
    get LatestRemoteMetadataTimestamps() { return []; }
}

/** A cached dataset plus its `_date` sibling, keyed exactly as CacheDataset writes them. */
function seedCachedDataset(provider: ProbeProvider, entries: Map<string, unknown>, cachedAt: string): DatasetResultType {
    const key = provider.cacheKeyFor(DATASET);
    const dataset: DatasetResultType = {
        DatasetID: 'cached',
        DatasetName: DATASET,
        Success: true,
        Status: 'OK',
        LatestUpdateDate: new Date(cachedAt),
        Results: [],
    };
    entries.set(key, dataset);
    entries.set(`${key}_date`, cachedAt);
    return dataset;
}

describe('CheckToSeeIfRefreshNeeded — an unreachable status query is answered, not thrown', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // LogError writes to console.error; keep the suite output clean while still
        // letting the assertions below confirm the failure IS reported.
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silenced */ });
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('resolves false — "keep what you have" — when the status query rejects and a cached snapshot exists', async () => {
        const provider = new ProbeProvider({ statusRejectsWith: '504 Gateway Timeout' });
        provider.seedLocalMetadata(612);

        // The assertion that matters: this does not reject.
        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).resolves.toBe(false);
        expect(provider.statusCalls).toBe(1);
    });

    it('does not consult LocalMetadataObsolete at all on the warm-unreachable path', async () => {
        const provider = new ProbeProvider({ statusRejectsWith: '504 Gateway Timeout' });
        provider.seedLocalMetadata(612);
        // Obsolete would answer TRUE here purely because the remote timestamp list is empty —
        // a "reload everything" derived from the absence of an answer. Reaching it is the bug.
        provider.obsoleteAnswer = true;

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).resolves.toBe(false);
        expect(provider.obsoleteCalls).toBe(0);
    });

    it('resolves true when the status query rejects and there is NO cached snapshot to serve', async () => {
        const provider = new ProbeProvider({ statusRejectsWith: 'Failed to fetch' });
        // no seedLocalMetadata — cold cache

        // True, so the caller attempts a real load and fails against the metadata fetch
        // itself. That is the failure worth surfacing; this one is not.
        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).resolves.toBe(true);
    });

    it('reports the failure rather than swallowing it silently', async () => {
        const provider = new ProbeProvider({ statusRejectsWith: 'socket hang up' });
        provider.seedLocalMetadata(3);

        await provider.CheckToSeeIfRefreshNeeded(undefined, true);

        const logged = errorSpy.mock.calls.flat().map(String).join('\n');
        expect(logged).toContain('socket hang up');
    });

    it('does NOT degrade when the server answered unsuccessfully — that is permanent, not transient', async () => {
        // `Success: false` means the status dataset is missing or misconfigured, which will not
        // heal on its own. Serving the cache here would hide a broken endpoint forever; the
        // historical "treat it as obsolete and attempt the real load" is the right response,
        // because GetDatasetByName may well still work.
        const provider = new ProbeProvider({
            statusResolvesWith: { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] } as unknown as DatasetStatusResultType,
        });
        provider.seedLocalMetadata(612);
        provider.obsoleteAnswer = true;

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).resolves.toBe(true);
        expect(provider.obsoleteCalls).toBe(1);
    });

    it('still consults LocalMetadataObsolete when the server DID answer', async () => {
        const provider = new ProbeProvider({
            statusResolvesWith: {
                Success: true,
                LatestUpdateDate: new Date('2026-01-01T00:00:00Z'),
                EntityUpdateDates: [{ EntityID: 'e-0', EntityName: 'Entity 0', UpdateDate: new Date(), RowCount: 1 }],
            } as unknown as DatasetStatusResultType,
        });
        provider.seedLocalMetadata(1);
        provider.obsoleteAnswer = true;

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).resolves.toBe(true);
        expect(provider.obsoleteCalls).toBe(1);
    });

    it('RefreshRemoteMetadataTimestamps reports failure as false instead of rejecting', async () => {
        const provider = new ProbeProvider({ statusRejectsWith: 'ETIMEDOUT' });

        await expect(provider.callRefreshRemoteTimestamps()).resolves.toBe(false);
    });
});

describe('GetAndCacheDatasetByName — a failed freshness check serves the cache it already holds', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silenced */ });
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('returns the cached dataset when the status query rejects', async () => {
        const entries = new Map<string, unknown>();
        const provider = new ProbeProvider({ statusRejectsWith: '502 Bad Gateway', storage: fakeStorage(entries) });
        const cached = seedCachedDataset(provider, entries, '2026-05-01T00:00:00.000Z');

        const result = await provider.GetAndCacheDatasetByName(DATASET);

        expect(result).toBe(cached);
        expect(result.DatasetID).toBe('cached');
    });

    it('does not re-fetch from the same unreachable server', async () => {
        const entries = new Map<string, unknown>();
        const provider = new ProbeProvider({ statusRejectsWith: '502 Bad Gateway', storage: fakeStorage(entries) });
        seedCachedDataset(provider, entries, '2026-05-01T00:00:00.000Z');

        await provider.GetAndCacheDatasetByName(DATASET);

        expect(provider.datasetFetches).toBe(0);
    });

    it('says out loud that what it served may be stale', async () => {
        const entries = new Map<string, unknown>();
        const provider = new ProbeProvider({ statusRejectsWith: '502 Bad Gateway', storage: fakeStorage(entries) });
        seedCachedDataset(provider, entries, '2026-05-01T00:00:00.000Z');

        await provider.GetAndCacheDatasetByName(DATASET);

        const logged = errorSpy.mock.calls.flat().map(String).join('\n');
        expect(logged).toContain('502 Bad Gateway');
        expect(logged.toLowerCase()).toContain('stale');
    });

    it('still propagates when there is NO cache — it must never invent a dataset', async () => {
        const entries = new Map<string, unknown>();
        const provider = new ProbeProvider({ statusRejectsWith: '502 Bad Gateway', storage: fakeStorage(entries) });
        // nothing seeded: the cold path calls GetDatasetByName, which here succeeds — so the
        // only way this can differ from the warm case is if the guard leaked into the cold path.
        const result = await provider.GetAndCacheDatasetByName(DATASET);

        expect(result.DatasetID).toBe('fresh');
        expect(provider.datasetFetches).toBe(1);
        // The freshness check is never even reached without a cache entry.
        expect(provider.statusCalls).toBe(0);
    });

    it('still re-fetches when the server answers and says the cache is stale', async () => {
        const entries = new Map<string, unknown>();
        const provider = new ProbeProvider({
            storage: fakeStorage(entries),
            statusResolvesWith: {
                Success: true,
                // Newer than the cached date below → stale.
                LatestUpdateDate: new Date('2026-06-01T00:00:00.000Z'),
                EntityUpdateDates: [],
            } as unknown as DatasetStatusResultType,
        });
        seedCachedDataset(provider, entries, '2026-05-01T00:00:00.000Z');

        const result = await provider.GetAndCacheDatasetByName(DATASET);

        expect(result.DatasetID).toBe('fresh');
        expect(provider.datasetFetches).toBe(1);
    });
});

/**
 * The exact text MJAPI returns when an API key lacks `dataset:read` on `MJ_Metadata`. The
 * integration tier's FLS fixture builds a reader provider with a key whose scope rule has not
 * propagated yet, and relies on Config() REJECTING so it can retry until the rule is honored.
 */
const SCOPE_DENIAL =
    "Access denied. This API key requires the 'dataset:read' scope for resource 'MJ_Metadata' to " +
    "perform this operation. Please update the API key's scopes or use an API key with appropriate " +
    'permissions. Denial reason: No matching key scope rules';

describe('a server that ANSWERED "no" is not an outage — a denial propagates, it never degrades', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silenced */ });
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('CheckToSeeIfRefreshNeeded rejects with the denial even though a cached snapshot exists', async () => {
        // Serving the cache here would hand an unauthorised identity a metadata snapshot the
        // server just refused to give it, and would make the refusal invisible to the caller.
        const provider = new ProbeProvider({ statusRejectsWith: SCOPE_DENIAL });
        provider.seedLocalMetadata(612);

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).rejects.toThrow('dataset:read');
    });

    it('RefreshRemoteMetadataTimestamps rejects with the denial instead of reporting "could not tell"', async () => {
        const provider = new ProbeProvider({ statusRejectsWith: SCOPE_DENIAL });

        await expect(provider.callRefreshRemoteTimestamps()).rejects.toThrow('dataset:read');
    });

    it('a GraphQL-shaped denial (HTTP 200 with response.errors[]) is not read as transport either', async () => {
        const provider = new ProbeProvider({
            statusRejectsWithError: Object.assign(new Error(SCOPE_DENIAL), {
                response: { status: 200, errors: [{ message: SCOPE_DENIAL, extensions: { code: 'FORBIDDEN' } }] },
            }),
        });
        provider.seedLocalMetadata(612);

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).rejects.toThrow('dataset:read');
    });

    it('a programming error on the status path propagates too — degrading would hide it', async () => {
        const provider = new ProbeProvider({ statusRejectsWithError: new TypeError("Cannot read properties of undefined (reading 'EntityUpdateDates')") });
        provider.seedLocalMetadata(612);

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).rejects.toThrow(TypeError);
    });

    it('GetAndCacheDatasetByName propagates the denial and does NOT serve the cache it holds', async () => {
        const entries = new Map<string, unknown>();
        const provider = new ProbeProvider({ statusRejectsWith: SCOPE_DENIAL, storage: fakeStorage(entries) });
        seedCachedDataset(provider, entries, '2026-05-01T00:00:00.000Z');

        await expect(provider.GetAndCacheDatasetByName(DATASET)).rejects.toThrow('dataset:read');
        expect(provider.datasetFetches).toBe(0);
    });

    it('still degrades on a real transport failure carried as a status code, not as words', async () => {
        // Apollo's shape for a dead round trip: no transport vocabulary in the message at all.
        const provider = new ProbeProvider({
            statusRejectsWithError: Object.assign(new Error('Response not successful: Received status code 504'), {
                response: { status: 504 },
            }),
        });
        provider.seedLocalMetadata(612);

        await expect(provider.CheckToSeeIfRefreshNeeded(undefined, true)).resolves.toBe(false);
    });
});
