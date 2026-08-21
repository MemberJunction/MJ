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
 * 1. **Floor arbitration** — at most ONE member "holds the floor" (is speaking) in a room at any instant.
 *    An agent calls {@link CanTakeFloor} before generating speech; it returns `true` only if no OTHER
 *    member currently holds the floor. {@link TakeFloor} grants it; {@link ReleaseFloor} frees it.
 * 2. **Passive-default loop safety** — combined with passive turn-taking (an agent speaks only when
 *    *addressed by name*, per {@link import('@memberjunction/ai-bridge-base').TurnTakingPolicy}), two
 *    agents in a room never loop: neither speaks unless a human calls on it, and even then only one holds
 *    the floor. This coordinator is the SECOND guard — passivity prevents the loop, the floor prevents
 *    the overlap.
 * 3. **Facilitator override** — an optional designated **facilitator** agent (one that runs the Meeting
 *    Controls channel) may be granted the floor even while another agent holds it, so it can arbitrate /
 *    call on a specific agent. See {@link RegisterRoom}'s `facilitatorAgentSessionId` and
 *    {@link CanTakeFloor}'s facilitator path.
 * 4. **Humans hold the floor too** — a room member is either an AGENT session or a HUMAN user
 *    ({@link RoomParticipantRef}), because the thing that actually needs the floor is "whoever is
 *    speaking", and half the time that's a person. A human who takes the floor (a coach stepping into an
 *    agent's seat, a host taking over) makes every agent — **facilitator included** — yield: see
 *    {@link CanTakeFloor}'s `HeldByHuman` / `HumanOverride` paths. The asymmetry is deliberate and
 *    reflects the media plane rather than a policy preference: the coordinator can silence an agent (it
 *    gates the trigger that makes it speak) but it cannot mute a person, whose voice is already in the
 *    room's mix. Denying a human the floor would only make the state WRONG, so a human's claim always
 *    wins and the agents are told to stand down.
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
 * This class is **pure and synchronous** — no I/O, no entities, no clock dependence (an optional injected
 * clock only stamps `since` for observability). Every decision is a deterministic function of the
 * in-memory room/floor state, so it is exhaustively unit-testable with no network, DB, or real session.
 */

/**
 * WHO a room member is — the floor is held by **a speaker**, and a speaker is either an agent session or
 * a person. Discriminated so the two identities can never be confused: an agent is keyed by its
 * `MJ: AI Agent Sessions` row id, a human by its `MJ: Users` row id (the same `UserID` MJ persists on
 * `MJ: AI Agent Session Bridge Participants`). A human participant has NO agent-session id, which is
 * exactly why floor membership can't be keyed on one.
 */
export type RoomParticipantRef =
    | {
          Kind: 'Agent';
          /** The `MJ: AI Agent Sessions` row id of this agent's bridge session in the room. */
          AgentSessionId: string;
      }
    | {
          Kind: 'Human';
          /** The `MJ: Users` row id of the person in the room. */
          UserId: string;
      };

/**
 * What the participant-taking methods accept. A **bare string is an agent session id** — the pre-human
 * shape, kept so every existing caller (the engine's `RegisterRoomParticipant` / floor calls) keeps
 * compiling and behaving identically. Pass a {@link RoomParticipantRef} to name a human.
 */
export type RoomParticipantSelector = string | RoomParticipantRef;

/** Builds an agent {@link RoomParticipantRef} from an agent-session id. */
export function AgentParticipant(agentSessionId: string): RoomParticipantRef {
    return { Kind: 'Agent', AgentSessionId: agentSessionId };
}

/** Builds a human {@link RoomParticipantRef} from an MJ user id. */
export function HumanParticipant(userId: string): RoomParticipantRef {
    return { Kind: 'Human', UserId: userId };
}

/**
 * The stable map/identity key for a participant — kind-prefixed so an agent session and a user that
 * happen to share a UUID are still distinct members, and lowercased because UUID casing differs across
 * DB platforms.
 */
