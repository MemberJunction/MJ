/**
 * Tests for the policy that picks which cameras and screens the model sees: the ranking (screens newest first, the
 * active speaker's camera after the onset, the camera being read, the last speaker's, room order), the dwell that keeps
 * a camera against another camera, one source per person and kind, the stream count, and when a delayed change falls due.
 */
import { describe, it, expect } from 'vitest';
import {
    ChooseVideoSources,
    NextVideoSpeakerLeader,
    type VideoSourceCandidate,
    type VideoSourcePolicyInput,
    type VideoSourceSelection,
} from '../video-source-policy';

const ONSET = 1500;
const HOLD = 4000;

/** A camera candidate; `order` is its place in room order. */
function camera(owner: string, order: number, key = `${owner}/cam`): VideoSourceCandidate {
    return { Key: key, OwnerIdentity: owner, Kind: 'camera', ShareOrder: 0, RoomOrder: order };
}

/** A screen candidate; `shareOrder` says how recently it was shared (higher is newer). */
function screen(owner: string, order: number, shareOrder: number, key = `${owner}/screen`): VideoSourceCandidate {
    return { Key: key, OwnerIdentity: owner, Kind: 'screen', ShareOrder: shareOrder, RoomOrder: order };
}

function reading(key: string, kind: 'camera' | 'screen', firstFrameAtMs?: number): VideoSourceSelection {
    return { Key: key, Kind: kind, FirstFrameAtMs: firstFrameAtMs };
}

/** An input at t = 10 s with one stream, no one speaking and nothing read, overridden per case. */
function input(overrides: Partial<VideoSourcePolicyInput>): VideoSourcePolicyInput {
    return {
        Candidates: [],
        Selected: [],
        LastSpokeAtMs: new Map(),
        NowMs: 10_000,
        Streams: 1,
        OnsetMs: ONSET,
        HoldMs: HOLD,
        ...overrides,
    };
}

const picksOf = (i: VideoSourcePolicyInput): string[] => ChooseVideoSources(i).Picks.map((p) => `${p.Key} (${p.Reason})`);

describe('ChooseVideoSources: the ranking', () => {
    const ada = camera('ada', 0);
    const bob = camera('bob', 1);
    const cy = camera('cy', 2);

    it.each<[string, Partial<VideoSourcePolicyInput>, string[]]>([
        ['nothing to read', {}, []],
        ['the first camera in room order when nothing is read and nobody spoke', { Candidates: [bob, ada] }, ['ada/cam (room-order)']],
        ['a shared screen before any camera', { Candidates: [ada, bob, screen('cy', 2, 1)] }, ['cy/screen (screen)']],
        [
            'the newest share before an older one',
            { Candidates: [screen('ada', 0, 1), screen('bob', 1, 2)] },
            ['bob/screen (screen)'],
        ],
        [
            'a share before the active speaker who has led for the onset',
            { Candidates: [ada, bob, screen('cy', 2, 1)], Leader: { Identity: 'bob', SinceMs: 0 } },
            ['cy/screen (screen)'],
        ],
        [
            "the active speaker's camera once they have led for the onset",
            { Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 0)], Leader: { Identity: 'bob', SinceMs: 10_000 - ONSET } },
            ['bob/cam (speaker)'],
        ],
        [
            'the camera being read while the speaker has not led for the onset yet',
            { Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 0)], Leader: { Identity: 'bob', SinceMs: 10_000 - ONSET + 1 } },
            ['ada/cam (kept)'],
        ],
        [
            'the camera being read over room order and over who spoke last',
            { Candidates: [ada, bob, cy], Selected: [reading('cy/cam', 'camera', 0)], LastSpokeAtMs: new Map([['bob', 9_000]]) },
            ['cy/cam (kept)'],
        ],
        [
            'the camera of whoever spoke last when nothing is read',
            { Candidates: [ada, bob, cy], LastSpokeAtMs: new Map([['bob', 8_000], ['cy', 9_000]]) },
            ['cy/cam (last-speaker)'],
        ],
    ])('picks %s', (_label, overrides, expected) => {
        expect(picksOf(input(overrides))).toEqual(expected);
    });

    it('does not let the active speaker who has no camera to read move the view', () => {
        const i = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 0)], Leader: undefined, LastSpokeAtMs: new Map([['zed', 9_000]]) });
        expect(picksOf(i)).toEqual(['ada/cam (kept)']);
    });

    it('reads nothing when the model takes no stream', () => {
        expect(picksOf(input({ Candidates: [ada, screen('bob', 1, 1)], Streams: 0 }))).toEqual([]);
    });
});

