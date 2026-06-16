import { describe, it, expect } from 'vitest';
import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
    ScreencastFrame,
    AudioCaptureChunk,
} from '../types/browser.js';

// A minimal concrete adapter that only implements the abstract members, leaving
// the new perception/screencast methods at their BaseBrowserAdapter defaults.
// This verifies those defaults are additive and non-throwing for adapters that
// don't override them.
class MinimalAdapter extends BaseBrowserAdapter {
    public async Launch(_config: BrowserConfig): Promise<void> {}
    public async Close(): Promise<void> {}
    public async Navigate(_url: string): Promise<void> {}
    public async CaptureScreenshot(): Promise<string> {
        return '';
    }
    public async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        return new ActionExecutionResult(action);
    }
    public async SetExtraHeaders(_domain: string, _headers: Record<string, string>): Promise<void> {}
    public async SetCookies(_cookies: CookieEntry[]): Promise<void> {}
    public async SetLocalStorage(_domain: string, _entries: Record<string, string>): Promise<void> {}
    public get CurrentUrl(): string {
        return '';
    }
    public get IsOpen(): boolean {
        return false;
    }
    public get ViewportWidth(): number {
        return 0;
    }
    public get ViewportHeight(): number {
        return 0;
    }
}

describe('BaseBrowserAdapter — additive perception/screencast defaults', () => {
    it('GetTitle defaults to empty string', async () => {
        await expect(new MinimalAdapter().GetTitle()).resolves.toBe('');
    });

    it('WaitForLoadState defaults to a no-op resolve', async () => {
        await expect(new MinimalAdapter().WaitForLoadState('load')).resolves.toBeUndefined();
    });

    it('GetAccessibilitySnapshot defaults to null', async () => {
        await expect(new MinimalAdapter().GetAccessibilitySnapshot()).resolves.toBeNull();
    });

    it('QueryElement defaults to not-found', async () => {
        const info = await new MinimalAdapter().QueryElement('#x');
        expect(info.Exists).toBe(false);
        expect(info.Visible).toBe(false);
        expect(info.Text).toBe('');
        expect(info.BoundingBox).toBeUndefined();
    });

    it('StartScreencast defaults to a no-op resolve (emits no frames, never throws)', async () => {
        const frames: ScreencastFrame[] = [];
        await expect(new MinimalAdapter().StartScreencast(f => frames.push(f))).resolves.toBeUndefined();
        expect(frames).toHaveLength(0);
    });

    it('StopScreencast defaults to a no-op resolve', async () => {
        await expect(new MinimalAdapter().StopScreencast()).resolves.toBeUndefined();
    });

    it('StartAudioCapture defaults to a no-op resolve (emits no chunks, never throws)', async () => {
        const chunks: AudioCaptureChunk[] = [];
        await expect(new MinimalAdapter().StartAudioCapture(c => chunks.push(c))).resolves.toBeUndefined();
        expect(chunks).toHaveLength(0);
    });

    it('StopAudioCapture defaults to a no-op resolve', async () => {
        await expect(new MinimalAdapter().StopAudioCapture()).resolves.toBeUndefined();
    });

    it('AudioCaptureChunk has sensible webm-opus defaults', () => {
        const chunk = new AudioCaptureChunk();
        expect(chunk.Codec).toBe('webm-opus');
        expect(chunk.SampleRate).toBe(48000);
        expect(chunk.Channels).toBe(2);
        expect(chunk.SequenceNumber).toBe(0);
        expect(chunk.DataBase64).toBe('');
    });
});
