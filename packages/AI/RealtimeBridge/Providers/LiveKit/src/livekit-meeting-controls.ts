/**
 * Adapts the {@link ILiveKitRoomSdk} participant / speaking stream into an
 * {@link IBridgeMeetingControlsEventSource} so the bridge engine can wire the **Meeting Controls**
 * facilitator channel (roster · who's-speaking · hand-raise queue) for a LiveKit room session. This is
 * the §4b "the bridge contributes a channel" pattern realized for the MJ-native room — no channel logic
 * lives here, only the platform→channel signal mapping.
 *
 * ## What LiveKit contributes (vs. Zoom)
 * - **Roster + speaking**: native (per-participant tracks → diarization → speaking attribution).
 * - **Hand-raise**: LiveKit has **no built-in raise-hand**. The channel still offers the facilitator
 *   hand-raise *queue* (an MJ construct), but no PLATFORM hand-raise signal arrives, so
 *   {@link IngestHandRaise} is available for an app that layers raise-hand over data messages — it is
 *   simply never fired by the room itself.
 * - **Mute**: LiveKit room-admin can mute a participant's published track, so the `Mute` capability is
 *   advertised and {@link MuteParticipant} actuates it through the SDK adapter.
 */

import {
    IBridgeMeetingControlsEventSource,
    BridgeMeetingParticipant,
    BridgeMeetingControlsCapability,
    BridgeMeetingParticipantRole,
} from '@memberjunction/ai-bridge-base';
import { ILiveKitRoomSdk, LiveKitParticipant, LiveKitParticipantRole } from './livekit-sdk';

/**
 * Maps a LiveKit participant role to the bridge's meeting-participant role. LiveKit has no distinct
 * "Agent" role; the bot is flagged via `IsLocal` and surfaced as `'Agent'`.
 */
function mapRole(role: LiveKitParticipantRole, isLocal: boolean | undefined): BridgeMeetingParticipantRole {
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

/** Maps one LiveKit participant onto the channel's {@link BridgeMeetingParticipant} shape. */
export function toMeetingParticipant(p: LiveKitParticipant): BridgeMeetingParticipant {
    return {
        ParticipantId: p.Identity,
        DisplayName: p.DisplayName,
        Role: mapRole(p.Role, p.IsLocal),
        IsAgent: p.IsLocal === true,
    };
}

/**
 * LiveKit's adapter to the Meeting Controls channel's event source. It maintains a live roster and
 * mirrors diarized speaking signals, and actuates mute through the SDK adapter.
 *
 * **The driver owns the SDK subscriptions** (the SDK seam is "latest handler wins") and **feeds this
 * source imperatively** via {@link IngestRoster} / {@link IngestSpeaking} / {@link IngestHandRaise}.
 * This source only needs the SDK for the one *action* it actuates — {@link MuteParticipant}. The
 * Meeting Controls channel subscribes the three `On*` streams in turn.
 *
 * The driver constructs ONE of these per session (only when the provider has `SpeakerDiarization`, i.e.
 * there is a roster to facilitate) and returns it from `LiveKitBridge.GetMeetingControlsEventSource`.
 */
export class LiveKitMeetingControlsEventSource implements IBridgeMeetingControlsEventSource {
    /** Live roster keyed by participant identity (lowercased), kept current by {@link IngestRoster}. */
    private readonly roster = new Map<string, BridgeMeetingParticipant>();

    private rosterHandler?: (participants: BridgeMeetingParticipant[]) => void;
    private speakingHandler?: (participantIds: string[]) => void;
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** LiveKit room-admin can mute a published track, so the facilitator `MuteParticipant` tool is offered. */
    public readonly Capabilities: ReadonlyArray<BridgeMeetingControlsCapability> = ['Mute'];

    /**
     * @param sdk The LiveKit SDK seam used only to actuate {@link MuteParticipant} — all *perception* is
     *   fed in by the driver via the `Ingest*` methods so the SDK keeps a single subscriber per event.
     */
    constructor(private readonly sdk: ILiveKitRoomSdk) {}

    // ── Driver-fed perception (the driver owns the SDK subscriptions) ─────────────────

    /**
     * Replaces the roster with a fresh snapshot from the driver and emits it to the channel. Called by
     * the driver after the initial connect and on every participant join/leave.
     *
     * @param participants The full current LiveKit roster.
     */
    public IngestRoster(participants: LiveKitParticipant[]): void {
        this.roster.clear();
        for (const p of participants) {
            this.roster.set(this.key(p.Identity), toMeetingParticipant(p));
        }
        this.emitRoster();
    }

    /**
     * Forwards a hand-raise/lower signal to the channel. LiveKit emits none natively; this exists for an
     * app that layers raise-hand over data messages.
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
     * @param participantIds The identities currently speaking.
     */
    public IngestSpeaking(participantIds: string[]): void {
        this.speakingHandler?.(participantIds);
    }

    /**
     * Convenience alias for {@link IngestSpeaking}, kept because "notify" reads naturally at the
     * driver's inbound-audio call site.
     *
     * @param participantIds The identities currently speaking.
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
        // LiveKit mute is actuated by the room-admin path; the SDK adapter maps this onto its
        // mute-published-track call. The fake captures it for tests.
        await this.muteViaSdk(participantId);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Actuates a mute through the SDK adapter's data-channel admin path. */
    private async muteViaSdk(participantId: string): Promise<void> {
        // The SDK seam does not surface a dedicated mute primitive (room-admin mute is a server-SDK
        // concern bound at deployment); we signal it as a structured data message the adapter recognizes.
        await this.sdk.sendDataMessage(`__mj_mute:${participantId}`);
    }

    private emitRoster(): void {
        this.rosterHandler?.(Array.from(this.roster.values()));
    }

    private key(identity: string): string {
        return identity.trim().toLowerCase();
    }
}
