import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
// Deliberately parses by hand instead of importing `yaml`: this directory is not an npm
// workspace and declares no dependencies, so a bare `yaml` import resolves only by walking up
// to a parent node_modules that exists on some checkouts and not in CI.

const WORKFLOW = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'workflows', 'test.yml');

const GUARD = 'Dynamic-replace guard';
const BUILD = 'Build + run unit tests';

/**
 * Split the `test` job's step list into `{ name, body }` records, in file order.
 *
 * Steps are the 6-space `      - name:` entries; a step's body runs to the next such entry.
 * Scanning stops at the next top-level job so the `coverage` job's steps can't leak in.
 */
function readTestJobSteps() {
    const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
    const steps = [];
    let inTestJob = false;
    let current = null;

    for (const line of lines) {
        const jobMatch = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (jobMatch) {
            if (current) steps.push(current);
            current = null;
            inTestJob = jobMatch[1] === 'test';
            continue;
        }
        if (!inTestJob) continue;

        const stepMatch = /^ {6}- name: (.+?)\s*$/.exec(line);
        if (stepMatch) {
            if (current) steps.push(current);
            current = { name: stepMatch[1], body: [] };
            continue;
        }
        if (current) current.body.push(line);
    }
    if (current) steps.push(current);
    return steps;
}

describe('test.yml — dynamic-replace gate placement', () => {
    const steps = readTestJobSteps();
    const names = steps.map((s) => s.name);

    it('parses the test job into steps (guards the parser itself)', () => {
        expect(names).toContain(GUARD);
        expect(names).toContain(BUILD);
        // The coverage job also has a "Build" step; make sure it was not swept in.
        expect(names).not.toContain('Run tests with coverage');
    });

    it('runs the gate before the build, not after it', () => {
        expect(names.indexOf(GUARD)).toBeLessThan(names.indexOf(BUILD));
    });

    it('runs the gate even when an earlier step has already failed', () => {
        const guard = steps.find((s) => s.name === GUARD);
        const condition = guard.body.map((l) => /^ {8}if:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);

        // The default (`if: success()`) is what silenced it — anything relying on every
        // upstream step having passed reintroduces the regression.
        expect(condition, `"${GUARD}" must declare an \`if:\` — without one it inherits success() and unrelated upstream failures skip it`).toBeDefined();
        expect(condition).toMatch(/cancelled\(\)/);
        expect(condition).not.toMatch(/success\(\)/);
    });
});
