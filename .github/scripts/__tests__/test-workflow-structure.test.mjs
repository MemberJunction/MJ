import { describe, it, expect } from 'vitest';
import { readWorkflow, readJobNames, readJobNeeds, readJobSteps } from './lib/workflow.mjs';

// Pins the SHAPE of the sharded Unit Tests workflow (introduced 2026-08-24, replacing one
// ~55-minute job with build → N shards → gate).
//
// Every assertion here covers a failure mode that is INVISIBLE on the PR page: a workflow can
// be perfectly valid YAML, run to completion, and report a green "Run unit tests" check while
// having tested nothing. Those are precisely the regressions a human reviewer cannot catch by
// reading a diff, so they are pinned mechanically.

const WORKFLOW_TEXT = readWorkflow();

/** The lanes whose outcome the gate must consume. */
const LANES = ['guards', 'build', 'test', 'esm-guard'];

describe('test.yml — job graph', () => {
    const jobs = readJobNames();

    it('declares the expected lanes', () => {
        for (const lane of [...LANES, 'unit-tests', 'cleanup', 'coverage']) {
            expect(jobs, `job "${lane}"`).toContain(lane);
        }
    });

    // THE critical invariant. `unit-tests` is the single check a human (or a future branch
    // protection rule) reads. It runs `if: always()`, so if a lane is missing from `needs:` the
    // gate simply never sees that lane's result and reports green while the lane is red.
    // Adding a lane without adding it here is a silent loss of coverage.
    it('the gate consumes EVERY lane result', () => {
        const needs = readJobNeeds('unit-tests');
        for (const lane of LANES) {
            expect(needs, `"unit-tests" must declare needs: ${lane}`).toContain(lane);
        }
    });

    it('the gate keeps the check name humans and branch protection look for', () => {
        // Renaming this breaks any required-status-check rule pointing at it, and quietly:
        // a rule naming a check that no longer exists blocks nothing.
        expect(WORKFLOW_TEXT).toMatch(/^ {4}name: Run unit tests$/m);
    });

    it('the gate runs even when a lane failed or was skipped', () => {
        // Without `if: always()` the gate inherits success() and is SKIPPED when a lane fails —
        // and a skipped required check reads as "not applicable", not as "failed".
        const gateBlock = WORKFLOW_TEXT.split(/^ {2}unit-tests:$/m)[1].split(/^ {2}[a-z-]+:$/m)[0];
        expect(gateBlock).toMatch(/if: always\(\)/);
    });

    it('the shards depend on the build that produces their dist/', () => {
        expect(readJobNeeds('test')).toContain('build');
        expect(readJobNeeds('esm-guard')).toContain('build');
    });

    it('the cleanup job cannot be skipped by a failing lane', () => {
        // A run-scoped multi-GB cache entry that is never deleted evicts the `next` turbo seed
        // every PR restores from, so cleanup must run on failure and cancellation too.
        const cleanupBlock = WORKFLOW_TEXT.split(/^ {2}cleanup:$/m)[1].split(/^ {2}[a-z-]+:$/m)[0];
        expect(cleanupBlock).toMatch(/if: always\(\)/);
    });
});

describe('test.yml — shard fan-out', () => {
    it('drives the matrix from the planner output rather than a hardcoded list', () => {
        expect(WORKFLOW_TEXT).toMatch(/shard: \$\{\{ fromJSON\(needs\.build\.outputs\.shards\) \}\}/);
    });

    it('skips the matrix when no package in scope has tests, instead of expanding an empty matrix', () => {
        expect(WORKFLOW_TEXT).toMatch(/if: needs\.build\.outputs\.has_tests == 'true'/);
    });

    // One shard failing must not cancel the others: a red PR should list every failing package
    // in one run, not just whichever shard tripped first — otherwise fixing a PR becomes a
    // serial hunt, one CI round-trip per broken package.
    it('does not fail-fast across shards', () => {
        const testBlock = WORKFLOW_TEXT.split(/^ {2}test:$/m)[1].split(/^ {2}[a-z-]+:$/m)[0];
        expect(testBlock).toMatch(/fail-fast: false/);
    });

    // A shard that receives no packages would run `turbo run test` with no filter and execute
    // the ENTIRE suite — six times over. The planner never emits an empty shard; the workflow
    // refuses to proceed if one ever reaches it.
    it('refuses to run a shard with an empty package list', () => {
        const steps = readJobSteps('test');
        const runStep = steps.find((s) => s.name === 'Run unit tests');
        expect(runStep, 'the shard job must have a "Run unit tests" step').toBeDefined();
        const body = runStep.body.join('\n');
        expect(body).toMatch(/FILTER_ARGS\[@\]\} -eq 0/);
        expect(body).toMatch(/exit 1/);
    });

    // Package names must reach turbo through the environment, never by string-interpolating a
    // matrix value into a shell script.
    it('passes shard packages via env, not shell interpolation', () => {
        const steps = readJobSteps('test');
        const runStep = steps.find((s) => s.name === 'Run unit tests');
        const body = runStep.body.join('\n');
        expect(body).toMatch(/SHARD_PACKAGES: \$\{\{ matrix\.shard\.packages \}\}/);
        expect(body).toMatch(/read -ra PKGS <<< "\$SHARD_PACKAGES"/);
    });
});

describe('test.yml — checkout cost', () => {
    // The blobless partial clone took checkout from 3m33s to well under a minute, and every
    // job pays it. A checkout that loses `filter: blob:none` silently re-adds minutes to every
    // lane at once.
    it('every checkout uses a blobless partial clone', () => {
        const checkouts = WORKFLOW_TEXT.split(/uses: actions\/checkout@v4/).slice(1);
        expect(checkouts.length).toBeGreaterThanOrEqual(5);
        for (const [i, block] of checkouts.entries()) {
            const withBlock = block.split(/\n {6}- /)[0];
            expect(withBlock, `checkout #${i + 1} must set filter: blob:none`).toMatch(/filter: blob:none/);
        }
    });
});

describe('test.yml — backstop integrity', () => {
    // The backstop exists because MJ's @RegisterClass/ClassFactory wiring couples packages at
    // runtime with no package.json edge for turbo to see. If a push/nightly run were ever
    // filtered, that coverage would vanish silently.
    it('runs the FULL suite on push and schedule', () => {
        const steps = readJobSteps('build');
        const scope = steps.find((s) => s.name === 'Determine test scope');
        const body = scope.body.join('\n');
        // The filter is only ever set inside the pull_request branch.
        expect(body).toMatch(/if \[ "\$\{\{ github\.event_name \}\}" = "pull_request" \]/);
        expect(body).toMatch(/FULL suite \(backstop\)/);
    });

    it('sweeps every package in the ESM guard on backstop runs', () => {
        const steps = readJobSteps('esm-guard');
        const guard = steps.find((s) => s.name === 'Native-ESM import guard');
        const body = guard.body.join('\n');
        // Scoping is gated on BOTH being a PR and having a narrowed turbo filter; anything
        // else falls through to the unscoped sweep.
        expect(body).toMatch(/pull_request.*&&.*-n "\$TURBO_FILTER"/s);
        expect(body).toMatch(/node \.github\/scripts\/check-esm-imports\.mjs packages\s*$/m);
    });

    it('still files and resolves the backstop alarm', () => {
        const steps = readJobSteps('unit-tests');
        const names = steps.map((s) => s.name);
        expect(names).toContain('Alert on backstop failure');
        expect(names).toContain('Resolve backstop alarm on green');
    });
});
