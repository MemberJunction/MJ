/**
 * The shared CDP {@link IRemoteBrowserSession} implementation — implemented ONCE here and reused by all
 * 5 Remote Browser drivers via {@link import('./base-cdp-remote-browser-provider').BaseCdpRemoteBrowserProvider}.
 *
 * The session is a thin, strongly-typed adapter between the Base session contract and the enriched
 * `@memberjunction/computer-use` `PlaywrightBrowserAdapter`:
 * - Core methods translate Base actions to computer-use actions (see {@link mapRemoteBrowserAction})
 *   and run them through the already-connected adapter, mapping results back to the Base shape.
 * - Capability-gated methods (`StartScreencast`/`StopScreencast`, `RouteHumanInput`, `GetLiveViewUrl`,
 *   `InvokeNativeAIControl`) check the backend's feature flag first and throw
 *   {@link RemoteBrowserCapabilityNotSupportedError} when off; live-view and native-AI delegate to the
 *   driver-supplied {@link ICdpSessionBackend}.
 *
 * @see `packages/AI/RemoteBrowser/Base/src/remote-browser-session.ts` for the contract this implements.
 */

import { LogError } from '@memberjunction/core';
import {
    IRemoteBrowserProviderFeatures,
    IRemoteBrowserSession,
    RemoteBrowserAction,
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
    RemoteBrowserHumanInput,
    RemoteBrowserScreencastFrame,
} from '@memberjunction/remote-browser-base';
import {
    ActionExecutionResult,
    PlaywrightBrowserAdapter,
    ScreencastFrame,
} from '@memberjunction/computer-use';
import { mapHumanInput, mapRemoteBrowserAction } from './map-action';
import { ICdpSessionBackend } from './cdp-session-backend';

/**
 * The shared, CDP-backed live remote-browser session. Constructed by
 * {@link import('./base-cdp-remote-browser-provider').BaseCdpRemoteBrowserProvider.Connect} with an
 * already-launched (CDP-attached) {@link PlaywrightBrowserAdapter}, the CDP endpoint string, the
 * backend's capability flags, and the driver's {@link ICdpSessionBackend} hooks.
 */
export class CdpRemoteBrowserSession implements IRemoteBrowserSession {
    /**
     * The connected computer-use adapter that performs all real CDP I/O. Held privately; subclasses /
     * backends reach perception via {@link CdpRemoteBrowserSession.Adapter}.
     */
    private readonly adapter: PlaywrightBrowserAdapter;

    /** The CDP endpoint this session is attached to (returned by {@link CdpRemoteBrowserSession.GetCdpEndpoint}). */
    private readonly cdpEndpoint: string;

    /** The backend's capability flags; gate every capability-gated method below. */
    private readonly features: IRemoteBrowserProviderFeatures;

    /** Driver-supplied hooks for the backend-specific session concerns (live-view, native-AI, release). */
    private readonly backend: ICdpSessionBackend;

    /** The backend display name, used only in capability-error messages. */
    private readonly providerName: string;

    /**
     * Constructs a {@link CdpRemoteBrowserSession}.
     *
     * @param adapter A {@link PlaywrightBrowserAdapter} already launched and attached to the backend's CDP endpoint.
     * @param cdpEndpoint The CDP connect endpoint URL the adapter is attached to.
     * @param features The backend's capability flags (drives capability gating).
     * @param backend The driver-supplied backend hooks for live-view / native-AI / release.
     * @param providerName Optional backend display name for capability-error messages.
     */
    constructor(
        adapter: PlaywrightBrowserAdapter,
        cdpEndpoint: string,
        features: IRemoteBrowserProviderFeatures,
        backend: ICdpSessionBackend,
        providerName: string = '',
    ) {
        this.adapter = adapter;
        this.cdpEndpoint = cdpEndpoint;
        this.features = features ?? {};
        this.backend = backend;
        this.providerName = providerName;
    }

