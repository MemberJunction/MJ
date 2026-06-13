/**
 * `SelfHostSessionBackend` — the Self-Hosted Chrome implementation of the {@link ICdpSessionBackend} hook
 * surface the shared CDP session delegates its three backend-specific concerns to (hosted live-view URL,
 * native-AI delegation, backend release).
 *
 * It wraps the {@link ChromeContainerHandle} returned by the
 * {@link import('./chrome-container-runner').IChromeContainerRunner} and answers exactly the
 * Self-Hosted Chrome capability profile (per the `MJ: AI Remote Browser Providers` seed row
 * "Self-Hosted Chrome" / `DriverClass = 'SelfHostRemoteBrowser'`):
 * - **LiveView** is supported → {@link GetLiveViewUrl} returns the runner's MJ-hosted viewer URL (backed
 *   by the inherited CDP screencast). It does NOT throw — the seed marks LiveView supported.
 * - **NativeAIControl** is NOT supported → {@link InvokeNativeAIControl} throws
 *   {@link RemoteBrowserCapabilityNotSupportedError}; self-host has no first-party AI harness, so MJ's own
 *   computer-use loop drives the page.
 * - **Release** always tears down the underlying container handle.
 *
 * @module @memberjunction/remote-browser-selfhost
 * @author MemberJunction.com
 */

import {
    RemoteBrowserActionResult,
    RemoteBrowserCapabilityNotSupportedError,
} from '@memberjunction/remote-browser-base';
import { ICdpSessionBackend } from '@memberjunction/remote-browser-cdp';
import { ChromeContainerHandle } from './chrome-container-runner';

/**
 * The backend display name carried in capability-error messages from this backend, matching the seed
 * row's `Name`.
 */
export const SELF_HOST_PROVIDER_NAME = 'Self-Hosted Chrome';

/**
 * The capability key reported when {@link SelfHostSessionBackend.InvokeNativeAIControl} is invoked — the
 * one feature Self-Hosted Chrome deliberately does not support.
 */
const NATIVE_AI_CONTROL_FEATURE = 'NativeAIControl';

/**
 * Self-Hosted Chrome's {@link ICdpSessionBackend}. Constructed by
 * {@link import('./selfhost-remote-browser').SelfHostRemoteBrowser.AcquireSession} around the running
 * container handle.
 */
export class SelfHostSessionBackend implements ICdpSessionBackend {
    /**
     * The running Chrome container handle this backend wraps — the source of the live-view URL and the
     * teardown hook.
     */
    private readonly containerHandle: ChromeContainerHandle;

    /** Guards {@link Release} so the container is torn down at most once even if called repeatedly. */
    private released: boolean = false;

    /**
     * Constructs a {@link SelfHostSessionBackend} around a running container handle.
     *
     * @param containerHandle The handle returned by the Chrome-container runner's `Acquire`.
     */
    constructor(containerHandle: ChromeContainerHandle) {
        this.containerHandle = containerHandle;
    }

    /**
     * Returns the MJ-hosted, embeddable live-view URL — the runner's viewer page, whose frames come from
     * the inherited CDP screencast. Self-host has no provider-hosted live view of its own, so this is
     * MJ's own viewer backed by the screencast (the documented production binding seam).
     *
     * Does NOT throw: the seed row marks LiveView supported for Self-Hosted Chrome.
     *
     * @returns A promise resolving to the MJ-hosted viewer URL.
     */
    public async GetLiveViewUrl(): Promise<string> {
        return this.containerHandle.ViewerUrl;
    }

    /**
     * Always throws {@link RemoteBrowserCapabilityNotSupportedError}: Self-Hosted Chrome has no
     * first-party AI-control harness, so high-level intents are driven by MJ's own computer-use loop
     * rather than delegated to the backend. Matches the seed row, which does not enable
     * `NativeAIControl`.
     *
     * @param _intent The natural-language intent — ignored; the call is unconditionally unsupported.
     * @returns Never returns; always rejects.
     * @throws {RemoteBrowserCapabilityNotSupportedError} unconditionally.
     */
    public async InvokeNativeAIControl(_intent: string): Promise<RemoteBrowserActionResult> {
        throw new RemoteBrowserCapabilityNotSupportedError(
            NATIVE_AI_CONTROL_FEATURE,
            SELF_HOST_PROVIDER_NAME,
        );
    }

    /**
     * Tears down the Chrome container behind this session by delegating to the container handle's
     * `Release`. Idempotent — a second call after a successful release is a no-op, so teardown is safe to
     * run from both the session's `Close()` and the provider's `Disconnect()`.
     *
     * @returns A promise that resolves once the container has been released.
     */
    public async Release(): Promise<void> {
        if (this.released) {
            return;
        }
        this.released = true;
        await this.containerHandle.Release();
    }
}
