import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RealtimeVideoFrame } from '@memberjunction/ai';
import { VideoFrameDecoderRegistry } from '../media/videoFrameDecoderRegistry';
import { GEMINI_AVATAR_MP4_TYPE, VideoPlayout, type VideoPlayoutProblem } from '../media/videoPlayout';
import { AttachVideoSource } from '../media/attachVideoSource';
import { InstallFakeDom, type FakeDom } from './helpers/fake-dom';
import { FakeInitSegment, FakeMediaSource, InstallFakeMse } from './helpers/fake-mse';
import { PieceFrame } from './helpers/fmp4-pieces';
import { FakeStream, FakeVideoDecoder, InstallFakeWebCodecs } from './helpers/fake-webcodecs';
import { RecordingRegistrationOf, RestoreBuiltInDecoders, type RecordingDecoder, type RecordingRegistration } from './helpers/recording-decoders';

const VP8 = 'video/vp8';

function chunk(ms: number, key = true, mimeType = VP8): RealtimeVideoFrame {
    return { Kind: 'chunk', Data: new ArrayBuffer(4), MimeType: mimeType, PresentationTimeMs: ms, KeyFrame: key };
}

function image(mimeType = 'image/png'): RealtimeVideoFrame {
    return { Kind: 'image', Data: new ArrayBuffer(4), MimeType: mimeType };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe('VideoPlayout: choosing a decoder', () => {
    const registry = VideoFrameDecoderRegistry.Instance;
    let dom: FakeDom;
    let chunks: RecordingRegistration;
    let images: RecordingRegistration;
    let playout: VideoPlayout;
    let problems: VideoPlayoutProblem[];
    let warn: ReturnType<typeof vi.spyOn>;
    const added: string[] = [];

    /** Registers a recording decoder for the test. */
    function register(registration: RecordingRegistration): RecordingRegistration {
        registry.Register(registration);
        added.push(registration.Name);
        return registration;
    }

    function player(options: ConstructorParameters<typeof VideoPlayout>[0] = {}): VideoPlayout {
        playout?.Dispose();
        playout = new VideoPlayout(options);
        problems = [];
        playout.OnProblem((problem) => problems.push(problem));
        return playout;
    }

    const only = (registration: RecordingRegistration): RecordingDecoder => {
        expect(registration.Created).toHaveLength(1);
        return registration.Created[0];
    };

    beforeEach(() => {
        dom = InstallFakeDom();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        chunks = register(RecordingRegistrationOf('test-chunks', 'chunk', [VP8, 'video/h264']));
        images = register(RecordingRegistrationOf('test-images', 'image', ['image/png']));
        player();
    });

    afterEach(() => {
        playout.Dispose();
        RestoreBuiltInDecoders(added.splice(0));
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("chooses a decoder by the first frame's kind and type, and keeps it for that type, whatever its parameters", () => {
        playout.Append(chunk(0));
        playout.Append(chunk(40, false));
        playout.Append(chunk(80, false, 'video/vp8; codecs="vp8"'));
        expect(only(chunks).Calls).toEqual(['append chunk video/vp8', 'append chunk video/vp8', 'append chunk video/vp8; codecs="vp8"']);
        expect(images.Created).toEqual([]);
    });

    it('switches decoders when the frame type changes: the old one is disposed, the new one takes the element', () => {
        player({ MimeType: VP8 });
        AttachVideoSource(playout.Source, document.createElement('video'));
        const first = only(chunks);
        expect(first.Calls).toEqual(['attach']);

        playout.Append(image());
        expect(first.Calls).toEqual(['attach', 'dispose']);
        expect(only(images).Calls).toEqual(['attach', 'append image image/png']);
        expect(only(images).Element).toBe(dom.Videos[0]);
    });

    it('drops a frame no decoder plays, reported once as no-decoder, and keeps the decoder in use', () => {
        playout.Append(chunk(0));
        playout.Append(image('image/gif'));
        playout.Append(image('image/gif'));
        playout.Append(chunk(40, false));
        expect(problems).toEqual(['no-decoder']);
        expect(only(chunks).Calls).toEqual(['append chunk video/vp8', 'append chunk video/vp8']);
    });

    describe('the configured type', () => {
        it('starts its decoder when an element is attached, before any frame, and frames of that type go to it', () => {
            player({ MimeType: VP8 });
            AttachVideoSource(playout.Source, document.createElement('video'));
            playout.Append(chunk(0));
            expect(only(chunks).Calls).toEqual(['attach', 'append chunk video/vp8']);
            expect(only(chunks).Context.MimeType).toBe(VP8);
        });

        it('is unsupported when no decoder plays it: reported, and the element is left alone', () => {
            player({ MimeType: 'video/webm' });
            AttachVideoSource(playout.Source, document.createElement('video'));
            expect(problems).toEqual(['unsupported']);
            expect([dom.Videos[0].src, dom.Videos[0].srcObject]).toEqual(['', null]);
        });

        it('is the Gemini avatar type by default, played through MSE', () => {
            InstallFakeMse();
            AttachVideoSource(playout.Source, document.createElement('video'));
            expect(FakeMediaSource.Instances).toHaveLength(1);
            expect(dom.Videos[0].src).toBe('blob:fake/1');
        });
    });

    describe('fallback', () => {
        let backup: RecordingRegistration;

        beforeEach(() => {
            backup = register(RecordingRegistrationOf('test-backup', 'chunk', [VP8], 50));
            player({ MimeType: VP8 });
            AttachVideoSource(playout.Source, document.createElement('video'));
        });

        it('disposes a decoder that gives up, says why, and plays the next frame of the type with the next decoder', () => {
            playout.Append(chunk(0));
            expect(only(chunks).Calls).toEqual(['attach', 'append chunk video/vp8']);
            only(chunks).Context.Failed('the codec went away');
            expect(only(chunks).Calls.at(-1)).toBe('dispose');
            expect(warn.mock.calls.some((call) => String(call[0]).includes('test-chunks decoder stopped: the codec went away'))).toBe(true);

            playout.Append(chunk(40));
            expect(only(backup).Calls).toEqual(['attach', 'append chunk video/vp8']);
            expect(chunks.Created).toHaveLength(1);
        });

        it('drops frames of the type once every decoder for it gave up, and still chooses a failed decoder for another type', () => {
            playout.Append(chunk(0));
            only(chunks).Context.Failed('first');
            playout.Append(chunk(40));
            only(backup).Context.Failed('second');
            playout.Append(chunk(80));
            expect(problems).toEqual(['no-decoder']);

            playout.Append(chunk(120, true, 'video/h264; codecs="avc1.42e01f"'));
            expect(chunks.Created).toHaveLength(2);
        });

        it('ignores a give-up from a decoder no longer in use', () => {
            playout.Append(chunk(0));
            const old = only(chunks);
            playout.Append(image());
            old.Context.Failed('late');
            playout.Append(image());
            expect(only(images).Calls).toEqual(['attach', 'append image image/png', 'append image image/png']);
        });
    });

    it("gives each decoder the player's settings, the voice as it is now, the element hook, and reports once per kind", () => {
        const hook = (): void => undefined;
        player({ MimeType: VP8, BackBufferSeconds: 4, CarriesVoice: false, OnElementAttached: hook });
        playout.Append(chunk(0));
        const context = only(chunks).Context;
        expect([context.MimeType, context.BackBufferSeconds, context.CarriesVoice, context.OnElementAttached]).toEqual([VP8, 4, false, hook]);

        playout.CarriesVoice = true;
        expect(context.CarriesVoice).toBe(true);
        context.Report('append-failed', 'bad');
        context.Report('append-failed', 'bad again');
        expect(problems).toEqual(['append-failed']);
    });

    it('hands EndOfTurn, Flush and IsPlaying to the decoder in use, and does nothing without one', () => {
        playout.EndOfTurn();
        playout.Flush();
        expect(playout.IsPlaying).toBe(false);

        playout.Append(chunk(0));
        playout.EndOfTurn();
        playout.Flush();
        only(chunks).IsPlaying = true;
        expect(playout.IsPlaying).toBe(true);
        expect(only(chunks).Calls).toEqual(['append chunk video/vp8', 'end', 'flush']);
    });

    it('detaching the element detaches the decoder, and the next element gets the same decoder', () => {
        playout.Append(chunk(0));
        const detach = AttachVideoSource(playout.Source, document.createElement('video'));
        detach();
        AttachVideoSource(playout.Source, document.createElement('video'));
        expect(only(chunks).Calls).toEqual(['append chunk video/vp8', 'attach', 'detach', 'attach']);
        expect(only(chunks).Element).toBe(dom.Videos[1]);
    });

    it('Dispose disposes the decoder, and later frames choose none', () => {
        playout.Append(chunk(0));
        playout.Dispose();
        playout.Append(chunk(40));
        expect(only(chunks).Calls).toEqual(['append chunk video/vp8', 'dispose']);
    });

    describe('IsSupported', () => {
        it('asks the registry: a type some decoder plays here', () => {
            expect([VideoPlayout.IsSupported(VP8), VideoPlayout.IsSupported('image/png'), VideoPlayout.IsSupported('image/gif')]).toEqual([true, true, false]);
            expect(VideoPlayout.IsSupported('video/webm')).toBe(false);
        });

        it('defaults to the Gemini avatar type, which MSE plays', () => {
            expect(VideoPlayout.IsSupported()).toBe(false);
            InstallFakeMse();
            expect(VideoPlayout.IsSupported()).toBe(true);
            expect(VideoPlayout.IsSupported(GEMINI_AVATAR_MP4_TYPE)).toBe(true);
        });
    });

    it('moves from MSE to WebCodecs when chunks follow the configured MP4 type, with the built-in decoders', async () => {
        RestoreBuiltInDecoders(added.splice(0));
        InstallFakeMse();
        InstallFakeWebCodecs();
        FakeVideoDecoder.Supported.add('vp8');
        player();
        AttachVideoSource(playout.Source, document.createElement('video'));
        playout.Append(PieceFrame(FakeInitSegment()));
        expect(dom.Videos[0].src).toBe('blob:fake/1');

        playout.Append(chunk(0));
        await settle();
        expect(dom.Videos[0].src).toBe('');
        expect(dom.Videos[0].srcObject).toBeInstanceOf(FakeStream);
        expect(FakeVideoDecoder.Instances[0].Configs[0].codec).toBe('vp8');
        expect(FakeVideoDecoder.Instances[0].Chunks).toHaveLength(1);
    });
});
