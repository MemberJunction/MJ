import { describe, it, expect, beforeEach } from 'vitest';
import {
    MultiAgentRoomCoordinator,
    DEFAULT_HANDOFF_TTL_MS,
    DEFAULT_HUMAN_SPEECH_HOLD_MS,
    DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS,
    MAX_ROOM_EVENTS,
} from '../multi-agent-room-coordinator';

const ROOM = 'room-alpha';
const SAGE = 'sess-sage';
const DEMO = 'sess-demo';
const SCOUT = 'sess-scout';

let now = 0;
let coord: MultiAgentRoomCoordinator;

beforeEach(() => {
    now = 10_000;
    coord = new MultiAgentRoomCoordinator(() => now);
    coord.RegisterRoomParticipant(ROOM, SAGE);
    coord.RegisterRoomParticipant(ROOM, DEMO);
    coord.RegisterRoomParticipant(ROOM, SCOUT);
});

describe('backchannels', () => {
    it('are granted while another agent holds the floor, and never take or disturb it', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.CanTakeFloor(ROOM, DEMO, 'Backchannel')).toEqual({ Granted: true, Reason: 'Backchannel' });
        expect(coord.TakeFloor(ROOM, DEMO, 'Backchannel').Granted).toBe(true);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        expect(coord.IsFloorHolder(ROOM, DEMO)).toBe(false);
    });

    it('are counted and logged, but never count toward the loop cap', () => {
        for (let i = 0; i < 20; i++) {
            coord.TakeFloor(ROOM, DEMO, 'Backchannel');
        }
        const state = coord.GetRoomState(ROOM)!;
        expect(state.BackchannelCount).toBe(20);
        expect(state.ConsecutiveAgentTurns).toBe(0);
        expect(state.LoopCapReached).toBe(false);
    });

    it('are welcome even while a human is speaking (a listening sound is not a bid for the floor)', () => {
        coord.NoteHumanSpeech(ROOM);
        expect(coord.CanTakeFloor(ROOM, SAGE, 'Turn')).toEqual({ Granted: false, Reason: 'HumanSpeaking' });
        expect(coord.CanTakeFloor(ROOM, SAGE, 'Backchannel').Granted).toBe(true);
    });

    it('still require room membership', () => {
        expect(coord.CanTakeFloor(ROOM, 'stranger', 'Backchannel')).toEqual({ Granted: false, Reason: 'NotInRoom' });
        expect(coord.CanTakeFloor('nowhere', SAGE, 'Backchannel')).toEqual({ Granted: false, Reason: 'UnknownRoom' });
    });

    it('CompleteTurn reclassifies a short utterance that started on a free floor, refunding the loop count', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(1);
        const done = coord.CompleteTurn(ROOM, SAGE, { Text: 'mm-hm', DurationMs: 600 });
        expect(done).toEqual({ Released: true, WasBackchannel: true });
        const state = coord.GetRoomState(ROOM)!;
        expect(state.ConsecutiveAgentTurns).toBe(0);
        expect(state.BackchannelCount).toBe(1);
        expect(state.FloorHolderAgentSessionId).toBeNull();
    });

    it('CompleteTurn keeps a long utterance as a full turn', () => {
        coord.TakeFloor(ROOM, SAGE);
        const done = coord.CompleteTurn(ROOM, SAGE, { Text: 'Here is a longer answer about the topic', DurationMs: 6000 });
        expect(done).toEqual({ Released: true, WasBackchannel: false });
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(1);
    });

    it('CompleteTurn from a non-holder never frees someone else\'s floor', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.CompleteTurn(ROOM, DEMO, { Text: 'ok' })).toEqual({ Released: false, WasBackchannel: true });
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(1); // not refunded: DEMO never held it
    });

    it('RecordBackchannel logs an overlay without touching the floor', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.RecordBackchannel(ROOM, DEMO);
        expect(coord.GetRoomState(ROOM)!.BackchannelCount).toBe(1);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
    });
});

