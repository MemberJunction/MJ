import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Captures every listener subscribed to the MJGlobal event bus, so tests can
// drive the cache's real subscription callback. Setting `failNextSubscription`
// makes the next GetEventListener() call throw it.
const eventBus = vi.hoisted(() => ({
    listeners: [] as Array<(event: MJEvent) => void>,
    failNextSubscription: null as Error | string | null,
}));

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
                GetEventListener: () => {
                    const failure = eventBus.failNextSubscription;
                    if (failure !== null) {
                        eventBus.failNextSubscription = null;
                        throw failure;
                    }
                    return {
                        subscribe: (listener: (event: MJEvent) => void) => {
                            eventBus.listeners.push(listener);
                            return { unsubscribe: () => undefined };
                        },
                    };
                },
                // No accelerator registered — services fall back to the in-process default.
                ClassFactory: { GetRegistration: () => null, CreateInstance: () => null },
            },
        },
    };
});

import { LogError, UserInfo } from '@memberjunction/core';
import type { BaseEntityEvent, RemoteInvalidatePayload, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJEvent } from '@memberjunction/global';
import { Float32VectorToBase64 } from '@memberjunction/global';
import type { BaseResponse, QueryOptions } from '@memberjunction/ai-vectordb';
import {
    LoadSimpleVectorServiceProvider, SimpleVectorIndexCache, SimpleVectorServiceProvider,
} from '../models/SimpleVectorServiceProvider';

// ── Typed fixtures shared by the coverage suites below ──────────────────────

const ERD_ENTITY = 'MJ: Entity Record Documents';
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const REMOTE_REFRESH_DEBOUNCE_MS = 250;

/** The columns the cache re-reads for a changed row. */
type ReReadRow = { ID: string; EntityDocumentID: string; RecordID: string; VectorJSON: string | null; VectorBinary?: string | null };
/** The columns the provider loads an index from. */
type LoadRow = Omit<ReReadRow, 'EntityDocumentID'>;
/** One match as QueryIndex returns it. */
type Match = { id: string; score: number; metadata: { RecordID: string | null } };
/** What an untyped caller (GraphQL, plain JS) can send — fields QueryOptions requires may be absent. */
type LooseQuery = { id?: string; vector?: number[]; topK?: number };

const vec = (...values: number[]): string => JSON.stringify(values);
const pk = (value: string | number): string => JSON.stringify([{ FieldName: 'ID', Value: value }]);
const matchesOf = (result: BaseResponse): Match[] => result.data.matches;
const idsOf = (result: BaseResponse): string[] => matchesOf(result).map(m => m.id);
const recordIdsOf = (result: BaseResponse): Array<string | null> => matchesOf(result).map(m => m.metadata.RecordID);

