/**
 * @fileoverview The default, opt-in DOM rasterizer for realtime channels: turns a rendered
 * component's DOM subtree into a JPEG so a video-capable model can SEE it (used by the Interactive Component channel and by
 * channels built with the Angular adapter).
 *
 * It is built on `html-to-image` (MIT; already a dependency of MJ Explorer for pin thumbnails). That library draws the
 * subtree through an SVG `foreignObject`, so the browser's own CSS engine renders it, which matters because MJ's design
 * tokens use `color-mix()` and similar that canvas-based rasterizers cannot parse. It runs in the main thread and clones
 * the subtree synchronously, so this module bounds the work (node cap, timeout, one capture at a time, a size ceiling).
 *
 * Nothing here is on by default. A host that wants the agent to see components calls
 * {@link EnableChannelFrameCapture} once, before a realtime session is minted (Explorer does; an embeddable
 * element exposes it as a flag). The base channel's visual pump decides WHEN to capture (change-driven, paced to the
 * negotiated rate, deduplicated, only while exposure is `pixels` and a video track is up) and tags each frame with the change id
 * of the state it shows; this module only decides what a frame looks like and fails soft.
 *
 * **Failure is soft and loud once.** Cross-origin images, tainted canvases and fonts that cannot be read make a rasterizer
 * throw or hang. The first such failure is logged ONCE with its reason; a failure that cannot succeed on retry (a security
 * error) disables capture for the rest of the session, and repeated transient failures (timeouts) do the same. The channel
 * then simply stays at state-only: the model keeps getting state notes, never an error.
 *
 * @module @memberjunction/ng-realtime-channels
 */

import { toJpeg } from 'html-to-image';
import { ChannelFrameCapture, type ElementFrameCapturer } from './channel-frame-capture';

/** Renders an element to a JPEG data URL; the shape of `html-to-image`'s `toJpeg`, so a test can supply a fake. */
export type DomRasterizer = (element: HTMLElement, options: DomRasterizerOptions) => Promise<string>;

/** The options this module passes to a {@link DomRasterizer} (a subset of `html-to-image`'s own). */
export interface DomRasterizerOptions {
    /** JPEG quality, 0 to 1. */
    quality: number;
    /** Scale applied to the element's own size, so the longest edge is at most {@link DomFrameCaptureOptions.MaxEdgePx}. */
    pixelRatio: number;
    /** The color behind transparent areas (JPEG has no alpha). */
    backgroundColor: string;
    /** Skip embedding web fonts: they add seconds and cross-origin failures, and the model does not need the typeface. */
    skipFonts: boolean;
}

/** Options for {@link CreateDomFrameCapturer}. */
export interface DomFrameCaptureOptions {
    /** JPEG quality, 0 to 1. Default 0.6 (a frame of a dashboard is roughly 40 to 120 KB). */
    Quality?: number;
    /** The longest edge of the frame, in pixels; larger elements are scaled down. Default 1024. */
    MaxEdgePx?: number;
    /** Elements with more descendants than this are not rasterized (the synchronous clone would freeze the page). Default 3000. */
    MaxNodes?: number;
    /** How long to wait for one capture before giving up on it. Default 4000 ms. */
    TimeoutMs?: number;
    /** Consecutive transient failures (timeouts, unknown errors) after which capture is disabled for the session. Default 3. */
    MaxConsecutiveFailures?: number;
    /** The rasterizer. Default: `html-to-image`'s `toJpeg`. */
    Rasterize?: DomRasterizer;
    /** Called once, with the reason, the first time capture is degraded. Default: `console.warn`. */
    OnDegraded?: (reason: string) => void;
}

const DEFAULTS = { Quality: 0.6, MaxEdgePx: 1024, MaxNodes: 3000, TimeoutMs: 4000, MaxConsecutiveFailures: 3 } as const;

/** The data-URL prefix a JPEG from the rasterizer starts with. */
const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/** A background color to put behind transparent areas: the nearest ancestor that paints one, else white. */
function resolveBackground(element: HTMLElement): string {
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && color !== 'transparent' && !/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(color)) {
            return color;
        }
    }
    return '#ffffff';
}

