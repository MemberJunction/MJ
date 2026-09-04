import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
    extractTestPackages,
    planShards,
    loadWeights,
    parseArgs,
    readTurboTestPackages,
    parseDuration,
    extractDurationsFromLog,
    recordWeights,
} from '../plan-test-shards.mjs';

const SCRIPTS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const WEIGHTS_PATH = join(SCRIPTS_DIR, 'test-shard-weights.json');

/** Shorthand for the weight-table shape planShards consumes. */
const weights = (packages, defaultSeconds = 4) => ({ packages, defaultSeconds });

/** Every package across every shard, flattened. */
const allPackages = (shards) => shards.flatMap((s) => s.packages.split(',').filter(Boolean));

describe('extractTestPackages', () => {
    it('keeps only `test` tasks, dropping the transitive build tasks', () => {
        const dry = {
            tasks: [
                { task: 'build', package: '@mj/a', command: 'tsc' },
                { task: 'build', package: '@mj/b', command: 'tsc' },
                { task: 'test', package: '@mj/a', command: 'vitest run' },
            ],
        };
        expect(extractTestPackages(dry)).toEqual(['@mj/a']);
    });

    it('drops packages turbo lists without a real test command', () => {
        const dry = {
            tasks: [
                { task: 'test', package: '@mj/real', command: 'vitest run' },
                { task: 'test', package: '@mj/nonexistent', command: '<NONEXISTENT>' },
                { task: 'test', package: '@mj/empty', command: '' },
                { task: 'test', package: '@mj/missing' },
            ],
        };
        expect(extractTestPackages(dry)).toEqual(['@mj/real']);
    });

    it('de-duplicates and sorts so the same input always yields the same plan', () => {
        const dry = {
            tasks: [
                { task: 'test', package: '@mj/z', command: 'vitest run' },
                { task: 'test', package: '@mj/a', command: 'vitest run' },
                { task: 'test', package: '@mj/z', command: 'vitest run' },
            ],
        };
        expect(extractTestPackages(dry)).toEqual(['@mj/a', '@mj/z']);
    });

    it('returns an empty list when nothing is in scope', () => {
        expect(extractTestPackages({ tasks: [] })).toEqual([]);
    });

    // A truncated / malformed dry run must NOT read as "no packages" — that would silently
    // skip the entire test tier while the workflow reported success.
    it('throws rather than reporting an empty scope when the dry run has no tasks array', () => {
        expect(() => extractTestPackages({})).toThrow(/no `tasks` array/);
        expect(() => extractTestPackages(null)).toThrow(/no `tasks` array/);
    });
});

describe('planShards — correctness', () => {
    it('places every package in exactly one shard', () => {
        const pkgs = Array.from({ length: 57 }, (_, i) => `@mj/pkg-${i}`);
        const shards = planShards(pkgs, 6, weights({}));
        const flat = allPackages(shards);
        expect(flat.slice().sort()).toEqual(pkgs.slice().sort());
        expect(new Set(flat).size).toBe(pkgs.length);
    });

    it('never emits an empty shard, even when packages are fewer than shards', () => {
        const shards = planShards(['@mj/a', '@mj/b'], 6, weights({}));
        expect(shards).toHaveLength(2);
        expect(shards.every((s) => s.packages.length > 0)).toBe(true);
        expect(shards.map((s) => s.total)).toEqual([2, 2]);
    });

    it('returns no shards for an empty scope', () => {
        expect(planShards([], 6, weights({}))).toEqual([]);
    });

    it('handles a single package', () => {
        const shards = planShards(['@mj/only'], 6, weights({}));
        expect(shards).toEqual([{ index: 1, total: 1, packages: '@mj/only', weight: 7 }]);
    });

    it('labels index/total against the number of shards actually emitted', () => {
        const shards = planShards(['a', 'b', 'c'], 3, weights({}));
        expect(shards.map((s) => s.index)).toEqual([1, 2, 3]);
        expect(shards.every((s) => s.total === 3)).toBe(true);
    });

    it('rejects a non-positive or non-integer shard count', () => {
        expect(() => planShards(['a'], 0, weights({}))).toThrow(/positive integer/);
        expect(() => planShards(['a'], -1, weights({}))).toThrow(/positive integer/);
        expect(() => planShards(['a'], 2.5, weights({}))).toThrow(/positive integer/);
    });

    it('is deterministic — identical input yields byte-identical shards', () => {
        const pkgs = Array.from({ length: 40 }, (_, i) => `@mj/p${i}`);
        const w = weights(Object.fromEntries(pkgs.map((p, i) => [p, (i * 37) % 100])));
        expect(JSON.stringify(planShards(pkgs, 5, w))).toBe(JSON.stringify(planShards(pkgs, 5, w)));
    });

    it('does not depend on the order packages arrive in', () => {
        const pkgs = Array.from({ length: 30 }, (_, i) => `@mj/p${i}`);
        const w = weights(Object.fromEntries(pkgs.map((p, i) => [p, (i * 17) % 60])));
        const forward = planShards(pkgs, 4, w);
        const reversed = planShards([...pkgs].reverse(), 4, w);
        expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    });
});

