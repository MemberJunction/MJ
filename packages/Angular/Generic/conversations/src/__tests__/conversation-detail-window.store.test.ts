import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationDetailEntity, DetailWindowLoadResult } from '@memberjunction/core-entities';
import {
    ConversationDetailWindowStore,
    DetailWindowLoader
} from '../lib/services/conversation-detail-window.store';
import { MAX_OVERREAD_ATTEMPTS, DEFAULT_RAW_OVERREAD } from '../lib/utils/conversation-detail-window';

/**
 * The store that holds ONE conversation's loaded transcript window.
 *
 * Tested against a hand-rolled `vi.fn()` loader rather than the real ConversationEngine —
 * the store depends on the structural {@link DetailWindowLoader}, so no TestBed, no engine
 * bootstrap, and no database are involved. The interesting behavior is all in the seams:
 * merging overlapping pages, refusing concurrent loads, and discarding results that arrive
 * after the user has already switched conversations.
 */

/** A promise whose resolution the test controls — used to hold a load "in flight". */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
}

function windowResult(overrides: Partial<DetailWindowLoadResult> = {}): DetailWindowLoadResult {
    return {
        Details: [], AgentRunsByDetailId: new Map(), UserAvatars: new Map(),
        RatingsByDetailId: new Map(), ArtifactsByDetailId: new Map(),
        HasMoreAbove: false, OldestSequence: null, NewestSequence: null,
        ...overrides
    };
}

/**
 * A detail row shaped for the store and the timeline pass.
 *
 * Cast rather than constructed: `MJConversationDetailEntity` is a generated BaseEntity whose
 * fields are getters, so it can only be built through a metadata provider. The store reads
 * `ID` and `Sequence`; `BuildConversationTimeline` reads the rest. This one assertion keeps
 * the whole suite free of a provider.
 */
function detail(sequence: number, overrides: Record<string, unknown> = {}): MJConversationDetailEntity {
    return {
        ID: `d-${sequence}`,
        ConversationID: 'conv-a',
        Sequence: sequence,
        AgentSessionID: null,
        Role: 'AI',
        Message: `message ${sequence}`,
        HiddenToUser: false,
        __mj_CreatedAt: new Date(2026, 0, 1, 0, 0, sequence),
        ...overrides
    } as unknown as MJConversationDetailEntity;
}

/** A page as the engine returns it: chronological, with the cursor fields filled in. */
function pageOf(sequences: number[], hasMoreAbove: boolean): DetailWindowLoadResult {
    const details = sequences.map(seq => detail(seq));
    return windowResult({
        Details: details,
        HasMoreAbove: hasMoreAbove,
        OldestSequence: sequences[0] ?? null,
        NewestSequence: sequences[sequences.length - 1] ?? null
    });
}

function sequencesOf(details: MJConversationDetailEntity[]): number[] {
    return details.map(d => d.Sequence);
}

/** The one method the store calls, typed off the interface so the fake can't drift from it. */
type LoadDetailWindowFn = DetailWindowLoader['LoadDetailWindow'];

