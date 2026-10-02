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
                // No accelerator registered — services fall back to the in-process default.
                ClassFactory: { GetRegistration: () => null, CreateInstance: () => null },
            },
        },
    };
});

import type { BaseEntityEvent } from '@memberjunction/core';
import { SimpleVectorIndexCache, SimpleVectorServiceProvider } from '../models/SimpleVectorServiceProvider';

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

    describe('incremental maintenance', () => {
        const ERD = 'MJ: Entity Record Documents';
        type Row = { ID: string; EntityDocumentID: string; RecordID: string; VectorJSON: string | null };

        function localEvent(type: 'save' | 'delete', row: Row): BaseEntityEvent {
            return { type, payload: null, baseEntity: { EntityInfo: { Name: ERD }, ...row } } as unknown as BaseEntityEvent;
        }
        function remoteEvent(payload: Record<string, unknown>): BaseEntityEvent {
            return { type: 'remote-invalidate', payload, baseEntity: null, entityName: ERD } as unknown as BaseEntityEvent;
        }
        const send = (ev: BaseEntityEvent) => SimpleVectorIndexCache.Instance.HandleEntityEvent(ev);
        const query = (vector: number[], topK = 5) =>
            new SimpleVectorServiceProvider().QueryIndex({ id: 'doc-1', vector, topK } as never);
        const recordIds = (result: { data: { matches: Array<{ metadata: { RecordID: string } }> } }) =>
            result.data.matches.map(m => m.metadata.RecordID);

        async function loadDoc1(): Promise<void> {
            runViewMock.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) },
                    { ID: 'erd-2', RecordID: 'B', VectorJSON: JSON.stringify([0, 1, 0]) },
                ],
            });
            await query([1, 0, 0]);
        }

        it('applies a save to the loaded index without reloading it', async () => {
            await loadDoc1();
            send(localEvent('save', { ID: 'erd-3', EntityDocumentID: 'doc-1', RecordID: 'C', VectorJSON: JSON.stringify([0, 0, 1]) }));

            const result = await query([0, 0, 1], 1);
            expect(recordIds(result)).toEqual(['C']);
            expect(runViewMock).toHaveBeenCalledTimes(1);
        });

        it('updates a changed vector in place', async () => {
            await loadDoc1();
            send(localEvent('save', { ID: 'erd-2', EntityDocumentID: 'doc-1', RecordID: 'B', VectorJSON: JSON.stringify([1, 0, 0]) }));
            const result = await query([1, 0, 0], 2);
            expect(result.data.matches.every((m: { score: number }) => m.score === 1)).toBe(true);
        });

        it('removes a row on delete, and on a save that clears its vector', async () => {
            await loadDoc1();
            send(localEvent('delete', { ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: null }));
            send(localEvent('save', { ID: 'erd-2', EntityDocumentID: 'doc-1', RecordID: 'B', VectorJSON: null }));
            const result = await query([1, 0, 0]);
            expect(result.data.matches).toEqual([]);
            expect(runViewMock).toHaveBeenCalledTimes(1);
        });

        it('removes a row from its old index when it moves to another EntityDocument', async () => {
            await loadDoc1();
            send(localEvent('save', { ID: 'erd-1', EntityDocumentID: 'doc-OTHER', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) }));
            expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
        });

        it('reloads the whole index when a saved vector changes dimensions (model change)', async () => {
            await loadDoc1();
            send(localEvent('save', { ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0]) }));
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0]) }] });
            const result = await query([1, 0]);
            expect(runViewMock).toHaveBeenCalledTimes(2);
            expect(recordIds(result)).toEqual(['A']);
        });

        it('ignores events for other entities', async () => {
            await loadDoc1();
            send({ type: 'delete', payload: null, baseEntity: { EntityInfo: { Name: 'MJ: Users' }, ID: 'erd-1' } } as unknown as BaseEntityEvent);
            expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
        });

        it('applies a remote save from its broadcast record data', async () => {
            await loadDoc1();
            send(remoteEvent({
                action: 'save',
                primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: 'erd-3' }]),
                recordData: JSON.stringify({ ID: 'erd-3', EntityDocumentID: 'doc-1', RecordID: 'C', VectorJSON: JSON.stringify([0, 0, 1]) }),
            }));
            expect(recordIds(await query([0, 0, 1], 1))).toEqual(['C']);
            expect(runViewMock).toHaveBeenCalledTimes(1);
        });

        it('applies a remote delete from its primary key', async () => {
            await loadDoc1();
            send(remoteEvent({ action: 'delete', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: 'erd-1' }]) }));
            expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
        });

        it('re-reads only the changed rows for a remote save without record data', async () => {
            await loadDoc1();
            vi.useFakeTimers();
            try {
                runViewMock.mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'erd-2', EntityDocumentID: 'doc-1', RecordID: 'B', VectorJSON: JSON.stringify([0, 0, 1]) }],
                });
                send(remoteEvent({ action: 'save', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: 'erd-2' }]) }));
                send(remoteEvent({ action: 'save', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: 'erd-1' }]) }));
                await vi.advanceTimersByTimeAsync(300);
            } finally {
                vi.useRealTimers();
            }

            // One batched re-read for both IDs, bypassing the server cache.
            expect(runViewMock).toHaveBeenCalledTimes(2);
            const params = runViewMock.mock.calls[1][0];
            expect(params.ExtraFilter).toBe(`ID IN ('erd-2','erd-1')`);
            expect(params.BypassCache).toBe(true);
            // erd-2 moved; erd-1 was not returned, so it was deleted after the change.
            expect(recordIds(await query([0, 0, 1]))).toEqual(['B']);
        });

        it('serves the stale index while the TTL refresh runs in the background', async () => {
            await loadDoc1();
            SimpleVectorServiceProvider.TtlMs = 0;
            let release!: (v: unknown) => void;
            runViewMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));

            const during = await query([1, 0, 0], 2);
            expect(recordIds(during)).toEqual(['A', 'B']); // answered from the stale index, not blocked

            release({ Success: true, Results: [{ ID: 'erd-9', RecordID: 'Z', VectorJSON: JSON.stringify([1, 0, 0]) }] });
            await new Promise(r => setTimeout(r, 0));
            SimpleVectorServiceProvider.TtlMs = 15 * 60 * 1000;
            expect(recordIds(await query([1, 0, 0]))).toEqual(['Z']);
        });

        it('replays changes that arrive while a load is in flight', async () => {
            let release!: (v: unknown) => void;
            runViewMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
            const pending = query([0, 0, 1], 1);

            send(localEvent('save', { ID: 'erd-3', EntityDocumentID: 'doc-1', RecordID: 'C', VectorJSON: JSON.stringify([0, 0, 1]) }));
            release({ Success: true, Results: [{ ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) }] });

            expect(recordIds(await pending)).toEqual(['C']);
        });

        it('skips rows whose dimensions differ from the rest at load time', async () => {
            runViewMock.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: JSON.stringify([1, 0, 0]) },
                    { ID: 'erd-2', RecordID: 'B', VectorJSON: JSON.stringify([1, 0]) },
                ],
            });
            const result = await query([1, 0, 0]);
            expect(result.success).toBe(true);
            expect(recordIds(result)).toEqual(['A']);
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

    describe('capability flags', () => {
        it('is read-only (vectors come from EntityRecordDocument.VectorJSON)', () => {
            expect(new SimpleVectorServiceProvider().IsReadOnly).toBe(true);
        });
        it('requires no API key (in-process provider) — so the vector-sync / dupe key guard is skipped', () => {
            expect(new SimpleVectorServiceProvider().RequiresAPIKey).toBe(false);
        });
    });
});
