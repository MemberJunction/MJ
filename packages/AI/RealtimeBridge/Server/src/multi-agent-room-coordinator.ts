/**
 * Multi-agent room coordination — the inter-agent **speaking discipline** for "1+ agents in one shared
 * room" (`/plans/realtime/realtime-bridges-architecture.md` §4c).
 *
 * ## The model — the room IS the shared media plane; this only adds discipline
 * Multi-party is an **emergent property of the bridge**, not a separate build. When several agents each
 * open their OWN bridge connection into the SAME room (a Zoom meeting, a Teams meeting, or an MJ-native
 * LiveKit room), the conferencing platform *is* the shared media plane: it does the SFU, the mixing, the
 * multi-party transport. **Each agent hears the others through the room's own mix** — Sage's voice is
 * part of "everyone else" in Demo Loop's inbound audio and vice-versa. There is NO transcript-relay hack
 * and NO mixer in MJ; the room already mixes.
 *
 * So the ONLY genuinely new problem is **turn-taking discipline among multiple agents** so they don't
 * talk over each other or loop forever. This coordinator solves exactly that and nothing else:
 *
 * 1. **Floor arbitration** — at most ONE agent "holds the floor" (is speaking) in a room at any instant.
 *    An agent calls {@link CanTakeFloor} before generating speech; it returns `true` only if no OTHER
 *    agent currently holds the floor. {@link TakeFloor} grants it; {@link ReleaseFloor} frees it.
 * 2. **Passive-default loop safety** — combined with passive turn-taking (an agent speaks only when
 *    *addressed by name*, per {@link import('@memberjunction/ai-bridge-base').TurnTakingPolicy}), two
 *    agents in a room never loop: neither speaks unless a human calls on it, and even then only one holds
 *    the floor. This coordinator is the SECOND guard — passivity prevents the loop, the floor prevents
 *    the overlap.
 * 3. **Facilitator override** — an optional designated **facilitator** agent (one that runs the Meeting
 *    Controls channel) may be granted the floor even while another agent holds it, so it can arbitrate /
 *    call on a specific agent. See {@link RegisterRoomParticipant}'s `isFacilitator` and
 *    {@link CanTakeFloor}'s facilitator path.
 *
 * ## Full-duplex rules (the models listen while they speak)
 * Turn-based models were gated by voice-activity detection; full-duplex models decide for themselves when
 * to speak, so the coordinator is the **safety net** behind their own judgement. It adds, on top of 1–3:
 *
 * 4. **Humans win** — human speech ({@link NoteHumanSpeech}) preempts the floor holder immediately, cancels
 *    any pending hand-off, and denies every agent until the human has been quiet for the hold window. This
 *    outranks even the facilitator override.
 * 5. **Backchannels** — a short acknowledgement ("mm-hm") does not need and never takes the floor, so it
 *    cannot interrupt another agent's turn ({@link CanTakeFloor}/{@link TakeFloor} with kind `Backchannel`;
 *    "short" is {@link import('@memberjunction/ai-bridge-base').IsBackchannel}). Anything longer is a turn.
 * 6. **Explicit hand-off** — a speaking agent can {@link YieldFloor} to a named agent; the floor is reserved
 *    for that agent for a short TTL, so no third agent can start in the gap and two agents never start at once.
 * 7. **Loop cap** — after {@link DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS} consecutive agent turns with no human in
 *    between, every agent is denied (`LoopCapReached`) until a human speaks — the agent-to-agent runaway breaker.
 *
 * ## Echo / self-audio (documented, handled by the bridge, not here)
 * A bot must not hear its OWN output, or it would react to itself and loop. Conferencing platforms
 * (and the LiveKit SFU) **exclude a participant's own published audio from that participant's inbound
 * mix**, so the bridge driver naturally never feeds the agent its own voice — the LiveKitBridge documents
 * this explicitly. Where a platform does NOT exclude own-audio, the bridge driver must gate it before
 * `OnMedia`. This coordinator assumes that property holds and does not itself touch media — it operates
 * purely on floor state.
 *
 * ## Purity & testability
 * This class is **pure and synchronous** — no I/O, no entities, no real clock (an injected clock stamps
 * `since`, hand-off expiry and the human-speech hold). Every decision is a deterministic function of the
 * in-memory room/floor state, so it is exhaustively unit-testable with no network, DB, or real session.
 */

import { IsBackchannel, type UtteranceShape } from '@memberjunction/ai-bridge-base';

/** Default cap on consecutive agent turns (no human between) before agents are denied. See rule 7 above. */
export const DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS = 8;

