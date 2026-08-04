/**
 * @fileoverview `HyperbrowserRemoteBrowser` — the Hyperbrowser backend driver for the MemberJunction
 * Remote Browser channel. Hyperbrowser exposes a CDP connect endpoint (driven by the shared
 * {@link BaseCdpRemoteBrowserProvider}) plus a hosted live-view URL and — unlike a pure CDP-as-a-service
 * — a **first-party agentic harness** that runs its own model loop. This driver answers the
 * backend-specific concerns — *how do I obtain a CDP endpoint, expose its live view, delegate a native
 * agent task, and release it?* — via the injectable {@link IHyperbrowserClient} seam, so it builds and
 * unit-tests with **no network and no real `@hyperbrowser/sdk`**.
 *
 * Capability coverage (the Hyperbrowser seed row): `RawCdpControl`, **`NativeAIControl`** (agentic
 * browse), `LiveView`, `HumanTakeover`, `ScreenStreaming`, `Stealth`, `ProxyEgress`, `SessionRecording`,
 * `PersistentContext`, `MultiTab`, `FileDownloads`, `CaptchaSolving`. Native AI control is delegated to
 * the harness via {@link HyperbrowserSessionBackend.InvokeNativeAIControl}.
 *
 * @module @memberjunction/remote-browser-hyperbrowser
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseRemoteBrowserProvider,
    RemoteBrowserActionResult,
    RemoteBrowserProviderContext,
} from '@memberjunction/remote-browser-base';
import {
    AcquiredCdpSession,
    BaseCdpRemoteBrowserProvider,
    ICdpSessionBackend,
} from '@memberjunction/remote-browser-cdp';
import {
    HyperbrowserAgentTaskResult,
    HyperbrowserClientFactory,
    HyperbrowserCreateSessionOptions,
    IHyperbrowserClient,
} from './hyperbrowser-client';

/**
 * The `DriverClass` key {@link HyperbrowserRemoteBrowser} registers under. A
 * `MJ: AI Remote Browser Providers` row with `DriverClass = 'HyperbrowserRemoteBrowser'` resolves to
 * this driver via the `ClassFactory`.
 */
export const HYPERBROWSER_REMOTE_BROWSER_DRIVER_CLASS = 'HyperbrowserRemoteBrowser';

/**
 * The backend display name used in capability-error messages and logging for this driver.
 */
export const HYPERBROWSER_PROVIDER_NAME = 'Hyperbrowser';

/**
 * The default {@link HyperbrowserClientFactory}: it throws an explicit "bind the real Hyperbrowser
 * client" error, because this package ships WITHOUT the real `@hyperbrowser/sdk` adapter (a deployment
 * concern). Production replaces it via {@link HyperbrowserRemoteBrowser.SetClientFactory}; tests inject a
 * `FakeHyperbrowserClient`.
 *
 * @returns Never — always throws.
 */
const defaultHyperbrowserClientFactory: HyperbrowserClientFactory = () => {
    throw new Error(
        'HyperbrowserRemoteBrowser has no Hyperbrowser client bound. Call ' +
            'HyperbrowserRemoteBrowser.SetClientFactory(...) with a factory that builds an IHyperbrowserClient ' +
            'over the real @hyperbrowser/sdk, or inject a fake in tests.',
    );
};

/**
 * Maps a Hyperbrowser native agent-task result onto the Base {@link RemoteBrowserActionResult} the
 * session contract expects. A structural copy (not a pass-through) so the platform-native shape never
 * leaks past the seam and the field contract is explicit.
 *
 * @param result The platform-native agent-task result from the seam.
 * @returns The mapped Base action result.
 */
function toActionResult(result: HyperbrowserAgentTaskResult): RemoteBrowserActionResult {
    return {
        Success: result.Success,
        CurrentUrl: result.CurrentUrl,
        Detail: result.Detail,
    };
}

/**
 * The {@link ICdpSessionBackend} for a live Hyperbrowser session: it answers the backend-specific
 * live-view / native-AI / release concerns the shared session delegates, holding the seam + session id
 * captured at acquire time.
 *
 * Hyperbrowser exposes a hosted live view (so {@link GetLiveViewUrl} returns it) **and** a first-party
 * agentic harness (so {@link InvokeNativeAIControl} delegates to {@link IHyperbrowserClient.RunAgentTask}).
 */
export class HyperbrowserSessionBackend implements ICdpSessionBackend {
    /** The Hyperbrowser service-client seam for this session, used for agent tasks + release. */
    private readonly client: IHyperbrowserClient;

    /** The Hyperbrowser session id, used for {@link IHyperbrowserClient.RunAgentTask} + `StopSession`. */
    private readonly sessionId: string;

    /** The hosted, embeddable Hyperbrowser live-view URL returned by `CreateSession`. */
    private readonly liveViewUrl: string;

    /** Guards {@link Release} so the session is stopped at most once even if called repeatedly. */
    private released: boolean = false;

