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
// The gate now lives in the install-free `quick-gates` job rather than in `test`, which serves
// the same intent more strongly: a job with no build step cannot put the gate behind a build,
// and a job with no `needs:` cannot be blocked by another job failing. So the assertions below
// pin those PROPERTIES (no build in its job, no `needs:`, an explicit non-success() condition)
// rather than an index within one particular job — the property is what kept regressing.
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
const BUILD_STEPS = ['Build + run unit tests', 'Build', 'Build the packages to sweep'];

/**
 * Parse every job into `{ name, needs, steps: [{ name, body }] }`, in file order.
 *
 * Steps are the 6-space `      - name:` entries; a step's body runs to the next such entry.
 */
function readJobs() {
    const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
    const jobs = [];
    let job = null;
    let step = null;

    const flushStep = () => { if (job && step) job.steps.push(step); step = null; };

    for (const line of lines) {
        const jobMatch = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (jobMatch) {
            flushStep();
            job = { name: jobMatch[1], needs: null, steps: [] };
            jobs.push(job);
            continue;
        }
        if (!job) continue;

        const needsMatch = /^ {4}needs:\s*(.+?)\s*$/.exec(line);
        if (needsMatch) { job.needs = needsMatch[1]; continue; }

        const stepMatch = /^ {6}- name: (.+?)\s*$/.exec(line);
        if (stepMatch) { flushStep(); step = { name: stepMatch[1], body: [] }; continue; }
        if (step) step.body.push(line);
    }
    flushStep();
    return jobs;
}

describe('test.yml — dynamic-replace gate placement', () => {
    const jobs = readJobs();
    const owning = jobs.filter((j) => j.steps.some((s) => s.name === GUARD));

    it('parses the workflow into jobs and steps (guards the parser itself)', () => {
        expect(jobs.map((j) => j.name)).toEqual(expect.arrayContaining(['quick-gates', 'test', 'coverage']));
        expect(owning, `exactly one job must own "${GUARD}"`).toHaveLength(1);
    });

    it('runs the gate in a job that has no build step, so it can never sit behind one', () => {
        const names = owning[0].steps.map((s) => s.name);
        const builds = names.filter((n) => BUILD_STEPS.includes(n));
        expect(builds, `"${GUARD}" shares a job with ${builds.join(', ')} — it would run behind the build again`).toEqual([]);
    });

    it('runs the gate in a job nothing can block', () => {
        expect(owning[0].needs, `"${GUARD}"'s job must not declare needs: — a failing dependency would skip it`).toBeNull();
    });

    it('runs the gate even when an earlier step has already failed', () => {
        const guard = owning[0].steps.find((s) => s.name === GUARD);
        const condition = guard.body.map((l) => /^ {8}if:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);

        // The default (`if: success()`) is what silenced it — anything relying on every
        // upstream step having passed reintroduces the regression.
        expect(condition, `"${GUARD}" must declare an \`if:\` — without one it inherits success() and unrelated upstream failures skip it`).toBeDefined();
        expect(condition).toMatch(/cancelled\(\)/);
        expect(condition).not.toMatch(/success\(\)/);
    });
});
