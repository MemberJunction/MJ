/**
 * Behavioral tests for `TextInputAudioOutputTransport`.
 *
 * Covers the happy-path the demo relies on:
 *   1. Open() pushes session-start + participant-joined events.
 *   2. PushUserText() surfaces as a `user-text` ControlEvent.
 *   3. SendAudioFrame() shows up on `OutboundAudioFrames`.
 *   4. Close() is clean and idempotent.
 */
import { describe, it, expect } from 'vitest';
import type { AudioFrame } from '@memberjunction/ai';
import { TextInputAudioOutputTransport } from '../transports/TextInputAudioOutputTransport';
import type { ControlEvent } from '../frames/frame-bus';

function makeFrame(byte: number): AudioFrame {
    return {
        data: new Uint8Array([byte]),
        sampleRateHz: 16000,
        channelCount: 1,
        mediaType: 'audio/pcm',
    };
}

/**
 * Read the next yielded value off an async iterable. Times out fast so a
 * hang is a visible failure rather than a vitest timeout.
 */
async function takeNext<T>(it: AsyncIterable<T>, timeoutMs = 1000): Promise<T> {
    const iter = it[Symbol.asyncIterator]();
    const next = iter.next();
    const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`takeNext timed out after ${timeoutMs}ms`)), timeoutMs),
    );
    const result = await Promise.race([next, timer]);
    if (result.done) {
        throw new Error('iterator closed before yielding a value');
    }
    return result.value;
}

describe('TextInputAudioOutputTransport', () => {
    it('emits session-start and participant-joined events on Open', async () => {
        const t = new TextInputAudioOutputTransport({ SessionID: 's1' });
        await t.Open();

        const first = await takeNext<ControlEvent>(t.ControlEventsIn);
        const second = await takeNext<ControlEvent>(t.ControlEventsIn);
        const third = await takeNext<ControlEvent>(t.ControlEventsIn);

        expect(first).toEqual({ Kind: 'session-start' });
        expect(second).toEqual({ Kind: 'participant-joined', ParticipantID: 'user' });
        expect(third).toEqual({ Kind: 'participant-joined', ParticipantID: 'agent' });

        await t.Close();
    });

    it('surfaces PushUserText as a user-text ControlEvent', async () => {
        const t = new TextInputAudioOutputTransport({ SessionID: 's2' });
        await t.Open();

        // drain the three lifecycle events first
        await takeNext<ControlEvent>(t.ControlEventsIn);
        await takeNext<ControlEvent>(t.ControlEventsIn);
        await takeNext<ControlEvent>(t.ControlEventsIn);

        t.PushUserText('hello');
        const next = await takeNext<ControlEvent>(t.ControlEventsIn);
        expect(next).toEqual({ Kind: 'user-text', Text: 'hello' });

        await t.Close();
    });

    it('routes SendAudioFrame onto OutboundAudioFrames', async () => {
        const t = new TextInputAudioOutputTransport({ SessionID: 's3' });
        await t.Open();

        const frame = makeFrame(42);
        t.SendAudioFrame(frame);

        const yielded = await takeNext<AudioFrame>(t.OutboundAudioFrames);
        expect(yielded).toBe(frame);
        expect(yielded.data[0]).toBe(42);

        await t.Close();
    });

    it('exposes Participants only between Open and Close', async () => {
        const t = new TextInputAudioOutputTransport({ SessionID: 's4' });
        expect(t.Participants).toEqual([]);

        await t.Open();
        expect(t.Participants.map((p) => p.ID)).toEqual(['user', 'agent']);

        await t.Close();
        expect(t.Participants).toEqual([]);
    });

    it('AudioFramesIn is immediately closed (no mic input)', async () => {
        const t = new TextInputAudioOutputTransport({ SessionID: 's5' });
        await t.Open();

        const iter = t.AudioFramesIn[Symbol.asyncIterator]();
        const result = await iter.next();
        expect(result.done).toBe(true);

        await t.Close();
    });

    it('Close is idempotent', async () => {
        const t = new TextInputAudioOutputTransport({ SessionID: 's6' });
        await t.Open();
        await t.Close();
        await expect(t.Close()).resolves.toBeUndefined();
    });

    it('honors custom participant IDs', async () => {
        const t = new TextInputAudioOutputTransport({
            SessionID: 's7',
            UserParticipantID: 'caller-1',
            AgentParticipantID: 'bot-1',
        });
        await t.Open();
        expect(t.Participants.map((p) => p.ID)).toEqual(['caller-1', 'bot-1']);
        await t.Close();
    });
});
