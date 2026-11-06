import { toJpeg } from 'html-to-image';

/**
 * Options for {@link CaptureElementJpeg}. A value that is not a positive number, or a quality above 1,
 * falls back to {@link ELEMENT_CAPTURE_DEFAULTS}.
 */
export interface ElementCaptureOptions {
  /** Output width ceiling in CSS pixels. Wider elements are scaled down. */
  maxWidth?: number; // case-violation-ok-legacy-back-compat: option names the spec fixes for CaptureElementJpeg
  /** JPEG quality, above 0 and at most 1. */
  quality?: number; // case-violation-ok-legacy-back-compat: option names the spec fixes for CaptureElementJpeg
  /** How long to wait for the capture before giving up, in milliseconds. */
  timeoutMs?: number; // case-violation-ok-legacy-back-compat: option names the spec fixes for CaptureElementJpeg
  /** The most DOM nodes to rasterize. The clone step is synchronous and freezes the UI above this. */
  maxNodes?: number; // case-violation-ok-legacy-back-compat: option names the spec fixes for CaptureElementJpeg
}

/**
 * A captured element as JPEG. `Base64` has no data URL prefix. `Width` and `Height` are the image size in
 * pixels: the element's size with its borders, times the pixel ratio, rounded down as the canvas rounds it.
 */
export interface ElementCapture {
  Base64: string;
  MimeType: 'image/jpeg';
  Width: number;
  Height: number;
}

/** The option values {@link CaptureElementJpeg} uses when a caller leaves one out. */
export const ELEMENT_CAPTURE_DEFAULTS = { maxWidth: 1280, quality: 0.7, timeoutMs: 5000, maxNodes: 20000 } as const;

/** Renders an element to a JPEG data URL. html-to-image `toJpeg` has this shape. */
type CaptureFn = (element: HTMLElement, options: { quality: number; pixelRatio: number }) => Promise<string>;

/**
 * The pixel ratio that keeps the output at or under `maxWidth`. Never 0: it is 1 for an element that
 * already fits or has no width, and for a `maxWidth` that is not a positive number.
 */
export function ComputePixelRatio(elementWidth: number, maxWidth: number): number {
  const scalesDown = Number.isFinite(elementWidth) && Number.isFinite(maxWidth) && maxWidth > 0 && elementWidth > maxWidth;
  return scalesDown ? maxWidth / elementWidth : 1;
}

/** The base64 part of a data URL, or the input when it has no prefix. */
export function StripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.startsWith('data:') ? dataUrl.indexOf(',') : -1;
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Captures an element to a JPEG for an agent to see. Iframes, cross-origin images without CORS
 * and tainted canvases come out blank or fail; the caller tells the agent so.
 * @param capture The renderer. The default is html-to-image `toJpeg`; tests pass a fake.
 * @throws Error when the element has no size or more than `maxNodes` DOM nodes, when the capture
 * takes longer than `timeoutMs`, and when the capture fails or returns no image data.
 */
export async function CaptureElementJpeg(element: HTMLElement, options: ElementCaptureOptions = {}, capture: CaptureFn = toJpeg): Promise<ElementCapture> {
  const settings = resolveOptions(options);
  if (element.clientWidth === 0 || element.clientHeight === 0) throw new Error('The element has no size on screen.');
  const nodeCount = element.getElementsByTagName('*').length;
  if (nodeCount > settings.maxNodes) throw new Error(`The element has ${nodeCount} DOM nodes; the capture limit is ${settings.maxNodes}.`);

  const size = imageSize(element);
  const pixelRatio = ComputePixelRatio(size.width, settings.maxWidth);
  const dataUrl = await withTimeout(runCapture(capture, element, { quality: settings.quality, pixelRatio }), settings.timeoutMs);
  const base64 = StripDataUrlPrefix(dataUrl);
  if (!base64) throw new Error('The capture returned no image data.');
  return {
    Base64: base64,
    MimeType: 'image/jpeg',
    // The canvas drops the fraction of a size it is given, so the image is this size.
    Width: Math.floor(size.width * pixelRatio),
    Height: Math.floor(size.height * pixelRatio),
  };
}

/**
 * The size html-to-image draws the element at, in CSS pixels: the client size plus the border widths,
 * added in the same order it adds them.
 */
function imageSize(element: HTMLElement): { width: number; height: number } {
  return {
    width: element.clientWidth + borderWidth(element, 'left') + borderWidth(element, 'right'),
    height: element.clientHeight + borderWidth(element, 'top') + borderWidth(element, 'bottom'),
  };
}

/**
 * A border width in CSS pixels, read from the element's computed style. It is 0 when the element has no
 * window to compute a style in, or when the value is missing or not a positive number.
 */
function borderWidth(element: HTMLElement, side: 'left' | 'right' | 'top' | 'bottom'): number {
  const view = element.ownerDocument?.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return 0;
  const width = parseFloat(view.getComputedStyle(element).getPropertyValue(`border-${side}-width`));
  return Number.isFinite(width) && width > 0 ? width : 0;
}

/** The options with each missing or unusable value replaced by its default. */
function resolveOptions(options: ElementCaptureOptions): Required<ElementCaptureOptions> {
  return {
    maxWidth: positiveOr(options.maxWidth, ELEMENT_CAPTURE_DEFAULTS.maxWidth),
    quality: positiveOr(options.quality, ELEMENT_CAPTURE_DEFAULTS.quality, 1),
    timeoutMs: positiveOr(options.timeoutMs, ELEMENT_CAPTURE_DEFAULTS.timeoutMs),
    maxNodes: positiveOr(options.maxNodes, ELEMENT_CAPTURE_DEFAULTS.maxNodes),
  };
}

/** `value` when it is a finite number above 0 and at most `max`, otherwise `fallback`. */
function positiveOr(value: number | undefined, fallback: number, max = Number.POSITIVE_INFINITY): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : fallback;
}

/** Runs the capture and turns any failure into an Error with a readable message. */
async function runCapture(capture: CaptureFn, element: HTMLElement, options: Parameters<CaptureFn>[1]): Promise<string> {
  try {
    return await capture(element, options);
  } catch (error) {
    // html-to-image rejects with the image's error Event, not an Error, when the browser cannot draw the element.
    const reason = error instanceof Error ? error.message : 'the browser could not draw the element as an image';
    throw new Error(`The capture failed: ${reason}`);
  }
}

/** Settles like `promise`, or rejects when it has not settled within `timeoutMs`. The capture itself keeps running. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Capture timed out after ${timeoutMs} ms.`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
