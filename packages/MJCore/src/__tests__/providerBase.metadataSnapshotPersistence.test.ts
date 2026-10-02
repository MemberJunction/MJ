/**
 * The metadata snapshot is only worth writing if something can read it back (#4882).
 *
 * `ProviderBase` persists a snapshot of ALL metadata to its local storage provider on every
 * metadata reload. On Redis or a browser store that is a real cross-process cache. On an
 * in-process `Map` the only possible reader is the heap that already holds the live objects, so the
 * save spends a full `JSON.stringify` of the whole metadata graph — 131M characters on a large
 * tenant — plus a `Blob` copy, a gzip pass and a base64 encode, to produce something nothing will
 * ever read. The load then spends a `JSON.parse` and a rebuild of every `EntityInfo` and
 * `EntityFieldInfo` to read it back.
 *
 * Measured on a 791-entity tenant with no `REDIS_URL`: ~10s and ~1.2GB of transient heap per
 * refresh against a 2.2GB steady state, and the final flatten of that JSON string needs one
 * contiguous ~500MB allocation. Saved queries are metadata members, so an agent writing them
 * triggers a refresh roughly every 30s; two overlapping refreshes exhausted the heap and MJAPI died
 * with `Reached heap limit Allocation failed` inside `String::SlowFlatten`.
 *
 * `ILocalStorageProvider.SupportsCrossProcessPersistence` lets the provider answer the only
 * question that matters here. The cases below pin both directions of the gate — that an in-process
 * store is skipped, and just as importantly that a persistent one is NOT, since over-reaching would
 * silently disable the cold-start cache everywhere.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import {
    RunViewResult,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';

/**
 * Records every call so a test can assert that a store was never touched — the only honest way to
 * show the serialize/compress/encode pass did not run. Its persistence answer is settable so one
 * harness can stand in for an in-process Map, a Redis-backed store, and a provider predating the
 * flag entirely.
 */
class RecordingStorageProvider implements ILocalStorageProvider {
    public readonly SharesReferences = true;

    /** Mirrors the real flag: `false` in-process, `true` persistent, `undefined` predates it. */
    public SupportsCrossProcessPersistence?: boolean;

    public SetKeys: string[] = [];
    public GetKeys: string[] = [];

    private _store = new Map<string, unknown>();

    constructor(persistence?: boolean) {
        this.SupportsCrossProcessPersistence = persistence;
    }

    async GetItem<T>(key: string): Promise<T | null> {
        this.GetKeys.push(key);
        return (this._store.get(key) as T) ?? null;
    }
    async GetItems<T>(keys: string[]): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const k of keys) {
            this.GetKeys.push(k);
            out.set(k, (this._store.get(k) as T) ?? null);
        }
        return out;
    }
    async SetItem<T>(key: string, value: T): Promise<void> {
        this.SetKeys.push(key);
        this._store.set(key, value);
    }
    async Remove(key: string): Promise<void> {
        this._store.delete(key);
    }
    async ClearCategory(): Promise<void> { /* noop */ }
    async GetCategoryKeys(): Promise<string[]> { return []; }

    get TouchCount(): number { return this.SetKeys.length + this.GetKeys.length; }
}

class TestProvider extends ProviderBase {
    constructor(private _storage: ILocalStorageProvider | null) {
        super();
    }

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    public get InstanceConnectionString(): string { return 'snapshot-test'; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._storage as ILocalStorageProvider; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }

    /** `LoadLocalMetadataFromStorage` is protected; the gate is what these tests are about. */
    public async LoadSnapshotForTest(): Promise<void> {
        await (this as unknown as { LoadLocalMetadataFromStorage(): Promise<void> }).LoadLocalMetadataFromStorage();
    }

    /** The two codecs are `protected static`. */
    public static ToBase64(buffer: ArrayBuffer): string {
        return (ProviderBase as unknown as { arrayBufferToBase64(b: ArrayBuffer): string }).arrayBufferToBase64(buffer);
    }
    public static FromBase64(base64: string): ArrayBuffer {
        return (ProviderBase as unknown as { base64ToArrayBuffer(s: string): ArrayBuffer }).base64ToArrayBuffer(base64);
    }

    // ── abstract surface these tests do not exercise ───────────────────────────
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', Filtered: false, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
}

