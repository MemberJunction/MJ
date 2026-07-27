import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
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

/** Minimal provider exposing the two seams RecordMapBatch uses: Dialect + ExecuteSQL. */
function createProvider(platform: 'sqlserver' | 'postgresql' = 'sqlserver') {
    const executed: string[] = [];
    const provider = {
        Dialect: {
            PlatformKey: platform,
            QuoteIdentifier: (s: string) => `"${s}"`,
            QuoteStringLiteral: (s: string) => `'${s.replace(/'/g, "''")}'`,
        },
        ExecuteSQL: vi.fn(async (sql: string) => { executed.push(sql); return []; }),
        EntityByName: () => ({ SchemaName: '__mj', BaseTable: 'CompanyIntegrationRecordMap' }),
    };
    return { provider: provider as unknown as IMetadataProvider, executed, raw: provider };
}

function mapping(ext: string, rec = `mj-${ext}`, entityID = 'entity-1'): PendingRecordMap {
    return { EntityID: entityID, ExternalID: ext, EntityRecordID: rec };
}

/** Read-back mock that agrees with everything the chunk claimed to write. */
function mockVerifyAgrees(chunk: PendingRecordMap[]) {
    mockRunViewFn.mockResolvedValue({
        Success: true,
        Results: chunk.map(m => ({ ExternalSystemRecordID: m.ExternalID, EntityRecordID: m.EntityRecordID })),
    });
}

