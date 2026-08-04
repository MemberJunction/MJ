import { UserInfo } from '@memberjunction/core';
import { IRemoteBrowserProviderFeatures } from './remote-browser-features';
import { RemoteBrowserControlMode } from './control';
import { IRemoteBrowserSession } from './remote-browser-session';
import { RemoteBrowserCapabilityNotSupportedError } from './capability-errors';

/**
 * The set of host services a remote-browser driver sees while running.
 *
 * The engine (`RemoteBrowserEngine`, server package) constructs this and hands it to {@link
 * BaseRemoteBrowserProvider.Connect}. It is deliberately small: a driver should depend only on what it
 * truly needs, and everything richer (the realtime session, the channel plane, the control arbiter)
 * is wired by the engine AROUND the driver, not handed into it. This keeps drivers thin and
 * backend-focused.
 */
export interface RemoteBrowserProviderContext {
    /**
     * The backend's `SupportedFeatures` — the capability flags the engine and the driver's
     * `RequireFeature` guard gate on. Sourced from the provider metadata row's typed
     * `SupportedFeaturesObject` accessor (never `JSON.parse`).
     */
    Features: IRemoteBrowserProviderFeatures;

    /**
     * The backend's display name (e.g. `'Browserbase'`, `'Self-Hosted Chrome'`), used in
     * capability-error messages and logging.
     */
    ProviderName: string;

    /**
     * How the browser is hosted: `'SelfHost'` (MJ orchestrates a lightweight headless-Chrome
     * container we connect to over CDP) or `'Service'` (a browser-as-a-service exposes a CDP connect
     * endpoint). Mirrors `MJ: AI Remote Browser Providers.ProviderType`.
     */
    ProviderType: 'SelfHost' | 'Service';

    /**
     * The resolved control mode for this session (`AgentOnly` / `ViewOnly` / `Collaborative`) — the
     * provider default overridden per-channel / at runtime. The driver uses it to decide whether to
     * stand up live-view / takeover plumbing on connect.
     */
    ControlMode: RemoteBrowserControlMode;

    /**
     * Opaque, backend-specific connection configuration (resolved credential references, region,
     * Chrome image, proxy settings, …) as a parsed JSON object. Typed as a record of unknown values
     * rather than `any` so it stays inspectable without losing type-safety at the boundary; the
     * driver narrows the fields it understands. Never carries inline secrets — credentials resolve
     * through MJ's credential system upstream and arrive here already resolved or as references.
     */
    Configuration?: Record<string, unknown>;

    /**
     * The MJ user the remote-browser session runs as. Every session is owned by a user and fully
     * audited; the driver uses this for any server-side operations that require a context user.
     */
    ContextUser?: UserInfo;
}

/**
 * Abstract base class for a **Remote Browser** provider driver — a pluggable backend that opens (or
 * attaches to) a real Chromium browser over the Chrome DevTools Protocol and returns a live
 * {@link IRemoteBrowserSession} the agent drives.
 *
 * This is the sibling of `BaseRealtimeBridge`: the Remote Browser channel is built exactly like the
 * bridge subsystem (registry table + base driver + EngineBase/Engine pair + pluggable backends). A
 * concrete driver (`SelfHostedChromeRemoteBrowser`, `BrowserbaseRemoteBrowser`, …) implements only the
 * irreducibly backend-specific primitives — everything generic (control arbitration, the
 * viewport→screen-track encode, session bookkeeping) lives in the server engine above. Drivers
 * self-register with the MemberJunction `ClassFactory` — e.g.
 * `@RegisterClass(BaseRemoteBrowserProvider, 'BrowserbaseRemoteBrowser')`. The base class itself is
 * abstract and unregistered; the engine resolves a driver via
 * `MJGlobal.ClassFactory.CreateInstance(BaseRemoteBrowserProvider, provider.DriverClass)`.
 *
 * **Capability gating (two layers, defense-in-depth).** The engine FIRST checks a provider's
 * `SupportedFeatures` flag and never calls a session method whose feature is off. The driver's own
 * capability-gated work is the SECOND layer: it calls {@link BaseRemoteBrowserProvider.RequireFeature}
 * (or builds an error via {@link BaseRemoteBrowserProvider.notSupported}) so a metadata flag that
 * lied — or a caller that bypassed the gate — fails loudly rather than silently degrading.
 *
 * **Universal CDP substrate.** Every backend (self-hosted Chrome and every browser-as-a-service)
 * exposes a CDP endpoint; the engine standardizes on CDP-connect (reusing `@memberjunction/computer-use`
 * server-side) so this Base package itself stays dependency-light and universal.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d / §4d-i.
 * @abstract
 */