describe('ProviderBase — the metadata snapshot persistence gate', () => {
    describe('MetadataSnapshotPersistenceEnabled', () => {
        it('is false for an in-process store', () => {
            expect(new TestProvider(new RecordingStorageProvider(false)).MetadataSnapshotPersistenceEnabled).toBe(false);
        });

        it('is true for a store that declares cross-process persistence', () => {
            expect(new TestProvider(new RecordingStorageProvider(true)).MetadataSnapshotPersistenceEnabled).toBe(true);
        });

        /**
         * The backward-compatibility guarantee. The flag is optional so adding the contract could
         * not break an external provider at compile time; such a provider must keep its snapshot.
         */
        it('treats a provider that does not declare the flag as persistent', () => {
            expect(new TestProvider(new RecordingStorageProvider(undefined)).MetadataSnapshotPersistenceEnabled).toBe(true);
        });

        it('is false when there is no storage provider at all', () => {
            expect(new TestProvider(null).MetadataSnapshotPersistenceEnabled).toBe(false);
        });
    });

    describe('the save path', () => {
        /**
         * REGRESSION PIN. Against the un-fixed code this fails: the full stringify/gzip/base64 pass
         * runs and writes the snapshot and timestamp keys into a Map that dies with the process.
         */
        it('writes nothing at all to an in-process store', async () => {
            const store = new RecordingStorageProvider(false);
            await new TestProvider(store).SaveLocalMetadataToStorage();

            expect(store.SetKeys).toEqual([]);
            expect(store.TouchCount).toBe(0);
        });

        /**
         * The other direction, and the reason the gate is a provider-declared flag rather than a
         * blanket removal: a persistent store must still get its snapshot.
         */
        it('still writes to a store that persists across processes', async () => {
            const store = new RecordingStorageProvider(true);
            await new TestProvider(store).SaveLocalMetadataToStorage();

            expect(store.SetKeys.length).toBeGreaterThan(0);
        });

        it('still writes to a provider that predates the flag', async () => {
            const store = new RecordingStorageProvider(undefined);
            await new TestProvider(store).SaveLocalMetadataToStorage();

            expect(store.SetKeys.length).toBeGreaterThan(0);
        });
    });

    describe('the load path', () => {
        /**
         * REGRESSION PIN. Symmetrical with the save. Against the un-fixed code the snapshot keys are
         * read back and every metadata object is rebuilt from a copy of what the heap already holds.
         */
        it('reads nothing at all from an in-process store', async () => {
            const store = new RecordingStorageProvider(false);
            await new TestProvider(store).LoadSnapshotForTest();

            expect(store.GetKeys).toEqual([]);
            expect(store.TouchCount).toBe(0);
        });

        it('still reads from a store that persists across processes', async () => {
            const store = new RecordingStorageProvider(true);
            await new TestProvider(store).LoadSnapshotForTest();

            expect(store.GetKeys.length).toBeGreaterThan(0);
        });
    });

    describe('the explanation', () => {
        let logSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            logSpy = vi.spyOn(console, 'log').mockImplementation(() => { /* silence */ });
        });
        afterEach(() => {
            logSpy.mockRestore();
        });

        /**
         * The refresh path runs every 30 seconds on a busy server. Logging the skip per call would
         * bury the one line that explains why the snapshot is absent.
         */
        it('explains the skip once per provider, not once per refresh', async () => {
            const provider = new TestProvider(new RecordingStorageProvider(false));

            await provider.SaveLocalMetadataToStorage();
            await provider.SaveLocalMetadataToStorage();
            await provider.LoadSnapshotForTest();

            const skipLines = logSpy.mock.calls
                .map(args => args.map(a => String(a)).join(' '))
                .filter(line => line.includes('Snapshot persistence disabled'));
            expect(skipLines).toHaveLength(1);
        });
    });
});

/**
 * The byte-at-a-time base64 loops were the second allocation hazard: `binary +=
 * String.fromCharCode(b)` builds a rope the size of the payload and then forces a flatten,
 * measured at 3702ms for an 8.6MB buffer under heap pressure against 191ms cold. Node encodes and
 * decodes the same bytes natively.
 *
 * These are equivalence pins, not regression pins — the point is that the fast path produces
 * BYTE-IDENTICAL output to the loops it replaces, including for bytes above 0x7F where a latin1
 * assumption would corrupt the payload, and for lengths that are not a multiple of three where
 * base64 padding applies. A round-trip test alone would pass even if both directions were wrong in
 * the same way, so the encoder is also compared against an independent reference.
 */
describe('ProviderBase — base64 codecs', () => {
    /** The implementation these replaced, kept as the reference. */
    function legacyEncode(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    const cases: Array<{ name: string; bytes: number[] }> = [
        { name: 'empty', bytes: [] },
        { name: 'one byte (two padding chars)', bytes: [0x41] },
        { name: 'two bytes (one padding char)', bytes: [0x41, 0x42] },
        { name: 'three bytes (no padding)', bytes: [0x41, 0x42, 0x43] },
        { name: 'high bytes above 0x7F', bytes: [0xff, 0xfe, 0x80, 0x81, 0x00, 0x7f] },
        { name: 'gzip-like header', bytes: [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00] },
    ];

    for (const c of cases) {
        it(`encodes ${c.name} exactly as the byte-at-a-time loop did`, () => {
            const buf = new Uint8Array(c.bytes).buffer;
            expect(TestProvider.ToBase64(buf)).toBe(legacyEncode(buf));
        });

        it(`round-trips ${c.name} back to the same bytes`, () => {
            const buf = new Uint8Array(c.bytes).buffer;
            const decoded = new Uint8Array(TestProvider.FromBase64(TestProvider.ToBase64(buf)));
            expect(Array.from(decoded)).toEqual(c.bytes);
        });
    }

    /**
     * `Buffer.from(...).buffer` is a pooled allocation that is usually much larger than the payload,
     * so the decoder has to slice. Without that slice the returned ArrayBuffer carries unrelated
     * bytes and its byteLength is wrong — which would corrupt every gunzip of a snapshot.
     */
    it('returns an ArrayBuffer sized exactly to the payload, not to Node\'s pool', () => {
        const bytes = [1, 2, 3, 4, 5];
        const decoded = TestProvider.FromBase64(TestProvider.ToBase64(new Uint8Array(bytes).buffer));

        expect(decoded.byteLength).toBe(bytes.length);
        expect(Array.from(new Uint8Array(decoded))).toEqual(bytes);
    });

    it('round-trips a payload large enough to have exercised the rope', () => {
        const bytes = new Uint8Array(64 * 1024);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = i % 256;
        }
        const decoded = new Uint8Array(TestProvider.FromBase64(TestProvider.ToBase64(bytes.buffer)));

        expect(decoded.byteLength).toBe(bytes.length);
        expect(decoded).toEqual(bytes);
    });
});
