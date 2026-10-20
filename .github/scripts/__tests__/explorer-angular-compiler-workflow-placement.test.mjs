import { describe, it, expect } from 'vitest';
import { readWorkflow, readJobSteps, readJobNeeds, stepCondition } from './lib/workflow.mjs';

// Pins WHERE the MJExplorer @angular/compiler guard (issue #4427) runs. The failure this guard
// exists to catch is caused by a PR that edits ONLY packages/MJExplorer/package.json, so the
// guard must run on that PR shape. It first shipped as its own path-filtered workflow — which
// ran, but as a separate check nothing aggregates. In test.yml's `guards` job it is part of
// the `Run unit tests` gate, runs with no build and no affected-filtering, and inherits the
// workflow's concurrency group.

const GUARD = 'MJExplorer @angular/compiler guard';
const SCRIPT = '.github/scripts/check-explorer-angular-compiler.mjs';

describe('test.yml — MJExplorer @angular/compiler guard placement', () => {
    const steps = readJobSteps('guards');
    const guard = steps.find((s) => s.name === GUARD);

    it('lives in the guards job, which nothing can block or affected-filter', () => {
        expect(guard, `"${GUARD}" step in the guards job`).toBeDefined();
        expect(readJobNeeds('guards')).toEqual([]);
    });

    it('self-tests the detector before checking the real manifest', () => {
        const body = guard.body.join('\n');
        const selfTest = body.indexOf(`node ${SCRIPT} --self-test`);
        const realCheck = body.search(new RegExp(`node ${SCRIPT.replaceAll('.', '\\.')}\\s*$`, 'm'));
        expect(selfTest, 'self-test invocation').toBeGreaterThanOrEqual(0);
        expect(realCheck, 'real-manifest invocation').toBeGreaterThan(selfTest);
    });

    it('reports its own verdict even when an earlier guard failed', () => {
        expect(stepCondition(guard)).toMatch(/cancelled\(\)/);
    });

    // packages/MJExplorer/package.json is already covered by `packages/**`; the script is not.
    // Without this entry a PR weakening only the guard would not run it.
    it('triggers the workflow on an edit to the guard script alone', () => {
        expect(readWorkflow()).toContain(`- '${SCRIPT}'`);
    });
});
