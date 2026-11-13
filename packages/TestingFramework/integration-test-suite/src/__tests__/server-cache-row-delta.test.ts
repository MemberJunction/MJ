/**
 * Pins the write-selection and key-scoping rules S32–S34 depend on — the regression guard for #6537.
 *
 * S34 asserts two things about one `MJ: User Settings` save/delete pair: the save broadcasts a
 * compact `row_delta` upsert, and the delete broadcasts a `row_delta` removal that upserts nothing.
 * One save maintains more than one cache slot (the plain unfiltered slot and the engine's `imr:1`
 * slot) and issues those writes in the background, fire-and-forget, so neither phase ordering nor
 * slot arrival ordering is guaranteed. Selecting by slot key (`IsPlainEntitySlot`) plus primary-key
 * payload (`RowIsRecord`), after waiting for the write stream to go quiet (`WaitForRowDeltaQuiet`),
 * isolates the exact baseline slot deterministically.
 *
 * S32 and S33 assert that `CacheLocal: false` writes nothing while a default sibling caches once;
 * scoping those assertions to each check's own `UniqueFilter` key (`WritesForEntityFilter`) keeps
 * late background writes on unrelated entities from polluting the count.
 */
import { describe, it, expect } from 'vitest';
import type { CacheRowDeltaPayload } from '@memberjunction/core';
import type { RecordedWrite } from '@memberjunction/testing-integration';
import {
    IsPlainEntitySlot,
    LastRowDeltaMatching,
    WaitForRowDeltaQuiet,
    WritesForEntityFilter,
    type RowDeltaStorageContext
} from '../checks/server-cache.checks';

const ENTITY = 'MJ: User Settings';
const SAVED_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const OTHER_ID = 'bbbbbbbb-5555-6666-7777-888888888888';

/** A `row_delta` payload, defaulted to the shape the cache actually broadcasts. */
function payload(over: Partial<CacheRowDeltaPayload>): CacheRowDeltaPayload {
    return {
        upsertedRows: [],
        deletedPrimaryKeys: [],
        primaryKeyFields: ['ID'],
        maxUpdatedAt: '2026-11-12T00:00:00.000Z',
        rowCount: 3,
        totalRowCount: 3,
        ...over
    };
}

const upsertOf = (id: string, rowCount = 4) => payload({ upsertedRows: [{ ID: id, Setting: 'x' }], rowCount, totalRowCount: rowCount });
const removalOf = (id: string, rowCount = 3) => payload({ deletedPrimaryKeys: [{ ID: id }], rowCount, totalRowCount: rowCount });

/** A recorded `row_delta` write as the instrumented provider shapes it. */
function rowDeltaWrite(key: string, p: CacheRowDeltaPayload): RecordedWrite {
    return { Key: key, Category: 'RunViewCache', Options: { pubSubAction: 'row_delta', pubSubData: JSON.stringify(p) } };
}

/** A plain `SetItem` write in `RunViewCache` (as S32/S33 observe on cache fill). */
function cacheFillWrite(key: string, category: string = 'RunViewCache'): RecordedWrite {
    return { Key: key, Category: category, Options: undefined };
}

/** A cast-free context whose Storage replays a fixed list of recorded writes. */
function ctxWith(writes: RecordedWrite[]): RowDeltaStorageContext {
    return {
        Storage: {
            RowDeltaWrites: () => writes.filter(w => w.Options?.pubSubAction === 'row_delta'),
            Writes: writes
        }
    };
}

/** The predicates S34 uses: plain unfiltered slot key AND matching primary key in payload. */
const isPlainUpsertOfSaved = (p: CacheRowDeltaPayload, w: RecordedWrite) =>
    IsPlainEntitySlot(w.Key, ENTITY) && p.upsertedRows.some(r => r['ID'] === SAVED_ID);
const isPlainRemovalOfSaved = (p: CacheRowDeltaPayload, w: RecordedWrite) =>
    IsPlainEntitySlot(w.Key, ENTITY) && p.deletedPrimaryKeys.some(k => k['ID'] === SAVED_ID);

describe('IsPlainEntitySlot', () => {
    it('accepts unfiltered slots and excludes IgnoreMaxRows (imr:1), filtered, or other-entity slots', () => {
        expect(IsPlainEntitySlot('MJ: User Settings|_|_|-1|0|_|_|conn', ENTITY)).toBe(true);
        expect(IsPlainEntitySlot('MJ: User Settings|||||', ENTITY)).toBe(true);
        expect(IsPlainEntitySlot('MJ: User Settings|_|_|-1|0|_|_|imr:1|conn', ENTITY)).toBe(false);
        expect(IsPlainEntitySlot('MJ: User Settings||||imr:1|', ENTITY)).toBe(false);
        expect(IsPlainEntitySlot("MJ: User Settings|UserID='u1'|_|-1|0|_|_", ENTITY)).toBe(false);
        expect(IsPlainEntitySlot('MJ: Entities|_|_|-1|0|_|_', ENTITY)).toBe(false);
    });
});

