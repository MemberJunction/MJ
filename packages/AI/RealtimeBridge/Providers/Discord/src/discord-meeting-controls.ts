/**
 * Adapts the {@link IDiscordVoiceSdk} member / speaking stream into an
 * {@link IBridgeMeetingControlsEventSource} so the bridge engine can wire the **Meeting Controls**
 * facilitator channel (roster · who's-speaking · mute) for a Discord voice-channel session. This is the
 * §4b "the bridge contributes a channel" pattern realized for Discord — no channel logic lives here, only
 * the platform→channel signal mapping.
 *
 * ## Hand-raise is absent for Discord (➖)
 * Like Google Meet (and unlike Zoom), **Discord voice channels surface no hand-raise signal**. The
 * Meeting Controls channel contract still requires an {@link OnHandRaiseChange} registration, so this
 * source implements it — but the registered handler is **never invoked**: there is no platform event and
 * the driver wires no `IngestHandRaise`. The hand-raise *queue* facet of the facilitator is therefore
 * inert on Discord (roster + speaking + mute remain fully functional). This is a documented platform
 * limitation, not a bug.
 *
 * (Discord *does* have a text channel, so — unlike Meet — the Hybrid "raise hand via chat" turn-taking
 * mode still works via `DiscordBridge.PostChatMessage`. That is a chat-post path, not a native hand-raise
 * signal, so it does not change this source.)
 */

import {
    IBridgeMeetingControlsEventSource,
    BridgeMeetingParticipant,
    BridgeMeetingControlsCapability,
    BridgeMeetingParticipantRole,
} from '@memberjunction/ai-bridge-base';
import { IDiscordVoiceSdk, DiscordMember, DiscordMemberRole } from './discord-sdk';

/**
 * Maps a Discord member role to the bridge's meeting-participant role. Discord has no distinct "Agent"
 * role; the bot is flagged via `IsSelf` and surfaced as `'Agent'`.
 */
function mapRole(role: DiscordMemberRole, isSelf: boolean | undefined): BridgeMeetingParticipantRole {
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

/** Maps one Discord member onto the channel's {@link BridgeMeetingParticipant} shape. */
export function toMeetingParticipant(m: DiscordMember): BridgeMeetingParticipant {
    return {
        ParticipantId: m.UserId,
        DisplayName: m.DisplayName,
        Role: mapRole(m.Role, m.IsSelf),
        IsAgent: m.IsSelf === true,
    };
}

/**
 * Discord's adapter to the Meeting Controls channel's event source. It maintains a live roster and
 * mirrors diarized speaking signals, and actuates mute through the SDK.
 *
 * **The driver owns the SDK subscriptions** (the SDK seam is "latest handler wins", so it can have only
 * one subscriber per event) and **feeds this source imperatively** via {@link IngestRoster} /
 * {@link IngestSpeaking}. This source only needs the SDK for the one *action* it actuates —
 * {@link MuteParticipant}. The Meeting Controls channel subscribes the `On*` streams in turn.
 *
 * Note the **absence of a hand-raise ingest method**: Discord surfaces no hand-raise signal, so unlike the
 * Zoom source there is nothing for the driver to feed. {@link OnHandRaiseChange} is implemented (the
 * contract requires it) but its handler is never invoked. See the file-level note.
 *
 * The driver constructs ONE of these per session (only when the provider has `SpeakerDiarization`, i.e.
 * there is a roster to facilitate) and returns it from `DiscordBridge.GetMeetingControlsEventSource`.
 */
export class DiscordMeetingControlsEventSource implements IBridgeMeetingControlsEventSource {
    /** Live roster keyed by user id (lowercased), kept current by the driver's {@link IngestRoster}. */
    private readonly roster = new Map<string, BridgeMeetingParticipant>();

    private rosterHandler?: (participants: BridgeMeetingParticipant[]) => void;
    private speakingHandler?: (participantIds: string[]) => void;
    /**
     * The registered hand-raise handler. **Never invoked for Discord** — voice channels surface no
     * hand-raise signal (see the class note). Held only to satisfy the channel contract.
     */
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** Discord supports member mute (bot needs "Mute Members"), so the facilitator `MuteParticipant` tool is offered. */
    public readonly Capabilities: ReadonlyArray<BridgeMeetingControlsCapability> = ['Mute'];

    /**
     * @param sdk The Discord SDK seam used only to actuate {@link MuteParticipant} — all *perception* is
     *   fed in by the driver via the `Ingest*` methods so the SDK keeps a single subscriber per event.
     */
    constructor(private readonly sdk: IDiscordVoiceSdk) {}

    // ── Driver-fed perception (the driver owns the SDK subscriptions) ─────────────────

    /**
     * Replaces the roster with a fresh snapshot from the driver and emits it to the channel. Called by
     * the driver after the initial join and on every member join/leave.
     *
     * @param members The full current Discord voice-channel roster.
     */
    public IngestRoster(members: DiscordMember[]): void {
        this.roster.clear();
        for (const m of members) {
            this.roster.set(this.key(m.UserId), toMeetingParticipant(m));
        }
        this.emitRoster();
    }

    /**
     * Forwards a diarized speaking-set change from the driver to the channel.
     *
     * @param participantIds The ids currently speaking.
     */
    public IngestSpeaking(participantIds: string[]): void {
        this.speakingHandler?.(participantIds);
    }

    /**
     * Convenience alias for {@link IngestSpeaking}, kept because "notify" reads naturally at the driver's
     * inbound-audio call site.
     *
     * @param participantIds The ids currently speaking.
     */
    public NotifySpeaking(participantIds: string[]): void {
        this.IngestSpeaking(participantIds);
    }

    // NOTE: there is intentionally NO `IngestHandRaise` here — Discord surfaces no hand-raise signal, so
    // the driver has nothing to feed. See the class-level note.

    // ── IBridgeMeetingControlsEventSource ────────────────────────────────────────────

    /** @inheritdoc */
    public OnRosterChange(handler: (participants: BridgeMeetingParticipant[]) => void): void {
        this.rosterHandler = handler;
        // Emit the current roster immediately so a late subscriber is not blank.
        this.emitRoster();
    }

    /** @inheritdoc */
    public OnSpeakingChange(handler: (participantIds: string[]) => void): void {
        this.speakingHandler = handler;
    }

    /**
     * @inheritdoc
     *
     * Registers the handler but, for Discord, it is **never invoked** — voice channels surface no
     * hand-raise signal, so the driver feeds nothing. Implemented only to satisfy the channel contract.
     */
    public OnHandRaiseChange(handler: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = handler;
    }

    /** @inheritdoc */
    public async MuteParticipant(participantId: string): Promise<void> {
        await this.sdk.muteMember(participantId);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    private emitRoster(): void {
        this.rosterHandler?.(Array.from(this.roster.values()));
    }

    private key(userId: string): string {
        return userId.trim().toLowerCase();
    }
}
