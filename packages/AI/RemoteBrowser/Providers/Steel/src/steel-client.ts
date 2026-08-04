/**
 * The injectable **Steel service-client seam** — the minimal set of operations the
 * {@link import('./steel-remote-browser').SteelRemoteBrowser} driver needs from Steel
 * ([steel.dev](https://steel.dev)), declared as an interface so the driver builds and unit-tests against
 * an in-memory fake with **no network, no real Steel SDK, and no API keys**.
 *
 * ## Production binding (at deployment)
 * In production this interface is bound to the **`steel-sdk`** package. The named operations map to the
 * SDK as follows:
 * - {@link ISteelClient.CreateSession} → `Steel.sessions.create(...)`, returning the session id, its CDP
 *   connect endpoint (`websocketUrl` / `connectUrl`), and the hosted session-viewer URL
 *   (`sessionViewerUrl`).
 * - {@link ISteelClient.ReleaseSession} → `Steel.sessions.release(id)`.
 *
 * Steel has **no first-party AI-control harness** — sessions are driven by MJ's own computer-use control
 * (or OSS Stagehand-over-CDP) — so this seam intentionally has no `Act`-style operation; the driver
 * throws `RemoteBrowserCapabilityNotSupportedError('NativeAIControl', 'Steel')` for native AI control,
 * matching the seed row.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do not
 * change. **None of the SDK types leak into this package** — declare `steel-sdk` as an optional
 * dependency wherever the production factory is bound.
 *
 * @module @memberjunction/remote-browser-steel
 * @author MemberJunction.com
 */

/**
 * The session-creation options the driver passes through to the Steel client. Deliberately a thin,
 * opaque pass-through of the resolved provider/session configuration (region, stealth/proxy settings,
 * persistent-context id, …) — the driver does not interpret these; the bound client does. Never carries
 * inline secrets: credentials resolve through MJ's credential system upstream.
 */
export interface SteelCreateSessionOptions {
    /**
     * The opaque, backend-specific configuration to create the session with (region, proxy, stealth,
     * persistent-context id, …). Typed as a record of unknown values rather than `any` so it stays
     * inspectable without losing type-safety at the boundary; the bound client narrows it.
     */
    Configuration?: Record<string, unknown>;
}

/**
 * The handles the seam returns after a successful {@link ISteelClient.CreateSession}.
 */
export interface SteelSessionHandles {
    /** The Steel session id — the durable external connection id, used to release the session. */
    SessionId: string;

    /**
     * The Chrome DevTools Protocol connect endpoint for the created session. The shared CDP kit attaches
     * the computer-use adapter to this over CDP.
     */
    CdpEndpoint: string;

    /** The hosted, embeddable session-viewer URL so humans can watch (and take over) the browser. */
    SessionViewerUrl: string;
}

/**
 * The minimal Steel service surface the {@link import('./steel-remote-browser').SteelRemoteBrowser} driver
 * depends on. Production binds this to the real `steel-sdk`; tests inject a `FakeSteelClient`.
 */
export interface ISteelClient {
    /**
     * Creates a new Steel session and returns its id, CDP connect endpoint, and hosted session-viewer
     * URL.
     *
     * @param options The session-creation options (opaque resolved configuration).
     * @returns The created session's handles.
     */
    CreateSession(options: SteelCreateSessionOptions): Promise<SteelSessionHandles>;

    /**
     * Releases a Steel session, freeing the backing browser. Should be idempotent / non-throwing for an
     * already-released session so teardown is safe to run more than once.
     *
     * @param sessionId The Steel session id to release.
     */
    ReleaseSession(sessionId: string): Promise<void>;
}

/**
 * A factory that constructs an {@link ISteelClient} for a session — the dependency-injection seam.
 * Production supplies a factory that builds the real `steel-sdk` adapter from resolved config; tests
 * supply one that returns a `FakeSteelClient`.
 *
 * @param config The resolved provider/session configuration (region, credential refs already resolved upstream).
 * @returns The Steel client instance the driver creates and drives sessions with.
 */
export type SteelClientFactory = (config?: Record<string, unknown>) => ISteelClient;
