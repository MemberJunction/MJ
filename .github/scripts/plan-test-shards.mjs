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
 * How much more a split sub-shard costs its shard than the same weight of whole packages.
 *
 * Whole packages run together in one `turbo run test --concurrency=4`, so a shard finishes its
 * aggregate weight in roughly aggregate / 3 of wall time (run 45512966433: 2220s of weight in
 * 615s). A split sub-shard runs ALONE, after that block, so its wall time is its own vitest
 * duration (ng-conversations --shard=2/2: 219s for a 388s share of the weight, ≈0.56×). In the
 * aggregate units the packer balances, that is ≈ 0.56 × 3 ≈ 1.8× its weight. Counting it at
 * face value put a split half on top of a full shard's work and made that shard the slowest of
 * the run (shard 6/6: 15m21s block + 8m40s split).
 */
export const SPLIT_SERIAL_COST_FACTOR = 1.8;

/**
 * A whole-package suite at or above this many seconds counts as HEAVY, and heavy suites are dealt
 * out evenly across shards before weight decides. (Split sub-shards do not count: they run alone,
 * after the shard's concurrent block, so they never compete with it for memory.) The heaviest suites are the
 * Angular DOM packages (ng-dashboards, ng-explorer-core, ng-bootstrap, …), each running jsdom +
 * AOT-compile workers, and weight balance alone can stack several in one shard: with the split
 * halves packed first, run 45521116368 put five of them in shard 5/6 and its runner was shut
 * down (exit 143) on both attempts while every other shard passed.
 */
export const HEAVY_SUITE_SECONDS = 200;

/**
 * Load the weight table. A missing or unparseable file is NOT fatal — the planner falls back
 * to a uniform weight, which still produces a correct (merely less balanced) plan. Shard
 * planning must never be the reason CI cannot start.
 */
