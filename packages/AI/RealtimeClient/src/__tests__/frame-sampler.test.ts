import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FrameSampler, ScaleToMaxDimension, type FrameSamplerOptions, type SampledFrame } from '../media/frameSampler';
import { FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';
import { FAKE_FRAME_BASE64, InstallFakeDom, type FakeDom } from './helpers/fake-dom';

describe('FrameSampler', () => {
    let dom: FakeDom;
    let stream: FakeMediaStream;
    let track: FakeTrack;
    let frames: SampledFrame[];

    function start(options: Partial<FrameSamplerOptions> = {}): FrameSampler {
        const sampler = new FrameSampler(stream, { Rate: 1, OnFrame: (frame) => frames.push(frame), ...options });
        sampler.Start();
        dom.Videos.at(-1)?.SetFrameSize(1280, 720);
        return sampler;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
        dom = InstallFakeDom();
        track = new FakeTrack();
        stream = new FakeMediaStream([track]);
        frames = [];
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe('rate', () => {
        it('Rate 1 gives one frame a second', () => {
            start({ Rate: 1 });
            vi.advanceTimersByTime(3000);
            expect(frames).toHaveLength(3);
        });

        it('Rate 5 gives five frames a second: there is no 1 fps ceiling', () => {
            start({ Rate: 5 });
            vi.advanceTimersByTime(1000);
            expect(frames).toHaveLength(5);
        });

        it('an absent or invalid rate means one frame a second', () => {
            start({ Rate: Number.NaN });
            vi.advanceTimersByTime(2000);
            expect(frames).toHaveLength(2);
        });
    });

    describe('frames', () => {
        it('carries the image, its format, its size and when it was taken', () => {
            start();
            vi.advanceTimersByTime(1000);
            expect(frames[0]).toEqual({
                Data: FAKE_FRAME_BASE64,
                MimeType: 'image/jpeg',
                Width: 1280,
                Height: 720,
                TimestampMs: new Date('2026-10-05T12:00:01Z').getTime(),
            });
        });

        it('encodes as JPEG at quality 0.8 by default, or as the caller asks', () => {
            start();
            vi.advanceTimersByTime(1000);
            start({ MimeType: 'image/png', Quality: 0.5 });
            vi.advanceTimersByTime(1000);
            expect(dom.Canvases[0].Encodes[0]).toEqual({ MimeType: 'image/jpeg', Quality: 0.8 });
            expect(dom.Canvases[1].Encodes[0]).toEqual({ MimeType: 'image/png', Quality: 0.5 });
        });

        it('takes no frame until the video has one to draw', () => {
            const sampler = new FrameSampler(stream, { Rate: 1, OnFrame: (frame) => frames.push(frame) });
            sampler.Start();
            vi.advanceTimersByTime(2000);
            expect(frames).toHaveLength(0);

            dom.Videos[0].SetFrameSize(640, 480);
            vi.advanceTimersByTime(1000);
            expect(frames).toHaveLength(1);
        });

        it('plays the stream in a muted, inline video', () => {
            start();
            expect(dom.Videos[0]).toMatchObject({ muted: true, playsInline: true, srcObject: stream, Paused: false });
        });
    });

    describe('MaxDimension', () => {
        it('encodes at the stream size when no cap is set', () => {
            start();
            vi.advanceTimersByTime(1000);
            expect(dom.Canvases[0].Draws[0]).toEqual({ Width: 1280, Height: 720 });
        });

        it('caps the longer side and keeps the aspect ratio', () => {
            start({ MaxDimension: 640 });
            vi.advanceTimersByTime(1000);
            expect(dom.Canvases[0].Draws[0]).toEqual({ Width: 640, Height: 360 });
            expect(frames[0]).toMatchObject({ Width: 640, Height: 360 });
        });

        it('never enlarges a smaller frame', () => {
            start({ MaxDimension: 4096 });
            vi.advanceTimersByTime(1000);
            expect(dom.Canvases[0].Draws[0]).toEqual({ Width: 1280, Height: 720 });
        });
    });

    describe('Start and Stop', () => {
        it('Stop ends the frames and releases the elements, but leaves the stream running', () => {
            const sampler = start();
            vi.advanceTimersByTime(1000);
            sampler.Stop();
            vi.advanceTimersByTime(3000);

            expect(frames).toHaveLength(1);
            expect(sampler.IsRunning).toBe(false);
            expect(dom.Videos[0]).toMatchObject({ srcObject: null, Paused: true });
            expect(dom.Canvases[0]).toMatchObject({ width: 0, height: 0 });
            expect(track.Stopped).toBe(false);
        });

        it('a second Start while running keeps one timer', () => {
            const sampler = start();
            expect(sampler.Start()).toBe(true);
            vi.advanceTimersByTime(2000);
            expect(frames).toHaveLength(2);
            expect(dom.Videos).toHaveLength(1);
        });

        it('without a DOM, Start returns false, warns, and no frames come', () => {
            vi.unstubAllGlobals();
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const sampler = new FrameSampler(stream, { Rate: 1, OnFrame: (frame) => frames.push(frame) });

            expect(sampler.Start()).toBe(false);
            vi.advanceTimersByTime(2000);
            expect(frames).toHaveLength(0);
            expect(sampler.IsRunning).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
            warn.mockRestore();
        });
    });
});

describe('ScaleToMaxDimension', () => {
    it('scales by the longer side, in either orientation', () => {
        expect(ScaleToMaxDimension({ Width: 3840, Height: 2160 }, 1280)).toEqual({ Width: 1280, Height: 720 });
        expect(ScaleToMaxDimension({ Width: 720, Height: 1280 }, 640)).toEqual({ Width: 360, Height: 640 });
    });

    it('leaves the size alone with no cap, a non-positive cap, or a frame already within it', () => {
        expect(ScaleToMaxDimension({ Width: 800, Height: 600 })).toEqual({ Width: 800, Height: 600 });
        expect(ScaleToMaxDimension({ Width: 800, Height: 600 }, 0)).toEqual({ Width: 800, Height: 600 });
        expect(ScaleToMaxDimension({ Width: 800, Height: 600 }, 800)).toEqual({ Width: 800, Height: 600 });
    });

    it('never returns a side below one pixel', () => {
        expect(ScaleToMaxDimension({ Width: 10000, Height: 1 }, 100)).toEqual({ Width: 100, Height: 1 });
    });
});