export abstract class BaseRemoteBrowserProvider {
    /**
     * The capability flags for the backend this driver instance serves. Populated from the
     * {@link RemoteBrowserProviderContext} at {@link BaseRemoteBrowserProvider.Connect} time (call
     * `this.applyContext(ctx)` first). Drives {@link BaseRemoteBrowserProvider.RequireFeature}.
     */
    protected features: IRemoteBrowserProviderFeatures = {};

    /**
     * The backend's display name for this driver instance, used in capability-error messages.
     * Populated from the {@link RemoteBrowserProviderContext}; falls back to the driver class name.
     */
    protected providerName: string = '';

    /**
     * The backend's supported-feature flags for this driver instance.
     *
     * Read-only accessor over the internally-held {@link BaseRemoteBrowserProvider.features}. The
     * engine consults this (and the underlying provider metadata) to decide which capability-gated
     * session methods are safe to call; a driver consults it via
     * {@link BaseRemoteBrowserProvider.RequireFeature}.
     */
    public get Features(): IRemoteBrowserProviderFeatures {
        return this.features;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // ABSTRACT — every driver MUST implement these.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Opens or attaches a browser session on the backend over CDP and returns the live handle.
     *
     * Implementations must normalize the backend's capability flags + provider name into the
     * instance (typically by calling `this.applyContext(ctx)` first), then establish the CDP-connected
     * browser and return an {@link IRemoteBrowserSession} wrapping it.
     *
     * @param ctx The host services and connection parameters for this session.
     * @returns A promise resolving to the live remote-browser session handle.
     */
    public abstract Connect(ctx: RemoteBrowserProviderContext): Promise<IRemoteBrowserSession>;

    /**
     * Tears down / releases the backend session this driver opened (closes the container, ends the
     * browser-as-a-service session, …). Distinct from {@link IRemoteBrowserSession.Close}, which the
     * engine may call on the session handle; `Disconnect` releases the driver's own backend resources.
     *
     * @returns A promise that resolves once the backend session has been released.
     */
    public abstract Disconnect(): Promise<void>;

    // ──────────────────────────────────────────────────────────────────────────────
    // Protected helpers for driver authors.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Captures the connection context onto the instance so {@link BaseRemoteBrowserProvider.Features},
     * {@link BaseRemoteBrowserProvider.RequireFeature}, and capability-error messages have the
     * backend's flags and name. A concrete {@link BaseRemoteBrowserProvider.Connect} should call this
     * first.
     *
     * @param ctx The provider context handed to `Connect`.
     */
    protected applyContext(ctx: RemoteBrowserProviderContext): void {
        this.features = ctx.Features ?? {};
        this.providerName = ctx.ProviderName || this.constructor.name;
    }

    /**
     * Defense-in-depth guard: asserts a `SupportedFeatures` flag is enabled before the driver performs
     * a capability-gated action, throwing {@link RemoteBrowserCapabilityNotSupportedError} if it is
     * false/omitted. A driver should call this at the top of any capability-gated work so that even a
     * direct (engine-bypassing) caller cannot run an action the metadata says is off.
     *
     * @param featureName The `IRemoteBrowserProviderFeatures` flag to require.
     * @throws {RemoteBrowserCapabilityNotSupportedError} when the flag is not enabled.
     */
    protected RequireFeature(featureName: keyof IRemoteBrowserProviderFeatures): void {
        if (this.features[featureName] !== true) {
            throw new RemoteBrowserCapabilityNotSupportedError(
                String(featureName),
                this.providerName || this.constructor.name,
            );
        }
    }

    /**
     * Builds the standard {@link RemoteBrowserCapabilityNotSupportedError} for an un-overridden
     * capability or a failed feature requirement, stamped with this driver's backend name.
     *
     * @param featureName The feature / method name to report.
     * @returns The error to throw or reject with.
     */
    protected notSupported(featureName: string): RemoteBrowserCapabilityNotSupportedError {
        return new RemoteBrowserCapabilityNotSupportedError(
            featureName,
            this.providerName || this.constructor.name,
        );
    }
}
