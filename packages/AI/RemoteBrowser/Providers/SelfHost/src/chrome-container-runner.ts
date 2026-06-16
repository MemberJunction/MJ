/**
 * The injectable **Chrome-container-runner seam** — the orchestration boundary the
 * {@link import('./selfhost-remote-browser').SelfHostRemoteBrowser} driver depends on to obtain a
 * running headless-Chrome container exposing a CDP endpoint, plus the MJ-hosted live-view URL backed by
 * the inherited screencast.
 *
 * It is declared as an interface (mirroring the bridge subsystem's `IZoomMeetingSdk` seam) so the driver
 * builds and unit-tests against an in-memory **Fake runner** with **no container, no network, and no
 * real browser**. Binding a real runner in production is a thin adapter that implements this interface;
 * the driver and its tests do not change, and none of the orchestration SDK types leak into this package.
 *
 * ## Production binding (seam — bound at deployment)
 * In production the runner spins up a lightweight headless-Chrome container (just Chrome started with a
 * `--remote-debugging-port`), returns its CDP endpoint for the shared adapter to attach to, and returns
 * an MJ-hosted viewer URL whose page is backed by the inherited CDP screencast frames. `Release()` stops
 * and tears down that container.
 *
 * @see `base-cdp-remote-browser-provider.ts` (`@memberjunction/remote-browser-cdp`) — `AcquireSession`
 *  returns the CDP endpoint this runner provides.
 */

/**
 * The options handed to {@link IChromeContainerRunner.Acquire} for one session — the connection
 * configuration the runner needs to size and launch its Chrome container. All fields are optional so a
 * production runner can fall back to sensible defaults; the values flow from the provider context's
 * opaque `Configuration` (credential references already resolved upstream; never inline secrets).
 */
export interface ChromeContainerAcquireOptions {
    /** Optional viewport width hint for the launched Chrome, in pixels. */
    ViewportWidth?: number;

    /** Optional viewport height hint for the launched Chrome, in pixels. */
    ViewportHeight?: number;

    /**
     * The full, opaque backend configuration record from the provider context (region, Chrome image,
     * proxy settings, …). Typed as a record of unknown values rather than `any` so the boundary stays
     * inspectable; a production runner narrows the fields it understands.
     */
    Configuration?: Record<string, unknown>;
}

/**
 * The handle a {@link IChromeContainerRunner.Acquire} call returns: the CDP endpoint the shared adapter
 * attaches to, the MJ-hosted viewer URL for human live-view, and the teardown hook for the container
 * behind them.
 */
export interface ChromeContainerHandle {
    /**
     * The Chrome DevTools Protocol connect endpoint of the launched container (e.g. a
     * `ws://…/devtools/browser/…` URL). The shared provider attaches to this over CDP.
     */
    CdpEndpoint: string;

    /**
     * The MJ-hosted, embeddable live-view URL whose page renders the inherited CDP screencast frames.
     * Self-host has no first-party hosted live view; this is MJ's own viewer backed by the screencast.
     */
    ViewerUrl: string;

    /**
     * Tears down the Chrome container behind {@link CdpEndpoint} / {@link ViewerUrl}. Should be
     * idempotent and non-throwing for an already-released container so teardown is safe to run more than
     * once.
     *
     * @returns A promise that resolves once the container has been torn down.
     */
    Release(): Promise<void>;
}

/**
 * The minimal Chrome-container orchestration surface the
 * {@link import('./selfhost-remote-browser').SelfHostRemoteBrowser} driver depends on. Production binds
 * this to a real container orchestrator; tests inject a `FakeChromeContainerRunner`.
 */
export interface IChromeContainerRunner {
    /**
     * Launches (or leases) a headless-Chrome container for one session and returns its CDP endpoint, the
     * MJ-hosted viewer URL, and the teardown hook.
     *
     * @param opts The connection configuration for this session (viewport hints + opaque backend config).
     * @returns A promise resolving to the running container's handle.
     */
    Acquire(opts: ChromeContainerAcquireOptions): Promise<ChromeContainerHandle>;
}

/**
 * A factory that constructs an {@link IChromeContainerRunner} — the creation seam (mirroring the bridge
 * subsystem's SDK-factory pattern). Production supplies a factory that builds the real container-runner
 * adapter; tests supply one that returns a `FakeChromeContainerRunner`.
 *
 * @returns The Chrome-container runner the driver acquires sessions through.
 */
export type ChromeContainerRunnerFactory = () => IChromeContainerRunner;
