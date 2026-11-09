import { describe, it, expect } from 'vitest';
import {
    REALTIME_DEFAULT_INBOUND_VIDEO_RATE,
    REALTIME_VIDEO_FRAME_JITTER_HEADROOM,
    RealtimeMinVideoFrameSpacingMs,
    RealtimeVideoFrameIntervalMs,
    ScaleRealtimeVideoFrame,
} from '../generic/realtimeVideoFrames';

describe('realtime video frame math', () => {
    describe('RealtimeVideoFrameIntervalMs', () => {
        it('is 1000 / rate, rounded down', () => {
            expect(RealtimeVideoFrameIntervalMs(1)).toBe(1000);
            expect(RealtimeVideoFrameIntervalMs(2)).toBe(500);
            expect(RealtimeVideoFrameIntervalMs(3)).toBe(333);
        });

        it('falls back to the default rate (1 fps) for an absent or invalid rate', () => {
            expect(REALTIME_DEFAULT_INBOUND_VIDEO_RATE).toBe(1);
            for (const rate of [undefined, null, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
                expect(RealtimeVideoFrameIntervalMs(rate)).toBe(1000);
            }
        });
    });

    describe('RealtimeMinVideoFrameSpacingMs', () => {
        it('is the interval less the jitter headroom: 750 ms at 1 fps', () => {
            expect(REALTIME_VIDEO_FRAME_JITTER_HEADROOM).toBe(0.75);
            expect(RealtimeMinVideoFrameSpacingMs(1)).toBe(750);
            expect(RealtimeMinVideoFrameSpacingMs(2)).toBe(375);
            expect(RealtimeMinVideoFrameSpacingMs(undefined)).toBe(750);
        });
    });

    describe('ScaleRealtimeVideoFrame', () => {
        it('caps the longer side, keeping the aspect ratio', () => {
            expect(ScaleRealtimeVideoFrame({ Width: 1280, Height: 720 }, 640)).toEqual({ Width: 640, Height: 360 });
            expect(ScaleRealtimeVideoFrame({ Width: 720, Height: 1280 }, 640)).toEqual({ Width: 360, Height: 640 });
            expect(ScaleRealtimeVideoFrame({ Width: 1920, Height: 1080 }, 1280)).toEqual({ Width: 1280, Height: 720 });
        });

        it('never enlarges a smaller frame', () => {
            expect(ScaleRealtimeVideoFrame({ Width: 320, Height: 240 }, 640)).toEqual({ Width: 320, Height: 240 });
            expect(ScaleRealtimeVideoFrame({ Width: 640, Height: 480 }, 640)).toEqual({ Width: 640, Height: 480 });
        });

        it('leaves the size alone without a positive cap', () => {
            expect(ScaleRealtimeVideoFrame({ Width: 1920, Height: 1080 })).toEqual({ Width: 1920, Height: 1080 });
            expect(ScaleRealtimeVideoFrame({ Width: 1920, Height: 1080 }, 0)).toEqual({ Width: 1920, Height: 1080 });
            expect(ScaleRealtimeVideoFrame({ Width: 1920, Height: 1080 }, -5)).toEqual({ Width: 1920, Height: 1080 });
        });

        it('never returns a side smaller than 1', () => {
            expect(ScaleRealtimeVideoFrame({ Width: 4000, Height: 2 }, 100)).toEqual({ Width: 100, Height: 1 });
        });
    });
});
