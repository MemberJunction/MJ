/**
 * Unit tests for `MJVectorIndexEntityServer`: the server-side Vector Index hook that provisions the
 * index in the vector DB provider when a new record is saved.
 *
 * Contract under test:
 *  - The save that creates the record returns as soon as the metadata row is written; provider
 *    provisioning runs detached, so the request that triggered it ("Auto" index creation from the
 *    UI) is never held while the provider works.
 *  - When the provider accepts the index, its metadata (ExternalID, Dimensions, Metric, spec) is
 *    written back onto the record (the MJ #4437 regression: without it every later embedding write
 *    fails on a dimension mismatch).
 *  - One provider call is bounded by CREATE_INDEX_TIMEOUT_MS. A provider that never answers is logged
 *    and released; it cannot pin the promise (and the provider client) forever.
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

const superSaveMock = vi.fn();
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
            superSaveMock();
            this.everSaved = true;
            return true;
        }
    }
    return { MJVectorIndexEntity: MockMJVectorIndexEntity, MJVectorDatabaseEntity: class {} };
});

vi.mock('@memberjunction/ai-vectordb', () => ({ VectorDBBase: class {}, IndexModelMetricEnum: {} }));
vi.mock('@memberjunction/ai', () => ({ GetAIAPIKey: () => 'test-api-key' }));

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
const fakeVectorDB = {
    CreateIndex: (...args: unknown[]) => createIndexMock(...args),
    TryWireColocatedHost: vi.fn(),
    SupportsColocatedQuery: false,
    RequiresAPIKey: true,
};

function makeNewIndex(): MJVectorIndexEntityServer {
    return new MJVectorIndexEntityServer();
}

function logged(pattern: RegExp): boolean {
    return logErrorMock.mock.calls.some(call => call.some(arg => pattern.test(String(arg instanceof Error ? arg.message : arg))));
}

describe('MJVectorIndexEntityServer.Save', () => {
    beforeEach(() => {
        createInstanceMock.mockReset().mockReturnValue(fakeVectorDB);
        runViewMock.mockReset().mockResolvedValue({ Success: true, Results: [{ Name: 'Pinecone', ClassKey: 'PineconeDatabase' }] });
        createIndexMock.mockReset();
        superSaveMock.mockReset();
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

    it('writes the provider metadata back onto the record once the provider accepts the index', async () => {
        createIndexMock.mockResolvedValue({ success: true, data: { host: 'my-index-abc.svc.pinecone.io', status: { ready: false } } });
        const index = makeNewIndex();
        index.Dimensions = 384;

        await index.Save();
        await vi.waitFor(() => expect(superSaveMock).toHaveBeenCalledTimes(2));

        expect(index.ExternalID).toBe('my-index');
        expect(index.Dimensions).toBe(384);
        expect(index.Metric).toBe('cosine');
        const config = JSON.parse(index.ProviderConfig ?? '{}');
        expect(config.host).toBe('my-index-abc.svc.pinecone.io');
        expect(config.spec).toEqual({ serverless: { cloud: 'aws', region: 'us-east-1' } });
        expect(createIndexMock.mock.calls[0][0]).toMatchObject({ dimension: 384 });
    });

    it('does not write metadata back when the provider refuses the index', async () => {
        createIndexMock.mockResolvedValue({ success: false, message: 'quota exceeded' });
        const index = makeNewIndex();

        await index.Save();
        await flushMicrotasks();

        expect(superSaveMock).toHaveBeenCalledTimes(1);
        expect(index.ExternalID).toBeNull();
        expect(logged(/quota exceeded/)).toBe(true);
    });

    it('bounds a provider call that never answers: logs the timeout and skips the write-back', async () => {
        vi.useFakeTimers();
        createIndexMock.mockReturnValue(new Promise(() => undefined));
        const index = makeNewIndex();

        await index.Save();
        await flushMicrotasks();
        expect(createIndexMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(MJVectorIndexEntityServer.CREATE_INDEX_TIMEOUT_MS - 1);
        expect(logged(/timed out/)).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await flushMicrotasks();

        expect(logged(/timed out/)).toBe(true);
        expect(superSaveMock).toHaveBeenCalledTimes(1);
        expect(index.ExternalID).toBeNull();
    });

    it('leaves the provider alone when saving a record that already exists', async () => {
        const index = makeNewIndex();
        index.everSaved = true;

        await index.Save();
        await flushMicrotasks();

        expect(superSaveMock).toHaveBeenCalledTimes(1);
        expect(createIndexMock).not.toHaveBeenCalled();
    });

    it('logs and gives up when the Vector Database row cannot be resolved', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        const index = makeNewIndex();

        await index.Save();
        await flushMicrotasks();

        expect(createIndexMock).not.toHaveBeenCalled();
        expect(logged(/not found/)).toBe(true);
    });
});
