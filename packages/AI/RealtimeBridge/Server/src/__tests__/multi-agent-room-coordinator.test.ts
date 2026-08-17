import { describe, it, expect, beforeEach } from 'vitest';
import { MultiAgentRoomCoordinator, AgentParticipant, HumanParticipant, RoomParticipantKey } from '../multi-agent-room-coordinator';

const ROOM = 'room-alpha';
const ROOM_B = 'room-beta';
const SAGE = 'sess-sage';
const DEMO = 'sess-demo';
const SCOUT = 'sess-scout';

/** A human room member — the coach who takes an agent's seat. */
const COACH = HumanParticipant('user-coach');
/** A second human, for the "two people in the room" cases. */
const HOST = HumanParticipant('user-host');

let coord: MultiAgentRoomCoordinator;
beforeEach(() => {
    coord = new MultiAgentRoomCoordinator();
});

// ──────────────────────────────────────────────────────────────────────────────
// Membership.
// ──────────────────────────────────────────────────────────────────────────────

describe('MultiAgentRoomCoordinator — membership', () => {
    it('creates a room on first participant and tracks members', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        const state = coord.GetRoomState(ROOM);
        expect(state).not.toBeNull();
        expect(state!.AgentSessionIds).toEqual([SAGE]);
        expect(coord.IsMultiAgentRoom(ROOM)).toBe(false);
    });

    it('flags a room as multi-agent once 2+ agents join', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, DEMO);
        expect(coord.IsMultiAgentRoom(ROOM)).toBe(true);
    });

    it('discards the room record when the last member leaves', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.UnregisterRoomParticipant(ROOM, SAGE);
        expect(coord.GetRoomState(ROOM)).toBeNull();
        expect(coord.RoomIds).not.toContain(ROOM);
    });

    it('keeps room casing while keying case-insensitively (cross-platform UUID safety)', () => {
        coord.RegisterRoomParticipant('Room-Alpha', 'Sess-Sage');
        // Look up with different casing.
        expect(coord.CanTakeFloor('room-alpha', 'sess-sage').Granted).toBe(true);
        expect(coord.GetRoomState('ROOM-ALPHA')!.AgentSessionIds).toEqual(['Sess-Sage']);
    });

    it('keeps distinct rooms isolated', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM_B, DEMO);
        coord.TakeFloor(ROOM, SAGE);
        // Floor in ROOM does not affect ROOM_B.
        expect(coord.CanTakeFloor(ROOM_B, DEMO).Granted).toBe(true);
        expect(coord.GetRoomState(ROOM)!.FloorHolderAgentSessionId).toBe(SAGE);
        expect(coord.GetRoomState(ROOM_B)!.FloorHolderAgentSessionId).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Floor arbitration — one speaker at a time.
// ──────────────────────────────────────────────────────────────────────────────

