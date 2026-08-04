/**
 * @fileoverview `SlackBridge` — the **Slack huddle** platform Realtime Bridge driver, connecting the
 * one realtime agent engine to a **Slack huddle**. Implements the {@link BaseRealtimeBridge} contract
 * against an injectable {@link ISlackHuddleSdk} seam so it builds + unit-tests with NO network and NO
 * real Slack / Chime SDK (the Gemini `connectLiveSession` testability pattern). Structurally mirrors
 * `ZoomBridge` (the reference driver) — only the platform names + join-coordinate parsing differ.
 *
 * Slack huddles do full audio + video + screen share and run on **Amazon Chime** under the hood. The
 * §8 seed row advertises: on-demand + scheduled + invite join, inbound routing (⚠️), audio/video/screen
 * in/out, a diarized roster (`SpeakerDiarization`, ⚠️), participant mute + huddle/thread chat (via the
 * Meeting Controls channel). Native raised-hand is ⚠️ partial. Telephony features (DTMF / transfer /
 * recording) are NOT Slack-huddle features, so those virtual base methods keep throwing
 * `BridgeCapabilityNotSupportedError`.
 *
 * ## 🚨 REAL-API RISK — this is the one driver with a genuine API-availability risk 🚨
 * Unlike Zoom/Teams (where the SDK binding is a known, documented deployment TODO), the Slack **huddle
 * MEDIA API is a gating unknown**. Slack does **not** publicly document a supported bot-join-with-media
 * path for huddles: there is no published way for an app to join a huddle as a *media* participant and
 * pull/push PCM audio. Because huddles run on **Amazon Chime**, production media access may require a
 * **Chime-level integration** and/or an entitlement Slack does not expose via its standard developer
 * surface. This driver and its {@link ISlackHuddleSdk} seam are built **as if** that media path exists
 * (so they're ready the instant it does), but **before promoting this provider from `Disabled` to a live
 * binding, someone must verify/obtain huddle media access**. The signaling-and-chat subset (roster, huddle
 * membership events, chat, mute) is on firm public-API ground; the media subset (audio in/out, diarized
 * speaking) is the at-risk part. See `slack-sdk.ts` for the full risk write-up.
 *
 * @module @memberjunction/ai-bridge-slack
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
    ISlackHuddleSdk,
    SlackHuddleSdkFactory,
    SlackParticipant,
    SlackParticipantRole,
    SlackAudioFrame,
    SlackJoinArgs,
} from './slack-sdk';
import { SlackMeetingControlsEventSource } from './slack-meeting-controls';

/**
 * The `DriverClass` key {@link SlackBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'SlackBridge'` resolves to this driver via the `ClassFactory`.
 */
export const SLACK_BRIDGE_DRIVER_CLASS = 'SlackBridge';

/**
 * Maps a Slack huddle participant role to the bridge's {@link BridgeParticipantRole}. The bot (`IsSelf`)
 * is surfaced as `'Agent'`; the huddle starter maps to host.
 */
