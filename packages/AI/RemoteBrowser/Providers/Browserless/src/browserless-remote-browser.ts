/**
 * @fileoverview `BrowserlessRemoteBrowser` — the Browserless backend driver for the MemberJunction
 * Remote Browser channel. Browserless is a CDP-as-a-service: it hands back a CDP connect endpoint and a
 * hosted debug viewer URL, and the shared {@link BaseCdpRemoteBrowserProvider} does all the actual CDP
 * work. This driver therefore answers only the one backend-specific question — *how do I obtain a CDP
 * endpoint + its live-view/release hooks for Browserless?* — via the injectable {@link IBrowserlessClient}
 * seam, so it builds and unit-tests with **no network and no real Browserless account**.
 *
 * Capability coverage (the Browserless seed row): `RawCdpControl`, `LiveView`, `ScreenStreaming`,
 * `SessionRecording`, `ProxyEgress`, `MultiTab`, `FileDownloads`. Browserless has **no human-takeover
 * grab-the-wheel plane and no first-party AI-control harness**, so `HumanTakeover` and `NativeAIControl`
 * are off and {@link BrowserlessSessionBackend.InvokeNativeAIControl} throws
 * {@link RemoteBrowserCapabilityNotSupportedError}. With no takeover, the provider default control mode
 * is `ViewOnly` (the agent drives; humans watch the hosted live view).
 *
 * @module @memberjunction/remote-browser-browserless
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import {
    AcquiredCdpSession,
    BaseCdpRemoteBrowserProvider,
    ICdpSessionBackend,
} from '@memberjunction/remote-browser-cdp';
import {
    BrowserlessClientFactory,
    BrowserlessCreateSessionOptions,
    IBrowserlessClient,
} from './browserless-client';

/**
 * The `DriverClass` key {@link BrowserlessRemoteBrowser} registers under. A
 * `MJ: AI Remote Browser Providers` row with `DriverClass = 'BrowserlessRemoteBrowser'` resolves to
 * this driver via the `ClassFactory`.
 */
export const BROWSERLESS_REMOTE_BROWSER_DRIVER_CLASS = 'BrowserlessRemoteBrowser';

/**
 * The backend display name used in capability-error messages and logging for this driver.
 */
export const BROWSERLESS_PROVIDER_NAME = 'Browserless';

/**
 * The default {@link BrowserlessClientFactory}: it throws an explicit "bind the real Browserless client"
 * error, because this package ships WITHOUT the real browserless.io adapter (a deployment concern).
 * Production replaces it via {@link BrowserlessRemoteBrowser.SetClientFactory}; tests inject a
 * `FakeBrowserlessClient`.
 *
 * @returns Never — always throws.
 */
const defaultBrowserlessClientFactory: BrowserlessClientFactory = () => {
    throw new Error(
        'BrowserlessRemoteBrowser has no Browserless client bound. Call ' +
            'BrowserlessRemoteBrowser.SetClientFactory(...) with a factory that builds an IBrowserlessClient ' +
            'over the real browserless.io CDP-as-a-service connect URL, or inject a fake in tests.',
    );
};

/**
 * The {@link ICdpSessionBackend} for a live Browserless session: it answers the backend-specific
 * live-view / native-AI / release concerns the shared session delegates, holding the seam + session id
 * captured at acquire time.
 *
 * Browserless exposes a hosted debug viewer (so {@link GetLiveViewUrl} returns it) but has no
 * first-party AI-control harness (so {@link InvokeNativeAIControl} throws).
 */
export class BrowserlessSessionBackend implements ICdpSessionBackend {
    /** The Browserless service-client seam for this session, used to release it on teardown. */
    private readonly client: IBrowserlessClient;

    /** The Browserless session id, used to {@link IBrowserlessClient.CloseSession} on release. */
    private readonly sessionId: string;

    /** The hosted, embeddable Browserless debug viewer URL returned by `CreateSession`. */
    private readonly debugViewerUrl: string;

    /** Guards {@link Release} so the session is closed at most once even if called repeatedly. */
    private released: boolean = false;

    /**
     * Constructs a {@link BrowserlessSessionBackend}.
     *
     * @param client The Browserless service-client seam for this session.
     * @param sessionId The Browserless session id to release on teardown.
     * @param debugViewerUrl The hosted debug viewer URL surfaced as the live-view URL.
     */
    constructor(client: IBrowserlessClient, sessionId: string, debugViewerUrl: string) {
        this.client = client;
        this.sessionId = sessionId;
        this.debugViewerUrl = debugViewerUrl;
    }

