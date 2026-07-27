import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RecordMapBatch, type PendingRecordMap } from '../RecordMapBatch.js';

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;

/** What a mock entity recorded about the write it was asked to perform. */
interface SavedRow {
    LoadedID: string | null;
    IsNew: boolean;
    CompanyIntegrationID: string;
    EntityID: string;
    ExternalSystemRecordID: string;
    EntityRecordID: string;
}

/**
 * A provider that satisfies `instanceof DatabaseProviderBase` — the narrowing RecordMapBatch uses
 * to reach the dialect. Built on the real prototype so `Dialect` resolves through the real
 * `GetDialect(PlatformKey)`: the filter assertions below are checked against the actual SQL Server
 * / Postgres quoting rules, not a stub of them.
 *
 * `ExecuteSQL` is present but is expected never to be called — see the 'no raw SQL' test.
 */
function createProvider(platform: 'sqlserver' | 'postgresql' = 'sqlserver') {
    const saved: SavedRow[] = [];
    /** Per-external-ID hooks: return false to make Save() fail, throw to make it throw. */
    const saveBehavior = new Map<string, () => boolean>();
    /** External IDs whose Load() should report the row has since been deleted. */
    const loadFails = new Set<string>();

    const executeSQL = vi.fn(async () => []);

    const newEntity = () => {
        const row: SavedRow = {
            LoadedID: null, IsNew: false,
            CompanyIntegrationID: '', EntityID: '', ExternalSystemRecordID: '', EntityRecordID: '',
        };
        return {
            LatestResult: { CompleteMessage: 'constraint violation' },
            NewRecord: vi.fn(() => { row.IsNew = true; return true; }),
            Load: vi.fn(async (id: string) => {
                row.LoadedID = id;
                return !loadFails.has(id);
            }),
            Save: vi.fn(async () => {
                saved.push({ ...row });
                const behavior = saveBehavior.get(row.ExternalSystemRecordID);
                return behavior ? behavior() : true;
            }),
            set CompanyIntegrationID(v: string) { row.CompanyIntegrationID = v; },
            set EntityID(v: string) { row.EntityID = v; },
            set ExternalSystemRecordID(v: string) { row.ExternalSystemRecordID = v; },
            set EntityRecordID(v: string) { row.EntityRecordID = v; },
        };
    };

    const getEntityObject = vi.fn(async () => newEntity());

    // defineProperty rather than assignment: PlatformKey is a getter on the prototype, so a plain
    // assignment would throw instead of shadowing it.
    const provider = Object.create(DatabaseProviderBase.prototype) as Record<string, unknown>;
    Object.defineProperties(provider, {
        PlatformKey: { value: platform },
        GetEntityObject: { value: getEntityObject },
        ExecuteSQL: { value: executeSQL },
    });

    return { provider: provider as IMetadataProvider, saved, saveBehavior, loadFails, getEntityObject, executeSQL };
}

/** A provider with no dialect at all — the client-side shape RecordMapBatch must not assume away. */
function createDialectlessProvider() {
    return {
        GetEntityObject: vi.fn(),
    } as unknown as IMetadataProvider;
}

function mapping(ext: string, rec = `mj-${ext}`, entityID = 'entity-1'): PendingRecordMap {
    return { EntityID: entityID, ExternalID: ext, EntityRecordID: rec };
}

/** The chunk read finds nothing — every queued mapping is an insert. */
function readFindsNothing() {
    mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
}

/** The chunk read finds a row for each mapping, already pointing where the sync wants it. */
function readAgrees(chunk: PendingRecordMap[]) {
    mockRunViewFn.mockResolvedValue({
        Success: true,
        Results: chunk.map((m, i) => ({
            ID: `map-${i}`,
            ExternalSystemRecordID: m.ExternalID,
            EntityRecordID: m.EntityRecordID,
        })),
    });
}