describe('RecordMapBatch', () => {
    beforeEach(() => {
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
    });

    describe('batching', () => {
        it('writes a whole batch with two statements, not two per row', async () => {
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            const chunk = ['a', 'b', 'c'].map(x => mapping(x));
            mockVerifyAgrees(chunk);
            for (const m of chunk) batch.Queue(m);
            await batch.Flush();

            expect(executed.length).toBe(2); // one UPDATE + one INSERT for all three
            expect(batch.Failures).toEqual([]);
            expect(executed[0]).toContain('UPDATE');
            expect(executed[1]).toContain('INSERT INTO');
            for (const m of chunk) expect(executed[1]).toContain(`'${m.ExternalID}'`);
        });

        it('groups by entity — one statement pair per entity, since the key includes EntityID', async () => {
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a', 'mj-a', 'entity-1'));
            batch.Queue(mapping('b', 'mj-b', 'entity-2'));
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    { ExternalSystemRecordID: 'a', EntityRecordID: 'mj-a' },
                    { ExternalSystemRecordID: 'b', EntityRecordID: 'mj-b' },
                ],
            });
            await batch.Flush();

            expect(executed.length).toBe(4); // 2 entities × (UPDATE + INSERT)
            expect(batch.Failures).toEqual([]);
        });

        it('collapses a repeated external ID to its latest value (the upsert would anyway)', async () => {
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a', 'mj-old'));
            batch.Queue(mapping('a', 'mj-new'));
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ExternalSystemRecordID: 'a', EntityRecordID: 'mj-new' }],
            });
            await batch.Flush();

            expect(executed[1]).toContain("'mj-new'");
            expect(executed[1]).not.toContain("'mj-old'");
            expect(batch.Failures).toEqual([]);
        });

        it('writes nothing until Flush, even once a full chunk has accumulated', async () => {
            // Queue() is called from inside the apply pass's batch transaction. An auto-flush there
            // would write map rows the transaction could still roll back — rows Discard() can no
            // longer take back, and that verifyChunk would 'confirm' by reading uncommitted state.
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            const all = Array.from({ length: RecordMapBatch.ChunkSize }, (_, i) => mapping(`e${i}`));
            mockVerifyAgrees(all);
            for (const m of all) batch.Queue(m);

            expect(executed.length).toBe(0);

            await batch.Flush();
            expect(executed.length).toBe(2); // one UPDATE + one INSERT for the chunk
        });

        it('splits at the chunk boundary — one more mapping than ChunkSize is two writes, not one oversized one', async () => {
            // The chunk size exists because a single statement carrying every mapping eventually
            // exceeds what the driver will send. Crossing the boundary by one has to produce a
            // second chunk, and the extra row has to be in it — not dropped, and not appended to
            // a chunk that is already at the limit.
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            const all = Array.from({ length: RecordMapBatch.ChunkSize + 1 }, (_, i) => mapping(`e${i}`));
            mockVerifyAgrees(all);
            for (const m of all) batch.Queue(m);
            await batch.Flush();

            expect(executed.length).toBe(4); // 2 chunks × (UPDATE + INSERT)
            expect(batch.Failures).toEqual([]);

            const lastID = `'e${RecordMapBatch.ChunkSize}'`;
            expect(executed[1]).toContain("'e0'");
            expect(executed[1]).not.toContain(lastID); // the overflow row is not in the first chunk
            expect(executed[3]).toContain(lastID); // it is in the second
            expect(executed[3]).not.toContain("'e0'");
        });

        it('discards queued mappings when the batch that produced them rolled back', async () => {
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            batch.Queue(mapping('a'));
            batch.Discard();
            await batch.Flush();

            // The records these mappings point at no longer exist — writing them would leave the
            // map pointing at nothing.
            expect(executed.length).toBe(0);
        });
    });

    describe('per-row error attribution (the hard requirement)', () => {
        it('names the one row the database did not write — the other rows still commit', async () => {
            const { provider } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            const chunk = ['a', 'b', 'c'].map(x => mapping(x));
            // The read-back proves only a and c landed.
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    { ExternalSystemRecordID: 'a', EntityRecordID: 'mj-a' },
                    { ExternalSystemRecordID: 'c', EntityRecordID: 'mj-c' },
                ],
            });
            for (const m of chunk) batch.Queue(m);
            await batch.Flush();

            expect(batch.Failures.map(f => f.ExternalID)).toEqual(['b']);
            expect(batch.Failures[0].ErrorMessage).toContain('not written');
        });

        it('names a row the map points at a DIFFERENT MJ record than this sync wrote', async () => {
            const { provider } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ExternalSystemRecordID: 'a', EntityRecordID: 'mj-someone-else' }],
            });
            batch.Queue(mapping('a', 'mj-a'));
            await batch.Flush();

            expect(batch.Failures.map(f => f.ExternalID)).toEqual(['a']);
            expect(batch.Failures[0].ErrorMessage).toContain('mj-someone-else');
        });

        it('claims nothing when the read-back itself fails — every row is reported unverified', async () => {
            const { provider } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'DB down' });
            for (const m of ['a', 'b'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(batch.Failures.map(f => f.ExternalID).sort()).toEqual(['a', 'b']);
            expect(batch.Failures[0].ErrorMessage).toContain('could not be verified');
        });

        it('replays row by row when the set write throws — 1 bad row, not 3 lost rows', async () => {
            const { provider, raw } = createProvider();
            const saveSingle = vi.fn(async (_ci: string, ext: string) => {
                if (ext === 'b') throw new Error('bad literal in row b');
            });
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, saveSingle);

            raw.ExecuteSQL.mockRejectedValueOnce(new Error('chunk statement failed'));
            for (const m of ['a', 'b', 'c'].map(x => mapping(x))) batch.Queue(m);
            await batch.Flush();

            expect(saveSingle).toHaveBeenCalledTimes(3); // every row got its own chance
            expect(batch.Failures.map(f => f.ExternalID)).toEqual(['b']);
            expect(batch.Failures[0].ErrorMessage).toContain('bad literal in row b');
        });

        it('TakeFailures hands back the failures once and clears them', async () => {
            const { provider } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());

            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
            batch.Queue(mapping('a'));
            await batch.Flush();

            expect(batch.TakeFailures().map(f => f.ExternalID)).toEqual(['a']);
            expect(batch.Failures).toEqual([]);
        });
    });

    describe('dialect portability', () => {
        it('uses the SQL Server UPDATE ... FROM join form', async () => {
            const { provider, executed } = createProvider('sqlserver');
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());
            mockVerifyAgrees([mapping('a')]);
            batch.Queue(mapping('a'));
            await batch.Flush();

            expect(executed[0]).toContain('UPDATE t SET');
            expect(executed[0]).toContain('INNER JOIN src s');
        });

        it('uses the Postgres UPDATE ... FROM ... WHERE form', async () => {
            const { provider, executed } = createProvider('postgresql');
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());
            mockVerifyAgrees([mapping('a')]);
            batch.Queue(mapping('a'));
            await batch.Flush();

            expect(executed[0]).toContain('FROM src s');
            expect(executed[0]).not.toContain('INNER JOIN');
        });

        it('builds the row source as a UNION ALL of SELECTs — portable across both dialects', async () => {
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());
            const chunk = ['a', 'b'].map(x => mapping(x));
            mockVerifyAgrees(chunk);
            for (const m of chunk) batch.Queue(m);
            await batch.Flush();

            expect(executed[0]).toContain('UNION ALL');
            // `VALUES (...) AS v(col)` is NOT portable between the two dialects.
            expect(executed[0]).not.toContain('VALUES');
        });

        it('escapes single quotes in external IDs', async () => {
            const { provider, executed } = createProvider();
            const batch = new RecordMapBatch(provider, 'ci-1', contextUser, vi.fn());
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ExternalSystemRecordID: "o'brien", EntityRecordID: "mj-o'brien" }],
            });
            batch.Queue(mapping("o'brien", "mj-o'brien"));
            await batch.Flush();

            expect(executed[1]).toContain("'o''brien'");
            expect(batch.Failures).toEqual([]);
        });
    });
});
