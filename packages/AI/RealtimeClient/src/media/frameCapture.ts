/**
 * @fileoverview FRAME CAPTURE for realtime video tracks — camera and screen capture pipelines.
 *
 * Patterned beside `micCapture.ts`:
 * - `CreateCameraCapture`: prompts via `getUserMedia` (consent-gated via {@link RealtimeTrackDescriptor.RequiresConsent}).
 * - `CreateScreenCapture`: prompts via `getDisplayMedia` (consent-gated via {@link RealtimeTrackDescriptor.RequiresConsent}).
 * - `CreateStreamFrameCapture` (deprecated): extracts periodic JPEG frames from an already-acquired
 *   `MediaStream`. It is now a thin wrapper over {@link FrameSampler}, which new code uses directly.
 *
 * Capture runs at the device's native frame rate; only the sampling is paced, at the rate the caller passes
 * (the negotiated track rate). There is no 1 fps ceiling here.
 *
 * @module @memberjunction/ai-realtime-client
 * @author MemberJunction.com
 */

import type { RealtimeTrackDescriptor } from '@memberjunction/ai';
import { FrameSampler } from './frameSampler';

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
     * Frames per second to sample. No ceiling: pass the negotiated track rate. Defaults to
     * `Descriptor?.Rate ?? 1`.
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
 * @deprecated Use {@link FrameSampler}, which reports whether it started and returns frame sizes and
 *   timestamps. This wrapper passes `Rate` through unchanged; it no longer caps it at 1 fps.
 * @param stream The media stream containing one or more video tracks.
 * @param options Frame capture options (cadence, format, frame callback).
 */
export function CreateStreamFrameCapture(
    stream: MediaStream,
    options: FrameCaptureOptions
): IFrameCapture {
    return startSampler(stream, options);
}

/** Samples a stream with a {@link FrameSampler}, behind the older {@link IFrameCapture} handle. */
function startSampler(stream: MediaStream, options: FrameCaptureOptions): IFrameCapture {
    const sampler = new FrameSampler(stream, {
        Rate: options.Rate ?? options.Descriptor?.Rate ?? 1,
        MimeType: options.MimeType,
        Quality: options.Quality,
        OnFrame: (frame) => options.OnFrame({ data: frame.Data, mimeType: frame.MimeType }),
    });
    sampler.Start();
    return {
        Stop: () => sampler.Stop(),
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
    // No frameRate cap: the camera runs at its native rate (a smooth self-view); only sampling is paced.
    const stream = await navigator.mediaDevices.getUserMedia({
        video: constraints ?? { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const capture = startSampler(stream, options);
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
    // No frameRate cap: the share runs at its native rate; only sampling is paced.
    const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions ?? { video: true });
    const capture = startSampler(stream, options);
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

/** @deprecated Use {@link FrameSampler}. */
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