describe('RecordMapBatch', () => {
    beforeEach(() => {
        mockRunViewFn = vi.fn();
        readFindsNothing();
    });

    describe('batching', () => {
        it('resolves a whole chunk in ONE read, not one read per row', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            for (const m of ['a', 'b', 'c'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(saved.map(s => s.ExternalSystemRecordID).sort()).toEqual(['a', 'b', 'c']);
            expect(batch.Failures).toEqual([]);
        });

        it('writes NOTHING when every mapping already points where it should', async () => {
            // The steady-state incremental sync. This is the whole reason the batch exists: the
            // per-record path paid a read + a load + a save per record to discover there was
            // nothing to do. Here it is one read and zero writes.
            const { provider, saved, getEntityObject } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            const chunk = ['a', 'b', 'c'].map(x => mapping(x));
            readAgrees(chunk);
            for (const m of chunk) batch.Queue(m);
            await batch.Flush();

            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(getEntityObject).not.toHaveBeenCalled();
            expect(saved).toEqual([]);
            expect(batch.Failures).toEqual([]);
        });

        it('writes only the row that moved, leaving the unchanged ones alone', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'map-a', ExternalSystemRecordID: 'a', EntityRecordID: 'mj-a' },
                    { ID: 'map-b', ExternalSystemRecordID: 'b', EntityRecordID: 'mj-somewhere-else' },
                ],
            });
            batch.Queue(mapping('a', 'mj-a'));
            batch.Queue(mapping('b', 'mj-b'));
            await batch.Flush();

            expect(saved).toHaveLength(1);
            expect(saved[0].ExternalSystemRecordID).toBe('b');
            expect(saved[0].EntityRecordID).toBe('mj-b');
        });

        it('groups by entity — one read per entity, since the key includes EntityID', async () => {
            const { provider } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a', 'mj-a', 'entity-1'));
            batch.Queue(mapping('b', 'mj-b', 'entity-2'));
            await batch.Flush();

            expect(mockRunViewFn).toHaveBeenCalledTimes(2);
            expect(batch.Failures).toEqual([]);
        });

        it('collapses a repeated external ID to its latest value (the upsert would anyway)', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a', 'mj-old'));
            batch.Queue(mapping('a', 'mj-new'));
            await batch.Flush();

            expect(saved).toHaveLength(1);
            expect(saved[0].EntityRecordID).toBe('mj-new');
        });

        it('writes nothing until Flush, even once a full chunk has accumulated', async () => {
            // Queue() is called from inside the apply pass's batch transaction. An auto-flush there
            // would write map rows the transaction could still roll back — rows Discard() can no
            // longer take back.
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            for (let i = 0; i < RecordMapBatch.ChunkSize; i++) batch.Queue(mapping(`e${i}`));

            expect(mockRunViewFn).not.toHaveBeenCalled();
            expect(saved).toEqual([]);

            await batch.Flush();
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(saved).toHaveLength(RecordMapBatch.ChunkSize);
        });

        it('splits at the chunk boundary — one more mapping than ChunkSize is two reads, not one oversized one', async () => {
            // The chunk size exists because the read's IN(...) list eventually exceeds what the
            // driver will send. Crossing the boundary by one has to produce a second chunk, and the
            // extra row has to be in it — not dropped, and not appended to a chunk already at the limit.
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            for (let i = 0; i < RecordMapBatch.ChunkSize + 1; i++) batch.Queue(mapping(`e${i}`));
            await batch.Flush();

            expect(mockRunViewFn).toHaveBeenCalledTimes(2);
            expect(saved).toHaveLength(RecordMapBatch.ChunkSize + 1);

            const overflowID = `e${RecordMapBatch.ChunkSize}`;
            const firstFilter = (mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
            const secondFilter = (mockRunViewFn.mock.calls[1][0] as { ExtraFilter: string }).ExtraFilter;
            expect(firstFilter).toContain("'e0'");
            expect(firstFilter).not.toContain(`'${overflowID}'`);
            expect(secondFilter).toContain(`'${overflowID}'`);
            expect(secondFilter).not.toContain("'e0'");
        });

        it('discards queued mappings when the batch that produced them rolled back', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a'));
            batch.Discard();
            await batch.Flush();

            // The records these mappings point at no longer exist — writing them would leave the
            // map pointing at nothing.
            expect(mockRunViewFn).not.toHaveBeenCalled();
            expect(saved).toEqual([]);
        });
    });

    describe('writes go through the entity layer, never raw SQL', () => {
        it('never calls ExecuteSQL — no statement text this file would have to keep portable', async () => {
            // Hand-written DML is what forces a platform branch, and a branch is what can be right
            // on SQL Server and wrong on Postgres. Save() lands in the entity's generated
            // spCreate/spUpdate on whichever platform the provider is.
            const { provider, executeSQL } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            for (const m of ['a', 'b'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(executeSQL).not.toHaveBeenCalled();
        });

        it('inserts a brand-new mapping with every identity field set', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a', 'mj-a'));
            await batch.Flush();

            expect(saved).toEqual([{
                LoadedID: null,
                IsNew: true,
                CompanyIntegrationID: 'ci-1',
                EntityID: 'entity-1',
                ExternalSystemRecordID: 'a',
                EntityRecordID: 'mj-a',
            }]);
        });

        it('updates the existing row in place rather than inserting a second one', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'map-a', ExternalSystemRecordID: 'a', EntityRecordID: 'mj-stale' }],
            });
            batch.Queue(mapping('a', 'mj-a'));
            await batch.Flush();

            expect(saved).toHaveLength(1);
            expect(saved[0].LoadedID).toBe('map-a'); // loaded the row the read found
            expect(saved[0].IsNew).toBe(false);      // and did NOT start a new one
            expect(saved[0].EntityRecordID).toBe('mj-a');
        });

        it('inserts when the row it meant to update has since been deleted', async () => {
            const { provider, saved, loadFails } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'map-a', ExternalSystemRecordID: 'a', EntityRecordID: 'mj-stale' }],
            });
            loadFails.add('map-a');
            batch.Queue(mapping('a', 'mj-a'));
            await batch.Flush();

            // Abandoning the mapping here would leave the record unmatchable by external ID on the
            // next sync, which is the failure the map exists to prevent.
            expect(saved).toHaveLength(1);
            expect(saved[0].IsNew).toBe(true);
            expect(batch.Failures).toEqual([]);
        });

        it('keeps the first row when the table carries a duplicate for one external ID', async () => {
            // Writing to whichever we happened to see last would flip the mapping between syncs for
            // no reason.
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'map-first', ExternalSystemRecordID: 'a', EntityRecordID: 'mj-stale' },
                    { ID: 'map-second', ExternalSystemRecordID: 'a', EntityRecordID: 'mj-also-stale' },
                ],
            });
            batch.Queue(mapping('a', 'mj-a'));
            await batch.Flush();

            expect(saved).toHaveLength(1);
            expect(saved[0].LoadedID).toBe('map-first');
        });
    });

    describe('per-row error attribution (the hard requirement)', () => {
        it('names the one row that failed — the other rows still commit', async () => {
            const { provider, saved, saveBehavior } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            saveBehavior.set('b', () => false);
            for (const m of ['a', 'b', 'c'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(batch.Failures.map(f => f.ExternalID)).toEqual(['b']);
            expect(batch.Failures[0].EntityID).toBe('entity-1');
            // Save() returns false rather than throwing, so the reason has to come off LatestResult.
            expect(batch.Failures[0].ErrorMessage).toContain('constraint violation');
            expect(saved.map(s => s.ExternalSystemRecordID).sort()).toEqual(['a', 'b', 'c']);
        });

        it('names the row whose write threw, and keeps going', async () => {
            const { provider, saveBehavior } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            saveBehavior.set('b', () => { throw new Error('deadlock victim'); });
            for (const m of ['a', 'b', 'c'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(batch.Failures.map(f => f.ExternalID)).toEqual(['b']);
            expect(batch.Failures[0].ErrorMessage).toContain('deadlock victim');
        });

        it('falls back to the per-row upsert when the chunk read fails', async () => {
            // Without the read we cannot tell an insert from an update, and guessing either way
            // duplicates the row. The per-row path does its own read, so each row resolves itself.
            const { provider, saved } = createProvider();
            const saveSingle = vi.fn(async (_ci: string, ext: string) => {
                if (ext === 'b') throw new Error('bad row b');
            });
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, saveSingle);

            mockRunViewFn.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'DB down' });
            for (const m of ['a', 'b', 'c'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(saveSingle).toHaveBeenCalledTimes(3); // every row got its own chance
            expect(saved).toEqual([]);                   // and none went through the batched path
            expect(batch.Failures.map(f => f.ExternalID)).toEqual(['b']);
            expect(batch.Failures[0].ErrorMessage).toContain('bad row b');
        });

        it('falls back to the per-row upsert when the provider has no dialect to quote with', async () => {
            const provider = createDialectlessProvider();
            const saveSingle = vi.fn(async () => {});
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, saveSingle);

            batch.Queue(mapping('a'));
            await batch.Flush();

            expect(mockRunViewFn).not.toHaveBeenCalled();
            expect(saveSingle).toHaveBeenCalledTimes(1);
            expect(batch.Failures).toEqual([]);
        });

        it('TakeFailures hands back the failures once and clears them', async () => {
            const { provider, saveBehavior } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            saveBehavior.set('a', () => false);
            batch.Queue(mapping('a'));
            await batch.Flush();

            expect(batch.TakeFailures().map(f => f.ExternalID)).toEqual(['a']);
            expect(batch.Failures).toEqual([]);
        });
    });

    describe('the chunk read filter', () => {
        it('scopes to this integration and entity, and lists the chunk exactly once', async () => {
            const { provider } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            for (const m of ['a', 'b'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            const params = mockRunViewFn.mock.calls[0][0] as {
                EntityName: string; ExtraFilter: string; Fields: string[];
                ResultType: string; IgnoreMaxRows: boolean; BypassCache: boolean;
            };
            expect(params.EntityName).toBe('MJ: Company Integration Record Maps');
            expect(params.ExtraFilter).toContain("'ci-1'");
            expect(params.ExtraFilter).toContain("'entity-1'");
            expect(params.ExtraFilter).toContain("IN ('a','b')");
            // Read-only lookup: plain objects, only the three fields the decision needs.
            expect(params.ResultType).toBe('simple');
            expect(params.Fields).toEqual(['ID', 'ExternalSystemRecordID', 'EntityRecordID']);
            expect(params.IgnoreMaxRows).toBe(true);  // a chunk can exceed the entity's row cap
            expect(params.BypassCache).toBe(true);    // this decides INSERT vs UPDATE
        });

        it('quotes identifiers by the platform rule — brackets on SQL Server, double quotes on Postgres', async () => {
            for (const [platform, open] of [['sqlserver', '['], ['postgresql', '"']] as const) {
                mockRunViewFn = vi.fn();
                readFindsNothing();
                const { provider } = createProvider(platform);
                const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

                batch.Queue(mapping('a'));
                await batch.Flush();

                const filter = (mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
                expect(filter).toContain(`${open}CompanyIntegrationID`);
                expect(filter).toContain(`${open}ExternalSystemRecordID`);
            }
        });

        it('escapes a single quote in an external ID', async () => {
            const { provider, saved } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping("o'brien", "mj-o'brien"));
            await batch.Flush();

            const filter = (mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
            expect(filter).toContain("'o''brien'");
            // The VALUE only ever travels as a bound entity field, so it is never escaped twice.
            expect(saved[0].ExternalSystemRecordID).toBe("o'brien");
            expect(batch.Failures).toEqual([]);
        });
    });
});
