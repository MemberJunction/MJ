import { describe, it, expect, beforeEach } from 'vitest';
import {
    IRemoteBrowserProviderFeatures,
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
    RemoteBrowserScreencastFrame,
} from '@memberjunction/remote-browser-base';
import { ActionExecutionResult, ClickAction, ScreencastFrame, TypeAction } from '@memberjunction/computer-use';
import { RemoteBrowserAudioChunk } from '@memberjunction/remote-browser-base';
import { CdpRemoteBrowserSession } from '../cdp-remote-browser-session';
import { FakeCdpSessionBackend, FakePlaywrightBrowserAdapter, LoopbackAudioCdpSessionBackend } from './fakes';

/** Builds a session over fresh fakes with the given feature flags. */
function buildSession(
    features: IRemoteBrowserProviderFeatures,
): {
    session: CdpRemoteBrowserSession;
    adapter: FakePlaywrightBrowserAdapter;
    backend: FakeCdpSessionBackend;
} {
    const adapter = new FakePlaywrightBrowserAdapter();
    const backend = new FakeCdpSessionBackend();
    const session = new CdpRemoteBrowserSession(
        adapter,
        'ws://cdp.test/endpoint',
        features,
        backend,
        'FakeProvider',
    );
    return { session, adapter, backend };
}

describe('CdpRemoteBrowserSession — core', () => {
    let adapter: FakePlaywrightBrowserAdapter;
    let backend: FakeCdpSessionBackend;
    let session: CdpRemoteBrowserSession;

    beforeEach(() => {
        ({ session, adapter, backend } = buildSession({}));
    });

    it('GetCdpEndpoint returns the endpoint it was constructed with', () => {
        expect(session.GetCdpEndpoint()).toBe('ws://cdp.test/endpoint');
    });

    it('Navigate delegates to the adapter and reports success + current URL', async () => {
        adapter.CurrentUrlValue = 'https://landed.test/';
        const result = await session.Navigate('https://go.test/');
        expect(adapter.NavigatedUrls).toEqual(['https://go.test/']);
        expect(result).toEqual<RemoteBrowserActionResult>({
            Success: true,
            CurrentUrl: 'https://landed.test/',
        });
    });

    it('Navigate maps an adapter failure to a failed result with Detail', async () => {
        adapter.NavigateError = new Error('boom');
        const result = await session.Navigate('https://go.test/');
        expect(result.Success).toBe(false);
        expect(result.Detail).toBe('boom');
    });

    it('ExecuteAction maps the Base action through and maps the result back', async () => {
        adapter.CurrentUrlValue = 'https://after.test/';
        const failure = new ActionExecutionResult(new ClickAction());
        failure.Success = false;
        failure.Error = 'element not found';
        adapter.NextExecuteResult = failure;

        const result = await session.ExecuteAction({ Kind: 'click', Selector: '#x' });

        // The mapped computer-use action reached the adapter.
        expect(adapter.ExecutedActions[0]).toBeInstanceOf(ClickAction);
        expect((adapter.ExecutedActions[0] as ClickAction).Selector).toBe('#x');
        // The result was mapped back to the Base shape with the current URL and error detail.
        expect(result).toEqual<RemoteBrowserActionResult>({
            Success: false,
            CurrentUrl: 'https://after.test/',
            Detail: 'element not found',
        });
    });

    it('CaptureScreenshot delegates to the adapter', async () => {
        expect(await session.CaptureScreenshot()).toBe('BASE64SCREENSHOT');
    });

    it('GetCurrentUrl reads the adapter URL', () => {
        adapter.CurrentUrlValue = 'https://now.test/';
        expect(session.GetCurrentUrl()).toBe('https://now.test/');
    });

    it('Close closes the adapter then releases the backend', async () => {
        await session.Close();
        expect(adapter.CloseCount).toBe(1);
        expect(backend.ReleaseCount).toBe(1);
    });

    it('Close still releases the backend even when adapter.Close throws', async () => {
        adapter.CloseError = new Error('close failed');
        await session.Close();
        expect(backend.ReleaseCount).toBe(1);
    });
});