describe('humans win', () => {
    it('human speech preempts the floor holder immediately and reports who was cut', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.NoteHumanSpeech(ROOM)).toEqual({ PreemptedAgentSessionId: SAGE });
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(false);
        expect(coord.GetRoomState(ROOM)!.HumanSpeaking).toBe(true);
    });

    it('reports no preemption when nobody held the floor, and when speech simply continues', () => {
        expect(coord.NoteHumanSpeech(ROOM)).toEqual({ PreemptedAgentSessionId: null });
        coord.NoteHumanSpeech(ROOM);
        expect(coord.GetRoomState(ROOM)!.RecentEvents.filter(e => e.Type === 'HumanSpeech')).toHaveLength(1);
    });

    it('denies every agent while the human talks, the facilitator included', () => {
        coord.RegisterRoomParticipant(ROOM, SAGE, true);
        coord.NoteHumanSpeech(ROOM);
        for (const agent of [SAGE, DEMO, SCOUT]) {
            expect(coord.CanTakeFloor(ROOM, agent)).toEqual({ Granted: false, Reason: 'HumanSpeaking' });
        }
    });

    it('admits agents again once the human has been quiet for the hold window', () => {
        coord.NoteHumanSpeech(ROOM);
        now += DEFAULT_HUMAN_SPEECH_HOLD_MS - 1;
        expect(coord.CanTakeFloor(ROOM, DEMO).Granted).toBe(false);
        now += 1;
        expect(coord.CanTakeFloor(ROOM, DEMO).Granted).toBe(true);
    });

    it('keeps extending the hold while speech activity continues', () => {
        coord.NoteHumanSpeech(ROOM);
        for (let i = 0; i < 10; i++) {
            now += DEFAULT_HUMAN_SPEECH_HOLD_MS - 100;
            coord.NoteHumanSpeech(ROOM);
        }
        expect(coord.CanTakeFloor(ROOM, DEMO)).toEqual({ Granted: false, Reason: 'HumanSpeaking' });
    });

    it('an explicit end of speech admits agents at once', () => {
        coord.NoteHumanSpeech(ROOM);
        coord.NoteHumanSpeechEnded(ROOM);
        expect(coord.CanTakeFloor(ROOM, DEMO).Granted).toBe(true);
    });

    it('cancels a pending hand-off', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        coord.NoteHumanSpeech(ROOM);
        expect(coord.GetRoomState(ROOM)!.PendingHandoffToAgentSessionId).toBeNull();
    });

    it('records the preemption in the room events', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.NoteHumanSpeech(ROOM);
        const types = coord.GetRoomState(ROOM)!.RecentEvents.map(e => e.Type);
        expect(types).toEqual(['FloorGranted', 'HumanSpeech', 'HumanPreempted']);
    });

    it('NoteHumanTurn resets the loop counter but does NOT preempt (a final transcript lands after a quick agent starts)', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.NoteHumanTurn(ROOM);
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(0);
    });
});

