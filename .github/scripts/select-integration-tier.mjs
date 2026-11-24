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
 * merged onto — including each touched file's before-image blob id, plus the base's
 * `migrations/`, `metadata/` and `metadata-optional/` trees and its root build inputs. The hash
 * is unchanged by a catch-up merge that leaves the PR's files, those trees and those inputs
 * alone. It changes when the author edits anything, when the base edits a file the PR also
 * touches, when the base adds or changes a migration, metadata, or an integration test
 * definition (the tier migrates and pushes those before any test, so they change what it tests
 * without sharing a file with the PR), and when the base changes the lockfile or root build
 * configuration. What it does not see is newer base code under `packages/` that the PR calls;
 * the full tier on the base branch after the merge covers that.
 *
 * The workflow records the passing run's URL under the fingerprint after a green tier run (a
 * PR-scoped Actions cache entry). A cache entry alone proves nothing — any workflow a PR runs
 * can write one, including from a commit the PR later drops — so before skipping, this script
 * checks the recorded run through the GitHub API: it is a `pull_request` run of this workflow
 * for this PR, its tier job succeeded, its fingerprint step logged this fingerprint, and at
 * that run the PR had not changed this workflow or this script (or still carries the same
 * version of them, so the change is in the final diff for review).
 *
 * ## Failing open
 *
 * Every doubt resolves to "run": an empty diff, an unreadable or empty build graph, a HEAD that
 * is not a merge commit, a pass record that cannot be verified, any exception. A wrong "run" costs one job; a wrong "skip" hides a
 * break until the backstop. Merges to the protected branches, the nightly and manual
 * dispatches never consult this script — the workflow runs the tier unconditionally for every
 * event but `pull_request`.
 *
 * ## Usage
 *
 *   node .github/scripts/select-integration-tier.mjs fingerprint
 *   node .github/scripts/select-integration-tier.mjs --build-graph=<file> [--root=<dir>]
 *       [--passed-marker=<file> --fingerprint=<sha256> --pr=<number>] [--changed=<file>]
 *
 * Both run in a checkout of GitHub's PR merge commit. `fingerprint` writes
 * `fingerprint=<sha256>` (empty when it cannot be computed) to `$GITHUB_OUTPUT`. The default
 * mode takes the changed files from the merge commit itself (`--changed` substitutes a file of
 * paths, for tests), the turbo dry-run JSON from `--build-graph`, and the optional pass record
 * from `--passed-marker` (a run URL; missing or empty means none), which it verifies with
 * `$GITHUB_TOKEN` against `$GITHUB_REPOSITORY`. It writes `integration=true|false` to
 * `$GITHUB_OUTPUT` and the reasons to `$GITHUB_STEP_SUMMARY` when those are set. Both modes
 * always exit 0.
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
    'migrations-pg/**',
    'metadata/**',
    'metadata-optional/**',
    'mj.config.cjs',
    'tsconfig*',
    'turbo.json',
    '.github/workflows/integration.yml',
    'scripts/codegen-idempotency-check.mjs',
    '.github/scripts/wait-for-mjapi.sh',
    '.github/scripts/check-fls-wire-bundles-ran.mjs',
    '.github/scripts/select-integration-tier.mjs',
    '.github/scripts/check-integration-known-failures.mjs',
    '.github/scripts/classify-pg-parity-gap.mjs',
    '.github/integration-known-failures/**',
    'package.json',
    'pnpm-workspace.yaml',
    '.npmrc',
];

/** Base-branch trees the tier migrates or pushes before any test runs; part of the fingerprint. */
export const BASE_STATE_DIRS = ['migrations', 'metadata', 'metadata-optional'];

/**
 * The files that decide whether, and how honestly, the tier ran. A pass record is only trusted
 * from a run where the PR had not changed them, or still carries the same version of them.
 */
export const TRUSTED_FILES = ['.github/workflows/integration.yml', '.github/scripts/select-integration-tier.mjs'];

/** Names the verification looks up in a recorded run; they must match integration.yml. */
export const WORKFLOW_PATH = '.github/workflows/integration.yml';
export const TIER_JOB_NAME = 'Integration (SQL Server, deterministic)';
export const CHANGES_JOB_NAME = 'Detect PR changes';
const FINGERPRINT_LOG_PREFIX = 'PR change fingerprint: ';