    /**
     * The connected computer-use adapter, exposed to subclasses / backends that need raw perception
     * (`GetVisibleText`, `GetAccessibilitySnapshot`, `QueryElement`) beyond the Base session surface.
     * Protected: not part of the public {@link IRemoteBrowserSession} contract.
     */
    protected get Adapter(): PlaywrightBrowserAdapter {
        return this.adapter;
    }

    // ── Core (universal CDP substrate) ──────────────────────────────────────────

    /**
     * @inheritdoc
     */
    public GetCdpEndpoint(): string {
        return this.cdpEndpoint;
    }

    /**
     * @inheritdoc
     */
    public async Navigate(url: string): Promise<RemoteBrowserActionResult> {
        // The adapter's Navigate returns void and throws on failure, so we build the Base result here.
        try {
            await this.adapter.Navigate(url);
            // Force an immediate live-view frame: CDP only emits a screencast frame on a repaint, so the
            // first navigation can otherwise leave the user staring at a blank surface (best-effort).
            await this.pushImmediateFrame();
            return { Success: true, CurrentUrl: this.adapter.CurrentUrl };
        } catch (err) {
            return {
                Success: false,
                CurrentUrl: this.adapter.CurrentUrl,
                Detail: this.errorDetail(err),
            };
        }
    }

    /**
     * @inheritdoc
     */
    public async ExecuteAction(action: RemoteBrowserAction): Promise<RemoteBrowserActionResult> {
        const result = await this.adapter.ExecuteAction(mapRemoteBrowserAction(action));
        // After a navigation-class action settles, force a fresh frame so the live view reflects the new
        // page immediately even if CDP hasn't fired a repaint frame yet (best-effort; the agent narrates
        // "I opened the page" and the user should SEE it without waiting for the next incidental repaint).
        if (result.Success && this.isNavigationAction(action)) {
            await this.pushImmediateFrame();
        }
        return this.toActionResult(result);
    }

    /**
     * @inheritdoc
     */
    public async CaptureScreenshot(): Promise<string> {
        return this.adapter.CaptureScreenshot();
    }

    /**
     * @inheritdoc
     */
    public GetCurrentUrl(): string {
        return this.adapter.CurrentUrl;
    }

    /**
     * @inheritdoc
     */
    public async Close(): Promise<void> {
        // Close the browser adapter first, then release the backend resources. Both are best-effort:
        // a failure in one must not prevent the other from running, so teardown is always complete.
        try {
            await this.adapter.Close();
        } catch (err) {
            LogError(`CdpRemoteBrowserSession.Close: adapter.Close failed: ${this.errorDetail(err)}`);
        }
        try {
            await this.backend.Release();
        } catch (err) {
            LogError(`CdpRemoteBrowserSession.Close: backend.Release failed: ${this.errorDetail(err)}`);
        }
    }

    // ── Capability-gated (engine checks SupportedFeatures first; we re-check defensively) ──

    /**
     * @inheritdoc
     */
    public async StartScreencast(
        onFrame: (frame: RemoteBrowserScreencastFrame) => void,
    ): Promise<void> {
        this.requireFeature('ScreenStreaming');
        await this.adapter.StartScreencast((frame) => onFrame(this.mapScreencastFrame(frame)));
        // Push an immediate first frame so the user sees the current page the moment the stream starts,
        // rather than a blank surface until the page next repaints (CDP only emits frames on a repaint).
        await this.pushImmediateFrame();
    }

    /**
     * @inheritdoc
     */
    public async StopScreencast(): Promise<void> {
        this.requireFeature('ScreenStreaming');
        await this.adapter.StopScreencast();
    }

    /**
     * @inheritdoc
     *
     * Fire-and-forget by contract (the Base signature returns `void`): the human-takeover input is
     * mapped to a computer-use action and dispatched on the adapter, but we do not await it. Any
     * rejection is logged and swallowed so a single dropped pointer/key event never tears down the
     * takeover stream.
     */
    public RouteHumanInput(input: RemoteBrowserHumanInput): void {
        this.requireFeature('HumanTakeover');
        void this.adapter.ExecuteAction(mapHumanInput(input)).catch((err: unknown) => {
            LogError(`CdpRemoteBrowserSession.RouteHumanInput failed: ${this.errorDetail(err)}`);
        });
    }