    /**
     * Returns Browserless's hosted debug viewer URL so humans can watch the session without MJ encoding
     * frames.
     *
     * @returns A promise resolving to the hosted live-view URL.
     */
    public async GetLiveViewUrl(): Promise<string> {
        return this.debugViewerUrl;
    }

    /**
     * Browserless has no first-party AI-control harness, so native AI control is unsupported.
     *
     * @param _intent The natural-language intent (unused — the capability is unsupported).
     * @returns Never — always rejects.
     * @throws {RemoteBrowserCapabilityNotSupportedError} always.
     */
    public async InvokeNativeAIControl(_intent: string): Promise<RemoteBrowserActionResult> {
        throw new RemoteBrowserCapabilityNotSupportedError('NativeAIControl', BROWSERLESS_PROVIDER_NAME);
    }

    /**
     * Ends the Browserless session and releases the pooled browser behind it. Idempotent — a second
     * call after a successful release is a no-op.
     *
     * @returns A promise that resolves once the Browserless session has been released.
     */
    public async Release(): Promise<void> {
        if (this.released) {
            return;
        }
        this.released = true;
        await this.client.CloseSession(this.sessionId);
    }
}

/**
 * Remote Browser driver for **Browserless** (browserless.io CDP-as-a-service).
 *
 * Construct via the engine's `ClassFactory` path (default constructor); it builds the Browserless
 * client from the {@link clientFactory} at {@link AcquireSession} time. The factory is a **static** seam
 * — production binds the real client once via {@link BrowserlessRemoteBrowser.SetClientFactory}; tests
 * inject a `FakeBrowserlessClient`. Everything past acquiring the CDP endpoint (action mapping,
 * capability gating, screencast, teardown) is inherited from {@link BaseCdpRemoteBrowserProvider}.
 *
 * Registered via `@RegisterClass(BaseRemoteBrowserProvider, 'BrowserlessRemoteBrowser')`.
 */
@RegisterClass(BaseRemoteBrowserProvider, BROWSERLESS_REMOTE_BROWSER_DRIVER_CLASS)
export class BrowserlessRemoteBrowser extends BaseCdpRemoteBrowserProvider {
    /**
     * The process-wide Browserless client creation seam. Defaults to a factory that throws until
     * {@link SetClientFactory} binds a real client (or a test injects a fake). Static so a single
     * deployment binding serves every driver instance the engine's `ClassFactory` constructs.
     */
    private static clientFactory: BrowserlessClientFactory = defaultBrowserlessClientFactory;

    /**
     * Binds the {@link BrowserlessClientFactory} every {@link BrowserlessRemoteBrowser} instance uses to
     * construct its client at acquire time. Production binds the real browserless.io adapter here once
     * at startup; tests inject a `FakeBrowserlessClient`.
     *
     * @param factory The factory that builds the {@link IBrowserlessClient} for a session.
     */
    public static SetClientFactory(factory: BrowserlessClientFactory): void {
        BrowserlessRemoteBrowser.clientFactory = factory;
    }

    /**
     * Obtains a CDP endpoint for Browserless by creating a service session via the seam, and returns it
     * alongside a {@link BrowserlessSessionBackend} for the live-view / native-AI / release concerns.
     * Captures the capability context first so the inherited capability gating uses the backend's flags.
     *
     * @param ctx The provider context (features, configuration, control mode, context user).
     * @returns A promise resolving to the acquired CDP endpoint + Browserless backend hooks.
     */
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        this.applyContext(ctx);

        const options: BrowserlessCreateSessionOptions = ctx.Configuration ?? {};
        const client = BrowserlessRemoteBrowser.clientFactory(options);
        const session = await client.CreateSession(options);

        const backend = new BrowserlessSessionBackend(client, session.SessionId, session.DebugViewerUrl);
        return { CdpEndpoint: session.CdpEndpoint, Backend: backend };
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration
 * and may drop this module. The package entry point calls this no-op so the `ClassFactory` can resolve
 * `'BrowserlessRemoteBrowser'`.
 */
export function LoadBrowserlessRemoteBrowser(): void {
    // Intentionally empty — referencing this function keeps the class (and its decorator) in the bundle.
}
