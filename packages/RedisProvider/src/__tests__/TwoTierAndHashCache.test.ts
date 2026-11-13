import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
    RedisLocalStorageProvider,
    TwoTierCacheStorageProvider,
    TwoTierCacheConfig,
    ExtendedWriteOptions,
} from '../index.js';
import type { CacheChangedEvent, CacheRowDeltaPayload, CachedRunViewData } from '@memberjunction/core';

// In-memory mock storage shared across clients
interface StreamEntry {
    id: string;
    fields: string[];
}

interface MockRedisState {
    store: Map<string, string>;
    hashes: Map<string, Map<string, string>>;
    sets: Map<string, Set<string>>;
    ttls: Map<string, number>;
    streams: Map<string, StreamEntry[]>;
    pubsub: EventEmitter;
}

let mockState: MockRedisState;

function createFreshMockState(): MockRedisState {
    return {
        store: new Map(),
        hashes: new Map(),
        sets: new Map(),
        ttls: new Map(),
        streams: new Map(),
        pubsub: new EventEmitter(),
    };
}

// Mock ioredis constructor
vi.mock('ioredis', () => {
    return {
        default: class MockRedisClient {
            public on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
                if (event === 'connect' || event === 'ready') {
                    Promise.resolve().then(() => handler());
                }
                return this;
            });
            public once = vi.fn().mockReturnThis();
            public off = vi.fn().mockReturnThis();
            public removeAllListeners = vi.fn().mockReturnThis();

            public get = vi.fn((key: string) => {
                return Promise.resolve(mockState.store.get(key) ?? null);
            });

            public set = vi.fn((key: string, value: string, ...args: (string | number)[]) => {
                const nxIndex = args.indexOf('NX');
                if (nxIndex >= 0 && mockState.store.has(key)) {
                    return Promise.resolve(null);
                }
                const pxIndex = args.indexOf('PX');
                if (pxIndex >= 0) {
                    const ttlMs = Number(args[pxIndex + 1]);
                    mockState.ttls.set(key, Math.ceil(ttlMs / 1000));
                }
                mockState.store.set(key, value);
                return Promise.resolve('OK');
            });

            public setex = vi.fn((key: string, ttl: number, value: string) => {
                mockState.store.set(key, value);
                mockState.ttls.set(key, ttl);
                return Promise.resolve('OK');
            });

            public del = vi.fn((...keys: string[]) => {
                let count = 0;
                for (const k of keys) {
                    if (mockState.store.delete(k)) count++;
                    if (mockState.hashes.delete(k)) count++;
                    if (mockState.sets.delete(k)) count++;
                    if (mockState.streams.delete(k)) count++;
                }
                return Promise.resolve(count);
            });

            public mget = vi.fn((...keys: string[]) => {
                return Promise.resolve(keys.map(k => mockState.store.get(k) ?? null));
            });

            public exists = vi.fn((key: string) => {
                const has = mockState.store.has(key) || mockState.hashes.has(key) || mockState.sets.has(key);
                return Promise.resolve(has ? 1 : 0);
            });

            public ttl = vi.fn((key: string) => {
                return Promise.resolve(mockState.ttls.get(key) ?? -1);
            });

            public ping = vi.fn(() => Promise.resolve('PONG'));
            public quit = vi.fn(() => Promise.resolve('OK'));
            public disconnect = vi.fn();

            public incr = vi.fn((key: string) => {
                const current = parseInt(mockState.store.get(key) ?? '0', 10);
                const next = current + 1;
                mockState.store.set(key, String(next));
                return Promise.resolve(next);
            });

            public hset = vi.fn((key: string, ...args: (string | number)[]) => {
                let hash = mockState.hashes.get(key);
                if (!hash) {
                    hash = new Map();
                    mockState.hashes.set(key, hash);
                }
                for (let i = 0; i < args.length; i += 2) {
                    const f = String(args[i]);
                    const v = String(args[i + 1]);
                    hash.set(f, v);
                }
                return Promise.resolve(args.length / 2);
            });

            public hget = vi.fn((key: string, field: string) => {
                const hash = mockState.hashes.get(key);
                return Promise.resolve(hash?.get(field) ?? null);
            });

            public hgetall = vi.fn((key: string) => {
                const hash = mockState.hashes.get(key);
                if (!hash) return Promise.resolve({});
                const obj: Record<string, string> = {};
                for (const [k, v] of hash.entries()) {
                    obj[k] = v;
                }
                return Promise.resolve(obj);
            });

            public hdel = vi.fn((key: string, ...fields: string[]) => {
                const hash = mockState.hashes.get(key);
                if (!hash) return Promise.resolve(0);
                let removed = 0;
                for (const f of fields) {
                    if (hash.delete(f)) removed++;
                }
                return Promise.resolve(removed);
            });

            public hexists = vi.fn((key: string, field: string) => {
                const hash = mockState.hashes.get(key);
                return Promise.resolve(hash && hash.has(field) ? 1 : 0);
            });

            public xadd = vi.fn((key: string, ...args: (string | number)[]) => {
                let stream = mockState.streams.get(key);
                if (!stream) {
                    stream = [];
                    mockState.streams.set(key, stream);
                }
                let id = '*';
                let startIdx = 0;
                if (args[0] === 'MAXLEN') {
                    startIdx = 3;
                    id = String(args[startIdx]);
                    startIdx++;
                }
                const fieldPairs: string[] = [];
                for (let i = startIdx; i < args.length; i++) {
                    fieldPairs.push(String(args[i]));
                }
                const actualId = id === '*' ? `${Date.now()}-0` : id;
                stream.push({ id: actualId, fields: fieldPairs });
                return Promise.resolve(actualId);
            });

            public xrange = vi.fn((key: string, start: string, _end: string, _countFlag?: string, countVal?: number) => {
                const stream = mockState.streams.get(key);
                if (!stream) return Promise.resolve([]);
                const startSeq = parseInt(start.split('-')[0], 10);
                const matched: Array<[string, string[]]> = [];
                for (const entry of stream) {
                    const entrySeq = parseInt(entry.id.split('-')[0], 10);
                    if (entrySeq >= startSeq) {
                        matched.push([entry.id, entry.fields]);
                        if (countVal && matched.length >= countVal) break;
                    }
                }
                return Promise.resolve(matched);
            });

            public xrevrange = vi.fn((key: string, _end: string, _start: string, _countFlag?: string, countVal?: number) => {
                const stream = mockState.streams.get(key);
                if (!stream || stream.length === 0) return Promise.resolve([]);
                const reversed = [...stream].reverse();
                const matched: Array<[string, string[]]> = [];
                for (const entry of reversed) {
                    matched.push([entry.id, entry.fields]);
                    if (countVal && matched.length >= countVal) break;
                }
                return Promise.resolve(matched);
            });

            public eval = vi.fn((script: string, numKeys: number, ...args: (string | number)[]) => {
                // 1. EnsureClusterEpochId
                if (script.includes("ARGV[1]") && script.includes("return v")) {
                    const key = String(args[0]);
                    const newUuid = String(args[1]);
                    const existing = mockState.store.get(key);
                    if (existing) return Promise.resolve(existing);
                    mockState.store.set(key, newUuid);
                    return Promise.resolve(newUuid);
                }

                // 2. AppendSequencedStreamEntry
                if (script.includes("INCR") && script.includes("XADD")) {
                    const seqKey = String(args[0]);
                    const streamKey = String(args[1]);
                    const payloadJson = String(args[3]);
                    const current = parseInt(mockState.store.get(seqKey) ?? '0', 10);
                    const next = current + 1;
                    mockState.store.set(seqKey, String(next));
                    let stream = mockState.streams.get(streamKey);
                    if (!stream) {
                        stream = [];
                        mockState.streams.set(streamKey, stream);
                    }
                    const entryId = `${next}-0`;
                    stream.push({ id: entryId, fields: ['seq', String(next), 'payload', payloadJson] });
                    return Promise.resolve(next);
                }

                // 3. GetRunViewSlot (inspect string vs hash)
                if (script.includes("GET_RUNVIEW_SLOT_SCRIPT") || (script.includes("HGETALL") && script.includes("TYPE"))) {
                    const key = String(args[0]);
                    if (mockState.hashes.has(key)) {
                        const hash = mockState.hashes.get(key)!;
                        const arr: string[] = [];
                        for (const [f, v] of hash.entries()) {
                            arr.push(f, v);
                        }
                        return Promise.resolve(['h', arr]);
                    }
                    if (mockState.store.has(key)) {
                        return Promise.resolve(['s', mockState.store.get(key)!]);
                    }
                    return Promise.resolve(null);
                }

                // 4. ApplyRunViewRowDelta
                if (script.includes("HEXISTS") && script.includes("delKeys")) {
                    const key = String(args[0]);
                    const payload = JSON.parse(String(args[1])) as {
                        delKeys: string[];
                        upserts: Array<{ k: string; v: string }>;
                        metaUpdates: Record<string, unknown>;
                    };
                    const hash = mockState.hashes.get(key);
                    if (!hash || !hash.has('__meta__')) {
                        return Promise.resolve(0);
                    }
                    const meta = JSON.parse(hash.get('__meta__')!) as {
                        rowOrder: string[];
                        maxUpdatedAt?: string;
                        lastVerifiedAt?: number;
                        totalRowCount?: number;
                        schemaHash?: string;
                    };

                    if (payload.metaUpdates) {
                        if (payload.metaUpdates.maxUpdatedAt) meta.maxUpdatedAt = payload.metaUpdates.maxUpdatedAt as string;
                        if (payload.metaUpdates.lastVerifiedAt) meta.lastVerifiedAt = payload.metaUpdates.lastVerifiedAt as number;
                        if (payload.metaUpdates.totalRowCount) meta.totalRowCount = payload.metaUpdates.totalRowCount as number;
                        if (payload.metaUpdates.schemaHash) meta.schemaHash = payload.metaUpdates.schemaHash as string;
                    }

                    if (!meta.rowOrder) meta.rowOrder = [];

                    // Apply deletes
                    for (const delK of payload.delKeys) {
                        hash.delete(delK);
                        meta.rowOrder = meta.rowOrder.filter(k => k !== delK);
                    }

                    // Apply upserts
                    for (const item of payload.upserts) {
                        if (!hash.has(item.k)) {
                            meta.rowOrder.push(item.k);
                        }
                        hash.set(item.k, item.v);
                    }

                    hash.set('__meta__', JSON.stringify(meta));
                    return Promise.resolve(1);
                }

                // Index-group prune script or add to group
                if (script.includes("SMEMBERS")) {
                    return Promise.resolve([]);
                }
                if (script.includes("SADD")) {
                    return Promise.resolve(1);
                }

                return Promise.resolve(0);
            });

            public pipeline = vi.fn(() => {
                const ops: Array<() => unknown> = [];
                const pipe = {
                    set: vi.fn((key: string, value: string) => {
                        ops.push(() => { mockState.store.set(key, value); });
                        return pipe;
                    }),
                    setex: vi.fn((key: string, ttl: number, value: string) => {
                        ops.push(() => {
                            mockState.store.set(key, value);
                            mockState.ttls.set(key, ttl);
                        });
                        return pipe;
                    }),
                    del: vi.fn((key: string) => {
                        ops.push(() => {
                            mockState.store.delete(key);
                            mockState.hashes.delete(key);
                        });
                        return pipe;
                    }),
                    hset: vi.fn((key: string, ...args: (string | number)[]) => {
                        ops.push(() => {
                            let hash = mockState.hashes.get(key);
                            if (!hash) {
                                hash = new Map();
                                mockState.hashes.set(key, hash);
                            }
                            for (let i = 0; i < args.length; i += 2) {
                                hash.set(String(args[i]), String(args[i + 1]));
                            }
                        });
                        return pipe;
                    }),
                    expire: vi.fn((key: string, ttl: number) => {
                        ops.push(() => { mockState.ttls.set(key, ttl); });
                        return pipe;
                    }),
                    eval: vi.fn(() => {
                        ops.push(() => 1);
                        return pipe;
                    }),
                    exec: vi.fn(() => {
                        for (const op of ops) op();
                        return Promise.resolve(ops.map(() => [null, 'OK']));
                    }),
                };
                return pipe;
            });

            public publish = vi.fn((channel: string, message: string) => {
                mockState.pubsub.emit(channel, message);
                return Promise.resolve(1);
            });

            public subscribe = vi.fn((channel: string) => {
                mockState.pubsub.on(channel, (msg: string) => {
                    this.on.mock.calls
                        .filter(call => call[0] === 'message')
                        .forEach(call => {
                            (call[1] as (c: string, m: string) => void)(channel, msg);
                        });
                });
                return Promise.resolve('OK');
            });

            public scan = vi.fn(() => Promise.resolve(['0', []]));
        },
    };
});

