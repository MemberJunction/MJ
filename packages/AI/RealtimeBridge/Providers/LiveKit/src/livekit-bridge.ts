/**
 * @fileoverview `LiveKitBridge` — the **MJ-native multi-party room** Realtime Bridge driver. Unlike
 * every other bridge (which connects OUT to a 3rd-party meeting/telephony platform), LiveKit is a
 * **self-hosted WebRTC SFU that MJ runs itself** — the "MJ-native room"
 * (`/plans/realtime/realtime-bridges-architecture.md` §4c). The architecture treats a Zoom meeting and
 * an MJ-native LiveKit room **identically** — both are multi-party media transports — so this is
 * "*another bridge, not a special build*."
 *
 * Implements the {@link BaseRealtimeBridge} contract against an injectable {@link ILiveKitRoomSdk} seam
 * so it builds + unit-tests with NO network and NO real LiveKit SDK (the Zoom `SetSdkFactory`
 * testability pattern).
 *
 * LiveKit capability coverage (per the §4c / §8 seed row): on-demand join, **full** audio/video/screen
 * in+out (LiveKit does the lot), and per-participant diarization (`SpeakerDiarization`) — the SFU
 * delivers tracks per participant, so speaker labels come free. No scheduled/invite/telephony features.
 * Those virtual base methods keep throwing `BridgeCapabilityNotSupportedError`.
 *
 * ## Echo / self-audio
 * A LiveKit SFU **never delivers a participant its own published track back**, so the bot does not hear
 * its own voice — no echo gate is required (see {@link wireInboundAudio}). This is exactly the property
 * §4c relies on for putting **multiple agents in one room**: each agent hears the *others'* mixed audio
 * natively, not its own, so two agents converse without a transcript-relay hack.
 *
 * @module @memberjunction/ai-bridge-livekit
 * @author MemberJunction.com
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
    BaseRealtimeBridge,
    BridgeConnectResult,
    BridgeDisconnectReason,
    BridgeMediaFrame,
    BridgeMediaTrackKind,
    BridgeParticipantInfo,
    BridgeParticipantRole,
    RealtimeBridgeContext,
    IBridgeMeetingControlsEventSource,
} from '@memberjunction/ai-bridge-base';
import {
    ILiveKitRoomSdk,
    LiveKitRoomSdkFactory,
    LiveKitParticipant,
    LiveKitParticipantRole,
    LiveKitAudioFrame,
    LiveKitConnectArgs,
} from './livekit-sdk';
import { LiveKitMeetingControlsEventSource } from './livekit-meeting-controls';

/**
 * The `DriverClass` key {@link LiveKitBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'LiveKitBridge'` resolves to this driver via the `ClassFactory`.
 */
export const LIVEKIT_BRIDGE_DRIVER_CLASS = 'LiveKitBridge';

/**
 * Maps a LiveKit participant role to the bridge's {@link BridgeParticipantRole}. The bot (`IsLocal`) is
 * surfaced as `'Agent'`.
 */
function mapParticipantRole(role: LiveKitParticipantRole, isLocal: boolean | undefined): BridgeParticipantRole {
    if (isLocal) {
        return 'Agent';
    }
    switch (role) {
        case 'Host':
            return 'Host';
        case 'CoHost':
            return 'CoHost';
        default:
            return 'Participant';
    }
}

/**
 * The bot-identity convention the LiveKit room coordinator mints (`agent-<agentSessionId>`). A bridge only
 * knows its OWN bot via `IsLocal`; OTHER agents in a multi-agent room are REMOTE participants, so they must
 * be recognized by this identity prefix. Without it every other agent reads as a human — breaking
 * turn-taking's agent-exclusion (an agent treats another agent's speech as being addressed) AND the
 * "are any humans still present?" occupancy check the engine uses to auto-leave an empty room.
 */
function isAgentParticipantIdentity(identity: string | undefined): boolean {
    return typeof identity === 'string' && identity.toLowerCase().startsWith('agent-');
}

