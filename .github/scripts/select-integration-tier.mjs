/**
 * Decides whether a pull request needs the deterministic integration tier
 * (`.github/workflows/integration.yml`, job "Integration (SQL Server, deterministic)").
 *
 * ## The rule
 *
 * The tier's job builds exactly one package graph — the `turbo build` filters in
 * `INTEGRATION_BUILD_FILTERS` (the mj CLI, the test harness and suite, open-app-engine, MJAPI)
 * plus everything those depend on — and runs nothing else. A workspace package outside that
 * graph is never compiled in the job, so nothing the tier executes can load it: a change
 * confined to such packages cannot change any test's outcome. Today that is the Angular half
 * of the monorepo and a handful of standalone servers (≈128 of ≈363 packages).
 *
 * So the tier is skipped only when every changed file that the workflow's `paths` filter
 * matched lies inside a workspace package the tier does not build. Anything else runs it:
 *
 *   - a changed file outside `packages/` (migrations, metadata, the lockfile, root config,
 *     the workflow itself) — those feed the database or the whole build;
 *   - a changed file inside a package the tier builds;
 *   - a changed file under `packages/` that belongs to no package (a deleted package, a loose
 *     file) — it cannot be placed, so it is not assumed harmless.
 *
 * The built graph is read from `turbo run build --dry=json` over the same filters the job
 * builds with, evaluated on the PR's own tree, so it follows the dependency graph as the PR
 * leaves it (a new edge into an Angular package moves that package into the graph) and needs
 * no hand-maintained package list.
 *
 * ## Already passed
 *
 * The protected branch requires a PR to be up to date before it merges, so most tier runs on a
 * PR come from merging the base branch back in, not from the author's own edits. Those runs
 * re-test changes that already passed against a slightly older base, and almost never find
 * anything new; the full tier still runs on the base branch after every merge.
 *
 * So the tier is also skipped when the PR's *changes* already passed. `fingerprint` hashes the
 * patch the run tests — GitHub's PR merge commit against its first parent, the base it was
 * merged onto — including each touched file's before-image blob id. The hash is unchanged by a
 * catch-up merge that leaves the PR's files alone, and changes when the author edits anything
 * or the base branch edits a file the PR also touches (the case where the two can interact).
 * The workflow records a fingerprint after a green tier run and passes this script the record
 * (`--passed-marker`) when a later run of the same PR finds one.
 *
 * ## Failing open
 *
 * Every doubt resolves to "run": an empty diff, an unreadable or empty build graph, a HEAD that
 * is not a merge commit, any exception. A wrong "run" costs one job; a wrong "skip" hides a
 * break until the backstop. Merges to the protected branches, the nightly and manual
 * dispatches never consult this script — the workflow runs the tier unconditionally for every
 * event but `pull_request`.
 *
 * ## Usage
 *
 *   node .github/scripts/select-integration-tier.mjs fingerprint
 *   node .github/scripts/select-integration-tier.mjs --changed=<file> --build-graph=<file> [--root=<dir>] [--passed-marker=<file>]
 *
 * `fingerprint` writes `fingerprint=<sha256>` (empty when it cannot be computed) to
 * `$GITHUB_OUTPUT`. The default mode reads one changed path per line from `--changed`
 * (`git diff --name-only base...HEAD`), the turbo dry-run JSON from `--build-graph`, and the
 * optional record of an earlier passing run from `--passed-marker` (its URL; a missing or empty
 * file means none), and writes `integration=true|false` to `$GITHUB_OUTPUT` and the reasons to
 * `$GITHUB_STEP_SUMMARY` when those are set. Both modes always exit 0.
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/**
 * Mirror of `on.pull_request.paths` in integration.yml. A changed file outside these globs did
 * not trigger the workflow and does not count toward the decision (a `.changeset/*.md`, docs).
 * Kept in sync by a unit test that reads the workflow file.
 */
export const TRIGGER_GLOBS = [
    'pnpm-lock.yaml',
    'packages/**',
    'migrations/**',
    'metadata/**',
    'metadata-optional/**',
    'mj.config.cjs',
    'tsconfig*',
    'turbo.json',
    '.github/workflows/integration.yml',
    'scripts/codegen-idempotency-check.mjs',
];