    /**
     * Constructs a {@link HyperbrowserSessionBackend}.
     *
     * @param client The Hyperbrowser service-client seam for this session.
     * @param sessionId The Hyperbrowser session id for agent tasks + teardown.
     * @param liveViewUrl The hosted live-view URL surfaced as the live-view URL.
     */
    constructor(client: IHyperbrowserClient, sessionId: string, liveViewUrl: string) {
        this.client = client;
        this.sessionId = sessionId;
        this.liveViewUrl = liveViewUrl;
    }

    /**
     * Returns Hyperbrowser's hosted live-view URL so humans can watch (and, where permitted, take over)
     * the session without MJ encoding frames.
     *
     * @returns A promise resolving to the hosted live-view URL.
     */
    public async GetLiveViewUrl(): Promise<string> {
        return this.liveViewUrl;
    }

    /**
     * Delegates a natural-language intent to Hyperbrowser's first-party agentic harness via
     * {@link IHyperbrowserClient.RunAgentTask}, mapping its platform-native result onto a
     * {@link RemoteBrowserActionResult}.
     *
     * @param intent The natural-language intent (e.g. `'log in with the test account'`).
     * @returns A promise resolving to the mapped action result the native harness reported.
     */
    public async InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult> {
        const result = await this.client.RunAgentTask(this.sessionId, intent);
        return toActionResult(result);
    }

    /**
     * Stops the Hyperbrowser session and releases the browser behind it. Idempotent — a second call
     * after a successful release is a no-op.
     *
     * @returns A promise that resolves once the Hyperbrowser session has been released.
     */
    public async Release(): Promise<void> {
        if (this.released) {
            return;
        }
        this.released = true;
        await this.client.StopSession(this.sessionId);
    }
}

/**
 * Remote Browser driver for **Hyperbrowser**.
 *
 * Construct via the engine's `ClassFactory` path (default constructor); it builds the Hyperbrowser
 * client from the {@link clientFactory} at {@link AcquireSession} time. The factory is a **static** seam
 * — production binds the real `@hyperbrowser/sdk` adapter once via
 * {@link HyperbrowserRemoteBrowser.SetClientFactory}; tests inject a `FakeHyperbrowserClient`. Everything
 * past acquiring the CDP endpoint (action mapping, capability gating, screencast, teardown) is inherited
 * from {@link BaseCdpRemoteBrowserProvider}.
 *
 * Registered via `@RegisterClass(BaseRemoteBrowserProvider, 'HyperbrowserRemoteBrowser')`.
 */
@RegisterClass(BaseRemoteBrowserProvider, HYPERBROWSER_REMOTE_BROWSER_DRIVER_CLASS)
export class HyperbrowserRemoteBrowser extends BaseCdpRemoteBrowserProvider {
    /**
     * The process-wide Hyperbrowser client creation seam. Defaults to a factory that throws until
     * {@link SetClientFactory} binds a real client (or a test injects a fake). Static so a single
     * deployment binding serves every driver instance the engine's `ClassFactory` constructs.
     */
    private static clientFactory: HyperbrowserClientFactory = defaultHyperbrowserClientFactory;

    /**
     * Binds the {@link HyperbrowserClientFactory} every {@link HyperbrowserRemoteBrowser} instance uses
     * to construct its client at acquire time. Production binds the real `@hyperbrowser/sdk` adapter here
     * once at startup; tests inject a `FakeHyperbrowserClient`.
     *
     * @param factory The factory that builds the {@link IHyperbrowserClient} for a session.
     */
    public static SetClientFactory(factory: HyperbrowserClientFactory): void {
        HyperbrowserRemoteBrowser.clientFactory = factory;
    }

    /**
     * Obtains a CDP endpoint for Hyperbrowser by creating a service session via the seam, and returns it
     * alongside a {@link HyperbrowserSessionBackend} for the live-view / native-AI / release concerns.
     * Captures the capability context first so the inherited capability gating uses the backend's flags.
     *
     * @param ctx The provider context (features, configuration, control mode, context user).
     * @returns A promise resolving to the acquired CDP endpoint + Hyperbrowser backend hooks.
     */
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        this.applyContext(ctx);

        const options: HyperbrowserCreateSessionOptions = ctx.Configuration ?? {};
        const client = HyperbrowserRemoteBrowser.clientFactory(options);
        const session = await client.CreateSession(options);

        const backend = new HyperbrowserSessionBackend(client, session.SessionId, session.LiveViewUrl);
        return { CdpEndpoint: session.CdpEndpoint, Backend: backend };
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration
 * and may drop this module. The package entry point calls this no-op so the `ClassFactory` can resolve
 * `'HyperbrowserRemoteBrowser'`.
 */
export function LoadHyperbrowserRemoteBrowser(): void {
    // Intentionally empty — referencing this function keeps the class (and its decorator) in the bundle.
}
