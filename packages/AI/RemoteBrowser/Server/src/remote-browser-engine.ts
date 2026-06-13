/**
 * @fileoverview The server-tier Remote Browser engine — **coordination + execution**.
 *
 * `RemoteBrowserEngine` is the sibling of `AIBridgeEngine`: where the bridge engine wires a media
 * transport seam to an external meeting/call, this engine opens and arbitrates a live CDP-connected
 * browser the agent (and optionally a human) drives. It **composes** {@link RemoteBrowserEngineBase}
 * (the metadata-only cache of backend providers + capability flags) rather than extending it — exactly
 * mirroring how `AIBridgeEngine` composes `AIBridgeEngineBase` and `AIEngine` composes `AIEngineBase`.
 * Composition (not inheritance) keeps the startup manager warming exactly ONE `BaseEngine` cache; an
 * inheriting subclass would make the manager instantiate two engines, each loading its own copy of the
 * same provider registry.
 *
 * @module @memberjunction/remote-browser-server
 * @author MemberJunction.com
 */

import {
    IMetadataProvider,
    IStartupSink,
    LogError,
    LogStatus,
    RegisterForStartup,
    UserInfo,
} from '@memberjunction/core';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';
import {
    BaseRemoteBrowserProvider,
    IRemoteBrowserProviderFeatures,
    IRemoteBrowserSession,
    RemoteBrowserCapabilityNotSupportedError,
    RemoteBrowserControlMode,
    RemoteBrowserEngineBase,
    RemoteBrowserHumanInput,
    RemoteBrowserScreencastFrame,
    isControlModeSupported,
} from '@memberjunction/remote-browser-base';

/**
 * Who currently holds the input floor of a remote-browser session — the arbiter's view of control.
 *
 * - `Agent` — the agent drives; human input is not routed (the default for every mode).
 * - `Human` — a human "has the wheel"; only reachable in `Collaborative`, and only after a granted
 *   {@link RemoteBrowserEngine.RequestControl} → {@link RemoteBrowserEngine.GrantControl} handshake.
 */
export type RemoteBrowserFloorHolder = 'Agent' | 'Human';

/**
 * Parameters for {@link RemoteBrowserEngine.StartSession}.
 *
 * The provider is identified by EITHER its display name OR its `DriverClass` (exactly one is required);
 * everything else is optional tuning. The engine resolves the provider through the composed base
 * cache, so the caller never touches metadata directly.
 */
export interface StartRemoteBrowserSessionParams {
    /**
     * The backend's display name (e.g. `'Self-Hosted Chrome'`, `'Browserbase'`). Resolved via
     * {@link RemoteBrowserEngineBase.ProviderByName}. Mutually exclusive with {@link DriverClass};
     * supply exactly one.
     */
    ProviderName?: string;

    /**
     * The backend's `DriverClass` (the ClassFactory key, e.g. `'BrowserbaseRemoteBrowser'`). Resolved
     * via {@link RemoteBrowserEngineBase.ProviderByDriverClass}. Mutually exclusive with
     * {@link ProviderName}; supply exactly one.
     */
    DriverClass?: string;

    /**
     * Optional per-session override of the provider's `DefaultControlMode`. Validated against the
     * backend's capability flags via `isControlModeSupported`; an unsupported override is rejected
     * (rather than silently downgraded) so a misconfiguration fails loudly at start.
     */
    ControlModeOverride?: RemoteBrowserControlMode;

    /**
     * Opaque, backend-specific connection configuration (region, Chrome image, proxy, resolved
     * credential references, …). When omitted the engine parses the provider row's `Configuration`
     * JSON; when supplied it takes precedence (already-parsed, so no JSON round-trip).
     */
    Configuration?: Record<string, unknown>;

    /** The MJ user the session runs as; every session is owned + audited by a user. */
    ContextUser?: UserInfo;
}

