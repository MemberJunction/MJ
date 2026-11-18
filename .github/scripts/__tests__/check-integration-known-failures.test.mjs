import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resultKey, collectOutcomes, compareWithKnownFailures, report } from '../check-integration-known-failures.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-integration-known-failures.mjs');

const oracle = (oracleType, passed, skipped = false, message = '', skipAllowed = true) => ({
    oracleType,
    passed,
    message,
    details: skipped ? { Skipped: true, SkipAllowed: skipAllowed } : {},
});
const suiteRun = (...tests) => ({ testResults: tests });
const test = (testName, status, ...oracleResults) => ({ testName, status, oracleResults });

describe('resultKey', () => {
    it('uses the check ID when the result is a check', () => {
        expect(resultKey('IT87 - Nested Transactions', 'nested-transactions.NT8b')).toBe('nested-transactions.NT8b');
    });

    it('prefixes the test name for a bundle-level result', () => {
        expect(resultKey('IT52 - Search', 'gate')).toBe('IT52 - Search#gate');
    });
});

describe('collectOutcomes', () => {
    it('classifies passed, failed and skipped checks', () => {
        const outcomes = collectOutcomes(suiteRun(
            test('IT1', 'Failed', oracle('a.A1', true), oracle('a.A2', false), oracle('a.A3', true, true)),
        ));
        expect(outcomes.map((o) => [o.Key, o.Outcome])).toEqual([
            ['a.A1', 'passed'],
            ['a.A2', 'failed'],
            ['a.A3', 'skipped'],
        ]);
    });

    it('counts a skip the skip gate does not allow as a failure', () => {
        const outcomes = collectOutcomes(suiteRun(test('IT1', 'Passed', oracle('a.A1', true, true, 'SKIPPED: no pool', false))));
        expect(outcomes.map((o) => o.Outcome)).toEqual(['failed']);
    });

    it('records a bundle that failed before any check ran', () => {
        const outcomes = collectOutcomes(suiteRun(test('IT9 - Broken', 'Error')));
        expect(outcomes).toEqual([{ Key: 'IT9 - Broken#bundle', Outcome: 'failed', Message: 'Error' }]);
    });

    it('reads a single test run as well as a suite run', () => {
        const outcomes = collectOutcomes(test('IT1', 'Failed', oracle('a.A1', false)));
        expect(outcomes.map((o) => [o.Key, o.Outcome])).toEqual([['a.A1', 'failed']]);
    });

    it('ignores a bundle with no checks that passed or skipped', () => {
        expect(collectOutcomes(suiteRun(test('IT9', 'Skipped')))).toEqual([]);
    });
});

describe('compareWithKnownFailures', () => {
    const outcomes = [
        { Key: 'a.A1', Outcome: 'failed', Message: 'known' },
        { Key: 'a.A2', Outcome: 'failed', Message: 'new' },
        { Key: 'a.A3', Outcome: 'passed', Message: '' },
        { Key: 'a.A4', Outcome: 'skipped', Message: '' },
    ];
    const known = { 'a.A1': 'reason', 'a.A3': 'reason', 'a.A4': 'reason', 'a.A5': 'reason' };

    it('separates new failures, fixed checks and checks that did not run', () => {
        const result = compareWithKnownFailures(outcomes, known);
        expect(result.NewFailures.map((o) => o.Key)).toEqual(['a.A2']);
        expect(result.Fixed).toEqual(['a.A3']);
        expect(result.NotRun.sort()).toEqual(['a.A4', 'a.A5']);
        expect(result.StillFailing).toEqual(['a.A1']);
    });

    it('counts a check as failed when any shard failed it', () => {
        const result = compareWithKnownFailures(
            [{ Key: 'a.A1', Outcome: 'passed', Message: '' }, { Key: 'a.A1', Outcome: 'failed', Message: 'x' }],
            {},
        );
        expect(result.NewFailures.map((o) => o.Key)).toEqual(['a.A1']);
    });

    it('lets a pass in one shard outrank a skip in another', () => {
        const result = compareWithKnownFailures(
            [{ Key: 'a.A1', Outcome: 'skipped', Message: '' }, { Key: 'a.A1', Outcome: 'passed', Message: '' }],
            { 'a.A1': 'reason' },
        );
        expect(result.Fixed).toEqual(['a.A1']);
    });
});

describe('report', () => {
    const quiet = () => {};

    it('fails on a new failure', () => {
        expect(report({ NewFailures: [{ Key: 'a.A2', Message: 'x' }], Fixed: [], NotRun: [], StillFailing: [], Checked: 1 }, quiet)).toBe(1);
    });

    it('fails when a known failure now passes, so the list shrinks', () => {
        expect(report({ NewFailures: [], Fixed: ['a.A3'], NotRun: [], StillFailing: [], Checked: 1 }, quiet)).toBe(1);
    });

    it('passes when every failure is known, even if some did not run', () => {
        expect(report({ NewFailures: [], Fixed: [], NotRun: ['a.A4'], StillFailing: ['a.A1'], Checked: 2 }, quiet)).toBe(0);
    });
});

describe('CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'known-failures-'));
    const listPath = join(dir, 'list.json');
    const shardPath = join(dir, 'shard.json');
    writeFileSync(listPath, JSON.stringify({ KnownFailures: { 'a.A1': 'reason' } }));
    writeFileSync(shardPath, JSON.stringify(suiteRun(test('IT1', 'Failed', oracle('a.A1', false), oracle('a.A2', true)))));

    it('exits 0 when the only failure is known', () => {
        expect(spawnSync(process.execPath, [SCRIPT, listPath, shardPath]).status).toBe(0);
    });

    it('exits 1 when a shard result is missing, since the run cannot be judged', () => {
        expect(spawnSync(process.execPath, [SCRIPT, listPath, join(dir, 'missing.json')]).status).toBe(1);
    });

    it('exits 2 without arguments', () => {
        expect(spawnSync(process.execPath, [SCRIPT]).status).toBe(2);
    });
});
