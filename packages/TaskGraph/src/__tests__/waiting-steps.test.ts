/**
 * Tests for the pure half of waiting steps — which steps wait, for what moment or key, and what they
 * hand on. The guarded writes are covered by the live integration run; everything that DECIDES is here.
 */
import { describe, it, expect } from 'vitest';
import {
    ComposeWaitingStepOutput,
    DeadlineFrom,
    IsProviderHumanTask,
    PayloadAtStartOf,
    PendingSignalOf,
    ResolveCorrelationKey,
    ResolveWaitDueAt,
    WaitingStepDueAt,
    WaitingStepKindOf,
} from '../waiting-steps';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const row = (StepType: string | null, configuration?: object) => ({
    StepType,
    Configuration: configuration ? JSON.stringify(configuration) : null,
});

describe('WaitingStepKindOf', () => {
    it('classifies External and Wait steps', () => {
        expect(WaitingStepKindOf(row('External'))).toBe('External');
        expect(WaitingStepKindOf(row('Wait'))).toBe('Wait');
    });

    it('leaves a Human step on the built-in inbox to the inbox lifecycle', () => {
        expect(WaitingStepKindOf(row('Human'))).toBeNull();
        expect(WaitingStepKindOf(row('Human', { human: { provider: 'AgentRequest' } }))).toBeNull();
        expect(WaitingStepKindOf(row('Human', { human: { provider: '  agentrequest ' } }))).toBeNull();
    });

    it('treats a Human step with a plugged-in provider as a waiting step', () => {
        const task = row('Human', { human: { provider: 'BizAppsTasks' } });
        expect(WaitingStepKindOf(task)).toBe('ProviderHuman');
        expect(IsProviderHumanTask(task)).toBe(true);
    });

    it('is not fooled by a malformed configuration bag', () => {
        expect(WaitingStepKindOf({ StepType: 'Human', Configuration: '{not json' })).toBeNull();
        expect(WaitingStepKindOf(row('Action'))).toBeNull();
        expect(WaitingStepKindOf(row(null))).toBeNull();
    });
});