    /**
     * @inheritdoc
     */
    public async GetLiveViewUrl(): Promise<string> {
        this.requireFeature('LiveView');
        return this.backend.GetLiveViewUrl();
    }

    /**
     * @inheritdoc
     */
    public async InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult> {
        this.requireFeature('NativeAIControl');
        return this.backend.InvokeNativeAIControl(intent);
    }

    // ── Internal helpers ────────────────────────────────────────────────────────

    /**
     * Best-effort: ask the adapter to capture and push ONE on-demand screencast frame through the active
     * stream. Used right after the stream starts and after a navigation settles so the live view refreshes
     * immediately, working around CDP's "frames only on repaint" behavior. A no-op on the adapter when no
     * screencast is running; any failure is logged and swallowed so a missed frame never breaks an action.
     */
    private async pushImmediateFrame(): Promise<void> {
        try {
            await this.adapter.CaptureScreencastFrame();
        } catch (err) {
            LogError(`CdpRemoteBrowserSession.pushImmediateFrame failed (non-fatal): ${this.errorDetail(err)}`);
        }
    }

    /**
     * True when an action changes the page such that the live view should be force-refreshed: navigation,
     * history back/forward. Clicks/typing/scrolls repaint on their own and don't need the forced frame.
     *
     * @param action The Base action just executed.
     * @returns Whether to push an immediate post-action frame.
     */
    private isNavigationAction(action: RemoteBrowserAction): boolean {
        return action.Kind === 'navigate' || action.Kind === 'back' || action.Kind === 'forward';
    }

    /**
     * Maps a computer-use {@link ActionExecutionResult} to the Base {@link RemoteBrowserActionResult}.
     * `CurrentUrl` is read from the adapter (the freshest value post-action); `Detail` carries the
     * adapter's error string on failure.
     *
     * @param result The computer-use execution result.
     * @returns The equivalent Base action result.
     */
    private toActionResult(result: ActionExecutionResult): RemoteBrowserActionResult {
        return {
            Success: result.Success,
            CurrentUrl: this.adapter.CurrentUrl,
            Detail: result.Error,
        };
    }

    /**
     * Maps a computer-use {@link ScreencastFrame} to the Base {@link RemoteBrowserScreencastFrame}. The
     * two shapes are identical (DataBase64 / Width / Height / SequenceNumber); this keeps the Base
     * package free of any computer-use dependency.
     *
     * @param frame The computer-use screencast frame.
     * @returns The equivalent Base screencast frame.
     */
    private mapScreencastFrame(frame: ScreencastFrame): RemoteBrowserScreencastFrame {
        return {
            DataBase64: frame.DataBase64,
            Width: frame.Width,
            Height: frame.Height,
            SequenceNumber: frame.SequenceNumber,
        };
    }

    /**
     * Defense-in-depth capability gate: throws {@link RemoteBrowserCapabilityNotSupportedError} when the
     * named feature flag is not enabled. Mirrors the driver's `RequireFeature` so a metadata flag that
     * lied — or a caller that bypassed the engine's gate — fails loudly here.
     *
     * @param featureName The capability flag to require.
     * @throws {RemoteBrowserCapabilityNotSupportedError} when the flag is not `true`.
     */
    private requireFeature(featureName: keyof IRemoteBrowserProviderFeatures): void {
        if (this.features[featureName] !== true) {
            throw new RemoteBrowserCapabilityNotSupportedError(
                String(featureName),
                this.providerName || 'CdpRemoteBrowserSession',
            );
        }
    }

    /**
     * Extracts a human-readable detail string from an unknown thrown value.
     *
     * @param err The caught value.
     * @returns The error message when `err` is an `Error`, otherwise its string form.
     */
    private errorDetail(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
