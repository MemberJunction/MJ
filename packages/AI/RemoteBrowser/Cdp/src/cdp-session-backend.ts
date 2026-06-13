/**
 * The narrow hook surface a Remote Browser **driver** supplies for the parts of a session that the
 * shared CDP control path cannot do generically — i.e. the irreducibly backend-specific bits of the
 * session lifecycle.
 *
 * Every backend (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser) drives the page
 * identically over CDP; the only differences are *how it obtained the CDP endpoint*, *whether/where it
 * exposes a hosted live-view URL*, *whether it has a first-party AI-control harness*, and *how its
 * session is torn down*. The first of those is answered by the driver's `AcquireSession`; the latter
 * three are answered by the {@link ICdpSessionBackend} the driver returns alongside the endpoint.
 *
 * @see `cdp-remote-browser-session.ts` — the session delegates its three lifecycle-specific,
 *  capability-gated calls to this object.
 * @see `base-cdp-remote-browser-provider.ts` — `AcquireSession` returns the endpoint + this backend.
 */

import {
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
} from '@memberjunction/remote-browser-base';

/**
 * Driver-supplied hooks for the backend-specific portions of a CDP remote-browser session.
 *
 * `CdpRemoteBrowserSession` owns the generic CDP control path (navigate / execute action / screenshot /
 * screencast / human-input routing — all via the computer-use adapter) and calls into this object ONLY
 * for the three concerns that genuinely vary per backend:
 *
 * 1. {@link ICdpSessionBackend.GetLiveViewUrl} — the hosted, embeddable live-view URL (BaaS providers
 *    expose one; Self-Hosted Chrome does not — it streams frames via screencast instead).
 * 2. {@link ICdpSessionBackend.InvokeNativeAIControl} — delegating a high-level intent to the backend's
 *    own AI-control harness (e.g. Browserbase Stagehand, Hyperbrowser agent).
 * 3. {@link ICdpSessionBackend.Release} — ending the service session / tearing down the container that
 *    backs this CDP endpoint.
 *
 * The first two are **capability-gated**: a backend without the capability should throw
 * {@link RemoteBrowserCapabilityNotSupportedError} from the corresponding method (the session also gates
 * on the feature flag before ever calling, so this throw is the defense-in-depth layer). `Release` is
 * always implemented — it is the teardown counterpart to `AcquireSession`.
 */
export interface ICdpSessionBackend {
    /**
     * Returns the backend's hosted, embeddable live-view URL so humans can watch the browser without MJ
     * encoding frames.
     *
     * Implement this only for backends that expose a hosted live view (most browser-as-a-service
     * providers do). Backends without one — notably Self-Hosted Chrome, which streams frames via
     * `StartScreencast` instead — must throw {@link RemoteBrowserCapabilityNotSupportedError}.
     *
     * @returns A promise resolving to the live-view URL.
     * @throws {RemoteBrowserCapabilityNotSupportedError} when the backend has no hosted live view.
     */
    GetLiveViewUrl(): Promise<string>;

    /**
     * Delegates a natural-language intent to the backend's first-party AI-control harness instead of
     * MJ's own computer-use loop.
     *
     * Implement this only for backends with a native AI-control harness (e.g. Browserbase Stagehand,
     * Hyperbrowser agent). Backends without one must throw
     * {@link RemoteBrowserCapabilityNotSupportedError}.
     *
     * @param intent The natural-language intent (e.g. `'log in with the test account'`).
     * @returns A promise resolving to the action result reported by the native harness.
     * @throws {RemoteBrowserCapabilityNotSupportedError} when the backend has no native AI control.
     */
    InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult>;

    /**
     * Releases the backend resources behind this CDP endpoint — ends the browser-as-a-service session,
     * or stops/tears down the self-hosted container. Called by the session on `Close()` and by the
     * provider on `Disconnect()`.
     *
     * Should be idempotent and non-throwing for an already-released backend, so teardown is safe to run
     * more than once.
     *
     * @returns A promise that resolves once the backend has been released.
     */
    Release(): Promise<void>;
}
