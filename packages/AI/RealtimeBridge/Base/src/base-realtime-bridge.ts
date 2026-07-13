import { MJAIBridgeProviderEntity_IBridgeProviderFeatures } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { BridgeCapabilityNotSupportedError } from './capability-errors';
import { BridgeMediaFrame, BridgeMediaTrackKind, BridgeParticipantInfo } from './media-tracks';
import { IBridgeMeetingControlsEventSource } from './channel-plane';

/**
 * Strongly-typed shape of a bridge provider's `SupportedFeatures` JSON.
 *
 * This is an **alias** of the CodeGen-generated `MJAIBridgeProviderEntity_IBridgeProviderFeatures`
 * (emitted from the `IBridgeProviderFeatures` JSONType interface bound to the
 * `MJ: AI Bridge Providers.SupportedFeatures` column). It is re-exported here under the
 * source-interface name so bridge code can refer to `IBridgeProviderFeatures` without importing the
 * verbose generated name. Per repo convention we do not re-export TYPES from other packages as a
 * dependency chain — this is a documented type alias of a generated entity shape for ergonomics,
 * and the canonical source remains `@memberjunction/core-entities`.
 */
export type IBridgeProviderFeatures = MJAIBridgeProviderEntity_IBridgeProviderFeatures;

/**
 * The set of host services a bridge driver sees while running.
 *
 * The engine (`AIBridgeEngine`, server package) constructs this and hands it to {@link
 * BaseRealtimeBridge.Connect}. It is deliberately small: a driver should depend only on what it
 * truly needs, and everything richer (the realtime session, the channel plane) is wired by the
 * engine AROUND the driver, not handed into it. This keeps drivers thin and platform-focused.
 */
export interface RealtimeBridgeContext {
    /**
     * The provider's `SupportedFeatures` — the capability flags the engine and the driver's
     * `RequireFeature` guard gate on. Sourced from the provider metadata row's typed
     * `SupportedFeaturesObject` accessor.
     */
    Features: IBridgeProviderFeatures;

    /**
     * The provider's display name (e.g. `'Zoom'`, `'Twilio'`), used in capability-error messages
     * and logging.
     */
    ProviderName: string;

    /**
     * The address the bridge connects to — a meeting join URL/ID for meeting bridges, or a phone
     * number for telephony bridges. Interpretation is driver-specific.
     */
    Address: string;

    /**
     * Opaque, provider-specific connection configuration (resolved credential references, region,
     * bot display name, …) as a parsed JSON object. Typed as a record of unknown values rather
     * than `any` so it stays inspectable without losing type-safety at the boundary; the driver
     * narrows the fields it understands. Never carries inline secrets — credentials resolve through
     * MJ's credential system upstream and arrive here already resolved or as references.
     */
    Configuration?: Record<string, unknown>;

    /**
     * The MJ user the bridge session runs as. Every bridge session is owned by a user and fully
     * audited; the driver uses this for any server-side operations that require a context user.
     */
    ContextUser?: UserInfo;
}

/**
 * The outcome of a {@link BaseRealtimeBridge.Connect} call.
 *
 * On success the driver returns the platform handle for its own bot participant plus the external
 * connection identifier, which the engine persists onto the `AIAgentSessionBridge` row.
 */
export interface BridgeConnectResult {
    /**
     * The platform-native identifier of the bot participant the bridge created on the endpoint
     * (Zoom participant id, call leg id, …). Persisted as `BotParticipantID`.
     */
    BotParticipantId: string;

    /**
     * The platform-native identifier of the connection itself (meeting id, call SID, …).
     * Persisted as `ExternalConnectionID`.
     */
    ExternalConnectionId: string;
}

/**
 * Why a bridge is being disconnected. A union (not an enum) mirroring the `CloseReason` values on
 * `AIAgentSessionBridge`, so the driver can react appropriately (e.g. skip a graceful-leave
 * handshake on `Error`).
 */
export type BridgeDisconnectReason = 'Explicit' | 'HostEnded' | 'Janitor' | 'Error' | 'Shutdown';

/**
 * Abstract base class for a **Realtime Bridge** driver — a pluggable media transport that connects
 * the one realtime agent engine to an external endpoint (a Zoom/Teams/Slack/Meet/Webex/Discord
 * meeting, or a Twilio/Vonage/RingCentral/VOIP phone call).
 *
 * A concrete driver (`ZoomBridge`, `TwilioBridge`, …) implements only the irreducibly
 * platform-specific primitives; everything that can be done generically (session wiring, frame
 * normalization, turn-taking, participant bookkeeping, reconnect/teardown) lives in the engine
 * above. Drivers self-register with the MemberJunction `ClassFactory` exactly as realtime model
 * drivers do — e.g. `@RegisterClass(BaseRealtimeBridge, 'ZoomBridge')`. The base class itself is
 * abstract and unregistered; the engine resolves a driver via
 * `MJGlobal.ClassFactory.CreateInstance(BaseRealtimeBridge, provider.DriverClass)`.
 *
 * **Capability gating (two layers, defense-in-depth).** The engine FIRST checks a provider's
 * `SupportedFeatures` flag and never calls a driver method whose feature is off. The driver's own
 * virtual methods are the SECOND layer: every optional method throws
 * {@link BridgeCapabilityNotSupportedError} by default, so a driver that has not overridden a method
 * — or a metadata flag that lied — fails loudly rather than silently degrading. The protected
 * {@link BaseRealtimeBridge.RequireFeature} helper lets an overriding driver re-assert the flag at
 * the top of its implementation.
 *
 * **Media-agnostic.** {@link BaseRealtimeBridge.SendMedia} / {@link BaseRealtimeBridge.OnMedia}
 * carry typed, directional media frames — audio is just one track. Video and screen tracks ride the
 * same two methods, gated by the directional feature flags.
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3 and §9 (Phase 0/1).
 *
 * @abstract
 */