describe('CdpRemoteBrowserSession — capability gating (flags OFF → throw)', () => {
    let session: CdpRemoteBrowserSession;

    beforeEach(() => {
        ({ session } = buildSession({}));
    });

    it('StartScreencast throws when ScreenStreaming is off', async () => {
        await expect(session.StartScreencast(() => undefined)).rejects.toBeInstanceOf(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });

    it('StopScreencast throws when ScreenStreaming is off', async () => {
        await expect(session.StopScreencast()).rejects.toBeInstanceOf(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });

    it('RouteHumanInput throws when HumanTakeover is off', () => {
        expect(() => session.RouteHumanInput({ Kind: 'pointer-move', X: 1, Y: 1 })).toThrow(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });

    it('GetLiveViewUrl throws when LiveView is off', async () => {
        await expect(session.GetLiveViewUrl()).rejects.toBeInstanceOf(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });

    it('InvokeNativeAIControl throws when NativeAIControl is off', async () => {
        await expect(session.InvokeNativeAIControl('do it')).rejects.toBeInstanceOf(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });

    it('GetSelectionText throws when HumanTakeover is off', async () => {
        await expect(session.GetSelectionText()).rejects.toBeInstanceOf(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });
});

describe('CdpRemoteBrowserSession — capability gating (flags ON → delegate)', () => {
    it('StartScreencast delegates and maps frames; StopScreencast delegates', async () => {
        const { session, adapter } = buildSession({ ScreenStreaming: true });
        const received: RemoteBrowserScreencastFrame[] = [];

        await session.StartScreencast((frame) => received.push(frame));
        expect(adapter.StartScreencastCount).toBe(1);
        expect(adapter.LastOnFrame).not.toBeNull();
        // An immediate first frame is force-pushed so the user sees the page right away (Bug 1).
        expect(adapter.CaptureScreencastFrameCount).toBe(1);

        // Drive a computer-use frame through the captured callback and confirm the mapping.
        const cuFrame = new ScreencastFrame();
        cuFrame.DataBase64 = 'FRAME';
        cuFrame.Width = 640;
        cuFrame.Height = 480;
        cuFrame.SequenceNumber = 7;
        adapter.LastOnFrame?.(cuFrame);

        expect(received).toEqual<RemoteBrowserScreencastFrame[]>([
            { DataBase64: 'FRAME', Width: 640, Height: 480, SequenceNumber: 7 },
        ]);

        await session.StopScreencast();
        expect(adapter.StopScreencastCount).toBe(1);
    });

    it('RouteHumanInput delegates a mapped action to the adapter (fire-and-forget)', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        session.RouteHumanInput({ Kind: 'pointer-click', X: 9, Y: 9, Button: 'middle' });
        // Allow the fire-and-forget microtask to settle.
        await Promise.resolve();
        expect(adapter.ExecutedActions[0]).toBeInstanceOf(ClickAction);
        const click = adapter.ExecutedActions[0] as ClickAction;
        expect(click.X).toBe(9);
        expect(click.Button).toBe('middle');
    });

    it('RouteHumanInput swallows an adapter rejection (does not throw)', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        adapter.ExecuteError = new Error('input dropped');
        expect(() => session.RouteHumanInput({ Kind: 'key', Key: 'A' })).not.toThrow();
        await Promise.resolve();
    });

    it('GetLiveViewUrl delegates to the backend', async () => {
        const { session, backend } = buildSession({ LiveView: true });
        backend.LiveViewUrl = 'https://live.test/view';
        expect(await session.GetLiveViewUrl()).toBe('https://live.test/view');
        expect(backend.GetLiveViewUrlCount).toBe(1);
    });

    it('InvokeNativeAIControl delegates the intent to the backend', async () => {
        const { session, backend } = buildSession({ NativeAIControl: true });
        backend.NativeAIResult = { Success: true, CurrentUrl: 'https://done.test/' };
        const result = await session.InvokeNativeAIControl('log in');
        expect(backend.InvokedIntents).toEqual(['log in']);
        expect(result.Success).toBe(true);
    });

    it('RouteHumanInput carries click modifiers (shift-click) through to the adapter action', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        session.RouteHumanInput({ Kind: 'pointer-click', X: 5, Y: 6, Modifiers: ['Shift'] });
        await Promise.resolve();
        const click = adapter.ExecutedActions[0] as ClickAction;
        expect(click.Modifiers).toEqual(['Shift']);
    });

    it('RouteHumanInput maps pointer-down/up to the adapter drag actions', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        session.RouteHumanInput({ Kind: 'pointer-down', X: 1, Y: 2 });
        session.RouteHumanInput({ Kind: 'pointer-up', X: 3, Y: 4 });
        await Promise.resolve();
        await Promise.resolve();
        expect(adapter.ExecutedActions.map((a) => a.Type)).toEqual(['MouseDown', 'MouseUp']);
    });

    it('RouteHumanInput maps a text (paste) input to a TypeAction on the adapter', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        session.RouteHumanInput({ Kind: 'text', Text: 'pasted text' });
        await Promise.resolve();
        expect(adapter.ExecutedActions[0]).toBeInstanceOf(TypeAction);
        expect((adapter.ExecutedActions[0] as TypeAction).Text).toBe('pasted text');
    });

    it('GetSelectionText (copy-out) reads the adapter selection when HumanTakeover is on', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        adapter.SelectionTextValue = 'the remote selection';
        expect(await session.GetSelectionText()).toBe('the remote selection');
    });

    it('GetSelectionText degrades to "" when the adapter read fails (best-effort)', async () => {
        const { session, adapter } = buildSession({ HumanTakeover: true });
        adapter.GetSelectionTextError = new Error('selection read failed');
        expect(await session.GetSelectionText()).toBe('');
    });
});