/**
 * The live, in-memory handle for one running remote-browser session held by the engine. Carries the
 * resolved driver + session, the provider row, the resolved control mode, and the current floor
 * holder so teardown and the control arbiter can reach all of them.
 */
export interface RemoteBrowserSessionHandle {
    /** The engine-generated session id (the key in the live-session map). */
    SessionID: string;

    /** The concrete provider driver instance that opened the session. */
    Driver: BaseRemoteBrowserProvider;

    /** The live CDP-connected session the agent/human drives. */
    Session: IRemoteBrowserSession;

    /** The provider registry row backing this session. */
    Provider: MJAIRemoteBrowserProviderEntity;

    /** The resolved control mode (`AgentOnly` / `ViewOnly` / `Collaborative`) for this session. */
    ControlMode: RemoteBrowserControlMode;

    /** The backend's capability flags, captured at connect for arbiter + screencast gating. */
    Features: IRemoteBrowserProviderFeatures;

    /** Who currently holds the input floor. Starts as `'Agent'`; the arbiter mutates it. */
    FloorHolder: RemoteBrowserFloorHolder;

    /** Whether a human has an outstanding, not-yet-granted control request (Collaborative only). */
    HumanControlRequested: boolean;

    /** The context user the session runs as. */
    ContextUser?: UserInfo;
}

/**
 * A consumer of encoded viewport frames — the sink the channel's ScreenOut media track (or a console
 * panel) provides to {@link RemoteBrowserEngine.PipeScreencastToTrack}. Each emitted
 * {@link RemoteBrowserScreencastFrame} is handed to the sink in order.
 */
export type RemoteBrowserScreencastSink = (frame: RemoteBrowserScreencastFrame) => void;

/**
 * Server-tier engine for the Remote Browser plane — **coordination + execution**.
 *
 * Composes {@link RemoteBrowserEngineBase} (the ONE metadata cache) and adds everything that actually
 * *runs* a browser session:
 *
 * - **Session lifecycle** — {@link StartSession} resolves the provider, asserts it is `Active`,
 *   resolves the driver via the `ClassFactory`, validates the control mode against the backend's
 *   capabilities, builds the {@link import('@memberjunction/remote-browser-base').RemoteBrowserProviderContext}
 *   and connects. {@link EndSession} tears it down.
 * - **The control arbiter** — {@link RequestControl} / {@link GrantControl} / {@link YieldControl}
 *   mediate the input floor per {@link RemoteBrowserControlMode}: `AgentOnly` denies human control
 *   outright, `ViewOnly` lets humans watch but never drive, `Collaborative` lets a human grab the
 *   wheel via a request→grant handshake. {@link RouteHumanInput} routes a human event into the backend
 *   ONLY while the human holds the floor.
 * - **The viewport→screen-track seam** — {@link PipeScreencastToTrack} (gated on `ScreenStreaming`)
 *   starts the session's screencast and forwards each encoded frame to the supplied sink, which the
 *   bridge ScreenOut track (or a console panel) consumes.
 * - **Janitor scaffold** — {@link ReconcileOrphans} force-closes live sessions left dangling, mirroring
 *   the bridge engine's reconciliation (scheduling is a host concern).
 *
 * The engine never constructs the realtime model or the channel plane — those wire AROUND it. Its only
 * coupling is to the {@link IRemoteBrowserSession} interface the driver returns, which makes the whole
 * engine unit-testable with a fake driver + fake session.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d-i — the
 * `RemoteBrowserEngineBase` / `RemoteBrowserEngine` pair.
 */
@RegisterForStartup({
    deferred: true,
    deferredDelay: 15000,
    description: 'Server-side Remote Browser Engine (live browser session coordination + control arbiter)',
})
export class RemoteBrowserEngine extends BaseSingleton<RemoteBrowserEngine> implements IStartupSink {
    /** In-memory registry of the remote-browser sessions this process currently hosts, keyed by session id (lowercased). */
    private activeSessions = new Map<string, RemoteBrowserSessionHandle>();