describe('planShards — balance', () => {
    // The whole point of the weight table: the heaviest suites must be spread across shards.
    // A naive round-robin over an alphabetical list clusters them, and the heaviest shard
    // becomes the critical path that eats the win.
    it('separates the heavy suites instead of clustering them', () => {
        const heavy = { '@mj/h1': 300, '@mj/h2': 200, '@mj/h3': 180, '@mj/h4': 140 };
        const light = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`@mj/l${i}`, 2]));
        const shards = planShards([...Object.keys(heavy), ...Object.keys(light)], 4, weights({ ...heavy, ...light }));

        for (const shard of shards) {
            const heavyHere = shard.packages.split(',').filter((p) => p in heavy);
            expect(heavyHere.length).toBe(1);
        }
    });

    it('keeps the heaviest shard close to the mean (LPT quality bound)', () => {
        const w = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`@mj/p${i}`, (i * 13) % 90]));
        const shards = planShards(Object.keys(w), 6, weights(w));
        const total = shards.reduce((n, s) => n + s.weight, 0);
        const mean = total / shards.length;
        const max = Math.max(...shards.map((s) => s.weight));
        // LPT guarantees <= 4/3 of optimal; optimal is >= mean. Generous bound, still
        // fails loudly if the packer regresses to round-robin on a skewed distribution.
        expect(max).toBeLessThanOrEqual(mean * 1.34);
    });

    it('counts per-task overhead so a shard of many tiny packages is not treated as free', () => {
        // 20 packages at 0s each must not pack as weight 0 — they cost real process spin-up.
        const w = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`@mj/t${i}`, 0]));
        const [shard] = planShards(Object.keys(w), 1, weights(w));
        expect(shard.weight).toBe(60); // 20 × 3s overhead
    });

    it('falls back to the default weight for packages missing from the table', () => {
        const shards = planShards(['@mj/known', '@mj/unknown'], 1, weights({ '@mj/known': 10 }, 4));
        // (10 + 3) + (4 + 3)
        expect(shards[0].weight).toBe(20);
    });

    // Balance against the REAL table and the real package count, so a future weight-table
    // edit that wrecks the distribution is caught here rather than in a 40-minute CI run.
    it('balances the real 307-package scope within 25% of the mean', () => {
        const table = loadWeights(WEIGHTS_PATH);
        const names = Object.keys(table.packages);
        expect(names.length).toBeGreaterThan(250);
        const shards = planShards(names, 6, table);
        const mean = shards.reduce((n, s) => n + s.weight, 0) / shards.length;
        const max = Math.max(...shards.map((s) => s.weight));
        expect(max).toBeLessThanOrEqual(mean * 1.25);
    });
});