function mapParticipantRole(role: SlackParticipantRole, isSelf: boolean | undefined): BridgeParticipantRole {
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

/** Maps a Slack huddle participant onto the bridge's {@link BridgeParticipantInfo}. */
function toBridgeParticipant(p: SlackParticipant): BridgeParticipantInfo {
    return {
        ExternalId: p.ParticipantId,
        DisplayName: p.DisplayName,
        Role: mapParticipantRole(p.Role, p.IsSelf),
        IsAgent: p.IsSelf === true,
    };
}

/**
 * Realtime Bridge driver for **Slack huddles**.
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path) — it lazily
 * builds the Slack huddle SDK from the {@link sdkFactory} at {@link Connect} time. Tests inject a
 * `FakeSlackHuddleSdk` by overriding the factory via {@link SetSdkFactory} (the creation seam) before
 * connecting.
 *
 * 🚨 See the REAL-API RISK in the file header + `slack-sdk.ts`: the huddle media path this driver wires
 * is the gating unknown for a live production binding.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'SlackBridge')`.
 */
@RegisterClass(BaseRealtimeBridge, SLACK_BRIDGE_DRIVER_CLASS)
export class SlackBridge extends BaseRealtimeBridge {
    /** The live Slack huddle SDK seam for this session, created at {@link Connect}. */
    private sdk: ISlackHuddleSdk | null = null;

    /** The bot's own participant id in the joined huddle (set at {@link Connect}). */
    private botParticipantId: string | null = null;

    /** The inbound-media handler registered via {@link OnMedia}; raw audio frames are forwarded to it. */
    private mediaHandler?: (frame: BridgeMediaFrame) => void;

    /** The roster-change handler registered via {@link OnParticipantChange}. */
    private participantHandler?: (participants: BridgeParticipantInfo[]) => void;

    /** The Meeting Controls event source for this session (only when diarization is supported). */
    private meetingControls: SlackMeetingControlsEventSource | null = null;

    /**
     * The SDK creation seam. Defaults to a factory that throws an explicit "bind the real Slack huddle
     * SDK" error, since this package ships WITHOUT the real SDK adapter (a deployment concern — and, for
     * Slack specifically, an API-availability one: see the REAL-API RISK). Production sets a real factory
     * via {@link SetSdkFactory}; tests inject a `FakeSlackHuddleSdk`.
     */
    private sdkFactory: SlackHuddleSdkFactory = () => {
        // REAL-API RISK: binding the real Slack huddle SDK is NOT just a wiring TODO like Zoom/Teams.
        // Slack does not publicly document a bot-join-with-media path for huddles (huddles run on Amazon
        // Chime; production media access may require a Chime-level integration / entitlement). Verify or
        // obtain huddle media access BEFORE supplying a production factory here. See slack-sdk.ts.
        throw new Error(
            'SlackBridge has no Slack huddle SDK bound. Call SlackBridge.SetSdkFactory(...) with a factory ' +
                'that builds an ISlackHuddleSdk over the real Slack Web API + Events SDK plus a verified huddle ' +
                'MEDIA path (likely an Amazon Chime-level integration — Slack does not publicly document a ' +
                'bot-join-with-media path for huddles, so this is a genuine API-availability risk, not just a ' +
                'binding TODO), or inject a fake in tests.',
        );
    };

    /**
     * Sets the {@link SlackHuddleSdkFactory} this driver uses to construct its SDK seam at connect —
     * the creation seam (mirroring Gemini's overridable `connectLiveSession`). Production binds the real
     * Slack + huddle-media adapter here; tests inject a `FakeSlackHuddleSdk`.
     *
     * 🚨 REAL-API RISK: a production factory must wire a verified huddle media path (likely Chime-level);
     * see the file header + `slack-sdk.ts`.
     *
     * @param factory The factory that builds the {@link ISlackHuddleSdk} for a session.
     */
    public SetSdkFactory(factory: SlackHuddleSdkFactory): void {
        this.sdkFactory = factory;
    }

    // ── Abstract — every bridge MUST implement ───────────────────────────────────────

    /**
     * Joins the Slack huddle and brings the bot online. Captures the capability context, builds the SDK
     * from the {@link sdkFactory}, wires the inbound raw-audio path and huddle-ended callback, joins, and
     * (when the provider diarizes) constructs + seeds the Meeting Controls event source.
     *
     * @param ctx The bridge context (features, provider name, the huddle/channel link as `Address`, config).
     * @returns The bot participant + huddle (external connection) identifiers, persisted by the engine.
     */
    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);
        this.RequireFeature('AudioIn'); // a Slack huddle bridge requires bidirectional audio at minimum
        this.RequireFeature('AudioOut');

        this.sdk = this.sdkFactory(ctx.Configuration);
        this.wireInboundAudio(this.sdk);
        this.sdk.onMeetingEnded(() => this.handleMeetingEnded());

        // Roster diarization is optional per provider; only stand up the Meeting Controls source when
        // the platform advertises it (the engine also gates participant tracking on this flag).
        if (this.features.SpeakerDiarization === true) {
            this.meetingControls = new SlackMeetingControlsEventSource(this.sdk);
        }
        // The driver owns the single SDK subscription set and fans out to BOTH its own roster handler
        // and the Meeting Controls source (the SDK seam is latest-handler-wins, so there is one owner).
        this.wireRoster(this.sdk);

        const result = await this.sdk.join(this.buildJoinArgs(ctx));
        this.botParticipantId = result.BotParticipantId;

        // Seed the initial roster now that the bot has joined.
        await this.refreshRoster(this.sdk);

        return { BotParticipantId: result.BotParticipantId, ExternalConnectionId: result.HuddleId };
    }

    /**
     * Leaves the Slack huddle and releases all SDK resources. Tolerant of teardown errors.
     *
     * @param _reason Why the disconnect happened (Slack teardown is uniform; the bot simply leaves).
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
                LogError(`[SlackBridge] leave() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Sends an outbound media frame into the huddle. Audio is fed to the SDK's huddle media path;
     * video/screen frames are gated by the directional capability flags (the transport carries them, and
     * the SDK send is a deployment-time binding TODO — today the models emit audio).
     *
     * ⚠️ REAL-API RISK: the audio send depends on the huddle media path (Chime), the gating unknown — see
     * the file header + `slack-sdk.ts`.
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

    // ── Capability-gated virtuals Slack supports (gated by SupportedFeatures) ──────────

    /**
     * Returns the current Slack huddle participant roster (gated by `SpeakerDiarization`). Re-asserts the
     * flag (defense-in-depth) so even an engine-bypassing caller cannot pull a roster a disabled provider
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
     * Returns the Slack Meeting Controls event source for this session (roster · hand-raise · speaking ·
     * mute), or `null` when diarization is off (no roster to facilitate). The engine wires the Meeting
     * Controls channel from this.
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return this.meetingControls;
    }

    // ── Slack-native surfaces (used by the channel plane / facilitator) ──────────────

    /**
     * Posts a message to the Slack huddle thread / channel. Exposed for the channel plane / turn-taking
     * hybrid mode (the social-cost-free "raise hand"). Best-effort — a chat failure is logged, never fatal.
     *
     * @param text The chat message to post.
     */
    public async PostChatMessage(text: string): Promise<void> {
        if (!this.sdk) {
            return;
        }
        try {
            await this.sdk.postChatMessage(text);
        } catch (err) {
            LogError(`[SlackBridge] postChatMessage failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** The bot's participant id in the joined huddle (or `null` before {@link Connect}). */
    public get BotParticipantId(): string | null {
        return this.botParticipantId;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /**
     * Wires the SDK's inbound raw-audio callback to a diarized inbound {@link BridgeMediaFrame}.
     *
     * ⚠️ REAL-API RISK: inbound audio depends on the huddle media path (Chime), the gating unknown.
     */
    private wireInboundAudio(sdk: ISlackHuddleSdk): void {
        sdk.onAudioFrame((frame: SlackAudioFrame) => {
            this.mediaHandler?.({
                Track: 'audio-in',
                Bytes: frame.Pcm,
                SpeakerLabel: frame.ParticipantId,
                TimestampMs: frame.TimestampMs ?? Date.now(),
            });
        });
    }

    /**
     * Wires the SDK's participant join/leave + hand-raise streams ONCE (the driver is the single owner;
     * the SDK seam is latest-handler-wins). Each roster change fans out to both the driver's own
     * roster-change handler and the Meeting Controls source; hand-raise signals (⚠️ partial on Slack)
     * feed the source.
     */
    private wireRoster(sdk: ISlackHuddleSdk): void {
        sdk.onParticipantJoin(() => void this.refreshRoster(sdk));
        sdk.onParticipantLeave(() => void this.refreshRoster(sdk));
        sdk.onHandRaise((id, raised) => this.meetingControls?.IngestHandRaise(id, raised));
    }

    /** Pulls the current roster from the SDK and fans it out to both the participant handler + Meeting Controls. */
    private async refreshRoster(sdk: ISlackHuddleSdk): Promise<void> {
        try {
            const participants = await sdk.getParticipants();
            this.participantHandler?.(participants.map(toBridgeParticipant));
            this.meetingControls?.IngestRoster(participants);
        } catch (err) {
            LogError(`[SlackBridge] roster refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Handles the SDK's huddle-ended signal: surface an empty roster so the engine sees everyone gone. */
    private handleMeetingEnded(): void {
        this.participantHandler?.([]);
        this.meetingControls?.IngestRoster([]);
    }

    /** Builds the SDK join args from the bridge context (Address is the huddle/channel link or channel id). */
    private buildJoinArgs(ctx: RealtimeBridgeContext): SlackJoinArgs {
        const config = ctx.Configuration ?? {};
        return {
            ChannelId: typeof config.ChannelId === 'string' ? config.ChannelId : this.parseChannelId(ctx.Address),
            HuddleId: typeof config.HuddleId === 'string' ? config.HuddleId : undefined,
            BotDisplayName: typeof config.BotDisplayName === 'string' ? config.BotDisplayName : `${ctx.ProviderName} Agent`,
            BotToken: typeof config.BotToken === 'string' ? config.BotToken : undefined,
            TeamId: typeof config.TeamId === 'string' ? config.TeamId : undefined,
        };
    }

    /**
     * Extracts the Slack channel id from a Slack archives/huddle link when present, else returns the
     * address unchanged when it is already a bare channel id (`C…`). Tolerant — a non-matching address
     * passes through so the SDK can report a precise join failure.
     *
     * Slack links look like `https://app.slack.com/client/T0XXXX/C0YYYY` or
     * `https://workspace.slack.com/archives/C0YYYY` — the `C…` segment is the channel id.
     */
    private parseChannelId(address: string): string {
        if (!address) {
            return '';
        }
        const match = address.match(/\/(C[A-Z0-9]{6,})\b/) ?? address.match(/^(C[A-Z0-9]{6,})$/);
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
 * of {@link SlackBridge} and may eliminate it. Import and call this no-op from a static code path
 * (the package entry point does) so the `ClassFactory` can resolve `'SlackBridge'`.
 */
export function LoadSlackBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
