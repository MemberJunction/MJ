import { describe, it, expect } from 'vitest';
import { readJobSteps, stepCondition, readJobNeeds } from './lib/workflow.mjs';

// Pins WHERE the dynamic-replace gate runs in .github/workflows/test.yml, and under what
// condition. Both have already regressed once each, silently, in ways only visible by reading
// a run's step list:
//
//   1. The step originally sat AFTER the ~20-minute build+test step, so any unit-test failure
//      skipped it — the gate went quiet exactly when a PR was already in trouble.
//   2. Moved up next to the pure-file guards, it inherited the DEFAULT `if: success()` and was
//      skipped again on run 31848972923 when the unrelated Generic DOM coverage ratchet failed
//      three steps earlier.
//
// A gate that reports "skipped" reads as "not applicable" on the PR page, not as "unknown" —
// which is why both regressions survived review. Assert the shape here rather than trusting
// the next person to re-derive it.
//
// The 2026-08-24 split into build/shard jobs turned regression #1 into a STRUCTURAL guarantee
// rather than an ordering convention: the gate now lives in the `guards` job, which declares no
// `needs:` and runs no build at all, so no build or test outcome can precede it. That property
// is what the first test below pins — it is stronger than "appears earlier in the file", which
// is all the old ordering assertion could check.

const GUARD = 'Dynamic-replace guard';

describe('test.yml — dynamic-replace gate placement', () => {
    const steps = readJobSteps('guards');
    const names = steps.map((s) => s.name);

    it('parses the guards job into steps (guards the parser itself)', () => {
        expect(names).toContain(GUARD);
        expect(names).toContain('DOM-spec placement guard');
        // Other jobs also have steps; make sure none were swept in.
        expect(names).not.toContain('Run unit tests');
        expect(names).not.toContain('Run tests with coverage');
    });

    it('lives in a job that cannot be blocked by the build or the test tier', () => {
        // No `needs:` == nothing can make this job wait, or skip, on someone else's failure.
        expect(readJobNeeds('guards')).toEqual([]);
    });

    it('runs in a job that never builds — so a broken build cannot silence it', () => {
        const bodies = steps.map((s) => s.body.join('\n')).join('\n');
        expect(bodies).not.toMatch(/turbo run build/);
        expect(bodies).not.toMatch(/pnpm run build/);
    });

    it('runs the gate even when an earlier step has already failed', () => {
        const guard = steps.find((s) => s.name === GUARD);
        const condition = stepCondition(guard);

        // The default (`if: success()`) is what silenced it — anything relying on every
        // upstream step having passed reintroduces the regression.
        expect(condition, `"${GUARD}" must declare an \`if:\` — without one it inherits success() and unrelated upstream failures skip it`).toBeDefined();
        expect(condition).toMatch(/cancelled\(\)/);
        expect(condition).not.toMatch(/success\(\)/);
    });

    // The same silencing trap applies to every gate sharing the job — that is exactly how the
    // Generic DOM ratchet muted the dynamic-replace guard in regression #2. Each gate here is
    // independent and must report its own verdict.
    it('gives every gate in the job the same independence', () => {
        const gates = steps.filter((s) => s.name !== 'Checkout repo');
        expect(gates.length).toBeGreaterThan(4);
        for (const gate of gates) {
            const condition = stepCondition(gate);
            expect(condition, `"${gate.name}" must declare an \`if:\` so another gate's failure cannot skip it`).toBeDefined();
            expect(condition, `"${gate.name}" condition`).toMatch(/cancelled\(\)/);
        }
    });
});
