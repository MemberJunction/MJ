/**
 * Fakes for display capture: a shared-surface video track (with Chromium's `restrictTo` / `cropTo`), its
 * stream, a stub `navigator.mediaDevices.getDisplayMedia`, and the `RestrictionTarget` / `CropTarget`
 * globals. Remove them with `vi.unstubAllGlobals()`.
 */
import { vi } from 'vitest';

/** The request `getDisplayMedia` received, including the Chromium-only picker hints. */
export type PickerRequest = DisplayMediaStreamOptions & {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: string;
    surfaceSwitching?: string;
    monitorTypeSurfaces?: string;
    systemAudio?: string;
};

/** The video track of a shared surface. */
export class FakeDisplayTrack extends EventTarget implements MediaStreamTrack {
    public contentHint = '';
    public enabled = true;
    public readonly id = 'fake-display-track';
    public readonly kind = 'video';
    public label = 'Fake shared surface';
    public readonly muted = false;
    public onended: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onunmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public readyState: MediaStreamTrackState = 'live';
    public Stopped = false;
    /** What `getSettings().displaySurface` reports: 'monitor', 'window' or 'browser'. */
    public DisplaySurface: string | undefined = 'monitor';
    /** The target passed to `restrictTo`, once called. */
    public RestrictedTo: object | null = null;
    /** The target passed to `cropTo`, once called. */
    public CroppedTo: object | null = null;
    /** When set, `restrictTo` and `cropTo` reject with it, as Chromium does for a capture of another tab. */
    public NarrowError: Error | null = null;

    public async applyConstraints(_constraints?: MediaTrackConstraints): Promise<void> {}
    public clone(): MediaStreamTrack {
        return this;
    }
    public getCapabilities(): MediaTrackCapabilities {
        return {};
    }
    public getConstraints(): MediaTrackConstraints {
        return {};
    }
    public getSettings(): MediaTrackSettings {
        return this.DisplaySurface ? { displaySurface: this.DisplaySurface } : {};
    }
    public stop(): void {
        this.Stopped = true;
        this.readyState = 'ended';
    }
    public async restrictTo(target: object | null): Promise<void> {
        if (this.NarrowError) {
            throw this.NarrowError;
        }
        this.RestrictedTo = target;
    }
    public async cropTo(target: object | null): Promise<void> {
        if (this.NarrowError) {
            throw this.NarrowError;
        }
        this.CroppedTo = target;
    }
    /** The user pressing the browser's "Stop sharing", or the shared surface closing. */
    public EndFromBrowser(): void {
        this.readyState = 'ended';
        this.dispatchEvent(new Event('ended'));
    }
}

/** A stream holding display tracks. */
export class FakeDisplayStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = 'fake-display-stream';
    public onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    public onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;

    constructor(private readonly tracks: MediaStreamTrack[]) {
        super();
    }
    public addTrack(track: MediaStreamTrack): void {
        this.tracks.push(track);
    }
    public clone(): MediaStream {
        return this;
    }
    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'audio');
    }
    public getTrackById(_id: string): MediaStreamTrack | null {
        return null;
    }
    public getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getVideoTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'video');
    }
    public removeTrack(_track: MediaStreamTrack): void {}
}

/** The stub picker: what it was asked, what it hands back, and how to make it fail. */
export interface FakeDisplayMedia {
    Requests: PickerRequest[];
    Track: FakeDisplayTrack;
    Stream: FakeDisplayStream;
    /** Makes the next request reject with this error, as closing the picker does. */
    RejectNextWith(error: Error): void;
}

/** Installs `navigator.mediaDevices.getDisplayMedia`, returning one shared surface per call. */
export function InstallFakeDisplayMedia(): FakeDisplayMedia {
    const track = new FakeDisplayTrack();
    let nextError: Error | null = null;
    const media: FakeDisplayMedia = {
        Requests: [],
        Track: track,
        Stream: new FakeDisplayStream([track]),
        RejectNextWith: (error) => {
            nextError = error;
        },
    };
    vi.stubGlobal('navigator', {
        mediaDevices: {
            getDisplayMedia: async (request: PickerRequest): Promise<MediaStream> => {
                media.Requests.push(request);
                if (nextError) {
                    const error = nextError;
                    nextError = null;
                    throw error;
                }
                return media.Stream;
            },
        },
    });
    return media;
}

/** A target handle the fake `fromElement` returns, naming the API that made it. */
export interface FakeCaptureTarget {
    Api: 'RestrictionTarget' | 'CropTarget';
    Element: Element;
}

/** Installs Chromium's `RestrictionTarget` (Element Capture) and/or `CropTarget` (Region Capture). */
export function InstallCaptureTargets(apis: { Element: boolean; Region: boolean }): void {
    if (apis.Element) {
        vi.stubGlobal('RestrictionTarget', {
            fromElement: async (element: Element): Promise<FakeCaptureTarget> => ({ Api: 'RestrictionTarget', Element: element }),
        });
    }
    if (apis.Region) {
        vi.stubGlobal('CropTarget', {
            fromElement: async (element: Element): Promise<FakeCaptureTarget> => ({ Api: 'CropTarget', Element: element }),
        });
    }
}

/** A `DOMException`-like error with the given name, as the picker rejects with. */
export function PickerError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
}