export function RoomParticipantKey(participant: RoomParticipantRef): string {
    const id = participant.Kind === 'Agent' ? participant.AgentSessionId : participant.UserId;
    return `${participant.Kind.toLowerCase()}:${id.trim().toLowerCase()}`;
}

/**
 * One participant's membership in a shared room, as the coordinator tracks it.
 */
export interface RoomParticipantMembership {
    /** Who this member is — an agent session or a human user. */
    Participant: RoomParticipantRef;

    /** Whether this member is the room's designated facilitator (may override the floor to arbitrate). */
    IsFacilitator: boolean;
}

/**
 * @deprecated The pre-human name for {@link RoomParticipantMembership} — membership is no longer
 * agent-only. Kept as an alias so existing imports keep resolving; use the new name.
 */
export type RoomAgentMembership = RoomParticipantMembership;

/**
 * The live floor state of a room, returned by {@link MultiAgentRoomCoordinator.GetRoomState} for
 * observability and tests.
 */
export interface RoomFloorState {
    /** The room's external id (the shared external connection id / ConversationID all agents key on). */
    RoomId: string;

    /** Every member currently in the room — agents AND humans — in registration order. */
    Participants: RoomParticipantRef[];

    /** The agent session ids currently in the room (humans excluded — the agent projection of {@link RoomFloorState.Participants}). */
    AgentSessionIds: string[];

    /** The room's facilitator (agent or human), when one is designated; otherwise `null`. */
    Facilitator: RoomParticipantRef | null;

    /** The facilitator's agent session id — `null` when there is no facilitator OR the facilitator is a human. */
    FacilitatorAgentSessionId: string | null;

    /** Who currently holds the floor (is speaking), or `null` when the floor is free. */
    FloorHolder: RoomParticipantRef | null;

    /** The floor holder's agent session id — `null` when the floor is free OR a HUMAN holds it (read {@link RoomFloorState.FloorHolder} for that case). */
    FloorHolderAgentSessionId: string | null;

    /** Epoch-ms the current floor holder took the floor, or `null` when the floor is free. */
    FloorHeldSinceMs: number | null;
}

/** The reason a {@link MultiAgentRoomCoordinator.CanTakeFloor} request was granted or denied. */
export type FloorDecisionReason =
    | 'FloorFree'
    | 'AlreadyHolder'
    | 'FacilitatorOverride'
    | 'HumanOverride'
    | 'HeldByOtherAgent'
    | 'HeldByHuman'
    | 'NotInRoom'
    | 'UnknownRoom';

/** The outcome of a floor request — whether the agent may speak, and why. */
export interface FloorDecision {
    /** Whether the requesting agent may take the floor and speak now. */
    Granted: boolean;

    /** The structured reason for the decision (useful for observability + tests). */
    Reason: FloorDecisionReason;
}

/** Internal per-room state held by the coordinator. */
interface RoomRecord {
    readonly roomId: string;
    /** {@link RoomParticipantKey} → membership (agents and humans in one roster). */
    readonly members: Map<string, RoomParticipantMembership>;
    facilitator: RoomParticipantRef | null;
    floorHolder: RoomParticipantRef | null;
    floorHeldSinceMs: number | null;
}

/**
 * Coordinates speaking discipline among the members sharing one room — agent sessions and the humans
 * with them. Construct one per process (the engine holds a single instance) and key everything on the
 * **room id**: the shared external connection id (or ConversationID) all co-located members belong to.
 *
 * The coordinator is additive: a lone agent in a room finds the floor always free, so arbitration costs
 * it nothing. It starts to bite only when a room holds two or more would-be speakers — several agents, or
 * one agent and a human who has taken a seat.
 */
export class MultiAgentRoomCoordinator {
    /** Room id (lowercased) → room record. */
    private readonly rooms = new Map<string, RoomRecord>();

    /** Injected clock for floor-held timestamps; defaults to `Date.now`. */
    private readonly now: () => number;

