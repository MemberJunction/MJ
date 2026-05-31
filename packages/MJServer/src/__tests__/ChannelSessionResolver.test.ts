/**
 * Tests for the pure helpers in `ChannelSessionResolver`.
 *
 * The resolver itself is heavily integrated with type-graphql, PubSub, and
 * MJ metadata — those paths are covered end-to-end by the channel-runtime
 * integration suite. Here we exercise the wire encoder in isolation: it's
 * the only piece of new logic that's pure and runs on every audio frame.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock type-graphql to avoid reflect-metadata dependency — same pattern as
// search-knowledge-tags.test.ts.
vi.mock('type-graphql', () => {
    const noop = () => () => undefined;
    const passthrough = () => (target: unknown) => target;
    return {
        Resolver: passthrough,
        Mutation: noop,
        Query: noop,
        Subscription: noop,
        Arg: noop,
        Args: noop,
        Ctx: noop,
        ObjectType: passthrough,
        InputType: passthrough,
        ArgsType: passthrough,
        Field: noop,
        Float: Number,
        Int: Number,
        ID: String,
        Authorized: noop,
        PubSub: noop,
        Root: noop,
    };
});

// Import after mocks.
import { encodeAudioFrameForWire } from '../resolvers/ChannelSessionResolver.js';

describe('ChannelSessionResolver.encodeAudioFrameForWire', () => {
    it('round-trips frame bytes through base64', () => {
        const data = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff]);
        const payload = encodeAudioFrameForWire('session-abc', {
            data,
            sampleRateHz: 16000,
            channelCount: 1,
            mediaType: 'audio/pcm',
        });
        expect(payload.SessionID).toBe('session-abc');
        expect(payload.SampleRateHz).toBe(16000);
        expect(payload.ChannelCount).toBe(1);
        expect(payload.MediaType).toBe('audio/pcm');

        const roundTripped = Buffer.from(payload.DataBase64, 'base64');
        expect(Array.from(roundTripped)).toEqual([0x00, 0x01, 0x7f, 0x80, 0xff]);
    });

    it('handles an empty frame', () => {
        const payload = encodeAudioFrameForWire('s1', {
            data: new Uint8Array(0),
            sampleRateHz: 24000,
            channelCount: 2,
            mediaType: 'audio/mpeg',
        });
        expect(payload.DataBase64).toBe('');
        expect(payload.SampleRateHz).toBe(24000);
        expect(payload.ChannelCount).toBe(2);
        expect(payload.MediaType).toBe('audio/mpeg');
    });

    it('preserves SessionID verbatim (no normalization)', () => {
        const payload = encodeAudioFrameForWire('UPPER-Case-Mixed', {
            data: new Uint8Array([1]),
            sampleRateHz: 8000,
            channelCount: 1,
            mediaType: 'audio/mulaw',
        });
        expect(payload.SessionID).toBe('UPPER-Case-Mixed');
    });
});
