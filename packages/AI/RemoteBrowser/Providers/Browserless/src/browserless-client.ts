/**
 * The injectable **Browserless service-client seam** — the minimal set of operations
 * {@link import('./browserless-remote-browser').BrowserlessRemoteBrowser} needs from browserless.io,
 * declared as an interface so the driver builds and unit-tests against an in-memory fake with **no
 * network, no real Browserless account, and no API key**.
 *
 * ## Production binding (deployment concern)
 * In production this interface is bound to **browserless.io's CDP-as-a-service**. A Browserless session
 * is created by connecting to (or provisioning against) the hosted browser pool and is driven over the
 * returned CDP connect URL. The named operations map to Browserless as follows:
 * - {@link IBrowserlessClient.CreateSession} → provision/connect a Browserless browser and surface its
 *   CDP connect endpoint (the `wss://…/chromium?token=…` connect URL) plus the hosted debug/live viewer
 *   URL. The shared CDP kit attaches to {@link BrowserlessCreateSessionResult.CdpEndpoint} over CDP and
 *   drives the page; humans watch via {@link BrowserlessCreateSessionResult.DebugViewerUrl}.
 * - {@link IBrowserlessClient.CloseSession} → end the Browserless session and release the pooled browser.
 *
 * Binding the real service is a thin adapter that implements this interface; the driver and its tests
 * do not change. **No Browserless SDK types leak into this package** — the real Browserless connect URL
 * / REST surface is reached only from the adapter that implements this seam at deployment time.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d-i (Remote Browser channel).
 */

/**
 * The options the driver passes when asking the seam to create a Browserless session. This is the
 * opaque, backend-specific {@link import('@memberjunction/remote-browser-base').RemoteBrowserProviderContext.Configuration}
 * record (region, proxy egress settings, viewport hints, recording flags, resolved credential
 * references) handed straight through to the Browserless adapter. Typed as a record of unknown values
 * rather than `any` so the boundary stays inspectable without losing type-safety; the adapter narrows
 * the fields it understands. Never carries inline secrets — credentials resolve upstream.
 */
export type BrowserlessCreateSessionOptions = Record<string, unknown>;

/**
 * The handles the seam returns after a successful {@link IBrowserlessClient.CreateSession}.
 */
export interface BrowserlessCreateSessionResult {
    /**
     * The Browserless session id — the durable external handle used to {@link IBrowserlessClient.CloseSession}
     * the session at teardown.
     */
    SessionId: string;

    /**
     * The Chrome DevTools Protocol connect endpoint for the session (Browserless's
     * `wss://…/chromium?token=…` connect URL). The shared CDP kit attaches to this over CDP.
     */
    CdpEndpoint: string;

    /**
     * The hosted, embeddable debug/live viewer URL Browserless exposes so humans can watch the session
     * without MJ encoding frames. Surfaced as the backend's live-view URL.
     */
    DebugViewerUrl: string;
}

/**
 * The minimal Browserless service surface the
 * {@link import('./browserless-remote-browser').BrowserlessRemoteBrowser} depends on. Production binds
 * this to the real browserless.io CDP-as-a-service; tests inject a `FakeBrowserlessClient`.
 */
export interface IBrowserlessClient {
    /**
     * Creates (provisions/connects) a Browserless session and returns its CDP endpoint + hosted debug
     * viewer URL.
     *
     * @param options The opaque, backend-specific session options (the provider context configuration).
     * @returns The session id, CDP connect endpoint, and hosted debug viewer URL.
     */
    CreateSession(options: BrowserlessCreateSessionOptions): Promise<BrowserlessCreateSessionResult>;

    /**
     * Ends a Browserless session and releases the pooled browser behind it. Should be idempotent and
     * non-throwing for an already-closed session, so teardown is safe to run more than once.
     *
     * @param sessionId The Browserless session id returned by {@link CreateSession}.
     */
    CloseSession(sessionId: string): Promise<void>;
}

/**
 * A factory that constructs an {@link IBrowserlessClient} for a session — the creation seam. Production
 * supplies a factory that builds the real browserless.io adapter from resolved config; tests supply one
 * that returns a `FakeBrowserlessClient`.
 *
 * @param options The resolved provider/session configuration (region, credential refs already resolved
 *  upstream). May be `undefined` when the provider carries no configuration.
 * @returns The Browserless client the driver creates its session with.
 */
export type BrowserlessClientFactory = (options?: BrowserlessCreateSessionOptions) => IBrowserlessClient;
