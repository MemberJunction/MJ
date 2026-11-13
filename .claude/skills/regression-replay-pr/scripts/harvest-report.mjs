#!/usr/bin/env node
/**
 * Usage:
 *   node harvest-report.mjs check --worktree <dir> [--remove-orphans] [--out <file>]
 *   node harvest-report.mjs pr-body --worktree <dir> --run-dir <dir> --base <branch>
 *       [--promoted <test name>]... [--discarded <test name>]...
 *
 * `check` reads the worktree's test files, replay scripts and git status, prints what the
 * harvest adds or changes, and exits 1 when the changes are not a clean harvest.
 * `--remove-orphans` first deletes script files that no test points to.
 * `pr-body` prints the PR body from the run folder's results.json, harvest.json and drift.md,
 * and saves it there as pr-body.md.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, basename, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { HARVEST_DIR, IsTestRecordPath, ParsePorcelain, FindOrphanScripts, CheckHarvest, BuildPrBody } from './lib/harvest.mjs';

const SCRIPTS_DIR = `${HARVEST_DIR}/regression/scripts`;

function fail(message) {
    console.error(`✗ ${message}`);
    process.exit(2);
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const opts = { command, promoted: [], discarded: [], removeOrphans: false };
    const valueFlags = { '--worktree': 'worktree', '--out': 'out', '--run-dir': 'runDir', '--base': 'base' };
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === '--remove-orphans') opts.removeOrphans = true;
        else if (arg === '--promoted') opts.promoted.push(rest[++i]);
        else if (arg === '--discarded') opts.discarded.push(rest[++i]);
        else if (valueFlags[arg]) opts[valueFlags[arg]] = rest[++i];
        else fail(`unknown argument: ${arg}`);
    }
    if (!opts.worktree) fail('--worktree is required');
    return opts;
}

function git(worktree, args) {
    return execFileSync('git', ['-C', worktree, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function walk(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

function repoPath(worktree, file) {
    return relative(worktree, file).split(sep).join('/');
}

function readTests(worktree, problems) {
    const tests = [];
    for (const file of walk(join(worktree, HARVEST_DIR))) {
        const path = repoPath(worktree, file);
        if (!IsTestRecordPath(path)) continue;
        const text = readFileSync(file, 'utf8');
        try {
            tests.push({ path, record: JSON.parse(text), text });
        } catch {
            problems.push(`${path}: not valid JSON`);
        }
    }
    return tests;
}

function listScripts(worktree) {
    return walk(join(worktree, SCRIPTS_DIR))
        .filter((file) => !basename(file).startsWith('.'))
        .map((file) => repoPath(worktree, file));
}

function headVersion(worktree, path) {
    try {
        const text = git(worktree, ['show', `HEAD:${path}`]);
        return { record: JSON.parse(text), text };
    } catch {
        return null;
    }
}

function removeOrphans(worktree, tests, scriptPaths) {
    const orphans = FindOrphanScripts(tests, scriptPaths);
    for (const orphan of orphans) rmSync(join(worktree, orphan));
    return orphans;
}

function printSummary(result) {
    console.log(`New scripts: ${result.newScripts.length}`);
    console.log(`Updated scripts: ${result.updatedScripts.length}`);
    console.log(`Pending scripts: ${result.pendingScripts.length}`);
    console.log(`Removed script files: ${result.removedScripts.length}`);
    console.log(`Tests with a script: ${result.scriptedTests.length}`);
    if (result.problems.length === 0) {
        console.log('Harvest check: OK');
        return;
    }
    console.log(`Harvest check: ${result.problems.length} problem(s)`);
    for (const problem of result.problems) console.log(`  - ${problem}`);
}

function check(opts) {
    const problems = [];
    const tests = readTests(opts.worktree, problems);
    let scriptPaths = listScripts(opts.worktree);
    const orphans = opts.removeOrphans ? removeOrphans(opts.worktree, tests, scriptPaths) : [];
    scriptPaths = scriptPaths.filter((p) => !orphans.includes(p));

    const entries = ParsePorcelain(git(opts.worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
    const modified = new Set(entries.filter((e) => e.status === 'modified').map((e) => e.path));
    const result = CheckHarvest({
        entries,
        tests: tests.map((t) => ({ ...t, head: modified.has(t.path) ? headVersion(opts.worktree, t.path) : null })),
        scripts: scriptPaths.map((path) => ({ path, text: readFileSync(join(opts.worktree, path), 'utf8') })),
    });
    result.problems.unshift(...problems);
    result.orphansRemoved = orphans;

    if (opts.out) writeFileSync(opts.out, `${JSON.stringify(result, null, 2)}\n`);
    printSummary(result);
    process.exit(result.problems.length > 0 ? 1 : 0);
}

function readJson(file) {
    if (!existsSync(file)) fail(`${file} not found`);
    return JSON.parse(readFileSync(file, 'utf8'));
}

function prBody(opts) {
    if (!opts.runDir || !opts.base) fail('pr-body needs --run-dir and --base');
    const driftFile = join(opts.runDir, 'drift.md');
    const body = BuildPrBody({
        base: opts.base,
        sha: git(opts.worktree, ['merge-base', 'HEAD', `origin/${opts.base}`]).trim(),
        runName: basename(opts.runDir),
        results: readJson(join(opts.runDir, 'results.json')),
        harvest: readJson(join(opts.runDir, 'harvest.json')),
        driftMarkdown: existsSync(driftFile) ? readFileSync(driftFile, 'utf8') : undefined,
        promoted: opts.promoted,
        discarded: opts.discarded,
    });
    writeFileSync(join(opts.runDir, 'pr-body.md'), body);
    process.stdout.write(body);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.command === 'check') check(opts);
else if (opts.command === 'pr-body') prBody(opts);
else fail('usage: harvest-report.mjs check|pr-body --worktree <dir> ...');
