/**
 * @fileoverview DISPLAY CAPTURE: asks the browser to share a screen, a window, a tab or one panel of this
 * page, and reports what the user actually shared.
 *
 * Sharing works wherever `getDisplayMedia` exists: desktop Chrome, Edge, Firefox and Safari (no mobile browser
 * has it). The picker hints sent with it (`displaySurface`, `selfBrowserSurface`, `surfaceSwitching`,
 * `preferCurrentTab`, `monitorTypeSurfaces`, `systemAudio`) are read only by Chromium browsers; others ignore
 * them.
 *
 * A PANEL capture shares one element of this page. The user picks this tab in the picker, and the stream is
 * then narrowed to the element with Element Capture (`restrictTo`, Chromium 132+: the element alone, without
 * anything drawn over it) or, failing that, Region Capture (`cropTo`, Chromium 104+: the element's rectangle,
 * including anything over it). Element Capture emits frames only while the element is its own stacking
 * context, so the element gets `isolation: isolate` for the share and its own value back when the share ends.
 * Firefox and Safari have neither; {@link GetDisplayCaptureSupport} says so, and the caller shows the panel to
 * the agent another way (its channel frames). If the user shares something other than this tab, the capture is
 * stopped rather than sharing more than the panel.
 *
 * The browser's picker is the user's consent: it opens on every request, with no remembered grant. Like the
 * picker itself, {@link RequestDisplayCapture} must be called from a user gesture (a click handler).
 *
 * Capture runs at the surface's native frame rate; pace what the model receives with a `FrameSampler`.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

/** What the user is asked to share. */
export type DisplayCaptureSurface = 'screen' | 'window' | 'tab';

/** What a capture turned out to be; `'unknown'` when the browser doesn't say. */
export type CapturedDisplaySurface = DisplayCaptureSurface | 'unknown';

/** How a panel capture was narrowed to its element. */
export type PanelCaptureMethod = 'element' | 'region';

/** What this browser can capture. */
export interface DisplayCaptureSupport {
    /** A screen, window or tab can be shared (`getDisplayMedia`). */
    Display: boolean;
    /** Element Capture (`RestrictionTarget`, Chromium 132+). */
    ElementCapture: boolean;
    /** Region Capture (`CropTarget`, Chromium 104+). */
    RegionCapture: boolean;
}

export interface DisplayCaptureOptions {
    /**
     * The kind of surface the picker offers first. A hint: the user can still pick another kind, and only
     * Chromium browsers read it. Ignored for a panel capture, which asks for this tab.
     */
    PreferredSurface?: DisplayCaptureSurface;
    /**
     * Share only this element of the page. Needs Element or Region Capture (see
     * {@link GetDisplayCaptureSupport}); Element Capture is used where the browser has it. Element Capture emits
     * frames only while the element is its own stacking context, so unless it already is one, the element's
     * inline style gets `isolation: isolate` while it is shared and its own inline value back when the share
     * ends. Meanwhile its descendants stack inside it: one with a high `z-index` no longer paints over content
     * outside the panel.
     */
    Panel?: Element;
    /**
     * The panel's name, such as "Whiteboard", carried on the capture ({@link DisplayCapture.PanelLabel}) so the
     * UI and the agent can name what is shared. Read only with {@link Panel}.
     */
    PanelLabel?: string;
    /**
     * Also capture the shared surface's audio, where the browser offers it (Chromium: tab or system audio).
     * Defaults to `false`: the agent already hears the microphone.
     */
    IncludeAudio?: boolean;
}

/** A live share. */
export interface DisplayCapture {
    readonly Stream: MediaStream;
    /** The shared video track. */
    readonly Track: MediaStreamTrack;
    /** What is being shared now. It can change if the user switches surfaces mid-share. */
    readonly Surface: CapturedDisplaySurface;
    /** The browser's label for the shared surface, such as a window or tab title. */
    readonly Label: string;
    /** How the stream was narrowed, for a panel capture. */
    readonly PanelMethod?: PanelCaptureMethod;
    /** The shared panel's name, for a panel capture that was given one ({@link DisplayCaptureOptions.PanelLabel}). */
    readonly PanelLabel?: string;
    /**
     * Calls `handler` once when the share ends: the user pressed the browser's "Stop sharing", the shared
     * surface closed, or {@link DisplayCapture.Stop} was called. If the share has already ended, `handler` is
     * called at once.
     *
     * @returns A function that removes the handler.
     */
    OnEnded(handler: () => void): () => void;
    /** Stops sharing. Calling it again does nothing. */
    Stop(): void;
}

/** Why a capture failed. */
export type DisplayCaptureFailure =
    /** The browser cannot share a screen at all (mobile browsers, or no DOM). */
    | 'unsupported'
    /** A panel was asked for, but the browser has neither Element nor Region Capture (Firefox, Safari). */
    | 'panel-unsupported'
    /** A panel was asked for, but the user shared a screen, a window or another tab. The capture was stopped. */
    | 'panel-wrong-surface'
    /** The operating system or the page's permissions policy blocked sharing. */
    | 'denied'
    /** Anything else; see the message. */
    | 'error';