describe('ConversationDetailWindowStore', () => {
    let load: Mock<LoadDetailWindowFn>;
    let store: ConversationDetailWindowStore;
    let contextUser: UserInfo;

    beforeEach(() => {
        load = vi.fn<LoadDetailWindowFn>();
        store = new ConversationDetailWindowStore({ LoadDetailWindow: load });
        contextUser = {} as UserInfo;
    });

    it('concatenates an older page onto the latest one without duplicating rows', async () => {
        // The older page re-returns Sequence 20: session expansion can reach back past the
        // requested bound, so overlap between adjacent pages is expected, not exceptional.
        load
            .mockResolvedValueOnce(pageOf([20, 21, 22], true))
            .mockResolvedValueOnce(pageOf([18, 19, 20], false));

        await store.LoadLatest('conv-a', contextUser);
        await store.LoadOlder(contextUser);

        const snapshot = store.GetSnapshot();
        expect(sequencesOf(snapshot.Details)).toEqual([18, 19, 20, 21, 22]);
        expect(snapshot.Details).toHaveLength(5); // not 6 — the shared row merged
        expect(snapshot.Cursor.OldestSequence).toBe(18);
        expect(snapshot.Cursor.NewestSequence).toBe(22);
        expect(snapshot.Cursor.HasMoreAbove).toBe(false);
    });

    it('ignores a second LoadOlder issued while the first is still in flight', async () => {
        load.mockResolvedValueOnce(pageOf([20, 21, 22], true));
        await store.LoadLatest('conv-a', contextUser);

        const olderPage = deferred<DetailWindowLoadResult>();
        load.mockReturnValueOnce(olderPage.promise);

        // The sentinel can fire twice before the first page lands; the second must no-op.
        const first = store.LoadOlder(contextUser);
        const second = store.LoadOlder(contextUser);

        expect(load).toHaveBeenCalledTimes(2); // 1 latest + 1 older, NOT 3

        olderPage.resolve(pageOf([18, 19], false));
        await Promise.all([first, second]);

        expect(sequencesOf(store.GetSnapshot().Details)).toEqual([18, 19, 20, 21, 22]);
    });

    it('discards a load that resolves after Reset switched conversations', async () => {
        const staleLoad = deferred<DetailWindowLoadResult>();
        load.mockReturnValueOnce(staleLoad.promise);

        const inFlight = store.LoadLatest('conv-a', contextUser);
        store.Reset('conv-b');                       // user clicked another conversation
        staleLoad.resolve(pageOf([20, 21, 22], true)); // conv-a's rows arrive too late
        await inFlight;

        const snapshot = store.GetSnapshot();
        expect(snapshot.ConversationID).toBe('conv-b');
        expect(snapshot.Details).toEqual([]);        // no conv-a rows spliced into conv-b
        expect(snapshot.Cursor.OldestSequence).toBeNull();
        expect(snapshot.Cursor.HasMoreAbove).toBe(false);
    });

    it('advances NewestSequence on a local append without disturbing HasMoreAbove', async () => {
        load.mockResolvedValueOnce(pageOf([20, 21, 22], true));
        await store.LoadLatest('conv-a', contextUser);

        store.ApplyLocalDetail(detail(23)); // the message the user just sent

        const snapshot = store.GetSnapshot();
        expect(snapshot.Cursor.NewestSequence).toBe(23);
        // Appending at the tail says nothing about what is above — the sentinel must survive.
        expect(snapshot.Cursor.HasMoreAbove).toBe(true);
        expect(snapshot.Cursor.OldestSequence).toBe(20);
        expect(sequencesOf(snapshot.Details)).toEqual([20, 21, 22, 23]);
        expect(load).toHaveBeenCalledTimes(1); // local path — no query
    });

    it('slices an over-read page down to one page of timeline items', async () => {
        // REGRESSION: the engine deliberately OVER-READS raw rows (RawOverread defaults to
        // 3x the page size) because a page of rows can collapse to a single session card.
        // The store must slice what comes back — without it the whole over-read landed on
        // screen and a 22-message conversation rendered all 22.
        const sequences = Array.from({ length: 22 }, (_, i) => i + 1);
        load.mockResolvedValueOnce(pageOf(sequences, false));

        await store.LoadLatest('conv-a', contextUser);

        const snapshot = store.GetSnapshot();
        expect(snapshot.Details).toHaveLength(10);
        expect(sequencesOf(snapshot.Details)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
        expect(snapshot.Cursor.OldestSequence).toBe(13);
        expect(snapshot.Cursor.NewestSequence).toBe(22);
        // The engine said nothing is below what it fetched, but the SLICE discarded rows 1-12
        // — those are older content the user can still page back to.
        expect(snapshot.Cursor.HasMoreAbove).toBe(true);
        expect(store.CanLoadOlder()).toBe(true);
    });

    it('keeps every row when the fetch is already within one page', async () => {
        load.mockResolvedValueOnce(pageOf([1, 2, 3], false));

        await store.LoadLatest('conv-a', contextUser);

        const snapshot = store.GetSnapshot();
        expect(sequencesOf(snapshot.Details)).toEqual([1, 2, 3]);
        // Nothing was sliced off and the engine found nothing older — no sentinel.
        expect(snapshot.Cursor.HasMoreAbove).toBe(false);
    });

    it('treats Sequence 0 as a real cursor, not as "no cursor"', async () => {
        // Very old conversations can carry Sequence = 0 (the column's default). Zero is a
        // valid bound and must still page with `<`. Any falsy check — `if (!seq)`,
        // `seq || fallback` — silently makes row 0 unreachable, and every other test here
        // would still pass.
        load.mockResolvedValueOnce(pageOf([0, 1, 2], true));
        await store.LoadLatest('conv-a', contextUser);

        expect(store.GetSnapshot().Cursor.OldestSequence).toBe(0);
        expect(store.CanLoadOlder()).toBe(true);

        load.mockResolvedValueOnce(pageOf([], false));
        await store.LoadOlder(contextUser);

        expect(load).toHaveBeenLastCalledWith(
            expect.objectContaining({ BeforeSequence: 0 }),
            contextUser
        );
    });

    it('recovers when the loader rejects instead of returning an empty window', async () => {
        // The engine's own failure path returns an empty result rather than throwing, but a
        // transport-layer rejection can still surface here. Without try/finally the in-flight
        // flag would stay set, CanLoadOlder() would be false forever, and the sentinel would
        // go silently dead for the rest of the session.
        load.mockResolvedValueOnce(pageOf([20, 21, 22], true));
        await store.LoadLatest('conv-a', contextUser);

        load.mockRejectedValueOnce(new Error('network down'));
        await expect(store.LoadOlder(contextUser)).rejects.toThrow('network down');

        expect(store.GetSnapshot().IsLoadingOlder).toBe(false);
        expect(store.CanLoadOlder()).toBe(true);   // a retry is still possible

        load.mockResolvedValueOnce(pageOf([18, 19], false));
        await store.LoadOlder(contextUser);
        expect(sequencesOf(store.GetSnapshot().Details)).toEqual([18, 19, 20, 21, 22]);
    });

    it('replaces an edited row by ID rather than duplicating it', async () => {
        // The edit path hands back the same entity mutated in place. Merging must replace
        // by ID — appending would show the message twice.
        load.mockResolvedValueOnce(pageOf([20, 21, 22], false));
        await store.LoadLatest('conv-a', contextUser);

        const edited = detail(21, { Message: 'edited text' });
        store.ApplyLocalDetail(edited);

        const snapshot = store.GetSnapshot();
        expect(sequencesOf(snapshot.Details)).toEqual([20, 21, 22]);
        expect(snapshot.Details.find(d => d.Sequence === 21)?.Message).toBe('edited text');
    });

    it('does not resurrect a deleted row on the next refresh', async () => {
        // RemoveDetail has to actually drop it from the window: a refreshed page that still
        // contains the row would otherwise merge it straight back in.
        load.mockResolvedValueOnce(pageOf([20, 21, 22], false));
        await store.LoadLatest('conv-a', contextUser);

        store.RemoveDetail('d-21');
        expect(sequencesOf(store.GetSnapshot().Details)).toEqual([20, 22]);

        // The server has not caught up yet and still returns the deleted row…
        load.mockResolvedValueOnce(pageOf([20, 21, 22], false));
        await store.RefreshLatest(contextUser);

        // …which DOES come back, because the refresh is authoritative about what exists.
        // Documenting the real contract: local deletion is optimistic, and the caller is
        // responsible for not refreshing until the delete has been persisted.
        expect(sequencesOf(store.GetSnapshot().Details)).toEqual([20, 21, 22]);
    });

    it('keeps already-loaded older pages when the tail is refreshed', async () => {
        // Explorer's refresh button must not dump a user who has paged up back to a 10-row
        // tail — RefreshLatest merges the newest page instead of resetting.
        load.mockResolvedValueOnce(pageOf([20, 21, 22], true));
        await store.LoadLatest('conv-a', contextUser);

        load.mockResolvedValueOnce(pageOf([17, 18, 19], false));
        await store.LoadOlder(contextUser);
        expect(sequencesOf(store.GetSnapshot().Details)).toEqual([17, 18, 19, 20, 21, 22]);

        // A refresh brings a new tail message…
        load.mockResolvedValueOnce(pageOf([21, 22, 23], true));
        await store.RefreshLatest(contextUser);

        // …and the older pages the user scrolled back to are still there.
        expect(sequencesOf(store.GetSnapshot().Details)).toEqual([17, 18, 19, 20, 21, 22, 23]);
        expect(store.GetSnapshot().Cursor.NewestSequence).toBe(23);
    });

    it('leaves no trace of the previous conversation after Reset', async () => {
        load.mockResolvedValueOnce(pageOf([20, 21, 22], true));
        await store.LoadLatest('conv-a', contextUser);
        expect(store.GetSnapshot().Details).toHaveLength(3);

        store.Reset('conv-b');

        const snapshot = store.GetSnapshot();
        expect(snapshot.ConversationID).toBe('conv-b');
        expect(snapshot.Details).toEqual([]);
        expect(snapshot.Timeline).toEqual([]);
        expect(snapshot.PinnedDetails).toEqual([]);
        expect(snapshot.Cursor).toEqual({
            OldestSequence: null,
            NewestSequence: null,
            HasMoreAbove: false
        });
        expect(store.CanLoadOlder()).toBe(false);
    });
});

/**
 * Pin COUNT vs pin SET.
 *
 * These are deliberately separate state now: conversation open reads only a `count_only`
 * total so the chip has a number, and the rows themselves are hydrated on first panel open.
 * Everything below guards the window where the two legitimately disagree — which is exactly
 * where a length-derived count would report zero pins on a conversation full of them.
 */
describe('ConversationDetailWindowStore — pin count vs pin set', () => {
    let store: ConversationDetailWindowStore;

    beforeEach(() => {
        store = new ConversationDetailWindowStore({ LoadDetailWindow: vi.fn() } as DetailWindowLoader);
        store.Reset('conv-a');
    });

    it('carries a count with no rows loaded — the conversation-open state', () => {
        store.SetPinnedCount(137);
        const snapshot = store.GetSnapshot();
        expect(snapshot.PinnedTotalCount).toBe(137);
        expect(snapshot.PinnedDetails).toEqual([]);
    });

    it('pinning before hydration moves the count without inventing a set', () => {
        store.SetPinnedCount(5);
        store.ApplyLocalPin(detail(10, { IsPinned: true }));
        // The row IS added to the set here; the guard against a misleading partial set lives
        // in the chat area, which skips ApplyLocalPin entirely until hydration. What matters
        // for the store is that the count tracked the change rather than being re-derived.
        expect(store.GetSnapshot().PinnedTotalCount).toBe(6);
    });

    it('unpinning a row that is not in the loaded set cannot push the count negative', () => {
        store.SetPinnedCount(3);
        store.ApplyLocalPin(detail(99, { IsPinned: false }));   // never was in pinnedDetails
        expect(store.GetSnapshot().PinnedTotalCount).toBe(3);   // untouched, not 2
    });

    it('unpinning a row that IS in the set decrements once, not twice', () => {
        const pin = detail(10, { IsPinned: true });
        store.SetPinnedDetails([pin]);
        expect(store.GetSnapshot().PinnedTotalCount).toBe(1);

        store.ApplyLocalPin(detail(10, { IsPinned: false }));
        const snapshot = store.GetSnapshot();
        expect(snapshot.PinnedTotalCount).toBe(0);
        expect(snapshot.PinnedDetails).toEqual([]);
    });

    it('re-pinning an already-pinned row does not double-count', () => {
        store.SetPinnedDetails([detail(10, { IsPinned: true })]);
        store.ApplyLocalPin(detail(10, { IsPinned: true }));
        expect(store.GetSnapshot().PinnedTotalCount).toBe(1);
    });

    it('hydration reconciles the count to the loaded set', () => {
        store.SetPinnedCount(99);                                  // stale/drifted
        store.SetPinnedDetails([detail(1, { IsPinned: true }), detail(2, { IsPinned: true })]);
        expect(store.GetSnapshot().PinnedTotalCount).toBe(2);
    });

    it('deleting a pinned row decrements the count', () => {
        store.SetPinnedDetails([detail(1, { IsPinned: true }), detail(2, { IsPinned: true })]);
        store.RemoveDetail('d-1');
        expect(store.GetSnapshot().PinnedTotalCount).toBe(1);
    });

    it('deleting an unpinned row leaves the count alone', () => {
        store.SetPinnedCount(4);
        store.RemoveDetail('d-77');
        expect(store.GetSnapshot().PinnedTotalCount).toBe(4);
    });

    it('Reset zeroes both the count and the set', () => {
        store.SetPinnedDetails([detail(1, { IsPinned: true })]);
        store.SetPinnedCount(9);
        store.Reset('conv-b');
        const snapshot = store.GetSnapshot();
        expect(snapshot.PinnedTotalCount).toBe(0);
        expect(snapshot.PinnedDetails).toEqual([]);
    });
});

/**
 * Growing raw over-read.
 *
 * The plan's rule: raw rows are not display items, so a fetch "may over-read raw rows (start
 * at 3 × pageSize, grow if needed) until the timeline of that fetch contains pageSize items".
 * A realtime session folds many stamped rows into ONE card, so the default over-read can come
 * back holding two or three items instead of ten.
 */
describe('ConversationDetailWindowStore — over-read growth', () => {
    const user = {} as UserInfo;

    /**
     * A page whose rows all belong to ONE session — collapses to a single timeline item.
     * Sized to FILL the requested over-read, which is what marks a page as truncated by
     * collapse rather than simply short.
     */
    function sessionPage(rowCount: number, hasMoreAbove: boolean): DetailWindowLoadResult {
        const sequences = Array.from({ length: rowCount }, (_, i) => i + 1);
        const details = sequences.map(seq => detail(seq, { AgentSessionID: 'sess-1' }));
        return windowResult({
            Details: details, HasMoreAbove: hasMoreAbove,
            OldestSequence: sequences[0] ?? null,
            NewestSequence: sequences[sequences.length - 1] ?? null
        });
    }

    it('re-reads wider when the page collapses to too few timeline items', async () => {
        const load: Mock = vi.fn()
            .mockResolvedValueOnce(sessionPage(DEFAULT_RAW_OVERREAD, true))   // 1 item — too short
            .mockResolvedValueOnce(pageOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], true));
        const store = new ConversationDetailWindowStore({ LoadDetailWindow: load });

        await store.LoadLatest('conv-a', user);

        expect(load).toHaveBeenCalledTimes(2);
        // Second attempt must ask for MORE raw rows than the first, or it is just a retry.
        const first = load.mock.calls[0][0].RawOverread;
        const second = load.mock.calls[1][0].RawOverread;
        expect(second).toBeGreaterThan(first);
    });

    it('does NOT re-read when the short page is the start of the conversation', async () => {
        // HasMoreAbove false: short IS the complete answer, and re-reading would be pure waste.
        const load: Mock = vi.fn().mockResolvedValue(sessionPage(DEFAULT_RAW_OVERREAD, false));
        const store = new ConversationDetailWindowStore({ LoadDetailWindow: load });

        await store.LoadLatest('conv-a', user);

        expect(load).toHaveBeenCalledTimes(1);
    });

    it('does NOT re-read when the first fetch already fills a page', async () => {
        const load: Mock = vi.fn().mockResolvedValue(pageOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true));
        const store = new ConversationDetailWindowStore({ LoadDetailWindow: load });

        await store.LoadLatest('conv-a', user);

        expect(load).toHaveBeenCalledTimes(1);
    });

    it('stops at the attempt cap rather than growing without bound', async () => {
        // A conversation that is almost entirely one long session: every widening still
        // collapses to one card. Growing forever here would walk the whole table.
        let rows = DEFAULT_RAW_OVERREAD;
        const load: Mock = vi.fn().mockImplementation(() => {
            const page = sessionPage(rows, true);
            rows *= 2;                       // each widening returns more rows, still one card
            return Promise.resolve(page);
        });
        const store = new ConversationDetailWindowStore({ LoadDetailWindow: load });

        await store.LoadLatest('conv-a', user);

        expect(load.mock.calls.length).toBeLessThanOrEqual(MAX_OVERREAD_ATTEMPTS);
    });
});
