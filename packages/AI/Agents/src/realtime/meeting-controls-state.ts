/**
 * @fileoverview Pure, platform-free state machine for the Meeting Controls channel — the
 * facilitator intel an agent acts on: the ordered hand-raise QUEUE, who is speaking, the roster,
 * and a meeting/agenda timer. Deliberately free of any realtime/bridge/MJ dependency so it is
 * exhaustively unit-testable with an injected clock and no platform.
 *
 * The {@link import('./meeting-controls-channel-server').MeetingControlsChannelServer} owns one of
 * these per session, mutates it from the injected bridge event stream + the agent's tool calls, and
 * serializes {@link MeetingControlsState.BuildPerception} snapshots back to the model.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

/**
 * The role a participant plays in the meeting, from the facilitator's point of view. A union (not an
 * enum) so it exports cleanly and stays additive. `Agent` is the facilitating bot itself.
 */
export type MeetingParticipantRole = 'Host' | 'CoHost' | 'Participant' | 'Agent';

/**
 * One participant on the meeting roster, as the Meeting Controls channel tracks them. Minimal and
 * platform-agnostic — a bridge driver maps its native roster (`BridgeParticipantInfo`, a Zoom
 * participant, a Twilio call leg, …) onto this shape when feeding the channel's event source.
 */
export interface MeetingParticipant {
    /** Stable platform-native participant id (the key the queue / speaking / mute state is keyed on). */
    ParticipantId: string;

    /** Human-readable display name, when the platform reports one. */
    DisplayName?: string;

    /** The participant's role in the meeting. */
    Role: MeetingParticipantRole;

    /** Whether this participant is an agent bot (the facilitator excludes agents from hand-raise / call-on). */
    IsAgent: boolean;
}

/**
 * One entry in the hand-raise queue: who raised, and WHEN (so the queue preserves raise order and the
 * perception feed can report how long each person has been waiting).
 */
export interface HandRaiseQueueEntry {
    /** The participant who raised their hand. */
    ParticipantId: string;

    /** Their display name at raise time (for a human-readable queue in the perception feed). */
    DisplayName?: string;

    /** Epoch-ms when the hand was raised — drives queue ordering and wait-time reporting. */
    RaisedAtMs: number;
}

/**
 * A monotonic clock, injected so the queue/timer logic is deterministic in tests. Defaults to
 * `Date.now` in production.
 */
export type MeetingControlsClock = () => number;

/**
 * A snapshot of the timer the agent set (via the `SetTimer` tool), reported in the perception feed so
 * the agent can pace the meeting ("two minutes left on this agenda item").
 */
export interface MeetingTimerSnapshot {
    /** The total duration the timer was set for, in seconds. */
    DurationSeconds: number;

    /** Whole seconds elapsed since the timer was set (clamped to `[0, DurationSeconds]`). */
    ElapsedSeconds: number;

    /** Whole seconds remaining (clamped to `[0, DurationSeconds]`); `0` once the timer has expired. */
    RemainingSeconds: number;

    /** Whether the timer has reached or passed its duration. */
    Expired: boolean;
}

/**
 * The full perception payload the channel serializes back to the model — the facilitator's situational
 * awareness in one object: the roster, the ordered hand-raise queue, who is speaking, and the timer.
 */
export interface MeetingControlsPerception {
    /** The current roster (every known participant, agents included). */
    Roster: MeetingParticipant[];

    /** The hand-raise queue in RAISE ORDER (oldest first) — who is waiting and for how long. */
    HandRaiseQueue: Array<HandRaiseQueueEntry & { WaitingSeconds: number }>;

    /** The participant ids currently speaking (diarized), in no particular order. */
    SpeakingParticipantIds: string[];

    /** The participant ids the agent has muted via the channel (best-effort mirror of mute state). */
    MutedParticipantIds: string[];

    /** The active agenda/meeting timer, or `null` when none is set. */
    Timer: MeetingTimerSnapshot | null;
}

