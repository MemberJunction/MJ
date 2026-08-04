/**
 * @fileoverview `GoogleMeetBridge` — the **Google Meet** platform Realtime Bridge driver, connecting
 * the one realtime agent engine to a **Google Meet conference**. Implements the
 * {@link BaseRealtimeBridge} contract against an injectable {@link IGoogleMeetSdk} seam so it builds +
 * unit-tests with NO network and NO real Google Meet client (the Gemini `connectLiveSession`
 * testability pattern, mirroring `ZoomBridge`).
 *
 * ## ⚠️ Early-access / allowlist caveat
 * The **Google Meet Media API** is **early-access and allowlisted** — a Workspace tenant must be
 * granted access before the agent bot can pull/push real-time media. Until that binding lands at
 * deployment, `Connect` throws an explicit "bind the real Google Meet Media API" error (the
 * {@link sdkFactory} default). See {@link GoogleMeetBridge.SetSdkFactory}.
 *
 * ## Google Meet capability coverage (per the §8 seed row)
 * On-demand + scheduled join (⚠️ verification), invite join, inbound routing (⚠️), audio in/out,
 * directional video/screen flags, and a diarized roster (`SpeakerDiarization`, ⚠️) with participant
 * mute (via the Meeting Controls channel, where the tenant grants it).
 *
 * **No hand-raise (➖)** and **no in-meeting chat (⚠️ not exposed)**: the Meet Media API surfaces
 * neither, so — unlike `ZoomBridge` — there is no `onHandRaise` wiring and no `PostChatMessage` helper.
 * The Meeting Controls source still satisfies the hand-raise handler contract, but that path is inert
 * on Meet (see {@link import('./googlemeet-meeting-controls').GoogleMeetMeetingControlsEventSource}).
 *
 * Telephony features (DTMF / transfer / recording) are NOT Meet features, so those virtual base methods
 * keep throwing `BridgeCapabilityNotSupportedError`.
 *
 * @module @memberjunction/ai-bridge-googlemeet
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
    IGoogleMeetSdk,
    GoogleMeetSdkFactory,
    GoogleMeetParticipant,
    GoogleMeetParticipantRole,
    GoogleMeetAudioFrame,
    GoogleMeetJoinArgs,
} from './googlemeet-sdk';
import { GoogleMeetMeetingControlsEventSource } from './googlemeet-meeting-controls';

/**
 * The `DriverClass` key {@link GoogleMeetBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'GoogleMeetBridge'` resolves to this driver via the `ClassFactory`.
 */
export const GOOGLE_MEET_BRIDGE_DRIVER_CLASS = 'GoogleMeetBridge';

/**
 * Maps a Google Meet participant role to the bridge's {@link BridgeParticipantRole}. The bot (`IsSelf`)
 * is surfaced as `'Agent'`.
 */
