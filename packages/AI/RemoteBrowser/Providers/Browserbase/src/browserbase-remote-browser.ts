/**
 * @fileoverview `BrowserbaseRemoteBrowser` — the Browserbase backend driver for the MemberJunction
 * Remote Browser channel. Browserbase is the richest backend: a browser-as-a-service that exposes a CDP
 * connect endpoint, a hosted live-view with human takeover, AND a first-party AI-control harness
 * (Stagehand act/extract/observe).
 *
 * The driver is trivial by design: it subclasses {@link BaseCdpRemoteBrowserProvider} and fills in only
 * the one backend-specific hook — {@link BrowserbaseRemoteBrowser.AcquireSession} — plus the small
 * {@link ICdpSessionBackend} it returns. The shared CDP kit owns everything else (action translation,
 * capability gating, screencast, human takeover, Connect/Disconnect orchestration, teardown).
 *
 * All Browserbase I/O goes through the injectable {@link IBrowserbaseClient} seam, so the driver builds
 * and unit-tests with NO network, NO real Browserbase SDK, and NO API keys. Production binds the real
 * `@browserbasehq/sdk` + Stagehand via {@link BrowserbaseRemoteBrowser.SetClientFactory}.
 *
 * Registered via `@RegisterClass(BaseRemoteBrowserProvider, 'BrowserbaseRemoteBrowser')` — the
 * `DriverClass` of the "Browserbase" provider metadata row.
 *
 * @module @memberjunction/remote-browser-browserbase
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
    BrowserbaseClientFactory,
    IBrowserbaseClient,
} from './browserbase-client';

/**
 * The `DriverClass` identifier this driver registers under — matches the "Browserbase" provider
 * metadata row's `DriverClass` so the engine's `ClassFactory` resolves it.
 */
export const BROWSERBASE_DRIVER_CLASS = 'BrowserbaseRemoteBrowser';

/**
 * The default {@link BrowserbaseClientFactory}: refuses to run until a real factory is bound via
 * {@link BrowserbaseRemoteBrowser.SetClientFactory}. This keeps the package free of any real SDK / network
 * dependency — production must explicitly bind `@browserbasehq/sdk` + Stagehand, and tests bind a fake.
 *
 * @throws {Error} always — instructing the caller to bind a real client factory.
 */
const defaultClientFactory: BrowserbaseClientFactory = () => {
    throw new Error(
        'BrowserbaseRemoteBrowser has no Browserbase client bound. Call ' +
            'BrowserbaseRemoteBrowser.SetClientFactory(...) to bind the real Browserbase client ' +
            '(@browserbasehq/sdk + Stagehand) before opening a session.',
    );
};

/**
 * The Browserbase backend driver. Subclasses {@link BaseCdpRemoteBrowserProvider}, implementing only the
 * `AcquireSession` hook (and the backend it returns); all CDP control is inherited.
 */
@RegisterClass(BaseRemoteBrowserProvider, BROWSERBASE_DRIVER_CLASS)
export class BrowserbaseRemoteBrowser extends BaseCdpRemoteBrowserProvider {
    /**
     * The process-wide factory used to construct the Browserbase client for each session. Defaults to a
     * factory that throws until {@link BrowserbaseRemoteBrowser.SetClientFactory} binds a real one.
     */
    private static clientFactory: BrowserbaseClientFactory = defaultClientFactory;

    /**
     * Binds the {@link BrowserbaseClientFactory} every {@link BrowserbaseRemoteBrowser} instance uses to
     * construct its Browserbase client. Production binds a factory that builds the real `@browserbasehq/sdk`
     * + Stagehand adapter; tests bind one that returns a fake. The dependency-injection seam that keeps
     * this package free of a hard SDK/network dependency.
     *
     * @param factory The factory to use for subsequently-opened sessions.
     */
    public static SetClientFactory(factory: BrowserbaseClientFactory): void {
        BrowserbaseRemoteBrowser.clientFactory = factory;
    }

    /**
     * The Browserbase client for the live session, retained so the backend's `InvokeNativeAIControl` /
     * `Release` can use it. `null` before {@link BrowserbaseRemoteBrowser.AcquireSession}.
     */
    private client: IBrowserbaseClient | null = null;

    /**
     * Acquires a CDP session from Browserbase: constructs the client from the bound factory, creates a
     * session, and returns its CDP endpoint plus the {@link ICdpSessionBackend} that answers Browserbase's
     * live-view / native-AI / release concerns.
     *
     * @param ctx The provider context (features, configuration, control mode, context user).
     * @returns The acquired CDP endpoint + Browserbase-specific backend hooks.
     */
    protected async AcquireSession(ctx: RemoteBrowserProviderContext): Promise<AcquiredCdpSession> {
        const client = BrowserbaseRemoteBrowser.clientFactory(ctx.Configuration);
        this.client = client;

        const handles = await client.CreateSession({ Configuration: ctx.Configuration });

        return {
            CdpEndpoint: handles.CdpEndpoint,
            Backend: this.buildBackend(client, handles.SessionId, handles.LiveViewUrl),
        };
    }

    /**
     * Builds the {@link ICdpSessionBackend} for a live Browserbase session, capturing the client, session
     * id, and live-view URL the three lifecycle-specific calls need.
     *
     * @param client The Browserbase client driving this session.
     * @param sessionId The Browserbase session id.
     * @param liveViewUrl The hosted live-view URL for the session.
     * @returns The backend hooks the shared session delegates its backend-specific concerns to.
     */
    private buildBackend(
        client: IBrowserbaseClient,
        sessionId: string,
        liveViewUrl: string,
    ): ICdpSessionBackend {
        return {
            GetLiveViewUrl: async (): Promise<string> => liveViewUrl,
            InvokeNativeAIControl: (intent: string): Promise<RemoteBrowserActionResult> =>
                this.invokeStagehand(client, sessionId, intent),
            Release: async (): Promise<void> => {
                await client.EndSession(sessionId);
                this.client = null;
            },
        };
    }

    /**
     * Delegates a natural-language intent to Browserbase Stagehand via the client's `Act`, mapping its
     * result onto the channel's {@link RemoteBrowserActionResult}.
     *
     * @param client The Browserbase client driving this session.
     * @param sessionId The Browserbase session id to act within.
     * @param intent The natural-language intent to carry out.
     * @returns The action result, mapped from Stagehand's report.
     */
    private async invokeStagehand(
        client: IBrowserbaseClient,
        sessionId: string,
        intent: string,
    ): Promise<RemoteBrowserActionResult> {
        const result = await client.Act(sessionId, intent);
        return {
            Success: result.Success,
            CurrentUrl: result.CurrentUrl,
            Detail: result.Detail,
        };
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration,
 * so a static reference to this no-op (called from `index.ts`) keeps the driver resolvable by the
 * engine's `ClassFactory`.
 */
export function LoadBrowserbaseRemoteBrowser(): void {
    // Intentionally empty — exists only to anchor a static import of this module.
}
