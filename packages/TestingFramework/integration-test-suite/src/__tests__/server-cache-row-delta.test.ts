/**
 * Pins the write-selection rule S34 depends on — the regression guard for #6537.
 *
 * S34 asserts two things about one `MJ: User Settings` save/delete pair: the save broadcasts a
 * compact `row_delta` upsert, and the delete broadcasts a `row_delta` removal that upserts nothing.
 * One save maintains more than one cache slot and issues those writes in the background,
 * fire-and-forget, so the ORDER they are recorded in is not the order the phases happened. Picking
 * "the most recent row_delta write" therefore read a save's late upsert as the delete's removal and
 * failed with `a delete upserts nothing — expected 0, got 1`, every night the mutation tier ran.
 *
 * These tests drive the selector over hand-built write records, so they prove the rule without a
 * database: the interleaving that broke S34 is reproduced directly.
 */
import { describe, it, expect } from 'vitest';
import type { CacheRowDeltaPayload } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { LastRowDeltaMatching, WaitForRowDeltaQuiet } from '../checks/server-cache.checks';

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

/** A recorded write as the instrumented provider shapes it: only `Options.pubSubData` is read here. */
function write(key: string, p: CacheRowDeltaPayload) {
    return { Key: key, Category: 'RunViewCache', Options: { pubSubAction: 'row_delta', pubSubData: JSON.stringify(p) } };
}

/** A context whose Storage replays a fixed list of recorded `row_delta` writes. */
function ctxWith(writes: ReturnType<typeof write>[]): IntegrationCheckContext {
    return {
        Storage: {
            RowDeltaWrites: () => writes,
            Writes: writes
        }
    } as unknown as IntegrationCheckContext;
}

/** The predicates S34 uses, over the saved record's key. */
const isUpsertOfSaved = (p: CacheRowDeltaPayload) => p.upsertedRows.some(r => r['ID'] === SAVED_ID);
const isRemovalOfSaved = (p: CacheRowDeltaPayload) => p.deletedPrimaryKeys.some(k => k['ID'] === SAVED_ID);

describe('LastRowDeltaMatching (S34 write selection, #6537)', () => {
    it('does NOT return a late upsert when the removal is what was asked for — the #6537 failure', () => {
        // The interleaving that failed: the delete's removal is recorded, then the save's second,
        // late slot write lands after it. "The last row_delta write" is the upsert, which is why
        // AssertRemovalDelta reported `a delete upserts nothing — expected 0, got 1`.
        const ctx = ctxWith([
            write('MJ: User Settings|||||', removalOf(SAVED_ID)),
            write('MJ: User Settings||||imr:1|', upsertOf(SAVED_ID))
        ]);

        const selected = LastRowDeltaMatching(ctx, isRemovalOfSaved, 'S34 removal');

        expect(selected.payload.upsertedRows).toEqual([]);
        expect(selected.payload.deletedPrimaryKeys).toEqual([{ ID: SAVED_ID }]);
    });

    it('returns the LAST matching write, which is the plain slot the baseline was read from', () => {
        // Both slots broadcast a removal; the plain unfiltered slot is written last and is the one
        // whose rowCount S34 compares against its own baseline.
        const ctx = ctxWith([
            write('MJ: User Settings||||imr:1|', removalOf(SAVED_ID, 99)),
            write('MJ: User Settings|||||', removalOf(SAVED_ID, 3))
        ]);

        expect(LastRowDeltaMatching(ctx, isRemovalOfSaved, 'S34 removal').payload.rowCount).toBe(3);
    });

    it('ignores writes about a different record', () => {
        const ctx = ctxWith([
            write('MJ: User Settings|||||', removalOf(OTHER_ID)),
            write('MJ: User Settings|||||', removalOf(SAVED_ID))
        ]);

        expect(LastRowDeltaMatching(ctx, isRemovalOfSaved, 'S34 removal').payload.deletedPrimaryKeys).toEqual([{ ID: SAVED_ID }]);
    });

    it('selects the upsert phase by payload too', () => {
        const ctx = ctxWith([
            write('MJ: User Settings|||||', upsertOf(SAVED_ID)),
            write('MJ: User Settings|||||', removalOf(SAVED_ID))
        ]);

        expect(LastRowDeltaMatching(ctx, isUpsertOfSaved, 'S34 upsert').payload.upsertedRows).toEqual([{ ID: SAVED_ID, Setting: 'x' }]);
    });

    it('fails the check, naming the counts, when nothing carried the expected row', () => {
        const ctx = ctxWith([write('MJ: User Settings|||||', removalOf(OTHER_ID))]);

        expect(() => LastRowDeltaMatching(ctx, isRemovalOfSaved, 'S34 removal'))
            .toThrow(/S34 removal: no row_delta write carried the expected row.*1 row_delta write\(s\) out of 1 write\(s\)/s);
    });
});

describe('WaitForRowDeltaQuiet', () => {
    it('waits for a late write instead of returning on the first one', async () => {
        // The property the old `WaitForRowDeltaWrite` lacked: it returned as soon as ONE write
        // existed, so a save's remaining slot writes were still in flight when the delete began.
        const writes = [write('MJ: User Settings|||||', upsertOf(SAVED_ID))];
        const ctx = ctxWith(writes);
        const late = write('MJ: User Settings||||imr:1|', upsertOf(SAVED_ID));
        setTimeout(() => writes.push(late), 60);

        await WaitForRowDeltaQuiet(ctx, 100, 2000);

        expect(writes).toHaveLength(2);
        expect(LastRowDeltaMatching(ctx, isUpsertOfSaved, 'S34 upsert').bytes).toBe((late.Options.pubSubData).length);
    });

    it('returns once the stream is quiet', async () => {
        const ctx = ctxWith([write('MJ: User Settings|||||', upsertOf(SAVED_ID))]);
        const startedAt = Date.now();

        await WaitForRowDeltaQuiet(ctx, 100, 2000);

        expect(Date.now() - startedAt).toBeLessThan(1500); // returned on quiet, not on the timeout
    });

    it('gives up at the timeout when no write ever arrives, leaving the selector to report it', async () => {
        const ctx = ctxWith([]);

        await WaitForRowDeltaQuiet(ctx, 50, 150);

        expect(() => LastRowDeltaMatching(ctx, isRemovalOfSaved, 'S34 removal')).toThrow(/no row_delta write carried the expected row/);
    });
});