describe('ChooseVideoSources: the dwell', () => {
    const ada = camera('ada', 0);
    const bob = camera('bob', 1);
    const bobLeads = { Identity: 'bob', SinceMs: 0 };

    it('keeps a camera for the dwell from its first frame against the speaker who has led long enough', () => {
        const held = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 10_000 - HOLD + 1)], Leader: bobLeads });
        const result = ChooseVideoSources(held);
        expect(result.Picks).toEqual([{ Key: 'ada/cam', Reason: 'kept' }]);
        expect(result.UnheldPicks).toEqual([{ Key: 'bob/cam', Reason: 'speaker' }]);
        expect(result.NextChangeAtMs).toBe(10_000 + 1);

        const over = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 10_000 - HOLD)], Leader: bobLeads });
        expect(picksOf(over)).toEqual(['bob/cam (speaker)']);
    });

    it('does not hold a camera whose first frame has not reached the model', () => {
        const waiting = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', undefined)], Leader: bobLeads });
        expect(picksOf(waiting)).toEqual(['bob/cam (speaker)']);
        expect(ChooseVideoSources(waiting).NextChangeAtMs).toBeUndefined();
    });

    it('never holds a camera against a shared screen', () => {
        const share = input({ Candidates: [ada, screen('bob', 1, 1)], Selected: [reading('ada/cam', 'camera', 9_999)] });
        expect(picksOf(share)).toEqual(['bob/screen (screen)']);
        expect(ChooseVideoSources(share).NextChangeAtMs).toBeUndefined();
    });

    it('holds nothing for a camera that can no longer be read', () => {
        const gone = input({ Candidates: [bob], Selected: [reading('ada/cam', 'camera', 9_999)], Leader: bobLeads });
        expect(picksOf(gone)).toEqual(['bob/cam (speaker)']);
    });

    it('with two streams, a dwelling camera displaces the lowest-ranked camera pick, never a screen', () => {
        const cy = camera('cy', 2);
        const i = input({
            Candidates: [ada, bob, cy, screen('dee', 3, 1)],
            Selected: [reading('dee/screen', 'screen', 9_000), reading('ada/cam', 'camera', 9_000)],
            Leader: bobLeads,
            Streams: 2,
        });
        expect(picksOf(i)).toEqual(['dee/screen (screen)', 'ada/cam (kept)']);
    });
});

describe('ChooseVideoSources: when a delayed change falls due', () => {
    const ada = camera('ada', 0);
    const bob = camera('bob', 1);

    it('is when the onset ends, while the speaker has not led long enough', () => {
        const i = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 0)], Leader: { Identity: 'bob', SinceMs: 9_000 } });
        const result = ChooseVideoSources(i);
        expect(result.Picks.map((p) => p.Key)).toEqual(['ada/cam']);
        expect(result.NextChangeAtMs).toBe(9_000 + ONSET);
    });

    it('is the earlier of the onset and the dwell', () => {
        const i = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 9_800)], Leader: { Identity: 'bob', SinceMs: 9_900 } });
        expect(ChooseVideoSources(i).NextChangeAtMs).toBe(9_900 + ONSET);
        const dwellFirst = input({ Candidates: [ada, bob], Selected: [reading('ada/cam', 'camera', 6_500)], Leader: { Identity: 'bob', SinceMs: 9_900 } });
        expect(ChooseVideoSources(dwellFirst).NextChangeAtMs).toBe(6_500 + HOLD);
    });

    it('is absent when the hold delays nothing', () => {
        const i = input({ Candidates: [ada, bob], Selected: [reading('bob/cam', 'camera', 9_000)], Leader: { Identity: 'bob', SinceMs: 9_900 } });
        expect(ChooseVideoSources(i).NextChangeAtMs).toBeUndefined();
        expect(ChooseVideoSources(input({ Candidates: [ada] })).NextChangeAtMs).toBeUndefined();
    });
});

describe('ChooseVideoSources: one source per person and kind', () => {
    it('reads one camera per person (the first in room order), and fills the next stream with someone else', () => {
        const i = input({ Candidates: [camera('ada', 0, 'ada/cam1'), camera('ada', 1, 'ada/cam2'), camera('bob', 2)], Streams: 2 });
        expect(picksOf(i)).toEqual(['ada/cam1 (room-order)', 'bob/cam (room-order)']);
    });

    it("keeps the person's camera being read over their other camera", () => {
        const i = input({ Candidates: [camera('ada', 0, 'ada/cam1'), camera('ada', 1, 'ada/cam2')], Selected: [reading('ada/cam2', 'camera', 0)] });
        expect(picksOf(i)).toEqual(['ada/cam2 (kept)']);
    });

    it("reads a person's newest screen only", () => {
        const i = input({ Candidates: [screen('ada', 0, 1, 'ada/s1'), screen('ada', 1, 2, 'ada/s2')], Streams: 2 });
        expect(picksOf(i)).toEqual(['ada/s2 (screen)']);
    });

    it('with two streams, a share and the speaker camera are read together', () => {
        const i = input({ Candidates: [camera('ada', 0), camera('bob', 1), screen('cy', 2, 1)], Leader: { Identity: 'bob', SinceMs: 0 }, Streams: 2 });
        expect(picksOf(i)).toEqual(['cy/screen (screen)', 'bob/cam (speaker)']);
    });
});

describe('NextVideoSpeakerLeader', () => {
    const owners = new Set(['ada', 'bob']);

    it('is the first person in the list whose camera can be read', () => {
        expect(NextVideoSpeakerLeader(undefined, ['zed', 'bob', 'ada'], owners, 100)).toEqual({ Identity: 'bob', SinceMs: 100 });
    });

    it('keeps the start time while the same person leads, and restarts it for anyone else', () => {
        const bob = { Identity: 'bob', SinceMs: 100 };
        expect(NextVideoSpeakerLeader(bob, ['bob'], owners, 900)).toBe(bob);
        expect(NextVideoSpeakerLeader(bob, ['ada', 'bob'], owners, 900)).toEqual({ Identity: 'ada', SinceMs: 900 });
    });

    it('is nobody when no one in the list has a camera to read', () => {
        expect(NextVideoSpeakerLeader({ Identity: 'bob', SinceMs: 100 }, ['zed'], owners, 900)).toBeUndefined();
        expect(NextVideoSpeakerLeader(undefined, [], owners, 900)).toBeUndefined();
    });
});
