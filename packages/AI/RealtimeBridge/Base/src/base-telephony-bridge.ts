/**
 * @fileoverview `BaseTelephonyBridge` — the telephony specialization of {@link BaseRealtimeBridge}.
 *
 * A **telephony bridge** connects the one realtime agent engine to a **phone call** (Twilio / Vonage /
 * RingCentral / VOIP) instead of a meeting. Architecturally a phone call is just a single-leg audio
 * media source: it goes through the SAME transport seam (`bridge.OnMedia → IRealtimeSession.SendInput`,
 * `IRealtimeSession.OnOutput → bridge.SendMedia`) as every meeting bridge. What telephony ADDS on top of
 * the media-bridge base is a small, call-shaped vocabulary:
 *
 * - **two ways onto the call** — place one (**outbound** dial) or pick one up (**inbound** answer),
 *   selected by the session's {@link BridgeConnectDirection Direction};
 * - **DTMF** — send and receive touch-tones (gated by the `DTMF` feature);
 * - **call transfer** — hand the call to another party (gated by the `CallTransfer` feature);
 * - a **single remote party** — the caller — so "diarization" is trivial (one speaker label).
 *
 * What telephony deliberately does **not** have, and this base reflects:
 *
 * - **No video / screen tracks.** A phone call carries audio only. `SendMedia` no-ops video/screen out,
 *   and the directional video/screen feature flags are absent from telephony provider rows.
 * - **No Meeting Controls / facilitator surface.** There is no roster, no hand-raise, no who's-speaking
 *   queue on a 1:1 phone call, so {@link BaseTelephonyBridge.GetMeetingControlsEventSource} returns `null`
 *   (the base default, re-documented here for telephony intent).
 *
 * Concrete drivers (`TwilioBridge`, `VonageBridge`, `RingCentralBridge`) are minimal subclasses: they
 * supply a concrete {@link ITelephonyCallSdk} through {@link BaseTelephonyBridge.SetSdkFactory} and
 * little else — all the call lifecycle, media wiring, DTMF, and transfer logic lives here.
 *
 * @module @memberjunction/ai-bridge-base
 * @see {@link BaseRealtimeBridge} — the media-bridge base this extends.
 * @see `/plans/realtime/realtime-bridges-architecture.md` §8 (Twilio/Vonage/RingCentral capability rows)
 *      and §9 Phase 6 (telephony).
 */

import { LogError } from '@memberjunction/core';
import {
    BaseRealtimeBridge,
    BridgeConnectResult,
    BridgeDisconnectReason,
    RealtimeBridgeContext,
} from './base-realtime-bridge';
import { BridgeMediaFrame, BridgeMediaTrackKind, BridgeParticipantInfo } from './media-tracks';
import { IBridgeMeetingControlsEventSource } from './channel-plane';

/**
 * Whether a telephony bridge **places** the call (outbound) or **answers** an incoming one (inbound).
 *
 * A union (not an enum) so it exports cleanly and mirrors the `Direction` column on
 * `AIAgentSessionBridge`. {@link BaseTelephonyBridge.Connect} branches on this: `'Outbound'` →
 * {@link ITelephonyCallSdk.dial}, `'Inbound'` → {@link ITelephonyCallSdk.answer}.
 */
export type BridgeConnectDirection = 'Inbound' | 'Outbound';

/**
 * The well-known key under which {@link BaseTelephonyBridge.Connect} reads the call
 * {@link BridgeConnectDirection} from {@link RealtimeBridgeContext.Configuration}.
 *
 * The shipped {@link RealtimeBridgeContext} carries no first-class `Direction` field (it is a meeting-
 * shaped contract), so the bridge-server engine forwards the session's `Direction` into the driver's
 * `Configuration` under this key. Telephony drivers and tests set `Configuration[DIRECTION_CONFIG_KEY]`
 * to `'Inbound'` / `'Outbound'`; the default when absent is `'Outbound'` (the agent placed the call).
 */
export const DIRECTION_CONFIG_KEY = 'Direction';

/**
 * The well-known {@link RealtimeBridgeContext.Configuration} key carrying the agent's own caller-id /
 * DID — the number outbound calls originate FROM. Resolved upstream (the agent's
 * `AIBridgeAgentIdentity` phone number) and forwarded into the driver config; never an inline secret.
 */
