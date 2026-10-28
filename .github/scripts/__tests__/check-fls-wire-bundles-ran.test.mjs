/**
 * Suite for the gate that fails the integration job when the over-the-wire FLS bundles skipped.
 *
 * The log lines below are the shapes the integration driver and the checks print. A gate that
 * passed on a log where every check skipped would be the silent green it exists to prevent, so
 * most cases here prove it fails.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bundleOutcomes, evaluate } from '../check-fls-wire-bundles-ran.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-fls-wire-bundles-ran.mjs');

const ran = (id) => `[IntegrationTestDriver] ✓ ${id}`;
const failed = (id) => `[IntegrationTestDriver] ✗ ${id}: expected 0, got 1`;
const driverSkip = (id) => `[IntegrationTestDriver] − ${id}: SKIPPED: ${id}: fixture not usable`;
const checkSkip = (id) => `  ⚠ ${id} SKIPPED — 'MJ: Employees' really has field-level security configured`;

const BOTH_RAN = [
    ran('fls-enforcement-client.FC1'), ran('fls-enforcement-client.FC2'),
    ran('fls-closeout-client.CW1'), failed('fls-closeout-client.CW2'),
].join('\n');

describe('bundleOutcomes', () => {
    it('collects executed checks, passed or failed', () => {
        expect(bundleOutcomes(BOTH_RAN, 'fls-closeout-client')).toEqual({
            Executed: ['fls-closeout-client.CW1', 'fls-closeout-client.CW2'], Skipped: [],
        });
    });

    it('reads both the driver\'s skip line and the check\'s own skip line', () => {
        const log = [checkSkip('fls-closeout-client.CW7'), driverSkip('fls-closeout-client.CW7'), driverSkip('fls-closeout-client.CW8')].join('\n');
        expect(bundleOutcomes(log, 'fls-closeout-client').Skipped).toEqual(['fls-closeout-client.CW7', 'fls-closeout-client.CW8']);
    });

    it('ignores colour codes around the markers', () => {
        const log = `\u001b[33m${driverSkip('fls-enforcement-client.FC1')}\u001b[39m`;
        expect(bundleOutcomes(log, 'fls-enforcement-client').Skipped).toEqual(['fls-enforcement-client.FC1']);
    });

    it('does not count another bundle whose name starts the same way', () => {
        const log = [ran('fls-enforcement-client-extra.FC1'), driverSkip('pre-fls-closeout-client.CW1')].join('\n');
        expect(bundleOutcomes(log, 'fls-enforcement-client').Executed).toEqual([]);
        expect(bundleOutcomes(log, 'fls-closeout-client').Skipped).toEqual([]);
    });
});

describe('evaluate', () => {
    it('passes when both bundles ran and none skipped, even with a failed check (the tier step fails on that)', () => {
        expect(evaluate(BOTH_RAN)).toEqual([]);
    });

    it('fails when one check of a bundle skipped while the others ran', () => {
        const problems = evaluate(`${BOTH_RAN}\n${driverSkip('fls-closeout-client.CW8')}`);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/IT134.*CW8/);
    });

    it('fails when a bundle ran nothing at all, as when its test was skipped whole', () => {
        const problems = evaluate(ran('fls-enforcement-client.FC1'));
        expect(problems).toEqual(['IT134 (fls-closeout-client) ran no checks']);
    });

    it('fails both bundles on an empty log', () => {
        expect(evaluate('')).toHaveLength(2);
    });
});

describe('command line', () => {
    function runOn(logText) {
        const dir = mkdtempSync(join(tmpdir(), 'fls-wire-gate-'));
        const path = join(dir, 'integration.log');
        writeFileSync(path, logText);
        return spawnSync(process.execPath, [SCRIPT, path], { encoding: 'utf8' });
    }

    it('exits 0 when both bundles ran', () => {
        expect(runOn(BOTH_RAN).status).toBe(0);
    });

    it('exits 1 with an ::error:: annotation when a check skipped', () => {
        const result = runOn(`${BOTH_RAN}\n${checkSkip('fls-enforcement-client.FC3')}`);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/::error::IT92/);
    });

    it('exits 1 when the log file is missing', () => {
        const result = spawnSync(process.execPath, [SCRIPT, join(tmpdir(), 'no-such-integration.log')], { encoding: 'utf8' });
        expect(result.status).toBe(1);
    });
});