/** The outcome of {@link RequestDisplayCapture}. It always resolves; it never rejects. */
export type DisplayCaptureResult =
    | { Status: 'started'; Capture: DisplayCapture }
    | { Status: 'cancelled' }
    | { Status: 'failed'; Reason: DisplayCaptureFailure; Message: string };

/** `getDisplayMedia` options, with the Chromium-only picker hints that TypeScript's DOM types leave out. */
interface PickerOptions extends DisplayMediaStreamOptions {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: 'include' | 'exclude';
    surfaceSwitching?: 'include' | 'exclude';
    monitorTypeSurfaces?: 'include' | 'exclude';
    systemAudio?: 'include' | 'exclude';
}

/** `RestrictionTarget` and `CropTarget`: Chromium classes that TypeScript's DOM types leave out. */
interface CaptureTargetClass {
    fromElement(element: Element): Promise<object>;
}

/** A video track that can be narrowed to an element (Chromium's `BrowserCaptureMediaStreamTrack`). */
interface NarrowableTrack extends MediaStreamTrack {
    restrictTo?(target: object | null): Promise<void>;
    cropTo?(target: object | null): Promise<void>;
}

/** The global scope, with the Chromium capture-target classes when the browser has them. */
type CaptureScope = typeof globalThis & { RestrictionTarget?: CaptureTargetClass; CropTarget?: CaptureTargetClass };

/** A panel capture's narrowing: how it was done, and what to undo when the share ends. */
interface NarrowedPanel {
    Method: PanelCaptureMethod;
    Release: () => void;
}

/** What a panel capture carries besides its stream. */
interface PanelShare extends NarrowedPanel {
    Label?: string;
}

/** The picker's `displaySurface` value for each surface. */
const PICKER_SURFACE: Record<DisplayCaptureSurface, string> = { screen: 'monitor', window: 'window', tab: 'browser' };

/** What the user is told when a panel share got something other than this tab (without the closing period). */
const WRONG_SURFACE_MESSAGE = "To share only the panel, choose this tab in the browser's picker";

/** What this browser can capture. */
export function GetDisplayCaptureSupport(): DisplayCaptureSupport {
    const scope = globalThis as CaptureScope;
    return {
        Display: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function',
        ElementCapture: typeof scope.RestrictionTarget?.fromElement === 'function',
        RegionCapture: typeof scope.CropTarget?.fromElement === 'function',
    };
}

/**
 * Opens the browser's share picker and starts sharing what the user picks. Call it from a user gesture.
 *
 * @param options What to offer, whether to share only a panel, and whether to include audio.
 * @returns `started` with the live capture, `cancelled` when the user closed the picker, or `failed` with a reason.
 */
export async function RequestDisplayCapture(options: DisplayCaptureOptions = {}): Promise<DisplayCaptureResult> {
    const support = GetDisplayCaptureSupport();
    if (!support.Display) {
        return failure('unsupported', 'This browser cannot share a screen.');
    }
    if (options.Panel && !support.ElementCapture && !support.RegionCapture) {
        return failure('panel-unsupported', 'This browser cannot share a single panel; show it through its channel instead.');
    }
    let stream: MediaStream;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia(pickerOptions(options));
    } catch (err) {
        return pickerFailure(err);
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
        stopTracks(stream);
        return failure('error', 'The shared stream has no video track.');
    }
    if (!options.Panel) {
        return { Status: 'started', Capture: new ActiveDisplayCapture(stream, track) };
    }
    const narrowed = await narrowToPanel(track, options.Panel, support);
    if ('Status' in narrowed) {
        stopTracks(stream);
        return narrowed;
    }
    const panel: PanelShare = options.PanelLabel ? { ...narrowed, Label: options.PanelLabel } : narrowed;
    return { Status: 'started', Capture: new ActiveDisplayCapture(stream, track, panel) };
}

/** The picker request: this tab for a panel; otherwise any surface but this tab, with the preferred kind first. */
function pickerOptions(options: DisplayCaptureOptions): PickerOptions {
    const audio = options.IncludeAudio ?? false;
    if (options.Panel) {
        return {
            video: { displaySurface: PICKER_SURFACE.tab },
            audio,
            preferCurrentTab: true,
            selfBrowserSurface: 'include',
            // Switching to another surface would leave the panel narrowing behind.
            surfaceSwitching: 'exclude',
        };
    }
    return {
        video: options.PreferredSurface ? { displaySurface: PICKER_SURFACE[options.PreferredSurface] } : true,
        audio,
        // Sharing this page would show the agent its own call UI, mirrored without end.
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
        systemAudio: audio ? 'include' : 'exclude',
    };
}

/**
 * Narrows a self-capture to the panel: with Element Capture where the browser has it, else with Region Capture.
 *
 * @returns How it was narrowed, or a failure when the user shared something other than this tab.
 */