export abstract class BaseRealtimeBridge {
    /**
     * The capability flags for the provider this bridge instance serves. Populated from the
     * {@link RealtimeBridgeContext} at {@link BaseRealtimeBridge.Connect} time (and may be set by
     * the engine immediately after construction). Drives {@link BaseRealtimeBridge.RequireFeature}.
     */
    protected features: IBridgeProviderFeatures = {};

    /**
     * The provider's display name for this bridge instance, used in capability-error messages.
     * Populated from the {@link RealtimeBridgeContext}; falls back to the driver class name.
     */
    protected providerName: string = '';

    /**
     * The provider's supported-feature flags for this bridge instance.
     *
     * Read-only accessor over the internally-held {@link BaseRealtimeBridge.features}. The engine
     * consults this (and the underlying provider metadata) to decide which optional methods are
     * safe to call; a driver consults it via {@link BaseRealtimeBridge.RequireFeature}.
     */
    public get Features(): IBridgeProviderFeatures {
        return this.features;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // ABSTRACT — every bridge MUST implement these.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Joins the meeting / places or accepts the call and brings the bot participant online.
     *
     * The driver records the context (features, provider name) for later capability gating and
     * returns the platform handles the engine persists. Implementations must normalize the
     * provider's capability flags into {@link BaseRealtimeBridge.features} (typically by calling
     * `this.applyContext(ctx)` first).
     *
     * @param ctx The host services and connection parameters for this session.
     * @returns A promise resolving to the bot participant + external connection identifiers.
     */
    public abstract Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult>;

    /**
     * Leaves the meeting / hangs up the call cleanly and releases all platform resources.
     *
     * @param reason Why the disconnect is happening; drivers may shortcut graceful teardown on `Error`/`Shutdown`.
     * @returns A promise that resolves once the bot has fully left the endpoint.
     */
    public abstract Disconnect(reason: BridgeDisconnectReason): Promise<void>;

    /**
     * Sends an outbound media frame into the meeting/call — the agent's voice/video/screen
     * (fed from `IRealtimeSession.OnOutput`). Audio is just one track; the frame's
     * {@link BridgeMediaFrame.Track} selects which.
     *
     * @param track The outbound track the frame is destined for (must be an `*-out` kind).
     * @param frame The media frame to send.
     */
    public abstract SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void;

    /**
     * Registers a handler for inbound media frames — what the agent hears/sees from the endpoint
     * (routed to `IRealtimeSession.SendInput`). When the provider diarizes, inbound audio frames
     * carry {@link BridgeMediaFrame.SpeakerLabel}.
     *
     * @param handler Invoked with each inbound media frame.
     */
    public abstract OnMedia(handler: (frame: BridgeMediaFrame) => void): void;

