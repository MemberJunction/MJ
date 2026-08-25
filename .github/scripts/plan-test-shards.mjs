/**
 * Test-shard planner for the Unit Tests workflow.
 *
 * The unit tier runs ~307 package `test` tasks. On a 4-vCPU `ubuntu-latest` runner a single
 * job executes ~76 minutes of aggregate vitest work in ~25 minutes of wall time — the machine
 * is saturated, so the only remaining lever is more machines. This script partitions the
 * in-scope packages into N balanced groups so the workflow can fan them out across a matrix.
 *
 * Balance matters more than it looks. The suites are wildly uneven (ng-dashboards is 305s,
 * the median package is 4s), so a naive round-robin split routinely lands three of the four
 * heaviest suites in one shard and that shard becomes the critical path — undoing most of the
 * win. Packages are therefore bin-packed longest-first (LPT) against measured per-package
 * durations in test-shard-weights.json.
 *
 * The weights are a HINT, never a gate. An unlisted package (new, or renamed since the table
 * was recorded) gets `_defaultSeconds`; a stale entry just makes one shard slightly heavy.
 * Correctness never depends on them: every in-scope package lands in exactly one shard, which
 * is the property the round-trip test in __tests__/plan-test-shards.test.mjs pins.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEIGHTS_PATH = join(HERE, 'test-shard-weights.json');

/**
 * Per-task overhead the weight table does not capture: turbo's task spin-up plus node/vitest
 * process start, on top of vitest's self-reported suite duration. Without it a shard of 80
 * trivial 0.5s packages looks like 40s of work when it really costs ~4 minutes, and the packer
 * happily buries a shard under them. Measured at roughly 3s/task on the CI runner.
 */
const PER_TASK_OVERHEAD_SECONDS = 3;

/**
 * Load the weight table. A missing or unparseable file is NOT fatal — the planner falls back
 * to a uniform weight, which still produces a correct (merely less balanced) plan. Shard
 * planning must never be the reason CI cannot start.
 */
export function loadWeights(weightsPath = DEFAULT_WEIGHTS_PATH) {
    if (!existsSync(weightsPath)) {
        console.warn(`plan-test-shards: no weight table at ${weightsPath} — falling back to uniform weights.`);
        return { packages: {}, defaultSeconds: PER_TASK_OVERHEAD_SECONDS };
    }
    try {
        const parsed = JSON.parse(readFileSync(weightsPath, 'utf8'));
        return {
            packages: parsed.packages ?? {},
            defaultSeconds: typeof parsed._defaultSeconds === 'number' ? parsed._defaultSeconds : PER_TASK_OVERHEAD_SECONDS,
        };
    } catch (e) {
        console.warn(`plan-test-shards: unreadable weight table ${weightsPath} (${e.message}) — falling back to uniform weights.`);
        return { packages: {}, defaultSeconds: PER_TASK_OVERHEAD_SECONDS };
    }
}

/**
 * Extract the package names that will actually run a `test` task, from `turbo run test --dry=json`.
 *
 * Two filters, both load-bearing:
 *  - `task === 'test'` — the dry run also lists every transitive `build` task (134 of them for a
 *    single leaf package), and those are not shardable units.
 *  - a real `command` — turbo emits entries for packages that have no `test` script; scheduling
 *    them would create shards that run nothing.
 */
export function extractTestPackages(dryRunJson) {
    const tasks = dryRunJson?.tasks;
    if (!Array.isArray(tasks)) {
        throw new Error('plan-test-shards: turbo dry-run JSON has no `tasks` array — cannot plan shards.');
    }
    const names = new Set();
    for (const t of tasks) {
        if (t?.task !== 'test') continue;
        if (!t.command || t.command === '<NONEXISTENT>') continue;
        if (typeof t.package !== 'string' || t.package.length === 0) continue;
        names.add(t.package);
    }
    // Sorted so a given input always produces byte-identical shards — a re-run of the same
    // commit must not reshuffle packages between shards (it would void turbo's cache hits).
    return [...names].sort();
}

/**
 * Bin-pack `packages` into at most `shardCount` groups, heaviest-first onto the lightest bin.
 *
 * Returns only NON-EMPTY shards: a matrix entry that runs zero packages still pays ~4 minutes
 * of checkout+install for nothing, so a 3-package scope produces 3 shards, not 6. The returned
 * `index`/`total` are display labels assigned after packing.
 */
export function planShards(packages, shardCount, { packages: weights = {}, defaultSeconds = PER_TASK_OVERHEAD_SECONDS } = {}) {
    if (!Number.isInteger(shardCount) || shardCount < 1) {
        throw new Error(`plan-test-shards: shard count must be a positive integer, got ${shardCount}`);
    }
    const effective = Math.min(shardCount, packages.length);
    if (effective === 0) return [];

    const weightOf = (name) => (typeof weights[name] === 'number' ? weights[name] : defaultSeconds) + PER_TASK_OVERHEAD_SECONDS;

    // Heaviest first; ties broken by name so the plan is deterministic for a given input.
    const ordered = [...packages].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b));

    const bins = Array.from({ length: effective }, () => ({ packages: [], weight: 0 }));
    for (const name of ordered) {
        // Lightest bin wins; ties go to the lowest bin index, again for determinism.
        let target = bins[0];
        for (const bin of bins) {
            if (bin.weight < target.weight) target = bin;
        }
        target.packages.push(name);
        target.weight += weightOf(name);
    }

    return bins
        .filter((b) => b.packages.length > 0)
        .map((b, i, arr) => ({
            index: i + 1,
            total: arr.length,
            // Sorted within the shard purely for readable logs; order does not affect turbo.
            packages: b.packages.slice().sort().join(','),
            weight: Math.round(b.weight),
        }));
}

