import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoFrameDecoderRegistry } from '../media/videoFrameDecoderRegistry';
import { GEMINI_AVATAR_MP4_TYPE } from '../media/videoPlayout';
import { InstallFakeDom } from './helpers/fake-dom';
import { InstallFakeMse } from './helpers/fake-mse';
import { InstallFakeImageDecoding, InstallFakeWebCodecs } from './helpers/fake-webcodecs';
import { RecordingRegistrationOf, RestoreBuiltInDecoders } from './helpers/recording-decoders';

describe('VideoFrameDecoderRegistry', () => {
    const registry = VideoFrameDecoderRegistry.Instance;
    const added = ['a', 'b', 'c', 'h264-only', 'broken'];
    const names = (kind: 'fmp4' | 'chunk' | 'image', mimeType: string): string[] => registry.Candidates(kind, mimeType).map((r) => r.Name);

    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        RestoreBuiltInDecoders(added);
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('is one registry per page', () => {
        expect(VideoFrameDecoderRegistry.Instance).toBe(registry);
    });

    it('starts with the built-in decoders, each offered for the types this browser lets it play', () => {
        expect([names('fmp4', GEMINI_AVATAR_MP4_TYPE), names('chunk', 'video/vp8'), names('image', 'image/jpeg')]).toEqual([[], [], []]);

        InstallFakeDom();
        InstallFakeMse();
        InstallFakeWebCodecs();
        InstallFakeImageDecoding();
        const builtIns = [names('fmp4', GEMINI_AVATAR_MP4_TYPE), names('chunk', 'video/vp8'), names('image', 'image/jpeg')];
        expect(builtIns).toEqual([['mse-fmp4'], ['webcodecs'], ['image']]);
        // A kind decides as much as the type does.
        expect(names('image', 'video/vp8')).toEqual([]);
    });

    it('offers the decoders of a kind that can play a type, highest priority first, in registration order among equals', () => {
        registry.Register(RecordingRegistrationOf('a', 'chunk', ['video/vp8'], 0));
        registry.Register(RecordingRegistrationOf('b', 'chunk', ['video/vp8'], 5));
        registry.Register(RecordingRegistrationOf('c', 'chunk', ['video/vp8'], 0));
        registry.Register(RecordingRegistrationOf('h264-only', 'chunk', ['video/h264'], 9));
        expect(names('chunk', 'video/vp8')).toEqual(['b', 'a', 'c']);
        expect(names('chunk', 'video/h264; codecs="avc1.42e01f"')).toEqual(['h264-only']);
    });

    it('replaces a decoder registered under the same name', () => {
        registry.Register(RecordingRegistrationOf('a', 'chunk', ['video/vp8']));
        registry.Register(RecordingRegistrationOf('a', 'chunk', ['video/h264']));
        expect(names('chunk', 'video/vp8')).toEqual([]);
        expect(names('chunk', 'video/h264')).toEqual(['a']);
    });

    it('removes a decoder by name, a built-in included', () => {
        InstallFakeMse();
        registry.Register(RecordingRegistrationOf('a', 'chunk', ['video/vp8']));
        registry.Unregister('a');
        registry.Unregister('mse-fmp4');
        expect(names('chunk', 'video/vp8')).toEqual([]);
        expect(names('fmp4', GEMINI_AVATAR_MP4_TYPE)).toEqual([]);
    });

    it('leaves out a decoder whose support check throws, and says so', () => {
        registry.Register({ ...RecordingRegistrationOf('broken', 'chunk', []), CanPlay: () => { throw new Error('no probe'); } });
        expect(names('chunk', 'video/vp8')).toEqual([]);
        expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes('broken') && String(call[0]).includes('no probe'))).toBe(true);
    });
});
