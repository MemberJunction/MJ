/**
 * Unit tests for {@link MeetingControlsState} — the pure facilitator state machine. Pins the
 * hand-raise QUEUE ordering + idempotency, call-on (specific + front-of-line), the agenda timer
 * (elapsed/remaining/expired with an injected clock), roster pruning of departed participants, and
 * the full perception snapshot. Zero platform, fully deterministic via an injected clock.
 */
import { describe, it, expect } from 'vitest';
import { MeetingControlsState, MeetingParticipant } from '../realtime/meeting-controls-state';

/** A controllable clock for deterministic time math. */
class FakeClock {
    public nowMs = 1_000_000;
    public read = (): number => this.nowMs;
    public advance(seconds: number): void {
        this.nowMs += seconds * 1000;
    }
}

function p(id: string, name = id, role: MeetingParticipant['Role'] = 'Participant', isAgent = false): MeetingParticipant {
    return { ParticipantId: id, DisplayName: name, Role: role, IsAgent: isAgent };
}

function stateWith(participants: MeetingParticipant[], clock = new FakeClock()): { state: MeetingControlsState; clock: FakeClock } {
    const state = new MeetingControlsState(clock.read);
    state.SetRoster(participants);
    return { state, clock };
}

describe('MeetingControlsState — roster', () => {
    it('sets and reads the roster in insertion order', () => {
        const { state } = stateWith([p('a'), p('b'), p('c')]);
        expect(state.GetRoster().map((x) => x.ParticipantId)).toEqual(['a', 'b', 'c']);
        expect(state.GetParticipant('b')?.DisplayName).toBe('b');
        expect(state.GetParticipant('z')).toBeUndefined();
    });

    it('prunes departed participants from the queue / speaking / mute state on a roster update', () => {
        const { state } = stateWith([p('a'), p('b')]);
        state.RaiseHand('a');
        state.RaiseHand('b');
        state.SetSpeaking(['b']);
        state.MarkMuted('a');

        state.SetRoster([p('a')]); // b left

        expect(state.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['a']);
        expect(state.GetSpeaking()).toEqual([]);
        expect(state.GetMuted()).toEqual(['a']);
    });
});

describe('MeetingControlsState — hand-raise queue', () => {
    it('enqueues in raise order', () => {
        const { state, clock } = stateWith([p('a'), p('b'), p('c')]);
        state.RaiseHand('b');
        clock.advance(1);
        state.RaiseHand('a');
        clock.advance(1);
        state.RaiseHand('c');
        expect(state.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['b', 'a', 'c']);
    });

    it('is idempotent — re-raising keeps original position and raise time', () => {
        const { state, clock } = stateWith([p('a'), p('b')]);
        state.RaiseHand('a');
        clock.advance(5);
        state.RaiseHand('b');
        clock.advance(5);
        const second = state.RaiseHand('a'); // already queued
        expect(second).toBe(false);
        const q = state.GetHandRaiseQueue();
        expect(q.map((e) => e.ParticipantId)).toEqual(['a', 'b']); // a still first
        expect(q[0].WaitingSeconds).toBe(10); // original raise time preserved
    });

    it('ignores a raise from someone not on the roster', () => {
        const { state } = stateWith([p('a')]);
        expect(state.RaiseHand('ghost')).toBe(false);
        expect(state.GetHandRaiseQueue()).toEqual([]);
    });

    it('lowers a hand, preserving the order of the rest', () => {
        const { state } = stateWith([p('a'), p('b'), p('c')]);
        state.RaiseHand('a');
        state.RaiseHand('b');
        state.RaiseHand('c');
        expect(state.LowerHand('b')).toBe(true);
        expect(state.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['a', 'c']);
        expect(state.LowerHand('b')).toBe(false); // already gone
    });

    it('reports waiting seconds from the injected clock', () => {
        const { state, clock } = stateWith([p('a')]);
        state.RaiseHand('a');
        clock.advance(42);
        expect(state.GetHandRaiseQueue()[0].WaitingSeconds).toBe(42);
    });

    it('peeks the front of the queue', () => {
        const { state } = stateWith([p('a'), p('b')]);
        state.RaiseHand('b');
        state.RaiseHand('a');
        expect(state.PeekNextHand()?.ParticipantId).toBe('b');
    });
});