describe('MultiAgentRoomCoordinator — floor arbitration', () => {
    beforeEach(() => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, DEMO);
    });

    it('grants the floor when it is free', () => {
        const d = coord.CanTakeFloor(ROOM, SAGE);
        expect(d).toEqual({ Granted: true, Reason: 'FloorFree' });
    });

    it('one agent at a time: second agent is denied while first holds the floor', () => {
        coord.TakeFloor(ROOM, SAGE);
        const d = coord.CanTakeFloor(ROOM, DEMO);
        expect(d).toEqual({ Granted: false, Reason: 'HeldByOtherAgent' });
        expect(coord.TakeFloor(ROOM, DEMO).Granted).toBe(false);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        expect(coord.IsFloorHolder(ROOM, DEMO)).toBe(false);
    });

    it('releasing the floor frees it for the other agent', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.ReleaseFloor(ROOM, SAGE)).toBe(true);
        expect(coord.CanTakeFloor(ROOM, DEMO)).toEqual({ Granted: true, Reason: 'FloorFree' });
        expect(coord.TakeFloor(ROOM, DEMO).Granted).toBe(true);
        expect(coord.IsFloorHolder(ROOM, DEMO)).toBe(true);
    });

    it('the holder re-asserting is granted as AlreadyHolder (idempotent)', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.CanTakeFloor(ROOM, SAGE)).toEqual({ Granted: true, Reason: 'AlreadyHolder' });
        // Re-take keeps the original since-stamp.
        const since1 = coord.GetRoomState(ROOM)!.FloorHeldSinceMs;
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.GetRoomState(ROOM)!.FloorHeldSinceMs).toBe(since1);
    });

    it('a non-holder release is a no-op and cannot steal the floor', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.ReleaseFloor(ROOM, DEMO)).toBe(false);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
    });

    it('denies a non-member and an unknown room', () => {
        expect(coord.CanTakeFloor(ROOM, SCOUT)).toEqual({ Granted: false, Reason: 'NotInRoom' });
        expect(coord.CanTakeFloor('no-such-room', SAGE)).toEqual({ Granted: false, Reason: 'UnknownRoom' });
    });

    it('stamps FloorHeldSince via the injected clock', () => {
        let t = 1000;
        const c = new MultiAgentRoomCoordinator(() => t);
        c.RegisterRoomParticipant(ROOM, SAGE);
        t = 5000;
        c.TakeFloor(ROOM, SAGE);
        expect(c.GetRoomState(ROOM)!.FloorHeldSinceMs).toBe(5000);
    });

    it('releasing the floor when a leaving agent held it (via Unregister)', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.UnregisterRoomParticipant(ROOM, SAGE);
        // Floor freed; DEMO can now take it.
        expect(coord.CanTakeFloor(ROOM, DEMO)).toEqual({ Granted: true, Reason: 'FloorFree' });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Facilitator override.
// ──────────────────────────────────────────────────────────────────────────────

describe('MultiAgentRoomCoordinator — facilitator override', () => {
    it('a facilitator can take the floor even while another agent holds it', () => {
        coord.RegisterRoomParticipant(ROOM, DEMO);
        coord.RegisterRoomParticipant(ROOM, SAGE, /* isFacilitator */ true);
        coord.TakeFloor(ROOM, DEMO);
        // Sage (facilitator) overrides.
        const d = coord.CanTakeFloor(ROOM, SAGE);
        expect(d).toEqual({ Granted: true, Reason: 'FacilitatorOverride' });
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        // The bumped holder learns it must yield.
        expect(coord.IsFloorHolder(ROOM, DEMO)).toBe(false);
    });

    it('a non-facilitator never overrides a sitting holder', () => {
        coord.RegisterRoomParticipant(ROOM, DEMO);
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.TakeFloor(ROOM, DEMO);
        expect(coord.CanTakeFloor(ROOM, SAGE).Reason).toBe('HeldByOtherAgent');
    });

    it('SetFacilitator designates the arbiter at runtime', () => {
        coord.RegisterRoomParticipant(ROOM, DEMO);
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.TakeFloor(ROOM, DEMO);
        expect(coord.CanTakeFloor(ROOM, SAGE).Granted).toBe(false);
        expect(coord.SetFacilitator(ROOM, SAGE)).toBe(true);
        expect(coord.CanTakeFloor(ROOM, SAGE)).toEqual({ Granted: true, Reason: 'FacilitatorOverride' });
        expect(coord.GetRoomState(ROOM)!.FacilitatorAgentSessionId).toBe(SAGE);
    });

    it('SetFacilitator fails for an unknown room/agent', () => {
        expect(coord.SetFacilitator(ROOM, SAGE)).toBe(false);
    });

    it('clears the facilitator slot when the facilitator leaves', () => {
        coord.RegisterRoomParticipant(ROOM, DEMO);
        coord.RegisterRoomParticipant(ROOM, SAGE, true);
        coord.UnregisterRoomParticipant(ROOM, SAGE);
        expect(coord.GetRoomState(ROOM)!.FacilitatorAgentSessionId).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Loop-safety with passive agents — the §4c guarantee.
// ──────────────────────────────────────────────────────────────────────────────

describe('MultiAgentRoomCoordinator — loop-safety (passive agents)', () => {
    it('two passive agents never overlap: at most one holds the floor at any instant', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, DEMO);

        // A human addresses Sage (passive turn-taking decided Sage may speak); Sage claims the floor.
        expect(coord.TakeFloor(ROOM, SAGE).Granted).toBe(true);

        // While Sage speaks, Demo (even if its passive policy somehow fired) cannot take the floor.
        expect(coord.TakeFloor(ROOM, DEMO).Granted).toBe(false);

        // Exactly one holder — never both.
        const holders = [SAGE, DEMO].filter(a => coord.IsFloorHolder(ROOM, a));
        expect(holders).toEqual([SAGE]);

        // Sage finishes; now Demo (addressed next) may speak — strictly serialized, never looping/overlapping.
        coord.ReleaseFloor(ROOM, SAGE);
        expect(coord.TakeFloor(ROOM, DEMO).Granted).toBe(true);
        expect([SAGE, DEMO].filter(a => coord.IsFloorHolder(ROOM, a))).toEqual([DEMO]);
    });

    it('a single-agent room imposes no contention (floor always available)', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        expect(coord.IsMultiAgentRoom(ROOM)).toBe(false);
        expect(coord.TakeFloor(ROOM, SAGE).Granted).toBe(true);
        coord.ReleaseFloor(ROOM, SAGE);
        expect(coord.TakeFloor(ROOM, SAGE).Granted).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Human participants — a person holds the floor, and agents yield to them.
// ──────────────────────────────────────────────────────────────────────────────

describe('MultiAgentRoomCoordinator — human participants', () => {
    it('a bare string is still an agent session id (the pre-human calling shape)', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        // The string form and the explicit agent ref name the SAME member.
        expect(coord.CanTakeFloor(ROOM, AgentParticipant(SAGE))).toEqual({ Granted: true, Reason: 'FloorFree' });
        coord.TakeFloor(ROOM, AgentParticipant(SAGE));
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        expect(coord.GetRoomState(ROOM)!.Participants).toEqual([{ Kind: 'Agent', AgentSessionId: SAGE }]);
    });

    it('an agent session and a user sharing an id are distinct members', () => {
        const shared = 'A1B2C3';
        coord.RegisterRoomParticipant(ROOM, shared);
        coord.RegisterRoomParticipant(ROOM, HumanParticipant(shared));
        expect(RoomParticipantKey(AgentParticipant(shared))).not.toBe(RoomParticipantKey(HumanParticipant(shared)));
        expect(coord.GetRoomState(ROOM)!.Participants.length).toBe(2);
        // The agent takes the floor; the human is NOT treated as already holding it.
        coord.TakeFloor(ROOM, shared);
        expect(coord.IsFloorHolder(ROOM, HumanParticipant(shared))).toBe(false);
    });

    it('a human can hold the floor, and every agent is denied while they do', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, DEMO);
        coord.RegisterRoomParticipant(ROOM, COACH);

        // Nobody is speaking yet, so the coach simply takes a free floor.
        expect(coord.TakeFloor(ROOM, COACH)).toEqual({ Granted: true, Reason: 'FloorFree' });
        expect(coord.IsFloorHolder(ROOM, COACH)).toBe(true);
        expect(coord.CanTakeFloor(ROOM, SAGE)).toEqual({ Granted: false, Reason: 'HeldByHuman' });
        expect(coord.TakeFloor(ROOM, DEMO).Granted).toBe(false);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(false);
    });

    it('a FACILITATOR agent still yields to a human — it overrides agents, not people', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE, /* isFacilitator */ true);
        coord.RegisterRoomParticipant(ROOM, COACH);
        coord.TakeFloor(ROOM, COACH);
        expect(coord.CanTakeFloor(ROOM, SAGE)).toEqual({ Granted: false, Reason: 'HeldByHuman' });
        expect(coord.IsFloorHolder(ROOM, COACH)).toBe(true);
    });

    it('a human overrides a speaking agent, and the bumped agent learns it must yield', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, COACH);
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.CanTakeFloor(ROOM, COACH)).toEqual({ Granted: true, Reason: 'HumanOverride' });
        coord.TakeFloor(ROOM, COACH);
        expect(coord.IsFloorHolder(ROOM, COACH)).toBe(true);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(false);
    });

    it('a human re-asserting is AlreadyHolder and keeps the original since-stamp', () => {
        let t = 1000;
        const c = new MultiAgentRoomCoordinator(() => t);
        c.RegisterRoomParticipant(ROOM, COACH);
        t = 4000;
        c.TakeFloor(ROOM, COACH);
        t = 9000;
        expect(c.CanTakeFloor(ROOM, COACH)).toEqual({ Granted: true, Reason: 'AlreadyHolder' });
        c.TakeFloor(ROOM, COACH);
        expect(c.GetRoomState(ROOM)!.FloorHeldSinceMs).toBe(4000);
    });

    it('one human may take the floor from another (the coordinator cannot mute a person)', () => {
        coord.RegisterRoomParticipant(ROOM, COACH);
        coord.RegisterRoomParticipant(ROOM, HOST);
        coord.TakeFloor(ROOM, COACH);
        expect(coord.TakeFloor(ROOM, HOST)).toEqual({ Granted: true, Reason: 'HumanOverride' });
        expect(coord.IsFloorHolder(ROOM, HOST)).toBe(true);
    });

    it('an unregistered human is not a room member', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        expect(coord.CanTakeFloor(ROOM, COACH)).toEqual({ Granted: false, Reason: 'NotInRoom' });
    });

    it('a human leaving frees the floor it held', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, COACH);
        coord.TakeFloor(ROOM, COACH);
        coord.UnregisterRoomParticipant(ROOM, COACH);
        expect(coord.CanTakeFloor(ROOM, SAGE)).toEqual({ Granted: true, Reason: 'FloorFree' });
        expect(coord.GetRoomState(ROOM)!.FloorHolder).toBeNull();
    });

    it('a human can be the facilitator, and the agent-only projection reads null', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, COACH);
        expect(coord.SetFacilitator(ROOM, COACH)).toBe(true);
        const state = coord.GetRoomState(ROOM)!;
        expect(state.Facilitator).toEqual(COACH);
        expect(state.FacilitatorAgentSessionId).toBeNull();
    });

    it('one agent + one human is NOT a multi-agent room (it is a 1:1 call)', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, COACH);
        expect(coord.IsMultiAgentRoom(ROOM)).toBe(false);
        coord.RegisterRoomParticipant(ROOM, DEMO);
        expect(coord.IsMultiAgentRoom(ROOM)).toBe(true);
    });

    it('GetRoomState separates the full roster from the agent-only projections', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, COACH);
        coord.TakeFloor(ROOM, COACH);
        const state = coord.GetRoomState(ROOM)!;
        expect(state.Participants).toEqual([{ Kind: 'Agent', AgentSessionId: SAGE }, COACH]);
        expect(state.AgentSessionIds).toEqual([SAGE]); // humans excluded — back-compat shape
        expect(state.FloorHolder).toEqual(COACH);
        // The pre-human projection can only describe an AGENT holder, so it reads null here.
        expect(state.FloorHolderAgentSessionId).toBeNull();
    });

    it('the takeover round-trip: agent speaks → human takes the seat → hands it back', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE);
        coord.RegisterRoomParticipant(ROOM, DEMO);
        coord.RegisterRoomParticipant(ROOM, COACH);

        // Sage is mid-turn.
        expect(coord.TakeFloor(ROOM, SAGE).Granted).toBe(true);

        // The coach steps into Sage's seat: granted over the sitting agent, and now NO agent may speak.
        expect(coord.TakeFloor(ROOM, COACH)).toEqual({ Granted: true, Reason: 'HumanOverride' });
        expect([SAGE, DEMO].filter(a => coord.IsFloorHolder(ROOM, a))).toEqual([]);
        expect(coord.CanTakeFloor(ROOM, SAGE).Reason).toBe('HeldByHuman');
        expect(coord.CanTakeFloor(ROOM, DEMO).Reason).toBe('HeldByHuman');

        // The coach hands the seat back — the agents can take turns again, still one at a time.
        expect(coord.ReleaseFloor(ROOM, COACH)).toBe(true);
        expect(coord.TakeFloor(ROOM, SAGE).Granted).toBe(true);
        expect(coord.CanTakeFloor(ROOM, DEMO)).toEqual({ Granted: false, Reason: 'HeldByOtherAgent' });
    });
});