    /**
     * @param now Optional injected clock returning epoch-ms (for `FloorHeldSince` stamps). Defaults to
     *   `Date.now`. Tests inject a controllable function for determinism.
     */
    constructor(now: () => number = Date.now) {
        this.now = now;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Membership.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Registers a participant in a shared room, creating the room on first member. Idempotent —
     * re-registering the same participant updates its facilitator flag without disturbing the floor.
     * Designating a member as the facilitator records it as the room's arbiter; only one facilitator is
     * tracked (the latest designation wins, mirroring "one chair").
     *
     * Pass a bare **string** for the pre-human shape (an agent session id); pass a
     * {@link RoomParticipantRef} — e.g. `HumanParticipant(userId)` — to seat a person. Role mapping stays
     * with the caller: an app that persists Host/CoHost/Participant on
     * `MJ: AI Agent Session Bridge Participants` decides which of those becomes `isFacilitator` here, so
     * this module never learns an entity's enum.
     *
     * @param roomId The shared room id (external connection id / ConversationID) all members key on.
     * @param participant The agent session id (string) or participant ref joining the room.
     * @param isFacilitator Whether this member is the room's facilitator (may override the floor).
     */
    public RegisterRoomParticipant(roomId: string, participant: RoomParticipantSelector, isFacilitator = false): void {
        const room = this.ensureRoom(roomId);
        const ref = this.toRef(participant);
        room.members.set(RoomParticipantKey(ref), { Participant: ref, IsFacilitator: isFacilitator });
        if (isFacilitator) {
            room.facilitator = ref;
        }
    }

    /**
     * Unregisters a participant from a room (the agent left / its bridge stopped, or the person left the
     * call). If the leaving member held the floor, the floor is released. If it was the facilitator, the
     * facilitator slot is cleared. When the last member leaves, the room record is discarded — so whoever
     * registers a human is responsible for unregistering it, exactly as the engine does for agents.
     *
     * @param roomId The room the member is leaving.
     * @param participant The agent session id (string) or participant ref leaving.
     */
    public UnregisterRoomParticipant(roomId: string, participant: RoomParticipantSelector): void {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return;
        }
        const ref = this.toRef(participant);
        const memberKey = RoomParticipantKey(ref);
        room.members.delete(memberKey);

        if (room.floorHolder && RoomParticipantKey(room.floorHolder) === memberKey) {
            room.floorHolder = null;
            room.floorHeldSinceMs = null;
        }
        if (room.facilitator && RoomParticipantKey(room.facilitator) === memberKey) {
            room.facilitator = null;
        }
        if (room.members.size === 0) {
            this.rooms.delete(this.key(roomId));
        }
    }