function viewResult<T>(rows: T[]): RunViewResult<T> {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
}
function viewFailure(message: string): RunViewResult<ReReadRow> {
    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: message };
}
/** A successful RunView whose provider omitted the Results array. */
function viewResultWithoutRows(): Omit<RunViewResult<ReReadRow>, 'Results'> {
    return { Success: true, RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
}

/** Lets a just-started load reach its loader, which runs one microtask after the load registers. */
async function loaderStarted(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Holds the next RunView call open until the returned function releases it. */
function deferRunView<T>(): (result: RunViewResult<T>) => void {
    let release: ((result: RunViewResult<T>) => void) | undefined;
    runViewMock.mockImplementationOnce(() => new Promise<RunViewResult<T>>(resolve => { release = resolve; }));
    return result => {
        if (!release) throw new Error('the deferred RunView was never called');
        release(result);
    };
}

/** The params and context user of the Nth RunView call. */
function runViewCall(index: number): { Params: RunViewParams; User: UserInfo | undefined } {
    const [params, user] = runViewMock.mock.calls[index] as [RunViewParams, UserInfo | undefined];
    return { Params: params, User: user };
}

function remotePayload(fields: Pick<RemoteInvalidatePayload, 'action'> & Partial<RemoteInvalidatePayload>): RemoteInvalidatePayload {
    return { primaryKeyValues: null, sourceServerId: 'server-B', timestamp: '2026-10-02T00:00:00.000Z', ...fields };
}
function remoteInvalidate(payload: RemoteInvalidatePayload | undefined): BaseEntityEvent {
    return { type: 'remote-invalidate', payload, baseEntity: null, entityName: ERD_ENTITY };
}
/** An event that names its entity but carries no BaseEntity instance. */
function recordlessEvent(type: BaseEntityEvent['type'], entityName: string = ERD_ENTITY): BaseEntityEvent {
    return { type, payload: null, baseEntity: null, entityName };
}

function queryDoc(entityDocumentId: string, vector: number[], topK = 5, user?: UserInfo): Promise<BaseResponse> {
    const params: QueryOptions = { id: entityDocumentId, vector, topK };
    return new SimpleVectorServiceProvider().QueryIndex(params, user);
}
function looseQuery(params: LooseQuery): Promise<BaseResponse> {
    return new SimpleVectorServiceProvider().QueryIndex(params as QueryOptions);
}
async function loadDoc(entityDocumentId: string, rows: LoadRow[], user?: UserInfo): Promise<void> {
    runViewMock.mockResolvedValueOnce(viewResult(rows));
    await queryDoc(entityDocumentId, [1, 0, 0], 1, user);
}

/** Lets queued promise continuations (and zero-delay timers) run, under real or fake timers. */
async function flush(): Promise<void> {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
    else await new Promise<void>(resolve => setTimeout(resolve, 0));
}

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
            await loaderStarted();

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

        /**
         * A local save/delete of one EntityRecordDocument. BaseEntity is abstract and its
         * constructor needs a real EntityInfo, so the record — the columns the cache reads,
         * plus EntityInfo.Name — is a plain object standing in for the entity instance.
         */
        function localEvent(type: 'save' | 'delete', row: Row): BaseEntityEvent {
            return { type, payload: null, baseEntity: { EntityInfo: { Name: ERD }, ...row } } as unknown as BaseEntityEvent;
        }
        function remoteEvent(fields: Pick<RemoteInvalidatePayload, 'action'> & Partial<RemoteInvalidatePayload>): BaseEntityEvent {
            return remoteInvalidate(remotePayload(fields));
        }
        const send = (ev: BaseEntityEvent) => SimpleVectorIndexCache.Instance.HandleEntityEvent(ev);
        const query = (vector: number[], topK = 5) =>
            queryDoc('doc-1', vector, topK);
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
            send(recordlessEvent('delete', 'MJ: Users'));
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
            await loaderStarted();
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

        const erd1Deleted = (): BaseEntityEvent =>
            localEvent('delete', { ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: null });
        const reloadedRows: LoadRow[] = [{ ID: 'erd-9', RecordID: 'Z', VectorJSON: vec(1, 0, 0) }];

        beforeEach(() => {
            vi.mocked(LogError).mockClear();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        describe('MJGlobal event-bus subscription', () => {
            const busEvent = (
                args: BaseEntityEvent | null,
                event: MJEvent['event'] = 'ComponentEvent',
                eventCode = 'BaseEntityEvent'
            ): MJEvent => ({ component: {}, event, eventCode, args });
            const emit = (event: MJEvent): void => eventBus.listeners.forEach(listener => listener(event));

            it('applies a BaseEntity event delivered through the event bus', async () => {
                await loadDoc1();
                emit(busEvent(erd1Deleted()));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
            });

            it('ignores bus traffic that is not a BaseEntity component event, or that carries no event', async () => {
                await loadDoc1();
                emit(busEvent(erd1Deleted(), 'ComponentRegistered'));
                emit(busEvent(erd1Deleted(), 'ComponentEvent', 'SomeOtherEventCode'));
                emit(busEvent(null));
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
                expect(runViewMock).toHaveBeenCalledTimes(1);
            });

            it('subscribes only once per cache instance', () => {
                const before = eventBus.listeners.length;
                expect(before).toBeGreaterThan(0); // the singleton subscribed when it was constructed
                SimpleVectorIndexCache.Instance['subscribeToBaseEntityEvents']();
                expect(eventBus.listeners.length).toBe(before);
            });

            it('logs, and relies on the TTL alone, when subscribing throws an Error', () => {
                eventBus.failNextSubscription = new Error('event bus offline');
                // A distinct subclass gets its own BaseSingleton slot, so its constructor really subscribes.
                class ErrorSubscriptionCache extends SimpleVectorIndexCache { public constructor() { super(); } }
                const before = eventBus.listeners.length;

                const cache = new ErrorSubscriptionCache();

                expect(cache.Size).toBe(0);
                expect(eventBus.listeners.length).toBe(before);
                expect(LogError).toHaveBeenCalledWith('SimpleVectorIndexCache: failed to subscribe to BaseEntity events: event bus offline');
            });

            it('logs a non-Error subscription failure as text', () => {
                eventBus.failNextSubscription = 'listener registry unavailable';
                class TextSubscriptionCache extends SimpleVectorIndexCache { public constructor() { super(); } }

                new TextSubscriptionCache();

                expect(LogError).toHaveBeenCalledWith('SimpleVectorIndexCache: failed to subscribe to BaseEntity events: listener registry unavailable');
            });
        });

        describe('event routing', () => {
            it('ignores event types other than save, delete and remote-invalidate', async () => {
                await loadDoc1();
                send(recordlessEvent('load_complete'));
                send(recordlessEvent('save_started'));
                send(recordlessEvent('new_record'));
                await query([1, 0, 0]);
                expect(runViewMock).toHaveBeenCalledTimes(1); // nothing was marked stale
            });

            it('identifies the entity from entityName when no BaseEntity is attached, ignoring other entities', async () => {
                await loadDoc1();
                send(recordlessEvent('save', 'MJ: Users'));
                await query([1, 0, 0]);
                expect(runViewMock).toHaveBeenCalledTimes(1);
            });

            it.each(['save', 'delete'] as const)(
                'keeps serving, but reloads in the background, every index after a %s that carries no record',
                async (type) => {
                    await loadDoc1();
                    send(recordlessEvent(type));
                    runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));

                    expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']); // stale index answers at once
                    await flush();
                    expect(runViewMock).toHaveBeenCalledTimes(2);
                    expect(recordIds(await query([1, 0, 0], 2))).toEqual(['Z']);
                    expect(runViewMock).toHaveBeenCalledTimes(2); // the reloaded index is fresh again
                }
            );
        });

        describe('MarkAllStale', () => {
            it('keeps serving every cached index but reloads each one on its next query', async () => {
                await loadDoc1();
                await loadDoc('doc-2', [{ ID: 'erd-20', RecordID: 'Q', VectorJSON: vec(1, 0, 0) }]);
                SimpleVectorIndexCache.Instance.MarkAllStale();

                runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
                await flush();
                runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));
                expect(recordIdsOf(await queryDoc('doc-2', [1, 0, 0]))).toEqual(['Q']);
                await flush();

                expect(runViewMock).toHaveBeenCalledTimes(4);
                expect(runViewCall(2).Params.ExtraFilter).toContain(`EntityDocumentID='doc-1'`);
                expect(runViewCall(3).Params.ExtraFilter).toContain(`EntityDocumentID='doc-2'`);
                expect(recordIdsOf(await queryDoc('doc-2', [1, 0, 0]))).toEqual(['Z']);
            });

            it('starts one background reload, which later stale queries join rather than repeat', async () => {
                await loadDoc1();
                SimpleVectorIndexCache.Instance.MarkAllStale();
                const release = deferRunView<LoadRow>();

                await query([1, 0, 0]);
                await query([1, 0, 0]);
                await query([1, 0, 0]);
                expect(runViewMock).toHaveBeenCalledTimes(2);

                release(viewResult(reloadedRows));
                await flush();
                expect(recordIds(await query([1, 0, 0]))).toEqual(['Z']);
            });
        });

        describe('row-level change edge cases', () => {
            it('ignores a row change that has no ID', async () => {
                await loadDoc1();
                SimpleVectorIndexCache.Instance.ApplyRowChange({ ID: '', EntityDocumentID: 'doc-1', RecordID: 'Z', VectorJSON: vec(0, 0, 1) });
                const result = await query([0, 0, 1]);
                expect(recordIds(result)).not.toContain('Z');
                expect(recordIds(result)).toHaveLength(2);
            });

            it('drops a row from its index when its EntityDocumentID is cleared', async () => {
                await loadDoc1();
                send(localEvent('save', { ID: 'erd-1', EntityDocumentID: '', RecordID: 'A', VectorJSON: vec(1, 0, 0) }));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
                expect(runViewMock).toHaveBeenCalledTimes(1);
            });

            it('ignores a removal for a row no loaded index holds', async () => {
                await loadDoc1();
                SimpleVectorIndexCache.Instance.ApplyRowRemoval('erd-unknown');
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
            });

            it.each([
                ['a JSON object', '{"x":1}'],
                ['an empty array', '[]'],
                ['an array holding a non-number', '[1,"0",0]'],
                ['a JSON string', '"1,0,0"'],
                ['malformed JSON', '[1,0'],
            ])('treats VectorJSON that is %s as "no vector" and removes the row', async (_label, vectorJSON) => {
                await loadDoc1();
                send(localEvent('save', { ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: vectorJSON }));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
                expect(runViewMock).toHaveBeenCalledTimes(1); // removed in place, not reloaded
            });

            it('removes a row saved without a RecordID', async () => {
                await loadDoc1();
                send(localEvent('save', { ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: '', VectorJSON: vec(1, 0, 0) }));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
            });
        });

        describe('changes that arrive while a load is in flight', () => {
            it('applies a delete that arrives mid-load to the loaded result', async () => {
                const release = deferRunView<LoadRow>();
                const pending = query([1, 0, 0]);

                send(erd1Deleted());
                await loaderStarted();
                release(viewResult([
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                    { ID: 'erd-2', RecordID: 'B', VectorJSON: vec(0, 1, 0) },
                ]));

                expect(recordIds(await pending)).toEqual(['B']);
            });

            it('keeps a mid-load save of a different dimension out of the result and reloads on the next query', async () => {
                const release = deferRunView<LoadRow>();
                const pending = query([1, 0, 0]);

                send(localEvent('save', { ID: 'erd-3', EntityDocumentID: 'doc-1', RecordID: 'C', VectorJSON: vec(1, 0) }));
                await loaderStarted();
                release(viewResult([{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]));
                expect(recordIds(await pending)).toEqual(['A']);

                runViewMock.mockResolvedValueOnce(viewResult([{ ID: 'erd-3', RecordID: 'C', VectorJSON: vec(1, 0) }]));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['A']); // served while the reload runs
                await flush();
                expect(runViewMock).toHaveBeenCalledTimes(2);
                expect(recordIds(await query([1, 0]))).toEqual(['C']);
            });
        });

        describe('load races', () => {
            it('removes a row moved to another EntityDocument from a load of its old document that is still running', async () => {
                const release = deferRunView<LoadRow>();
                const pending = query([1, 0, 0]);
                await loaderStarted();

                send(localEvent('save', { ID: 'erd-1', EntityDocumentID: 'doc-2', RecordID: 'A', VectorJSON: vec(1, 0, 0) }));
                release(viewResult([
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                    { ID: 'erd-2', RecordID: 'B', VectorJSON: vec(0, 1, 0) },
                ]));

                expect(recordIds(await pending)).toEqual(['B']);
            });

            it('recovers from a loader that throws synchronously instead of wedging the EntityDocument', async () => {
                const cache = SimpleVectorIndexCache.Instance;
                await expect(cache.GetOrLoad('doc-sync-throw', undefined, () => {
                    throw new Error('loader blew up');
                })).rejects.toThrow('loader blew up');
                expect(LogError).toHaveBeenCalledWith(expect.stringContaining('load failed for EntityDocumentID="doc-sync-throw": loader blew up'));

                const retry = vi.fn(async () => null);
                await expect(cache.GetOrLoad('doc-sync-throw', undefined, retry)).resolves.toBeNull();
                expect(retry).toHaveBeenCalledTimes(1);
            });

            it('starts a fresh load after InvalidateIndex instead of joining one that may have read too early', async () => {
                await loadDoc1();
                SimpleVectorServiceProvider.TtlMs = 0;
                const releaseEarly = deferRunView<LoadRow>();
                await query([1, 0, 0]); // served stale; the refresh reads the rows...
                await loaderStarted();
                // ...then a raw-SQL write lands, and its author invalidates.
                SimpleVectorServiceProvider.InvalidateIndex('doc-1');
                SimpleVectorServiceProvider.TtlMs = DEFAULT_TTL_MS;
                runViewMock.mockResolvedValueOnce(viewResult<LoadRow>([
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                    { ID: 'erd-3', RecordID: 'C', VectorJSON: vec(0.9, 0.1, 0) },
                ]));

                expect(recordIds(await query([1, 0, 0], 5))).toEqual(['A', 'C']);
                releaseEarly(viewResult([{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]));
                await flush();
                expect(recordIds(await query([1, 0, 0], 5))).toEqual(['A', 'C']); // the early read was not cached
            });

            it('supersedes every load in flight on InvalidateAll', async () => {
                const releaseEarly = deferRunView<LoadRow>();
                const early = query([1, 0, 0]);
                await loaderStarted();
                SimpleVectorServiceProvider.InvalidateAll();
                runViewMock.mockResolvedValueOnce(viewResult<LoadRow>([{ ID: 'erd-2', RecordID: 'B', VectorJSON: vec(1, 0, 0) }]));

                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']); // a fresh load, not the early one
                releaseEarly(viewResult([{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]));
                expect(recordIds(await early)).toEqual(['A']); // the early caller still gets its own answer
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']); // but it was not cached
                expect(runViewMock).toHaveBeenCalledTimes(2);
            });

            it('caches a load that was running during an unidentifiable change as stale, so it refreshes again', async () => {
                const release = deferRunView<LoadRow>();
                const pending = query([1, 0, 0]);
                await loaderStarted();
                send(remoteInvalidate(undefined)); // cannot tell which row changed

                release(viewResult([{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]));
                expect(recordIds(await pending)).toEqual(['A']);
                runViewMock.mockResolvedValueOnce(viewResult<LoadRow>([{ ID: 'erd-9', RecordID: 'Z', VectorJSON: vec(1, 0, 0) }]));

                expect(recordIds(await query([1, 0, 0]))).toEqual(['A']); // served while it refreshes
                await flush();
                expect(recordIds(await query([1, 0, 0]))).toEqual(['Z']);
            });

            it('re-reads remote changes once per loading user and applies each read only to that user\'s indexes', async () => {
                const alice = Object.assign(new UserInfo(), { ID: 'alice' });
                const bob = Object.assign(new UserInfo(), { ID: 'bob' });
                await loadDoc('doc-1', [
                    { ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                    { ID: 'erd-2', RecordID: 'B', VectorJSON: vec(0, 1, 0) },
                ], alice);
                await loadDoc('doc-2', [{ ID: 'erd-7', RecordID: 'G', VectorJSON: vec(0, 0, 1) }], bob);
                vi.useFakeTimers();
                // Row-level security: only alice can read erd-1.
                runViewMock.mockImplementation((_params: RunViewParams, user: UserInfo | undefined) =>
                    Promise.resolve(viewResult<ReReadRow>(user === alice
                        ? [{ ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: vec(0, 1, 0) }]
                        : [])));

                send(remoteInvalidate(remotePayload({ action: 'save', primaryKeyValues: pk('erd-1') })));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                vi.useRealTimers();

                const readers = runViewMock.mock.calls.slice(2).map(call => call[1]);
                expect(readers).toEqual([alice, bob]);
                // Bob could not see erd-1, but that did not remove it from alice's index.
                const doc1 = await queryDoc('doc-1', [0, 1, 0], 5, alice);
                expect(recordIdsOf(doc1)).toEqual(['A', 'B']);
                expect(matchesOf(doc1)[0].score).toBe(1);
            });

            it('replays a user\'s re-read onto that user\'s load still in flight, and only that user\'s', async () => {
                const alice = Object.assign(new UserInfo(), { ID: 'alice' });
                const bob = Object.assign(new UserInfo(), { ID: 'bob' });
                await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }], alice);
                const releaseBob = deferRunView<LoadRow>();
                const bobPending = queryDoc('doc-2', [0, 0, 1], 5, bob);
                await loaderStarted();
                vi.useFakeTimers();
                // Alice can read erd-1 (doc-1); bob can read erd-2 (doc-2); neither sees the other's row.
                runViewMock.mockImplementation((_params: RunViewParams, user: UserInfo | undefined) =>
                    Promise.resolve(viewResult<ReReadRow>(user === alice
                        ? [{ ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: vec(0, 1, 0) }]
                        : [{ ID: 'erd-2', EntityDocumentID: 'doc-2', RecordID: 'E', VectorJSON: vec(0, 0, 1) }])));

                send(remoteInvalidate(remotePayload({ action: 'save', primaryKeyValues: pk('erd-1') })));
                send(remoteInvalidate(remotePayload({ action: 'save', primaryKeyValues: pk('erd-2') })));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                vi.useRealTimers();

                releaseBob(viewResult<LoadRow>([]));
                expect(recordIdsOf(await bobPending)).toEqual(['E']); // bob's own re-read, replayed onto his load
                const doc1 = await queryDoc('doc-1', [0, 1, 0], 5, alice);
                expect(recordIdsOf(doc1)).toEqual(['A']);
                expect(matchesOf(doc1)[0].score).toBe(1); // alice's update applied; bob's view of erd-1 ignored
            });
        });

        describe('TTL safety net (stale-while-revalidate)', () => {
            it('serves the cached index until the TTL elapses, then refreshes it in the background', async () => {
                vi.useFakeTimers();
                SimpleVectorServiceProvider.TtlMs = 60_000;
                await loadDoc1();

                await vi.advanceTimersByTimeAsync(59_999);
                await query([1, 0, 0]);
                expect(runViewMock).toHaveBeenCalledTimes(1);

                await vi.advanceTimersByTimeAsync(1);
                runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']); // not blocked on the refresh
                await flush();
                expect(runViewMock).toHaveBeenCalledTimes(2);

                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['Z']);
                expect(runViewMock).toHaveBeenCalledTimes(2); // the refresh restarted the TTL clock
            });

            it('keeps serving the stale index, logs, and retries when a background refresh throws', async () => {
                await loadDoc1();
                SimpleVectorServiceProvider.TtlMs = 0;
                runViewMock.mockRejectedValueOnce(new Error('connection reset'));

                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
                await flush();
                expect(LogError).toHaveBeenCalledWith('SimpleVectorIndexCache: load failed for EntityDocumentID="doc-1": connection reset');

                runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']); // still the old index; retry started
                await flush();
                expect(runViewMock).toHaveBeenCalledTimes(3);

                SimpleVectorServiceProvider.TtlMs = DEFAULT_TTL_MS;
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['Z']);
            });

            it('keeps the previous index when a background refresh comes back unsuccessful', async () => {
                await loadDoc1();
                SimpleVectorServiceProvider.TtlMs = 0;
                runViewMock.mockResolvedValueOnce(viewFailure('query timeout'));

                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
                await flush();

                SimpleVectorServiceProvider.TtlMs = DEFAULT_TTL_MS;
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
                expect(SimpleVectorServiceProvider.CacheSize).toBe(1);
                expect(LogError).toHaveBeenCalledWith('SimpleVectorServiceProvider.loadIndex: RunView failed for EntityDocumentID="doc-1": query timeout');
            });

            it('rejects the query when a cold load throws, logs non-Error values as text, and lets the next query retry', async () => {
                runViewMock.mockRejectedValueOnce('socket hang up');
                await expect(query([1, 0, 0])).rejects.toBe('socket hang up');
                expect(LogError).toHaveBeenCalledWith('SimpleVectorIndexCache: load failed for EntityDocumentID="doc-1": socket hang up');

                runViewMock.mockResolvedValueOnce(viewResult([{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['A']);
                expect(runViewMock).toHaveBeenCalledTimes(2);
            });
        });

        describe('remote-invalidate handling', () => {
            const keyOnlySave = (id: string): BaseEntityEvent =>
                remoteInvalidate(remotePayload({ action: 'save', primaryKeyValues: pk(id) }));

            it('reads a numeric primary-key value as a string ID', async () => {
                await loadDoc('doc-1', [
                    { ID: '42', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                    { ID: '43', RecordID: 'B', VectorJSON: vec(0, 1, 0) },
                ]);
                send(remoteInvalidate(remotePayload({ action: 'delete', primaryKeyValues: pk(42) })));
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
            });

            it.each<[string, RemoteInvalidatePayload | undefined]>([
                ['an event with no payload', undefined],
                ['a delete without primaryKeyValues', remotePayload({ action: 'delete' })],
                ['a delete with malformed primaryKeyValues', remotePayload({ action: 'delete', primaryKeyValues: '[{"FieldName":' })],
                ['a delete whose primaryKeyValues is not an array', remotePayload({ action: 'delete', primaryKeyValues: JSON.stringify({ FieldName: 'ID', Value: 'erd-1' }) })],
                ['a delete keyed by a field other than ID', remotePayload({ action: 'delete', primaryKeyValues: JSON.stringify([{ FieldName: 'RecordID', Value: 'A' }]) })],
                ['a delete with an empty ID value', remotePayload({ action: 'delete', primaryKeyValues: pk('') })],
                ['a delete whose key list holds null entries', remotePayload({ action: 'delete', primaryKeyValues: '[null]' })],
                ['a save with neither record data nor a key', remotePayload({ action: 'save' })],
                ['a save with unusable record data and no key', remotePayload({ action: 'save', recordData: '{"ID":' })],
            ])('cannot identify the row for %s, so it marks indexes stale instead of guessing', async (_label, payload) => {
                await loadDoc1();
                send(remoteInvalidate(payload));
                runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));

                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']); // nothing removed on a guess
                await flush();
                expect(runViewMock).toHaveBeenCalledTimes(2);
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['Z']);
            });

            it.each([
                ['malformed JSON', '{"ID":'],
                ['JSON null', 'null'],
                ['a partial record without VectorJSON', JSON.stringify({ ID: 'erd-2', EntityDocumentID: 'doc-1', RecordID: 'B' })],
                ['a record with a non-string ID', JSON.stringify({ ID: 2, EntityDocumentID: 'doc-1', RecordID: 'B', VectorJSON: vec(0, 0, 1) })],
                ['a record with a non-string EntityDocumentID', JSON.stringify({ ID: 'erd-2', EntityDocumentID: null, RecordID: 'B', VectorJSON: vec(0, 0, 1) })],
            ])('re-reads the row by key when the broadcast record data is %s', async (_label, recordData) => {
                await loadDoc1();
                vi.useFakeTimers();
                runViewMock.mockResolvedValueOnce(viewResult<ReReadRow>([
                    { ID: 'erd-2', EntityDocumentID: 'doc-1', RecordID: 'B', VectorJSON: vec(0, 0, 1) },
                ]));

                send(remoteInvalidate(remotePayload({ action: 'save', primaryKeyValues: pk('erd-2'), recordData })));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                await flush();

                expect(runViewMock).toHaveBeenCalledTimes(2);
                expect(runViewCall(1).Params.ExtraFilter).toBe(`ID IN ('erd-2')`);
                expect(recordIds(await query([0, 0, 1], 1))).toEqual(['B']);
            });

            it('removes rows whose broadcast record has a null VectorJSON or no RecordID', async () => {
                await loadDoc1();
                send(remoteInvalidate(remotePayload({
                    action: 'save',
                    primaryKeyValues: pk('erd-1'),
                    recordData: JSON.stringify({ ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: null }),
                })));
                send(remoteInvalidate(remotePayload({
                    action: 'save',
                    primaryKeyValues: pk('erd-2'),
                    recordData: JSON.stringify({ ID: 'erd-2', EntityDocumentID: 'doc-1', VectorJSON: vec(0, 1, 0) }),
                })));

                expect((await query([1, 0, 0])).data.matches).toEqual([]);
                expect(runViewMock).toHaveBeenCalledTimes(1); // applied from the broadcast, no re-read
            });

            it('does not touch the database for a key-only remote save when no index is loaded or loading', async () => {
                vi.useFakeTimers();
                send(keyOnlySave('erd-1'));
                await vi.advanceTimersByTimeAsync(10_000);
                expect(runViewMock).not.toHaveBeenCalled();
            });

            it('batches every key-only change from the first 250 ms into one re-read, then opens a new window', async () => {
                await loadDoc1();
                vi.useFakeTimers();
                runViewMock.mockResolvedValue(viewResult<ReReadRow>([]));

                send(keyOnlySave('erd-1'));
                await vi.advanceTimersByTimeAsync(200);
                send(keyOnlySave('erd-2'));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS - 200 - 1);
                expect(runViewMock).toHaveBeenCalledTimes(1); // a later change does not extend the window

                await vi.advanceTimersByTimeAsync(1);
                expect(runViewMock).toHaveBeenCalledTimes(2);
                expect(runViewCall(1).Params.ExtraFilter).toBe(`ID IN ('erd-1','erd-2')`);

                send(keyOnlySave('erd-3'));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                expect(runViewMock).toHaveBeenCalledTimes(3);
                expect(runViewCall(2).Params.ExtraFilter).toBe(`ID IN ('erd-3')`);
            });

            it('re-reads a changed row while its index is still loading, and the load picks the change up', async () => {
                vi.useFakeTimers();
                const release = deferRunView<LoadRow>();
                const pending = query([0, 0, 1], 1);
                runViewMock.mockResolvedValueOnce(viewResult<ReReadRow>([
                    { ID: 'erd-5', EntityDocumentID: 'doc-1', RecordID: 'E', VectorJSON: vec(0, 0, 1) },
                ]));

                send(keyOnlySave('erd-5'));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                expect(runViewMock).toHaveBeenCalledTimes(2);
                expect(runViewCall(1).User).toBeUndefined(); // no loaded index yet to borrow a user from

                release(viewResult([{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]));
                expect(recordIds(await pending)).toEqual(['E']);
            });

            it('re-reads at most 500 rows per query', async () => {
                await loadDoc1();
                vi.useFakeTimers();
                const ids = [...Array.from({ length: 500 }, (_, i) => `erd-x${i}`), 'erd-1'];
                runViewMock.mockResolvedValue(viewResult<ReReadRow>([]));

                ids.forEach(id => send(keyOnlySave(id)));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                await flush();

                expect(runViewMock).toHaveBeenCalledTimes(3);
                expect(runViewCall(1).Params.ExtraFilter).toBe(`ID IN (${ids.slice(0, 500).map(id => `'${id}'`).join(',')})`);
                expect(runViewCall(2).Params.ExtraFilter).toBe(`ID IN ('erd-1')`);
                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']); // erd-1 no longer exists
            });

            it('stops re-reading, logs, and marks indexes stale when a re-read fails', async () => {
                await loadDoc1();
                vi.useFakeTimers();
                runViewMock.mockResolvedValueOnce(viewFailure('deadlock victim'));

                Array.from({ length: 501 }, (_, i) => `erd-x${i}`).forEach(id => send(keyOnlySave(id)));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                await flush();

                expect(runViewMock).toHaveBeenCalledTimes(2); // the second batch never ran
                expect(LogError).toHaveBeenCalledWith(
                    'SimpleVectorIndexCache: re-reading 500 changed EntityRecordDocument row(s) failed: deadlock victim'
                );

                runViewMock.mockResolvedValueOnce(viewResult(reloadedRows));
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['A', 'B']);
                await flush();
                expect(runViewMock).toHaveBeenCalledTimes(3);
                expect(recordIds(await query([1, 0, 0], 2))).toEqual(['Z']);
            });

            it('treats a successful re-read without a Results array as every queued row having been deleted', async () => {
                await loadDoc1();
                vi.useFakeTimers();
                runViewMock.mockResolvedValueOnce(viewResultWithoutRows());

                send(keyOnlySave('erd-1'));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);
                await flush();

                expect(recordIds(await query([1, 0, 0]))).toEqual(['B']);
            });

            it('re-reads changed rows as the user a loaded index was loaded as', async () => {
                const loader = new UserInfo();
                await loadDoc('doc-0', [{ ID: 'erd-0', RecordID: 'O', VectorJSON: vec(1, 0, 0) }]); // no user
                await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }], loader);
                expect(runViewCall(1).User).toBe(loader);

                vi.useFakeTimers();
                runViewMock.mockResolvedValueOnce(viewResult<ReReadRow>([
                    { ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                ]));
                send(keyOnlySave('erd-1'));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);

                expect(runViewCall(2).User).toBe(loader);
                expect(runViewCall(2).Params.BypassCache).toBe(true);
                expect(runViewCall(2).Params.Fields).toEqual(['ID', 'EntityDocumentID', 'RecordID', 'VectorJSON', 'VectorBinary']);
            });

            it('escapes quotes in re-read IDs', async () => {
                await loadDoc1();
                vi.useFakeTimers();
                runViewMock.mockResolvedValueOnce(viewResult<ReReadRow>([]));

                send(keyOnlySave(`erd-'1`));
                await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_DEBOUNCE_MS);

                expect(runViewCall(1).Params.ExtraFilter).toBe(`ID IN ('erd-''1')`);
            });
        });
    });

    describe('binary vector column (VectorBinary)', () => {
        const bin = (...values: number[]): string => Float32VectorToBase64(values);
        type BinRow = { ID: string; EntityDocumentID: string; RecordID: string; VectorJSON: string | null; VectorBinary: string | null };
        function localSave(row: BinRow): BaseEntityEvent {
            return { type: 'save', payload: null, baseEntity: { EntityInfo: { Name: ERD_ENTITY }, ...row } } as unknown as BaseEntityEvent;
        }

        it('loads rows whose vector exists only in VectorBinary', async () => {
            await loadDoc('doc-1', [
                { ID: 'erd-1', RecordID: 'A', VectorJSON: null, VectorBinary: bin(1, 0, 0) },
                { ID: 'erd-2', RecordID: 'B', VectorJSON: null, VectorBinary: bin(0, 1, 0) },
            ]);

            const result = await queryDoc('doc-1', [0, 1, 0], 1);

            expect(recordIdsOf(result)).toEqual(['B']);
            expect(matchesOf(result)[0].score).toBeCloseTo(1, 6);
        });

        it('prefers VectorBinary over a disagreeing VectorJSON', async () => {
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(0, 1, 0), VectorBinary: bin(1, 0, 0) }]);

            const result = await queryDoc('doc-1', [1, 0, 0], 1);

            expect(matchesOf(result)[0].score).toBeCloseTo(1, 6);
        });

        it('falls back to VectorJSON when VectorBinary is invalid or holds a non-finite value', async () => {
            await loadDoc('doc-1', [
                { ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0), VectorBinary: '!!' },
                { ID: 'erd-2', RecordID: 'B', VectorJSON: vec(1, 0, 0), VectorBinary: bin(Infinity, 0, 0) },
            ]);

            const result = await queryDoc('doc-1', [1, 0, 0], 5);

            expect(recordIdsOf(result).sort()).toEqual(['A', 'B']);
        });

        it('applies a local save that carries only VectorBinary without reloading', async () => {
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]);
            SimpleVectorIndexCache.Instance.HandleEntityEvent(
                localSave({ ID: 'erd-2', EntityDocumentID: 'doc-1', RecordID: 'B', VectorJSON: null, VectorBinary: bin(0, 0, 1) }));

            const result = await queryDoc('doc-1', [0, 0, 1], 1);

            expect(recordIdsOf(result)).toEqual(['B']);
            expect(runViewMock).toHaveBeenCalledTimes(1);
        });

        it('removes a row whose save clears both vector columns', async () => {
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: null, VectorBinary: bin(1, 0, 0) }]);
            SimpleVectorIndexCache.Instance.HandleEntityEvent(
                localSave({ ID: 'erd-1', EntityDocumentID: 'doc-1', RecordID: 'A', VectorJSON: null, VectorBinary: null }));

            expect(matchesOf(await queryDoc('doc-1', [1, 0, 0]))).toEqual([]);
        });
    });

    describe('index loading', () => {
        beforeEach(() => {
            vi.mocked(LogError).mockClear();
        });

        it('escapes the EntityDocumentID into the load filter and loads as the calling user', async () => {
            const caller = new UserInfo();
            runViewMock.mockResolvedValueOnce(viewResult<LoadRow>([]));

            await queryDoc(`doc'1`, [1, 0, 0], 1, caller);

            const { Params, User } = runViewCall(0);
            expect(Params.EntityName).toBe(ERD_ENTITY);
            expect(Params.ExtraFilter).toBe(`EntityDocumentID='doc''1' AND (VectorBinary IS NOT NULL OR VectorJSON IS NOT NULL)`);
            expect(Params.Fields).toEqual(['ID', 'RecordID', 'VectorJSON', 'VectorBinary']);
            expect(Params.ResultType).toBe('simple');
            expect(User).toBe(caller);
        });

        it('treats a successful load with no Results array as an empty, cached index', async () => {
            runViewMock.mockResolvedValueOnce(viewResultWithoutRows());

            const result = await queryDoc('doc-1', [1, 0, 0]);

            expect(result).toEqual({ success: true, message: 'No embedded records yet', data: { matches: [] } });
            expect(SimpleVectorServiceProvider.CacheSize).toBe(1);
        });

        it('skips rows without an ID or a RecordID', async () => {
            runViewMock.mockResolvedValueOnce(viewResult<LoadRow>([
                { ID: '', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                { ID: 'erd-2', RecordID: '', VectorJSON: vec(1, 0, 0) },
                { ID: 'erd-3', RecordID: 'C', VectorJSON: vec(1, 0, 0) },
            ]));
            expect(recordIdsOf(await queryDoc('doc-1', [1, 0, 0]))).toEqual(['C']);
        });

        it('logs how many rows it skipped because their dimensions differ from the first vector', async () => {
            runViewMock.mockResolvedValueOnce(viewResult<LoadRow>([
                { ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) },
                { ID: 'erd-2', RecordID: 'B', VectorJSON: vec(1, 0) },
                { ID: 'erd-3', RecordID: 'C', VectorJSON: vec(1, 0, 0, 0) },
            ]));

            await queryDoc('doc-1', [1, 0, 0]);

            expect(LogError).toHaveBeenCalledTimes(1);
            expect(LogError).toHaveBeenCalledWith(expect.stringContaining('skipped 2 EntityRecordDocument row(s) for EntityDocumentID="doc-1"'));
        });

        it('does not log when every row shares one dimension', async () => {
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]);
            expect(LogError).not.toHaveBeenCalled();
        });
    });

    describe('QueryIndex parameters and result shape', () => {
        it('returns the EntityRecordDocument ID as each match id and defaults topK to 10', async () => {
            runViewMock.mockResolvedValueOnce(viewResult<LoadRow>(
                Array.from({ length: 12 }, (_, i) => ({ ID: `erd-${i}`, RecordID: `rec-${i}`, VectorJSON: vec(1, i / 10, 0) }))
            ));

            const result = await looseQuery({ id: 'doc-1', vector: [1, 0, 0] });

            expect(result.success).toBe(true);
            expect(result.message).toBe('Returned 10 match(es)');
            expect(idsOf(result)).toEqual(Array.from({ length: 10 }, (_, i) => `erd-${i}`));
            expect(recordIdsOf(result)).toEqual(Array.from({ length: 10 }, (_, i) => `rec-${i}`));
            expect(matchesOf(result)[0].score).toBeCloseTo(1, 5);
        });

        it('treats a missing id as a missing EntityDocumentID, without touching the database', async () => {
            const result = await looseQuery({ vector: [1, 0, 0], topK: 5 });
            expect(result).toEqual({ success: false, message: 'Missing EntityDocumentID or query vector', data: null });
            expect(runViewMock).not.toHaveBeenCalled();
        });

        it('reports which EntityDocumentID failed to load', async () => {
            runViewMock.mockResolvedValueOnce(viewFailure('db boom'));
            const result = await queryDoc('doc-7', [1, 0, 0]);
            expect(result).toEqual({ success: false, message: 'Failed to load index for EntityDocumentID="doc-7"', data: null });
            expect(SimpleVectorServiceProvider.CacheSize).toBe(0);
        });
    });

    describe('VectorDBBase surface', () => {
        it('keys queries by EntityDocumentID', () => {
            expect(new SimpleVectorServiceProvider().QueryKeyIsEntityDocumentID).toBe(true);
        });

        it('reads and writes the TTL shared with the index cache', () => {
            SimpleVectorServiceProvider.TtlMs = 1234;
            expect(SimpleVectorServiceProvider.TtlMs).toBe(1234);
            expect(SimpleVectorIndexCache.Instance.TtlMs).toBe(1234);
        });

        it.each<[string | undefined, string]>([
            [undefined, 'in-memory-no-auth'],
            ['', 'in-memory-no-auth'],
            ['   ', 'in-memory-no-auth'],
            ['real-key', 'real-key'],
        ])('given API key %j, holds %j (the base class rejects blank keys)', (supplied, expected) => {
            class ApiKeyProbe extends SimpleVectorServiceProvider {
                public get Key(): string { return this.ApiKey; }
            }
            expect(new ApiKeyProbe(supplied).Key).toBe(expected);
        });

        it('lists no indexes', () => {
            expect(new SimpleVectorServiceProvider().ListIndexes()).toEqual({ indexes: [] });
        });

        const unsupported: Array<[string, (provider: SimpleVectorServiceProvider) => BaseResponse]> = [
            ['GetIndex', p => p.GetIndex({ id: 'doc-1' })],
            ['CreateIndex', p => p.CreateIndex({ id: 'doc-1', dimension: 3, metric: 'cosine' })],
            ['DeleteIndex', p => p.DeleteIndex({ id: 'doc-1' })],
            ['EditIndex', p => p.EditIndex({ id: 'doc-1' })],
            ['CreateRecord', p => p.CreateRecord({ id: 'erd-1', values: [1, 0, 0] })],
            ['CreateRecords', p => p.CreateRecords([{ id: 'erd-1', values: [1, 0, 0] }])],
            ['GetRecord', p => p.GetRecord({ id: 'erd-1' })],
            ['GetRecords', p => p.GetRecords({ id: 'erd-1' })],
            ['UpdateRecord', p => p.UpdateRecord({ id: 'erd-1', values: [0, 1, 0] })],
            ['UpdateRecords', p => p.UpdateRecords({ id: 'erd-1', values: [0, 1, 0] })],
            ['DeleteRecord', p => p.DeleteRecord({ id: 'erd-1', values: [1, 0, 0] })],
            ['DeleteRecords', p => p.DeleteRecords([{ id: 'erd-1', values: [1, 0, 0] }])],
        ];
        it.each(unsupported)('refuses %s and leaves the cache untouched', async (name, call) => {
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]);

            const result = call(new SimpleVectorServiceProvider());

            expect(result.success).toBe(false);
            expect(result.data).toBeNull();
            expect(result.message).toContain(`does not support ${name} —`);
            expect(SimpleVectorServiceProvider.CacheSize).toBe(1);
        });

        it('DeleteAllRecords drops every cached index, so the next query reloads', async () => {
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]);
            await loadDoc('doc-2', [{ ID: 'erd-2', RecordID: 'B', VectorJSON: vec(1, 0, 0) }]);

            const result = new SimpleVectorServiceProvider().DeleteAllRecords('ignored');

            expect(result).toEqual({ success: true, message: 'cache cleared', data: null });
            expect(SimpleVectorServiceProvider.CacheSize).toBe(0);
            await loadDoc('doc-1', [{ ID: 'erd-1', RecordID: 'A', VectorJSON: vec(1, 0, 0) }]);
            expect(runViewMock).toHaveBeenCalledTimes(3);
        });

        it('ListVectorIDs returns an empty, final page', async () => {
            await expect(new SimpleVectorServiceProvider().ListVectorIDs({ IndexName: 'doc-1' }))
                .resolves.toEqual({ IDs: [], NextCursor: undefined });
        });

        it('LoadSimpleVectorServiceProvider is a callable no-op anchor for tree-shaking', () => {
            expect(LoadSimpleVectorServiceProvider()).toBeUndefined();
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