/** Maps a LiveKit participant onto the bridge's {@link BridgeParticipantInfo}. */
function toBridgeParticipant(p: LiveKitParticipant): BridgeParticipantInfo {
    return {
        ExternalId: p.Identity,
        DisplayName: p.DisplayName,
        Role: mapParticipantRole(p.Role, p.IsLocal),
        // The local bot OR any remote agent bot (by identity convention) counts as an agent, not a human.
        IsAgent: p.IsLocal === true || isAgentParticipantIdentity(p.Identity),
    };
}

/**
 * Realtime Bridge driver for the **MJ-native LiveKit room**.
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path) — it lazily
 * builds the LiveKit room SDK from the {@link sdkFactory} at {@link Connect} time. Tests inject a
 * `FakeLiveKitRoomSdk` by overriding the factory via {@link SetSdkFactory} (the creation seam) before
 * connecting.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'LiveKitBridge')`.
 */
@RegisterClass(BaseRealtimeBridge, LIVEKIT_BRIDGE_DRIVER_CLASS)
export class LiveKitBridge extends BaseRealtimeBridge {
    /** The live LiveKit SDK seam for this session, created at {@link Connect}. */
    private sdk: ILiveKitRoomSdk | null = null;

    /** The bot's own participant identity in the joined room (set at {@link Connect}). */
    private botIdentity: string | null = null;

    /** The inbound-media handler registered via {@link OnMedia}; raw audio frames are forwarded to it. */
    private mediaHandler?: (frame: BridgeMediaFrame) => void;

    /** The roster-change handler registered via {@link OnParticipantChange}. */
    private participantHandler?: (participants: BridgeParticipantInfo[]) => void;

    /** The Meeting Controls event source for this session (only when diarization is supported). */
    private meetingControls: LiveKitMeetingControlsEventSource | null = null;

    /**
     * The SDK creation seam. Defaults to a factory that throws an explicit "bind the real LiveKit SDK"
     * error, since this package ships WITHOUT the real SDK adapter (a deployment concern). Production
     * sets a real factory via {@link SetSdkFactory}; tests inject a `FakeLiveKitRoomSdk`.
     */
    private sdkFactory: LiveKitRoomSdkFactory = () => {
        throw new Error(
            'LiveKitBridge has no LiveKit room SDK bound. Call LiveKitBridge.SetSdkFactory(...) with a factory ' +
                'that builds an ILiveKitRoomSdk over the real livekit-server-sdk + a room client, or inject a fake in tests.',
        );
    };

    /**
     * Sets the {@link LiveKitRoomSdkFactory} this driver uses to construct its SDK seam at connect — the
     * creation seam (mirroring Zoom's `SetSdkFactory`). Production binds the real LiveKit room SDK
     * adapter here; tests inject a `FakeLiveKitRoomSdk`.
     *
     * @param factory The factory that builds the {@link ILiveKitRoomSdk} for a session.
     */
    public SetSdkFactory(factory: LiveKitRoomSdkFactory): void {
        this.sdkFactory = factory;
    }

    // ── Abstract — every bridge MUST implement ───────────────────────────────────────

