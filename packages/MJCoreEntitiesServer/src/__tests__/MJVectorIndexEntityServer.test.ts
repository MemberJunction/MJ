/**
 * Unit tests for `MJVectorIndexEntityServer`: the server-side Vector Index hook that provisions the
 * index in the vector DB provider when a new record is saved.
 *
 * Contract under test:
 *  - The save that creates the record returns as soon as the metadata row is written; provider
 *    provisioning runs detached, so the request that triggered it ("Auto" index creation from the
 *    UI) is never held while the provider works. Save() never throws over provisioning.
 *  - The detached outcome is written onto the row's ProviderConfig (`provisionState`,
 *    `provisionMessage`, `provisionCheckedAt`), so a row with no index behind it says so instead of
 *    looking identical to one that has one:
 *      provisioned    - the provider accepted; ExternalID/Dimensions/Metric are what it reported
 *      failed         - the provider refused or the driver threw; the provider's message is kept
 *      timed-out      - no answer within CREATE_INDEX_TIMEOUT_MS; not "failed", it may still finish
 *      not-applicable - the driver owns no index objects (ManagesIndexes === false)
 *      unprovisioned  - no driver instance could be built in this process
 *  - One provider call is bounded by CREATE_INDEX_TIMEOUT_MS. A provider that never answers is
 *    recorded and released; it cannot pin the promise (and the provider client) forever.
 *  - Saving an existing record does not touch the provider.
 *
 * Every collaborator is doubled: the generated base entity (settable fields + a Save spy), the
 * class-factory (returns a controllable vector DB), RunView (returns the Vector Database row) and the
 * API-key lookup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createInstanceMock = vi.fn();
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: (...args: unknown[]) => createInstanceMock(...args) } } },
    };
});

const runViewMock = vi.fn();
const logErrorMock = vi.fn();
const logStatusMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => logErrorMock(...args),
        LogStatus: (...args: unknown[]) => logStatusMock(...args),
        RunView: class {
            public async RunView(...args: unknown[]): Promise<unknown> {
                return runViewMock(...args);
            }
        },
    };
});

/** Counts every `super.Save()` the subclass performs, and lets a test fail one. */
const superSaveMock = vi.fn(async (): Promise<boolean> => true);
const superDeleteMock = vi.fn(async (): Promise<boolean> => true);
vi.mock('@memberjunction/core-entities', () => {
    class MockMJVectorIndexEntity {
        public ID = 'IDX00000-0000-0000-0000-000000000001';
        public Name = 'My Index';
        public Description: string | null = null;
        public VectorDatabaseID: string | null = 'VDB00000-0000-0000-0000-000000000001';
        public EmbeddingModelID: string | null = null;
        public Dimensions: number | null = null;
        public Metric: string | null = null;
        public ExternalID: string | null = null;
        public ProviderConfig: string | null = null;
        public ContextCurrentUser: unknown = { ID: 'USER0000-0000-0000-0000-000000000001' };
        public LatestResult = { CompleteMessage: '' };
        public everSaved = false;
        public get IsSaved(): boolean {
            return this.everSaved;
        }
        public get ProviderToUse(): unknown {
            return {};
        }
        public async Save(): Promise<boolean> {
            const ok = await superSaveMock();
            if (ok) {
                this.everSaved = true;
            }
            return ok;
        }
        public async Delete(): Promise<boolean> {
            return superDeleteMock();
        }
    }
    return { MJVectorIndexEntity: MockMJVectorIndexEntity, MJVectorDatabaseEntity: class {} };
});

vi.mock('@memberjunction/ai-vectordb', () => ({ VectorDBBase: class {}, IndexModelMetricEnum: {} }));
vi.mock('@memberjunction/ai', () => ({ GetAIAPIKey: () => 'test-api-key' }));
// The width probe: one embedding call with the index's model. Defaults to a failed call, so tests that
// do not care about the width get the documented fallback; the probe tests set a real vector.
const runEmbeddingMock = vi.fn();
vi.mock('@memberjunction/ai-prompts', () => ({
    AIEmbeddingRunner: class {
        public async RunEmbedding(...args: unknown[]): Promise<unknown> {
            return runEmbeddingMock(...args);
        }
    },
}));