describe('CdpRemoteBrowserSession — audio streaming', () => {
    /** Builds a session whose backend supports audio capture (the loopback backend). */
    function buildAudioSession(): {
        session: CdpRemoteBrowserSession;
        adapter: FakePlaywrightBrowserAdapter;
        backend: LoopbackAudioCdpSessionBackend;
    } {
        const adapter = new FakePlaywrightBrowserAdapter();
        const backend = new LoopbackAudioCdpSessionBackend();
        const session = new CdpRemoteBrowserSession(adapter, 'ws://cdp.test/endpoint', {}, backend, 'LoopbackProvider');
        return { session, adapter, backend };
    }

    it('StartAudioStream throws when the backend has no StartAudioCapture hook', async () => {
        const adapter = new FakePlaywrightBrowserAdapter();
        const backend = new FakeCdpSessionBackend(); // no StartAudioCapture
        const session = new CdpRemoteBrowserSession(adapter, 'ws://cdp.test/endpoint', {}, backend, 'NoAudioProvider');
        await expect(session.StartAudioStream(() => undefined)).rejects.toBeInstanceOf(
            RemoteBrowserCapabilityNotSupportedError,
        );
    });

    it('StopAudioStream throws when the backend has no StartAudioCapture hook', async () => {
        const adapter = new FakePlaywrightBrowserAdapter();
        const backend = new FakeCdpSessionBackend();
        const session = new CdpRemoteBrowserSession(adapter, 'ws://cdp.test/endpoint', {}, backend, 'NoAudioProvider');
        await expect(session.StopAudioStream()).rejects.toBeInstanceOf(RemoteBrowserCapabilityNotSupportedError);
    });

    it('StartAudioStream delegates to the backend (threading the adapter) and forwards chunks', async () => {
        const { session, adapter, backend } = buildAudioSession();
        const received: RemoteBrowserAudioChunk[] = [];

        await session.StartAudioStream((chunk) => received.push(chunk));

        expect(backend.StartAudioCaptureCount).toBe(1);
        expect(backend.LastAdapter).toBe(adapter); // the connected adapter was threaded to the backend
        // The loopback backend emits one synthetic chunk on start.
        expect(received).toEqual<RemoteBrowserAudioChunk[]>([
            { DataBase64: 'TE9PUEJBQ0s=', Codec: 'webm-opus', SampleRate: 48000, Channels: 2, SequenceNumber: 0 },
        ]);

        // A subsequent backend chunk flows through to the same callback.
        backend.LastOnChunk?.({ DataBase64: 'TkVYVA==', Codec: 'webm-opus', SampleRate: 48000, Channels: 2, SequenceNumber: 1 });
        expect(received).toHaveLength(2);
        expect(received[1].SequenceNumber).toBe(1);
    });

    it('StartAudioStream is idempotent — a second call does not stack a second capture', async () => {
        const { session, backend } = buildAudioSession();
        await session.StartAudioStream(() => undefined);
        await session.StartAudioStream(() => undefined);
        expect(backend.StartAudioCaptureCount).toBe(1);
    });

    it('StopAudioStream stops the active capture handle', async () => {
        const { session, backend } = buildAudioSession();
        await session.StartAudioStream(() => undefined);
        await session.StopAudioStream();
        expect(backend.StopCount).toBe(1);
        // After stopping, a re-start is allowed (no longer idempotent-blocked).
        await session.StartAudioStream(() => undefined);
        expect(backend.StartAudioCaptureCount).toBe(2);
    });

    it('Close tears down an active audio capture before releasing the backend', async () => {
        const { session, backend } = buildAudioSession();
        await session.StartAudioStream(() => undefined);
        await session.Close();
        expect(backend.StopCount).toBe(1);
        expect(backend.ReleaseCount).toBe(1);
    });
});

describe('CdpRemoteBrowserSession — immediate frame on navigation (Bug 1)', () => {
    it('Navigate force-pushes an immediate frame after the page loads', async () => {
        const { session, adapter } = buildSession({});
        await session.Navigate('https://go.test/');
        expect(adapter.CaptureScreencastFrameCount).toBe(1);
    });

    it('ExecuteAction force-pushes a frame for a navigation action (navigate)', async () => {
        const { session, adapter } = buildSession({});
        await session.ExecuteAction({ Kind: 'navigate', Url: 'https://go.test/' });
        expect(adapter.CaptureScreencastFrameCount).toBe(1);
    });

    it('ExecuteAction force-pushes a frame for back/forward', async () => {
        const { session, adapter } = buildSession({});
        await session.ExecuteAction({ Kind: 'back' });
        await session.ExecuteAction({ Kind: 'forward' });
        expect(adapter.CaptureScreencastFrameCount).toBe(2);
    });

    it('ExecuteAction does NOT force a frame for a non-navigation action (click)', async () => {
        const { session, adapter } = buildSession({});
        await session.ExecuteAction({ Kind: 'click', X: 1, Y: 1 });
        expect(adapter.CaptureScreencastFrameCount).toBe(0);
    });

    it('ExecuteAction does NOT force a frame when the navigation action failed', async () => {
        const { session, adapter } = buildSession({});
        const failure = new ActionExecutionResult(new ClickAction());
        failure.Success = false;
        adapter.NextExecuteResult = failure;
        await session.ExecuteAction({ Kind: 'navigate', Url: 'https://go.test/' });
        expect(adapter.CaptureScreencastFrameCount).toBe(0);
    });
});