/** How many reasons the summary lists before it truncates. */
const MAX_REASONS_SHOWN = 20;

/**
 * Convert a GitHub Actions path glob to a RegExp: `**` crosses directories, `*` does not.
 * Only the two wildcards the trigger list uses are supported.
 */
export function globToRegExp(glob) {
    let source = '';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === '*' && glob[i + 1] === '*') {
            source += '.*';
            i++;
        } else if (ch === '*') {
            source += '[^/]*';
        } else {
            source += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`);
}

const TRIGGER_REGEXPS = TRIGGER_GLOBS.map(globToRegExp);

/** True when `path` is one the workflow's `paths` filter matches. */
export function matchesTrigger(path) {
    return TRIGGER_REGEXPS.some((re) => re.test(path));
}

/**
 * The package directories (repo-relative, e.g. `packages/MJAPI`) that have a `build` task in a
 * `turbo run build --dry=json` result. Throws when there are none, so a broken dry run can
 * never read as "the tier builds nothing" and skip it.
 */
export function builtPackageDirs(dryRunJson) {
    const tasks = dryRunJson?.tasks;
    if (!Array.isArray(tasks)) {
        throw new Error('turbo dry-run JSON has no `tasks` array');
    }
    const dirs = new Set();
    for (const t of tasks) {
        if (t?.task === 'build' && typeof t.directory === 'string' && t.directory.length > 0) {
            dirs.add(t.directory.replace(/\\/g, '/').replace(/\/+$/, ''));
        }
    }
    if (dirs.size === 0) {
        throw new Error('turbo dry-run JSON lists no build tasks');
    }
    return dirs;
}

/**
 * The nearest directory at or above `path` (but below `packages/`) holding a package.json, or
 * null when there is none. `hasPackageJson(dir)` answers for a repo-relative directory.
 */
export function owningPackageDir(path, hasPackageJson) {
    let dir = posix.dirname(path);
    while (dir.startsWith('packages/')) {
        if (hasPackageJson(dir)) return dir;
        dir = posix.dirname(dir);
    }
    return null;
}

/**
 * Why one triggering path forces the tier to run, or null when it lies in a package the tier
 * does not build.
 */
function reasonToRun(path, builtDirs, hasPackageJson) {
    if (!path.startsWith('packages/')) {
        return `${path} is outside packages/ (feeds the database or the whole build)`;
    }
    const owner = owningPackageDir(path, hasPackageJson);
    if (owner === null) {
        return `${path} belongs to no workspace package`;
    }
    return builtDirs.has(owner) ? `${owner} is built by the integration tier` : null;
}

/**
 * Decide whether the tier runs for a PR that changed `changedPaths`.
 *
 * @returns {{ run: boolean, reasons: string[], unbuiltPackages: string[] }} `reasons` explains a
 *   run (deduplicated); `unbuiltPackages` lists the changed packages the tier does not build.
 */
export function decide(changedPaths, builtDirs, hasPackageJson) {
    const paths = changedPaths.map((p) => p.trim()).filter(Boolean);
    if (paths.length === 0) {
        return { run: true, reasons: ['the changed-file list is empty, so nothing can be ruled out'], unbuiltPackages: [] };
    }
    const reasons = new Set();
    const unbuilt = new Set();
    for (const path of paths.filter(matchesTrigger)) {
        const reason = reasonToRun(path, builtDirs, hasPackageJson);
        if (reason === null) {
            unbuilt.add(owningPackageDir(path, hasPackageJson));
        } else {
            reasons.add(reason);
        }
    }
    return { run: reasons.size > 0, reasons: [...reasons], unbuiltPackages: [...unbuilt].sort() };
}

/**
 * SHA-256 of the patch a PR run tests: `HEAD` (GitHub's PR merge commit) against its first
 * parent (the base it was merged onto). Full blob ids and no rename detection keep the patch
 * text independent of git configuration. Throws when `HEAD` is not a two-parent merge commit,
 * since the first parent is then not known to be the base.
 */
export function computeFingerprint(cwd = process.cwd()) {
    const commits = execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd, encoding: 'utf8' })
        .trim()
        .split(/\s+/);
    if (commits.length !== 3) {
        throw new Error(`HEAD has ${commits.length - 1} parent(s); expected the two-parent PR merge commit`);
    }
    const patch = execFileSync(
        'git',
        ['diff', '--binary', '--full-index', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv', 'HEAD^1', 'HEAD'],
        { cwd, maxBuffer: 1024 * 1024 * 1024 },
    );
    return createHash('sha256').update(patch).digest('hex');
}

/** The URL recorded by an earlier passing run, or null when there is no record. */
export function readPassedMarker(path) {
    if (!path || !existsSync(path)) return null;
    const text = readFileSync(path, 'utf8').trim();
    return text.length > 0 ? text : null;
}

/** Parse `--name=value` flags. */
export function parseArgs(argv) {
    const args = {};
    for (const a of argv) {
        const m = /^--([a-z-]+)=(.*)$/.exec(a);
        if (m) args[m[1]] = m[2];
    }
    return args;
}

/** Markdown for the job summary. */
export function formatSummary(decision) {
    const lines = ['### Integration tier selection', ''];
    if (decision.passedRun) {
        lines.push(
            `**Skipped.** These exact PR changes already passed the tier: ${decision.passedRun}`,
            '',
            'The base branch has moved since, but not in any file this PR changes. A new commit to the PR, or a base change to one of its files, runs the tier again; it also runs in full when this merges.',
        );
    } else if (decision.run) {
        lines.push('**Runs.** Why:', '');
        const shown = decision.reasons.slice(0, MAX_REASONS_SHOWN);
        lines.push(...shown.map((r) => `- ${r}`));
        if (decision.reasons.length > shown.length) {
            lines.push(`- …and ${decision.reasons.length - shown.length} more`);
        }
    } else {
        lines.push(
            '**Skipped.** Every changed file the workflow watches is in a package the tier does not build, so no test can see the change:',
            '',
            ...decision.unbuiltPackages.map((p) => `- ${p}`),
            '',
            'The tier still runs in full when this merges.',
        );
    }
    return lines.join('\n') + '\n';
}

/** Compute the decision from the CLI inputs; any failure becomes a "run" decision. */
function decideFromFiles(args) {
    try {
        const passedRun = readPassedMarker(args['passed-marker']);
        if (passedRun !== null) {
            return { run: false, reasons: [], unbuiltPackages: [], passedRun };
        }
        if (!args.changed || !args['build-graph']) {
            throw new Error('usage: --changed=<file> --build-graph=<file> [--root=<dir>]');
        }
        const root = args.root ?? process.cwd();
        const changed = readFileSync(args.changed, 'utf8').split('\n');
        const builtDirs = builtPackageDirs(JSON.parse(readFileSync(args['build-graph'], 'utf8')));
        return decide(changed, builtDirs, (dir) => existsSync(join(root, dir, 'package.json')));
    } catch (e) {
        console.log(`::warning::Integration tier selection failed (${e.message}); running the tier.`);
        return { run: true, reasons: [`selection failed: ${e.message}`], unbuiltPackages: [] };
    }
}

/** `fingerprint` mode: write the fingerprint, or an empty one (meaning "never skip on it"). */
function writeFingerprint() {
    let fingerprint = '';
    try {
        fingerprint = computeFingerprint();
        console.log(`PR change fingerprint: ${fingerprint}`);
    } catch (e) {
        console.log(`::warning::Could not fingerprint the PR changes (${e.message}); the already-passed skip is off for this run.`);
    }
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fingerprint=${fingerprint}\n`);
}

function main() {
    if (process.argv[2] === 'fingerprint') {
        writeFingerprint();
        return;
    }
    const decision = decideFromFiles(parseArgs(process.argv.slice(2)));
    const summary = formatSummary(decision);
    console.log(summary);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `integration=${decision.run}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main();
}