export function loadWeights(weightsPath = DEFAULT_WEIGHTS_PATH) {
    const uniform = { packages: {}, defaultSeconds: PER_TASK_OVERHEAD_SECONDS };
    let parsed;
    try {
        parsed = readJsonIfPresent(weightsPath);
    } catch (e) {
        console.warn(`plan-test-shards: unreadable weight table ${weightsPath} (${e.message}) — falling back to uniform weights.`);
        return uniform;
    }
    if (parsed === null) {
        console.warn(`plan-test-shards: no weight table at ${weightsPath} — falling back to uniform weights.`);
        return uniform;
    }
    return {
        packages: parsed.packages ?? {},
        defaultSeconds: typeof parsed._defaultSeconds === 'number' ? parsed._defaultSeconds : PER_TASK_OVERHEAD_SECONDS,
    };
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
/**
 * Extract the package names and their raw `test` commands from `turbo run test --dry=json`.
 * Knowing the exact command lets intra-package sharding split only pure `vitest run` packages
 * (never compound scripts like `vitest run && tsc ...` where forwarding `-- --shard=1/2`
 * would land on the second command).
 */
export function extractTestPackageCommands(dryRunJson) {
    const tasks = dryRunJson?.tasks;
    if (!Array.isArray(tasks)) {
        throw new Error('plan-test-shards: turbo dry-run JSON has no `tasks` array — cannot plan shards.');
    }
    const commands = new Map();
    for (const t of tasks) {
        if (t?.task !== 'test') continue;
        if (!t.command || t.command === '<NONEXISTENT>') continue;
        if (typeof t.package !== 'string' || t.package.length === 0) continue;
        commands.set(t.package, String(t.command).trim());
    }
    return commands;
}

export function extractTestPackages(dryRunJson) {
    // Sorted so a given input always produces byte-identical shards — a re-run of the same
    // commit must not reshuffle packages between shards (it would void turbo's cache hits).
    return [...extractTestPackageCommands(dryRunJson).keys()].sort();
}

/**
 * Bin-pack `packages` into at most `shardCount` groups, heaviest-first onto the lightest bin.
 *
 * When `splitThresholdSeconds > 0` and `shardCount >= 2`, a package whose weight exceeds BOTH
 * `splitThresholdSeconds` AND the mean shard weight (`totalWeight / shardCount`) — and whose test
 * command is pure `vitest run`, when `commands` is supplied — is split into
 * `ceil(weight / splitThresholdSeconds)` Vitest `--shard=j/k` work items so no single
 * mega-package caps wall time on small/scoped PRs. Each sub-shard is packed at
 * `SPLIT_SERIAL_COST_FACTOR` × its share of the weight because it runs alone after the shard's
 * concurrent block. Requiring `weight > totalWeight / shardCount` keeps full-suite runs unsplit
 * (where every mega-package already fits inside a shard's concurrent block and serial post-block
 * splits only add wall time).
 *
 * Returns only NON-EMPTY shards: a matrix entry that runs zero packages still pays ~4 minutes
 * of checkout+install for nothing, so a 3-package scope produces 3 shards, not 6. The returned
 * `index`/`total` are display labels assigned after packing.
 */
export function planShards(
    packages,
    shardCount,
    { packages: weights = {}, defaultSeconds = PER_TASK_OVERHEAD_SECONDS, splitThresholdSeconds = 0, commands = null } = {},
) {
    if (!Number.isInteger(shardCount) || shardCount < 1) {
        throw new Error(`plan-test-shards: shard count must be a positive integer, got ${shardCount}`);
    }
    if (packages.length === 0) return [];

    const weightOf = (name) => (typeof weights[name] === 'number' ? weights[name] : defaultSeconds) + PER_TASK_OVERHEAD_SECONDS;
    const canSplit = (name) => !commands || commands.get(name) === 'vitest run';

    const sortedPackages = [...packages].sort();
    const totalWeight = sortedPackages.reduce((sum, name) => sum + weightOf(name), 0);
    const meanShardWeight = totalWeight / shardCount;

    const workItems = [];
    for (const name of sortedPackages) {
        const w = weightOf(name);
        if (
            splitThresholdSeconds > 0 &&
            shardCount >= 2 &&
            w > splitThresholdSeconds &&
            w > meanShardWeight &&
            canSplit(name)
        ) {
            const parts = Math.min(shardCount, Math.ceil(w / splitThresholdSeconds));
            const partWeight = (w / parts) * SPLIT_SERIAL_COST_FACTOR;
            for (let j = 1; j <= parts; j++) {
                workItems.push({ kind: 'split', name, spec: `${name}:${j}/${parts}`, weight: partWeight, heavy: false });
            }
        } else {
            workItems.push({ kind: 'whole', name, spec: name, weight: w, heavy: w >= HEAVY_SUITE_SECONDS });
        }
    }

    const effective = Math.min(shardCount, workItems.length);
    if (effective === 0) return [];

    // Heaviest first; ties broken by spec so the plan is deterministic for a given input.
    workItems.sort((a, b) => b.weight - a.weight || a.spec.localeCompare(b.spec));

    const bins = Array.from({ length: effective }, () => ({ packages: [], splitPackages: [], weight: 0, heavy: 0 }));
    for (const item of workItems) {
        // A heavy item may only go to a bin holding the fewest heavy items so far; among the
        // eligible bins the lightest wins, ties to the lowest index for determinism.
        const fewestHeavy = item.heavy ? Math.min(...bins.map((b) => b.heavy)) : null;
        let target = null;
        for (const bin of bins) {
            if (fewestHeavy !== null && bin.heavy !== fewestHeavy) continue;
            if (target === null || bin.weight < target.weight) target = bin;
        }
        if (item.kind === 'split') target.splitPackages.push(item.spec);
        else target.packages.push(item.name);
        target.weight += item.weight;
        if (item.heavy) target.heavy++;
    }

    return bins
        .filter((b) => b.packages.length > 0 || b.splitPackages.length > 0)
        .map((b, i, arr) => ({
            index: i + 1,
            total: arr.length,
            // Sorted within the shard purely for readable logs; order does not affect turbo.
            packages: b.packages.slice().sort().join(','),
            ...(b.splitPackages.length > 0 ? { splitPackages: b.splitPackages.slice().sort().join(',') } : {}),
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
export function readTurboTestPackageCommands(filterArgs = [], { cwd = process.cwd() } = {}) {
    assertTurboFlags(filterArgs);
    const args = ['turbo', 'run', 'test', '--dry=json', ...filterArgs];
    const stdout = execFileSync('npx', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    return extractTestPackageCommands(JSON.parse(stdout));
}

export function readTurboTestPackages(filterArgs = [], { cwd = process.cwd() } = {}) {
    return [...readTurboTestPackageCommands(filterArgs, { cwd }).keys()].sort();
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
    const previous = readJsonIfPresent(weightsPath) ?? {};
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

/**
 * Parse a JSON file that may not exist yet. Reading and catching ENOENT (rather than
 * existsSync then read) avoids the window in which the file changes between the two.
 */
function readJsonIfPresent(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
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

    const splitThresholdSeconds = Number.parseFloat(args['split-above'] ?? '0');
    if (!Number.isFinite(splitThresholdSeconds) || splitThresholdSeconds < 0) {
        console.error(`plan-test-shards: --split-above must be a non-negative number, got "${args['split-above']}"`);
        process.exit(2);
    }

    const commands = readTurboTestPackageCommands(filterArgs, { cwd: resolve(args.cwd ?? process.cwd()) });
    const packages = [...commands.keys()].sort();
    const weights = loadWeights(args.weights ? resolve(args.weights) : DEFAULT_WEIGHTS_PATH);
    const shards = planShards(packages, shardCount, { ...weights, splitThresholdSeconds, commands });

    const unweighted = packages.filter((p) => typeof weights.packages[p] !== 'number');
    console.log(`plan-test-shards: ${packages.length} package(s) with a test task → ${shards.length} shard(s)`);
    if (unweighted.length > 0) {
        console.log(`plan-test-shards: ${unweighted.length} package(s) had no recorded weight (using ${weights.defaultSeconds}s): ${unweighted.slice(0, 10).join(', ')}${unweighted.length > 10 ? ', …' : ''}`);
    }
    for (const s of shards) {
        const wholeCount = s.packages ? s.packages.split(',').length : 0;
        const splitCount = s.splitPackages ? s.splitPackages.split(',').length : 0;
        const splitSuffix = splitCount > 0 ? ` + ${splitCount} split sub-shard(s)` : '';
        console.log(`  shard ${s.index}/${s.total}: ${wholeCount} package(s)${splitSuffix}, ~${s.weight}s`);
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
