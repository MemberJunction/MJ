/**
 * @fileoverview FRAME CAPTURE for realtime video tracks — camera and screen capture pipelines.
 *
 * Patterned beside `micCapture.ts`:
 * - `CreateCameraCapture`: prompts via `getUserMedia` (consent-gated via {@link RealtimeTrackDescriptor.RequiresConsent}).
 * - `CreateScreenCapture`: prompts via `getDisplayMedia` (consent-gated via {@link RealtimeTrackDescriptor.RequiresConsent}).
 * - `CreateStreamFrameCapture`: extracts periodic JPEG frames from an already-acquired `MediaStream`.
 *
 * Cadence is throttled to at most 1 frame per second (1 fps ceiling per Live API capabilities guide).
 *
 * @module @memberjunction/ai-realtime-client
 * @author MemberJunction.com
 */

import type { RealtimeTrackDescriptor } from '@memberjunction/ai';

/**
 * Handle returned by frame capture factories: stops capture and releases video resources.
 */
export interface IFrameCapture {
    /** Stops frame capture, cancels intervals, and releases any acquired tracks/elements. */
    Stop(): void;
    /** The underlying MediaStream being captured (if any). */
    readonly Stream?: MediaStream;
}

/**
 * Configuration options for frame capture.
 */
export interface FrameCaptureOptions {
    /** Track descriptor governing this capture. */
    Descriptor?: RealtimeTrackDescriptor;
    /**
     * Whether explicit user consent was granted for tracks requiring consent.
     * If `Descriptor.RequiresConsent` is true and this is false/omitted, capture is refused.
     */
    ConsentGranted?: boolean;
    /**
     * Capture cadence in frames per second (fps).
     * Capped at 1 fps maximum (Gemini Live ceiling). Defaults to `Descriptor?.Rate ?? 1`.
     */
    Rate?: number;
    /** Output image format ('image/jpeg' or 'image/png'). Defaults to 'image/jpeg'. */
    MimeType?: 'image/jpeg' | 'image/png';
    /** Image compression quality (0..1) for JPEG. Defaults to 0.8. */
    Quality?: number;
    /** Invoked with each captured frame as base64-encoded image data. */
    OnFrame: (frame: { data: string; mimeType: string }) => void;
}

/**
 * Creates a frame capture pump over an already-acquired {@link MediaStream}.
 *
 * @param stream The media stream containing one or more video tracks.
 * @param options Frame capture options (cadence, format, frame callback).
 */
export function CreateStreamFrameCapture(
    stream: MediaStream,
    options: FrameCaptureOptions
): IFrameCapture {
    const rawRate = options.Rate ?? options.Descriptor?.Rate ?? 1;
    // Cadence ceiling: max 1 fps per Gemini Live API specs; minimum 0.1 fps
    const rate = Math.min(Math.max(rawRate, 0.1), 1);
    const intervalMs = Math.floor(1000 / rate);
    const mimeType = options.MimeType ?? 'image/jpeg';
    const quality = options.Quality ?? 0.8;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let canvasEl: HTMLCanvasElement | null = null;

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
            videoEl = document.createElement('video');
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.srcObject = stream;
            void videoEl.play().catch(() => {
                // Autoplay may be restricted without user interaction; non-fatal for capture
            });
            canvasEl = document.createElement('canvas');
        } catch (err) {
            console.error('[FrameCapture] Failed to initialize DOM elements for video capture:', err);
        }
    }

    const captureTick = () => {
        if (stopped) {
            return;
        }
        if (videoEl && canvasEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            canvasEl.width = videoEl.videoWidth;
            canvasEl.height = videoEl.videoHeight;
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoEl, 0, 0);
                const dataUrl = canvasEl.toDataURL(mimeType, quality);
                const base64 = dataUrl.split(',')[1] ?? '';
                if (base64.length > 0) {
                    options.OnFrame({ data: base64, mimeType });
                }
            }
        }
    };

    if (videoEl && canvasEl) {
        timer = setInterval(captureTick, intervalMs);
    } else {
        console.warn(
            '[FrameCapture] No video/canvas element available (no DOM, or element construction failed) — ' +
            'this capture will emit no frames.'
        );
    }

    return {
        Stop: () => {
            stopped = true;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            if (videoEl) {
                videoEl.srcObject = null;
                videoEl = null;
            }
            canvasEl = null;
        },
        get Stream(): MediaStream {
            return stream;
        },
    };
}

/**
 * Requests user camera video capture via `navigator.mediaDevices.getUserMedia`.
 * Gated on {@link FrameCaptureOptions.ConsentGranted} when consent is required.
 *
 * @param options Frame capture options.
 * @param constraints Video track constraints.
 */
export async function CreateCameraCapture(
    options: FrameCaptureOptions,
    constraints?: MediaTrackConstraints
): Promise<IFrameCapture> {
    const requiresConsent = options.Descriptor?.RequiresConsent ?? true;
    if (requiresConsent && !options.ConsentGranted) {
        throw new Error('Explicit consent is required to establish camera video capture.');
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera capture is unavailable: navigator.mediaDevices.getUserMedia not supported in this environment.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        video: constraints ?? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 1 } },
    });
    const capture = CreateStreamFrameCapture(stream, options);
    return {
        Stop: () => {
            capture.Stop();
            stream.getTracks().forEach((track) => track.stop());
        },
        get Stream(): MediaStream {
            return stream;
        },
    };
}

/**
 * Requests screen share video capture via `navigator.mediaDevices.getDisplayMedia`.
 * Gated on {@link FrameCaptureOptions.ConsentGranted} when consent is required.
 *
 * @param options Frame capture options.
 * @param displayMediaOptions Display media options.
 */
export async function CreateScreenCapture(
    options: FrameCaptureOptions,
    displayMediaOptions?: DisplayMediaStreamOptions
): Promise<IFrameCapture> {
    const requiresConsent = options.Descriptor?.RequiresConsent ?? true;
    if (requiresConsent && !options.ConsentGranted) {
        throw new Error('Explicit consent is required to establish screen video capture.');
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen capture is unavailable: navigator.mediaDevices.getDisplayMedia not supported in this environment.');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia(
        displayMediaOptions ?? { video: { frameRate: { max: 1 } } }
    );
    const capture = CreateStreamFrameCapture(stream, options);
    return {
        Stop: () => {
            capture.Stop();
            stream.getTracks().forEach((track) => track.stop());
        },
        get Stream(): MediaStream {
            return stream;
        },
    };
}

/** @deprecated Use {@link CreateStreamFrameCapture}. */
export function createStreamFrameCapture(
    stream: MediaStream,
    options: FrameCaptureOptions
): IFrameCapture {
    return CreateStreamFrameCapture(stream, options);
}

/** @deprecated Use {@link CreateCameraCapture}. */
export async function createCameraCapture(
    options: FrameCaptureOptions,
    constraints?: MediaTrackConstraints
): Promise<IFrameCapture> {
    return CreateCameraCapture(options, constraints);
}

/** @deprecated Use {@link CreateScreenCapture}. */
export async function createScreenCapture(
    options: FrameCaptureOptions,
    displayMediaOptions?: DisplayMediaStreamOptions
): Promise<IFrameCapture> {
    return CreateScreenCapture(options, displayMediaOptions);
}
