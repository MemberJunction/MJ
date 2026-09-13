/**
 * Unit tests for `MJVectorIndexEntityServer` — the row that either has an index behind it or
 * says why not.
 *
 * The defect these pin: index provisioning used to be fired and forgotten
 * (`this.createIndexInProvider().catch(LogError)`), so `Save()` resolved `true` before the
 * provider had been asked anything. A `success: false` from the provider reached only the server
 * log, and the committed row sat there with `ExternalID`, `Dimensions` and `Metric` all null,
 * indistinguishable from a row whose index exists. Even the happy path raced the caller: the
 * write-back landed after `Save()` had already returned, which is why `Dimensions` is null on so
 * many rows despite the code appearing to write it.
 *
 * Two shapes of outcome are deliberately NOT fatal, and both are pinned here, because making them
 * fatal would break things that have nothing to do with the index:
 *
 *   - a driver that owns no index objects (`ManagesIndexes === false`) — MJ ships exactly such a
 *     Vector Index row by default (`Default - SVS + gte-small (Local)`), and `mj sync push` of it
 *     must keep working;
 *   - no driver instance in this process at all — the `mj sync` CLI does not load vector-DB
 *     driver packages, and that says nothing about the index.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator, and make ClassFactory controllable.
const createInstanceMock = vi.fn();
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: (...args: unknown[]) => createInstanceMock(...args),
                },
            },
        },
    };
});

const runViewMock = vi.fn();
const logErrorMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public RunView(...args: unknown[]) { return runViewMock(...args); }
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: (...args: unknown[]) => logErrorMock(...args),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/ai', () => ({
    GetAIAPIKey: () => 'test-key',
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    // The subclass only uses VectorDBBase as the ClassFactory lookup token.
    VectorDBBase: class {},
}));

/** Counts every `super.Save()` the subclass performs, and lets a test fail one. */
const superSaveMock = vi.fn(async () => true);
const superDeleteMock = vi.fn(async () => true);

vi.mock('@memberjunction/core-entities', () => {
    class MockMJVectorIndexEntity {
        public ID = 'IDX-1111-2222-3333-444444444444';
        public Name = 'My Knowledge Index';
        public Description: string | null = null;
        public VectorDatabaseID: string | null = 'VDB-1111-2222-3333-444444444444';
        public EmbeddingModelID: string | null = 'MOD-1111-2222-3333-444444444444';
        public ExternalID: string | null = null;
        public Dimensions: number | null = null;
        public Metric: string | null = null;
        public ProviderConfig: string | null = null;
        public ContextCurrentUser: unknown = { ID: 'user-1' };
        public IsSaved = false;
        public LatestResult: { CompleteMessage?: string } | null = null;
        public get ProviderToUse(): unknown { return {}; }
        public async Save(): Promise<boolean> {
            const ok = await superSaveMock();
            if (ok) this.IsSaved = true;
            return ok;
        }
        public async Delete(): Promise<boolean> { return superDeleteMock(); }
    }
    return {
        MJVectorIndexEntity: MockMJVectorIndexEntity,
        MJVectorDatabaseEntity: class {},
    };
});

import { MJVectorIndexEntityServer } from '../custom/MJVectorIndexEntityServer.server';

/**
 * The surface these tests drive. The mocked `@memberjunction/core-entities` base exposes plain
 * settable fields where the real `BaseEntity` has accessors and a multi-argument constructor, so
 * the row is addressed through this shape rather than through the compiled entity types.
 */
interface Row {
    Save(): Promise<boolean>;
    Name: string;
    ExternalID: string | null;
    Dimensions: number | null;
    Metric: string | null;
    ProviderConfig: string | null;
    VectorDatabaseID: string | null;
    IsSaved: boolean;
    LatestResult: { CompleteMessage?: string } | null;
}

/** The subclass as the mocked base makes it constructible: no arguments. */
const RowCtor = MJVectorIndexEntityServer as unknown as new () => Row;

interface FakeDriver {
    ManagesIndexes: boolean;
    CreateIndex: ReturnType<typeof vi.fn>;
    DeleteIndex: ReturnType<typeof vi.fn>;
    SupportsColocatedQuery: boolean;
    RequiresAPIKey: boolean;
    TryWireColocatedHost: ReturnType<typeof vi.fn>;
}

function makeDriver(overrides: Partial<FakeDriver> = {}): FakeDriver {
    return {
        ManagesIndexes: true,
        CreateIndex: vi.fn(async () => ({ success: true, message: '', data: { dimension: 1536, metric: 'cosine', host: 'h' } })),
        DeleteIndex: vi.fn(async () => ({ success: true, message: '', data: null })),
        SupportsColocatedQuery: false,
        RequiresAPIKey: true,
        TryWireColocatedHost: vi.fn(),
        ...overrides,
    };
}

/** Wire the VectorDatabase lookup + the driver the ClassFactory hands back. */
function withDriver(driver: FakeDriver | null) {
    runViewMock.mockResolvedValue({ Success: true, Results: [{ ID: 'VDB-1', Name: 'Pinecone', ClassKey: 'PineconeDatabase' }] });
    createInstanceMock.mockReturnValue(driver);
}

function newRow(): Row {
    return new RowCtor();
}

function providerConfigOf(row: Row): Record<string, unknown> {
    expect(row.ProviderConfig, 'ProviderConfig should have been written').toBeTruthy();
    return JSON.parse(row.ProviderConfig as string) as Record<string, unknown>;
}