// The delete path resolves the provider-side name through the engine's one rule (ExternalID, else Name).
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            GetProviderIndexName: (index: { ExternalID: string | null; Name: string }) => index.ExternalID || index.Name,
        },
    },
}));

import { MJVectorIndexEntityServer } from '../custom/MJVectorIndexEntityServer.server';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

/** Drain pending microtasks so the detached provisioning chain reaches (or passes) the provider call. */
async function flushMicrotasks(rounds = 20): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

const createIndexMock = vi.fn();
const deleteIndexMock = vi.fn();
type FakeVectorDB = {
    ManagesIndexes: boolean;
    CreateIndex: (...args: unknown[]) => unknown;
    DeleteIndex: (...args: unknown[]) => unknown;
    TryWireColocatedHost: ReturnType<typeof vi.fn>;
    SupportsColocatedQuery: boolean;
    RequiresAPIKey: boolean;
};
let fakeVectorDB: FakeVectorDB;

function makeNewIndex(): MJVectorIndexEntityServer {
    return new MJVectorIndexEntityServer();
}

function logged(pattern: RegExp): boolean {
    return logErrorMock.mock.calls.some(call => call.some(arg => pattern.test(String(arg instanceof Error ? arg.message : arg))));
}

/** The ProviderConfig JSON bag, parsed; `{}` while nothing has been written. */
function providerConfigOf(index: MJVectorIndexEntityServer): Record<string, unknown> {
    return JSON.parse(index.ProviderConfig ?? '{}') as Record<string, unknown>;
}

function provisionStateOf(index: MJVectorIndexEntityServer): unknown {
    return providerConfigOf(index)['provisionState'];
}

