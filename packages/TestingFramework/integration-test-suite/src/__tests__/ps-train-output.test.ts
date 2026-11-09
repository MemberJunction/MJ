/**
 * ps-train-output.test.ts — the over-the-wire rigs take the trained model's id from `ShippedModelID`, which checks it
 * against the run's stored gate decision instead of assuming every run ships a model.
 */
import { describe, expect, it } from 'vitest';
import { ShippedModelID, type RigCheck } from '../../rigs/lib/ps-train-output';

/** A recorder that keeps every check it is handed. */
function recorder(): { Check: RigCheck; Checks: [boolean, string][] } {
    const Checks: [boolean, string][] = [];
    return { Check: (condition, label) => { Checks.push([condition, label]); }, Checks };
}

describe('ShippedModelID', () => {
    it('returns the model id, with both checks passing, when the stored gate decision shipped one', () => {
        for (const gateOutcome of ['model', 'keep-simple-baseline'] as const) {
            const r = recorder();
            expect(ShippedModelID({ modelId: 'M1', gateOutcome }, 'score', r.Check)).toBe('M1');
            expect(r.Checks.map(([ok]) => ok)).toEqual([true, true]);
        }
    });

    it('returns null and fails the rig, naming the stored outcome and reason, when the gate shipped nothing', () => {
        const r = recorder();
        expect(ShippedModelID({ gateOutcome: 'no-signal', gateReason: 'No signal over the flat guess.' }, 'score', r.Check)).toBeNull();
        expect(r.Checks.map(([ok]) => ok)).toEqual([true, false]);
        expect(r.Checks[1][1]).toContain('no-signal — No signal over the flat guess.');
    });

    it('fails the rig when a model id comes back without a stored decision that ships it', () => {
        const r = recorder();
        expect(ShippedModelID({ modelId: 'M1', gateOutcome: 'no-signal' }, 'score', r.Check)).toBe('M1');
        expect(r.Checks.map(([ok]) => ok)).toEqual([false, true]);
    });
});