describe('ResolveWaitDueAt', () => {
    it('counts durationSeconds from the moment the step is reached', () => {
        const r = ResolveWaitDueAt({ durationSeconds: 90 }, {}, NOW);
        expect('Value' in r && r.Value.toISOString()).toBe('2026-11-18T12:01:30.000Z');
    });

    it('accepts a literal ISO timestamp', () => {
        const r = ResolveWaitDueAt({ until: '2026-12-01T03:15:00Z' }, {}, NOW);
        expect('Value' in r && r.Value.toISOString()).toBe('2026-12-01T03:15:00.000Z');
    });

    it('reads until from the payload — a string, a Date or epoch milliseconds', () => {
        const fromString = ResolveWaitDueAt({ until: 'payload.renewal.chargeOn' }, { renewal: { chargeOn: '2026-12-03' } }, NOW);
        expect('Value' in fromString && fromString.Value.toISOString()).toBe('2026-12-03T00:00:00.000Z');
        const fromDate = ResolveWaitDueAt({ until: 'payload.at' }, { at: new Date('2026-11-20T00:00:00Z') }, NOW);
        expect('Value' in fromDate && fromDate.Value.toISOString()).toBe('2026-11-20T00:00:00.000Z');
        const fromEpoch = ResolveWaitDueAt({ until: 'payload.at' }, { at: Date.parse('2026-11-21T00:00:00Z') }, NOW);
        expect('Value' in fromEpoch && fromEpoch.Value.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    });

    it('returns a moment in the past as-is: the wait is simply already over', () => {
        const r = ResolveWaitDueAt({ until: '2020-01-01T00:00:00Z' }, {}, NOW);
        expect('Value' in r && r.Value.getTime()).toBeLessThan(NOW.getTime());
    });

    it('refuses a payload path holding nothing, rather than continuing now', () => {
        const r = ResolveWaitDueAt({ until: 'payload.missing' }, {}, NOW);
        expect('Error' in r && r.Error).toContain('holds nothing');
    });

    it('refuses something that is not a moment', () => {
        expect('Error' in ResolveWaitDueAt({ until: 'next tuesday' }, {}, NOW)).toBe(true);
        expect('Error' in ResolveWaitDueAt({ until: 'payload.x' }, { x: 'soon' }, NOW)).toBe(true);
        expect('Error' in ResolveWaitDueAt({ durationSeconds: -1 }, {}, NOW)).toBe(true);
        expect('Error' in ResolveWaitDueAt({}, {}, NOW)).toBe(true);
        expect('Error' in ResolveWaitDueAt(undefined, {}, NOW)).toBe(true);
    });
});

describe('ResolveCorrelationKey', () => {
    it('is null when the step is signalled by task ID only', () => {
        expect(ResolveCorrelationKey(undefined, {})).toEqual({ Value: null });
        expect(ResolveCorrelationKey({ correlationKey: '  ' }, {})).toEqual({ Value: null });
    });

    it('passes a literal key through', () => {
        expect(ResolveCorrelationKey({ correlationKey: 'sprint-close' }, {})).toEqual({ Value: 'sprint-close' });
    });

    it('reads a key from the payload and stringifies a scalar', () => {
        expect(ResolveCorrelationKey({ correlationKey: 'payload.sprint.id' }, { sprint: { id: 'S-12' } })).toEqual({ Value: 'S-12' });
        expect(ResolveCorrelationKey({ correlationKey: 'payload.n' }, { n: 42 })).toEqual({ Value: '42' });
    });

    it('refuses a payload key that resolved to nothing or to an object — a step that waits forever otherwise', () => {
        expect('Error' in ResolveCorrelationKey({ correlationKey: 'payload.missing' }, {})).toBe(true);
        expect('Error' in ResolveCorrelationKey({ correlationKey: 'payload.obj' }, { obj: { a: 1 } })).toBe(true);
    });
});

describe('deadlines', () => {
    it('counts expiresInHours from now, and treats absent or non-positive as no deadline', () => {
        expect(DeadlineFrom(2, NOW)?.toISOString()).toBe('2026-11-18T14:00:00.000Z');
        expect(DeadlineFrom(undefined, NOW)).toBeNull();
        expect(DeadlineFrom(0, NOW)).toBeNull();
        expect(DeadlineFrom(-3, NOW)).toBeNull();
    });

    it('gives each waiting kind the deadline it asked for', () => {
        expect(WaitingStepDueAt('External', { external: { domain: 'x', expiresInHours: 1 } }, {}, NOW))
            .toEqual({ Value: new Date('2026-11-18T13:00:00.000Z') });
        expect(WaitingStepDueAt('ProviderHuman', { human: { expiresInHours: 24 } }, {}, NOW))
            .toEqual({ Value: new Date('2026-11-19T12:00:00.000Z') });
        expect(WaitingStepDueAt('External', { external: { domain: 'x' } }, {}, NOW)).toEqual({ Value: null });
        expect(WaitingStepDueAt('Wait', { wait: { durationSeconds: 60 } }, {}, NOW))
            .toEqual({ Value: new Date('2026-11-18T12:01:00.000Z') });
    });
});

describe('ComposeWaitingStepOutput', () => {
    it('hands on the whole payload the step was reached with, plus its own output', () => {
        const out = ComposeWaitingStepOutput({ customer: { id: 'C1', tier: 'gold' }, total: 10 }, { approved: true });
        expect(out).toEqual({ customer: { id: 'C1', tier: 'gold' }, total: 10, approved: true });
    });

    it('deep-merges its own output over the payload, so a nested update keeps its siblings', () => {
        const out = ComposeWaitingStepOutput({ customer: { id: 'C1', tier: 'gold' } }, { customer: { tier: 'platinum' } });
        expect(out).toEqual({ customer: { id: 'C1', tier: 'platinum' } });
    });

    it('works with neither side present', () => {
        expect(ComposeWaitingStepOutput(undefined, null)).toEqual({});
    });
});

describe('held signals and the starting payload', () => {
    it('reads a held signal off the runtime record', () => {
        const signal = PendingSignalOf({
            runtime: { pendingSignal: { status: 'Complete', payload: { ok: 1 }, receivedAt: '2026-11-18T00:00:00Z' } },
        } as never);
        expect(signal?.status).toBe('Complete');
        expect(signal?.payload).toEqual({ ok: 1 });
    });

    it('ignores a malformed held signal rather than applying it', () => {
        expect(PendingSignalOf({ runtime: { pendingSignal: { status: 'Maybe' } } } as never)).toBeNull();
        expect(PendingSignalOf({ runtime: { pendingSignal: 'yes' } } as never)).toBeNull();
        expect(PendingSignalOf({})).toBeNull();
    });

    it('reads the payload the step was reached with', () => {
        expect(PayloadAtStartOf({ runtime: { payloadAtStart: { a: 1 } } })).toEqual({ a: 1 });
        expect(PayloadAtStartOf({})).toBeUndefined();
    });
});
