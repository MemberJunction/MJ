import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    AllMetadata,
    DatasetItemFilterType,
    DatasetReadOptions,
    DatasetResultType,
    DatasetStatusResultType,
    IMetadataProvider,
    ProviderConfigDataBase,
} from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

/**
 * `mj sync push` reloads metadata inside its own transaction (RefreshWithinTransaction, MJ#4836). A
 * reload already in flight reads the metadata dataset on the pool (#4514), and those reads block on
 * the push transaction's row locks until it commits, so the in-transaction refresh must not wait for
 * it. The provider below models that: a pool read of the metadata dataset waits until the test
 * releases it (the "commit"); a read that joins the transaction is never blocked by it.
 */

type ReadKind = 'dataset' | 'status';

interface RecordedRead {
    Kind: ReadKind;
    /** Whether the read asked to join the ambient transaction. */
    Joined: boolean;
    /** Unique per read; a dataset read stamps it on the single entity it returns. */
    Label: string;
}

class TransactionModelProvider extends TestMetadataProvider {
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
        if (read.Joined ? this.HoldJoinedReads : this.HoldPoolReads) {
            await new Promise<void>(resolve => this._held.set(read.Label, resolve));
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
}

async function configuredProvider(): Promise<TransactionModelProvider> {
    const provider = new TransactionModelProvider();
    provider.setMockDelay(0);
    await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    provider.Reads = [];
    provider.Adopted = [];
    return provider;
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

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('RefreshWithinTransaction', () => {
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

        expect(await withinMs(provider.RefreshWithinTransaction(), 2000, 'RefreshWithinTransaction')).toBe(true);
        const transactionRead = provider.DatasetReads()[1];
        expect(transactionRead.Joined).toBe(true);
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);

        // The older pool pass finishes after the in-transaction pass: its snapshot must not win.
        provider.Release(olderPoolRead.Label);
        await vi.waitFor(() => expect(provider.DatasetReads()).toHaveLength(3));
        const followUpRead = provider.DatasetReads()[2];
        expect(followUpRead.Joined).toBe(false);
        expect(provider.Entities[0].Name).toBe(transactionRead.Label);

        provider.Release(followUpRead.Label);
        await withinMs(poolReload, 2000, 'pool reload');
        expect(provider.Adopted).toEqual([transactionRead.Label, followUpRead.Label]);
    });
});

describe('every reload pass is adopted only if no newer pass was', () => {
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
    });
});