export const FROM_NUMBER_CONFIG_KEY = 'FromNumber';

/**
 * The well-known {@link RealtimeBridgeContext.Configuration} key carrying the platform-native call
 * identifier for an **inbound** call the agent is answering (e.g. the Twilio Call SID the inbound
 * webhook delivered). Required to answer an inbound call; ignored for outbound.
 */
export const INBOUND_CALL_ID_CONFIG_KEY = 'InboundCallId';

/**
 * The role of the single remote party on a telephony call, surfaced through
 * {@link BaseTelephonyBridge.GetParticipants}. Telephony has no host/co-host roster — there is exactly
 * one human (`'Participant'`) plus the agent (`'Agent'`).
 */
export type TelephonyParticipantRole = 'Participant' | 'Agent';

/**
 * The injectable **telephony call SDK seam** — the minimal per-provider call API a
 * {@link BaseTelephonyBridge} drives. Declared as an interface so telephony drivers build and unit-test
 * against an in-memory fake with **no network and no real CPaaS client** (the same testability pattern
 * the meeting SDK seams use: `IZoomMeetingSdk`, `IDiscordVoiceSdk`, …).
 *
 * The base bridge owns the lifecycle and media wiring; this seam exposes only the irreducible call
 * primitives each provider (Twilio, Vonage, RingCentral) binds to its own client. None of the provider
 * SDK's types leak through this interface.
 *
 * All `on*` registrations are **"latest handler wins"** (one bridge instance per call).
 */
export interface ITelephonyCallSdk {
    /**
     * Places an **outbound** call FROM the agent's number TO a destination and brings the bot leg online.
     *
     * @param toNumber The destination phone number to dial (E.164 recommended).
     * @param fromNumber The agent's caller-id / DID the call originates from.
     * @param args Provider-specific dial parameters (resolved credential refs, region, recording flags, …).
     * @returns The platform-native call identifier (e.g. Twilio Call SID) for the placed call.
     */
    dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string>;

    /**
     * Answers an **inbound** call that has routed to the agent's number.
     *
     * @param callId The platform-native identifier of the inbound call to answer (from the inbound webhook).
     * @returns A promise resolving once the call is answered and the media path is live.
     */
    answer(callId: string): Promise<void>;

    /**
     * Hangs up the call and releases all platform resources.
     *
     * @param callId The platform-native identifier of the call to end.
     * @returns A promise resolving once the call has been torn down.
     */
    hangup(callId: string): Promise<void>;

    /**
     * Sends one raw PCM audio frame as the agent's outbound voice into the call (the provider's media-
     * stream / virtual-mic path).
     *
     * @param pcm The PCM audio bytes to send.
     */
    sendAudioFrame(pcm: ArrayBuffer): void;

    /**
     * Registers a callback for inbound raw audio frames from the call — what the agent hears. There is a
     * single remote party, so frames need no per-speaker label (the bridge stamps the caller's id).
     * "Latest handler wins."
     *
     * @param cb Invoked with each inbound PCM audio frame.
     */
    onAudioFrame(cb: (pcm: ArrayBuffer) => void): void;

    /**
     * Sends DTMF touch-tones on the call (the agent dialing into an IVR, entering a code, …).
     *
     * @param digits The DTMF digit string to send (e.g. `'1234#'`).
     * @returns A promise resolving once the tones have been sent.
     */
    sendDtmf(digits: string): Promise<void>;

    /**
     * Registers a callback for inbound DTMF tones the remote party presses. "Latest handler wins."
     *
     * @param cb Invoked with each received DTMF digit string.
     */
    onDtmf(cb: (digits: string) => void): void;

    /**
     * Transfers the call to another party (a number or platform endpoint).
     *
     * @param callId The platform-native identifier of the call to transfer.
     * @param toNumber The transfer destination (a phone number or platform endpoint identifier).
     * @returns A promise resolving once the transfer has been initiated.
     */
    transfer(callId: string, toNumber: string): Promise<void>;

    /**
     * Registers a callback fired when the call ends — the remote party hangs up, the carrier drops it, or
     * the provider tears it down. "Latest handler wins."
     *
     * @param cb Invoked when the call has ended.
     */
    onCallEnded(cb: () => void): void;
}

