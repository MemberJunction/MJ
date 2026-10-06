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
    public srcObject: MediaStream | null = null;
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

/** The base64 payload every fake canvas encodes to ("FRAME"). */
export const FAKE_FRAME_BASE64 = 'RlJBTUU=';

/** The elements created through the fake document, in creation order. */
export interface FakeDom {
    Videos: FakeVideoElement[];
    Canvases: FakeCanvasElement[];
}

/** Installs a fake `document` whose `createElement` makes {@link FakeVideoElement}s and {@link FakeCanvasElement}s. */
export function InstallFakeDom(): FakeDom {
    const dom: FakeDom = { Videos: [], Canvases: [] };
    vi.stubGlobal('document', {
        createElement: (tag: string): FakeVideoElement | FakeCanvasElement => {
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
