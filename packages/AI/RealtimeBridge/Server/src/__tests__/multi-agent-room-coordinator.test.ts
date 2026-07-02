import { describe, it, expect, beforeEach } from 'vitest';
import { MultiAgentRoomCoordinator } from '../multi-agent-room-coordinator';

const ROOM = 'room-alpha';
const ROOM_B = 'room-beta';
const SAGE = 'sess-sage';
const DEMO = 'sess-demo';
const SCOUT = 'sess-scout';

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