    /** Monotonic counter feeding the generated session-id suffix (unique within this process). */
    private sessionCounter = 0;

    /**
     * The singleton accessor. Keyed by THIS class's name in the Global Object Store (via
     * {@link BaseSingleton}), distinct from {@link RemoteBrowserEngineBase.Instance} — which this engine
     * composes rather than inherits.
     */
    public static get Instance(): RemoteBrowserEngine {
        return super.getInstance<RemoteBrowserEngine>();
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Composed base — the ONE BaseEngine cache. All metadata is read through this.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * The single underlying {@link RemoteBrowserEngineBase} instance whose `BaseEngine` cache holds the
     * provider registry. Composed (not inherited) so the startup manager warms exactly one cache; all
     * metadata reads on this engine delegate here.
     */
    protected get Base(): RemoteBrowserEngineBase {
        return RemoteBrowserEngineBase.Instance;
    }

    /**
     * Deferred-startup entry point (per {@link IStartupSink}). Warms the ONE composed base cache by
     * delegating to {@link RemoteBrowserEngineBase.Config}; mirrors `AIBridgeEngine.HandleStartup`.
     *
     * @param contextUser The boot/system user context.
     * @param provider Optional metadata provider override (multi-provider scenarios).
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Config(false, contextUser, provider);
    }

    /**
     * Loads (or refreshes) the composed base's provider metadata cache. Delegates to
     * {@link RemoteBrowserEngineBase.Config}. Idempotent — a no-op when already loaded unless
     * `forceRefresh`.
     *
     * @param forceRefresh When `true`, reloads even if already loaded.
     * @param contextUser Required server-side for proper data isolation.
     * @param provider Optional explicit metadata provider (multi-provider scenarios).
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        await this.Base.Config(forceRefresh, contextUser, provider);
    }

    /** Returns `true` once the composed base cache is loaded. */
    public get Loaded(): boolean {
        return this.Base.Loaded;
    }

    /** All cached `MJ: AI Remote Browser Providers` rows. @see RemoteBrowserEngineBase.Providers */
    public get Providers(): MJAIRemoteBrowserProviderEntity[] {
        return this.Base.Providers;
    }

    /** The remote-browser sessions this process currently hosts (read-only snapshot). */
    public get ActiveSessions(): ReadonlyArray<RemoteBrowserSessionHandle> {
        return Array.from(this.activeSessions.values());
    }

    /**
     * Returns the live session handle for an id, or `undefined` when this process holds no such session.
     *
     * @param sessionId The engine-generated session id.
     * @returns The live handle, or `undefined`.
     */
    public GetSession(sessionId: string): RemoteBrowserSessionHandle | undefined {
        return this.activeSessions.get(sessionId.toLowerCase());
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Lifecycle — start / end a remote-browser session.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Starts a live remote-browser session: resolves the provider, validates it + the control mode,
     * resolves and connects the driver, and registers the live handle.
     *
     * Flow:
     * 1. Resolve the provider row by name or driver class (exactly one must be supplied + must match).
     * 2. Assert the provider is `Active` (a disabled backend cannot start sessions).
     * 3. Resolve the resolved {@link RemoteBrowserControlMode} (override ?? provider default) and
     *    validate it against the backend's capability flags — reject an unsupported mode.
     * 4. Resolve the driver via `ClassFactory.CreateInstance(BaseRemoteBrowserProvider, DriverClass)`.
     * 5. Build the provider context and `Connect`, then register + return the live handle (floor = Agent).
     *
     * @param params The session parameters.
     * @returns The live {@link RemoteBrowserSessionHandle}.
     * @throws When the provider cannot be resolved, is disabled, the control mode is unsupported, the
     *  driver cannot be resolved, or `Connect` fails.
     */
    public async StartSession(params: StartRemoteBrowserSessionParams): Promise<RemoteBrowserSessionHandle> {
        const provider = this.resolveProvider(params);
        this.assertActive(provider);

        const features = this.Base.FeaturesFor(provider);
        const controlMode = this.resolveControlMode(provider, features, params.ControlModeOverride);

        const driver = this.resolveDriver(provider);
        const configuration = this.resolveConfiguration(provider, params.Configuration);
        const session = await driver.Connect({
            Features: features,
            ProviderName: provider.Name,
            ProviderType: provider.ProviderType,
            ControlMode: controlMode,
            Configuration: configuration,
            ContextUser: params.ContextUser,
        });

        const handle: RemoteBrowserSessionHandle = {
            SessionID: this.generateSessionId(provider),
            Driver: driver,
            Session: session,
            Provider: provider,
            ControlMode: controlMode,
            Features: features,
            FloorHolder: 'Agent',
            HumanControlRequested: false,
            ContextUser: params.ContextUser,
        };
        this.activeSessions.set(handle.SessionID.toLowerCase(), handle);
        LogStatus(
            `[RemoteBrowserEngine] Session ${handle.SessionID} started via ${provider.Name} ` +
                `(mode=${controlMode}, type=${provider.ProviderType}).`,
        );
        return handle;
    }

    /**
     * Ends a live session: closes the session handle, disconnects the driver, and removes the live
     * registry entry. Tolerant of teardown errors (logged, never rethrown) and idempotent — ending a
     * session this process no longer holds is a benign no-op.
     *
     * @param sessionId The session id to end.
     * @returns `true` when a live session was found and torn down, `false` when none was held.
     */
    public async EndSession(sessionId: string): Promise<boolean> {
        const key = sessionId.toLowerCase();
        const handle = this.activeSessions.get(key);
        if (!handle) {
            return false;
        }
        this.activeSessions.delete(key);
        await this.teardown(handle);
        LogStatus(`[RemoteBrowserEngine] Session ${handle.SessionID} ended.`);
        return true;
    }

    /**
     * Force-closes every live session this process holds whose backend matches a predicate — the
     * janitor seam for orphan reconciliation (e.g. on host drain). Mirrors the bridge engine's
     * {@link import('@memberjunction/ai-bridge-server').AIBridgeEngine.ReconcileOrphans} posture: the
     * sweep logic lives here, but the *scheduling* (boot recovery + periodic timer) is intentionally
     * left to the host so this package carries no timer/IO of its own.
     *
     * @param predicate Optional filter; when omitted every live session is reconciled. Returning `true`
     *  marks the session for force-close.
     * @returns The number of sessions closed.
     */
    public async ReconcileOrphans(
        predicate?: (handle: RemoteBrowserSessionHandle) => boolean,
    ): Promise<number> {
        const targets = Array.from(this.activeSessions.values()).filter(h => (predicate ? predicate(h) : true));
        let closed = 0;
        for (const handle of targets) {
            const ended = await this.EndSession(handle.SessionID);
            if (ended) {
                closed++;
            }
        }
        if (closed > 0) {
            LogStatus(`[RemoteBrowserEngine] Janitor reconciled ${closed} orphaned remote-browser session(s).`);
        }
        return closed;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // The control arbiter — mediates the input floor per RemoteBrowserControlMode.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Requests that a human be granted the input floor.
     *
     * Honored ONLY in `Collaborative` mode (the only mode that permits human driving): it records an
     * outstanding request that {@link GrantControl} later satisfies. In `AgentOnly` and `ViewOnly` the
     * request is denied — a human can never take the wheel there.
     *
     * @param sessionId The session to request control on.
     * @returns `true` when the request was accepted (Collaborative), `false` when denied by the mode or
     *  the session is unknown.
     */
    public RequestControl(sessionId: string): boolean {
        const handle = this.requireSession(sessionId);
        if (!handle || handle.ControlMode !== 'Collaborative') {
            return false;
        }
        handle.HumanControlRequested = true;
        return true;
    }

    /**
     * Grants the input floor to the requested party, transferring the wheel.
     *
     * - Granting to `'Human'` succeeds only in `Collaborative` AND only after a {@link RequestControl}
     *   (the request→grant handshake). The outstanding request is cleared on grant.
     * - Granting to `'Agent'` always succeeds (the agent reclaiming the wheel is unconditional).
     *
     * @param sessionId The session to grant control on.
     * @param who The party to grant the floor to.
     * @returns `true` when the grant took effect, `false` when rejected by the mode / missing request /
     *  unknown session.
     */
    public GrantControl(sessionId: string, who: RemoteBrowserFloorHolder): boolean {
        const handle = this.requireSession(sessionId);
        if (!handle) {
            return false;
        }
        if (who === 'Agent') {
            handle.FloorHolder = 'Agent';
            handle.HumanControlRequested = false;
            return true;
        }
        // who === 'Human': only valid in Collaborative AND only after a request.
        if (handle.ControlMode !== 'Collaborative' || !handle.HumanControlRequested) {
            return false;
        }
        handle.FloorHolder = 'Human';
        handle.HumanControlRequested = false;
        return true;
    }

    /**
     * Yields the input floor BACK from the named party to the agent — the inverse of a human grant.
     *
     * A no-op (returning `true`) when the named party does not currently hold the floor, so a "human
     * yields" call is safe even if the agent already reclaimed the wheel. Yielding always returns the
     * floor to the agent (the resting state across every mode).
     *
     * @param sessionId The session to yield on.
     * @param who The party giving up the floor.
     * @returns `true` when the floor is (now or already) with the agent, `false` for an unknown session.
     */
    public YieldControl(sessionId: string, who: RemoteBrowserFloorHolder): boolean {
        const handle = this.requireSession(sessionId);
        if (!handle) {
            return false;
        }
        handle.HumanControlRequested = false;
        if (handle.FloorHolder === who) {
            handle.FloorHolder = 'Agent';
        }
        return true;
    }

    /**
     * Routes a human takeover input into the backend browser — but ONLY while the human holds the floor.
     *
     * The arbiter is the gate: in `AgentOnly` the human never holds the floor (input is dropped); in
     * `ViewOnly` the human watches but never drives (input is dropped); in `Collaborative` input is
     * routed to {@link IRemoteBrowserSession.RouteHumanInput} only while {@link RemoteBrowserSessionHandle.FloorHolder}
     * is `'Human'`. This is the runtime enforcement of "observe only, no input routed" / "mediate
     * agent⇄human" from the control model.
     *
     * @param sessionId The session to route input into.
     * @param input The human input event; narrow on `input.Kind`.
     * @returns `true` when the input was routed to the backend, `false` when the arbiter dropped it
     *  (mode/floor) or the session is unknown.
     */
    public RouteHumanInput(sessionId: string, input: RemoteBrowserHumanInput): boolean {
        const handle = this.requireSession(sessionId);
        if (!handle || handle.FloorHolder !== 'Human') {
            return false;
        }
        handle.Session.RouteHumanInput(input);
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // The viewport→screen-track seam — gated on the ScreenStreaming capability.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Pipes the session's live viewport screencast to a frame sink — the documented seam the bridge
     * ScreenOut track (screen-sharing the browser into a meeting) or a console panel consumes.
     *
     * **Capability-gated** by the backend's `ScreenStreaming` flag: the engine refuses to call
     * {@link IRemoteBrowserSession.StartScreencast} on a backend that does not advertise it (the first
     * of the two-layer gate; the driver's own `RequireFeature` is the second). Each encoded
     * {@link RemoteBrowserScreencastFrame} is forwarded to the supplied sink in order.
     *
     * @param sessionId The session whose viewport to stream.
     * @param sink The consumer of encoded frames (the ScreenOut track / a console panel).
     * @returns A promise that resolves once the screencast has started.
     * @throws {RemoteBrowserCapabilityNotSupportedError} when the backend does not support screen
     *  streaming, or {@link Error} when the session is unknown.
     */
    public async PipeScreencastToTrack(sessionId: string, sink: RemoteBrowserScreencastSink): Promise<void> {
        const handle = this.requireSession(sessionId);
        if (!handle) {
            throw new Error(`RemoteBrowserEngine.PipeScreencastToTrack: no live session '${sessionId}'.`);
        }
        if (handle.Features.ScreenStreaming !== true) {
            // Layer 1 of the two-layer gate: never call a capability-gated method the metadata says is off.
            throw this.notSupported('ScreenStreaming', handle.Provider.Name);
        }
        await handle.Session.StartScreencast(frame => sink(frame));
        LogStatus(`[RemoteBrowserEngine] Screencast piped for session ${handle.SessionID}.`);
    }

    /**
     * Stops a screencast previously started with {@link PipeScreencastToTrack}.
     *
     * **Capability-gated** by `ScreenStreaming` (same as starting). A no-op when the session is unknown.
     *
     * @param sessionId The session whose screencast to stop.
     * @returns A promise that resolves once streaming has stopped.
     */
    public async StopScreencast(sessionId: string): Promise<void> {
        const handle = this.requireSession(sessionId);
        if (!handle || handle.Features.ScreenStreaming !== true) {
            return;
        }
        await handle.Session.StopScreencast();
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Provider / driver / config / mode resolution (private helpers).
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Resolves the provider row from the start params by name OR driver class. Exactly one selector
     * must be supplied; both-or-neither is a configuration error.
     *
     * @param params The session parameters carrying the selector.
     * @returns The resolved provider row.
     * @throws When neither/both selectors are given, or no matching provider exists.
     */
    private resolveProvider(params: StartRemoteBrowserSessionParams): MJAIRemoteBrowserProviderEntity {
        const hasName = !!params.ProviderName?.trim();
        const hasClass = !!params.DriverClass?.trim();
        if (hasName === hasClass) {
            throw new Error(
                'RemoteBrowserEngine.StartSession requires exactly one of ProviderName or DriverClass.',
            );
        }
        const provider = hasName
            ? this.Base.ProviderByName(params.ProviderName as string)
            : this.Base.ProviderByDriverClass(params.DriverClass as string);
        if (!provider) {
            const selector = hasName ? `name '${params.ProviderName}'` : `driver class '${params.DriverClass}'`;
            throw new Error(`No remote-browser provider found for ${selector}.`);
        }
        return provider;
    }

    /**
     * Asserts a provider is `Active`; a disabled backend cannot start new sessions.
     *
     * @param provider The provider row to check.
     * @throws When the provider's `Status` is not `'Active'`.
     */
    private assertActive(provider: MJAIRemoteBrowserProviderEntity): void {
        if (provider.Status !== 'Active') {
            throw new Error(
                `Remote-browser provider '${provider.Name}' is not Active (Status='${provider.Status}') and cannot start a session.`,
            );
        }
    }

    /**
     * Resolves the effective control mode (override ?? provider default) and validates it against the
     * backend's capability flags.
     *
     * @param provider The provider row (supplies the default mode + name for errors).
     * @param features The backend's capability flags.
     * @param override The optional per-session override.
     * @returns The validated, resolved control mode.
     * @throws When the resolved mode is not supported by the backend's capabilities.
     */
    private resolveControlMode(
        provider: MJAIRemoteBrowserProviderEntity,
        features: IRemoteBrowserProviderFeatures,
        override?: RemoteBrowserControlMode,
    ): RemoteBrowserControlMode {
        const mode = override ?? provider.DefaultControlMode;
        if (!isControlModeSupported(mode, features)) {
            throw new Error(
                `Control mode '${mode}' is not supported by provider '${provider.Name}': it lacks the ` +
                    `required capability (ViewOnly needs LiveView; Collaborative needs LiveView + HumanTakeover).`,
            );
        }
        return mode;
    }

    /**
     * Resolves the concrete driver for a provider via the MJ `ClassFactory`, keyed by `DriverClass`.
     *
     * Verifies a concrete registration exists first — `ClassFactory.CreateInstance` falls back to the
     * (abstract) base when nothing is registered under the key, which would later fail opaquely on the
     * first `Connect` call. Mirrors `AIBridgeEngine.resolveDriver`.
     *
     * @param provider The provider whose `DriverClass` selects the driver.
     * @returns The instantiated driver.
     * @throws When no driver is registered under the provider's `DriverClass`, or instantiation fails.
     */
    private resolveDriver(provider: MJAIRemoteBrowserProviderEntity): BaseRemoteBrowserProvider {
        const driverClass = provider.DriverClass;
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseRemoteBrowserProvider,
            driverClass,
        );
        if (!registration) {
            throw new Error(
                `No remote-browser driver registered for DriverClass '${driverClass}' (provider '${provider.Name}').`,
            );
        }
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemoteBrowserProvider>(
            BaseRemoteBrowserProvider,
            driverClass,
        );
        if (!driver) {
            throw new Error(
                `Failed to instantiate remote-browser driver '${driverClass}' (provider '${provider.Name}').`,
            );
        }
        return driver;
    }

    /**
     * Resolves the connection configuration: the explicit params override (already parsed) when given,
     * otherwise the provider row's `Configuration` JSON parsed into a record. A NULL/blank column or a
     * parse failure yields `undefined` (the driver then relies on its own defaults).
     *
     * @param provider The provider row carrying the stored configuration.
     * @param override The optional already-parsed configuration override.
     * @returns The resolved configuration object, or `undefined`.
     */
    private resolveConfiguration(
        provider: MJAIRemoteBrowserProviderEntity,
        override?: Record<string, unknown>,
    ): Record<string, unknown> | undefined {
        if (override) {
            return override;
        }
        const raw = provider.Configuration;
        if (!raw || raw.trim().length === 0) {
            return undefined;
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : undefined;
        } catch (err) {
            LogError(
                `[RemoteBrowserEngine] Failed to parse Configuration for provider '${provider.Name}': ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
            return undefined;
        }
    }

    /**
     * Generates a process-unique session id (provider name slug + monotonic counter + timestamp).
     *
     * @param provider The provider the session runs on (for a human-readable prefix).
     * @returns The generated session id.
     */
    private generateSessionId(provider: MJAIRemoteBrowserProviderEntity): string {
        const slug = (provider.Name ?? 'rb').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        return `${slug || 'rb'}-${++this.sessionCounter}-${Date.now().toString(36)}`;
    }

    /**
     * Tears down a live session handle: closes the session, then disconnects the driver. Each step is
     * isolated so a failing close still lets the driver disconnect, and neither propagates.
     *
     * @param handle The live session handle to tear down.
     */
    private async teardown(handle: RemoteBrowserSessionHandle): Promise<void> {
        try {
            await handle.Session.Close();
        } catch (err) {
            LogError(
                `[RemoteBrowserEngine] session Close failed for ${handle.SessionID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
        try {
            await handle.Driver.Disconnect();
        } catch (err) {
            LogError(
                `[RemoteBrowserEngine] driver Disconnect failed for ${handle.SessionID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /** Looks up a live session handle by id (lowercased), or `undefined` when not held by this process. */
    private requireSession(sessionId: string): RemoteBrowserSessionHandle | undefined {
        return this.activeSessions.get(sessionId.toLowerCase());
    }

    /** Builds the standard capability-not-supported error stamped with the backend name. */
    private notSupported(featureName: string, providerName: string): RemoteBrowserCapabilityNotSupportedError {
        return new RemoteBrowserCapabilityNotSupportedError(featureName, providerName);
    }
}