function mapParticipantRole(role: GoogleMeetParticipantRole, isSelf: boolean | undefined): BridgeParticipantRole {
    if (isSelf) {
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

/** Maps a Google Meet participant onto the bridge's {@link BridgeParticipantInfo}. */
function toBridgeParticipant(p: GoogleMeetParticipant): BridgeParticipantInfo {
    return {
        ExternalId: p.ParticipantId,
        DisplayName: p.DisplayName,
        Role: mapParticipantRole(p.Role, p.IsSelf),
        IsAgent: p.IsSelf === true,
    };
}

/**
 * Realtime Bridge driver for **Google Meet**.
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path) — it lazily
 * builds the Meet SDK from the {@link sdkFactory} at {@link Connect} time. Tests inject a
 * `FakeGoogleMeetSdk` by overriding the factory via {@link SetSdkFactory} (the creation seam) before
 * connecting.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'GoogleMeetBridge')`.
 */
@RegisterClass(BaseRealtimeBridge, GOOGLE_MEET_BRIDGE_DRIVER_CLASS)
export class GoogleMeetBridge extends BaseRealtimeBridge {
    /** The live Google Meet SDK seam for this session, created at {@link Connect}. */
    private sdk: IGoogleMeetSdk | null = null;

    /** The bot's own participant id in the joined meeting (set at {@link Connect}). */
    private botParticipantId: string | null = null;

    /** The inbound-media handler registered via {@link OnMedia}; raw audio frames are forwarded to it. */
    private mediaHandler?: (frame: BridgeMediaFrame) => void;

    /** The roster-change handler registered via {@link OnParticipantChange}. */
    private participantHandler?: (participants: BridgeParticipantInfo[]) => void;

    /** The Meeting Controls event source for this session (only when diarization is supported). */
    private meetingControls: GoogleMeetMeetingControlsEventSource | null = null;

    /**
     * The SDK creation seam. Defaults to a factory that throws an explicit "bind the real Google Meet
     * Media API" error, since this package ships WITHOUT the real SDK adapter (a deployment concern
     * gated on Google's early-access allowlist). Production sets a real factory via
     * {@link SetSdkFactory}; tests inject a `FakeGoogleMeetSdk`.
     */
    private sdkFactory: GoogleMeetSdkFactory = () => {
        throw new Error(
            'GoogleMeetBridge has no Google Meet Media API bound. Call GoogleMeetBridge.SetSdkFactory(...) ' +
                'with a factory that builds an IGoogleMeetSdk over the real (allowlisted, early-access) Google ' +
                'Meet Media API client, or inject a fake in tests.',
        );
    };

    /**
     * Sets the {@link GoogleMeetSdkFactory} this driver uses to construct its SDK seam at connect —
     * the creation seam (mirroring Gemini's overridable `connectLiveSession`). Production binds the
     * real (allowlisted) Google Meet Media API adapter here; tests inject a `FakeGoogleMeetSdk`.
     *
     * @param factory The factory that builds the {@link IGoogleMeetSdk} for a session.
     */
    public SetSdkFactory(factory: GoogleMeetSdkFactory): void {
        this.sdkFactory = factory;
    }

    // ── Abstract — every bridge MUST implement ───────────────────────────────────────

    /**
     * Joins the Google Meet conference and brings the bot online. Captures the capability context,
     * builds the SDK from the {@link sdkFactory}, wires the inbound raw-audio path and meeting-ended
     * callback, joins, and (when the provider diarizes) constructs + seeds the Meeting Controls event
     * source.
     *
     * @param ctx The bridge context (features, provider name, the join URL/id as `Address`, config).
     * @returns The bot participant + meeting (external connection) identifiers, persisted by the engine.
     */
    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);
        this.RequireFeature('AudioIn'); // a Meet bridge requires bidirectional audio at minimum
        this.RequireFeature('AudioOut');

        this.sdk = this.sdkFactory(ctx.Configuration);
        this.wireInboundAudio(this.sdk);
        this.sdk.onMeetingEnded(() => this.handleMeetingEnded());

        // Roster diarization is optional per provider; only stand up the Meeting Controls source when
        // the platform advertises it (the engine also gates participant tracking on this flag).
        if (this.features.SpeakerDiarization === true) {
            this.meetingControls = new GoogleMeetMeetingControlsEventSource(this.sdk);
        }
        // The driver owns the single SDK subscription set and fans out to BOTH its own roster handler
        // and the Meeting Controls source (the SDK seam is latest-handler-wins, so there is one owner).
        // NOTE: no hand-raise subscription — the Meet Media API surfaces no hand-raise signal.
        this.wireRoster(this.sdk);

        const result = await this.sdk.join(this.buildJoinArgs(ctx));
        this.botParticipantId = result.BotParticipantId;

        // Seed the initial roster now that the bot has joined.
        await this.refreshRoster(this.sdk);

        return { BotParticipantId: result.BotParticipantId, ExternalConnectionId: result.MeetingId };
    }

    /**
     * Leaves the Google Meet conference and releases all SDK resources. Tolerant of teardown errors.
     *
     * @param _reason Why the disconnect happened (Meet teardown is uniform; the bot simply leaves).
     */
    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        const sdk = this.sdk;
        this.sdk = null;
        this.botParticipantId = null;
        this.meetingControls = null;
        this.mediaHandler = undefined;
        this.participantHandler = undefined;
        if (sdk) {
            try {
                await sdk.leave();
            } catch (err) {
                LogError(`[GoogleMeetBridge] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Sends an outbound media frame into the meeting. Audio is fed to the SDK's audio-contribution path;
     * video/screen frames are gated by the directional capability flags (the transport carries them,
     * and the SDK send is a deployment-time binding TODO — today the models emit audio).
     *
     * @param track The outbound track the frame targets.
     * @param frame The media frame to send.
     */
    public SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void {
        if (!this.sdk) {
            return; // not connected — drop
        }
        switch (track) {
            case 'audio-out': {
                const pcm = this.framePcm(frame);
                if (pcm) {
                    this.sdk.sendAudioFrame(pcm);
                }
                break;
            }
            case 'video-out':
            case 'screen-out':
                // Directional video/screen capability is declared; the SDK send binding lands with the
                // first realtime model that emits these tracks (TODO at deployment). No-op for now.
                break;
            default:
                // An inbound track was passed to SendMedia — ignore (defensive).
                break;
        }
    }

    /**
     * Registers the inbound-media handler. The driver forwards each raw per-participant audio frame
     * (with its speaker label) to this handler; the engine routes it to `IRealtimeSession.SendInput`.
     *
     * @param handler Invoked with each inbound media frame.
     */
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandler = handler;
    }

    // ── Capability-gated virtuals Meet supports (gated by SupportedFeatures) ──────────

    /**
     * Returns the current Meet participant roster (gated by `SpeakerDiarization`). Re-asserts the flag
     * (defense-in-depth) so even an engine-bypassing caller cannot pull a roster a disabled provider
     * forbids.
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
     * Returns the Google Meet Meeting Controls event source for this session (roster · speaking ·
     * mute — **no hand-raise queue**, since Meet surfaces no hand-raise signal), or `null` when
     * diarization is off (no roster to facilitate). The engine wires the Meeting Controls channel from
     * this.
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return this.meetingControls;
    }

    // ── Meet-native surfaces (used by the channel plane / facilitator) ───────────────

    /** The bot's participant id in the joined meeting (or `null` before {@link Connect}). */
    public get BotParticipantId(): string | null {
        return this.botParticipantId;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the SDK's inbound raw-audio callback to a diarized inbound {@link BridgeMediaFrame}. */
    private wireInboundAudio(sdk: IGoogleMeetSdk): void {
        sdk.onAudioFrame((frame: GoogleMeetAudioFrame) => {
            this.mediaHandler?.({
                Track: 'audio-in',
                Bytes: frame.Pcm,
                SpeakerLabel: frame.ParticipantId,
                TimestampMs: frame.TimestampMs ?? Date.now(),
            });
        });
    }

    /**
     * Wires the SDK's participant join/leave streams ONCE (the driver is the single owner; the SDK seam
     * is latest-handler-wins). Each roster change fans out to both the driver's own roster-change
     * handler and the Meeting Controls source.
     *
     * NOTE: unlike `ZoomBridge` there is no `onHandRaise` subscription — the Meet Media API surfaces no
     * hand-raise signal, so there is nothing to wire.
     */
    private wireRoster(sdk: IGoogleMeetSdk): void {
        sdk.onParticipantJoin(() => void this.refreshRoster(sdk));
        sdk.onParticipantLeave(() => void this.refreshRoster(sdk));
    }

    /** Pulls the current roster from the SDK and fans it out to both the participant handler + Meeting Controls. */
    private async refreshRoster(sdk: IGoogleMeetSdk): Promise<void> {
        try {
            const participants = await sdk.getParticipants();
            this.participantHandler?.(participants.map(toBridgeParticipant));
            this.meetingControls?.IngestRoster(participants);
        } catch (err) {
            LogError(`[GoogleMeetBridge] roster refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Handles the SDK's meeting-ended signal: surface an empty roster so the engine sees everyone gone. */
    private handleMeetingEnded(): void {
        this.participantHandler?.([]);
        this.meetingControls?.IngestRoster([]);
    }

    /** Builds the SDK join args from the bridge context (Address is the meeting join URL/code). */
    private buildJoinArgs(ctx: RealtimeBridgeContext): GoogleMeetJoinArgs {
        const config = ctx.Configuration ?? {};
        return {
            MeetingCode: this.parseMeetingCode(ctx.Address),
            BotDisplayName: typeof config.BotDisplayName === 'string' ? config.BotDisplayName : `${ctx.ProviderName} Agent`,
            AccessToken: typeof config.AccessToken === 'string' ? config.AccessToken : undefined,
        };
    }

    /**
     * Extracts the Meet meeting code from a Google Meet join URL or returns the address unchanged when
     * it is already a bare meeting code. Meet codes look like `abc-defg-hij`. Tolerant — a non-matching
     * address passes through so the SDK can report a precise join failure.
     */
    private parseMeetingCode(address: string): string {
        if (!address) {
            return '';
        }
        // e.g. https://meet.google.com/abc-defg-hij  →  abc-defg-hij
        const match = address.match(/meet\.google\.com\/([a-z0-9-]+)/i) ?? address.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
        return match ? match[1] : address;
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
            // Copy into a fresh ArrayBuffer (Buffer.buffer is ArrayBufferLike under newer @types/node).
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
 * of {@link GoogleMeetBridge} and may eliminate it. Import and call this no-op from a static code path
 * (the package entry point does) so the `ClassFactory` can resolve `'GoogleMeetBridge'`.
 */
export function LoadGoogleMeetBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
