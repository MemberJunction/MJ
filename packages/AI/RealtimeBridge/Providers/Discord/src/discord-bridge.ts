/**
 * @fileoverview `DiscordBridge` — the **Discord** platform Realtime Bridge driver, connecting the one
 * realtime agent engine to a **Discord VOICE CHANNEL**. Implements the {@link BaseRealtimeBridge} contract
 * against an injectable {@link IDiscordVoiceSdk} seam so it builds + unit-tests with NO network and NO
 * real Discord client (the Gemini `connectLiveSession` testability pattern, mirroring `ZoomBridge` /
 * `GoogleMeetBridge`).
 *
 * ## Discord is voice-CHANNEL based, not meeting based
 * Discord has no scheduled meeting + invite-link concept. A bot **joins a persistent VOICE CHANNEL** (a
 * guild + channel id) on demand and streams Opus/PCM audio over UDP. So this driver advertises
 * **on-demand join + inbound routing only** — there is **no scheduled-join, no invite-join, and no
 * native-invite**. What Discord *does* offer first-class: **per-user audio** (excellent diarization via
 * the speaking user id), **video / screen ("Go Live")**, and a **text channel** for chat.
 *
 * ## Discord capability coverage (per the §8 seed row)
 * On-demand join, inbound routing, audio in/out, directional video/screen flags, a diarized roster
 * (`SpeakerDiarization`) with member mute (via the Meeting Controls channel), and text-channel chat (via
 * {@link DiscordBridge.PostChatMessage}).
 *
 * **No hand-raise (➖)**: like Google Meet, Discord voice channels surface no hand-raise signal, so —
 * unlike `ZoomBridge` — there is no `onHandRaise` wiring. The Meeting Controls source still satisfies the
 * hand-raise handler contract, but that path is inert on Discord (see
 * {@link import('./discord-meeting-controls').DiscordMeetingControlsEventSource}). Discord DOES keep
 * chat (unlike Meet), so {@link DiscordBridge.PostChatMessage} is present and the Hybrid "raise hand via
 * chat" turn-taking mode works.
 *
 * **No scheduled / invite / native-invite** (➖) — not Discord concepts; those provider flags are off in
 * the seed row, so the engine never asks for them and the driver carries no such surface.
 *
 * Telephony features (DTMF / transfer / recording) are NOT Discord features, so those virtual base methods
 * keep throwing `BridgeCapabilityNotSupportedError`.
 *
 * ## Production binding (TODO at deployment)
 * Out of the box this driver ships WITHOUT the real adapter — `Connect` throws an explicit "bind the real
 * Discord voice SDK" error until {@link DiscordBridge.SetSdkFactory} is called. Production binds
 * **`@discordjs/voice`** (voice connection + Opus audio) and **`discord.js`** (gateway client for member
 * presence + text-channel posts).
 *
 * @module @memberjunction/ai-bridge-discord
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
    IDiscordVoiceSdk,
    DiscordVoiceSdkFactory,
    DiscordMember,
    DiscordMemberRole,
    DiscordAudioFrame,
    DiscordJoinArgs,
} from './discord-sdk';
import { DiscordMeetingControlsEventSource } from './discord-meeting-controls';

/**
 * The `DriverClass` key {@link DiscordBridge} registers under. A `MJ: AI Bridge Providers` row with
 * `DriverClass = 'DiscordBridge'` resolves to this driver via the `ClassFactory`.
 */
export const DISCORD_BRIDGE_DRIVER_CLASS = 'DiscordBridge';

/**
 * Maps a Discord member role to the bridge's {@link BridgeParticipantRole}. The bot (`IsSelf`) is
 * surfaced as `'Agent'`.
 */
