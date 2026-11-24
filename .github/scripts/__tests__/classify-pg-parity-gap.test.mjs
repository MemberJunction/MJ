import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readPushErrors, missingEntityIn, classifyPushFailures, verdict } from '../classify-pg-parity-gap.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'classify-pg-parity-gap.mjs');

/** One `mj sync push --ci` log: progress events, then the JSON result line, as the CLI prints them. */
const pushLog = (...messages) =>
    [
        '{"event":"start","command":"sync:push"}',
        '{"event":"step-failed","label":"Validation reported issues"}',
        JSON.stringify({
            version: '1',
            success: false,
            command: 'sync:push',
            durationSeconds: 1.4,
            errors: messages.map((message) => ({ context: 'validation', message, code: 'E_VALIDATION_FAILED' })),
        }),
    ].join('\n');

const SUMMARY = 'Validation failed. Cannot proceed with push.';
// The real messages: the CI lane at a87b3add3, and Caeleb's local run with --exclude=rhythm-templates.
const MISSING_DIR = 'Entity "MJ: AI Agent Rhythm Templates" not found in metadata — /home/runner/work/MJ/MJ/metadata/rhythm-templates/.mj-sync.json';
const MISSING_LOOKUP = "Lookup failed: No record found in 'MJ: Entities' where Name='MJ: Agent Channels'";

describe('readPushErrors', () => {
    it('reads the error messages from the JSON result line', () => {
        expect(readPushErrors(pushLog(SUMMARY, MISSING_DIR))).toEqual([SUMMARY, MISSING_DIR]);
    });

    it('takes the result from a line that carries a timestamp prefix', () => {
        const prefixed = pushLog(MISSING_DIR).split('\n').map((l) => `2026-11-24T01:49:38.000Z ${l}`).join('\n');
        expect(readPushErrors(prefixed)).toEqual([MISSING_DIR]);
    });

    it('returns null when the log has no sync:push result (a crash)', () => {
        expect(readPushErrors('TypeError: cannot read properties of undefined\n    at Object.<anonymous>')).toBeNull();
    });
});

describe('missingEntityIn', () => {
    it('names the entity of a directory whose table is missing', () => {
        expect(missingEntityIn(MISSING_DIR)).toBe('MJ: AI Agent Rhythm Templates');
    });

    it('names the entity a lookup into MJ: Entities could not find', () => {
        expect(missingEntityIn(MISSING_LOOKUP)).toBe('MJ: Agent Channels');
    });

    it('does not treat a lookup into real data as a missing entity', () => {
        expect(missingEntityIn("Lookup failed: No record found in 'MJ: Roles' where Name='Developer'")).toBeNull();
    });

    it('does not treat a save failure as a missing entity', () => {
        expect(missingEntityIn('Failed to save record in MJ: Actions: column "Foo" does not exist')).toBeNull();
    });
});

describe('classifyPushFailures', () => {
    it('is a parity gap when every cause is a missing entity, across logs', () => {
        const result = classifyPushFailures([pushLog(SUMMARY, MISSING_DIR), pushLog(MISSING_LOOKUP)]);
        expect(result).toEqual({ gap: true, entities: ['MJ: AI Agent Rhythm Templates', 'MJ: Agent Channels'], others: [], unreadable: 0 });
    });

    it('is not a gap when any cause is something else', () => {
        const result = classifyPushFailures([pushLog(SUMMARY, MISSING_DIR, 'Failed to save record: deadlock detected')]);
        expect(result.gap).toBe(false);
        expect(result.others).toEqual(['Failed to save record: deadlock detected']);
    });

    it('is not a gap when a log cannot be read', () => {
        const result = classifyPushFailures([pushLog(MISSING_DIR), 'Segmentation fault']);
        expect(result.gap).toBe(false);
        expect(result.unreadable).toBe(1);
    });

    it('is not a gap when the push names only the summary error', () => {
        expect(classifyPushFailures([pushLog(SUMMARY)]).gap).toBe(false);
    });

    it('is not a gap with no logs at all', () => {
        expect(classifyPushFailures([]).gap).toBe(false);
    });
});

describe('verdict', () => {
    const gap = classifyPushFailures([pushLog(SUMMARY, MISSING_DIR)]);
    const regression = classifyPushFailures([pushLog('Failed to save record: deadlock detected')]);

    it('lets a parity gap through in regressions mode, naming the entities', () => {
        const result = verdict(gap, 'regressions');
        expect(result.pass).toBe(true);
        expect(result.message).toMatch(/MJ: AI Agent Rhythm Templates/);
    });

    it('blocks a parity gap in gate mode', () => {
        expect(verdict(gap, 'gate').pass).toBe(false);
    });

    it('blocks anything else in either mode', () => {
        expect(verdict(regression, 'regressions').pass).toBe(false);
        expect(verdict(regression, 'gate').pass).toBe(false);
    });
});

describe('the CLI', () => {
    const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    const dir = mkdtempSync(join(tmpdir(), 'pg-parity-'));
    const gapLog = join(dir, 'gap.log');
    const badLog = join(dir, 'bad.log');
    writeFileSync(gapLog, pushLog(SUMMARY, MISSING_DIR));
    writeFileSync(badLog, pushLog('Failed to save record: deadlock detected'));

    it('exits 0 and writes gap=true for a parity gap in regressions mode', () => {
        const output = join(dir, 'output-gap');
        writeFileSync(output, '');
        const result = run(['--mode=regressions', gapLog], { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '' });
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/::warning title=PostgreSQL parity gap::/);
        expect(readFileSync(output, 'utf8')).toBe('gap=true\n');
    });

    it('exits 1 and writes no gap for a regression', () => {
        const output = join(dir, 'output-bad');
        writeFileSync(output, '');
        const result = run(['--mode=regressions', badLog], { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '' });
        expect(result.status).toBe(1);
        expect(readFileSync(output, 'utf8')).toBe('');
    });

    it('exits 1 for a parity gap in gate mode', () => {
        expect(run(['--mode=gate', gapLog], { GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' }).status).toBe(1);
    });

    it('treats a missing log file as unreadable, so it blocks', () => {
        expect(run(['--mode=regressions', join(dir, 'nope.log')], { GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' }).status).toBe(1);
    });

    it('refuses an unknown mode', () => {
        expect(run(['--mode=report', gapLog]).status).toBe(2);
    });
});