/**
 * Pure facilitator state — the ordered hand-raise queue, who is speaking, the roster, mute state, and
 * a single agenda timer. No I/O, no realtime/bridge coupling; mutated by the channel server from the
 * bridge event stream and the agent's tool calls, then snapshotted via {@link BuildPerception}.
 *
 * All time-based behavior reads the injected {@link MeetingControlsClock}, so a test can advance time
 * deterministically and assert exact wait / elapsed / remaining values.
 */
export class MeetingControlsState {
    /** Roster keyed by participant id (insertion order preserved for stable perception output). */
    private roster = new Map<string, MeetingParticipant>();

    /** Hand-raise queue in raise order (oldest first). A participant appears at most once. */
    private handQueue: HandRaiseQueueEntry[] = [];

    /** Currently-speaking participant ids (diarized). */
    private speaking = new Set<string>();

    /** Participant ids the agent muted via the channel. */
    private muted = new Set<string>();

    /** The active timer's total duration (seconds) and start time (epoch-ms), or `null` when unset. */
    private timer: { durationSeconds: number; startedAtMs: number } | null = null;

    /** Injected clock for deterministic time math. */
    private readonly clock: MeetingControlsClock;

    /**
     * @param clock The monotonic clock to read for queue wait-times and the timer. Defaults to `Date.now`.
     */
    constructor(clock: MeetingControlsClock = () => Date.now()) {
        this.clock = clock;
    }

    // ── Roster ────────────────────────────────────────────────────────────────────

    /**
     * Replaces the roster wholesale with a fresh snapshot from the bridge. Participants who left the
     * meeting (no longer in the snapshot) are pruned from the queue, the speaking set, and the mute
     * set so stale ids never linger in the perception feed.
     *
     * @param participants The current roster snapshot.
     */
    public SetRoster(participants: MeetingParticipant[]): void {
        this.roster = new Map(participants.map((p) => [p.ParticipantId, p]));
        const present = new Set(participants.map((p) => p.ParticipantId));
        this.handQueue = this.handQueue.filter((e) => present.has(e.ParticipantId));
        for (const id of [...this.speaking]) {
            if (!present.has(id)) {
                this.speaking.delete(id);
            }
        }
        for (const id of [...this.muted]) {
            if (!present.has(id)) {
                this.muted.delete(id);
            }
        }
    }

    /** The current roster (every known participant), in insertion order. */
    public GetRoster(): MeetingParticipant[] {
        return [...this.roster.values()];
    }

    /** Looks up a participant by id, or `undefined` when not on the roster. */
    public GetParticipant(participantId: string): MeetingParticipant | undefined {
        return this.roster.get(participantId);
    }

    // ── Hand-raise queue ───────────────────────────────────────────────────────────

    /**
     * Adds a participant to the hand-raise queue (idempotent — a second raise by someone already in
     * the queue keeps their ORIGINAL position and raise time, never jumping them forward). A raise by
     * someone not on the roster is ignored (the bridge should roster them first).
     *
     * @param participantId The participant raising their hand.
     * @returns `true` when the queue changed (a new raise landed), `false` otherwise.
     */
    public RaiseHand(participantId: string): boolean {
        if (!this.roster.has(participantId) || this.isQueued(participantId)) {
            return false;
        }
        const participant = this.roster.get(participantId);
        this.handQueue.push({
            ParticipantId: participantId,
            DisplayName: participant?.DisplayName,
            RaisedAtMs: this.clock(),
        });
        return true;
    }

    /**
     * Removes a participant from the hand-raise queue (the explicit `LowerHand` tool, and the
     * implicit lower when they are called on). Preserves the order of everyone else.
     *
     * @param participantId The participant whose hand to lower.
     * @returns `true` when they were in the queue and were removed, `false` otherwise.
     */
    public LowerHand(participantId: string): boolean {
        const before = this.handQueue.length;
        this.handQueue = this.handQueue.filter((e) => e.ParticipantId !== participantId);
        return this.handQueue.length !== before;
    }

    /** Whether a participant is currently in the hand-raise queue. */
    public isQueued(participantId: string): boolean {
        return this.handQueue.some((e) => e.ParticipantId === participantId);
    }

    /** The next participant in the queue (front of the line), or `undefined` when the queue is empty. */
    public PeekNextHand(): HandRaiseQueueEntry | undefined {
        return this.handQueue[0];
    }

