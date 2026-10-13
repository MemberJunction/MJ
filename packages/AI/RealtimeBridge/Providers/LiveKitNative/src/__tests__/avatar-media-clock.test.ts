import { describe, expect, it } from 'vitest';
import { AVATAR_AUDIO_WAIT_LIMIT_MS, AVATAR_IDLE_GAP_S, AvatarMediaClock } from '../avatar-media-clock';

/** The audio of a turn: `seconds` of contiguous 1024-sample frames at 24 kHz from `start`, queued from `enqueuedMs`. */
function queueAudio(clock: AvatarMediaClock, epoch: number, start: number, seconds: number, enqueuedMs: number): void {
    const frame = 1024 / 24000;
    for (let t = 0; t < seconds - 1e-9; t += frame) {
        clock.NoteAudio(epoch, start + t, frame, enqueuedMs + t * 1000);
    }
}

describe('AvatarMediaClock', () => {
    it('places a frame where the voice reaches its timestamp, honouring the video\'s start offset (Google\'s 85 ms)', () => {
        const clock = new AvatarMediaClock();
        const audioEpoch = clock.EpochFor('audio', 0);
        queueAudio(clock, audioEpoch, 0, 1, 0);
        const videoEpoch = clock.EpochFor('video', 7680 / 90000);
        expect(videoEpoch).toBe(audioEpoch);
        const timing = clock.Timing(videoEpoch, 7680 / 90000, 0);
        expect(timing.Kind).toBe('synced');
        expect(timing.Kind === 'synced' ? timing.DueAtPlayedMs : NaN).toBeCloseTo(85.333, 3);
    });

    it('counts from where the turn\'s audio entered the queue, behind audio queued before it', () => {
        const clock = new AvatarMediaClock();
        const epoch = clock.EpochFor('audio', 10);
        queueAudio(clock, epoch, 10, 1, 2500);
        const timing = clock.Timing(epoch, 10.5, 0);
        expect(timing.Kind === 'synced' ? timing.DueAtPlayedMs : NaN).toBeCloseTo(3000, 6);
    });

    it('shows frames earlier by the lead', () => {
        const clock = new AvatarMediaClock(40);
        const epoch = clock.EpochFor('audio', 0);
        queueAudio(clock, epoch, 0, 1, 0);
        const timing = clock.Timing(epoch, 0.5, 0);
        expect(timing.Kind === 'synced' ? timing.DueAtPlayedMs : NaN).toBeCloseTo(460, 6);
    });

    it('starts a new anchor when the stream\'s time jumps or other audio was queued in between', () => {
        const clock = new AvatarMediaClock();
        const epoch = clock.EpochFor('audio', 0);
        queueAudio(clock, epoch, 0, 1, 0); // 0..1 s at queue 0..1000 ms
        clock.NoteAudio(epoch, 5, 0.5, 1000); // a 4 s gap in the stream, contiguous in the queue
        clock.NoteAudio(epoch, 5.5, 0.5, 1700); // 200 ms of other audio queued before this piece
        const at = (time: number): number => {
            const t = clock.Timing(epoch, time, 0);
            return t.Kind === 'synced' ? t.DueAtPlayedMs : NaN;
        };
        expect(at(0.5)).toBeCloseTo(500, 6);
        expect(at(5.25)).toBeCloseTo(1250, 6);
        expect(at(5.75)).toBeCloseTo(1950, 6);
    });

    it('lets frames wait for audio of their epoch, then paces them without it after the wait limit', () => {
        const clock = new AvatarMediaClock();
        const epoch = clock.EpochFor('video', 0);
        expect(clock.Timing(epoch, 0, 0).Kind).toBe('waiting');
        expect(clock.Timing(epoch, 0, AVATAR_AUDIO_WAIT_LIMIT_MS).Kind).toBe('unsynced');
    });

    it('treats frames well past the last audio as idle video, and frames just past it as waiting for audio', () => {
        const clock = new AvatarMediaClock();
        const epoch = clock.EpochFor('audio', 0);
        queueAudio(clock, epoch, 0, 1, 0);
        expect(clock.Timing(epoch, 1 + AVATAR_IDLE_GAP_S / 2, 0).Kind).toBe('synced');
        expect(clock.Timing(epoch, 1 + AVATAR_IDLE_GAP_S + 0.1, 0).Kind).toBe('unsynced');
    });

    it("matches a frame only to audio of its own epoch: a new segment's frame waits for its own voice", () => {
        const clock = new AvatarMediaClock();
        const first = clock.EpochFor('audio', 0);
        queueAudio(clock, first, 0, 1, 0);
        clock.NewStream();
        const second = clock.EpochFor('video', 0.5);
        expect(second).not.toBe(first);
        expect(clock.Timing(second, 0.5, 0).Kind).toBe('waiting');
    });

    it('makes everything decoded before a barge-in stale', () => {
        const clock = new AvatarMediaClock();
        const before = clock.EpochFor('audio', 1);
        queueAudio(clock, before, 1, 0.5, 0);
        clock.Reset();
        expect(clock.IsStale(before)).toBe(true);
        expect(clock.Timing(before, 1.2, 0).Kind).toBe('stale');
        const after = clock.EpochFor('video', 1.6);
        expect(after).not.toBe(before);
        expect(clock.IsStale(after)).toBe(false);
    });

    it('starts a new segment when a track\'s time goes backwards, matching the two tracks of the new turn', () => {
        const clock = new AvatarMediaClock();
        const first = clock.EpochFor('audio', 3);
        expect(clock.EpochFor('audio', 3.1)).toBe(first);
        const second = clock.EpochFor('audio', 0);
        expect(second).not.toBe(first);
        clock.EpochFor('video', 3.05);
        expect(clock.EpochFor('video', 0.085)).toBe(second);
        expect(clock.IsStale(first)).toBe(false); // the earlier turn's tail still plays
    });

    it('moves both tracks to a new segment at a new init, and keeps what was decoded before', () => {
        const clock = new AvatarMediaClock();
        const before = clock.EpochFor('audio', 2);
        queueAudio(clock, before, 2, 0.5, 0);
        clock.NewStream();
        const audio = clock.EpochFor('audio', 2.5);
        expect(audio).not.toBe(before);
        expect(clock.EpochFor('video', 2.6)).toBe(audio);
        expect(clock.Timing(before, 2.2, 0).Kind).toBe('synced');
    });
});
