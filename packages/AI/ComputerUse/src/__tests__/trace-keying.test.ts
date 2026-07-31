import { describe, it, expect } from 'vitest';
import { decideReplayTier, goalMatchesTrace, DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD } from '../engine/trace-keying.js';
import { ComputerUseTrace } from '../types/trace.js';
import { hashGoal } from '../engine/trace-recorder.js';

const GOAL = 'Open the Data Explorer and confirm the heading';

function traceFor(goal: string, buildHash = ''): ComputerUseTrace {
    const t = new ComputerUseTrace();
    t.TestId = 'T1';
    t.GoalHash = hashGoal(goal);
    t.AppBuildHash = buildHash;
    return t;
}

describe('goalMatchesTrace (CU-C4)', () => {
    it('matches identical (whitespace-normalized) goals', () => {
        expect(goalMatchesTrace(traceFor(GOAL), `  ${GOAL}  `)).toBe(true);
    });
    it('does not match a reworded goal', () => {
        expect(goalMatchesTrace(traceFor(GOAL), 'Close the Data Explorer')).toBe(false);
    });
});

describe('decideReplayTier (CU-C4)', () => {
    it('→ llm when there is no trace', () => {
        expect(decideReplayTier({ trace: null, currentGoal: GOAL }).tier).toBe('llm');
    });

    it('→ llm when the goal was reworded since record', () => {
        const d = decideReplayTier({ trace: traceFor(GOAL, 'b1'), currentGoal: 'A different goal', currentBuildHash: 'b1' });
        expect(d.tier).toBe('llm');
        expect(d.reason).toContain('goal text changed');
    });

    it('→ llm when the heal rate crossed the demote threshold', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'b1'), currentGoal: GOAL, currentBuildHash: 'b1',
            healRate: DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD,
        });
        expect(d.tier).toBe('llm');
        expect(d.reason).toContain('heal rate');
    });

    it('→ replay on an exact build match (goal unchanged, heal rate low)', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'build-abc'), currentGoal: GOAL, currentBuildHash: 'build-abc', healRate: 0.1,
        });
        expect(d.tier).toBe('replay');
    });

    it('→ replay-with-heal when the build hash differs', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'build-old'), currentGoal: GOAL, currentBuildHash: 'build-new',
        });
        expect(d.tier).toBe('replay-with-heal');
        expect(d.reason).toContain('differs');
    });

    it('→ replay-with-heal (the safe default) when build identity is unavailable', () => {
        const d = decideReplayTier({ trace: traceFor(GOAL), currentGoal: GOAL });
        expect(d.tier).toBe('replay-with-heal');
        expect(d.reason).toContain('unavailable');
    });

    it('does not demote below the threshold', () => {
        const d = decideReplayTier({
            trace: traceFor(GOAL, 'b1'), currentGoal: GOAL, currentBuildHash: 'b1',
            healRate: DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD - 0.01,
        });
        expect(d.tier).toBe('replay');
    });
});