/**
 * A factory that constructs an {@link ITelephonyCallSdk} for a session — the creation seam (mirroring the
 * meeting SDK factories, e.g. `ZoomMeetingSdkFactory`). Production supplies a factory that builds the
 * real provider adapter from resolved config; tests supply one that returns an in-memory fake.
 *
 * @param config The resolved provider/session configuration (region, credential refs already resolved upstream).
 * @returns The telephony call SDK instance to drive the call with.
 */
export type TelephonyCallSdkFactory = (config?: Record<string, unknown>) => ITelephonyCallSdk;

/**
 * Abstract base class for a **telephony** Realtime Bridge driver. Extends {@link BaseRealtimeBridge}
 * with phone-call semantics — outbound dial / inbound answer, single-party audio, DTMF, and call
 * transfer — over an injectable {@link ITelephonyCallSdk} seam.
 *
 * ## What a subclass provides
 * A concrete telephony driver (`TwilioBridge`, `VonageBridge`, `RingCentralBridge`) is minimal: it binds
 * a concrete {@link ITelephonyCallSdk} via {@link SetSdkFactory} and supplies any provider-specific
 * config interpretation. Everything else — connect/disconnect lifecycle, the media seam wiring, the
 * single-party roster, DTMF, transfer, and the capability gating — is inherited from here.
 *
 * ## Direction (outbound vs inbound)
 * The shipped {@link RealtimeBridgeContext} is a meeting-shaped contract with no `Direction` field, so
 * the engine forwards the session's `Direction` into {@link RealtimeBridgeContext.Configuration} under
 * {@link DIRECTION_CONFIG_KEY}. {@link Connect} branches on it: `'Outbound'` → {@link ITelephonyCallSdk.dial}
 * (gated by the `OutboundDial` feature), `'Inbound'` → {@link ITelephonyCallSdk.answer} (gated by
 * `InboundRouting`). Both require `AudioIn` + `AudioOut`.
 *
 * ## No video / screen, no Meeting Controls
 * A phone call carries **audio only**. {@link SendMedia} sends `audio-out` to the SDK and silently no-ops
 * video/screen tracks (a telephony provider's `SupportedFeatures` does not enable them). There is **no
 * facilitator surface** — no roster, no hand-raise, no who's-speaking — so
 * {@link GetMeetingControlsEventSource} returns `null`. The single remote caller is surfaced through
 * {@link GetParticipants} (caller + agent), which is all the "roster" a 1:1 call has.
 *
 * Registered like any bridge via `@RegisterClass(BaseRealtimeBridge, '<X>Bridge')` on the concrete
 * subclass — the base itself is abstract and unregistered.
 *
 * @abstract
 */
export abstract class BaseTelephonyBridge extends BaseRealtimeBridge {
    /** The live telephony SDK seam for this call, created at {@link Connect}. */
    protected sdk: ITelephonyCallSdk | null = null;

    /** The platform-native call identifier for the live call (set at {@link Connect}). */
    protected callId: string | null = null;

    /** The remote party's number (outbound: the dialled number; inbound: best-effort caller-id). */
    protected remoteNumber: string = '';

    /** The agent's own number this call originates from / is answered on. */
    protected fromNumber: string = '';

    /** The direction this call was established with. */
    protected direction: BridgeConnectDirection = 'Outbound';

    /** The inbound-media handler registered via {@link OnMedia}; inbound audio is forwarded to it. */
    private mediaHandler?: (frame: BridgeMediaFrame) => void;

    /** The roster-change handler registered via {@link OnParticipantChange}. */
    private participantHandler?: (participants: BridgeParticipantInfo[]) => void;

    /** The inbound-DTMF handler registered via {@link OnDTMF}. */
    private dtmfHandler?: (digits: string) => void;

    /** A driver-supplied callback invoked when the SDK reports the call ended (e.g. to fail the bridge row). */
    private callEndedHandler?: () => void;

    /**
     * The synthetic external id used for the single remote caller on the roster. Stable for the life of
     * the call so `AIAgentSessionBridgeParticipant` upserts are idempotent. Subclasses may override.
     */
    protected static readonly REMOTE_PARTICIPANT_ID = 'caller';

    /**
     * The synthetic external id used for the agent's own leg on the roster. Subclasses may override.
     */
    protected static readonly AGENT_PARTICIPANT_ID = 'agent';