/**
 * Every forwarded token must be a turbo FLAG. Anything else would be read by turbo as a task
 * name, and `turbo run test <something>` does not fail the way you would hope — it reports
 * "Could not find task", which reads like a broken turbo.json rather than like a mangled
 * argument.
 *
 * The specific mangling this catches: passing the filter in the SPACE form,
 * `--turbo-args "--filter=...[base]"`. parseArgs sees a `--`-prefixed next token, treats
 * --turbo-args as a valueless boolean, then re-parses `--filter=...[base]` as its own
 * key=value pair — and the `--filter=` prefix silently disappears, leaving the bare
 * `...[base]`. Use the `=` form (`--turbo-args=...`), which has no such ambiguity.
 */
function assertTurboFlags(args) {
    const stray = args.filter((a) => !a.startsWith('-'));
    if (stray.length > 0) {
        throw new Error(
            `plan-test-shards: refusing to forward non-flag argument(s) to turbo: ${stray.join(' ')}\n` +
                `Turbo would read these as task names. Pass the filter with the "=" form, e.g.\n` +
                `  --turbo-args="--filter=...[origin/next]"`
        );
    }
}

/**
 * Ask turbo which packages have a `test` task in scope. `filterArgs` is the already-split
 * turbo argument list (e.g. ['--filter=...[origin/next]']) or [] for the full suite.
 *
 * maxBuffer is raised well past the default 1 MB: the full-repo dry run is ~3 MB of JSON and
 * the default would truncate it into a parse error — a silent "no packages" plan, which would
 * skip the entire test tier while reporting success.
 */
export function readTurboTestPackages(filterArgs = [], { cwd = process.cwd() } = {}) {
    assertTurboFlags(filterArgs);
    const args = ['turbo', 'run', 'test', '--dry=json', ...filterArgs];
    const stdout = execFileSync('npx', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    return extractTestPackages(JSON.parse(stdout));
}

/**
 * Parse a vitest duration as it appears in a run log: `1.23s`, `456ms`, `1m 30s`, `2m30.5s`.
 * Returns seconds, or null when the text is not a duration.
 */
export function parseDuration(text) {
    const m = /^(?:(\d+)m\s*)?([\d.]+)(ms|s)$/.exec(String(text).trim());
    if (!m) return null;
    const minutes = Number(m[1] ?? 0);
    const value = Number(m[2]);
    return minutes * 60 + (m[3] === 'ms' ? value / 1000 : value);
}

/**
 * Extract per-package `test` durations from a GitHub Actions job log.
 *
 * Accepts either log shape: `gh run view --job <id> --log` (which prefixes every line with
 * `<job>\t<step>\t<timestamp> `) and `gh api .../jobs/<id>/logs` (timestamp only). ANSI colour
 * codes are stripped first — turbo and vitest both emit them, and an unstripped `##[group]`
 * never matches.
 *
 * turbo's grouped output wraps each task's output in `##[group]<pkg>:<task>`, so a `Duration`
 * line belongs to the most recent group. Any intervening group (a build task, a step boundary)
 * clears the association, so a build's output can never be attributed to a test.
 */
export function extractDurationsFromLog(logText) {
    const durations = {};
    let current = null;
    for (const raw of String(logText).split('\n')) {
        const line = raw
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/^(?:[^\t]*\t){0,2}/, '')
            .replace(/^[0-9T:.\-]+Z\s*/, '');

        const group = /^##\[group\](\S+?):(\S+)\s*$/.exec(line);
        if (group) {
            current = group[2] === 'test' ? group[1] : null;
            continue;
        }
        if (/^##\[(endgroup|group)\]/.test(line)) {
            current = null;
            continue;
        }
        if (!current) continue;

        const dur = /\bDuration\s+((?:\d+m\s*)?[\d.]+(?:ms|s))\b/.exec(line);
        if (dur) {
            const seconds = parseDuration(dur[1]);
            if (seconds != null) {
                // Keep the longest reading if a package somehow reports twice (dual-preset
                // packages run two vitest projects); the shard pays the larger cost.
                durations[current] = Math.max(durations[current] ?? 0, Math.round(seconds * 10) / 10);
            }
            current = null;
        }
    }
    return durations;
}

/**
 * Rebuild the weight table from a job log and write it to disk. Packages absent from the log
 * keep their previous weight rather than being dropped: one log only covers the packages that
 * run in that shard/run, and discarding the rest would blank the table a shard at a time.
 */