describe('explicit hand-off', () => {
    it('releases the floor and reserves it for the named agent', () => {
        coord.TakeFloor(ROOM, SAGE);
        const result = coord.YieldFloor(ROOM, SAGE, DEMO);
        expect(result).toEqual({ Released: true, HandoffToAgentSessionId: DEMO, Reason: 'Yielded' });
        expect(coord.GetRoomState(ROOM)!.FloorHolderAgentSessionId).toBeNull();
        expect(coord.GetRoomState(ROOM)!.PendingHandoffToAgentSessionId).toBe(DEMO);
    });

    it('grants the target the floor and denies a third agent in the gap (no two start at once)', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        expect(coord.CanTakeFloor(ROOM, SCOUT)).toEqual({ Granted: false, Reason: 'ReservedForHandoff' });
        expect(coord.TakeFloor(ROOM, SCOUT).Granted).toBe(false);
        expect(coord.TakeFloor(ROOM, DEMO)).toEqual({ Granted: true, Reason: 'HandoffGranted' });
        expect(coord.IsFloorHolder(ROOM, DEMO)).toBe(true);
    });

    it('consumes the reservation when the target takes the floor', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        coord.TakeFloor(ROOM, DEMO);
        expect(coord.GetRoomState(ROOM)!.PendingHandoffToAgentSessionId).toBeNull();
        coord.ReleaseFloor(ROOM, DEMO);
        expect(coord.CanTakeFloor(ROOM, SCOUT).Granted).toBe(true);
    });

    it('lets the reservation lapse after its TTL so a silent target cannot wedge the room', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        now += DEFAULT_HANDOFF_TTL_MS;
        expect(coord.CanTakeFloor(ROOM, SCOUT)).toEqual({ Granted: true, Reason: 'FloorFree' });
        expect(coord.GetRoomState(ROOM)!.PendingHandoffToAgentSessionId).toBeNull();
    });

    it('lets the facilitator cut through a reservation, like any floor override', () => {
        coord.RegisterRoomParticipant(ROOM, SCOUT, true);
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        expect(coord.CanTakeFloor(ROOM, SCOUT).Granted).toBe(true);
    });

    it('without a target simply frees the floor for the room', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.YieldFloor(ROOM, SAGE)).toEqual({ Released: true, HandoffToAgentSessionId: null, Reason: 'Yielded' });
        expect(coord.CanTakeFloor(ROOM, SCOUT).Granted).toBe(true);
    });

    it('releases the floor but reserves nothing for an unknown target', () => {
        coord.TakeFloor(ROOM, SAGE);
        const result = coord.YieldFloor(ROOM, SAGE, 'sess-ghost');
        expect(result).toEqual({ Released: true, HandoffToAgentSessionId: null, Reason: 'UnknownTarget' });
        expect(coord.CanTakeFloor(ROOM, SCOUT).Granted).toBe(true);
    });

    it('cannot hand the floor to itself', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.YieldFloor(ROOM, SAGE, SAGE).HandoffToAgentSessionId).toBeNull();
    });

    it('is a no-op from an agent that does not hold a floor another agent holds', () => {
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.YieldFloor(ROOM, DEMO, SCOUT)).toEqual({ Released: false, HandoffToAgentSessionId: null, Reason: 'NotHolder' });
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
        expect(coord.GetRoomState(ROOM)!.PendingHandoffToAgentSessionId).toBeNull();
    });

    it('refuses to reserve the floor while a human is speaking (humans win), but still releases it', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.NoteHumanSpeech(ROOM); // preempts SAGE
        expect(coord.YieldFloor(ROOM, SAGE, DEMO)).toEqual({ Released: false, HandoffToAgentSessionId: null, Reason: 'HumanSpeaking' });
    });

    it('refuses to reserve the floor once the loop cap is reached', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 1 });
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.YieldFloor(ROOM, SAGE, DEMO)).toEqual({ Released: true, HandoffToAgentSessionId: null, Reason: 'LoopCapReached' });
    });

    it('drops a reservation when its target leaves the room', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        coord.UnregisterRoomParticipant(ROOM, DEMO);
        expect(coord.CanTakeFloor(ROOM, SCOUT).Granted).toBe(true);
    });

    it('rejects a yield from a non-member or in an unknown room', () => {
        expect(coord.YieldFloor(ROOM, 'stranger', SAGE).Reason).toBe('NotInRoom');
        expect(coord.YieldFloor('nowhere', SAGE, DEMO).Reason).toBe('UnknownRoom');
    });
});