function mapParticipantRole(role: DiscordMemberRole, isSelf: boolean | undefined): BridgeParticipantRole {
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

/** Maps a Discord member onto the bridge's {@link BridgeParticipantInfo}. */
function toBridgeParticipant(m: DiscordMember): BridgeParticipantInfo {
    return {
        ExternalId: m.UserId,
        DisplayName: m.DisplayName,
        Role: mapParticipantRole(m.Role, m.IsSelf),
        IsAgent: m.IsSelf === true,
    };
}

/**
 * Realtime Bridge driver for **Discord voice channels**.
 *
 * Construct the driver with the default constructor (the engine's `ClassFactory` path) — it lazily builds
 * the Discord SDK from the {@link sdkFactory} at {@link Connect} time. Tests inject a `FakeDiscordVoiceSdk`
 * by overriding the factory via {@link SetSdkFactory} (the creation seam) before connecting.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'DiscordBridge')`.
 */
@RegisterClass(BaseRealtimeBridge, DISCORD_BRIDGE_DRIVER_CLASS)
export class DiscordBridge extends BaseRealtimeBridge {
    /** The live Discord SDK seam for this session, created at {@link Connect}. */
    private sdk: IDiscordVoiceSdk | null = null;

    /** The bot's own Discord user id in the joined voice channel (set at {@link Connect}). */
    private botUserId: string | null = null;

    /** The inbound-media handler registered via {@link OnMedia}; raw audio frames are forwarded to it. */
    private mediaHandler?: (frame: BridgeMediaFrame) => void;

    /** The roster-change handler registered via {@link OnParticipantChange}. */
    private participantHandler?: (participants: BridgeParticipantInfo[]) => void;

    /** The Meeting Controls event source for this session (only when diarization is supported). */
    private meetingControls: DiscordMeetingControlsEventSource | null = null;

    /**
     * The SDK creation seam. Defaults to a factory that throws an explicit "bind the real Discord voice
     * SDK" error, since this package ships WITHOUT the real SDK adapter (a deployment concern). Production
     * sets a real factory via {@link SetSdkFactory}; tests inject a `FakeDiscordVoiceSdk`.
     */
    private sdkFactory: DiscordVoiceSdkFactory = () => {
        throw new Error(
            'DiscordBridge has no Discord voice SDK bound. Call DiscordBridge.SetSdkFactory(...) with a ' +
                'factory that builds an IDiscordVoiceSdk over the real @discordjs/voice + discord.js client, ' +
                'or inject a fake in tests.',
        );
    };

    /**
     * Sets the {@link DiscordVoiceSdkFactory} this driver uses to construct its SDK seam at connect — the
     * creation seam (mirroring Gemini's overridable `connectLiveSession`). Production binds the real
     * `@discordjs/voice` + `discord.js` adapter here; tests inject a `FakeDiscordVoiceSdk`.
     *
     * @param factory The factory that builds the {@link IDiscordVoiceSdk} for a session.
     */
    public SetSdkFactory(factory: DiscordVoiceSdkFactory): void {
        this.sdkFactory = factory;
    }

    // ── Abstract — every bridge MUST implement ───────────────────────────────────────

    /**
     * Joins the Discord voice channel and brings the bot online. Captures the capability context, builds
     * the SDK from the {@link sdkFactory}, wires the inbound raw-audio path and disconnect callback, joins,
     * and (when the provider diarizes) constructs + seeds the Meeting Controls event source.
     *
     * @param ctx The bridge context (features, provider name, the channel URL/id as `Address`, config).
     * @returns The bot user + voice-channel (external connection) identifiers, persisted by the engine.
     */
    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);
        this.RequireFeature('AudioIn'); // a Discord voice bridge requires bidirectional audio at minimum
        this.RequireFeature('AudioOut');

        this.sdk = this.sdkFactory(ctx.Configuration);
        this.wireInboundAudio(this.sdk);
        this.sdk.onDisconnect(() => this.handleDisconnected());

        // Roster diarization is optional per provider; only stand up the Meeting Controls source when the
        // platform advertises it (the engine also gates participant tracking on this flag).
        if (this.features.SpeakerDiarization === true) {
            this.meetingControls = new DiscordMeetingControlsEventSource(this.sdk);
        }
        // The driver owns the single SDK subscription set and fans out to BOTH its own roster handler and
        // the Meeting Controls source (the SDK seam is latest-handler-wins, so there is one owner).
        // NOTE: no hand-raise subscription — Discord voice channels surface no hand-raise signal.
        this.wireRoster(this.sdk);

        const result = await this.sdk.joinVoiceChannel(this.buildJoinArgs(ctx));
        this.botUserId = result.BotUserId;

        // Seed the initial roster now that the bot has joined.
        await this.refreshRoster(this.sdk);

        return { BotParticipantId: result.BotUserId, ExternalConnectionId: result.VoiceChannelId };
    }

    /**
     * Leaves the Discord voice channel and releases all SDK resources. Tolerant of teardown errors.
     *
     * @param _reason Why the disconnect happened (Discord teardown is uniform; the bot simply leaves).
     */
    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        const sdk = this.sdk;
        this.sdk = null;
        this.botUserId = null;
        this.meetingControls = null;
        this.mediaHandler = undefined;
        this.participantHandler = undefined;
        if (sdk) {
            try {
                await sdk.leaveVoiceChannel();
            } catch (err) {
                LogError(`[DiscordBridge] leaveVoiceChannel() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Sends an outbound media frame into the voice channel. Audio is fed to the SDK's audio-player path;
     * video/screen frames are gated by the directional capability flags (the transport carries them, and
     * the SDK send is a deployment-time binding TODO — today the models emit audio).
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
                // Directional video/screen ("Go Live") capability is declared; the SDK send binding lands
                // with the first realtime model that emits these tracks (TODO at deployment). No-op for now.
                break;
            default:
                // An inbound track was passed to SendMedia — ignore (defensive).
                break;
        }
    }

    /**
     * Registers the inbound-media handler. The driver forwards each raw per-user audio frame (with its
     * speaker label) to this handler; the engine routes it to `IRealtimeSession.SendInput`.
     *
     * @param handler Invoked with each inbound media frame.
     */
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandler = handler;
    }

    // ── Capability-gated virtuals Discord supports (gated by SupportedFeatures) ────────

    /**
     * Returns the current Discord voice-channel roster (gated by `SpeakerDiarization`). Re-asserts the
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
        const members = await this.sdk.getMembers();
        return members.map(toBridgeParticipant);
    }

    /**
     * Registers a roster-change handler (gated by `SpeakerDiarization`). The driver fires it from the
     * SDK's member join/leave stream with the full current roster.
     *
     * @param handler Invoked with the updated participant list on each change.
     * @throws {BridgeCapabilityNotSupportedError} when diarization is not enabled.
     */
    public override OnParticipantChange(handler: (participants: BridgeParticipantInfo[]) => void): void {
        this.RequireFeature('SpeakerDiarization');
        this.participantHandler = handler;
    }

    /**
     * Returns the Discord Meeting Controls event source for this session (roster · speaking · mute — **no
     * hand-raise queue**, since Discord surfaces no hand-raise signal), or `null` when diarization is off
     * (no roster to facilitate). The engine wires the Meeting Controls channel from this.
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return this.meetingControls;
    }

    // ── Discord-native surfaces (used by the channel plane / facilitator) ─────────────

    /**
     * Posts a message to the Discord text channel associated with the voice channel. Exposed for the
     * channel plane / turn-taking hybrid mode (the social-cost-free "raise hand"). Discord text channels
     * support programmatic posting (unlike Google Meet), so this is a real path. Best-effort — a chat
     * failure is logged, never fatal.
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
            LogError(`[DiscordBridge] postChatMessage failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** The bot's user id in the joined voice channel (or `null` before {@link Connect}). */
    public get BotParticipantId(): string | null {
        return this.botUserId;
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the SDK's inbound raw-audio callback to a diarized inbound {@link BridgeMediaFrame}. */
    private wireInboundAudio(sdk: IDiscordVoiceSdk): void {
        sdk.onAudioFrame((frame: DiscordAudioFrame) => {
            this.mediaHandler?.({
                Track: 'audio-in',
                Bytes: frame.Pcm,
                SpeakerLabel: frame.UserId,
                TimestampMs: frame.TimestampMs ?? Date.now(),
            });
        });
    }

    /**
     * Wires the SDK's member join/leave streams ONCE (the driver is the single owner; the SDK seam is
     * latest-handler-wins). Each roster change fans out to both the driver's own roster-change handler and
     * the Meeting Controls source.
     *
     * NOTE: unlike `ZoomBridge` there is no `onHandRaise` subscription — Discord voice channels surface no
     * hand-raise signal, so there is nothing to wire.
     */
    private wireRoster(sdk: IDiscordVoiceSdk): void {
        sdk.onMemberJoin(() => void this.refreshRoster(sdk));
        sdk.onMemberLeave(() => void this.refreshRoster(sdk));
    }

    /** Pulls the current roster from the SDK and fans it out to both the participant handler + Meeting Controls. */
    private async refreshRoster(sdk: IDiscordVoiceSdk): Promise<void> {
        try {
            const members = await sdk.getMembers();
            this.participantHandler?.(members.map(toBridgeParticipant));
            this.meetingControls?.IngestRoster(members);
        } catch (err) {
            LogError(`[DiscordBridge] roster refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Handles the SDK's disconnect signal: surface an empty roster so the engine sees everyone gone. */
    private handleDisconnected(): void {
        this.participantHandler?.([]);
        this.meetingControls?.IngestRoster([]);
    }

    /** Builds the SDK join args from the bridge context (Address is the Discord channel URL or guild/channel id). */
    private buildJoinArgs(ctx: RealtimeBridgeContext): DiscordJoinArgs {
        const config = ctx.Configuration ?? {};
        const { GuildId, VoiceChannelId } = this.parseChannelAddress(ctx.Address, config);
        return {
            GuildId,
            VoiceChannelId,
            BotDisplayName: typeof config.BotDisplayName === 'string' ? config.BotDisplayName : `${ctx.ProviderName} Agent`,
            BotToken: typeof config.BotToken === 'string' ? config.BotToken : undefined,
        };
    }

    /**
     * Resolves the guild + voice-channel ids from the bridge address / config. Accepts a Discord channel
     * URL (`https://discord.com/channels/<guild>/<channel>`), a bare `<guild>/<channel>` pair, or a bare
     * channel id (with `GuildId` then sourced from config). Tolerant — when nothing parses the address is
     * passed through as the channel id so the SDK can report a precise join failure.
     */
    private parseChannelAddress(address: string, config: Record<string, unknown>): { GuildId: string; VoiceChannelId: string } {
        const configGuild = typeof config.GuildId === 'string' ? config.GuildId : '';
        if (!address) {
            const configChannel = typeof config.VoiceChannelId === 'string' ? config.VoiceChannelId : '';
            return { GuildId: configGuild, VoiceChannelId: configChannel };
        }
        // e.g. https://discord.com/channels/123456789/987654321 → guild 123456789, channel 987654321
        const urlMatch = address.match(/channels\/(\d+)\/(\d+)/);
        if (urlMatch) {
            return { GuildId: urlMatch[1], VoiceChannelId: urlMatch[2] };
        }
        // e.g. 123456789/987654321 (bare guild/channel pair)
        const pairMatch = address.match(/^(\d+)\/(\d+)$/);
        if (pairMatch) {
            return { GuildId: pairMatch[1], VoiceChannelId: pairMatch[2] };
        }
        // Bare channel id — guild from config.
        return { GuildId: configGuild, VoiceChannelId: address };
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
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic registration of
 * {@link DiscordBridge} and may eliminate it. Import and call this no-op from a static code path (the
 * package entry point does) so the `ClassFactory` can resolve `'DiscordBridge'`.
 */
export function LoadDiscordBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