async function narrowToPanel(
    track: MediaStreamTrack,
    panel: Element,
    support: DisplayCaptureSupport
): Promise<NarrowedPanel | DisplayCaptureResult> {
    if (track.getSettings().displaySurface !== PICKER_SURFACE.tab) {
        return failure('panel-wrong-surface', `${WRONG_SURFACE_MESSAGE}.`);
    }
    const scope = globalThis as CaptureScope;
    const narrowable = track as NarrowableTrack;
    if (support.ElementCapture && scope.RestrictionTarget && narrowable.restrictTo) {
        // Isolated first, so the restricted track has frames to emit from the start.
        const release = isolatePanel(panel);
        try {
            await narrowable.restrictTo(await scope.RestrictionTarget.fromElement(panel));
            return { Method: 'element', Release: release };
        } catch (err) {
            release();
            return wrongSurface(err);
        }
    }
    if (scope.CropTarget && narrowable.cropTo) {
        try {
            await narrowable.cropTo(await scope.CropTarget.fromElement(panel));
            return { Method: 'region', Release: () => undefined };
        } catch (err) {
            return wrongSurface(err);
        }
    }
    return failure('panel-unsupported', 'This browser cannot narrow a share to a single panel.');
}

/** The browser refuses to narrow a capture of any tab but this one. */
function wrongSurface(err: unknown): DisplayCaptureResult {
    return failure('panel-wrong-surface', `${WRONG_SURFACE_MESSAGE} (${errorMessage(err)}).`);
}

/**
 * Makes the panel its own stacking context, which Element Capture needs to emit frames, unless it already is
 * one through `isolation`. Set inline and marked important, so no style sheet undoes it during the share.
 *
 * @returns A function that puts the panel's own inline `isolation` back; the share calls it once, as it ends.
 */
function isolatePanel(panel: Element): () => void {
    const style = (panel as Element & { style?: CSSStyleDeclaration }).style;
    if (!style || (typeof getComputedStyle === 'function' && getComputedStyle(panel).isolation === 'isolate')) {
        return () => undefined;
    }
    const value = style.getPropertyValue('isolation');
    const priority = style.getPropertyPriority('isolation');
    style.setProperty('isolation', 'isolate', 'important');
    return () => {
        if (value) {
            style.setProperty('isolation', value, priority);
        } else {
            style.removeProperty('isolation');
        }
    };
}

/**
 * Turns a picker rejection into a result. Closing the picker rejects with `NotAllowedError`, and so does an
 * operating-system refusal, which Chromium words "Permission denied by system".
 */
function pickerFailure(err: unknown): DisplayCaptureResult {
    const name = err instanceof Error ? err.name : '';
    const message = errorMessage(err);
    if (name === 'NotAllowedError') {
        return /system|policy/i.test(message) ? failure('denied', message) : { Status: 'cancelled' };
    }
    return failure('error', message);
}

function failure(reason: DisplayCaptureFailure, message: string): DisplayCaptureResult {
    return { Status: 'failed', Reason: reason, Message: message };
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function stopTracks(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop());
}

/**
 * The kind of surface a captured track shows, from the browser's `displaySurface` setting. It reads any display
 * track, including one captured elsewhere, such as a LiveKit screen share.
 */
export function CapturedSurfaceOf(track: MediaStreamTrack): CapturedDisplaySurface {
    switch (track.getSettings().displaySurface) {
        case 'monitor':
            return 'screen';
        case 'window':
            return 'window';
        case 'browser':
            return 'tab';
        default:
            return 'unknown';
    }
}

/** A share in progress. */
class ActiveDisplayCapture implements DisplayCapture {
    private readonly endedHandlers = new Set<() => void>();
    private ended = false;

    constructor(
        public readonly Stream: MediaStream,
        public readonly Track: MediaStreamTrack,
        private readonly panel?: PanelShare
    ) {
        // `ended` fires when the user stops sharing from the browser's bar or the surface closes.
        Track.addEventListener('ended', () => this.end());
    }

    public get Surface(): CapturedDisplaySurface {
        return CapturedSurfaceOf(this.Track);
    }

    public get Label(): string {
        return this.Track.label;
    }

    public get PanelMethod(): PanelCaptureMethod | undefined {
        return this.panel?.Method;
    }

    public get PanelLabel(): string | undefined {
        return this.panel?.Label;
    }

    public OnEnded(handler: () => void): () => void {
        if (this.ended) {
            handler();
            return () => undefined;
        }
        this.endedHandlers.add(handler);
        return () => this.endedHandlers.delete(handler);
    }

    public Stop(): void {
        stopTracks(this.Stream);
        // A track stopped by the page fires no `ended` event, so report the end here.
        this.end();
    }

    private end(): void {
        if (this.ended) {
            return;
        }
        this.ended = true;
        // The panel's own style comes back before anyone hears that the share ended.
        this.panel?.Release();
        for (const handler of [...this.endedHandlers]) {
            handler();
        }
    }
}