/** How long (ms) a yielded floor stays reserved for the agent it was handed to. */
export const DEFAULT_HANDOFF_TTL_MS = 5000;

/** How long (ms) after the last human speech activity the human is still considered to be speaking. */
export const DEFAULT_HUMAN_SPEECH_HOLD_MS = 800;

/** How many recent room events the coordinator keeps for observability (oldest dropped first). */
export const MAX_ROOM_EVENTS = 60;

/**
 * One agent's membership in a shared room, as the coordinator tracks it.
 */
export interface RoomAgentMembership {
    /** The `MJ: AI Agent Sessions` row id of this agent's bridge session in the room. */
    AgentSessionId: string;

    /** Whether this agent is the room's designated facilitator (may override the floor to arbitrate). */
    IsFacilitator: boolean;
}

/** What kind of speech an agent is asking the floor for. A `Backchannel` never takes (or interrupts) the floor. */
export type FloorRequestKind = 'Turn' | 'Backchannel';

/** The kinds of room events the coordinator records for observability. */
export type RoomTurnEventType =
    | 'FloorGranted'
    | 'FloorReleased'
    | 'FloorDenied'
    | 'Yielded'
    | 'Backchannel'
    | 'HumanSpeech'
    | 'HumanPreempted'
    | 'LoopCapReached';

/** One recorded room event (turn-taking observability — the test bed renders these live). */
export interface RoomTurnEvent {
    /** Monotonic per-room sequence number (clients poll with the last `Seq` they saw). */
    Seq: number;
    /** Epoch-ms the event happened (injected clock). */
    AtMs: number;
    /** What happened. */
    Type: RoomTurnEventType;
    /** The agent session the event is about, when it concerns one. */
    AgentSessionId?: string;
    /** For `Yielded`: the agent the floor was handed to. */
    ToAgentSessionId?: string;
    /** A short machine-readable reason (a {@link FloorDecisionReason} for grants/denials). */
    Reason?: string;
}

/**
 * The live floor state of a room, returned by {@link MultiAgentRoomCoordinator.GetRoomState} for
 * observability and tests.
 */
export interface RoomFloorState {
    /** The room's external id (the shared external connection id / ConversationID all agents key on). */
    RoomId: string;

    /** The agent session ids currently in the room. */
    AgentSessionIds: string[];

    /** The facilitator agent session id, when one is designated; otherwise `null`. */
    FacilitatorAgentSessionId: string | null;

    /** The agent session id currently holding the floor (speaking), or `null` when the floor is free. */
    FloorHolderAgentSessionId: string | null;

    /** Epoch-ms the current floor holder took the floor, or `null` when the floor is free. */
    FloorHeldSinceMs: number | null;

    /** Whether a human is currently speaking (within the hold window of their last speech activity). */
    HumanSpeaking: boolean;

    /** The agent session the floor is reserved for after a hand-off, or `null` when none is pending. */
    PendingHandoffToAgentSessionId: string | null;

    /** Consecutive agent turns granted since the last human speech. */
    ConsecutiveAgentTurns: number;

    /** The cap that applies to this room. */
    MaxConsecutiveAgentTurns: number;

    /** Whether the loop cap is reached — agents are passive until a human speaks. */
    LoopCapReached: boolean;

    /** How many backchannels have been recorded in this room. */
    BackchannelCount: number;

    /** The most recent events, oldest first (bounded by {@link MAX_ROOM_EVENTS}). */
    RecentEvents: RoomTurnEvent[];
}

/** The reason a {@link MultiAgentRoomCoordinator.CanTakeFloor} request was granted or denied. */
export type FloorDecisionReason =
    | 'FloorFree'
    | 'AlreadyHolder'
    | 'FacilitatorOverride'
    | 'HandoffGranted'
    | 'Backchannel'
    | 'HeldByOtherAgent'
    | 'ReservedForHandoff'
    | 'HumanSpeaking'
    | 'LoopCapReached'
    | 'NotInRoom'
    | 'UnknownRoom';

/** The outcome of a floor request — whether the agent may speak, and why. */
export interface FloorDecision {
    /** Whether the requesting agent may take the floor and speak now. */
    Granted: boolean;

    /** The structured reason for the decision (useful for observability + tests). */
    Reason: FloorDecisionReason;
}

/** The outcome of {@link MultiAgentRoomCoordinator.NoteHumanSpeech}. */
export interface HumanPreemption {
    /** The agent session that held the floor and was just preempted, or `null` when nobody did. */
    PreemptedAgentSessionId: string | null;
}