/**
 * The command of integration.yml's "Fingerprint the PR changes" step. GitHub opens that step's
 * section of the job log with `##[group]Run <command>`; a unit test keeps the two in sync.
 */
export const FINGERPRINT_STEP_COMMAND = 'node .github/scripts/select-integration-tier.mjs fingerprint';

/** A fingerprint as `computeFingerprint` writes it. */
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

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

/** The watched root-level files (lockfile, root package.json, tsconfig*, turbo.json, ...): build inputs for every package. */
const ROOT_INPUT_REGEXPS = TRIGGER_GLOBS.filter((glob) => !glob.includes('/')).map(globToRegExp);

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

/** Run git in `cwd` and return its stdout as text. */
function git(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Throw unless `HEAD` is a two-parent merge commit — GitHub's PR merge ref, whose first parent
 * is the base it was merged onto and whose second is the PR head. Every comparison below relies
 * on that shape.
 */
export function assertPrMergeCommit(cwd) {
    const commits = git(['rev-list', '--parents', '-n', '1', 'HEAD'], cwd).trim().split(/\s+/);
    if (commits.length !== 3) {
        throw new Error(`HEAD has ${commits.length - 1} parent(s); expected the two-parent PR merge commit`);
    }
}

/** The tree or blob id of `rev:path`, or 'absent' when it does not exist. */
function objectId(rev, path, cwd) {
    try {
        return git(['rev-parse', '--verify', '--quiet', `${rev}:${path}`], cwd).trim() || 'absent';
    } catch {
        return 'absent';
    }
}

/**
 * The files the PR merge commit changes against its base. Rename detection is off, so a file
 * moved between packages lists both its old and its new path — the package it left changed too.
 */
export function changedPathsOfMergeCommit(cwd = process.cwd()) {
    assertPrMergeCommit(cwd);
    return git(['diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD'], cwd).split('\n').filter(Boolean);
}

/**
 * SHA-256 over the patch a PR run tests (`HEAD` against its first parent, the base), the
 * base's tree ids for `BASE_STATE_DIRS`, and the base's blob ids for the watched root-level
 * build inputs (lockfile, root package.json, tsconfig*, turbo.json, mj.config.cjs, ...). The patch's `index` lines carry each touched file's
 * before-image blob id, so a base edit to a PR file changes the hash; `--full-index` and
 * `--no-renames` keep the text independent of git configuration (abbreviation length, rename
 * settings). Throws when `HEAD` is not a two-parent merge commit.
 */
export function computeFingerprint(cwd = process.cwd()) {
    assertPrMergeCommit(cwd);
    const patch = execFileSync(
        'git',
        ['diff', '--binary', '--full-index', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv', 'HEAD^1', 'HEAD'],
        { cwd, maxBuffer: 1024 * 1024 * 1024 },
    );
    const hash = createHash('sha256').update(patch);
    for (const dir of BASE_STATE_DIRS) {
        hash.update(`\nbase ${dir} ${objectId('HEAD^1', dir, cwd)}`);
    }
    for (const entry of baseRootInputs(cwd)) {
        hash.update(`\nbase ${entry}`);
    }
    return hash.digest('hex');
}

/** `<object id> <name>` for each watched root-level file in the base, sorted by name. */
function baseRootInputs(cwd) {
    return git(['ls-tree', 'HEAD^1'], cwd)
        .split('\n')
        .map((line) => /^\S+ \S+ (\S+)\t(.+)$/.exec(line))
        .filter((m) => m && ROOT_INPUT_REGEXPS.some((re) => re.test(m[2])))
        .map((m) => `${m[1]} ${m[2]}`)
        .sort((a, b) => a.split(' ')[1].localeCompare(b.split(' ')[1]));
}

/** The URL recorded by an earlier passing run, or null when there is no record. */
export function readPassedMarker(path) {
    if (!path || !existsSync(path)) return null;
    const text = readFileSync(path, 'utf8').trim();
    return text.length > 0 ? text : null;
}

/**
 * The run id of a pass record, which must be exactly one line: `<repoUrl>/actions/runs/<id>`.
 * The record comes from a cache entry anyone's workflow could have written, so the error never
 * repeats its contents — echoed text could forge lines in this job's log.
 */
export function parseRunId(record, repoUrl) {
    const m = /^(\S+)\/actions\/runs\/(\d+)$/.exec(record);
    if (!m) throw new Error('the record is not a single Actions run URL');
    if (m[1] !== repoUrl) throw new Error('the record names a run outside this repository');
    return m[2];
}

/**
 * The fingerprint a recorded run's "Detect PR changes" job computed, read from that job's log.
 * Only the fingerprint step's own section counts — from the first `##[group]Run` header for
 * its command to the next step's header — and it must hold exactly one line that is the
 * fingerprint and nothing else. Lines elsewhere in the log can carry text a PR controls.
 */
export function fingerprintFromChangesLog(log) {
    const lines = log.split('\n').map((line) => line.replace(/\r$/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, ''));
    const start = lines.indexOf(`##[group]Run ${FINGERPRINT_STEP_COMMAND}`);
    if (start < 0) throw new Error('its log has no fingerprint step');
    const end = lines.findIndex((line, i) => i > start && line.startsWith('##[group]Run '));
    const section = lines.slice(start + 1, end < 0 ? undefined : end);
    const found = section.filter((line) => line.startsWith(FINGERPRINT_LOG_PREFIX) && FINGERPRINT_PATTERN.test(line.slice(FINGERPRINT_LOG_PREFIX.length)));
    if (found.length !== 1) throw new Error(`its fingerprint step logged ${found.length} fingerprints`);
    return found[0].slice(FINGERPRINT_LOG_PREFIX.length);
}

/** A GET helper for the GitHub REST API; returns parsed JSON, or text when `text` is set. */
export function githubApi(token, apiUrl = 'https://api.github.com') {
    return async (path, { text = false } = {}) => {
        const res = await fetch(`${apiUrl}${path}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        });
        if (!res.ok) throw new Error(`GET ${path} returned HTTP ${res.status}`);
        return text ? res.text() : res.json();
    };
}

/** Throw unless the run is a `pull_request` run of this workflow for PR `prNumber`. */
function assertRunIsThisPrsTier(run, prNumber) {
    if (run.path !== WORKFLOW_PATH) throw new Error(`the recorded run is of ${run.path}, not ${WORKFLOW_PATH}`);
    if (run.event !== 'pull_request') throw new Error(`the recorded run was a ${run.event} run`);
    if (!(run.pull_requests ?? []).some((p) => p.number === prNumber)) {
        throw new Error(`the recorded run is not for PR #${prNumber}`);
    }
}

/** Throw unless the run's tier job succeeded and its changes job logged `fingerprint`. */
async function assertRunPassedWithFingerprint(api, repository, runId, fingerprint) {
    const { jobs } = await api(`/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`);
    const tier = jobs.find((j) => j.name === TIER_JOB_NAME);
    if (tier?.conclusion !== 'success') throw new Error(`its tier job concluded ${tier?.conclusion ?? 'missing'}`);
    const changes = jobs.find((j) => j.name === CHANGES_JOB_NAME);
    if (!changes) throw new Error(`it has no "${CHANGES_JOB_NAME}" job`);
    const log = await api(`/repos/${repository}/actions/jobs/${changes.id}/logs`, { text: true });
    if (fingerprintFromChangesLog(log) !== fingerprint) throw new Error('its fingerprint differs from this run');
}

/**
 * Throw unless, at the PR head `headSha` the recorded run tested, the PR had not changed any of
 * `TRUSTED_FILES`, or still carries the same version of each now (so the change is in the final
 * diff a reviewer sees). Fetches `headSha` when it is not present locally.
 */
export function assertTrustedFilesUnchangedByPr(headSha, cwd) {
    try {
        git(['cat-file', '-e', `${headSha}^{commit}`], cwd);
    } catch {
        git(['fetch', '--quiet', '--no-tags', 'origin', headSha], cwd);
    }
    const mergeBase = git(['merge-base', headSha, 'HEAD^1'], cwd).trim();
    const touched = git(['diff', '--name-only', '--no-renames', mergeBase, headSha, '--', ...TRUSTED_FILES], cwd).trim();
    if (touched === '') return;
    for (const file of TRUSTED_FILES) {
        if (objectId(headSha, file, cwd) !== objectId('HEAD^2', file, cwd)) {
            throw new Error(`at that run the PR had a version of ${file} it no longer has`);
        }
    }
}

/**
 * Verify a pass record before trusting it: resolves when run `runId` is a passing run of this
 * workflow for PR `prNumber` that logged `fingerprint`, under workflow code the PR had not
 * altered; rejects with the reason otherwise.
 */
export async function verifyPassRecord({ runId, fingerprint, prNumber, repository, api, cwd = process.cwd() }) {
    if (!FINGERPRINT_PATTERN.test(fingerprint ?? '')) throw new Error('this run has no fingerprint');
    const run = await api(`/repos/${repository}/actions/runs/${runId}`);
    assertRunIsThisPrsTier(run, prNumber);
    await assertRunPassedWithFingerprint(api, repository, runId, fingerprint);
    assertTrustedFilesUnchangedByPr(run.head_sha, cwd);
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
            'The base branch has moved since, but not in any file this PR changes, nor in migrations, metadata or test definitions. A new commit to the PR, or such a base change, runs the tier again; it also runs in full when this merges.',
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
    if (decision.notes?.length) {
        lines.push('', ...decision.notes.map((n) => `Note: ${n}`));
    }
    return lines.join('\n') + '\n';
}

/** The GitHub API client for this run, or null when there is no token to call it with. */
function apiFromEnvironment() {
    const token = process.env.GITHUB_TOKEN;
    return token ? githubApi(token, process.env.GITHUB_API_URL) : null;
}

/**
 * The verified pass record, if any: `{ passedRun }` when it checks out, `{ note }` explaining
 * why a record that was found is not trusted, or `{}` when there is none.
 */
export async function checkPassRecord(args, root, api = apiFromEnvironment()) {
    const record = readPassedMarker(args['passed-marker']);
    if (record === null) return {};
    const repository = process.env.GITHUB_REPOSITORY;
    const repoUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}`;
    let runUrl = 'a pass record';
    try {
        const runId = parseRunId(record, repoUrl);
        runUrl = `${repoUrl}/actions/runs/${runId}`;
        if (!api) throw new Error('GITHUB_TOKEN is not set');
        await verifyPassRecord({ runId, fingerprint: args.fingerprint, prNumber: Number(args.pr), repository, api, cwd: root });
        return { passedRun: runUrl };
    } catch (e) {
        return { note: `${runUrl} was found but not trusted: ${e.message}` };
    }
}

/**
 * Compute the decision from the CLI inputs; any failure becomes a "run" decision. `api` is the
 * GitHub API client used to verify a pass record (the environment's by default).
 */
export async function decideFromInputs(args, api = apiFromEnvironment()) {
    const root = args.root ?? process.cwd();
    const record = await checkPassRecord(args, root, api);
    if (record.passedRun) {
        return { run: false, reasons: [], unbuiltPackages: [], passedRun: record.passedRun };
    }
    const notes = record.note ? [record.note] : [];
    try {
        if (!args['build-graph']) throw new Error('usage: --build-graph=<file> is required');
        const changed = args.changed ? readFileSync(args.changed, 'utf8').split('\n') : changedPathsOfMergeCommit(root);
        const builtDirs = builtPackageDirs(JSON.parse(readFileSync(args['build-graph'], 'utf8')));
        return { ...decide(changed, builtDirs, (dir) => existsSync(join(root, dir, 'package.json'))), notes };
    } catch (e) {
        console.log(`::warning::Integration tier selection failed (${e.message}); running the tier.`);
        return { run: true, reasons: [`selection failed: ${e.message}`], unbuiltPackages: [], notes };
    }
}

/** `fingerprint` mode: write the fingerprint, or an empty one (meaning "never skip on it"). */
function writeFingerprint() {
    let fingerprint = '';
    try {
        fingerprint = computeFingerprint();
        console.log(`${FINGERPRINT_LOG_PREFIX}${fingerprint}`);
    } catch (e) {
        console.log(`::warning::Could not fingerprint the PR changes (${e.message}); the already-passed skip is off for this run.`);
    }
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fingerprint=${fingerprint}\n`);
}

async function main() {
    if (process.argv[2] === 'fingerprint') {
        writeFingerprint();
        return;
    }
    const decision = await decideFromInputs(parseArgs(process.argv.slice(2)));
    const summary = formatSummary(decision);
    console.log(summary);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `integration=${decision.run}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    await main();
}
