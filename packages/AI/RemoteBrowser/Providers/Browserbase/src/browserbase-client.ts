/**
 * The injectable **Browserbase service-client seam** — the minimal set of operations the
 * {@link import('./browserbase-remote-browser').BrowserbaseRemoteBrowser} driver needs from Browserbase,
 * declared as an interface so the driver builds and unit-tests against an in-memory fake with **no
 * network, no real Browserbase SDK, and no API keys**.
 *
 * ## Production binding (at deployment)
 * In production this interface is bound to the **`@browserbasehq/sdk`** package plus **Stagehand**
 * (Browserbase's first-party AI-control harness). The named operations map to the SDK as follows:
 * - {@link IBrowserbaseClient.CreateSession} → `Browserbase.sessions.create(...)`, returning the session
 *   id, its CDP connect endpoint (`connectUrl`), and the hosted live-view URL
 *   (`Browserbase.sessions.debug(...)` / `debuggerFullscreenUrl`).
 * - {@link IBrowserbaseClient.EndSession} → `Browserbase.sessions.update(id, { status: 'REQUEST_RELEASE' })`.
 * - {@link IBrowserbaseClient.Act} → a Stagehand `page.act(...)` / `page.extract(...)` / `page.observe(...)`
 *   invocation driving the natural-language intent against the live session.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do not
 * change. **None of the SDK types leak into this package** — declare `@browserbasehq/sdk` as an optional
 * dependency wherever the production factory is bound.
 *
 * @module @memberjunction/remote-browser-browserbase
 * @author MemberJunction.com
 */

/**
 * The session-creation options the driver passes through to the Browserbase client. Deliberately a thin,
 * opaque pass-through of the resolved provider/session configuration (region, project, stealth/proxy
 * settings, persistent-context id, …) — the driver does not interpret these; the bound client does.
 * Never carries inline secrets: credentials resolve through MJ's credential system upstream.
 */
export interface BrowserbaseCreateSessionOptions {
    /**
     * The opaque, backend-specific configuration to create the session with (region, project id, proxy,
     * stealth, persistent-context id, …). Typed as a record of unknown values rather than `any` so it
     * stays inspectable without losing type-safety at the boundary; the bound client narrows it.
     */
    Configuration?: Record<string, unknown>;
}

/**
 * The handles the seam returns after a successful {@link IBrowserbaseClient.CreateSession}.
 */
export interface BrowserbaseSessionHandles {
    /** The Browserbase session id — the durable external connection id, used to end the session. */
    SessionId: string;

    /**
     * The Chrome DevTools Protocol connect endpoint for the created session. The shared CDP kit attaches
     * the computer-use adapter to this over CDP.
     */
    CdpEndpoint: string;

    /** The hosted, embeddable live-view URL so humans can watch (and take over) the browser. */
    LiveViewUrl: string;
}

/**
 * The outcome of a {@link IBrowserbaseClient.Act} call — the result of delegating a natural-language
 * intent to Browserbase Stagehand. The driver maps this onto the channel's `RemoteBrowserActionResult`.
 */
export interface BrowserbaseActResult {
    /** Whether Stagehand reported the intent as successfully carried out. */
    Success: boolean;

    /** The page URL after the action, when the harness reports it. */
    CurrentUrl?: string;

    /** Optional human-readable detail (an extracted value, a note, or an error message on failure). */
    Detail?: string;
}

/**
 * The minimal Browserbase service surface the {@link import('./browserbase-remote-browser').BrowserbaseRemoteBrowser}
 * driver depends on. Production binds this to the real `@browserbasehq/sdk` + Stagehand; tests inject a
 * `FakeBrowserbaseClient`.
 */
export interface IBrowserbaseClient {
    /**
     * Creates a new Browserbase session and returns its id, CDP connect endpoint, and hosted live-view
     * URL.
     *
     * @param options The session-creation options (opaque resolved configuration).
     * @returns The created session's handles.
     */
    CreateSession(options: BrowserbaseCreateSessionOptions): Promise<BrowserbaseSessionHandles>;

    /**
     * Ends a Browserbase session, releasing the backing browser. Should be idempotent / non-throwing for
     * an already-released session so teardown is safe to run more than once.
     *
     * @param sessionId The Browserbase session id to end.
     */
    EndSession(sessionId: string): Promise<void>;

    /**
     * Delegates a natural-language intent to Browserbase Stagehand (act / extract / observe) against the
     * live session.
     *
     * @param sessionId The Browserbase session id to act within.
     * @param intent The natural-language intent (e.g. `'log in with the test account'`).
     * @returns The result Stagehand reported for the intent.
     */
    Act(sessionId: string, intent: string): Promise<BrowserbaseActResult>;
}

/**
 * A factory that constructs an {@link IBrowserbaseClient} for a session — the dependency-injection seam.
 * Production supplies a factory that builds the real `@browserbasehq/sdk` + Stagehand adapter from
 * resolved config; tests supply one that returns a `FakeBrowserbaseClient`.
 *
 * @param config The resolved provider/session configuration (region, credential refs already resolved upstream).
 * @returns The Browserbase client instance the driver creates and drives sessions with.
 */
export type BrowserbaseClientFactory = (config?: Record<string, unknown>) => IBrowserbaseClient;