describe('loadWeights', () => {
    it('reads the committed table', () => {
        const table = loadWeights(WEIGHTS_PATH);
        expect(typeof table.defaultSeconds).toBe('number');
        expect(Object.keys(table.packages).length).toBeGreaterThan(250);
    });

    // Planning must never be the reason CI cannot start.
    it('degrades to uniform weights when the table is missing', () => {
        const table = loadWeights(join(SCRIPTS_DIR, 'definitely-not-here.json'));
        expect(table.packages).toEqual({});
        expect(typeof table.defaultSeconds).toBe('number');
    });

    it('degrades to uniform weights when the table is unparseable', () => {
        const table = loadWeights(join(SCRIPTS_DIR, 'plan-test-shards.mjs')); // valid path, not JSON
        expect(table.packages).toEqual({});
    });
});

describe('committed weight table', () => {
    it('is valid JSON with a numeric weight for every package', () => {
        const parsed = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'));
        expect(typeof parsed._defaultSeconds).toBe('number');
        for (const [name, seconds] of Object.entries(parsed.packages)) {
            expect(typeof seconds, `${name} weight`).toBe('number');
            expect(Number.isFinite(seconds), `${name} weight finite`).toBe(true);
            expect(seconds, `${name} weight non-negative`).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('parseArgs', () => {
    it('parses the --key=value form', () => {
        expect(parseArgs(['--shards=6', '--filter=...[origin/next]'])).toEqual({
            shards: '6',
            filter: '...[origin/next]',
        });
    });

    it('parses the --key value form', () => {
        expect(parseArgs(['--shards', '4', '--filter', '...[origin/next]'])).toEqual({
            shards: '4',
            filter: '...[origin/next]',
        });
    });

    // THE production path for a backstop run: the workflow forwards an empty TURBO_FILTER.
    // Treating that as a valueless boolean would hand turbo the literal filter "true".
    it('keeps an empty value empty instead of turning it into "true"', () => {
        expect(parseArgs(['--filter', '', '--shards', '6'])).toEqual({ filter: '', shards: '6' });
        expect(parseArgs(['--filter='])).toEqual({ filter: '' });
    });

    it('treats a trailing flag with no value as a boolean', () => {
        expect(parseArgs(['--verbose'])).toEqual({ verbose: 'true' });
    });

    it('treats a flag followed by another flag as a boolean', () => {
        expect(parseArgs(['--verbose', '--shards=2'])).toEqual({ verbose: 'true', shards: '2' });
    });

    it('ignores positional arguments', () => {
        expect(parseArgs(['positional', '--shards', '2'])).toEqual({ shards: '2' });
    });
});

// ---------------------------------------------------------------------------
// Argument forwarding. This is where the planner very nearly shipped broken: the
// workflow passes TURBO_FILTER, whose VALUE is itself a flag
// (`--filter=...[origin/next]`). In the space form the parser cannot distinguish
// that from a valueless flag followed by the next option, silently drops the
// `--filter=` prefix, and turbo then reports the bare `...[origin/next]` as an
// unknown TASK. It fails only on the FILTERED path — i.e. on every ordinary PR,
// and never on the full-suite runs that root/global changes trigger.
// ---------------------------------------------------------------------------

describe('turbo argument forwarding', () => {
    it('parses the "=" form the workflow uses, keeping a flag-shaped value intact', () => {
        const args = parseArgs(['--shards=6', '--turbo-args=--filter=...[origin/next]']);
        expect(args['turbo-args']).toBe('--filter=...[origin/next]');
        expect(args.shards).toBe('6');
    });

    it('keeps an empty turbo-args empty (the full-suite/backstop path)', () => {
        expect(parseArgs(['--shards=6', '--turbo-args='])['turbo-args']).toBe('');
    });

    // The exact mangling, pinned so nobody "simplifies" the workflow back to the space form.
    it('demonstrates why the space form is unusable for a flag-shaped value', () => {
        const args = parseArgs(['--turbo-args', '--filter=...[origin/next]']);
        // --turbo-args reads as a boolean, and the value re-parses as its own key=value pair,
        // losing the `--filter=` prefix entirely.
        expect(args['turbo-args']).toBe('true');
        expect(args.filter).toBe('...[origin/next]');
    });

    // The safety net: whatever the parse produced, a non-flag token must never reach turbo,
    // because `turbo run test <token>` reads it as a task name and fails confusingly.
    it('refuses to forward a non-flag argument to turbo', () => {
        expect(() => readTurboTestPackages(['...[origin/next]'])).toThrow(/refusing to forward non-flag/);
        expect(() => readTurboTestPackages(['...[origin/next]'])).toThrow(/--turbo-args=/);
    });

    it('accepts genuine turbo flags', () => {
        expect(() => readTurboTestPackages(['--filter=@memberjunction/global'])).not.toThrow();
    });
});

describe('CLI end to end (real turbo graph)', () => {
    const SCRIPT = join(SCRIPTS_DIR, 'plan-test-shards.mjs');
    const REPO_ROOT = join(SCRIPTS_DIR, '..', '..');
    const runCli = (extraArgs) =>
        execFileSync(process.execPath, [SCRIPT, '--shards=6', ...extraArgs], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });

    // The full-suite path: what push/schedule and root-global PRs run.
    it('plans the full suite into 6 balanced shards', () => {
        const out = runCli(['--turbo-args=']);
        expect(out).toMatch(/package\(s\) with a test task → 6 shard\(s\)/);
        const weights = [...out.matchAll(/~(\d+)s/g)].map((m) => Number(m[1]));
        expect(weights).toHaveLength(6);
        // Balanced within 10% — the real check that the weight table is doing its job.
        expect(Math.max(...weights)).toBeLessThanOrEqual(Math.min(...weights) * 1.1);
    });

    // The FILTERED path — the one the space-form bug broke, and the one a root/global PR
    // (like the one introducing this workflow) can never exercise in CI.
    it('accepts a real turbo filter in the form the workflow passes it', () => {
        const out = runCli(['--turbo-args=--filter=@memberjunction/global']);
        expect(out).toMatch(/1 package\(s\) with a test task → 1 shard\(s\)/);
    });
}, 120000);

// ---------------------------------------------------------------------------
// Weight-table maintenance. The table is measured from a real run and WILL go
// stale as packages are added and suites grow. `--record` is what keeps the
// documented regeneration path honest — the file's own _README points at it.
// ---------------------------------------------------------------------------

describe('parseDuration', () => {
    it('parses the shapes vitest prints', () => {
        expect(parseDuration('1.23s')).toBeCloseTo(1.23);
        expect(parseDuration('456ms')).toBeCloseTo(0.456);
        expect(parseDuration('1m 30s')).toBe(90);
        expect(parseDuration('2m30.5s')).toBeCloseTo(150.5);
    });

    it('returns null for anything else', () => {
        expect(parseDuration('soon')).toBeNull();
        expect(parseDuration('')).toBeNull();
        expect(parseDuration('12')).toBeNull();
    });
});

describe('extractDurationsFromLog', () => {
    // The `gh run view --job <id> --log` shape: job \t step \t timestamp <line>.
    const ghRunView = [
        'Run unit tests\tUNKNOWN STEP\t2026-08-24T16:00:00.0Z ##[group]@mj/alpha:test',
        'Run unit tests\tUNKNOWN STEP\t2026-08-24T16:00:00.0Z    Duration  12.50s (transform 1s)',
        'Run unit tests\tUNKNOWN STEP\t2026-08-24T16:00:00.0Z ##[endgroup]',
    ].join('\n');

    it('reads the gh run view log shape', () => {
        expect(extractDurationsFromLog(ghRunView)).toEqual({ '@mj/alpha': 12.5 });
    });

    it('reads the raw job-logs shape and strips ANSI', () => {
        const raw = [
            '2026-08-24T16:00:00.0Z \x1b[31m##[group]@mj/beta:test\x1b[0m',
            '2026-08-24T16:00:00.0Z    \x1b[2mDuration\x1b[22m  1m 5s',
        ].join('\n');
        expect(extractDurationsFromLog(raw)).toEqual({ '@mj/beta': 65 });
    });

    // A build task's output must never be attributed to a test — that would inflate the
    // weight of whichever package happened to build slowly and skew the packing.
    it('ignores durations belonging to non-test tasks', () => {
        const log = [
            '##[group]@mj/gamma:build',
            '   Duration  99.00s',
            '##[endgroup]',
            '##[group]@mj/gamma:test',
            '   Duration  3.00s',
        ].join('\n');
        expect(extractDurationsFromLog(log)).toEqual({ '@mj/gamma': 3 });
    });

    it('does not carry a duration across a group boundary', () => {
        const log = ['##[group]@mj/delta:test', '##[endgroup]', '   Duration  50.00s'].join('\n');
        expect(extractDurationsFromLog(log)).toEqual({});
    });

    it('keeps the longest reading when a package reports twice (dual-preset packages)', () => {
        const log = [
            '##[group]@mj/eps:test',
            '   Duration  2.00s',
            '##[group]@mj/eps:test',
            '   Duration  9.00s',
        ].join('\n');
        expect(extractDurationsFromLog(log)).toEqual({ '@mj/eps': 9 });
    });

    it('returns nothing for a log with no test groups', () => {
        expect(extractDurationsFromLog('just some output\nDuration  5.00s')).toEqual({});
    });
});

describe('recordWeights', () => {
    const TMP = join(SCRIPTS_DIR, '__tests__', 'fixtures', 'tmp-weights.json');
    afterEach(() => {
        if (existsSync(TMP)) rmSync(TMP);
    });

    it('writes a table a later plan can read back', () => {
        const log = ['##[group]@mj/a:test', '   Duration  10.00s', '##[endgroup]'].join('\n');
        const res = recordWeights(log, { weightsPath: TMP, source: 'unit test' });
        expect(res.measured).toBe(1);
        const table = loadWeights(TMP);
        expect(table.packages['@mj/a']).toBe(10);
        expect(typeof table.defaultSeconds).toBe('number');
    });

    // One log covers only the packages in that run/shard. Dropping the rest would blank the
    // table one shard at a time — the exact failure that makes a "regenerate" step dangerous.
    it('merges over the existing table instead of replacing it', () => {
        writeFileSync(TMP, JSON.stringify({ _defaultSeconds: 4, packages: { '@mj/old': 42, '@mj/a': 1 } }));
        const log = ['##[group]@mj/a:test', '   Duration  7.00s', '##[endgroup]'].join('\n');
        recordWeights(log, { weightsPath: TMP });
        const table = loadWeights(TMP);
        expect(table.packages['@mj/a']).toBe(7);   // updated
        expect(table.packages['@mj/old']).toBe(42); // preserved
    });

    it('records the provenance so a stale table is traceable', () => {
        const log = ['##[group]@mj/a:test', '   Duration  1.00s', '##[endgroup]'].join('\n');
        recordWeights(log, { weightsPath: TMP, source: 'run 12345' });
        expect(JSON.parse(readFileSync(TMP, 'utf8'))._generatedFrom).toBe('run 12345');
    });
});

describe('the weight table documents a command that exists', () => {
    // The file's _README tells the next maintainer how to regenerate it. If that command is
    // wrong, the table silently rots — which is how it read before this test existed.
    it('_README names a flag the CLI actually implements', () => {
        const readme = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'))._README;
        const flag = /--(\w[\w-]*)/.exec(readme);
        expect(flag, '_README should name the regeneration flag').not.toBeNull();
        const source = readFileSync(join(SCRIPTS_DIR, 'plan-test-shards.mjs'), 'utf8');
        expect(source, `--${flag[1]} must be handled in main()`).toContain(`args.${flag[1]}`);
    });
});
