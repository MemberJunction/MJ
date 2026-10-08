/**
 * @fileoverview FRAME SAMPLER: takes still frames from any `MediaStream` at the rate the caller asks
 * for, and returns each as a base64 JPEG or PNG.
 *
 * The rate is the caller's: pass the rate the inbound video track negotiated
 * (`BaseRealtimeClient.InboundVideoRate`). The sampler applies no ceiling of its own, so the stream itself
 * can run at its native frame rate (a smooth self-view) while the model receives only the frames it can
 * take. An absent or invalid rate means one frame per second, like every pacer in this package
 * ({@link NominalVideoFrameIntervalMs}).
 *
 * Frames are drawn from a hidden `<video>` onto a `<canvas>`. Without a DOM (Node, SSR) the sampler emits
 * nothing, and {@link FrameSampler.Start} says so by returning `false`.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import { ScaleRealtimeVideoFrame } from '@memberjunction/ai';
import { NominalVideoFrameIntervalMs } from './videoPacing';

/** Image formats a frame can be encoded as. */
export type SampledFrameMimeType = 'image/jpeg' | 'image/png';

/** A width and height in pixels. */
export interface FrameSize {
    Width: number;
    Height: number;
}

/** One frame taken from the stream. */
export interface SampledFrame {
    /** The encoded image, base64 (no `data:` prefix). */
    Data: string;
    MimeType: SampledFrameMimeType;
    /** The encoded image's width in pixels, after any {@link FrameSamplerOptions.MaxDimension} scaling. */
    Width: number;
    /** The encoded image's height in pixels, after any scaling. */
    Height: number;
    /** Epoch milliseconds when the frame was taken. */
    TimestampMs: number;
}

export interface FrameSamplerOptions {
    /**
     * Frames per second. Pass the rate the inbound video track negotiated; there is no ceiling. An
     * absent, zero, negative or non-finite rate means one frame per second.
     */
    Rate: number;
    /** Defaults to `'image/jpeg'`. */
    MimeType?: SampledFrameMimeType;
    /** JPEG quality from 0 to 1. Defaults to 0.8. Ignored for PNG. */
    Quality?: number;
    /**
     * Caps the longer side of each frame, in pixels, keeping the aspect ratio. A smaller frame is never
     * enlarged. Defaults to no cap: frames are encoded at the stream's own size.
     */
    MaxDimension?: number;
    /** Receives each frame. */
    OnFrame: (frame: SampledFrame) => void;
}

/** JPEG quality when the caller doesn't set one. */
const DEFAULT_JPEG_QUALITY = 0.8;

/**
 * The size a frame is encoded at: its own size, or scaled down so the longer side is at most
 * `maxDimension` pixels. Never enlarges, and never returns a side smaller than 1. The math is
 * `@memberjunction/ai`'s `ScaleRealtimeVideoFrame`, shared with the meeting bot.
 *
 * @param size The frame's own size.
 * @param maxDimension The cap on the longer side; `undefined` or a non-positive value means no cap.
 */
export function ScaleToMaxDimension(size: FrameSize, maxDimension?: number): FrameSize {
    return ScaleRealtimeVideoFrame(size, maxDimension);
}

/**
 * Samples still frames from a `MediaStream`. The caller owns the stream: {@link FrameSampler.Stop}
 * releases the sampler's elements and timer but never stops the stream's tracks.
 */
export class FrameSampler {
    private readonly intervalMs: number;
    private timer: ReturnType<typeof setInterval> | null = null;
    private video: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;

    /**
     * @param stream The stream to sample. Its first video track is drawn.
     * @param options Rate, format, size cap and the frame callback.
     */
    constructor(
        private readonly stream: MediaStream,
        private readonly options: FrameSamplerOptions
    ) {
        this.intervalMs = NominalVideoFrameIntervalMs(options.Rate);
    }

    /** The stream being sampled. */
    public get Stream(): MediaStream {
        return this.stream;
    }

    /** Whether the sampler is taking frames. */
    public get IsRunning(): boolean {
        return this.timer !== null;
    }

    /**
     * Starts taking frames. Calling it while running does nothing.
     *
     * @returns `false` when there is no DOM to draw frames in, so no frames will come.
     */
    public Start(): boolean {
        if (this.timer) {
            return true;
        }
        if (!this.createElements()) {
            console.warn('[FrameSampler] No DOM to draw frames in, or element creation failed: this sampler emits no frames.');
            return false;
        }
        this.timer = setInterval(() => this.sampleFrame(), this.intervalMs);
        return true;
    }

    /** Stops taking frames and releases the elements. The stream's tracks keep running. */
    public Stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
            this.video = null;
        }
        if (this.canvas) {
            // A zero-size canvas lets the browser free the backing store now rather than at collection.
            this.canvas.width = 0;
            this.canvas.height = 0;
            this.canvas = null;
        }
    }

    private createElements(): boolean {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return false;
        }
        try {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.srcObject = this.stream;
            void video.play().catch(() => {
                // Autoplay can wait for a user gesture; frames start once the video plays.
            });
            this.video = video;
            this.canvas = document.createElement('canvas');
            return true;
        } catch (err) {
            console.error('[FrameSampler] Failed to create the video and canvas elements:', err);
            this.Stop();
            return false;
        }
    }

    /** Draws and encodes the current frame. Skips the tick until the video has a frame to draw. */
    private sampleFrame(): void {
        const video = this.video;
        const canvas = this.canvas;
        if (!video || !canvas || video.videoWidth <= 0 || video.videoHeight <= 0) {
            return;
        }
        const size = ScaleToMaxDimension({ Width: video.videoWidth, Height: video.videoHeight }, this.options.MaxDimension);
        canvas.width = size.Width;
        canvas.height = size.Height;
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }
        context.drawImage(video, 0, 0, size.Width, size.Height);
        const mimeType = this.options.MimeType ?? 'image/jpeg';
        const data = canvas.toDataURL(mimeType, this.options.Quality ?? DEFAULT_JPEG_QUALITY).split(',')[1] ?? '';
        if (data.length > 0) {
            this.options.OnFrame({ Data: data, MimeType: mimeType, Width: size.Width, Height: size.Height, TimestampMs: Date.now() });
        }
    }
}