    /**
     * Whether a room currently has more than one AGENT session — i.e. inter-agent floor arbitration is
     * meaningful. Single-agent rooms can skip the floor dance entirely.
     *
     * Humans are deliberately NOT counted: one agent talking with one person is a 1:1 call, and callers
     * use this to decide whether to re-gate an agent into meeting mode. Counting the human would flip a
     * plain 1:1 into "multi-agent" and gate the agent behind an addressed-matcher it never needed.
     *
     * @param roomId The room to check.
     * @returns `true` when 2+ agents share the room.
     */
    public IsMultiAgentRoom(roomId: string): boolean {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return false;
        }
        let agents = 0;
        for (const m of room.members.values()) {
            if (m.Participant.Kind === 'Agent') {
                agents++;
            }
        }
        return agents > 1;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Floor arbitration.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Asks whether a member MAY take the floor (speak) now — the read-only arbitration check an agent
     * runs before generating speech, and the same check a human takeover runs before claiming the seat.
     * Granted only when nobody else is speaking, with the facilitator and human exceptions:
     *
     * - **Floor free** → granted (`FloorFree`).
     * - **The requester already holds it** → granted (`AlreadyHolder`) — re-asserting is fine.
     * - **The requester is a HUMAN** → granted (`HumanOverride`) whoever holds it. A person's voice is
     *   already in the room's mix; refusing them would only make this state a lie.
     * - **A HUMAN holds it** (and the requester is an agent) → denied (`HeldByHuman`) — including for the
     *   facilitator, which overrides agents, not people. This is the structural reason agents yield to a
     *   human who has taken a seat.
     * - **The requester is the facilitator** → granted (`FacilitatorOverride`) even if another agent
     *   holds it, so the facilitator can cut in to arbitrate / call on a specific agent.
     * - **Another (non-facilitator) agent holds it** → denied (`HeldByOtherAgent`).
     * - **The requester is not a member of the room** → denied (`NotInRoom`).
     * - **The room is unknown** → denied (`UnknownRoom`).
     *
     * This is purely advisory until {@link TakeFloor} actually claims the floor — keeping the check
     * (read) and the claim (write) separate lets a caller test-then-act atomically within its own turn.
     *
     * @param roomId The shared room id.
     * @param participant The agent session id (string) or participant ref asking to speak.
     * @returns The floor decision (granted + reason).
     */
    public CanTakeFloor(roomId: string, participant: RoomParticipantSelector): FloorDecision {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return { Granted: false, Reason: 'UnknownRoom' };
        }
        const ref = this.toRef(participant);
        if (!room.members.has(RoomParticipantKey(ref))) {
            return { Granted: false, Reason: 'NotInRoom' };
        }
        const holder = room.floorHolder;
        if (holder === null) {
            return { Granted: true, Reason: 'FloorFree' };
        }
        if (RoomParticipantKey(holder) === RoomParticipantKey(ref)) {
            return { Granted: true, Reason: 'AlreadyHolder' };
        }
        if (ref.Kind === 'Human') {
            return { Granted: true, Reason: 'HumanOverride' };
        }
        if (holder.Kind === 'Human') {
            return { Granted: false, Reason: 'HeldByHuman' };
        }
        if (this.isFacilitator(room, ref)) {
            return { Granted: true, Reason: 'FacilitatorOverride' };
        }
        return { Granted: false, Reason: 'HeldByOtherAgent' };
    }

    /**
     * Atomically attempts to claim the floor for a member: runs {@link CanTakeFloor} and, when granted,
     * records the member as the floor holder (stamping the take time) and returns the decision. When a
     * **facilitator** or a **human** overrides a sitting holder, the holder is replaced — the new holder
     * now has the floor (the prior holder should observe this via {@link IsFloorHolder} on its next check
     * and yield).
     *
     * @param roomId The shared room id.
     * @param participant The agent session id (string) or participant ref claiming the floor.
     * @returns The decision; on `Granted` the member now holds the floor.
     */
    public TakeFloor(roomId: string, participant: RoomParticipantSelector): FloorDecision {
        const decision = this.CanTakeFloor(roomId, participant);
        if (!decision.Granted) {
            return decision;
        }
        const room = this.rooms.get(this.key(roomId))!;
        const ref = this.toRef(participant);
        // Already-holder re-assert: keep the original since-stamp; otherwise stamp now.
        if (room.floorHolder === null || RoomParticipantKey(room.floorHolder) !== RoomParticipantKey(ref)) {
            room.floorHolder = ref;
            room.floorHeldSinceMs = this.now();
        }
        return decision;
    }

    /**
     * Releases the floor held by a member (it finished speaking / the human handed the seat back). A
     * no-op when the member is not the current holder, so a late/duplicate release can never steal the
     * floor from someone else.
     *
     * @param roomId The shared room id.
     * @param participant The agent session id (string) or participant ref releasing the floor.
     * @returns `true` when this call actually freed the floor (the member was the holder).
     */
    public ReleaseFloor(roomId: string, participant: RoomParticipantSelector): boolean {
        const room = this.rooms.get(this.key(roomId));
        if (!room || room.floorHolder === null) {
            return false;
        }
        if (RoomParticipantKey(room.floorHolder) !== RoomParticipantKey(this.toRef(participant))) {
            return false; // not the holder — don't free someone else's floor
        }
        room.floorHolder = null;
        room.floorHeldSinceMs = null;
        return true;
    }

    /**
     * Whether a given member currently holds the floor in a room. An agent that was bumped by a
     * facilitator override — or by a human taking its seat — checks this to learn it should yield.
     *
     * @param roomId The shared room id.
     * @param participant The agent session id (string) or participant ref to test.
     * @returns `true` when the member is the current floor holder.
     */
    public IsFloorHolder(roomId: string, participant: RoomParticipantSelector): boolean {
        const room = this.rooms.get(this.key(roomId));
        if (!room || room.floorHolder === null) {
            return false;
        }
        return RoomParticipantKey(room.floorHolder) === RoomParticipantKey(this.toRef(participant));
    }

    /**
     * Designates (or re-designates) a room's facilitator at runtime — e.g. when the agent running the
     * Meeting Controls channel is determined after join, or when a human host takes the chair. The
     * member must already be registered in the room.
     *
     * @param roomId The shared room id.
     * @param participant The agent session id (string) or participant ref to make facilitator (must be a member).
     * @returns `true` when the facilitator was set; `false` when the room/member is unknown.
     */
    public SetFacilitator(roomId: string, participant: RoomParticipantSelector): boolean {
        const room = this.rooms.get(this.key(roomId));
        const ref = this.toRef(participant);
        const member = room?.members.get(RoomParticipantKey(ref));
        if (!room || !member) {
            return false;
        }
        member.IsFacilitator = true;
        room.facilitator = ref;
        return true;
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
        const participants = Array.from(room.members.values()).map(m => m.Participant);
        return {
            RoomId: room.roomId,
            Participants: participants,
            AgentSessionIds: participants.filter(p => p.Kind === 'Agent').map(p => p.AgentSessionId),
            Facilitator: room.facilitator,
            FacilitatorAgentSessionId: this.agentIdOf(room.facilitator),
            FloorHolder: room.floorHolder,
            FloorHolderAgentSessionId: this.agentIdOf(room.floorHolder),
            FloorHeldSinceMs: room.floorHeldSinceMs,
        };
    }

    /** The ids of all rooms the coordinator currently tracks (those with ≥1 member). */
    public get RoomIds(): string[] {
        return Array.from(this.rooms.values()).map(r => r.roomId);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Internals.
    // ──────────────────────────────────────────────────────────────────────────────

    /** Gets the room record, creating an empty one (preserving the caller's casing) on first use. */
    private ensureRoom(roomId: string): RoomRecord {
        const k = this.key(roomId);
        let room = this.rooms.get(k);
        if (!room) {
            room = {
                roomId,
                members: new Map<string, RoomParticipantMembership>(),
                facilitator: null,
                floorHolder: null,
                floorHeldSinceMs: null,
            };
            this.rooms.set(k, room);
        }
        return room;
    }

    /** Whether a member is the room's facilitator (by membership flag or the room's facilitator slot). */
    private isFacilitator(room: RoomRecord, participant: RoomParticipantRef): boolean {
        const memberKey = RoomParticipantKey(participant);
        const member = room.members.get(memberKey);
        if (member?.IsFacilitator) {
            return true;
        }
        return room.facilitator !== null && RoomParticipantKey(room.facilitator) === memberKey;
    }

    /**
     * Normalizes a {@link RoomParticipantSelector} to a ref. A bare string is an AGENT session id — the
     * pre-human calling shape every existing caller still uses.
     */
    private toRef(participant: RoomParticipantSelector): RoomParticipantRef {
        return typeof participant === 'string' ? AgentParticipant(participant) : participant;
    }

    /** The agent-session id of a ref for the back-compat `*AgentSessionId` projections; `null` for a human/none. */
    private agentIdOf(participant: RoomParticipantRef | null): string | null {
        return participant !== null && participant.Kind === 'Agent' ? participant.AgentSessionId : null;
    }

    /** Normalizes an id for case-insensitive map keying (UUIDs differ in case across DB platforms). */
    private key(id: string): string {
        return id.trim().toLowerCase();
    }
}
