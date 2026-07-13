/**
 * Adapts the {@link ITeamsMeetingSdk} participant / hand-raise / speaking stream into an
 * {@link IBridgeMeetingControlsEventSource} so the bridge engine can wire the **Meeting Controls**
 * facilitator channel (roster · hand-raise queue · who's-speaking · mute) for a Teams session. This is
 * the §4b "the bridge contributes a channel" pattern realized for Teams — no channel logic lives here,
 * only the platform→channel signal mapping.
 */

import {
    IBridgeMeetingControlsEventSource,
    BridgeMeetingParticipant,
    BridgeMeetingControlsCapability,
    BridgeMeetingParticipantRole,
} from '@memberjunction/ai-bridge-base';
import { ITeamsMeetingSdk, TeamsParticipant, TeamsParticipantRole } from './teams-sdk';

/**
 * Maps a Teams participant role to the bridge's meeting-participant role. Teams has no distinct "Agent"
 * role; the bot is flagged via `IsSelf` and surfaced as `'Agent'`. Teams organizers/presenters map to
 * the bridge's host/co-host roles (the closest facilitator-authority equivalents).
 */
function mapRole(role: TeamsParticipantRole, isSelf: boolean | undefined): BridgeMeetingParticipantRole {
    if (isSelf) {
        return 'Agent';
    }
    switch (role) {
        case 'Organizer':
            return 'Host';
        case 'Presenter':
            return 'CoHost';
        default:
            return 'Participant';
    }
}

/** Maps one Teams participant onto the channel's {@link BridgeMeetingParticipant} shape. */
export function toMeetingParticipant(p: TeamsParticipant): BridgeMeetingParticipant {
    return {
        ParticipantId: p.ParticipantId,
        DisplayName: p.DisplayName,
        Role: mapRole(p.Role, p.IsSelf),
        IsAgent: p.IsSelf === true,
    };
}

/**
 * Teams's adapter to the Meeting Controls channel's event source. It maintains a live roster and
 * mirrors native hand-raise + diarized speaking signals, and actuates mute through the SDK.
 *
 * **The driver owns the SDK subscriptions** (the SDK seam is "latest handler wins", so it can have
 * only one subscriber per event) and **feeds this source imperatively** via {@link IngestRoster} /
 * {@link IngestHandRaise} / {@link IngestSpeaking}. This source only needs the SDK for the one *action*
 * it actuates — {@link MuteParticipant}. The Meeting Controls channel subscribes the three `On*`
 * streams in turn.
 *
 * The driver constructs ONE of these per session (only when the provider has `SpeakerDiarization`, i.e.
 * there is a roster to facilitate) and returns it from `TeamsBridge.GetMeetingControlsEventSource`.
 */
export class TeamsMeetingControlsEventSource implements IBridgeMeetingControlsEventSource {
    /** Live roster keyed by participant id (lowercased), kept current by the driver's {@link IngestRoster}. */
    private readonly roster = new Map<string, BridgeMeetingParticipant>();

    private rosterHandler?: (participants: BridgeMeetingParticipant[]) => void;
    private speakingHandler?: (participantIds: string[]) => void;
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** Teams supports organizer/presenter-driven mute, so the facilitator `MuteParticipant` tool is offered. */
    public readonly Capabilities: ReadonlyArray<BridgeMeetingControlsCapability> = ['Mute'];

    /**
     * @param sdk The Teams SDK seam used only to actuate {@link MuteParticipant} — all *perception* is
     *   fed in by the driver via the `Ingest*` methods so the SDK keeps a single subscriber per event.
     */
    constructor(private readonly sdk: ITeamsMeetingSdk) {}

    // ── Driver-fed perception (the driver owns the SDK subscriptions) ─────────────────

    /**
     * Replaces the roster with a fresh snapshot from the driver and emits it to the channel. Called by
     * the driver after the initial join and on every participant join/leave.
     *
     * @param participants The full current Teams roster.
     */
    public IngestRoster(participants: TeamsParticipant[]): void {
        this.roster.clear();
        for (const p of participants) {
            this.roster.set(this.key(p.ParticipantId), toMeetingParticipant(p));
        }
        this.emitRoster();
    }

    /**
     * Forwards a native hand-raise/lower signal from the driver to the channel.
     *
     * ⚠️ Teams raised-hand is partial; this may never fire on tenants/builds that don't surface the
     * event over the calling-bot API. The channel degrades gracefully (its software hand-raise still works).
     *
     * @param participantId The participant whose hand changed.
     * @param raised Whether the hand is now raised.
     */
    public IngestHandRaise(participantId: string, raised: boolean): void {
        this.handRaiseHandler?.(participantId, raised);
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
     * Convenience alias for {@link IngestSpeaking}, kept because "notify" reads naturally at the
     * driver's inbound-audio call site.
     *
     * @param participantIds The ids currently speaking.
     */
    public NotifySpeaking(participantIds: string[]): void {
        this.IngestSpeaking(participantIds);
    }

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

    /** @inheritdoc */
    public OnHandRaiseChange(handler: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = handler;
    }

    /** @inheritdoc */
    public async MuteParticipant(participantId: string): Promise<void> {
        await this.sdk.muteParticipant(participantId);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    private emitRoster(): void {
        this.rosterHandler?.(Array.from(this.roster.values()));
    }

    private key(participantId: string): string {
        return participantId.trim().toLowerCase();
    }
}
