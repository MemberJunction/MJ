import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @memberjunction/core BEFORE importing the provider.
// The provider uses RunView for loading EntityRecordDocument rows and subscribes
// to BaseEntity events for cache invalidation — both have to be present.
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    // RunView must be `new`-able — declare as a class so `new RunView()` works.
    // `vi.fn().mockImplementation(() => ...)` is not reliably constructable in
    // Vitest 4.x.
    RunView: class { public RunView = runViewMock; },
    UserInfo: class {},
    BaseEntity: class {
        public static get BaseEventCode(): string { return 'BaseEntityEvent'; }
    },
    BaseEntityEvent: class {},
}));

// VectorDBBase enforces non-empty apiKey but the provider passes a placeholder.
// Also stub the event-listener wiring so the singleton's subscription doesn't
// blow up under the lightweight test environment.
vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJEventType: { ComponentEvent: 'ComponentEvent' },
        MJGlobal: {
            Instance: {
                GetEventListener: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
            },
        },
    };
});

import { SimpleVectorServiceProvider } from '../models/SimpleVectorServiceProvider';

describe('SimpleVectorServiceProvider', () => {
    beforeEach(() => {
        runViewMock.mockReset();
        SimpleVectorServiceProvider.InvalidateAll();
        SimpleVectorServiceProvider.TtlMs = 15 * 60 * 1000; // reset to default
    });

    describe('QueryIndex', () => {
        it('returns an empty match list when the EntityDocument has no embedded records', async () => {
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });

            const provider = new SimpleVectorServiceProvider();
            const result = await provider.QueryIndex(
                { id: 'doc-1', vector: [0.1, 0.2, 0.3], topK: 5 } as never
            );

            expect(result.success).toBe(true);
            expect(result.data.matches).toEqual([]);
        });

        it('returns the underlying entity RecordID in match metadata (not the EntityRecordDocument PK)', async () => {
            runViewMock.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'parent-record-A', VectorJSON: JSON.stringify([1, 0, 0]) },
                    { ID: 'erd-2', RecordID: 'parent-record-B', VectorJSON: JSON.stringify([0, 1, 0]) },
                ],
            });

            const provider = new SimpleVectorServiceProvider();
            const result = await provider.QueryIndex(
                { id: 'doc-1', vector: [1, 0, 0], topK: 2 } as never
            );

            expect(result.success).toBe(true);
            expect(result.data.matches.length).toBeGreaterThan(0);
            // Best match should be erd-1 (identical to query)
            expect(result.data.matches[0].metadata.RecordID).toBe('parent-record-A');
        });

        it('rejects calls without an EntityDocumentID', async () => {
            const provider = new SimpleVectorServiceProvider();
            const result = await provider.QueryIndex({ id: '', vector: [1, 0, 0], topK: 5 } as never);
            expect(result.success).toBe(false);
            expect(result.message).toMatch(/EntityDocumentID/);
        });

        it('rejects calls without a query vector', async () => {
            const provider = new SimpleVectorServiceProvider();
            const result = await provider.QueryIndex({ id: 'doc-1', topK: 5 } as never);
            expect(result.success).toBe(false);
            expect(result.message).toMatch(/vector/);
        });

        it('returns failure if RunView fails', async () => {
            runViewMock.mockResolvedValueOnce({ Success: false, ErrorMessage: 'db boom' });

            const provider = new SimpleVectorServiceProvider();
            const result = await provider.QueryIndex(
                { id: 'doc-1', vector: [1, 0, 0], topK: 5 } as never
            );
            expect(result.success).toBe(false);
        });

        it('silently skips rows with unparseable VectorJSON', async () => {
            runViewMock.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: '{not json' },
                    { ID: 'erd-2', RecordID: 'B', VectorJSON: JSON.stringify([1, 0, 0]) },
                ],
            });

            const provider = new SimpleVectorServiceProvider();
            const result = await provider.QueryIndex(
                { id: 'doc-1', vector: [1, 0, 0], topK: 5 } as never
            );

            expect(result.success).toBe(true);
            // Only the parseable row is returned
            expect(result.data.matches.length).toBe(1);
            expect(result.data.matches[0].metadata.RecordID).toBe('B');
        });
    });

    describe('caching', () => {
        it('reuses a loaded index across calls within the TTL window', async () => {
            runViewMock.mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) },
                ],
            });

            const provider = new SimpleVectorServiceProvider();
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);

            // RunView only called once — second and third hits the cache
            expect(runViewMock).toHaveBeenCalledTimes(1);
        });

        it('reloads after the cache TTL expires', async () => {
            runViewMock.mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) },
                ],
            });

            const provider = new SimpleVectorServiceProvider();
            SimpleVectorServiceProvider.TtlMs = 0; // immediate expiry

            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);

            expect(runViewMock).toHaveBeenCalledTimes(2);
        });

        it('InvalidateIndex forces a reload on next query', async () => {
            runViewMock.mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) },
                ],
            });

            const provider = new SimpleVectorServiceProvider();
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            expect(runViewMock).toHaveBeenCalledTimes(1);

            SimpleVectorServiceProvider.InvalidateIndex('doc-1');
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            expect(runViewMock).toHaveBeenCalledTimes(2);
        });

        it('dedupes concurrent cold loads — one DB read for many parallel callers', async () => {
            // Mock a slow RunView so we can reliably overlap parallel calls.
            let resolveRunView!: (v: unknown) => void;
            runViewMock.mockImplementation(() => new Promise(resolve => {
                resolveRunView = resolve;
            }));

            const provider = new SimpleVectorServiceProvider();
            // Fire three callers concurrently before any of them complete.
            const a = provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            const b = provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            const c = provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);

            // Release the in-flight RunView with a single payload.
            resolveRunView({
                Success: true,
                Results: [{ ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) }],
            });

            const [ra, rb, rc] = await Promise.all([a, b, c]);

            // Only ONE underlying RunView call, despite three concurrent callers.
            expect(runViewMock).toHaveBeenCalledTimes(1);
            expect(ra.success).toBe(true);
            expect(rb.success).toBe(true);
            expect(rc.success).toBe(true);
        });

        it('InvalidateAll drops every cached index', async () => {
            runViewMock.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) }],
            });

            const provider = new SimpleVectorServiceProvider();
            await provider.QueryIndex({ id: 'doc-1', vector: [1, 0, 0], topK: 1 } as never);
            await provider.QueryIndex({ id: 'doc-2', vector: [1, 0, 0], topK: 1 } as never);
            expect(SimpleVectorServiceProvider.CacheSize).toBe(2);

            SimpleVectorServiceProvider.InvalidateAll();
            expect(SimpleVectorServiceProvider.CacheSize).toBe(0);
        });
    });

    describe('ingestion is unsupported', () => {
        it('CreateRecord throws via the unsupported path', () => {
            const provider = new SimpleVectorServiceProvider();
            const result = provider.CreateRecord({ id: 'x', values: [1, 2] }) as { success: boolean; message: string };
            expect(result.success).toBe(false);
            expect(result.message).toMatch(/does not support/);
        });

        it('DeleteAllRecords clears the cache without erroring', () => {
            const provider = new SimpleVectorServiceProvider();
            const result = provider.DeleteAllRecords('whatever') as { success: boolean };
            expect(result.success).toBe(true);
        });
    });
});
