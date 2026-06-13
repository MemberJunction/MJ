/**
 * Test fakes for the CDP kit — no real browser, no network.
 *
 * `FakePlaywrightBrowserAdapter` records the computer-use actions handed to it and lets each test
 * script the outcome; `FakeCdpSessionBackend` records the backend hook calls and lets each test script
 * their results. Both are typed against the real classes/interfaces so the kit's call sites stay
 * honestly covered.
 */

import {
    ActionExecutionResult,
    BrowserAction,
    BrowserConfig,
    PlaywrightBrowserAdapter,
    ScreencastFrame,
} from '@memberjunction/computer-use';
import {
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
} from '@memberjunction/remote-browser-base';
import { ICdpSessionBackend } from '../cdp-session-backend';

/**
 * A minimal stand-in for {@link PlaywrightBrowserAdapter} that implements only the surface the kit
 * touches. Extends the real class (so it satisfies the kit's type expectations) but overrides every
 * method the kit calls; the un-overridden real methods are never invoked in these tests.
 */
export class FakePlaywrightBrowserAdapter extends PlaywrightBrowserAdapter {
    /** Configs passed to {@link Launch}, in order. */
    public LaunchedConfigs: BrowserConfig[] = [];
    /** Actions passed to {@link ExecuteAction}, in order. */
    public ExecutedActions: BrowserAction[] = [];
    /** URLs passed to {@link Navigate}, in order. */
    public NavigatedUrls: string[] = [];
    /** Count of {@link Close} calls. */
    public CloseCount = 0;
    /** Count of {@link StartScreencast} calls. */
    public StartScreencastCount = 0;
    /** Count of {@link StopScreencast} calls. */
    public StopScreencastCount = 0;

    /** The current URL reported by {@link CurrentUrl}. */
    public CurrentUrlValue = 'https://example.test/';
    /** Result returned from {@link ExecuteAction}; defaults to a success. */
    public NextExecuteResult: ActionExecutionResult | null = null;
    /** When set, {@link Navigate} rejects with this error. */
    public NavigateError: Error | null = null;
    /** When set, {@link ExecuteAction} rejects with this error. */
    public ExecuteError: Error | null = null;
    /** When set, {@link Close} rejects with this error. */
    public CloseError: Error | null = null;
    /** Captured `onFrame` callback from {@link StartScreencast}, so a test can drive frames. */
    public LastOnFrame: ((frame: ScreencastFrame) => void) | null = null;

    public override async Launch(config: BrowserConfig): Promise<void> {
        this.LaunchedConfigs.push(config);
    }

    public override async Navigate(url: string): Promise<void> {
        this.NavigatedUrls.push(url);
        if (this.NavigateError) {
            throw this.NavigateError;
        }
    }

    public override async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        this.ExecutedActions.push(action);
        if (this.ExecuteError) {
            throw this.ExecuteError;
        }
        if (this.NextExecuteResult) {
            return this.NextExecuteResult;
        }
        const result = new ActionExecutionResult(action);
        result.Success = true;
        return result;
    }

    public override async CaptureScreenshot(): Promise<string> {
        return 'BASE64SCREENSHOT';
    }

    public override async Close(): Promise<void> {
        this.CloseCount++;
        if (this.CloseError) {
            throw this.CloseError;
        }
    }

    public override async StartScreencast(
        onFrame: (frame: ScreencastFrame) => void,
    ): Promise<void> {
        this.StartScreencastCount++;
        this.LastOnFrame = onFrame;
    }

    public override async StopScreencast(): Promise<void> {
        this.StopScreencastCount++;
    }

    public override get CurrentUrl(): string {
        return this.CurrentUrlValue;
    }
}

/**
 * A fake {@link ICdpSessionBackend} that records calls and lets a test script each result. By default
 * the capability-gated hooks throw {@link RemoteBrowserCapabilityNotSupportedError} (the fail-closed
 * default for a backend without that capability).
 */
export class FakeCdpSessionBackend implements ICdpSessionBackend {
    /** Count of {@link Release} calls. */
    public ReleaseCount = 0;
    /** Count of {@link GetLiveViewUrl} calls. */
    public GetLiveViewUrlCount = 0;
    /** Intents passed to {@link InvokeNativeAIControl}, in order. */
    public InvokedIntents: string[] = [];

    /** When set, {@link GetLiveViewUrl} resolves to this instead of throwing. */
    public LiveViewUrl: string | null = null;
    /** When set, {@link InvokeNativeAIControl} resolves to this instead of throwing. */
    public NativeAIResult: RemoteBrowserActionResult | null = null;
    /** When set, {@link Release} rejects with this error. */
    public ReleaseError: Error | null = null;

    public async GetLiveViewUrl(): Promise<string> {
        this.GetLiveViewUrlCount++;
        if (this.LiveViewUrl === null) {
            throw new RemoteBrowserCapabilityNotSupportedError('LiveView', 'FakeBackend');
        }
        return this.LiveViewUrl;
    }

    public async InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult> {
        this.InvokedIntents.push(intent);
        if (this.NativeAIResult === null) {
            throw new RemoteBrowserCapabilityNotSupportedError('NativeAIControl', 'FakeBackend');
        }
        return this.NativeAIResult;
    }

    public async Release(): Promise<void> {
        this.ReleaseCount++;
        if (this.ReleaseError) {
            throw this.ReleaseError;
        }
    }
}
