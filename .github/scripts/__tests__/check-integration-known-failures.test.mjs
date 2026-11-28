import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resultKey, collectOutcomes, compareWithKnownFailures, report, readParityGap, parityGapPatterns } from '../check-integration-known-failures.mjs';

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

    it('never gates on a flaky check, whether it fails or passes', () => {
        const result = compareWithKnownFailures(
            [{ Key: 'a.F1', Outcome: 'failed', Message: 'slow' }, { Key: 'a.F2', Outcome: 'passed', Message: '' }],
            {},
            { 'a.F1': 'timing', 'a.F2': 'timing' },
        );
        expect(result.NewFailures).toEqual([]);
        expect(result.Fixed).toEqual([]);
        expect(result.FlakyFailed).toEqual(['a.F1']);
        expect(report(result, () => {})).toBe(0);
    });

    const GAP = { Entities: ['MJ: Agent Channels'], Fields: [{ Entity: 'MJ: AI Agents', Field: 'BaseAgentID' }] };
    const failed = (Key, Message) => ({ Key, Outcome: 'failed', Message });

    it('attributes the errors a missing entity or column raises, naming one the gap holds, and does not gate on them', () => {
        const result = compareWithKnownFailures(
            [
                failed('a.E1', 'Open Agent Channel failed: Entity MJ: Agent Channels not found in metadata or could not be created'),
                failed('a.E2', `Lookup failed: No record found in 'MJ: Entities' where Name='MJ: Agent Channels'`),
                failed('a.F1', 'Field BaseAgentID does not exist on MJ: AI Agents'),
                failed('a.F2', 'column "BaseAgentID" does not exist'),
                failed('a.F3', 'column a.BaseAgentID does not exist'),
            ],
            {},
            {},
            GAP,
        );
        expect(result.NewFailures).toEqual([]);
        expect(result.GapFailures.map((o) => o.Key)).toEqual(['a.E1', 'a.E2', 'a.F1', 'a.F2', 'a.F3']);
        expect(report(result, () => {})).toBe(0);
    });

    it('still gates on an unrelated error that mentions a missing entity or column by name', () => {
        const result = compareWithKnownFailures(
            [
                failed('a.P1', 'Permission denied: user cannot read MJ: Agent Channels'),
                failed('a.P2', 'Save failed for MJ: AI Agents: BaseAgentID must reference an active agent'),
                failed('a.P3', 'Entity MJ: Agent Channels could not be saved: deadlock detected'),
            ],
            {},
            {},
            GAP,
        );
        expect(result.GapFailures).toEqual([]);
        expect(result.NewFailures.map((o) => o.Key)).toEqual(['a.P1', 'a.P2', 'a.P3']);
        expect(report(result, () => {})).toBe(1);
    });

    it('matches only the affected entity and column', () => {
        const result = compareWithKnownFailures(
            [
                failed('a.C1', 'column "BaseAgentIDs" does not exist'),
                failed('a.C4', 'column a.BaseAgentIDs does not exist'),
                failed('a.C5', 'column a."BaseAgentID" does not exist'),
                failed('a.C2', 'Field BaseAgentID does not exist on MJ: Actions'),
                failed('a.C3', 'Entity MJ: Agent Channel Participants not found in metadata'),
            ],
            {},
            {},
            GAP,
        );
        expect(result.GapFailures).toEqual([]);
        expect(result.NewFailures.map((o) => o.Key)).toEqual(['a.C1', 'a.C4', 'a.C5', 'a.C2', 'a.C3']);
    });

    it('attributes nothing to a gap when nothing is missing', () => {
        const result = compareWithKnownFailures([failed('a.R1', 'Entity MJ: Agent Channels not found in metadata')], {});
        expect(result.GapFailures).toEqual([]);
        expect(result.NewFailures.map((o) => o.Key)).toEqual(['a.R1']);
    });

    it('reads a parity-gap file, and refuses a line it does not understand', () => {
        expect(readParityGap('entity\tMJ: Agent Channels\nfield\tMJ: AI Agents\tBaseAgentID\n')).toEqual(GAP);
        expect(() => readParityGap('MJ: Agent Channels\n')).toThrow(/Unreadable parity-gap line/);
        expect(parityGapPatterns(null)).toEqual([]);
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

    it('exits 2 when a check is on both lists', () => {
        const both = join(dir, 'both.json');
        writeFileSync(both, JSON.stringify({ KnownFailures: { 'a.A1': 'r' }, Flaky: { 'a.A1': 'r' } }));
        expect(spawnSync(process.execPath, [SCRIPT, both, shardPath]).status).toBe(2);
    });

    it('exits 0 when the only unlisted failure is a gap error, and 1 without the gap file', () => {
        const gapShard = join(dir, 'gap-shard.json');
        const gapFile = join(dir, 'gap.txt');
        writeFileSync(gapShard, JSON.stringify(suiteRun(test('IT2', 'Failed', oracle('a.A3', false, false, 'Entity MJ: Agent Channels not found in metadata')))));
        writeFileSync(gapFile, 'entity\tMJ: Agent Channels\n');
        expect(spawnSync(process.execPath, [SCRIPT, `--parity-gap=${gapFile}`, listPath, gapShard]).status).toBe(0);
        expect(spawnSync(process.execPath, [SCRIPT, listPath, gapShard]).status).toBe(1);
    });

    it('exits 1 when the only unlisted failure merely mentions a missing entity', () => {
        const shard = join(dir, 'mention-shard.json');
        const gapFile = join(dir, 'gap-mention.txt');
        writeFileSync(shard, JSON.stringify(suiteRun(test('IT3', 'Failed', oracle('a.A4', false, false, 'Permission denied on MJ: Agent Channels')))));
        writeFileSync(gapFile, 'entity\tMJ: Agent Channels\n');
        expect(spawnSync(process.execPath, [SCRIPT, `--parity-gap=${gapFile}`, listPath, shard]).status).toBe(1);
    });

    it('exits 2 when the parity-gap file is missing or unreadable', () => {
        expect(spawnSync(process.execPath, [SCRIPT, `--parity-gap=${join(dir, 'nope.txt')}`, listPath, shardPath]).status).toBe(2);
        const bad = join(dir, 'bad-gap.txt');
        writeFileSync(bad, 'MJ: Agent Channels\n');
        expect(spawnSync(process.execPath, [SCRIPT, `--parity-gap=${bad}`, listPath, shardPath]).status).toBe(2);
    });

    it('exits 2 without arguments', () => {
        expect(spawnSync(process.execPath, [SCRIPT]).status).toBe(2);
    });
});