describe('loop cap', () => {
    it('defaults to a sane constant and reports it in the room state', () => {
        expect(coord.GetRoomState(ROOM)!.MaxConsecutiveAgentTurns).toBe(DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS);
    });

    it('denies every agent once the cap of consecutive agent turns is reached, until a human speaks', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 3 });
        const agents = [SAGE, DEMO, SCOUT];
        for (let i = 0; i < 3; i++) {
            expect(coord.TakeFloor(ROOM, agents[i]).Granted).toBe(true);
            coord.ReleaseFloor(ROOM, agents[i]);
        }
        expect(coord.GetRoomState(ROOM)!.LoopCapReached).toBe(true);
        for (const agent of agents) {
            expect(coord.CanTakeFloor(ROOM, agent)).toEqual({ Granted: false, Reason: 'LoopCapReached' });
        }
        coord.NoteHumanSpeech(ROOM);
        coord.NoteHumanSpeechEnded(ROOM);
        expect(coord.GetRoomState(ROOM)!.LoopCapReached).toBe(false);
        expect(coord.CanTakeFloor(ROOM, SAGE).Granted).toBe(true);
    });

    it('does not count a holder re-asserting its own floor as another turn', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.TakeFloor(ROOM, SAGE);
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(1);
    });

    it('logs the moment the cap is reached exactly once', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 2 });
        coord.TakeFloor(ROOM, SAGE);
        coord.ReleaseFloor(ROOM, SAGE);
        coord.TakeFloor(ROOM, DEMO);
        coord.ReleaseFloor(ROOM, DEMO);
        coord.TakeFloor(ROOM, SCOUT); // denied — cap
        const capEvents = coord.GetRoomState(ROOM)!.RecentEvents.filter(e => e.Type === 'LoopCapReached');
        expect(capEvents).toHaveLength(1);
    });

    it('supports a per-room override that wins over the coordinator-wide cap', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 2 });
        expect(coord.SetRoomMaxConsecutiveAgentTurns(ROOM, 5)).toBe(true);
        expect(coord.GetRoomState(ROOM)!.MaxConsecutiveAgentTurns).toBe(5);
        expect(coord.SetRoomMaxConsecutiveAgentTurns(ROOM, null)).toBe(true);
        expect(coord.GetRoomState(ROOM)!.MaxConsecutiveAgentTurns).toBe(2);
        expect(coord.SetRoomMaxConsecutiveAgentTurns('nowhere', 5)).toBe(false);
    });

    it('ignores nonsensical limits instead of silencing every agent', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 0 });
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: Number.NaN });
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: -3 });
        expect(coord.GetRoomState(ROOM)!.MaxConsecutiveAgentTurns).toBe(DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS);
    });
});

describe('room events', () => {
    it('numbers events monotonically so a poller can ask for only what it has not seen', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.ReleaseFloor(ROOM, SAGE);
        coord.TakeFloor(ROOM, DEMO);
        const seqs = coord.GetRoomState(ROOM)!.RecentEvents.map(e => e.Seq);
        expect(seqs).toEqual([1, 2, 3]);
    });

    it('records a denial with its reason', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.TakeFloor(ROOM, DEMO);
        const denied = coord.GetRoomState(ROOM)!.RecentEvents.find(e => e.Type === 'FloorDenied');
        expect(denied).toMatchObject({ AgentSessionId: DEMO, Reason: 'HeldByOtherAgent' });
    });

    it('records a yield with its target', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.YieldFloor(ROOM, SAGE, DEMO);
        const yielded = coord.GetRoomState(ROOM)!.RecentEvents.find(e => e.Type === 'Yielded');
        expect(yielded).toMatchObject({ AgentSessionId: SAGE, ToAgentSessionId: DEMO });
    });

    it('stamps events from the injected clock and bounds the log, dropping the oldest', () => {
        for (let i = 0; i < MAX_ROOM_EVENTS + 25; i++) {
            now += 1;
            coord.TakeFloor(ROOM, DEMO, 'Backchannel');
        }
        const events = coord.GetRoomState(ROOM)!.RecentEvents;
        expect(events).toHaveLength(MAX_ROOM_EVENTS);
        expect(events[0].Seq).toBe(26);
        expect(events[events.length - 1].AtMs).toBe(now);
    });

    it('hands out a copy so a reader cannot mutate the log', () => {
        coord.TakeFloor(ROOM, SAGE);
        coord.GetRoomState(ROOM)!.RecentEvents.length = 0;
        expect(coord.GetRoomState(ROOM)!.RecentEvents).toHaveLength(1);
    });
});

describe('existing floor rules stay intact', () => {
    it('a facilitator still overrides a sitting holder when no human speaks and the cap is clear', () => {
        coord.RegisterRoomParticipant(ROOM, SCOUT, true);
        coord.TakeFloor(ROOM, SAGE);
        expect(coord.CanTakeFloor(ROOM, SCOUT)).toEqual({ Granted: true, Reason: 'FacilitatorOverride' });
    });
});