describe('MJVectorIndexEntityServer.Save', () => {
    beforeEach(() => {
        fakeVectorDB = {
            ManagesIndexes: true,
            CreateIndex: (...args: unknown[]) => createIndexMock(...args),
            DeleteIndex: (...args: unknown[]) => deleteIndexMock(...args),
            TryWireColocatedHost: vi.fn(),
            SupportsColocatedQuery: false,
            RequiresAPIKey: true,
        };
        createInstanceMock.mockReset().mockImplementation(() => fakeVectorDB);
        runViewMock.mockReset().mockResolvedValue({ Success: true, Results: [{ Name: 'Pinecone', ClassKey: 'PineconeDatabase' }] });
        createIndexMock.mockReset();
        deleteIndexMock.mockReset().mockResolvedValue({ success: true, message: '' });
        runEmbeddingMock.mockReset().mockResolvedValue({ Success: false, Vectors: [], ErrorMessage: 'no credentials (test default)' });
        superSaveMock.mockReset().mockResolvedValue(true);
        superDeleteMock.mockClear();
        logErrorMock.mockReset();
        logStatusMock.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns as soon as the metadata row is saved, while the provider call is still pending', async () => {
        const pending = deferred<{ success: boolean }>();
        createIndexMock.mockReturnValue(pending.promise);
        const index = makeNewIndex();

        const saved = await index.Save();
        await flushMicrotasks();

        expect(saved).toBe(true);
        expect(superSaveMock).toHaveBeenCalledTimes(1);
        expect(createIndexMock).toHaveBeenCalledTimes(1);
        expect(createIndexMock.mock.calls[0][0]).toMatchObject({ id: 'my-index', dimension: 1536, metric: 'cosine' });
    });

    it('writes the provider metadata back onto the record, stamped provisioned, once the provider accepts the index', async () => {
        createIndexMock.mockResolvedValue({ success: true, data: { host: 'my-index-abc.svc.pinecone.io', status: { ready: false } } });
        const index = makeNewIndex();
        index.Dimensions = 384;

        await index.Save();
        await vi.waitFor(() => expect(superSaveMock).toHaveBeenCalledTimes(2));

        expect(index.ExternalID).toBe('my-index');
        expect(index.Dimensions).toBe(384);
        expect(index.Metric).toBe('cosine');
        const config = providerConfigOf(index);
        expect(config['host']).toBe('my-index-abc.svc.pinecone.io');
        expect(config['spec']).toEqual({ serverless: { cloud: 'aws', region: 'us-east-1' } });
        expect(config['provisionState']).toBe('provisioned');
        expect(typeof config['provisionCheckedAt']).toBe('string');
        expect(config['provisionMessage']).toBeUndefined();
        expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: 384 });
    });

    it('writes back the provider\'s own dimension and metric, not the ones it asked for', async () => {
        // Metric used to be hardcoded 'cosine' at the request site and then written straight back, so
        // the column could only ever echo our own constant and never disagree with the provider.
        createIndexMock.mockResolvedValue({ success: true, data: { dimension: 768, metric: 'dotproduct' } });
        const index = makeNewIndex();
        index.Dimensions = 1536;

        await index.Save();
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('provisioned'));

        expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: 1536 });
        expect(index.Dimensions).toBe(768);
        expect(index.Metric).toBe('dotproduct');
    });

    it('requests the metric stated on the row rather than always cosine', async () => {
        createIndexMock.mockResolvedValue({ success: true, data: {} });
        const index = makeNewIndex();
        index.Metric = 'Euclidean';

        await index.Save();
        await vi.waitFor(() => expect(createIndexMock).toHaveBeenCalledTimes(1));

        expect(createIndexMock.mock.calls[0][0]).toMatchObject({ metric: 'euclidean' });
    });

    it('preserves driver-specific ProviderConfig keys when it stamps the outcome', async () => {
        createIndexMock.mockResolvedValue({ success: true, data: {} });
        const index = makeNewIndex();
        index.ProviderConfig = JSON.stringify({ namespaceField: 'tenant' });

        await index.Save();
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('provisioned'));

        expect(providerConfigOf(index)['namespaceField']).toBe('tenant');
    });

    it('clears its timer once the provider answers, so a fast create leaves nothing pending and never times out', async () => {
        vi.useFakeTimers();
        createIndexMock.mockResolvedValue({ success: true, data: {} });
        const index = makeNewIndex();

        await index.Save();
        await flushMicrotasks();
        await vi.waitFor(() => expect(superSaveMock).toHaveBeenCalledTimes(2));

        expect(vi.getTimerCount(), 'the timeout timer was cleared on the success path').toBe(0);
        await vi.advanceTimersByTimeAsync(MJVectorIndexEntityServer.CREATE_INDEX_TIMEOUT_MS + 1);
        expect(logged(/timed out/)).toBe(false);
        expect(index.ExternalID).toBe('my-index');
        expect(provisionStateOf(index)).toBe('provisioned');
    });

    it('records failed, with the provider\'s message, when the provider refuses the index; Save still resolves true', async () => {
        createIndexMock.mockResolvedValue({ success: false, message: 'quota exceeded for project' });
        const index = makeNewIndex();

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('failed'));

        const config = providerConfigOf(index);
        expect(config['provisionMessage']).toBe('quota exceeded for project');
        expect(typeof config['provisionCheckedAt']).toBe('string');
        // Nothing on the row claims an index exists.
        expect(index.ExternalID).toBeNull();
        expect(index.Dimensions).toBeNull();
        // The log says what was recorded, not "marked unprovisioned".
        expect(logged(/NOT created.*quota exceeded for project.*provisionState "failed"/)).toBe(true);
        expect(logged(/unprovisioned/)).toBe(false);
    });

    it('records failed when the driver throws instead of reporting failure', async () => {
        createIndexMock.mockRejectedValue(new Error('ECONNREFUSED api.pinecone.io'));
        const index = makeNewIndex();

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('failed'));

        expect(providerConfigOf(index)['provisionMessage']).toBe('ECONNREFUSED api.pinecone.io');
        expect(index.ExternalID).toBeNull();
    });

    it('bounds a provider call that never answers, and records timed-out rather than failed', async () => {
        vi.useFakeTimers();
        createIndexMock.mockReturnValue(new Promise(() => undefined));
        const index = makeNewIndex();

        await index.Save();
        await flushMicrotasks();
        expect(createIndexMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(MJVectorIndexEntityServer.CREATE_INDEX_TIMEOUT_MS - 1);
        expect(logged(/timed out/)).toBe(false);
        expect(provisionStateOf(index)).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1);
        await flushMicrotasks();

        expect(logged(/timed out/)).toBe(true);
        expect(provisionStateOf(index)).toBe('timed-out');
        expect(String(providerConfigOf(index)['provisionMessage'])).toMatch(/may still finish/);
        expect(index.ExternalID).toBeNull();
        // The only write after the row save is the recorded state; nothing the provider might
        // eventually return is written back.
        expect(superSaveMock).toHaveBeenCalledTimes(2);
    });

    it('does not call the provider, and records not-applicable, for a driver that owns no index objects', async () => {
        // MJ ships a Vector Index row for SimpleVectorServiceProvider, whose CreateIndex correctly
        // answers success:false; that is not a provisioning failure.
        fakeVectorDB.ManagesIndexes = false;
        const index = makeNewIndex();

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('not-applicable'));

        expect(createIndexMock).not.toHaveBeenCalled();
        expect(logged(/NOT created/)).toBe(false);
    });

    it('adopts the provider index a new record names through ExternalID, and creates nothing', async () => {
        // An Open App ships its index row with ExternalID set (More Cheese: morecheese-duplicates).
        // Creating one from Name would leave an empty index behind and repoint the row at it.
        const index = makeNewIndex();
        index.ExternalID = 'morecheese-duplicates';

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('adopted'));

        expect(createIndexMock).not.toHaveBeenCalled();
        expect(index.ExternalID).toBe('morecheese-duplicates');
        expect(String(providerConfigOf(index)['provisionMessage'])).toMatch(/"morecheese-duplicates" names an existing provider index/);
        expect(logged(/NOT created/)).toBe(false);
    });

    it('provisions as before when ExternalID is blank', async () => {
        createIndexMock.mockResolvedValue({ success: true, data: {} });
        const index = makeNewIndex();
        index.ExternalID = '   ';

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('provisioned'));

        expect(createIndexMock).toHaveBeenCalledTimes(1);
    });

    it('records unprovisioned when no driver instance could be built in this process', async () => {
        createInstanceMock.mockReturnValue(null);
        const index = makeNewIndex();

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('unprovisioned'));

        expect(String(providerConfigOf(index)['provisionMessage'])).toMatch(/No vector DB driver instance/);
        expect(index.ExternalID).toBeNull();
    });

    it('records unprovisioned when the Vector Database row cannot be resolved', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const index = makeNewIndex();

        await index.Save();
        await vi.waitFor(() => expect(provisionStateOf(index)).toBe('unprovisioned'));

        expect(createIndexMock).not.toHaveBeenCalled();
        expect(logged(/not found/)).toBe(true);
    });

    it('says the index exists when the write-back after a successful create fails, without throwing', async () => {
        createIndexMock.mockResolvedValue({ success: true, data: {} });
        superSaveMock.mockReset().mockResolvedValueOnce(true).mockResolvedValue(false);
        const index = makeNewIndex();
        index.LatestResult = { CompleteMessage: 'deadlock victim' };

        await expect(index.Save()).resolves.toBe(true);
        await vi.waitFor(() => expect(superSaveMock).toHaveBeenCalledTimes(2));
        await flushMicrotasks();

        expect(logged(/WAS created.*deadlock victim.*ExternalID to "my-index"/)).toBe(true);
    });

    it('provisions an auto-generated (already slug-form) name unchanged, so the provider index is the one the sync targets', async () => {
        // The shape BuildAutoVectorIndexName (ng-dashboards) emits: lowercase, digits, hyphens, under 45
        // characters, with a 6-character hash tail. Everything downstream addresses the index by Name,
        // so sanitizing must be a no-op for it.
        createIndexMock.mockResolvedValue({ success: true, data: {} });
        const index = makeNewIndex();
        index.Name = 'mj-accounts-text-embedding-3-small-k3x9zq';

        await index.Save();
        await vi.waitFor(() => expect(superSaveMock).toHaveBeenCalledTimes(2));

        expect(createIndexMock.mock.calls[0][0]).toMatchObject({ id: index.Name });
        expect(index.ExternalID).toBe(index.Name);
        expect(logStatusMock.mock.calls.some(call => String(call[0]).includes('sanitized'))).toBe(false);
    });

    describe('embedding width (#4988)', () => {
        const MODEL_ID = 'M0000000-0000-0000-0000-000000000384';

        function probeAnswers(width: number): void {
            runEmbeddingMock.mockResolvedValue({ Success: true, Vectors: [new Array<number>(width).fill(0.1)], ModelName: 'local-384', ErrorMessage: null });
        }

        it('creates the provider index at the width the model actually produces, and writes it back', async () => {
            probeAnswers(384);
            createIndexMock.mockResolvedValue({ success: true, data: {} });
            const index = makeNewIndex();
            index.EmbeddingModelID = MODEL_ID;

            await index.Save();
            await vi.waitFor(() => expect(superSaveMock).toHaveBeenCalledTimes(2));

            expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: 384 });
            expect(index.Dimensions).toBe(384);
        });

        it('probes with the index\'s own model pinned, as the user who saved, without writing a run row', async () => {
            probeAnswers(384);
            createIndexMock.mockResolvedValue({ success: true, data: {} });
            const index = makeNewIndex();
            index.EmbeddingModelID = MODEL_ID;

            await index.Save();
            await vi.waitFor(() => expect(createIndexMock).toHaveBeenCalledTimes(1));

            expect(runEmbeddingMock).toHaveBeenCalledTimes(1);
            expect(runEmbeddingMock.mock.calls[0][0]).toMatchObject({
                ModelID: MODEL_ID,
                ContextUser: index.ContextCurrentUser,
                SkipRunRecord: true,
            });
            expect((runEmbeddingMock.mock.calls[0][0] as { Texts: string[] }).Texts).toHaveLength(1);
        });

        it('does not probe when the record already states its width', async () => {
            probeAnswers(384);
            createIndexMock.mockResolvedValue({ success: true, data: {} });
            const index = makeNewIndex();
            index.EmbeddingModelID = MODEL_ID;
            index.Dimensions = 3072;

            await index.Save();
            await vi.waitFor(() => expect(createIndexMock).toHaveBeenCalledTimes(1));

            expect(runEmbeddingMock).not.toHaveBeenCalled();
            expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: 3072 });
        });

        it('falls back to the default width, and says so, when the probe fails', async () => {
            runEmbeddingMock.mockResolvedValue({ Success: false, Vectors: [], ErrorMessage: 'No Embeddings model has credentials available' });
            createIndexMock.mockResolvedValue({ success: true, data: {} });
            const index = makeNewIndex();
            index.EmbeddingModelID = MODEL_ID;

            await index.Save();
            await vi.waitFor(() => expect(createIndexMock).toHaveBeenCalledTimes(1));

            expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: MJVectorIndexEntityServer.DEFAULT_DIMENSIONS });
            expect(logged(/No Embeddings model has credentials/)).toBe(true);
            expect(logged(/fallback/)).toBe(true);
        });

        it('falls back when the probe throws or hangs, without blocking the create or recording a timeout', async () => {
            vi.useFakeTimers();
            runEmbeddingMock.mockReturnValue(new Promise(() => undefined));
            createIndexMock.mockResolvedValue({ success: true, data: {} });
            const index = makeNewIndex();
            index.EmbeddingModelID = MODEL_ID;

            await index.Save();
            await flushMicrotasks();
            expect(createIndexMock).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(MJVectorIndexEntityServer.DIMENSION_PROBE_TIMEOUT_MS + 1);
            await flushMicrotasks();

            expect(createIndexMock).toHaveBeenCalledTimes(1);
            expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: MJVectorIndexEntityServer.DEFAULT_DIMENSIONS });
            expect(logged(/timed out/)).toBe(true);
            // A slow probe is not a slow provider: the create still ran and the row is provisioned.
            expect(provisionStateOf(index)).toBe('provisioned');
        });

        it('skips the probe and falls back when the record names no embedding model', async () => {
            probeAnswers(384);
            createIndexMock.mockResolvedValue({ success: true, data: {} });
            const index = makeNewIndex();
            index.EmbeddingModelID = null;

            await index.Save();
            await vi.waitFor(() => expect(createIndexMock).toHaveBeenCalledTimes(1));

            expect(runEmbeddingMock).not.toHaveBeenCalled();
            expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: MJVectorIndexEntityServer.DEFAULT_DIMENSIONS });
            expect(logged(/no EmbeddingModelID/)).toBe(true);
        });
    });

    it('leaves the provider alone when saving a record that already exists', async () => {
        const index = makeNewIndex();
        index.everSaved = true;

        await index.Save();
        await flushMicrotasks();

        expect(superSaveMock).toHaveBeenCalledTimes(1);
        expect(createIndexMock).not.toHaveBeenCalled();
        expect(index.ProviderConfig).toBeNull();
    });
});