describe('MJVectorIndexEntityServer.Save — provisioning is awaited, not fired and forgotten', () => {
    beforeEach(() => {
        runViewMock.mockReset();
        createInstanceMock.mockReset();
        logErrorMock.mockReset();
        superSaveMock.mockReset();
        superSaveMock.mockResolvedValue(true);
        superDeleteMock.mockClear();
    });

    it('a provider that fails CreateIndex leaves a row that does not claim a working index', async () => {
        const driver = makeDriver({
            CreateIndex: vi.fn(async () => ({ success: false, message: 'quota exceeded for project', data: null })),
        });
        withDriver(driver);
        const row = newRow();

        await expect(row.Save()).rejects.toThrow(/quota exceeded for project/);

        // Nothing on the row claims an index exists...
        expect(row.ExternalID).toBeNull();
        expect(row.Dimensions).toBeNull();
        // ...and the row itself says why not.
        const cfg = providerConfigOf(row);
        expect(cfg['provisionState']).toBe('failed');
        expect(cfg['provisionMessage']).toContain('quota exceeded for project');
        expect(typeof cfg['provisionCheckedAt']).toBe('string');
    });

    it('names the index and the provider reason when it refuses', async () => {
        withDriver(makeDriver({
            CreateIndex: vi.fn(async () => ({ success: false, message: 'quota exceeded', data: null })),
        }));
        const row = newRow();
        await expect(row.Save()).rejects.toThrow(/My Knowledge Index/);
    });

    it('a driver that throws is the same verdict as one that reports failure', async () => {
        withDriver(makeDriver({
            CreateIndex: vi.fn(async () => { throw new Error('ECONNREFUSED api.pinecone.io'); }),
        }));
        const row = newRow();

        await expect(row.Save()).rejects.toThrow(/ECONNREFUSED api\.pinecone\.io/);
        expect(providerConfigOf(row)['provisionState']).toBe('failed');
        expect(row.ExternalID).toBeNull();
    });

    it('the provider metadata is on the row by the time Save resolves', async () => {
        // The fire-and-forget version could not satisfy this: the write-back happened on a
        // continuation after Save() had already returned.
        const driver = makeDriver();
        withDriver(driver);
        const row = newRow();

        await expect(row.Save()).resolves.toBe(true);

        expect(driver.CreateIndex).toHaveBeenCalledTimes(1);
        expect(row.ExternalID).toBe('my-knowledge-index'); // sanitized for the provider
        expect(row.Dimensions).toBe(1536);
        expect(providerConfigOf(row)['provisionState']).toBe('provisioned');
    });

    it('writes back the provider\'s own dimension and metric, not the ones we asked for', async () => {
        // Metric used to be hardcoded 'cosine' at the request site and then written straight back,
        // so the column could only ever echo our own constant — it could never disagree with the
        // provider, which is the only thing that made it worth storing.
        withDriver(makeDriver({
            CreateIndex: vi.fn(async () => ({ success: true, message: '', data: { dimension: 768, metric: 'dotproduct' } })),
        }));
        const row = newRow();
        row.Dimensions = 1536; // what we would have requested

        await expect(row.Save()).resolves.toBe(true);
        expect(row.Dimensions).toBe(768);
        expect(row.Metric).toBe('dotproduct');
    });

    it('requests the metric stated on the row rather than always cosine', async () => {
        const driver = makeDriver({
            CreateIndex: vi.fn(async () => ({ success: true, message: '', data: null })),
        });
        withDriver(driver);
        const row = newRow();
        row.Metric = 'Euclidean';

        await expect(row.Save()).resolves.toBe(true);
        expect(driver.CreateIndex).toHaveBeenCalledWith(expect.objectContaining({ metric: 'euclidean' }));
    });

    it('does not call the provider, and does not fail, for a driver that owns no index objects', async () => {
        // MJ ships a Vector Index row for SimpleVectorServiceProvider, whose CreateIndex correctly
        // answers success:false. Escalating that would break `mj sync push` of MJ's own metadata.
        const driver = makeDriver({ ManagesIndexes: false, CreateIndex: vi.fn() });
        withDriver(driver);
        const row = newRow();

        await expect(row.Save()).resolves.toBe(true);
        expect(driver.CreateIndex).not.toHaveBeenCalled();
        expect(providerConfigOf(row)['provisionState']).toBe('not-applicable');
    });

    it('records, without failing, when no driver could be built in this process', async () => {
        withDriver(null);
        const row = newRow();

        await expect(row.Save()).resolves.toBe(true);
        const cfg = providerConfigOf(row);
        expect(cfg['provisionState']).toBe('unprovisioned');
        expect(row.ExternalID).toBeNull();
    });

    it('reports an index that exists but whose row could not record it', async () => {
        withDriver(makeDriver());
        const row = newRow();
        // The row save succeeds; the provider-metadata write-back that follows it does not.
        superSaveMock.mockReset();
        superSaveMock.mockResolvedValueOnce(true).mockResolvedValue(false);
        row.LatestResult = { CompleteMessage: 'deadlock victim' };

        // Deleting the row here would orphan a real index, so the row stands and the caller is
        // told both halves: the index exists, and this record cannot address it.
        const err = await row.Save().then(() => null, (e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/WAS created/);
        expect(err?.message).toMatch(/cannot address it/);
        expect(err?.message).toContain('deadlock victim');
    });

    it('leaves an update alone — provisioning only happens for a new row', async () => {
        const driver = makeDriver();
        withDriver(driver);
        const row = newRow();
        row.IsSaved = true;

        await expect(row.Save()).resolves.toBe(true);
        expect(driver.CreateIndex).not.toHaveBeenCalled();
    });
});