/** Why a {@link MultiAgentRoomCoordinator.YieldFloor} call ended the way it did. */
export type YieldReason = 'Yielded' | 'NotHolder' | 'NotInRoom' | 'UnknownRoom' | 'UnknownTarget' | 'HumanSpeaking' | 'LoopCapReached';

/** The outcome of {@link MultiAgentRoomCoordinator.YieldFloor}. */
export interface YieldResult {
    /** Whether the yielding agent's floor was released (it held it). */
    Released: boolean;

    /** The agent session the floor is now reserved for, or `null` (no target / target refused). */
    HandoffToAgentSessionId: string | null;

    /** Why the yield ended this way. */
    Reason: YieldReason;
}

/** The outcome of {@link MultiAgentRoomCoordinator.CompleteTurn}. */
export interface TurnCompletion {
    /** Whether this call released the floor (the agent was the holder). */
    Released: boolean;

    /** Whether the finished utterance was short enough to be reclassified as a backchannel (not counted as a turn). */
    WasBackchannel: boolean;
}

/** Tunable limits for the coordinator. Every field is optional; omitted fields keep their defaults. */
export interface RoomCoordinatorLimits {
    /** Cap on consecutive agent turns with no human between. */
    MaxConsecutiveAgentTurns?: number;

    /** How long a yielded floor stays reserved for its target (ms). */
    HandoffTtlMs?: number;

    /** How long after the last human speech activity the human still counts as speaking (ms). */
    HumanSpeechHoldMs?: number;
}

/** A pending hand-off reservation. */
interface PendingHandoff {
    toAgentSessionId: string;
    fromAgentSessionId: string;
    expiresAtMs: number;
}

/** Internal per-room state held by the coordinator. */
interface RoomRecord {
    readonly roomId: string;
    /** Agent session id (lowercased) → membership. */
    readonly members: Map<string, RoomAgentMembership>;
    facilitatorAgentSessionId: string | null;
    floorHolderAgentSessionId: string | null;
    floorHeldSinceMs: number | null;
    /** Human speech is "active" while `now < humanSpeakingUntilMs`. */
    humanSpeakingUntilMs: number;
    handoff: PendingHandoff | null;
    consecutiveAgentTurns: number;
    /** Per-room override of the loop cap, or `null` to use the coordinator-wide one. */
    maxConsecutiveAgentTurns: number | null;
    backchannelCount: number;
    nextSeq: number;
    events: RoomTurnEvent[];
}

/**
 * Coordinates speaking discipline for multiple agents sharing one room. Construct one per process (the
 * engine holds a single instance) and key everything on the **room id** — the shared external connection
 * id (or ConversationID) that all co-located agent sessions belong to.
 *
 * The coordinator is additive: single-agent sessions never register here and are wholly unaffected. Only
 * when 2+ agent sessions share a room does floor arbitration come into play.
 */
export class MultiAgentRoomCoordinator {
    /** Room id (lowercased) → room record. */
    private readonly rooms = new Map<string, RoomRecord>();

    /** Injected clock for floor-held timestamps, hand-off expiry and the human-speech hold; defaults to `Date.now`. */
    private readonly now: () => number;

    private maxConsecutiveAgentTurns = DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS;
    private handoffTtlMs = DEFAULT_HANDOFF_TTL_MS;
    private humanSpeechHoldMs = DEFAULT_HUMAN_SPEECH_HOLD_MS;

    /**
     * @param now Optional injected clock returning epoch-ms. Defaults to `Date.now`. Tests inject a
     *   controllable function for determinism.
     * @param limits Optional tuning (loop cap, hand-off TTL, human-speech hold).
     */
    constructor(now: () => number = Date.now, limits: RoomCoordinatorLimits = {}) {
        this.now = now;
        this.ConfigureLimits(limits);
    }

    /**
     * Adjusts the coordinator-wide limits. Omitted fields keep their current value; non-positive or
     * non-finite values are ignored (a cap of 0 would silence every agent forever, which is never intended).
     *
     * @param limits The limits to change.
     */
    public ConfigureLimits(limits: RoomCoordinatorLimits): void {
        this.maxConsecutiveAgentTurns = positiveOr(limits.MaxConsecutiveAgentTurns, this.maxConsecutiveAgentTurns);
        this.handoffTtlMs = positiveOr(limits.HandoffTtlMs, this.handoffTtlMs);
        this.humanSpeechHoldMs = positiveOr(limits.HumanSpeechHoldMs, this.humanSpeechHoldMs);
    }

