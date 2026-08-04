/**
 * @fileoverview `SteelRemoteBrowser` — the Steel ([steel.dev](https://steel.dev)) backend driver for the
 * MemberJunction Remote Browser channel. Steel is a browser-as-a-service with a CDP connect endpoint and
 * a hosted session viewer (with human takeover), stealth, proxy egress, session recording, persistent
 * contexts, multi-tab, downloads, and CAPTCHA solving — but **no first-party AI-control harness**.
 *
 * The driver is trivial by design: it subclasses {@link BaseCdpRemoteBrowserProvider} and fills in only
 * the one backend-specific hook — {@link SteelRemoteBrowser.AcquireSession} — plus the small
 * {@link ICdpSessionBackend} it returns. The shared CDP kit owns everything else (action translation,
 * capability gating, screencast, human takeover, Connect/Disconnect orchestration, teardown).
 *
 * Because Steel has no native AI harness, the backend's `InvokeNativeAIControl` throws
 * {@link RemoteBrowserCapabilityNotSupportedError} (the `NativeAIControl` capability is absent from the
 * "Steel" seed row); Steel sessions are driven by MJ's own computer-use control instead.
 *
 * All Steel I/O goes through the injectable {@link ISteelClient} seam, so the driver builds and
 * unit-tests with NO network, NO real Steel SDK, and NO API keys. Production binds the real `steel-sdk`
 * via {@link SteelRemoteBrowser.SetClientFactory}.
 *
 * Registered via `@RegisterClass(BaseRemoteBrowserProvider, 'SteelRemoteBrowser')` — the `DriverClass`
 * of the "Steel" provider metadata row.
 *
 * @module @memberjunction/remote-browser-steel
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
    ISteelClient,
    SteelClientFactory,
} from './steel-client';

/**
 * The `DriverClass` identifier this driver registers under — matches the "Steel" provider metadata
 * row's `DriverClass` so the engine's `ClassFactory` resolves it.
 */
export const STEEL_DRIVER_CLASS = 'SteelRemoteBrowser';

/** The backend display name used in capability-error messages for this driver. */
const STEEL_PROVIDER_NAME = 'Steel';

/**
 * The default {@link SteelClientFactory}: refuses to run until a real factory is bound via
 * {@link SteelRemoteBrowser.SetClientFactory}. This keeps the package free of any real SDK / network
 * dependency — production must explicitly bind `steel-sdk`, and tests bind a fake.
 *
 * @throws {Error} always — instructing the caller to bind a real client factory.
 */
const defaultClientFactory: SteelClientFactory = () => {
    throw new Error(
        'SteelRemoteBrowser has no Steel client bound. Call SteelRemoteBrowser.SetClientFactory(...) ' +
            'to bind the real Steel client (steel-sdk) before opening a session.',
    );
};

/**
 * The Steel backend driver. Subclasses {@link BaseCdpRemoteBrowserProvider}, implementing only the
 * `AcquireSession` hook (and the backend it returns); all CDP control is inherited.
 */
@RegisterClass(BaseRemoteBrowserProvider, STEEL_DRIVER_CLASS)
export class SteelRemoteBrowser extends BaseCdpRemoteBrowserProvider {
    /**
     * The process-wide factory used to construct the Steel client for each session. Defaults to a
     * factory that throws until {@link SteelRemoteBrowser.SetClientFactory} binds a real one.
     */
    private static clientFactory: SteelClientFactory = defaultClientFactory;

    /**
     * Binds the {@link SteelClientFactory} every {@link SteelRemoteBrowser} instance uses to construct its
     * Steel client. Production binds a factory that builds the real `steel-sdk` adapter; tests bind one
     * that returns a fake. The dependency-injection seam that keeps this package free of a hard
     * SDK/network dependency.
     *
     * @param factory The factory to use for subsequently-opened sessions.
     */
    public static SetClientFactory(factory: SteelClientFactory): void {
        SteelRemoteBrowser.clientFactory = factory;
    }

    /**
     * The Steel client for the live session, retained so the backend's `Release` can use it. `null`
     * before {@link SteelRemoteBrowser.AcquireSession}.
     */
    private client: ISteelClient | null = null;

    /**
     * Acquires a CDP session from Steel: constructs the client from the bound factory, creates a session,
     * and returns its CDP endpoint plus the {@link ICdpSessionBackend} that answers Steel's live-view /
     * native-AI / release concerns.
     *
     * @param ctx The provider context (features, configuration, control mode, context user).
     * @returns The acquired CDP endpoint + Steel-specific backend hooks.
     */
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        const client = SteelRemoteBrowser.clientFactory(ctx.Configuration);
        this.client = client;

        const handles = await client.CreateSession({ Configuration: ctx.Configuration });

        return {
            CdpEndpoint: handles.CdpEndpoint,
            Backend: this.buildBackend(client, handles.SessionId, handles.SessionViewerUrl),
        };
    }

    /**
     * Builds the {@link ICdpSessionBackend} for a live Steel session, capturing the client, session id,
     * and session-viewer URL the lifecycle-specific calls need. `InvokeNativeAIControl` always throws —
     * Steel has no first-party AI harness.
     *
     * @param client The Steel client driving this session.
     * @param sessionId The Steel session id.
     * @param sessionViewerUrl The hosted session-viewer URL for the session.
     * @returns The backend hooks the shared session delegates its backend-specific concerns to.
     */
    private buildBackend(
        client: ISteelClient,
        sessionId: string,
        sessionViewerUrl: string,
    ): ICdpSessionBackend {
        return {
            GetLiveViewUrl: async (): Promise<string> => sessionViewerUrl,
            InvokeNativeAIControl: (): Promise<RemoteBrowserActionResult> => {
                throw new RemoteBrowserCapabilityNotSupportedError('NativeAIControl', STEEL_PROVIDER_NAME);
            },
            Release: async (): Promise<void> => {
                await client.ReleaseSession(sessionId);
                this.client = null;
            },
        };
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration,
 * so a static reference to this no-op (called from `index.ts`) keeps the driver resolvable by the
 * engine's `ClassFactory`.
 */
export function LoadSteelRemoteBrowser(): void {
    // Intentionally empty — exists only to anchor a static import of this module.
}
