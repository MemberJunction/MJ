import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RealtimeImageVideoFrame } from '@memberjunction/ai';
import type { VideoFrameDecoderContext } from '../media/videoFrameDecoder';
import type { VideoPlayoutProblem } from '../media/videoPlayout';
import { IMAGE_FRAME_DECODER, ImageFrameDecoder, MAX_IMAGES_AHEAD, MAX_WAITING_IMAGES } from '../media/decoders/imageFrameDecoder';
import { InstallFakeDom, type FakeDom } from './helpers/fake-dom';
import {
    FakeStream,
    FakeTrackGenerator,
    InstallFakeImageDecoding,
    InstallFakeWebCodecs,
    OpenPictures,
    type PendingImageDecode,
} from './helpers/fake-webcodecs';

/** A JPEG image frame, timed when `ms` is given. */
function image(ms?: number, mimeType = 'image/jpeg'): RealtimeImageVideoFrame {
    const time = ms === undefined ? {} : { PresentationTimeMs: ms };
    return { Kind: 'image', Data: Uint8Array.of(0xff, 0xd8, ms ?? 0).buffer, MimeType: mimeType, ...time };
}

/** Lets settled decodes reach the decoder. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe('ImageFrameDecoder', () => {
    let dom: FakeDom;
    let decodes: PendingImageDecode[];
    let reports: VideoPlayoutProblem[];
    let decoder: ImageFrameDecoder;

    /** The labels of the images shown, in order. */
    const shown = (): string[] => (FakeTrackGenerator.Instances.at(-1) as FakeTrackGenerator).Written.map((frame) => frame.Label);

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        dom = InstallFakeDom();
        InstallFakeWebCodecs();
        decodes = InstallFakeImageDecoding();
        reports = [];
        const context: VideoFrameDecoderContext = {
            MimeType: 'image/jpeg',
            BackBufferSeconds: 10,
            CarriesVoice: false,
            Report: (problem) => reports.push(problem),
            Failed: () => undefined,
        };
        decoder = new ImageFrameDecoder(context);
    });

    afterEach(() => {
        decoder.Dispose();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('what it can play', () => {
        it('takes JPEG, PNG and WebP, and nothing else', () => {
            const types = ['image/jpeg', 'image/png', 'IMAGE/WEBP', 'image/gif', 'image/avif', 'video/mp4'];
            expect(types.filter((type) => IMAGE_FRAME_DECODER.CanPlay(type))).toEqual(['image/jpeg', 'image/png', 'IMAGE/WEBP']);
            expect([IMAGE_FRAME_DECODER.Name, IMAGE_FRAME_DECODER.Kind]).toEqual(['image', 'image']);
        });

        it('refuses images without createImageBitmap, or with nothing to show them through', () => {
            vi.stubGlobal('createImageBitmap', undefined);
            expect(IMAGE_FRAME_DECODER.CanPlay('image/jpeg')).toBe(false);
            InstallFakeImageDecoding();
            InstallFakeWebCodecs({ Generator: false, Canvas: false });
            expect(IMAGE_FRAME_DECODER.CanPlay('image/jpeg')).toBe(false);
        });
    });

    it('decodes one image at a time, in arrival order, from a blob of its type, and shows an untimed one when decoded', async () => {
        decoder.Append(image(undefined, 'image/png'));
        decoder.Append(image());
        expect(decodes).toHaveLength(1);
        expect([decodes[0].Blob.type, decodes[0].Blob.size]).toEqual(['image/png', 3]);

        decodes[0].Resolve('first');
        await settle();
        expect(shown()).toEqual(['first']);
        expect(decodes).toHaveLength(2);
        decodes[1].Resolve('second');
        await settle();
        expect(shown()).toEqual(['first', 'second']);
    });

    it('shows a timed image when its time comes', async () => {
        decoder.Append(image(0));
        decodes[0].Resolve('a');
        await settle();
        decoder.Append(image(500));
        decodes[1].Resolve('b');
        await settle();
        expect(shown()).toEqual(['a']);
        vi.advanceTimersByTime(500);
        expect(shown()).toEqual(['a', 'b']);
    });

    it("shows a timed image on the player's clock when it has one", async () => {
        decoder.Dispose();
        const voice = { CurrentTimeMs: 100 as number | null };
        decoder = new ImageFrameDecoder({
            MimeType: 'image/jpeg',
            BackBufferSeconds: 10,
            CarriesVoice: false,
            Clock: voice,
            Report: () => undefined,
            Failed: () => undefined,
        });
        decoder.Append(image(300));
        decodes[decodes.length - 1].Resolve('timed');
        await settle();
        vi.advanceTimersByTime(300);
        expect(shown()).toEqual([]);
        voice.CurrentTimeMs = 300;
        vi.advanceTimersByTime(20);
        expect(shown()).toEqual(['timed']);
    });

    it(`keeps at most ${MAX_IMAGES_AHEAD} decoded images waiting to show; the rest wait encoded`, async () => {
        for (let i = 0; i <= MAX_IMAGES_AHEAD + 2; i++) {
            decoder.Append(image(i * 100));
        }
        for (let i = 0; i <= MAX_IMAGES_AHEAD; i++) {
            decodes[i].Resolve(`img${i}`);
            await settle();
        }
        // The first showed at once; four wait for their times, so the next decode waits too.
        expect(decodes).toHaveLength(MAX_IMAGES_AHEAD + 1);
        vi.advanceTimersByTime(100);
        await settle();
        expect(decodes).toHaveLength(MAX_IMAGES_AHEAD + 2);
    });

    it('Flush drops the images waiting and the decode under way; the last image shown stays', async () => {
        decoder.Append(image());
        decodes[0].Resolve('kept');
        await settle();
        decoder.Append(image());
        decoder.Append(image());
        decoder.Flush();

        const late = decodes[1].Resolve('late');
        await settle();
        expect(late.Closed).toBe(true);
        expect(shown()).toEqual(['kept']);
        expect(decodes).toHaveLength(2);

        // The image waiting at the flush was dropped: the next decode is of the image appended after it.
        decoder.Append(image(undefined, 'image/png'));
        expect(decodes).toHaveLength(3);
        expect(decodes[2].Blob.type).toBe('image/png');
    });

    it("reports an image the browser can't decode, and plays the next one", async () => {
        decoder.Append(image());
        decoder.Append(image());
        decodes[0].Reject(new Error('corrupt'));
        await settle();
        expect(reports).toEqual(['append-failed']);
        decodes[1].Resolve('next');
        await settle();
        expect(shown()).toEqual(['next']);
    });

    it('drops the oldest encoded images when too many wait, reported', () => {
        for (let i = 0; i <= MAX_WAITING_IMAGES + 1; i++) {
            decoder.Append(image());
        }
        expect(reports).toEqual(['pending-overflow']);
    });

    it('shows its stream in the element, needs nothing at the end of a turn, and has no voice', async () => {
        decoder.Attach(document.createElement('video'));
        expect(dom.Videos[0].srcObject).toBeInstanceOf(FakeStream);
        decoder.Append(image());
        decoder.EndOfTurn();
        decodes[0].Resolve('after');
        await settle();
        expect(shown()).toEqual(['after']);
        expect(decoder.IsPlaying).toBe(false);
        decoder.Detach();
        expect(dom.Videos[0].srcObject).toBeNull();
    });

    it('Dispose stops the stream, and closes an image decoded after it', async () => {
        decoder.Append(image());
        decoder.Dispose();
        const late = decodes[0].Resolve('late');
        await settle();
        expect(late.Closed).toBe(true);
        expect(FakeTrackGenerator.Instances[0].Stopped).toBe(true);
        expect(OpenPictures.Count).toBe(0);
    });
});