describe('MeetingControlsState — call on', () => {
    it('calls on the front of the queue by default and removes them', () => {
        const { state } = stateWith([p('a', 'Alice'), p('b', 'Bob')]);
        state.RaiseHand('a');
        state.RaiseHand('b');
        const called = state.CallOn();
        expect(called?.ParticipantId).toBe('a');
        expect(called?.DisplayName).toBe('Alice');
        expect(state.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['b']);
    });

    it('calls on a specific queued participant', () => {
        const { state } = stateWith([p('a'), p('b'), p('c')]);
        state.RaiseHand('a');
        state.RaiseHand('b');
        state.RaiseHand('c');
        expect(state.CallOn('c')?.ParticipantId).toBe('c');
        expect(state.GetHandRaiseQueue().map((e) => e.ParticipantId)).toEqual(['a', 'b']);
    });

    it('returns undefined for an empty queue or a non-queued participant', () => {
        const { state } = stateWith([p('a'), p('b')]);
        expect(state.CallOn()).toBeUndefined();
        state.RaiseHand('a');
        expect(state.CallOn('b')).toBeUndefined(); // b never raised
    });
});

describe('MeetingControlsState — speaking + mute', () => {
    it('replaces the speaking set', () => {
        const { state } = stateWith([p('a'), p('b')]);
        state.SetSpeaking(['a']);
        expect(state.GetSpeaking()).toEqual(['a']);
        state.SetSpeaking(['b']);
        expect(state.GetSpeaking()).toEqual(['b']);
    });

    it('marks a roster participant muted; ignores unknown ids', () => {
        const { state } = stateWith([p('a')]);
        expect(state.MarkMuted('a')).toBe(true);
        expect(state.MarkMuted('ghost')).toBe(false);
        expect(state.GetMuted()).toEqual(['a']);
    });
});

describe('MeetingControlsState — agenda timer', () => {
    it('reports elapsed/remaining/expired against the injected clock', () => {
        const { state, clock } = stateWith([], new FakeClock());
        state.SetTimer(60);
        let t = state.GetTimer();
        expect(t).toEqual({ DurationSeconds: 60, ElapsedSeconds: 0, RemainingSeconds: 60, Expired: false });

        clock.advance(25);
        t = state.GetTimer();
        expect(t).toEqual({ DurationSeconds: 60, ElapsedSeconds: 25, RemainingSeconds: 35, Expired: false });

        clock.advance(40); // 65s total, past 60
        t = state.GetTimer();
        expect(t).toEqual({ DurationSeconds: 60, ElapsedSeconds: 60, RemainingSeconds: 0, Expired: true });
    });

    it('clears the timer with a non-positive duration', () => {
        const { state } = stateWith([]);
        state.SetTimer(30);
        expect(state.GetTimer()).not.toBeNull();
        state.SetTimer(0);
        expect(state.GetTimer()).toBeNull();
    });

    it('returns null when no timer is set, and ClearTimer resets it', () => {
        const { state } = stateWith([]);
        expect(state.GetTimer()).toBeNull();
        state.SetTimer(10);
        state.ClearTimer();
        expect(state.GetTimer()).toBeNull();
    });

    it('floors a fractional duration', () => {
        const { state } = stateWith([]);
        state.SetTimer(12.9);
        expect(state.GetTimer()?.DurationSeconds).toBe(12);
    });
});

describe('MeetingControlsState — perception snapshot', () => {
    it('assembles roster, ordered queue with wait times, speaking, muted, and timer', () => {
        const clock = new FakeClock();
        const { state } = stateWith([p('a', 'Alice'), p('b', 'Bob'), p('agent', 'Sage', 'Agent', true)], clock);
        state.RaiseHand('b');
        clock.advance(3);
        state.RaiseHand('a');
        state.SetSpeaking(['a']);
        state.MarkMuted('b');
        state.SetTimer(120);
        clock.advance(20);

        const perc = state.BuildPerception();
        expect(perc.Roster.map((x) => x.ParticipantId)).toEqual(['a', 'b', 'agent']);
        expect(perc.HandRaiseQueue.map((e) => e.ParticipantId)).toEqual(['b', 'a']);
        expect(perc.HandRaiseQueue[0].WaitingSeconds).toBe(23); // b raised, then 3 + 20s
        expect(perc.HandRaiseQueue[1].WaitingSeconds).toBe(20); // a raised after 3s, then 20s
        expect(perc.SpeakingParticipantIds).toEqual(['a']);
        expect(perc.MutedParticipantIds).toEqual(['b']);
        expect(perc.Timer).toEqual({ DurationSeconds: 120, ElapsedSeconds: 20, RemainingSeconds: 100, Expired: false });
    });
});