describe('TwoTierAndHashCache (Wave 4.4)', () => {
    beforeEach(() => {
        mockState = createFreshMockState();
    });

    describe('RedisLocalStorageProvider (HASH storage for RunViewCache)', () => {
        it('writes RunView slots as Redis HASH preserving rowOrder when useHashForRunViewSlots is true', async () => {
            const provider = new RedisLocalStorageProvider({
                keyPrefix: 'test',
                useHashForRunViewSlots: true,
            });

            const rows = [
                { ID: '11111111-1111-1111-1111-111111111111', Name: 'Alpha', Age: 25 },
                { ID: '22222222-2222-2222-2222-222222222222', Name: 'Beta', Age: 30 },
                { ID: '33333333-3333-3333-3333-333333333333', Name: 'Gamma', Age: 35 },
            ];

            const envelope: CachedRunViewData = {
                results: rows,
                maxUpdatedAt: '2026-11-10T12:00:00Z',
                totalRowCount: 3,
                schemaHash: 'hash-abc',
            };

            await provider.SetItem('users-view', envelope, 'RunViewCache');

            // Verify written as Redis HASH
            const fullKey = 'test:RunViewCache:users-view';
            const hash = mockState.hashes.get(fullKey);
            expect(hash).toBeDefined();
            expect(hash!.has('__meta__')).toBe(true);

            const meta = JSON.parse(hash!.get('__meta__')!) as {
                v: number;
                primaryKeyFields: string[];
                rowOrder: string[];
                schemaHash: string;
            };
            expect(meta.v).toBe(1);
            expect(meta.primaryKeyFields).toEqual(['ID']);
            expect(meta.rowOrder).toEqual([
                'r:11111111-1111-1111-1111-111111111111',
                'r:22222222-2222-2222-2222-222222222222',
                'r:33333333-3333-3333-3333-333333333333',
            ]);

            // Reconstruct via GetItem in exact order
            const fetched = await provider.GetItem<CachedRunViewData>('users-view', 'RunViewCache');
            expect(fetched).not.toBeNull();
            expect(fetched!.results).toEqual(rows);
            expect(fetched!.totalRowCount).toBe(3);
            expect(fetched!.schemaHash).toBe('hash-abc');
        });

        it('supports composite primary keys and UUID case normalization in HASH fields', async () => {
            const provider = new RedisLocalStorageProvider({
                keyPrefix: 'test',
                useHashForRunViewSlots: true,
            });

            const rows = [
                { OrgID: 10, UserID: 'A0B1C2D3-E4F5-0123-4567-89ABCDEF0123', Role: 'Admin' },
                { OrgID: 10, UserID: 'B0C1D2E3-F4A5-0123-4567-89ABCDEF0124', Role: 'Member' },
            ];

            const writeOpts: ExtendedWriteOptions = {
                PrimaryKeyFields: ['OrgID', 'UserID'],
            };

            const envelope: CachedRunViewData = {
                results: rows,
                maxUpdatedAt: '2026-11-10T12:00:00Z',
                totalRowCount: 2,
            };

            await provider.SetItem('org-users', envelope, 'RunViewCache', writeOpts);

            const fullKey = 'test:RunViewCache:org-users';
            const hash = mockState.hashes.get(fullKey);
            expect(hash).toBeDefined();

            // Normalized lowercase UUID in composite row key
            const expectedKey = 'r:10\u001fa0b1c2d3-e4f5-0123-4567-89abcdef0123';
            expect(hash!.has(expectedKey)).toBe(true);

            // Apply delta with lowercase UUID to delete
            const delta: CacheRowDeltaPayload = {
                deletedPrimaryKeys: [{ OrgID: 10, UserID: 'a0b1c2d3-e4f5-0123-4567-89abcdef0123' }],
                upsertedRows: [],
                primaryKeyFields: ['OrgID', 'UserID'],
                maxUpdatedAt: '2026-11-10T12:05:00Z',
                rowCount: 1,
                totalRowCount: 1,
            };

            const applied = await provider.ApplyRunViewRowDelta('org-users', JSON.stringify(delta), envelope, writeOpts);
            expect(applied).toBe(true);

            // Deleted key is removed from hash
            expect(hash!.has(expectedKey)).toBe(false);

            const fetched = await provider.GetItem<CachedRunViewData>('org-users', 'RunViewCache');
            expect(fetched!.results.length).toBe(1);
            expect((fetched!.results[0] as Record<string, unknown>).Role).toBe('Member');
        });

        it('falls back to string storage when primary key fields cannot be determined or rows lack PK', async () => {
            const provider = new RedisLocalStorageProvider({
                keyPrefix: 'test',
                useHashForRunViewSlots: true,
            });

            // Aggregate-only rows with no ID or PrimaryKeyFields
            const aggEnvelope = {
                results: [{ Count: 42, TotalRevenue: 100000 }],
                maxUpdatedAt: '2026-11-10T12:00:00Z',
            };

            await provider.SetItem('aggs', aggEnvelope, 'RunViewCache');

            const fullKey = 'test:RunViewCache:aggs';
            // Stored in string store, not hash
            expect(mockState.hashes.has(fullKey)).toBe(false);
            expect(mockState.store.has(fullKey)).toBe(true);

            const fetched = await provider.GetItem<{ results: Array<{ Count: number }> }>('aggs', 'RunViewCache');
            expect(fetched).not.toBeNull();
            expect(fetched!.results[0].Count).toBe(42);
        });

        it('ApplyRunViewRowDelta returns false when slot is missing or stored as string', async () => {
            const provider = new RedisLocalStorageProvider({
                keyPrefix: 'test',
                useHashForRunViewSlots: true,
            });

            const delta: CacheRowDeltaPayload = {
                deletedPrimaryKeys: [],
                upsertedRows: [{ ID: '1', Name: 'New' }],
                primaryKeyFields: ['ID'],
                maxUpdatedAt: '2026-11-10T12:00:00Z',
                rowCount: 1,
                totalRowCount: 1,
            };

            // Slot doesn't exist yet in Redis
            const result = await provider.ApplyRunViewRowDelta('missing-slot', JSON.stringify(delta), {});
            expect(result).toBe(false);
        });
    });

    describe('RedisLocalStorageProvider Stream Helpers', () => {
        it('EnsureClusterEpochId creates and persists a cluster-wide epoch UUID', async () => {
            const provider = new RedisLocalStorageProvider({ keyPrefix: 'mj' });

            const epoch1 = await provider.EnsureClusterEpochId();
            expect(typeof epoch1).toBe('string');
            expect(epoch1.length).toBeGreaterThan(0);

            // Repeated call returns the exact same persistent UUID
            const epoch2 = await provider.EnsureClusterEpochId();
            expect(epoch2).toBe(epoch1);
            expect(provider.KeyPrefix).toBe('mj');
            expect(provider.RawClient).toBeDefined();
        });

        it('AppendSequencedStreamEntry and ReadSequencedStreamSince sequence events monotonically', async () => {
            const provider = new RedisLocalStorageProvider({ keyPrefix: 'test' });

            const seq1 = await provider.AppendSequencedStreamEntry('stream_seq', 'stream_events', 1000, JSON.stringify({ event: 'first' }));
            const seq2 = await provider.AppendSequencedStreamEntry('stream_seq', 'stream_events', 1000, JSON.stringify({ event: 'second' }));
            const seq3 = await provider.AppendSequencedStreamEntry('stream_seq', 'stream_events', 1000, JSON.stringify({ event: 'third' }));

            expect(seq1).toBe(1);
            expect(seq2).toBe(2);
            expect(seq3).toBe(3);

            // Read since seq 0
            const readAll = await provider.ReadSequencedStreamSince('stream_events', 0);
            expect(readAll.CurrentSequence).toBe(3);
            expect(readAll.Entries.length).toBe(3);
            expect(readAll.Entries[0].Sequence).toBe(1);
            expect(JSON.parse(readAll.Entries[0].PayloadJson).event).toBe('first');

            // Read since seq 2 (returns seq 3 only)
            const readTail = await provider.ReadSequencedStreamSince('stream_events', 2);
            expect(readTail.CurrentSequence).toBe(3);
            expect(readTail.Entries.length).toBe(1);
            expect(readTail.Entries[0].Sequence).toBe(3);
        });
    });

    describe('TwoTierCacheStorageProvider', () => {
        it('serves warm L1 hits with frozen references in 0 Redis reads', async () => {
            const redis = new RedisLocalStorageProvider({
                keyPrefix: 'test',
                useHashForRunViewSlots: true,
            });
            const twoTier = new TwoTierCacheStorageProvider(redis);

            expect(twoTier.SharesReferences).toBe(true);
            expect(twoTier.SupportsCrossProcessPersistence).toBe(true);
            expect(twoTier.SharedAcrossProcesses).toBe(true);
            expect(twoTier.RedisProvider).toBe(redis);

            const initialData = {
                results: [{ ID: 'u1', Name: 'Alice' }],
                maxUpdatedAt: '2026-11-10T10:00:00Z',
            };

            await twoTier.SetItem('view1', initialData, 'RunViewCache');
            expect(twoTier.HasL1Key('view1', 'RunViewCache')).toBe(true);

            // Spying on Redis GetItem
            const redisGetSpy = vi.spyOn(redis, 'GetItem');

            const read1 = await twoTier.GetItem<{ results: Array<{ ID: string; Name: string }> }>('view1', 'RunViewCache');
            expect(read1).not.toBeNull();
            expect(read1!.results[0].Name).toBe('Alice');
            expect(redisGetSpy).not.toHaveBeenCalled(); // 0 Redis reads!

            // Mutating in strict mode throws TypeError because it is deep-frozen
            expect(() => {
                (read1!.results[0] as Record<string, unknown>).Name = 'Hacked';
            }).toThrow(TypeError);

            twoTier.Dispose();
        });

        it('evicts oldest accessed slot under byte-bounded LRU budget', async () => {
            const redis = new RedisLocalStorageProvider({ keyPrefix: 'test' });
            // Set 1,600 byte budget for L1 (each slot is ~750 bytes, so exactly 2 slots fit)
            const config: TwoTierCacheConfig = {
                MaxL1Bytes: 1600,
            };
            const twoTier = new TwoTierCacheStorageProvider(redis, config);

            const rowA = { results: Array.from({ length: 4 }, (_, i) => ({ ID: `a${i}`, Data: 'Some data payload string' })) };
            const rowB = { results: Array.from({ length: 4 }, (_, i) => ({ ID: `b${i}`, Data: 'Some data payload string' })) };
            const rowC = { results: Array.from({ length: 4 }, (_, i) => ({ ID: `c${i}`, Data: 'Some data payload string' })) };

            await twoTier.SetItem('slotA', rowA, 'RunViewCache');
            await twoTier.SetItem('slotB', rowB, 'RunViewCache');

            // Access slotA, making slotB the least-recently used
            await twoTier.GetItem('slotA', 'RunViewCache');

            // Store slotC: should evict slotB to stay within budget while preserving slotA
            await twoTier.SetItem('slotC', rowC, 'RunViewCache');

            expect(twoTier.HasL1Key('slotA', 'RunViewCache')).toBe(true);
            expect(twoTier.HasL1Key('slotB', 'RunViewCache')).toBe(false);
            expect(twoTier.HasL1Key('slotC', 'RunViewCache')).toBe(true);

            twoTier.Dispose();
        });

        it('local ApplyRunViewRowDelta updates L1 and falls back to SetItem when L2 Redis slot is cold', async () => {
            const redis = new RedisLocalStorageProvider({
                keyPrefix: 'test',
                useHashForRunViewSlots: true,
            });
            const twoTier = new TwoTierCacheStorageProvider(redis);

            const delta: CacheRowDeltaPayload = {
                deletedPrimaryKeys: [],
                upsertedRows: [{ ID: 'u1', Name: 'Alice' }],
                primaryKeyFields: ['ID'],
                maxUpdatedAt: '2026-11-10T12:00:00Z',
                rowCount: 1,
                totalRowCount: 1,
            };

            const updatedEnvelope = {
                results: [{ ID: 'u1', Name: 'Alice' }],
                maxUpdatedAt: '2026-11-10T12:00:00Z',
                totalRowCount: 1,
            };

            // Redis slot does not exist yet (cold). TwoTier should fall back to SetItem on Redis
            const redisSetItemSpy = vi.spyOn(redis, 'SetItem');

            const applied = await twoTier.ApplyRunViewRowDelta('view-cold', JSON.stringify(delta), updatedEnvelope);
            expect(applied).toBe(true);

            // Stored in L1
            expect(twoTier.HasL1Key('view-cold', 'RunViewCache')).toBe(true);
            // Fallback SetItem was called
            expect(redisSetItemSpy).toHaveBeenCalled();

            twoTier.Dispose();
        });

        it('patches L1 in place via Copy-on-Write on inbound peer row_delta events', async () => {
            const redis = new RedisLocalStorageProvider({ keyPrefix: 'test' });
            const twoTier = new TwoTierCacheStorageProvider(redis);

            const initial = {
                results: [
                    { ID: '1', Name: 'Alice' },
                    { ID: '2', Name: 'Bob' },
                ],
                maxUpdatedAt: '2026-11-10T10:00:00Z',
                totalRowCount: 2,
                schemaHash: 'hash-1',
            };

            await twoTier.SetItem('view-sync', initial, 'RunViewCache');

            // Simulate peer publishing row_delta: update Alice, insert Charlie, delete Bob
            const delta: CacheRowDeltaPayload = {
                deletedPrimaryKeys: [{ ID: '2' }],
                upsertedRows: [
                    { ID: '1', Name: 'Alice-Updated' },
                    { ID: '3', Name: 'Charlie' },
                ],
                primaryKeyFields: ['ID'],
                maxUpdatedAt: '2026-11-10T10:05:00Z',
                rowCount: 2,
                totalRowCount: 2,
                schemaHash: 'hash-1',
            };

            const peerEvent: CacheChangedEvent = {
                CacheKey: 'view-sync',
                Category: 'RunViewCache',
                Action: 'row_delta',
                Timestamp: Date.now(),
                SourceServerId: 'peer-uuid',
                Data: JSON.stringify(delta),
            };

            // Trigger event listener on redis provider
            const listeners = (redis as unknown as { _eventEmitter: EventEmitter })._eventEmitter;
            listeners.emit('cacheChanged', peerEvent);

            // Read from L1: should have Alice-Updated and Charlie, and Bob removed
            const updated = await twoTier.GetItem<{ results: Array<{ ID: string; Name: string }> }>('view-sync', 'RunViewCache');
            expect(updated).not.toBeNull();
            expect(updated!.results.length).toBe(2);
            expect(updated!.results.find(r => r.ID === '1')?.Name).toBe('Alice-Updated');
            expect(updated!.results.find(r => r.ID === '3')?.Name).toBe('Charlie');
            expect(updated!.results.find(r => r.ID === '2')).toBeUndefined();

            twoTier.Dispose();
        });

        it('evicts L1 cleanly on rowCount drift or schemaHash mismatch from peer delta', async () => {
            const redis = new RedisLocalStorageProvider({ keyPrefix: 'test' });
            const twoTier = new TwoTierCacheStorageProvider(redis);

            const initial = {
                results: [{ ID: '1', Name: 'Alice' }],
                maxUpdatedAt: '2026-11-10T10:00:00Z',
                totalRowCount: 1,
                schemaHash: 'hash-v1',
            };

            await twoTier.SetItem('slot-drift', initial, 'RunViewCache');
            expect(twoTier.HasL1Key('slot-drift', 'RunViewCache')).toBe(true);

            // Peer delta with conflicting schemaHash
            const schemaMismatchDelta: CacheRowDeltaPayload = {
                deletedPrimaryKeys: [],
                upsertedRows: [{ ID: '1', Name: 'Alice New' }],
                primaryKeyFields: ['ID'],
                maxUpdatedAt: '2026-11-10T10:01:00Z',
                rowCount: 1,
                totalRowCount: 1,
                schemaHash: 'hash-v2-DIFFERENT',
            };

            const listeners = (redis as unknown as { _eventEmitter: EventEmitter })._eventEmitter;
            listeners.emit('cacheChanged', {
                CacheKey: 'slot-drift',
                Category: 'RunViewCache',
                Action: 'row_delta',
                Timestamp: Date.now(),
                SourceServerId: 'peer-uuid',
                Data: JSON.stringify(schemaMismatchDelta),
            });

            // Evicted from L1!
            expect(twoTier.HasL1Key('slot-drift', 'RunViewCache')).toBe(false);

            // Re-populate and test rowCount drift
            await twoTier.SetItem('slot-drift', initial, 'RunViewCache');
            expect(twoTier.HasL1Key('slot-drift', 'RunViewCache')).toBe(true);

            // Peer claims postRowCount is 5, but after applying upsert nextResults has only 1 row
            const countDriftDelta: CacheRowDeltaPayload = {
                deletedPrimaryKeys: [],
                upsertedRows: [{ ID: '1', Name: 'Alice' }],
                primaryKeyFields: ['ID'],
                maxUpdatedAt: '2026-11-10T10:01:00Z',
                rowCount: 5, // DRIFT!
                totalRowCount: 5,
                schemaHash: 'hash-v1',
            };

            listeners.emit('cacheChanged', {
                CacheKey: 'slot-drift',
                Category: 'RunViewCache',
                Action: 'row_delta',
                Timestamp: Date.now(),
                SourceServerId: 'peer-uuid',
                Data: JSON.stringify(countDriftDelta),
            });

            // Evicted from L1 due to drift!
            expect(twoTier.HasL1Key('slot-drift', 'RunViewCache')).toBe(false);

            twoTier.Dispose();
        });

        it('clears L1 on category_cleared, removed, and OnReconciliationRequired', async () => {
            const redis = new RedisLocalStorageProvider({ keyPrefix: 'test' });
            const twoTier = new TwoTierCacheStorageProvider(redis);

            await twoTier.SetItem('key1', { results: [1] }, 'RunViewCache');
            await twoTier.SetItem('key2', { results: [2] }, 'DatasetCache');

            expect(twoTier.HasL1Key('key1', 'RunViewCache')).toBe(true);
            expect(twoTier.HasL1Key('key2', 'DatasetCache')).toBe(true);

            const listeners = (redis as unknown as { _eventEmitter: EventEmitter })._eventEmitter;

            // 1. Peer removed key1
            listeners.emit('cacheChanged', {
                CacheKey: 'key1',
                Category: 'RunViewCache',
                Action: 'removed',
                Timestamp: Date.now(),
                SourceServerId: 'peer',
            });
            expect(twoTier.HasL1Key('key1', 'RunViewCache')).toBe(false);
            expect(twoTier.HasL1Key('key2', 'DatasetCache')).toBe(true);

            // 2. Peer category_cleared DatasetCache
            listeners.emit('cacheChanged', {
                CacheKey: 'DatasetCache',
                Category: 'DatasetCache',
                Action: 'category_cleared',
                Timestamp: Date.now(),
                SourceServerId: 'peer',
            });
            expect(twoTier.HasL1Key('key2', 'DatasetCache')).toBe(false);

            // 3. Re-add and trigger reconciliation gap
            await twoTier.SetItem('key3', { results: [3] }, 'RunViewCache');
            expect(twoTier.HasL1Key('key3', 'RunViewCache')).toBe(true);

            listeners.emit('reconciliationRequired');
            // Entire L1 flushed
            expect(twoTier.HasL1Key('key3', 'RunViewCache')).toBe(false);
            expect(twoTier.L1EntryCount).toBe(0);

            twoTier.Dispose();
        });

        it('exempts providerInternalScaffolding RunView slots and MJ_Metadata DatasetCache entries from L1 freeze (#6598)', async () => {
            const redis = new RedisLocalStorageProvider({ keyPrefix: 'test', useHashForRunViewSlots: true });
            const twoTier = new TwoTierCacheStorageProvider(redis);

            // 1. RunViewCache slot with providerInternalScaffolding: true stays unfrozen on write and L2->L1 hydration
            const scaffoldingSlot: CachedRunViewData = {
                results: [{ ID: 'e-2', Name: 'Zeta' }, { ID: 'e-1', Name: 'Alpha' }],
                rowCount: 2,
                totalRowCount: 2,
                maxUpdatedAt: '2026-11-12T06:00:00.000Z',
                cachedAt: Date.now(),
                providerInternalScaffolding: true,
            };
            await twoTier.SetItem('Entities|scaffolding', scaffoldingSlot, 'RunViewCache');

            const l1Hit = await twoTier.GetItem<CachedRunViewData>('Entities|scaffolding', 'RunViewCache');
            expect(l1Hit).not.toBeNull();
            expect(Object.isFrozen(l1Hit!.results)).toBe(false);
            expect(Object.isFrozen(l1Hit!.results[0])).toBe(false);

            // Flush L1 so GetItem hydrates from Redis L2 hash storage — must also remain unfrozen
            twoTier.ClearL1();
            const l2Hydrated = await twoTier.GetItem<CachedRunViewData>('Entities|scaffolding', 'RunViewCache');
            expect(l2Hydrated).not.toBeNull();
            expect(l2Hydrated!.providerInternalScaffolding).toBe(true);
            expect(Object.isFrozen(l2Hydrated!.results)).toBe(false);
            expect(Object.isFrozen(l2Hydrated!.results[0])).toBe(false);

            // 2. MJ_Metadata in DatasetCache stays unfrozen, while non-metadata datasets ARE frozen (cache-immutability.F14)
            const mjMetadataDataset = {
                DatasetID: 'ds-meta',
                DatasetName: 'MJ_Metadata',
                Success: true,
                Status: 'Success',
                LatestUpdateDate: '2026-11-12T06:00:00.000Z',
                Results: [{ Code: 'Entities', EntityName: 'MJ: Entities', EntityID: '1', Results: [{ ID: 'e-1', Name: 'Alpha' }] }],
            };
            const otherDataset = {
                DatasetID: 'ds-other',
                DatasetName: 'MJ_Catalog',
                Success: true,
                Status: 'Success',
                LatestUpdateDate: '2026-11-12T06:00:00.000Z',
                Results: [{ Code: 'Items', EntityName: 'MJ: Items', EntityID: '2', Results: [{ ID: 'i-1', Name: 'Item 1' }] }],
            };

            await twoTier.SetItem('__MJ_conn__DATASET__MJ_Metadata', mjMetadataDataset, 'DatasetCache');
            await twoTier.SetItem('__MJ_conn__DATASET__MJ_Catalog', otherDataset, 'DatasetCache');

            const metaHit = await twoTier.GetItem<typeof mjMetadataDataset>('__MJ_conn__DATASET__MJ_Metadata', 'DatasetCache');
            const otherHit = await twoTier.GetItem<typeof otherDataset>('__MJ_conn__DATASET__MJ_Catalog', 'DatasetCache');

            expect(Object.isFrozen(metaHit!.Results[0].Results)).toBe(false);
            expect(Object.isFrozen(metaHit!.Results[0].Results[0])).toBe(false);
            expect(Object.isFrozen(otherHit!.Results[0].Results)).toBe(true);
            expect(Object.isFrozen(otherHit!.Results[0].Results[0])).toBe(true);

            // 3. Without DatasetName the key decides: a filtered MJ_Metadata key is exempt, a longer name is not
            const unnamed = () => ({ Results: [{ Code: 'Entities', Results: [{ ID: 'e-2', Name: 'Beta' }] }] });
            const filteredKey = '__MJ_conn__DATASET__MJ_Metadata{"Queries":"1=0"}';
            const longerKey = '__MJ_conn__DATASET__MJ_Metadata_Extended';
            await twoTier.SetItem(filteredKey, unnamed(), 'DatasetCache');
            await twoTier.SetItem(longerKey, unnamed(), 'DatasetCache');

            const filteredHit = await twoTier.GetItem<ReturnType<typeof unnamed>>(filteredKey, 'DatasetCache');
            const longerHit = await twoTier.GetItem<ReturnType<typeof unnamed>>(longerKey, 'DatasetCache');

            expect(Object.isFrozen(filteredHit!.Results[0].Results)).toBe(false);
            expect(Object.isFrozen(longerHit!.Results[0].Results)).toBe(true);

            twoTier.Dispose();
        });
    });
});