    /**
     * Flushes any outbound media the driver has queued for the endpoint — the agent's not-yet-played
     * voice. The engine calls this on a true barge-in (the user interrupts the agent) so the agent stops
     * talking immediately instead of draining already-buffered audio after the model was cut off.
     *
     * **No-op by default** (NOT capability-gated): a driver with no client-side outbound buffer simply has
     * nothing to flush, so calling this is always safe. Drivers that buffer outbound audio override it.
     */
    public FlushOutboundMedia(): void {
        // Default: nothing buffered to flush.
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // VIRTUAL / capability-gated — throw NotSupported unless a driver overrides.
    // The engine gates each on the matching SupportedFeatures flag first.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Returns the current participant roster for the endpoint.
     *
     * Capability-gated by `SupportedFeatures.SpeakerDiarization` (roster + diarization mapping).
     * Throws {@link BridgeCapabilityNotSupportedError} unless a driver overrides it.
     *
     * @returns A promise resolving to the current participants.
     * @throws {BridgeCapabilityNotSupportedError} when not overridden by a roster-capable driver.
     */
    public GetParticipants(): Promise<BridgeParticipantInfo[]> {
        return Promise.reject(this.notSupported('GetParticipants'));
    }

    /**
     * Registers a handler invoked when the endpoint's roster changes (join / leave / role change).
     *
     * Capability-gated by `SupportedFeatures.SpeakerDiarization`. Throws unless overridden.
     *
     * @param _handler Invoked with the updated participant list on each change.
     * @throws {BridgeCapabilityNotSupportedError} when not overridden.
     */
    public OnParticipantChange(_handler: (participants: BridgeParticipantInfo[]) => void): void {
        throw this.notSupported('OnParticipantChange');
    }

    /**
     * Sends DTMF tones on a telephony bridge.
     *
     * Capability-gated by `SupportedFeatures.DTMF`. Throws unless overridden by a telephony driver.
     *
     * @param _digits The DTMF digit string to send (e.g. `'1234#'`).
     * @returns A promise that resolves once the tones have been sent.
     * @throws {BridgeCapabilityNotSupportedError} when not overridden.
     */
    public SendDTMF(_digits: string): Promise<void> {
        return Promise.reject(this.notSupported('DTMF'));
    }

    /**
     * Registers a handler for inbound DTMF tones on a telephony bridge.
     *
     * Capability-gated by `SupportedFeatures.DTMF`. Throws unless overridden.
     *
     * @param _handler Invoked with each received DTMF digit string.
     * @throws {BridgeCapabilityNotSupportedError} when not overridden.
     */
    public OnDTMF(_handler: (digits: string) => void): void {
        throw this.notSupported('DTMF');
    }

    /**
     * Transfers the call to another party on a telephony bridge.
     *
     * Capability-gated by `SupportedFeatures.CallTransfer`. Throws unless overridden.
     *
     * @param _target The transfer target (a phone number or platform endpoint identifier).
     * @returns A promise that resolves once the transfer has been initiated.
     * @throws {BridgeCapabilityNotSupportedError} when not overridden.
     */
    public TransferCall(_target: string): Promise<void> {
        return Promise.reject(this.notSupported('CallTransfer'));
    }

    /**
     * Requests that the platform begin recording the session.
     *
     * Capability-gated by `SupportedFeatures.Recording` (and subject to per-jurisdiction consent
     * handling upstream). Throws unless overridden.
     *
     * @returns A promise that resolves once recording has started.
     * @throws {BridgeCapabilityNotSupportedError} when not overridden.
     */
    public StartRecording(): Promise<void> {
        return Promise.reject(this.notSupported('Recording'));
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Channel-plane contribution — optional, NOT a throwing capability gate.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Returns a **Meeting Controls** event source adapting this driver's native participant / speaking
     * / hand-raise stream into the server-side channel plane, or `null` when the driver contributes no
     * such surface. Unlike the capability-gated virtuals above this does **not** throw by default — it
     * is a contribution hook, and most drivers (and all telephony drivers) legitimately contribute
     * nothing. The engine wires the Meeting Controls channel only for drivers that return a non-null
     * source, so the base default of `null` means "no facilitator surface".
     *
     * A meeting driver (e.g. `ZoomBridge`) overrides this to return an {@link IBridgeMeetingControlsEventSource}
     * fed by its roster/speaking/hand-raise events; the engine hands it to the channel plane's
     * `MeetingControlsChannelServer` so the agent gains the facilitator tool vocabulary + perception.
     * Typically only meaningful when the provider also has `SpeakerDiarization` (a roster to facilitate).
     *
     * @returns The driver's Meeting Controls event source, or `null` (the default — no facilitator surface).
     */
    public GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return null;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Protected helpers for driver authors.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Captures the connection context onto the instance so {@link BaseRealtimeBridge.Features},
     * {@link BaseRealtimeBridge.RequireFeature}, and capability-error messages have the provider's
     * flags and name. A concrete {@link BaseRealtimeBridge.Connect} should call this first.
     *
     * @param ctx The bridge context handed to `Connect`.
     */
    protected applyContext(ctx: RealtimeBridgeContext): void {
        this.features = ctx.Features ?? {};
        this.providerName = ctx.ProviderName || this.constructor.name;
    }

    /**
     * Defense-in-depth guard: asserts a `SupportedFeatures` flag is enabled before the driver
     * performs a capability-gated action, throwing {@link BridgeCapabilityNotSupportedError} if it
     * is false/omitted. An overriding driver method should call this at its top so that even a
     * direct (engine-bypassing) caller cannot run an action the metadata says is off.
     *
     * @param featureName The `IBridgeProviderFeatures` flag to require.
     * @throws {BridgeCapabilityNotSupportedError} when the flag is not enabled.
     */
    protected RequireFeature(featureName: keyof IBridgeProviderFeatures): void {
        if (this.features[featureName] !== true) {
            throw new BridgeCapabilityNotSupportedError(
                String(featureName),
                this.providerName || this.constructor.name,
            );
        }
    }

    /**
     * Builds the standard {@link BridgeCapabilityNotSupportedError} for an un-overridden virtual
     * method or a failed feature requirement, stamped with this bridge's provider name.
     *
     * @param featureName The feature / method name to report.
     * @returns The error to throw or reject with.
     */
    protected notSupported(featureName: string): BridgeCapabilityNotSupportedError {
        return new BridgeCapabilityNotSupportedError(
            featureName,
            this.providerName || this.constructor.name,
        );
    }
}
