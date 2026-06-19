/**
 * The injectable **Hyperbrowser service-client seam** — the minimal set of operations
 * {@link import('./hyperbrowser-remote-browser').HyperbrowserRemoteBrowser} needs from Hyperbrowser,
 * declared as an interface so the driver builds and unit-tests against an in-memory fake with **no
 * network and no real `@hyperbrowser/sdk`**.
 *
 * ## Production binding (deployment concern)
 * In production this interface is bound to the **`@hyperbrowser/sdk`** package (declared as an optional
 * peer dependency). A Hyperbrowser session exposes a CDP connect endpoint (driven by the shared CDP kit)
 * plus a hosted live-view URL, and — unlike a pure CDP-as-a-service — a **first-party agentic harness**
 * that runs its own model loop. The named operations map to the SDK as follows:
 * - {@link IHyperbrowserClient.CreateSession} → `sessions.create()` (stealth / proxy / persistent
 *   context configured from the resolved options), surfacing the session's CDP connect URL + live-view
 *   URL.
 * - {@link IHyperbrowserClient.RunAgentTask} → the SDK's agentic task run (e.g. the Browser-Use / Claude
 *   Computer-Use agent) against the live session, delegating a high-level natural-language intent.
 * - {@link IHyperbrowserClient.StopSession} → `sessions.stop()`.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do
 * not change. **No `@hyperbrowser/sdk` types leak into this package** — the real SDK is reached only
 * from the adapter that implements this seam at deployment time.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d-i (Remote Browser channel).
 */

/**
 * The options the driver passes when asking the seam to create a Hyperbrowser session. This is the
 * opaque, backend-specific {@link import('@memberjunction/remote-browser-base').RemoteBrowserProviderContext.Configuration}
 * record (stealth, proxy egress, persistent-context profile, captcha-solving flags, viewport hints,
 * resolved credential references) handed straight through to the Hyperbrowser adapter. Typed as a record
 * of unknown values rather than `any` so the boundary stays inspectable without losing type-safety; the
 * adapter narrows the fields it understands. Never carries inline secrets — credentials resolve upstream.
 */
export type HyperbrowserCreateSessionOptions = Record<string, unknown>;

/**
 * The handles the seam returns after a successful {@link IHyperbrowserClient.CreateSession}.
 */
export interface HyperbrowserCreateSessionResult {
    /**
     * The Hyperbrowser session id — the durable external handle used to delegate agent tasks against
     * the session and to {@link IHyperbrowserClient.StopSession} it at teardown.
     */
    SessionId: string;

    /**
     * The Chrome DevTools Protocol connect endpoint for the session. The shared CDP kit attaches to
     * this over CDP to drive the page with MJ's own computer-use loop.
     */
    CdpEndpoint: string;

    /**
     * The hosted, embeddable live-view URL Hyperbrowser exposes so humans can watch (and, where the
     * provider permits, take over) the session without MJ encoding frames. Surfaced as the backend's
     * live-view URL.
     */
    LiveViewUrl: string;
}

/**
 * The outcome the seam reports from a {@link IHyperbrowserClient.RunAgentTask} delegation — the
 * platform-native shape the driver maps onto the Base
 * {@link import('@memberjunction/remote-browser-base').RemoteBrowserActionResult}.
 */
export interface HyperbrowserAgentTaskResult {
    /** Whether the native agentic task completed successfully. */
    Success: boolean;
    /** The page URL after the task, when the harness reports one. */
    CurrentUrl?: string;
    /** Optional human-readable detail (an error message on failure, a note/summary on success). */
    Detail?: string;
}

/**
 * The minimal Hyperbrowser service surface the
 * {@link import('./hyperbrowser-remote-browser').HyperbrowserRemoteBrowser} depends on. Production binds
 * this to the real `@hyperbrowser/sdk`; tests inject a `FakeHyperbrowserClient`.
 */
export interface IHyperbrowserClient {
    /**
     * Creates a Hyperbrowser session and returns its CDP endpoint + hosted live-view URL.
     *
     * @param options The opaque, backend-specific session options (the provider context configuration).
     * @returns The session id, CDP connect endpoint, and hosted live-view URL.
     */
    CreateSession(options: HyperbrowserCreateSessionOptions): Promise<HyperbrowserCreateSessionResult>;

    /**
     * Stops a Hyperbrowser session and releases the browser behind it. Should be idempotent and
     * non-throwing for an already-stopped session, so teardown is safe to run more than once.
     *
     * @param sessionId The Hyperbrowser session id returned by {@link CreateSession}.
     */
    StopSession(sessionId: string): Promise<void>;

    /**
     * Delegates a high-level natural-language intent to Hyperbrowser's first-party agentic harness,
     * which runs its own model loop against the live session.
     *
     * @param sessionId The Hyperbrowser session id the task runs against.
     * @param intent The natural-language intent (e.g. `'log in with the test account'`).
     * @returns The platform-native task result the driver maps onto a `RemoteBrowserActionResult`.
     */
    RunAgentTask(sessionId: string, intent: string): Promise<HyperbrowserAgentTaskResult>;
}

/**
 * A factory that constructs an {@link IHyperbrowserClient} for a session — the creation seam. Production
 * supplies a factory that builds the real `@hyperbrowser/sdk` adapter from resolved config; tests supply
 * one that returns a `FakeHyperbrowserClient`.
 *
 * @param options The resolved provider/session configuration (stealth, proxy, credential refs already
 *  resolved upstream). May be `undefined` when the provider carries no configuration.
 * @returns The Hyperbrowser client the driver creates its session with.
 */
export type HyperbrowserClientFactory = (options?: HyperbrowserCreateSessionOptions) => IHyperbrowserClient;
