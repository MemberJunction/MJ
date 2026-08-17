import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationDetailEntity, DetailWindowLoadResult } from '@memberjunction/core-entities';
import {
    ConversationDetailWindowStore,
    DetailWindowLoader
} from '../lib/services/conversation-detail-window.store';

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
