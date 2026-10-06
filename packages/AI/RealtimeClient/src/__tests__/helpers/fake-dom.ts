/**
 * A minimal DOM for code that draws video frames onto a canvas. `document.createElement('video')` and
 * `('canvas')` return fakes that record what was drawn and encoded. Install it with {@link InstallFakeDom};
 * remove it with `vi.unstubAllGlobals()`.
 */
import { vi } from 'vitest';

/** Stands in for the hidden `<video>` a sampler plays the stream in. */
export class FakeVideoElement {
    public muted = false;
    public playsInline = false;
    public autoplay = false;
    public srcObject: MediaStream | null = null;
    public src = '';
    public disableRemotePlayback = false;
    /** `HTMLMediaElement.readyState`; 4 (enough data) unless a test says the element is waiting. */
    public readyState = 4;
    public ended = false;
    /** How many times `currentTime` was set (a seek). */
    public Seeks = 0;
    private time = 0;
    /** How many times `load()` reset the element. */
    public Loads = 0;
    /** The current frame's size. Zero until the test says the stream has produced a frame. */
    public videoWidth = 0;
    public videoHeight = 0;
    public Paused = true;

    public play(): Promise<void> {
        this.Paused = false;
        return Promise.resolve();
    }

    public pause(): void {
        this.Paused = true;
    }

    public get paused(): boolean {
        return this.Paused;
    }

    public removeAttribute(name: string): void {
        if (name === 'src') {
            this.src = '';
        }
    }

    public load(): void {
        this.Loads++;
    }

    public get currentTime(): number {
        return this.time;
    }

    public set currentTime(value: number) {
        this.time = value;
        this.Seeks++;
    }

    /** Simulates the stream producing frames of the given size. */
    public SetFrameSize(width: number, height: number): void {
        this.videoWidth = width;
        this.videoHeight = height;
    }
}

/** Stands in for the `<canvas>` a sampler draws and encodes frames on. */
export class FakeCanvasElement {
    public width = 300;
    public height = 150;
    /** The size each frame was drawn at. */
    public readonly Draws: Array<{ Width: number; Height: number }> = [];
    /** The format and quality each frame was encoded with. */
    public readonly Encodes: Array<{ MimeType: string; Quality: number | undefined }> = [];

    public getContext(kind: string): { drawImage: (source: FakeVideoElement, x: number, y: number, width: number, height: number) => void } | null {
        if (kind !== '2d') {
            return null;
        }
        return {
            drawImage: (_source, _x, _y, width, height) => {
                this.Draws.push({ Width: width, Height: height });
            },
        };
    }

    public toDataURL(mimeType: string, quality?: number): string {
        this.Encodes.push({ MimeType: mimeType, Quality: quality });
        return `data:${mimeType};base64,${FAKE_FRAME_BASE64}`;
    }
}

/** Stands in for a page panel (a `<div>`); `Isolation` is what `getComputedStyle(...).isolation` reports. */
export class FakePanelElement {
    public Isolation = 'auto';
}

/** The base64 payload every fake canvas encodes to ("FRAME"). */
export const FAKE_FRAME_BASE64 = 'RlJBTUU=';

/** The elements created through the fake document, in creation order. */
export interface FakeDom {
    Videos: FakeVideoElement[];
    Canvases: FakeCanvasElement[];
    Panels: FakePanelElement[];
}

/**
 * Installs a fake `document` whose `createElement` makes {@link FakeVideoElement}s, {@link FakeCanvasElement}s
 * and (for `'div'`) {@link FakePanelElement}s, and a `getComputedStyle` that reads a panel's `Isolation`.
 */
export function InstallFakeDom(): FakeDom {
    const dom: FakeDom = { Videos: [], Canvases: [], Panels: [] };
    vi.stubGlobal('getComputedStyle', (element: FakePanelElement): { isolation: string } => ({ isolation: element.Isolation }));
    vi.stubGlobal('document', {
        createElement: (tag: string): FakeVideoElement | FakeCanvasElement | FakePanelElement => {
            if (tag === 'div') {
                const panel = new FakePanelElement();
                dom.Panels.push(panel);
                return panel;
            }
            if (tag === 'video') {
                const video = new FakeVideoElement();
                dom.Videos.push(video);
                return video;
            }
            if (tag === 'canvas') {
                const canvas = new FakeCanvasElement();
                dom.Canvases.push(canvas);
                return canvas;
            }
            throw new Error(`The fake DOM cannot create <${tag}>.`);
        },
    });
    return dom;
}