    /**
     * Overrides the loop cap for ONE room (e.g. a staged agent-to-agent conversation that should run longer).
     *
     * @param roomId The shared room id.
     * @param max The cap for this room, or `null` to fall back to the coordinator-wide cap.
     * @returns `true` when the room exists and the override was applied.
     */
    public SetRoomMaxConsecutiveAgentTurns(roomId: string, max: number | null): boolean {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return false;
        }
        room.maxConsecutiveAgentTurns = max !== null && Number.isFinite(max) && max > 0 ? Math.floor(max) : null;
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Membership.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Registers an agent session as a participant in a shared room, creating the room on first member.
     * Idempotent — re-registering the same agent updates its facilitator flag without disturbing the
     * floor. Designating an agent as the facilitator records it as the room's arbiter; only one
     * facilitator is tracked (the latest designation wins, mirroring "one chair").
     *
     * @param roomId The shared room id (external connection id / ConversationID) all agents key on.
     * @param agentSessionId The agent's `MJ: AI Agent Sessions` row id.
     * @param isFacilitator Whether this agent is the room's facilitator (may override the floor).
     */
    public RegisterRoomParticipant(roomId: string, agentSessionId: string, isFacilitator = false): void {
        const room = this.ensureRoom(roomId);
        const memberKey = this.key(agentSessionId);
        room.members.set(memberKey, { AgentSessionId: agentSessionId, IsFacilitator: isFacilitator });
        if (isFacilitator) {
            room.facilitatorAgentSessionId = agentSessionId;
        }
    }

    /**
     * Unregisters an agent session from a room (the agent left / its bridge stopped). If the leaving
     * agent held the floor, the floor is released. If it was the facilitator, the facilitator slot is
     * cleared. A hand-off reserved for the leaving agent is dropped (nobody is left to take it). When the
     * last member leaves, the room record is discarded.
     *
     * @param roomId The room the agent is leaving.
     * @param agentSessionId The agent session leaving.
     */
    public UnregisterRoomParticipant(roomId: string, agentSessionId: string): void {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return;
        }
        const memberKey = this.key(agentSessionId);
        room.members.delete(memberKey);