/** Whether an error is one that cannot succeed on retry in this page (a tainted canvas or blocked cross-origin read). */
function isPermanentFailure(error: unknown): boolean {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    return name === 'SecurityError' || /tainted|cross-origin|insecure|not allowed to load/i.test(message);
}

/** A readable reason for a failure. */
function describeFailure(error: unknown): string {
    if (isPermanentFailure(error)) {
        return `the page's content cannot be read for a picture (cross-origin images or a tainted canvas): ${error instanceof Error ? error.message : String(error)}`;
    }
    return error instanceof Error ? error.message : String(error);
}

/** Resolves to `undefined` if the promise has not settled within `ms`; the work itself is not cancelled. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

/**
 * Builds a {@link ElementFrameCapturer} that rasterizes an element to a base64 JPEG (no data-URL prefix).
 *
 * The returned function never throws. It returns `null` (so the pump sends no frame) when the element has no size, is too
 * large, a capture is already in flight, a capture times out or fails, or capture has been disabled after repeated or
 * permanent failure; in the last two cases the reason is reported once through `OnDegraded`.
 *
 * @param options Tuning and test seams.
 */
export function CreateDomFrameCapturer(options: DomFrameCaptureOptions = {}): ElementFrameCapturer {
    const quality = options.Quality ?? DEFAULTS.Quality;
    const maxEdge = options.MaxEdgePx ?? DEFAULTS.MaxEdgePx;
    const maxNodes = options.MaxNodes ?? DEFAULTS.MaxNodes;
    const timeoutMs = options.TimeoutMs ?? DEFAULTS.TimeoutMs;
    const maxFailures = options.MaxConsecutiveFailures ?? DEFAULTS.MaxConsecutiveFailures;
    const rasterize: DomRasterizer = options.Rasterize ?? ((element, rasterOptions) => toJpeg(element, rasterOptions));
    const report = options.OnDegraded ?? ((reason: string) => console.warn(`[RealtimeChannels] ${reason}`));

    let disabled = false;
    let inFlight = false;
    let failures = 0;

    const disable = (reason: string): void => {
        if (!disabled) {
            disabled = true;
            report(`Picture capture of components is off for this session; the agent keeps receiving state only. Reason: ${reason}`);
        }
    };

    return async (element: HTMLElement): Promise<string | null> => {
        if (disabled || inFlight || element.clientWidth === 0 || element.clientHeight === 0) {
            return null;
        }
        if (element.getElementsByTagName('*').length > maxNodes) {
            return null;
        }
        inFlight = true;
        try {
            const ratio = Math.min(1, maxEdge / Math.max(element.clientWidth, element.clientHeight));
            const dataUrl = await withTimeout(
                rasterize(element, { quality, pixelRatio: ratio, backgroundColor: resolveBackground(element), skipFonts: true }),
                timeoutMs
            );
            if (dataUrl === undefined) {
                failures++;
                if (failures >= maxFailures) {
                    disable(`capturing took longer than ${timeoutMs} ms, ${failures} times in a row`);
                }
                return null;
            }
            failures = 0;
            return dataUrl.startsWith(JPEG_DATA_URL_PREFIX) ? dataUrl.slice(JPEG_DATA_URL_PREFIX.length) : null;
        } catch (error) {
            failures++;
            if (isPermanentFailure(error) || failures >= maxFailures) {
                disable(describeFailure(error));
            }
            return null;
        } finally {
            inFlight = false;
        }
    };
}

/**
 * Turns on picture capture of channel surfaces for this host: registers the default rasterizer. Call it once at startup, BEFORE a realtime session is minted (whether the channel can source a video track is
 * decided at mint). Hosts opt in: MJ Explorer calls it; an embeddable element calls it only when its flag is set.
 *
 * @param options Tuning and test seams.
 * @returns A function that removes the registration.
 */
export function EnableChannelFrameCapture(options: DomFrameCaptureOptions = {}): () => void {
    ChannelFrameCapture.Instance.Register(CreateDomFrameCapturer(options));
    return () => ChannelFrameCapture.Instance.Register(null);
}
