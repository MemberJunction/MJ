import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_REPLAYS, REPLAY_INTERVAL_MS, StreamCanvas } from '../media/decoders/streamCanvas';
import { InstallFakeDom, type FakeDom, type FakeVideoElement } from './helpers/fake-dom';
import { AsPicture, FakeImageBitmap, FakeStream, FakeTrackGenerator, FakeVideoFrame, InstallFakeWebCodecs, OpenPictures } from './helpers/fake-webcodecs';

describe('StreamCanvas', () => {
    let dom: FakeDom;

    /** A video element that has no frame yet, as one just given a stream. */
    function freshVideo(): { Element: HTMLVideoElement; Fake: FakeVideoElement } {
        const element = document.createElement('video');
        const fake = dom.Videos[dom.Videos.length - 1];
        fake.readyState = 0;
        return { Element: element, Fake: fake };
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        dom = InstallFakeDom();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('availability', () => {
        it('is available with a track generator, or with a canvas it can capture, and not without either', () => {
            InstallFakeWebCodecs();
            expect(StreamCanvas.IsAvailable()).toBe(true);
            InstallFakeWebCodecs({ Generator: false });
            expect(StreamCanvas.IsAvailable()).toBe(true);
            InstallFakeWebCodecs({ Generator: false, Canvas: false });
            expect(StreamCanvas.IsAvailable()).toBe(false);
        });
    });

    describe('through a track generator (Chromium)', () => {
        let canvas: StreamCanvas;
        let generator: FakeTrackGenerator;

        beforeEach(() => {
            InstallFakeWebCodecs();
            canvas = new StreamCanvas();
            generator = FakeTrackGenerator.Instances[0];
        });

        it('writes each picture to a video generator as a frame of it, and closes the picture', () => {
            const frame = new FakeVideoFrame('decoded', { timestamp: 40_000 });
            const image = new FakeImageBitmap('still', 320, 240);
            canvas.Show(AsPicture(frame));
            canvas.Show(AsPicture(image));
            expect(generator.kind).toBe('video');
            expect(generator.Written.map((written) => [written.Label, written.displayWidth])).toEqual([
                ['decoded', 640],
                ['still', 320],
            ]);
            expect([frame.Closed, image.Closed]).toEqual([true, true]);
        });

        it('stamps each frame with the wall clock, after the last one, whatever the picture says', () => {
            canvas.Show(AsPicture(new FakeVideoFrame('late', { timestamp: 9_000_000 })));
            canvas.Show(AsPicture(new FakeVideoFrame('restart', { timestamp: 0 })));
            vi.advanceTimersByTime(40);
            canvas.Show(AsPicture(new FakeVideoFrame('next', { timestamp: 40_000 })));
            const [first, second, third] = generator.Written.map((written) => written.timestamp);
            // In the same microsecond, one after the last; 40 ms later, the clock's time.
            expect(second - first).toBe(1);
            expect(third - first).toBeGreaterThanOrEqual(40_000 - 1);
        });

        it('shows the stream in an element, muted and inline, and offers it the last picture', () => {
            canvas.Show(AsPicture(new FakeVideoFrame('last', { timestamp: 0 })));
            const { Element, Fake } = freshVideo();
            canvas.Attach(Element);
            expect(Fake.srcObject).toBeInstanceOf(FakeStream);
            expect((Fake.srcObject as unknown as FakeStream).Tracks).toEqual([generator]);
            expect(Fake).toMatchObject({ muted: true, playsInline: true, Paused: false });
            expect(generator.Written.map((written) => written.Label)).toEqual(['last', 'last']);
        });

        it(`offers the last picture again every ${REPLAY_INTERVAL_MS} ms until the element has a frame`, () => {
            canvas.Show(AsPicture(new FakeVideoFrame('last', { timestamp: 0 })));
            const { Element, Fake } = freshVideo();
            canvas.Attach(Element);
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
            expect(generator.Written).toHaveLength(3);

            Fake.readyState = 2;
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 4);
            expect(generator.Written).toHaveLength(3);
        });

        it(`stops offering after ${MAX_REPLAYS} offers, or when the element is let go`, () => {
            canvas.Show(AsPicture(new FakeVideoFrame('last', { timestamp: 0 })));
            canvas.Attach(freshVideo().Element);
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS * (MAX_REPLAYS + 5));
            expect(generator.Written).toHaveLength(1 + MAX_REPLAYS);

            canvas.Attach(freshVideo().Element);
            canvas.Detach();
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 5);
            expect(generator.Written).toHaveLength(2 + MAX_REPLAYS);
        });

        it('offers nothing to an element attached before the first picture', () => {
            canvas.Attach(freshVideo().Element);
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 3);
            expect(generator.Written).toEqual([]);
        });

        it('moves to the next element, and leaves an element another source took alone', () => {
            canvas.Attach(freshVideo().Element);
            canvas.Attach(freshVideo().Element);
            expect(dom.Videos[0]).toMatchObject({ srcObject: null, Paused: true });
            expect(dom.Videos[1].srcObject).not.toBeNull();

            const other = new FakeStream();
            dom.Videos[1].srcObject = other as unknown as MediaStream;
            canvas.Detach();
            expect(dom.Videos[1].srcObject).toBe(other);
        });

        it('Dispose stops the track, releases the element and closes its copy of the last picture', () => {
            canvas.Show(AsPicture(new FakeVideoFrame('last', { timestamp: 0 })));
            canvas.Attach(freshVideo().Element);
            canvas.Dispose();
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 3);
            expect(generator.Stopped).toBe(true);
            expect(dom.Videos[0].srcObject).toBeNull();
            expect(generator.Written).toHaveLength(2);
            expect(OpenPictures.Count).toBe(0);
        });
    });

    describe('through a captured canvas (no generator)', () => {
        let canvas: StreamCanvas;

        beforeEach(() => {
            InstallFakeWebCodecs({ Generator: false });
            canvas = new StreamCanvas();
        });

        it('captures a canvas at 0 fps and shows that stream, requesting no frame before the first picture', () => {
            const surface = dom.Canvases[0];
            expect(surface.CaptureRates).toEqual([0]);
            canvas.Attach(freshVideo().Element);
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS * 3);
            expect(dom.Videos[0].srcObject).toBe(surface.Captured);
            expect(surface.Captured?.Track.FrameRequests).toBe(0);
        });

        it('draws each picture at its own size, closes it, and requests a frame', () => {
            const surface = dom.Canvases[0];
            const frame = new FakeVideoFrame('decoded', { timestamp: 0 });
            canvas.Show(AsPicture(frame));
            canvas.Show(AsPicture(new FakeImageBitmap('still', 320, 240)));
            expect(surface.Draws).toEqual([
                { Width: 640, Height: 360 },
                { Width: 320, Height: 240 },
            ]);
            expect([surface.width, surface.height]).toEqual([320, 240]);
            expect(surface.Sources[0]).toBe(frame);
            expect(frame.Closed).toBe(true);
            expect(surface.Captured?.Track.FrameRequests).toBe(2);
        });

        it('requests frames for an element attached later until it has one, and stops the track on Dispose', () => {
            const surface = dom.Canvases[0];
            canvas.Show(AsPicture(new FakeImageBitmap('still')));
            const { Element, Fake } = freshVideo();
            canvas.Attach(Element);
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
            Fake.readyState = 2;
            vi.advanceTimersByTime(REPLAY_INTERVAL_MS);
            expect(surface.Captured?.Track.FrameRequests).toBe(3);
            canvas.Dispose();
            expect(surface.Captured?.Track.Stopped).toBe(true);
        });
    });
});