    /**
     * "Calls on" a participant: removes them from the hand-raise queue (lowering their hand) and
     * returns them. When `participantId` is omitted, calls on the FRONT of the queue (next in line).
     * Returns `undefined` when there is no one to call on (empty queue, or the named id isn't queued).
     *
     * @param participantId Optional specific participant to call on; defaults to the queue front.
     * @returns The participant called on, or `undefined`.
     */
    public CallOn(participantId?: string): HandRaiseQueueEntry | undefined {
        const target = participantId
            ? this.handQueue.find((e) => e.ParticipantId === participantId)
            : this.handQueue[0];
        if (!target) {
            return undefined;
        }
        this.LowerHand(target.ParticipantId);
        return target;
    }

    /** The hand-raise queue in raise order (oldest first), each stamped with current wait seconds. */
    public GetHandRaiseQueue(): Array<HandRaiseQueueEntry & { WaitingSeconds: number }> {
        const now = this.clock();
        return this.handQueue.map((e) => ({
            ...e,
            WaitingSeconds: Math.max(0, Math.floor((now - e.RaisedAtMs) / 1000)),
        }));
    }

    // ── Speaking ──────────────────────────────────────────────────────────────────

    /**
     * Replaces the set of currently-speaking participants (from the bridge's diarization stream).
     *
     * @param participantIds The ids now speaking.
     */
    public SetSpeaking(participantIds: string[]): void {
        this.speaking = new Set(participantIds);
    }

    /** The participant ids currently speaking. */
    public GetSpeaking(): string[] {
        return [...this.speaking];
    }

    // ── Mute ──────────────────────────────────────────────────────────────────────

    /**
     * Marks a participant muted by the channel (the agent's `MuteParticipant` tool). The actual
     * platform mute is the driver's job; this mirrors the intent so the perception feed reflects it.
     *
     * @param participantId The participant to mark muted.
     * @returns `true` when the participant is on the roster (and was marked), `false` otherwise.
     */
    public MarkMuted(participantId: string): boolean {
        if (!this.roster.has(participantId)) {
            return false;
        }
        this.muted.add(participantId);
        return true;
    }

    /** The participant ids the agent has muted via the channel. */
    public GetMuted(): string[] {
        return [...this.muted];
    }

    // ── Timer ─────────────────────────────────────────────────────────────────────

    /**
     * Sets (or resets) the agenda timer to `durationSeconds`, starting now. A non-positive duration
     * clears the timer. Setting a new timer replaces any existing one.
     *
     * @param durationSeconds The timer duration in seconds; `<= 0` clears it.
     */
    public SetTimer(durationSeconds: number): void {
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            this.timer = null;
            return;
        }
        this.timer = { durationSeconds: Math.floor(durationSeconds), startedAtMs: this.clock() };
    }

    /** Clears the agenda timer. */
    public ClearTimer(): void {
        this.timer = null;
    }

    /** The current timer snapshot (elapsed / remaining / expired), or `null` when none is set. */
    public GetTimer(): MeetingTimerSnapshot | null {
        if (!this.timer) {
            return null;
        }
        const elapsedRaw = Math.floor((this.clock() - this.timer.startedAtMs) / 1000);
        const elapsed = Math.min(this.timer.durationSeconds, Math.max(0, elapsedRaw));
        const remaining = Math.max(0, this.timer.durationSeconds - elapsed);
        return {
            DurationSeconds: this.timer.durationSeconds,
            ElapsedSeconds: elapsed,
            RemainingSeconds: remaining,
            Expired: remaining === 0,
        };
    }

    // ── Perception ────────────────────────────────────────────────────────────────

    /**
     * Builds the full perception snapshot the channel serializes back to the model — the facilitator's
     * complete situational awareness in one object.
     *
     * @returns The perception payload.
     */
    public BuildPerception(): MeetingControlsPerception {
        return {
            Roster: this.GetRoster(),
            HandRaiseQueue: this.GetHandRaiseQueue(),
            SpeakingParticipantIds: this.GetSpeaking(),
            MutedParticipantIds: this.GetMuted(),
            Timer: this.GetTimer(),
        };
    }
}