export function recordWeights(logText, { weightsPath = DEFAULT_WEIGHTS_PATH, source = 'a job log' } = {}) {
    const measured = extractDurationsFromLog(logText);
    const previous = existsSync(weightsPath) ? JSON.parse(readFileSync(weightsPath, 'utf8')) : {};
    const merged = { ...(previous.packages ?? {}), ...measured };

    const out = {
        _README: previous._README ?? 'Measured per-package vitest wall time (seconds), used ONLY to balance the CI test shards.',
        _generatedFrom: source,
        _defaultSeconds: previous._defaultSeconds ?? 4,
        packages: Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))),
    };
    writeFileSync(weightsPath, `${JSON.stringify(out, null, 2)}\n`);
    return { measured: Object.keys(measured).length, total: Object.keys(merged).length, weightsPath };
}

/** Append a `name=value` line to GITHUB_OUTPUT, when running under Actions. */
function writeGithubOutput(name, value) {
    const target = process.env.GITHUB_OUTPUT;
    if (!target) return;
    appendFileSync(target, `${name}=${value}\n`);
}

/**
 * Minimal flag parser: `--key value` and `--key=value`.
 *
 * The empty-string value is the load-bearing case here, not an edge case: the workflow passes
 * the turbo filter straight through, and on a full-suite (backstop) run that filter is EMPTY.
 * Testing the next token for truthiness would treat `--filter ""` as a valueless boolean flag
 * and yield the literal string "true" — which then reaches turbo as a package filter named
 * `true` and selects nothing. Presence is therefore tested with `!== undefined`.
 */
export function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const eq = a.indexOf('=');
        if (eq !== -1) {
            out[a.slice(2, eq)] = a.slice(eq + 1);
        } else {
            const next = argv[i + 1];
            out[a.slice(2)] = next !== undefined && !next.startsWith('--') ? (i++, next) : 'true';
        }
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    // Maintenance mode: rebuild the weight table from a saved run log instead of planning.
    if (args.record && args.record !== 'true') {
        const logPath = resolve(args.record);
        if (!existsSync(logPath)) {
            console.error(`plan-test-shards: no such log file: ${logPath}`);
            process.exit(2);
        }
        const result = recordWeights(readFileSync(logPath, 'utf8'), {
            weightsPath: args.weights ? resolve(args.weights) : DEFAULT_WEIGHTS_PATH,
            source: args.source ?? logPath,
        });
        if (result.measured === 0) {
            console.error(
                `plan-test-shards: found no per-package test durations in ${logPath}. ` +
                    `Expected turbo's grouped output (##[group]<pkg>:test) with a vitest "Duration" line. ` +
                    `Download one with: gh api repos/<owner>/<repo>/actions/jobs/<jobId>/logs > job.log`
            );
            process.exit(1);
        }
        console.log(`plan-test-shards: recorded ${result.measured} package duration(s); table now has ${result.total}.`);
        console.log(`plan-test-shards: wrote ${result.weightsPath}`);
        return;
    }

    const shardCount = Number.parseInt(args.shards ?? '6', 10);
    if (!Number.isInteger(shardCount) || shardCount < 1) {
        console.error(`plan-test-shards: --shards must be a positive integer, got "${args.shards}"`);
        process.exit(2);
    }

    // The turbo args arrive as ONE string (possibly empty) straight from the workflow's
    // TURBO_FILTER env — already in flag form, e.g. `--filter=...[origin/next]`. Split on
    // whitespace so an empty value yields no args at all. `--filter` is accepted as a legacy
    // alias so an operator running this by hand either way gets the same behaviour.
    const raw = args['turbo-args'] ?? args.filter ?? '';
    const filterArgs = String(raw).trim().split(/\s+/).filter(Boolean);

    const packages = readTurboTestPackages(filterArgs, { cwd: resolve(args.cwd ?? process.cwd()) });
    const weights = loadWeights(args.weights ? resolve(args.weights) : DEFAULT_WEIGHTS_PATH);
    const shards = planShards(packages, shardCount, weights);

    const unweighted = packages.filter((p) => typeof weights.packages[p] !== 'number');
    console.log(`plan-test-shards: ${packages.length} package(s) with a test task → ${shards.length} shard(s)`);
    if (unweighted.length > 0) {
        console.log(`plan-test-shards: ${unweighted.length} package(s) had no recorded weight (using ${weights.defaultSeconds}s): ${unweighted.slice(0, 10).join(', ')}${unweighted.length > 10 ? ', …' : ''}`);
    }
    for (const s of shards) {
        console.log(`  shard ${s.index}/${s.total}: ${s.packages.split(',').length} package(s), ~${s.weight}s`);
    }

    writeGithubOutput('shards', JSON.stringify(shards));
    writeGithubOutput('has_tests', shards.length > 0 ? 'true' : 'false');
    writeGithubOutput('package_count', String(packages.length));

    if (shards.length === 0) {
        console.log('plan-test-shards: no packages in scope have a test task — the test matrix will be skipped.');
    }
}

// Run as a CLI only when invoked directly, so the unit tests can import the pure helpers.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    await main();
}