describe('LastRowDeltaMatching (S34 write selection, #6537)', () => {
    it('does NOT return a late upsert when the removal is what was asked for — the #6537 failure', () => {
        const ctx = ctxWith([
            rowDeltaWrite('MJ: User Settings|||||', removalOf(SAVED_ID)),
            rowDeltaWrite('MJ: User Settings||||imr:1|', upsertOf(SAVED_ID))
        ]);

        const selected = LastRowDeltaMatching(ctx, isPlainRemovalOfSaved, 'S34 removal');

        expect(selected.payload.upsertedRows).toEqual([]);
        expect(selected.payload.deletedPrimaryKeys).toEqual([{ ID: SAVED_ID }]);
        expect(selected.key).toBe('MJ: User Settings|||||');
    });

    it('selects the plain unfiltered slot regardless of whether imr:1 arrives BEFORE or AFTER it', () => {
        // When imr:1 lands first:
        const imrFirst = ctxWith([
            rowDeltaWrite('MJ: User Settings||||imr:1|', removalOf(SAVED_ID, 99)),
            rowDeltaWrite('MJ: User Settings|||||', removalOf(SAVED_ID, 3))
        ]);
        expect(LastRowDeltaMatching(imrFirst, isPlainRemovalOfSaved, 'S34 removal').payload.rowCount).toBe(3);

        // When imr:1 lands LAST (the actual #6537 background arrival order) with a different rowCount:
        const imrLast = ctxWith([
            rowDeltaWrite('MJ: User Settings|_|_|-1|0|_|_|conn', removalOf(SAVED_ID, 3)),
            rowDeltaWrite('MJ: User Settings|_|_|-1|0|_|_|imr:1|conn', removalOf(SAVED_ID, 99))
        ]);
        const picked = LastRowDeltaMatching(imrLast, isPlainRemovalOfSaved, 'S34 removal');
        expect(picked.payload.rowCount).toBe(3);
        expect(picked.key).toBe('MJ: User Settings|_|_|-1|0|_|_|conn');
    });

    it('ignores writes about a different record', () => {
        const ctx = ctxWith([
            rowDeltaWrite('MJ: User Settings|||||', removalOf(OTHER_ID)),
            rowDeltaWrite('MJ: User Settings|||||', removalOf(SAVED_ID))
        ]);

        expect(LastRowDeltaMatching(ctx, isPlainRemovalOfSaved, 'S34 removal').payload.deletedPrimaryKeys).toEqual([{ ID: SAVED_ID }]);
    });

    it('selects the upsert phase by payload and slot key', () => {
        const ctx = ctxWith([
            rowDeltaWrite('MJ: User Settings|||||', upsertOf(SAVED_ID, 4)),
            rowDeltaWrite('MJ: User Settings||||imr:1|', upsertOf(SAVED_ID, 99)),
            rowDeltaWrite('MJ: User Settings|||||', removalOf(SAVED_ID, 3))
        ]);

        const selected = LastRowDeltaMatching(ctx, isPlainUpsertOfSaved, 'S34 upsert');
        expect(selected.payload.upsertedRows).toEqual([{ ID: SAVED_ID, Setting: 'x' }]);
        expect(selected.payload.rowCount).toBe(4);
    });

    it('fails the check, naming the counts, when nothing carried the expected row on the plain slot', () => {
        const ctx = ctxWith([
            rowDeltaWrite('MJ: User Settings|||||', removalOf(OTHER_ID)),
            rowDeltaWrite('MJ: User Settings||||imr:1|', removalOf(SAVED_ID, 99))
        ]);

        expect(() => LastRowDeltaMatching(ctx, isPlainRemovalOfSaved, 'S34 removal'))
            .toThrow(/S34 removal: no row_delta write carried the expected row.*2 row_delta write\(s\) out of 2 write\(s\)/s);
    });
});

describe('WaitForRowDeltaQuiet', () => {
    it('waits for a late write instead of returning on the first one, while still picking the plain slot', async () => {
        const plain = rowDeltaWrite('MJ: User Settings|_|_|-1|0|_|_', upsertOf(SAVED_ID, 4));
        const lateImr = rowDeltaWrite('MJ: User Settings|_|_|-1|0|_|_|imr:1', upsertOf(SAVED_ID, 99));
        const writes: RecordedWrite[] = [plain];
        const ctx = ctxWith(writes);
        setTimeout(() => writes.push(lateImr), 60);

        await WaitForRowDeltaQuiet(ctx, 100, 2000);

        expect(writes).toHaveLength(2);
        const selected = LastRowDeltaMatching(ctx, isPlainUpsertOfSaved, 'S34 upsert');
        expect(selected.payload.rowCount).toBe(4);
        expect(selected.key).toBe(plain.Key);
    });

    it('returns once the stream is quiet', async () => {
        const ctx = ctxWith([rowDeltaWrite('MJ: User Settings|||||', upsertOf(SAVED_ID))]);
        const startedAt = Date.now();

        await WaitForRowDeltaQuiet(ctx, 100, 2000);

        expect(Date.now() - startedAt).toBeLessThan(1500);
    });

    it('gives up at the timeout when no write ever arrives, leaving the selector to report it', async () => {
        const ctx = ctxWith([]);

        await WaitForRowDeltaQuiet(ctx, 50, 150);

        expect(() => LastRowDeltaMatching(ctx, isPlainRemovalOfSaved, 'S34 removal')).toThrow(/no row_delta write carried the expected row/);
    });
});

describe('WritesForEntityFilter (S32/S33 key-scoped write counts, #6537)', () => {
    it('ignores background writes on unrelated entities and sibling filters', () => {
        const filterOptedOut = "(Name IS NOT NULL OR 's33a'='s33a')";
        const filterDefault = "(Name IS NOT NULL OR 's33b'='s33b')";
        const ctx = ctxWith([
            // Late background write from an earlier mutation check (the 2026-11-12 S32 failure):
            cacheFillWrite('MJ: Queries|_|_|-1|0|_|_|imr:1|conn'),
            // Registry persistence in another category:
            cacheFillWrite('__registry__', 'LocalCacheRegistry'),
            // S33b's default index populating its superset slot:
            cacheFillWrite(`MJ: Entities|${filterDefault}|_|-1|0|_|_|conn`)
        ]);

        expect(WritesForEntityFilter(ctx, 'MJ: Entities', filterOptedOut)).toHaveLength(0);
        expect(WritesForEntityFilter(ctx, 'MJ: Entities', filterDefault)).toHaveLength(1);
    });
});