    /**
     * Connects to the MJ-native LiveKit room and brings the bot online. Captures the capability context,
     * builds the SDK from the {@link sdkFactory}, wires the inbound per-participant audio path and
     * room-disconnected callback, connects, and (when the provider diarizes) constructs + seeds the
     * Meeting Controls event source.
     *
     * @param ctx The bridge context (features, provider name, the room URL as `Address`, config carrying
     *   the signed access token).
     * @returns The bot identity + room (external connection) identifiers, persisted by the engine.
     */
    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);
        this.RequireFeature('AudioIn'); // a LiveKit room bridge requires bidirectional audio at minimum
        this.RequireFeature('AudioOut');

        this.sdk = this.sdkFactory(ctx.Configuration);
        this.wireInboundAudio(this.sdk);
        this.sdk.onDisconnected(() => this.handleRoomDisconnected());

        // Roster diarization is native to LiveKit (per-participant tracks); only stand up the Meeting
        // Controls source when the provider advertises it (the engine also gates on this flag).
        if (this.features.SpeakerDiarization === true) {
            this.meetingControls = new LiveKitMeetingControlsEventSource(this.sdk);
        }
        // The driver owns the single SDK subscription set and fans out to BOTH its own roster handler
        // and the Meeting Controls source (the SDK seam is latest-handler-wins, so there is one owner).
        this.wireRoster(this.sdk);

        const result = await this.sdk.connect(this.buildConnectArgs(ctx));
        this.botIdentity = result.BotIdentity;

        // Seed the initial roster now that the bot has joined.
        await this.refreshRoster(this.sdk);

        return { BotParticipantId: result.BotIdentity, ExternalConnectionId: result.RoomName };
    }

    /**
     * Disconnects from the LiveKit room and releases all SDK resources. Tolerant of teardown errors.
     *
     * @param _reason Why the disconnect happened (LiveKit teardown is uniform; the bot simply leaves).
     */
    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        const sdk = this.sdk;
        this.sdk = null;
        this.botIdentity = null;
        this.meetingControls = null;
        this.mediaHandler = undefined;
        this.participantHandler = undefined;
        if (sdk) {
            try {
                await sdk.disconnect();
            } catch (err) {
                LogError(`[LiveKitBridge] disconnect() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Sends an outbound media frame into the room. LiveKit does the FULL media set, so audio, video, and
     * screen are all published on their respective tracks (gated by the directional capability flags —
     * the realtime models light audio first, video/screen ride the same path once a model emits them).
     *
     * @param track The outbound track the frame targets.
     * @param frame The media frame to send.
     */
    /** Flushes the agent's queued outbound voice on barge-in (the user interrupted the agent). */
    public override FlushOutboundMedia(): void {
        this.sdk?.flushOutboundAudio();
    }

    public SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void {
        if (!this.sdk) {
            return; // not connected — drop
        }
        const bytes = this.framePcm(frame);
        if (!bytes) {
            return;
        }
        switch (track) {
            case 'audio-out':
                this.sdk.publishAudioFrame(bytes);
                break;
            case 'video-out':
                if (this.features.VideoOut === true) {
                    this.sdk.publishVideoFrame(bytes);
                }
                break;
            case 'screen-out':
                if (this.features.ScreenOut === true) {
                    this.sdk.publishScreenFrame(bytes);
                }
                break;
            default:
                // An inbound track was passed to SendMedia — ignore (defensive).
                break;
        }
    }

    /**
     * Registers the inbound-media handler. The driver forwards each raw per-participant audio frame
     * (with its speaker identity) to this handler; the engine routes it to `IRealtimeSession.SendInput`.
     *
     * @param handler Invoked with each inbound media frame.
     */
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandler = handler;
    }

    // ── Capability-gated virtuals LiveKit supports (gated by SupportedFeatures) ───────

    /**
     * Returns the current LiveKit participant roster (gated by `SpeakerDiarization`). Re-asserts the
     * flag (defense-in-depth) so even an engine-bypassing caller cannot pull a roster a disabled
     * provider forbids.
     *
     * @returns The current participants.
     * @throws {BridgeCapabilityNotSupportedError} when diarization is not enabled for the provider.
     */
    public override async GetParticipants(): Promise<BridgeParticipantInfo[]> {
        this.RequireFeature('SpeakerDiarization');
        if (!this.sdk) {
            return [];
        }
        const participants = await this.sdk.getParticipants();
        return participants.map(toBridgeParticipant);
    }

    /**
     * Registers a roster-change handler (gated by `SpeakerDiarization`). The driver fires it from the
     * SDK's participant join/leave stream with the full current roster.
     *
     * @param handler Invoked with the updated participant list on each change.
     * @throws {BridgeCapabilityNotSupportedError} when diarization is not enabled.
     */
    public override OnParticipantChange(handler: (participants: BridgeParticipantInfo[]) => void): void {
        this.RequireFeature('SpeakerDiarization');
        this.participantHandler = handler;
    }

    /**
     * Returns the LiveKit Meeting Controls event source for this session (roster · speaking · mute), or
     * `null` when diarization is off (no roster to facilitate). The engine wires the Meeting Controls
     * channel from this.
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return this.meetingControls;
    }

    // ── LiveKit-native surfaces (used by the channel plane / turn-taking) ────────────

    /**
     * Sends a message on the LiveKit data channel — the room-native "chat". Exposed for the channel
     * plane / turn-taking hybrid mode (the social-cost-free "raise hand"). Best-effort — a failure is
     * logged, never fatal.
     *
     * @param text The data/chat message to send.
     */
    public async SendDataMessage(text: string): Promise<void> {
        if (!this.sdk) {
            return;
        }
        try {
            await this.sdk.sendDataMessage(text);
        } catch (err) {
            LogError(`[LiveKitBridge] sendDataMessage failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** The bot's participant identity in the joined room (or `null` before {@link Connect}). */
    public get BotIdentity(): string | null {
        return this.botIdentity;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /**
     * Wires the SDK's inbound per-participant audio callback to a diarized inbound
     * {@link BridgeMediaFrame}. The SFU never echoes the bot's own audio, so no self-audio gate is
     * needed; the frame's `SpeakerLabel` is the source participant identity.
     */
    private wireInboundAudio(sdk: ILiveKitRoomSdk): void {
        sdk.onAudioTrack((frame: LiveKitAudioFrame) => {
            // Mark the speaking participant on the Meeting Controls source for who's-speaking perception.
            this.meetingControls?.NotifySpeaking([frame.ParticipantIdentity]);
            this.mediaHandler?.({
                Track: 'audio-in',
                Bytes: frame.Pcm,
                SpeakerLabel: frame.ParticipantIdentity,
                TimestampMs: frame.TimestampMs ?? Date.now(),
            });
        });
    }

    /**
     * Wires the SDK's participant join/leave streams ONCE (the driver is the single owner; the SDK seam
     * is latest-handler-wins). Each roster change fans out to both the driver's own roster-change
     * handler and the Meeting Controls source.
     */
    private wireRoster(sdk: ILiveKitRoomSdk): void {
        sdk.onParticipantJoin(() => void this.refreshRoster(sdk));
        sdk.onParticipantLeave(() => void this.refreshRoster(sdk));
    }

    /** Pulls the current roster from the SDK and fans it out to both the participant handler + Meeting Controls. */
    private async refreshRoster(sdk: ILiveKitRoomSdk): Promise<void> {
        try {
            const participants = await sdk.getParticipants();
            this.participantHandler?.(participants.map(toBridgeParticipant));
            this.meetingControls?.IngestRoster(participants);
        } catch (err) {
            LogError(`[LiveKitBridge] roster refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Handles the SDK's room-disconnected signal: surface an empty roster so the engine sees everyone gone. */
    private handleRoomDisconnected(): void {
        this.participantHandler?.([]);
        this.meetingControls?.IngestRoster([]);
    }

    /** Builds the SDK connect args from the bridge context (Address is the room URL; token from config). */
    private buildConnectArgs(ctx: RealtimeBridgeContext): LiveKitConnectArgs {
        const config = ctx.Configuration ?? {};
        return {
            RoomUrl: ctx.Address,
            AccessToken: typeof config.AccessToken === 'string' ? config.AccessToken : '',
            BotDisplayName: typeof config.BotDisplayName === 'string' ? config.BotDisplayName : `${ctx.ProviderName} Agent`,
        };
    }

    /** Returns the bytes of an outbound media frame, preferring the binary payload. */
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

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration
 * of {@link LiveKitBridge} and may eliminate it. Import and call this no-op from a static code path
 * (the package entry point does) so the `ClassFactory` can resolve `'LiveKitBridge'`.
 */
export function LoadLiveKitBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