describe('MJVectorIndexEntityServer.Delete', () => {
    beforeEach(() => {
        fakeVectorDB = {
            ManagesIndexes: true,
            CreateIndex: (...args: unknown[]) => createIndexMock(...args),
            DeleteIndex: (...args: unknown[]) => deleteIndexMock(...args),
            TryWireColocatedHost: vi.fn(),
            SupportsColocatedQuery: false,
            RequiresAPIKey: true,
        };
        createInstanceMock.mockReset().mockImplementation(() => fakeVectorDB);
        runViewMock.mockReset().mockResolvedValue({ Success: true, Results: [{ Name: 'Pinecone', ClassKey: 'PineconeDatabase' }] });
        deleteIndexMock.mockReset().mockResolvedValue({ success: true, message: '' });
        superDeleteMock.mockClear();
        logErrorMock.mockReset();
    });

    it('deletes the provider index by its provider-side name', async () => {
        const index = makeNewIndex();
        index.ExternalID = 'my-index';

        await expect(index.Delete()).resolves.toBe(true);

        expect(deleteIndexMock).toHaveBeenCalledWith({ id: 'my-index' });
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
    });

    it('leaves an adopted provider index in place: MJ never created it', async () => {
        const index = makeNewIndex();
        index.ExternalID = 'morecheese-duplicates';
        index.ProviderConfig = JSON.stringify({ provisionState: 'adopted' });

        await expect(index.Delete()).resolves.toBe(true);

        expect(deleteIndexMock).not.toHaveBeenCalled();
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
    });

    it('does not ask a driver that owns no index objects to delete one', async () => {
        fakeVectorDB.ManagesIndexes = false;
        const index = makeNewIndex();

        await expect(index.Delete()).resolves.toBe(true);

        expect(deleteIndexMock).not.toHaveBeenCalled();
        expect(superDeleteMock).toHaveBeenCalledTimes(1);
    });
});