    /**
     * The SDK creation seam. Defaults to a factory that throws an explicit "bind the real telephony
     * client" error, since the base ships WITHOUT a concrete provider adapter. A concrete driver (or a
     * deployment) binds a real factory via {@link SetSdkFactory}; tests inject a fake.
     */
    protected sdkFactory: TelephonyCallSdkFactory = () => {
        throw new Error(
            `${this.constructor.name} has no telephony call SDK bound. Call SetSdkFactory(...) with a factory ` +
                'that builds an ITelephonyCallSdk over the real provider client, or inject a fake in tests.',
        );
    };

    /**
     * Sets the {@link TelephonyCallSdkFactory} this driver uses to construct its SDK seam at connect — the
     * creation seam (mirroring the meeting SDK factories). A concrete driver binds the real provider
     * adapter here; tests inject a fake before connecting.
     *
     * @param factory The factory that builds the {@link ITelephonyCallSdk} for a call.
     */
    public SetSdkFactory(factory: TelephonyCallSdkFactory): void {
        this.sdkFactory = factory;
    }

    // ── Abstract from BaseRealtimeBridge — implemented generically here ───────────────

    /**
     * Establishes the call. Outbound (the default) places a call via {@link ITelephonyCallSdk.dial};
     * inbound answers a routed call via {@link ITelephonyCallSdk.answer}. Wires the inbound-audio and
     * DTMF paths and the call-ended callback, seeds the single-party roster, and returns the bot leg +
     * call identifiers the engine persists.
     *
     * Direction comes from `ctx.Configuration[DIRECTION_CONFIG_KEY]` (defaults `'Outbound'`); the agent's
     * caller-id from `FromNumber`; the address ({@link RealtimeBridgeContext.Address}) is the destination
     * number (outbound) and an inbound call id arrives via `InboundCallId`.
     *
     * @param ctx The bridge context (features, provider name, destination as `Address`, config).
     * @returns The bot participant + call (external connection) identifiers.
     * @throws {BridgeCapabilityNotSupportedError} when the required audio / direction features are off.
     * @throws {Error} when no SDK factory is bound, or an inbound connect has no `InboundCallId`.
     */
    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);
        this.RequireFeature('AudioIn'); // a phone call requires bidirectional audio at minimum
        this.RequireFeature('AudioOut');

        const config = ctx.Configuration ?? {};
        this.direction = this.readDirection(config);
        this.fromNumber = this.readStringConfig(config, FROM_NUMBER_CONFIG_KEY) ?? '';

        this.sdk = this.sdkFactory(ctx.Configuration);
        this.wireInboundAudio(this.sdk);
        this.wireInboundDtmf(this.sdk);
        this.sdk.onCallEnded(() => this.handleCallEnded());

        this.callId = this.direction === 'Outbound'
            ? await this.placeOutboundCall(this.sdk, ctx)
            : await this.answerInboundCall(this.sdk, config, ctx);

        // Seed the single-party roster (caller + agent) now that the call is up.
        this.emitRoster();

        return { BotParticipantId: BaseTelephonyBridge.AGENT_PARTICIPANT_ID, ExternalConnectionId: this.callId };
    }

    /**
     * Hangs up the call and releases all SDK resources. Tolerant of teardown errors.
     *
     * @param _reason Why the disconnect happened (telephony teardown is uniform — the bot hangs up).
     */
    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        const sdk = this.sdk;
        const callId = this.callId;
        this.sdk = null;
        this.callId = null;
        this.mediaHandler = undefined;
        this.participantHandler = undefined;
        this.dtmfHandler = undefined;
        this.callEndedHandler = undefined;
        if (sdk && callId) {
            try {
                await sdk.hangup(callId);
            } catch (err) {
                LogError(`[${this.constructor.name}] hangup() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Sends an outbound media frame into the call. Audio is fed to the SDK's media-stream path; video and
     * screen tracks are **n/a for telephony** and silently dropped (a phone call carries audio only, and a
     * telephony provider's `SupportedFeatures` does not enable the video/screen flags).
     *
     * @param track The outbound track the frame targets.
     * @param frame The media frame to send.
     */
    public SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void {
        if (!this.sdk) {
            return; // not connected — drop
        }
        if (track === 'audio-out') {
            const pcm = this.framePcm(frame);
            if (pcm) {
                this.sdk.sendAudioFrame(pcm);
            }
        }
        // video-out / screen-out (and any inbound track passed in error) are n/a for telephony — no-op.
    }

    /**
     * Registers the inbound-media handler. The driver forwards each inbound audio frame (stamped with the
     * single caller's label) to it; the engine routes it to `IRealtimeSession.SendInput`.
     *
     * @param handler Invoked with each inbound media frame.
     */
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandler = handler;
    }

    // ── Capability-gated virtuals telephony supports (gated by SupportedFeatures) ─────

    /**
     * Returns the call's "roster": the single remote caller plus the agent. Telephony has no diarization
     * roster — there is exactly one human on the line — so this is the trivial two-entry list. Not gated
     * by `SpeakerDiarization` (a 1:1 call needs none); always available once connected.
     *
     * @returns The caller + agent participants.
     */
    public override async GetParticipants(): Promise<BridgeParticipantInfo[]> {
        return this.buildRoster();
    }

    /**
     * Registers a roster-change handler. On a 1:1 call the roster changes only at connect (caller joins)
     * and at end (caller leaves), so this fires once at connect with the full roster.
     *
     * @param handler Invoked with the participant list.
     */
    public override OnParticipantChange(handler: (participants: BridgeParticipantInfo[]) => void): void {
        this.participantHandler = handler;
        if (this.callId) {
            this.emitRoster(); // late subscriber gets the current roster immediately
        }
    }

    /**
     * Sends DTMF tones on the call (gated by `DTMF`). Re-asserts the flag (defense-in-depth) so even an
     * engine-bypassing caller cannot send tones a disabled provider forbids.
     *
     * @param digits The DTMF digit string to send (e.g. `'1234#'`).
     * @throws {BridgeCapabilityNotSupportedError} when DTMF is not enabled for the provider.
     */
    public override async SendDTMF(digits: string): Promise<void> {
        this.RequireFeature('DTMF');
        if (!this.sdk) {
            return;
        }
        await this.sdk.sendDtmf(digits);
    }

    /**
     * Registers an inbound-DTMF handler (gated by `DTMF`). The driver fires it from the SDK's DTMF stream.
     *
     * @param handler Invoked with each received DTMF digit string.
     * @throws {BridgeCapabilityNotSupportedError} when DTMF is not enabled.
     */
    public override OnDTMF(handler: (digits: string) => void): void {
        this.RequireFeature('DTMF');
        this.dtmfHandler = handler;
    }

    /**
     * Transfers the live call to another party (gated by `CallTransfer`). Re-asserts the flag.
     *
     * @param target The transfer destination (a phone number or platform endpoint identifier).
     * @throws {BridgeCapabilityNotSupportedError} when CallTransfer is not enabled.
     */
    public override async TransferCall(target: string): Promise<void> {
        this.RequireFeature('CallTransfer');
        if (!this.sdk || !this.callId) {
            return;
        }
        await this.sdk.transfer(this.callId, target);
    }

    // ── Channel plane — telephony contributes none ───────────────────────────────────

    /**
     * Telephony contributes **no Meeting Controls / facilitator surface**. A 1:1 phone call has no roster,
     * no hand-raise queue, and no who's-speaking timer to facilitate, so this returns `null` (the
     * {@link BaseRealtimeBridge} default — re-declared here to make the telephony intent explicit). The
     * engine therefore wires no Meeting Controls channel for a telephony session.
     *
     * @returns Always `null` — telephony has no facilitator surface.
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return null;
    }

    // ── Hooks / accessors for subclasses & the engine ────────────────────────────────

    /** The live call's platform-native identifier (or `null` before {@link Connect}). */
    public get CallId(): string | null {
        return this.callId;
    }

    /** The direction this call was established with (`'Outbound'` until {@link Connect} reads otherwise). */
    public get Direction(): BridgeConnectDirection {
        return this.direction;
    }

    /**
     * Registers a callback the bridge invokes when the underlying call ends (remote hangup / carrier drop).
     * The engine uses this to transition the bridge row to a terminal state. "Latest handler wins."
     *
     * @param handler Invoked when the call has ended.
     */
    public OnCallEnded(handler: () => void): void {
        this.callEndedHandler = handler;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Places the outbound call (gated by `OutboundDial`) and returns its platform call id. */
    private async placeOutboundCall(sdk: ITelephonyCallSdk, ctx: RealtimeBridgeContext): Promise<string> {
        this.RequireFeature('OutboundDial');
        this.remoteNumber = ctx.Address;
        return sdk.dial(ctx.Address, this.fromNumber, ctx.Configuration);
    }

    /** Answers the routed inbound call (gated by `InboundRouting`) and returns its platform call id. */
    private async answerInboundCall(
        sdk: ITelephonyCallSdk,
        config: Record<string, unknown>,
        ctx: RealtimeBridgeContext,
    ): Promise<string> {
        this.RequireFeature('InboundRouting');
        const inboundId = this.readStringConfig(config, INBOUND_CALL_ID_CONFIG_KEY);
        if (!inboundId) {
            throw new Error(
                `${this.constructor.name} inbound Connect requires an '${INBOUND_CALL_ID_CONFIG_KEY}' in ` +
                    'Configuration (the platform call id from the inbound webhook).',
            );
        }
        // For inbound, the agent's own number is the Address it was reached on; the caller is the remote.
        this.remoteNumber = this.readStringConfig(config, 'CallerNumber') ?? '';
        if (!this.fromNumber) {
            this.fromNumber = ctx.Address;
        }
        await sdk.answer(inboundId);
        return inboundId;
    }

    /** Wires the SDK's inbound-audio callback to a single-party inbound {@link BridgeMediaFrame}. */
    private wireInboundAudio(sdk: ITelephonyCallSdk): void {
        sdk.onAudioFrame((pcm: ArrayBuffer) => {
            this.mediaHandler?.({
                Track: 'audio-in',
                Bytes: pcm,
                SpeakerLabel: BaseTelephonyBridge.REMOTE_PARTICIPANT_ID, // single remote party — trivial diarization
                TimestampMs: Date.now(),
            });
        });
    }

    /** Wires the SDK's inbound-DTMF callback to the registered handler. */
    private wireInboundDtmf(sdk: ITelephonyCallSdk): void {
        sdk.onDtmf((digits: string) => this.dtmfHandler?.(digits));
    }

    /** Handles the SDK's call-ended signal: empty the roster and notify the engine's handler. */
    private handleCallEnded(): void {
        this.participantHandler?.([]);
        this.callEndedHandler?.();
    }

    /** Emits the current roster to the participant handler, if one is registered. */
    private emitRoster(): void {
        this.participantHandler?.(this.buildRoster());
    }

    /** Builds the two-entry telephony roster: the single remote caller + the agent's own leg. */
    private buildRoster(): BridgeParticipantInfo[] {
        return [
            {
                ExternalId: BaseTelephonyBridge.REMOTE_PARTICIPANT_ID,
                DisplayName: this.remoteNumber || 'Caller',
                Role: 'Participant',
                IsAgent: false,
            },
            {
                ExternalId: BaseTelephonyBridge.AGENT_PARTICIPANT_ID,
                DisplayName: this.providerName ? `${this.providerName} Agent` : 'Agent',
                Role: 'Agent',
                IsAgent: true,
            },
        ];
    }

    /** Reads + validates the call {@link BridgeConnectDirection} from config, defaulting to `'Outbound'`. */
    private readDirection(config: Record<string, unknown>): BridgeConnectDirection {
        const raw = config[DIRECTION_CONFIG_KEY];
        return raw === 'Inbound' ? 'Inbound' : 'Outbound';
    }

    /** Reads a string config value, returning `undefined` when absent or not a string. */
    private readStringConfig(config: Record<string, unknown>, key: string): string | undefined {
        const value = config[key];
        return typeof value === 'string' ? value : undefined;
    }

    /** Returns the PCM bytes of an outbound audio frame, preferring the binary payload. */
    private framePcm(frame: BridgeMediaFrame): ArrayBuffer | undefined {
        if (frame.Bytes) {
            return frame.Bytes;
        }
        if (frame.Base64) {
            return this.decodeBase64(frame.Base64);
        }
        return undefined;
    }

    /** Decodes a base64 payload to an `ArrayBuffer` (Node `Buffer` fast path, `atob` fallback). */
    private decodeBase64(base64: string): ArrayBuffer {
        if (typeof Buffer !== 'undefined') {
            const buf = Buffer.from(base64, 'base64');
            const out = new Uint8Array(buf.byteLength);
            out.set(buf);
            return out.buffer;
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
