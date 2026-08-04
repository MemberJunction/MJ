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
 *    call on a specific agent. See {@link RegisterRoom}'s `facilitatorAgentSessionId` and
 *    {@link CanTakeFloor}'s facilitator path.
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
 * One agent's membership in a shared room, as the coordinator tracks it.
 */
export interface RoomAgentMembership {
    /** The `MJ: AI Agent Sessions` row id of this agent's bridge session in the room. */
    AgentSessionId: string;

    /** Whether this agent is the room's designated facilitator (may override the floor to arbitrate). */
    IsFacilitator: boolean;
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
}

/** The reason a {@link MultiAgentRoomCoordinator.CanTakeFloor} request was granted or denied. */
export type FloorDecisionReason =
    | 'FloorFree'
    | 'AlreadyHolder'
    | 'FacilitatorOverride'
    | 'HeldByOtherAgent'
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
    /** Agent session id (lowercased) → membership. */
    readonly members: Map<string, RoomAgentMembership>;
    facilitatorAgentSessionId: string | null;
    floorHolderAgentSessionId: string | null;
    floorHeldSinceMs: number | null;
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
     * cleared. When the last member leaves, the room record is discarded.
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
     * runs before generating speech. Returns `true` only when no OTHER agent holds the floor, with the
     * facilitator exception:
     *
     * - **Floor free** → granted (`FloorFree`).
     * - **The requester already holds it** → granted (`AlreadyHolder`) — re-asserting is fine.
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
     * @param agentSessionId The agent asking to speak.
     * @returns The floor decision (granted + reason).
     */
    public CanTakeFloor(roomId: string, agentSessionId: string): FloorDecision {
        const room = this.rooms.get(this.key(roomId));
        if (!room) {
            return { Granted: false, Reason: 'UnknownRoom' };
        }
        if (!room.members.has(this.key(agentSessionId))) {
            return { Granted: false, Reason: 'NotInRoom' };
        }
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

    /**
     * Atomically attempts to claim the floor for an agent: runs {@link CanTakeFloor} and, when granted,
     * records the agent as the floor holder (stamping the take time) and returns the decision. When a
     * **facilitator** overrides a sitting holder, the holder is replaced — the facilitator now holds the
     * floor (the prior holder should observe this via {@link IsFloorHolder} on its next check and yield).
     *
     * @param roomId The shared room id.
     * @param agentSessionId The agent claiming the floor.
     * @returns The decision; on `Granted` the agent now holds the floor.
     */
    public TakeFloor(roomId: string, agentSessionId: string): FloorDecision {
        const decision = this.CanTakeFloor(roomId, agentSessionId);
        if (!decision.Granted) {
            return decision;
        }
        const room = this.rooms.get(this.key(roomId))!;
        // Already-holder re-assert: keep the original since-stamp; otherwise stamp now.
        if (room.floorHolderAgentSessionId === null || this.key(room.floorHolderAgentSessionId) !== this.key(agentSessionId)) {
            room.floorHolderAgentSessionId = agentSessionId;
            room.floorHeldSinceMs = this.now();
        }
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
        return true;
    }

    /**
     * Whether a given agent currently holds the floor in a room. An agent that was bumped by a
     * facilitator override checks this to learn it should yield.
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
        return {
            RoomId: room.roomId,
            AgentSessionIds: Array.from(room.members.values()).map(m => m.AgentSessionId),
            FacilitatorAgentSessionId: room.facilitatorAgentSessionId,
            FloorHolderAgentSessionId: room.floorHolderAgentSessionId,
            FloorHeldSinceMs: room.floorHeldSinceMs,
        };
    }

    /** The ids of all rooms the coordinator currently tracks (those with ≥1 agent member). */
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
                members: new Map<string, RoomAgentMembership>(),
                facilitatorAgentSessionId: null,
                floorHolderAgentSessionId: null,
                floorHeldSinceMs: null,
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