        if (room.floorHolderAgentSessionId && this.key(room.floorHolderAgentSessionId) === memberKey) {
            room.floorHolderAgentSessionId = null;
            room.floorHeldSinceMs = null;
        }
        if (room.facilitatorAgentSessionId && this.key(room.facilitatorAgentSessionId) === memberKey) {
            room.facilitatorAgentSessionId = null;
        }
        if (room.handoff && this.key(room.handoff.toAgentSessionId) === memberKey) {
            room.handoff = null;
        }
        if (room.members.size === 0) {
            this.rooms.delete(this.key(roomId));
        }
    }

    /**
     * Whether a room currently has more than one agent session — i.e. floor arbitration is meaningful.
     * Single-agent rooms can skip the floor dance entirely.
     *
     * @param roomId The room to check.
     * @returns `true` when 2+ agents share the room.
     */
    public IsMultiAgentRoom(roomId: string): boolean {
        const room = this.rooms.get(this.key(roomId));
        return room ? room.members.size > 1 : false;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Floor arbitration.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Asks whether an agent MAY take the floor (speak) now — the read-only arbitration check an agent
     * runs before generating speech. Checked in this order:
     *
     * 1. **Unknown room / not a member** → denied (`UnknownRoom` / `NotInRoom`).
     * 2. **A backchannel** → granted (`Backchannel`) always: it never takes the floor, so it cannot
     *    interrupt anyone, and a listening acknowledgement is welcome even while a human talks.
     * 3. **A human is speaking** → denied (`HumanSpeaking`) — humans win, over the facilitator too.
     * 4. **The loop cap is reached** → denied (`LoopCapReached`) — agents stay passive until a human speaks.
     * 5. **The floor is reserved by a hand-off** → granted to the named agent (`HandoffGranted`); denied to
     *    others (`ReservedForHandoff`) unless the requester is the facilitator.
     * 6. **Otherwise** the floor rules: free → `FloorFree`; already the holder → `AlreadyHolder`; the
     *    facilitator → `FacilitatorOverride` even over a sitting holder; anyone else → `HeldByOtherAgent`.
     *
     * Purely advisory until {@link TakeFloor} actually claims the floor — keeping the check (read) and the
     * claim (write) separate lets a caller test-then-act atomically within its own turn.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent asking to speak.
     * @param kind `'Turn'` (default) to hold the floor, or `'Backchannel'` for a short acknowledgement.
     * @returns The floor decision (granted + reason).
     */
    public CanTakeFloor(roomId: string, agentSessionId: string, kind: FloorRequestKind = 'Turn'): FloorDecision {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return { Granted: false, Reason: 'UnknownRoom' };
        }
        if (!room.members.has(this.key(agentSessionId))) {
            return { Granted: false, Reason: 'NotInRoom' };
        }
        if (kind === 'Backchannel') {
            return { Granted: true, Reason: 'Backchannel' };
        }
        return this.decideTurn(room, agentSessionId);
    }

    /**
     * Atomically attempts to claim the floor for an agent: runs {@link CanTakeFloor} and, when granted,
     * records the agent as the floor holder (stamping the take time) and returns the decision. When a
     * **facilitator** overrides a sitting holder, the holder is replaced — the facilitator now holds the
     * floor (the prior holder should observe this via {@link IsFloorHolder} on its next check and yield).
     *
     * A granted `Turn` that starts a NEW turn counts toward the loop cap. A granted `Backchannel` is recorded
     * but changes no floor state. Every grant and denial lands in the room's event log.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent claiming the floor.
     * @param kind `'Turn'` (default) or `'Backchannel'`.
     * @returns The decision; on a granted `Turn` the agent now holds the floor.
     */
    public TakeFloor(roomId: string, agentSessionId: string, kind: FloorRequestKind = 'Turn'): FloorDecision {
        const decision = this.CanTakeFloor(roomId, agentSessionId, kind);
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return decision;
        }
        if (!decision.Granted) {
            this.record(room, 'FloorDenied', { AgentSessionId: agentSessionId, Reason: decision.Reason });
            return decision;
        }
        if (kind === 'Backchannel') {
            this.recordBackchannel(room, agentSessionId);
            return decision;
        }
        this.grantTurn(room, agentSessionId, decision.Reason);
        return decision;
    }

    /**
     * Releases the floor held by an agent (it finished speaking). A no-op when the agent is not the
     * current holder, so a late/duplicate release can never steal the floor from another agent.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent releasing the floor.
     * @returns `true` when this call actually freed the floor (the agent was the holder).
     */
    public ReleaseFloor(roomId: string, agentSessionId: string): boolean {
        const room = this.rooms.get(this.key(roomId));
        if (!room || room.floorHolderAgentSessionId === null) {
            return false;
        }
        if (this.key(room.floorHolderAgentSessionId) !== this.key(agentSessionId)) {
            return false; // not the holder — don't free someone else's floor
        }
        room.floorHolderAgentSessionId = null;
        room.floorHeldSinceMs = null;
        this.record(room, 'FloorReleased', { AgentSessionId: agentSessionId });
        return true;
    }

    /**
     * Finishes an agent's turn with what it actually said, so a short acknowledgement that happened to start
     * while the floor was free is not billed against the loop cap as a full turn. Releases the floor when the
     * agent holds it. When the utterance is a backchannel (see
     * {@link import('@memberjunction/ai-bridge-base').IsBackchannel}) the turn is un-counted and logged as a
     * `Backchannel`.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent that finished speaking.
     * @param utterance What it said (text and/or measured duration).
     * @returns Whether the floor was released and whether the utterance was a backchannel.
     */
    public CompleteTurn(roomId: string, agentSessionId: string, utterance: UtteranceShape = {}): TurnCompletion {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return { Released: false, WasBackchannel: false };
        }
        const wasBackchannel = IsBackchannel(utterance);
        const released = this.ReleaseFloor(roomId, agentSessionId);
        if (wasBackchannel && released) {
            room.consecutiveAgentTurns = Math.max(0, room.consecutiveAgentTurns - 1);
            this.recordBackchannel(room, agentSessionId);
        }
        return { Released: released, WasBackchannel: wasBackchannel };
    }

    /**
     * Records a backchannel an agent voiced WITHOUT holding the floor (an overlay on someone else's turn, or
     * on silence). Changes no floor state and never counts toward the loop cap.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent that acknowledged.
     */
    public RecordBackchannel(roomId: string, agentSessionId: string): void {
        const room = this.rooms.get(this.key(roomId));
        if (room) {
            this.recordBackchannel(room, agentSessionId);
        }
    }

    /**
     * Whether a given agent currently holds the floor in a room. An agent that was bumped by a
     * facilitator override or a human checks this to learn it should yield.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent to test.
     * @returns `true` when the agent is the current floor holder.
     */
    public IsFloorHolder(roomId: string, agentSessionId: string): boolean {
        const room = this.rooms.get(this.key(roomId));
        if (!room || room.floorHolderAgentSessionId === null) {
            return false;
        }
        return this.key(room.floorHolderAgentSessionId) === this.key(agentSessionId);
    }

    /**
     * Designates (or re-designates) a room's facilitator at runtime — e.g. when the agent running the
     * Meeting Controls channel is determined after join. The agent must already be a room member.
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent to make facilitator (must be a member).
     * @returns `true` when the facilitator was set; `false` when the room/agent is unknown.
     */
    public SetFacilitator(roomId: string, agentSessionId: string): boolean {
        const room = this.rooms.get(this.key(roomId));
        const member = room?.members.get(this.key(agentSessionId));
        if (!room || !member) {
            return false;
        }
        member.IsFacilitator = true;
        room.facilitatorAgentSessionId = agentSessionId;
        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Humans win.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Reports human speech activity in the room (call it as audio from a human participant arrives; it is
     * cheap and idempotent). The FIRST activity after quiet **preempts**: the floor holder loses the floor
     * (the caller flushes its output through the barge-in path), any pending hand-off is cancelled, and the
     * agent-to-agent loop counter resets. While activity continues — and for the hold window after it stops —
     * every agent is denied.
     *
     * @param roomId The shared room id.
     * @returns Which agent (if any) was preempted, so the caller can flush its queued output.
     */
    public NoteHumanSpeech(roomId: string): HumanPreemption {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return { PreemptedAgentSessionId: null };
        }
        const wasSpeaking = this.isHumanSpeaking(room);
        room.humanSpeakingUntilMs = this.now() + this.humanSpeechHoldMs;
        if (wasSpeaking) {
            return { PreemptedAgentSessionId: null };
        }
        this.record(room, 'HumanSpeech', {});
        room.handoff = null;
        this.resetLoopCounter(room);
        return { PreemptedAgentSessionId: this.preemptHolder(room) };
    }

    /**
     * Reports that the human stopped speaking (an explicit end-of-speech signal). Agents are admitted again
     * immediately instead of waiting out the hold window. Optional — the hold window expires on its own.
     *
     * @param roomId The shared room id.
     */
    public NoteHumanSpeechEnded(roomId: string): void {
        const room = this.rooms.get(this.key(roomId));
        if (room) {
            room.humanSpeakingUntilMs = 0;
        }
    }

    /**
     * Reports a completed human TURN (a final human transcript). Unlike {@link NoteHumanSpeech} this does NOT
     * preempt — a final transcript routinely lands AFTER a quick agent has already started answering, and
     * must not cut that answer — it only resets the agent-to-agent loop counter ("until a human speaks").
     *
     * @param roomId The shared room id.
     */
    public NoteHumanTurn(roomId: string): void {
        const room = this.rooms.get(this.key(roomId));
        if (room) {
            this.resetLoopCounter(room);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Explicit hand-off.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * An agent hands the floor over. Releases the floor if the agent holds it and, when `toAgentSessionId`
     * names another member, reserves the floor for that agent for the hand-off TTL — so nobody else can start
     * in the gap and the two never start at once. With no target the floor simply goes free.
     *
     * A yield from an agent that is not the holder, while another agent holds the floor, is a no-op
     * (`NotHolder`). The hand-off is refused (the floor is still released if held) while a human is speaking
     * or the loop cap is reached: reserving the floor for an agent that would then be denied would only
     * stall the room.
     *
     * @param roomId The shared room id.
     * @param fromAgentSessionId The agent yielding.
     * @param toAgentSessionId The agent that should speak next, when named.
     * @returns Whether the floor was released and who (if anyone) it is now reserved for.
     */
    public YieldFloor(roomId: string, fromAgentSessionId: string, toAgentSessionId?: string): YieldResult {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return { Released: false, HandoffToAgentSessionId: null, Reason: 'UnknownRoom' };
        }
        if (!room.members.has(this.key(fromAgentSessionId))) {
            return { Released: false, HandoffToAgentSessionId: null, Reason: 'NotInRoom' };
        }
        const released = this.ReleaseFloor(roomId, fromAgentSessionId);
        if (!released && room.floorHolderAgentSessionId !== null) {
            // Another agent holds the floor: a non-holder cannot hand it (or reserve it) for anyone.
            return { Released: false, HandoffToAgentSessionId: null, Reason: 'NotHolder' };
        }
        const target = this.resolveHandoffTarget(room, fromAgentSessionId, toAgentSessionId);
        const refusal = toAgentSessionId ? this.handoffRefusal(room, target) : null;
        if (refusal) {
            this.record(room, 'Yielded', { AgentSessionId: fromAgentSessionId, Reason: refusal });
            return { Released: released, HandoffToAgentSessionId: null, Reason: refusal };
        }
        room.handoff = target ? { toAgentSessionId: target, fromAgentSessionId, expiresAtMs: this.now() + this.handoffTtlMs } : null;
        this.record(room, 'Yielded', { AgentSessionId: fromAgentSessionId, ToAgentSessionId: target ?? undefined, Reason: 'Yielded' });
        return { Released: released, HandoffToAgentSessionId: target, Reason: 'Yielded' };
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Observability.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Returns a snapshot of a room's floor state, or `null` when the room is unknown. Read-only — for
     * the realtime dashboard / observer console and tests.
     *
     * @param roomId The room to inspect.
     * @returns The room's floor state snapshot, or `null`.
     */
    public GetRoomState(roomId: string): RoomFloorState | null {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return null;
        }
        const handoff = this.activeHandoff(room);
        return {
            RoomId: room.roomId,
            AgentSessionIds: Array.from(room.members.values()).map(m => m.AgentSessionId),
            FacilitatorAgentSessionId: room.facilitatorAgentSessionId,
            FloorHolderAgentSessionId: room.floorHolderAgentSessionId,
            FloorHeldSinceMs: room.floorHeldSinceMs,
            HumanSpeaking: this.isHumanSpeaking(room),
            PendingHandoffToAgentSessionId: handoff ? handoff.toAgentSessionId : null,
            ConsecutiveAgentTurns: room.consecutiveAgentTurns,
            MaxConsecutiveAgentTurns: this.capFor(room),
            LoopCapReached: this.isLoopCapped(room),
            BackchannelCount: room.backchannelCount,
            RecentEvents: room.events.slice(),
        };
    }

    /** The ids of all rooms the coordinator currently tracks (those with ≥1 agent member). */
    public get RoomIds(): string[] {
        return Array.from(this.rooms.values()).map(r => r.roomId);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Internals — decisions.
    // ──────────────────────────────────────────────────────────────────────────────

    /** The `Turn` decision, after membership and the backchannel short-circuit have been handled. */
    private decideTurn(room: RoomRecord, agentSessionId: string): FloorDecision {
        if (this.isHumanSpeaking(room)) {
            return { Granted: false, Reason: 'HumanSpeaking' };
        }
        if (this.isLoopCapped(room)) {
            return { Granted: false, Reason: 'LoopCapReached' };
        }
        const handoff = this.activeHandoff(room);
        if (handoff) {
            const reserved = this.decideUnderHandoff(room, handoff, agentSessionId);
            if (reserved) {
                return reserved;
            }
        }
        return this.decideByFloor(room, agentSessionId);
    }

    /** While a hand-off is pending: the target gets the floor, everyone else is held back (the facilitator may still cut in). */
    private decideUnderHandoff(room: RoomRecord, handoff: PendingHandoff, agentSessionId: string): FloorDecision | null {
        if (this.key(handoff.toAgentSessionId) === this.key(agentSessionId)) {
            return { Granted: true, Reason: 'HandoffGranted' };
        }
        if (this.isFacilitator(room, agentSessionId)) {
            return null; // facilitator falls through to the ordinary floor rules
        }
        return { Granted: false, Reason: 'ReservedForHandoff' };
    }

    /** The plain floor rules: free / already holder / facilitator override / held by another. */
    private decideByFloor(room: RoomRecord, agentSessionId: string): FloorDecision {
        const holder = room.floorHolderAgentSessionId;
        if (holder === null) {
            return { Granted: true, Reason: 'FloorFree' };
        }
        if (this.key(holder) === this.key(agentSessionId)) {
            return { Granted: true, Reason: 'AlreadyHolder' };
        }
        if (this.isFacilitator(room, agentSessionId)) {
            return { Granted: true, Reason: 'FacilitatorOverride' };
        }
        return { Granted: false, Reason: 'HeldByOtherAgent' };
    }

    /** Resolves a yield's target to a member's id, or `null` when none was named or it is the yielder / not a member. */
    private resolveHandoffTarget(room: RoomRecord, fromAgentSessionId: string, toAgentSessionId?: string): string | null {
        if (!toAgentSessionId || this.key(toAgentSessionId) === this.key(fromAgentSessionId)) {
            return null;
        }
        return room.members.get(this.key(toAgentSessionId))?.AgentSessionId ?? null;
    }

    /** Why a requested hand-off cannot be honoured right now, or `null` when it can. */
    private handoffRefusal(room: RoomRecord, target: string | null): YieldReason | null {
        if (target === null) {
            return 'UnknownTarget';
        }
        if (this.isHumanSpeaking(room)) {
            return 'HumanSpeaking';
        }
        return this.isLoopCapped(room) ? 'LoopCapReached' : null;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Internals — state transitions.
    // ──────────────────────────────────────────────────────────────────────────────

    /** Makes an agent the floor holder for a granted `Turn`, counting it toward the loop cap when it starts a new turn. */
    private grantTurn(room: RoomRecord, agentSessionId: string, reason: FloorDecisionReason): void {
        const isNewTurn = room.floorHolderAgentSessionId === null || this.key(room.floorHolderAgentSessionId) !== this.key(agentSessionId);
        if (room.handoff && this.key(room.handoff.toAgentSessionId) === this.key(agentSessionId)) {
            room.handoff = null; // consumed
        }
        if (!isNewTurn) {
            return; // already-holder re-assert: keep the original since-stamp, don't double count
        }
        room.floorHolderAgentSessionId = agentSessionId;
        room.floorHeldSinceMs = this.now();
        room.consecutiveAgentTurns++;
        this.record(room, 'FloorGranted', { AgentSessionId: agentSessionId, Reason: reason });
        if (room.consecutiveAgentTurns === this.capFor(room)) {
            this.record(room, 'LoopCapReached', { AgentSessionId: agentSessionId });
        }
    }

    /** Takes the floor from its holder because a human started talking; returns the preempted agent, if any. */
    private preemptHolder(room: RoomRecord): string | null {
        const holder = room.floorHolderAgentSessionId;
        if (holder === null) {
            return null;
        }
        room.floorHolderAgentSessionId = null;
        room.floorHeldSinceMs = null;
        this.record(room, 'HumanPreempted', { AgentSessionId: holder });
        return holder;
    }

    /** A human spoke: agents may take turns again. */
    private resetLoopCounter(room: RoomRecord): void {
        room.consecutiveAgentTurns = 0;
    }

    private recordBackchannel(room: RoomRecord, agentSessionId: string): void {
        room.backchannelCount++;
        this.record(room, 'Backchannel', { AgentSessionId: agentSessionId });
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Internals — derived state.
    // ──────────────────────────────────────────────────────────────────────────────

    private isHumanSpeaking(room: RoomRecord): boolean {
        return this.now() < room.humanSpeakingUntilMs;
    }

    private capFor(room: RoomRecord): number {
        return room.maxConsecutiveAgentTurns ?? this.maxConsecutiveAgentTurns;
    }

    private isLoopCapped(room: RoomRecord): boolean {
        return room.consecutiveAgentTurns >= this.capFor(room);
    }

    /** The pending hand-off, dropping it first when its TTL has lapsed. */
    private activeHandoff(room: RoomRecord): PendingHandoff | null {
        if (room.handoff && this.now() >= room.handoff.expiresAtMs) {
            room.handoff = null;
        }
        return room.handoff;
    }

    /** Appends to the room's bounded event log. */
    private record(room: RoomRecord, type: RoomTurnEventType, detail: Partial<Omit<RoomTurnEvent, 'Seq' | 'AtMs' | 'Type'>>): void {
        room.events.push({ Seq: room.nextSeq++, AtMs: this.now(), Type: type, ...detail });
        while (room.events.length > MAX_ROOM_EVENTS) {
            room.events.shift();
        }
    }

    /** Gets the room record, creating an empty one (preserving the caller's casing) on first use. */
    private ensureRoom(roomId: string): RoomRecord {
        const k = this.key(roomId);
        let room = this.rooms.get(k);
        if (!room) {
            room = {
                roomId,
                members: new Map<string, RoomAgentMembership>(),
                facilitatorAgentSessionId: null,
                floorHolderAgentSessionId: null,
                floorHeldSinceMs: null,
                humanSpeakingUntilMs: 0,
                handoff: null,
                consecutiveAgentTurns: 0,
                maxConsecutiveAgentTurns: null,
                backchannelCount: 0,
                nextSeq: 1,
                events: [],
            };
            this.rooms.set(k, room);
        }
        return room;
    }

    /** Whether an agent is the room's facilitator (by membership flag or the room's facilitator slot). */
    private isFacilitator(room: RoomRecord, agentSessionId: string): boolean {
        const member = room.members.get(this.key(agentSessionId));
        if (member?.IsFacilitator) {
            return true;
        }
        return room.facilitatorAgentSessionId !== null && this.key(room.facilitatorAgentSessionId) === this.key(agentSessionId);
    }

    /** Normalizes an id for case-insensitive map keying (UUIDs differ in case across DB platforms). */
    private key(id: string): string {
        return id.trim().toLowerCase();
    }
}

/** `value` when it is a positive finite number, otherwise `fallback`. */
function positiveOr(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
