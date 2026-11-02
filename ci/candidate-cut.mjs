/**
 * The LTS candidate cut (plans/lts-process.md 5.2 rule 1; runbook operation 2), as code.
 *
 * Driven by publish.yml's `cut-candidate` job. The candidate is built from the newest
 * published Edge tag of the line (v6.1.0-edge.N), not from the tip of next: what was
 * tested as Edge is what becomes 6.1.0, and anything merged to next after that tag rides
 * the next stream. Subcommands, run in this order with the build + `changeset publish`
 * between `version` and `merge-into-next`:
 *
 *   preflight --line 6.1   (on next) refuse to start unless every precondition holds;
 *                          resolves the Edge tag and emits it as EDGETAG
 *   version   --line 6.1 --edge-tag v6.1.0-edge.N
 *                          (HEAD detached at the Edge tag) changeset pre exit ->
 *                          changeset version -> lockfile refresh, then prove every
 *                          @memberjunction/* package is at 6.1.0
 *   pre-publish-check --line 6.1 --edge-tag v6.1.0-edge.N
 *                          main is still at the Edge tag, and a trial merge of HEAD into
 *                          <remote>/next has no conflict the resolver cannot handle.
 *                          Run after `version` and again right before the publish.
 *   merge-into-next --line 6.1 --edge-tag v6.1.0-edge.N
 *                          (HEAD at the v6.1.0 tag) check out <remote>/next and merge v6.1.0
 *                          into it; prove the changesets left are exactly those added to
 *                          next after the Edge tag; move every 6.1.0-edge.N version and pin
 *                          on next to 6.1.0 and regenerate the lockfile
 *   reenter   --line 6.1   changeset pre enter edge + the seed changeset that makes the
 *                          next Edge publish 6.2.0-edge.0 (not 6.1.1-edge.0)
 *   push-next --line 6.1   push HEAD to origin/next, merging in anything that landed on
 *                          next while the job ran (bounded retries; same resolver and
 *                          version/pin/lockfile sync as merge-into-next)
 *
 * Conflict resolution, both merges: package.json and the lockfile resolve to next's side
 * (the candidate side only ever changed versions and pins there, which the sync redoes);
 * anything else aborts the merge.
 *
 * Everything that decides is a pure function exported for ci/candidate-cut.test.mjs; the
 * functions that touch git, pnpm or npm are thin and named for what they do. Imports
 * nothing outside Node's stdlib (and ./back-merge.mjs, which holds the same rule) so
 * ci-scripts.yml runs the tests with no install.
 *
 * Rehearsed 2026-09-03 on a scratch clone of origin/next: exit + version gives a clean
 * 6.1.0 across 305 packages; without the seed changeset the first patch-only merge after
 * re-entry versions Edge to 6.1.1-edge.0, which collides with the line's first patch.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { refreshLockfile as refreshLockfileAfterMerge } from './back-merge.mjs';

export const FIXED_GROUP_PREFIX = '@memberjunction/';
export const PRE_JSON = '.changeset/pre.json';
export const LEDGER = 'release-lines.json';
export const LOCKFILE = 'pnpm-lock.yaml';
export const MAX_PUSH_ATTEMPTS = 3;

const EDGE_RX = /^(\d+)\.(\d+)\.0-edge\.(\d+)$/;
const LINE_RX = /^\d+\.\d+$/;

// ---------------------------------------------------------------------------------------
// Pure decisions
// ---------------------------------------------------------------------------------------

/**
 * From the Edge version currently on next, derive what the cut produces.
 * `6.1.0-edge.5` -> line 6.1, candidate 6.1.0, next Edge stream 6.2.
 * @param {string} edgeVersion
 */
export function deriveCut(edgeVersion) {
    const m = EDGE_RX.exec(edgeVersion ?? '');
    if (!m) {
        throw new Error(
            `next is at "${edgeVersion}", which is not an Edge prerelease of the form X.Y.0-edge.N. ` +
                `A candidate is cut from the Edge stream only.`,
        );
    }
    const major = Number(m[1]);
    const minor = Number(m[2]);
    return {
        line: `${major}.${minor}`,
        version: `${major}.${minor}.0`,
        tag: `v${major}.${minor}.0`,
        branch: `lts/${major}.${minor}`,
        npmTag: `lts-${major}.${minor}`,
        nextLine: `${major}.${minor + 1}`,
    };
}

/**
 * The operator names the line they intend to cut; it must be the one the stream produces.
 * @param {string} requestedLine
 * @param {string} edgeVersion
 */
export function assertRequestedLineMatches(requestedLine, edgeVersion) {
    if (!LINE_RX.test(requestedLine ?? '')) {
        throw new Error(`--line must look like X.Y (got "${requestedLine}")`);
    }
    const cut = deriveCut(edgeVersion);
    if (cut.line !== requestedLine) {
        throw new Error(
            `--line ${requestedLine} does not match the stream on next: ${edgeVersion} cuts line ${cut.line}. ` +
                `Refusing to cut a line the code does not produce.`,
        );
    }
    return cut;
}

/**
 * pre.json must be live Edge pre-mode. `mode: "exit"` means a previous cut attempt got
 * halfway; that needs a human, not a retry.
 * @param {{mode?: string, tag?: string} | null} pre
 */
export function assertEdgePreMode(pre) {
    if (!pre) throw new Error(`${PRE_JSON} is missing: next is not in Edge pre-mode, nothing to exit.`);
    if (pre.mode !== 'pre') {
        throw new Error(`${PRE_JSON} has mode "${pre.mode}", expected "pre". A half-finished cut? Inspect before retrying.`);
    }
    if (pre.tag !== 'edge') {
        throw new Error(`${PRE_JSON} has tag "${pre.tag}", expected "edge".`);
    }
}

/**
 * The ledger entry is the reviewed precondition (release-lines-guard + CODEOWNERS): the
 * workflow appends mechanical fields only, so `lines[line]` must already exist as a
 * candidate with its candidateDate, and must not already record a release.
 * @param {object} doc parsed release-lines.json
 * @param {string} line
 */
export function assertLedgerReadyForCut(doc, line) {
    const entry = doc?.lines?.[line];
    if (!entry) {
        throw new Error(
            `${LEDGER} has no lines["${line}"]. Merge the candidate entry PR first ` +
                `({ "status": "candidate", "candidateDate": "YYYY-MM-DD" }); the publish job only appends mechanical fields.`,
        );
    }
    if (entry.status !== 'candidate') {
        throw new Error(`${LEDGER} lines["${line}"].status is "${entry.status}", expected "candidate".`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.candidateDate ?? '')) {
        throw new Error(`${LEDGER} lines["${line}"].candidateDate is missing or malformed.`);
    }
    if (entry.newest || (entry.releases && Object.keys(entry.releases).length > 0)) {
        throw new Error(`${LEDGER} lines["${line}"] already records a release (newest=${entry.newest}). Was ${line} already cut?`);
    }
}

/**
 * After `changeset version`, every package in the fixed group must sit at the candidate
 * version. Anything else means the version step did not do what the cut assumes.
 * @param {{name: string, version: string}[]} packages
 * @param {string} expected
 */
export function assertFixedGroupAt(packages, expected) {
    const group = packages.filter((p) => p.name?.startsWith(FIXED_GROUP_PREFIX));
    if (group.length === 0) throw new Error(`no ${FIXED_GROUP_PREFIX}* packages found in the workspace`);
    const wrong = group.filter((p) => p.version !== expected);
    if (wrong.length > 0) {
        const sample = wrong.slice(0, 5).map((p) => `${p.name}@${p.version}`).join(', ');
        throw new Error(`${wrong.length} of ${group.length} fixed-group packages are not at ${expected}: ${sample}${wrong.length > 5 ? ', ...' : ''}`);
    }
    return group.length;
}

/**
 * Names of pending changeset files (everything in .changeset/ except README and pre.json).
 * @param {string[]} entries directory listing of .changeset/
 */
export function pendingChangesets(entries) {
    return entries.filter((f) => f.endsWith('.md') && f !== 'README.md');
}

/**
 * The seed changeset that opens the next Edge stream. A `minor` on one fixed-group package
 * moves the whole group, so the first Edge publish after re-entry is X.(Y+1).0-edge.0.
 * @param {string} nextLine e.g. "6.2"
 */
export function seedChangeset(nextLine) {
    if (!LINE_RX.test(nextLine)) throw new Error(`nextLine must look like X.Y (got "${nextLine}")`);
    return {
        file: `.changeset/open-${nextLine.replace('.', '-')}-edge-stream.md`,
        content:
            `---\n"@memberjunction/core": minor\n---\n\n` +
            `Open the ${nextLine} Edge stream: first Edge release of line ${nextLine} (${nextLine}.0-edge.0). ` +
            `Written by ci/candidate-cut.mjs at the previous line's cut; without it the first patch-only ` +
            `merge would version Edge to a tuple the new line's patches own.\n`,
    };
}

/**
 * The newest Edge tag of a line: `v6.1.0-edge.N` with the highest N (numerically, so
 * edge.10 beats edge.9), or null when the line has none.
 * @param {string[]} tags
 * @param {string} line e.g. "6.1"
 */
export function newestEdgeTag(tags, line) {
    if (!LINE_RX.test(line ?? '')) throw new Error(`line must look like X.Y (got "${line}")`);
    const rx = new RegExp(`^v${line.replace('.', '\\.')}\\.0-edge\\.(\\d+)$`);
    let best = null;
    let bestN = -1;
    for (const t of tags) {
        const m = rx.exec(t);
        if (m && Number(m[1]) > bestN) {
            best = t;
            bestN = Number(m[1]);
        }
    }
    return best;
}

/**
 * The changesets next must still carry after the candidate merges in: those on next that
 * did not exist at the Edge tag. Everything present at the tag was consumed by X.Y.0.
 * @param {string[]} atEdgeTag pending changesets in the Edge tag's tree
 * @param {string[]} onNext pending changesets on next before the merge
 */
export function keptChangesets(atEdgeTag, onNext) {
    const consumed = new Set(atEdgeTag);
    return onNext.filter((f) => !consumed.has(f)).sort();
}

/**
 * After merging X.Y.0 into next, the pending changesets must be exactly the kept set:
 * a consumed one surviving would re-bump the next stream with work the line already
 * shipped, a kept one missing would drop work from it.
 * @param {string[]} actual
 * @param {string[]} expected
 */
export function assertChangesetsAfterMerge(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    const unexpected = [...a].filter((f) => !e.has(f)).sort();
    const missing = [...e].filter((f) => !a.has(f)).sort();
    if (unexpected.length === 0 && missing.length === 0) return;
    throw new Error(
        `changesets on next after merging the candidate are wrong (unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`,
    );
}

/**
 * pre.json right after `changeset pre enter edge` on next: Edge pre-mode starting from
 * the candidate's version, with no changeset marked as already released, so every kept
 * changeset plus the seed counts toward the first Edge publish of the next stream.
 * @param {{mode?: string, tag?: string, initialVersions?: Record<string,string>, changesets?: string[]} | null} pre
 * @param {string} version e.g. "6.1.0"
 */
export function assertReenteredPreJson(pre, version) {
    assertEdgePreMode(pre);
    const consumed = pre.changesets ?? [];
    if (consumed.length > 0) throw new Error(`${PRE_JSON} already lists ${consumed.length} changeset(s) as released: ${consumed.slice(0, 5).join(', ')}`);
    // Every fixed-group entry, not just one: changesets numbers the first prerelease of
    // the group from the highest initial version, so a single package left at
    // X.Y.0-edge.N would make the new stream start at X.(Y+1).0-edge.(N+1), not edge.0.
    const initial = Object.entries(pre.initialVersions ?? {}).filter(([name]) => name.startsWith(FIXED_GROUP_PREFIX));
    if (initial.length === 0) throw new Error(`${PRE_JSON} initialVersions has no ${FIXED_GROUP_PREFIX}* packages`);
    const wrong = initial.filter(([, v]) => v !== version).map(([n, v]) => `${n}@${v}`);
    if (wrong.length > 0) {
        throw new Error(`${PRE_JSON} initialVersions has ${wrong.length} ${FIXED_GROUP_PREFIX}* package(s) not at ${version}: ${wrong.slice(0, 5).join(', ')}`);
    }
}

/**
 * Move this line's Edge tuple to the candidate's in package.json text: `"version"` and
 * every `@memberjunction/*` value of the form [~^]X.Y.0-edge.N become [~^]X.Y.0. Text in,
 * text out, so formatting and key order survive. Other lines' tuples, normal versions,
 * workspace: specifiers and non-MJ packages are left alone.
 * @param {string} text
 * @param {string} line e.g. "6.2"
 */
export function rewriteEdgePins(text, line) {
    if (!LINE_RX.test(line ?? '')) throw new Error(`line must look like X.Y (got "${line}")`);
    const tuple = line.replace('.', '\\.');
    const rx = new RegExp(`("(?:version|@memberjunction/[^"]+)"\\s*:\\s*")([~^]?)${tuple}\\.0-edge\\.\\d+"`, 'g');
    return text.replace(rx, `$1$2${line}.0"`);
}

/**
 * Conflicted paths from `git merge-tree --write-tree --name-only` output: the tree id,
 * then one path per line up to the first blank line, then informational messages.
 * @param {string} stdout
 */
export function parseMergeTreeConflicts(stdout) {
    const lines = stdout.split('\n').slice(1);
    const end = lines.indexOf('');
    return [...new Set(end === -1 ? lines : lines.slice(0, end))].filter(Boolean);
}

/**
 * The conflicts the merge resolver cannot settle: anything but a package.json or the
 * root lockfile.
 * @param {string[]} paths
 */
export function unresolvableConflicts(paths) {
    return paths.filter((p) => path.posix.basename(p) !== 'package.json' && p !== LOCKFILE);
}

/**
 * Group the preflight facts into failures. Pure so the test can drive every branch.
 * The edge* facts describe the newest Edge tag of the line (edgeTag null: there is none)
 * and pendingCount is counted in that tag's tree, because that tree is what gets versioned.
 * @param {{
 *   remoteBranchExists: boolean, remoteTagExists: boolean, npmVersionExists: boolean,
 *   pendingCount: number, currentBranch: string, edgeTag: string | null,
 *   edgeTagVersion?: string, edgeTagPre?: object | null,
 *   npmEdgeVersionExists?: boolean, npmEdgeDistTag?: string, mainAtEdgeTag?: boolean,
 *   edgeTagIsAncestorOfNext?: boolean
 * }} facts
 * @param {ReturnType<typeof deriveCut>} cut
 */
export function preflightFailures(facts, cut) {
    const failures = [];
    if (facts.currentBranch !== 'next') failures.push(`HEAD is "${facts.currentBranch}", the cut runs on next`);
    if (facts.remoteBranchExists) failures.push(`origin already has ${cut.branch}; this line was cut before`);
    if (facts.remoteTagExists) failures.push(`origin already has tag ${cut.tag}`);
    if (facts.npmVersionExists) failures.push(`npm already has @memberjunction/core@${cut.version}`);
    if (!facts.edgeTag) {
        failures.push(`no Edge tag v${cut.line}.0-edge.* exists: the candidate is built from the newest Edge release of the line, publish one first`);
        return failures;
    }
    failures.push(...edgeTagFailures(facts));
    return failures;
}

function edgeTagFailures(facts) {
    const failures = [];
    const want = facts.edgeTag.slice(1);
    if (facts.edgeTagVersion !== want) failures.push(`${facts.edgeTag} carries version ${facts.edgeTagVersion} in its tree, expected ${want}`);
    try {
        assertEdgePreMode(facts.edgeTagPre);
    } catch (e) {
        failures.push(`at ${facts.edgeTag}: ${e.message}`);
    }
    if (!facts.npmEdgeVersionExists) failures.push(`npm has no @memberjunction/core@${want}: ${facts.edgeTag} was tagged but never published`);
    if (facts.npmEdgeDistTag !== want) {
        failures.push(`npm dist-tag edge is at ${facts.npmEdgeDistTag}, not ${want}: an Edge release is in flight or the tag and npm disagree`);
    }
    if (facts.pendingCount === 0) failures.push(`no pending changesets at ${facts.edgeTag}: changeset version would be a no-op`);
    if (!facts.edgeTagIsAncestorOfNext) {
        failures.push(
            `${facts.edgeTag} is not an ancestor of next: its main -> next back-merge has not landed (look for an open back-merge fallback PR). Land it first; cutting over it would publish and then conflict`,
        );
    }
    if (!facts.mainAtEdgeTag) {
        failures.push(`main is not at ${facts.edgeTag}: a release is on its way to main; let it publish as Edge (or revert it) before cutting`);
    }
    return failures;
}

/** @param {string[]} argv */
export function parseCliArgs(argv) {
    const args = { command: argv[0], line: undefined, remote: 'origin', edgeTag: undefined };
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--line') args.line = argv[++i];
        else if (a === '--remote') args.remote = argv[++i];
        else if (a === '--edge-tag') args.edgeTag = argv[++i];
        else throw new Error(`unknown argument "${a}"`);
    }
    return args;
}

// ---------------------------------------------------------------------------------------
// Thin side-effect wrappers. Each does one thing and is named for it.
// ---------------------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
    try {
        const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });
        return out == null ? '' : out.trim(); // null when the caller inherited stdout
    } catch (e) {
        // git prints "nothing to commit" and friends on STDOUT, which the pipe swallowed;
        // surface it so a red step names the reason, not just the command.
        const captured = [e.stdout, e.stderr].filter(Boolean).map((s) => String(s).trim()).filter(Boolean).join('\n');
        e.message = `${cmd} ${args.join(' ')} failed (exit ${e.status})${captured ? `:\n${captured}` : ''}`;
        throw e;
    }
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readPreJson() {
    return fs.existsSync(PRE_JSON) ? readJson(PRE_JSON) : null;
}

const VERSION_SOURCE = 'packages/MJServer/package.json';

function readEdgeVersion() {
    return readJson(VERSION_SOURCE).version;
}

/** @returns {string | null} the file's content at `rev`, null when it is absent there */
function gitShowOrNull(rev, file) {
    try {
        return run('git', ['show', `${rev}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
        if (e.status === 128) return null; // "path does not exist in <rev>"
        throw e;
    }
}

function pendingChangesetsAt(rev) {
    const paths = run('git', ['ls-tree', '--name-only', `${rev}`, '.changeset/']).split('\n').filter(Boolean);
    return pendingChangesets(paths.map((p) => path.basename(p)));
}

function revParse(rev) {
    return run('git', ['rev-parse', '--verify', `${rev}^{commit}`]);
}

/** The --edge-tag a later step was handed must be an Edge tag of this line and exist. */
function assertEdgeTagArg(args) {
    if (!args.edgeTag || newestEdgeTag([args.edgeTag], args.line) !== args.edgeTag) {
        throw new Error(`--edge-tag must be a v${args.line}.0-edge.N tag (got "${args.edgeTag}")`);
    }
    return revParse(args.edgeTag);
}

function listWorkspacePackages() {
    const raw = run('pnpm', ['-r', 'ls', '--depth', '-1', '--json']);
    return JSON.parse(raw).map((p) => ({ name: p.name, version: p.version, path: p.path }));
}

function remoteRefExists(remote, ref) {
    return run('git', ['ls-remote', '--exit-code', remote, ref], { stdio: ['ignore', 'pipe', 'ignore'] }) !== '';
}

function tryRemoteRefExists(remote, ref) {
    try {
        return remoteRefExists(remote, ref);
    } catch (e) {
        if (e.status === 2) return false; // --exit-code: 2 means "no matching ref"
        throw e;
    }
}

function npmDistTag(tag) {
    return run('npm', ['view', '@memberjunction/core', `dist-tags.${tag}`], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function npmVersionExists(version) {
    // An unknown version prints nothing and exits 0; an unknown package is E404. Anything
    // else (network, auth) is a real failure and must stop the cut, not read as "absent".
    try {
        return run('npm', ['view', `@memberjunction/core@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'pipe'] }) === version;
    } catch (e) {
        if (/E404/.test(String(e.stderr ?? ''))) return false;
        throw new Error(`npm view @memberjunction/core@${version} failed: ${String(e.stderr ?? e.message).trim()}`);
    }
}

function gitCommitAll(message) {
    run('git', ['add', '-A']);
    run('git', ['commit', '-m', message]);
}

// ---------------------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------------------

function preflight(args) {
    const cut = assertRequestedLineMatches(args.line, readEdgeVersion());
    assertEdgePreMode(readPreJson());
    assertLedgerReadyForCut(readJson(LEDGER), cut.line);
    const edgeTag = newestEdgeTag(run('git', ['tag', '--list', `v${cut.line}.0-edge.*`]).split('\n'), cut.line);
    const facts = {
        currentBranch: run('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
        remoteBranchExists: tryRemoteRefExists(args.remote, `refs/heads/${cut.branch}`),
        remoteTagExists: tryRemoteRefExists(args.remote, `refs/tags/${cut.tag}`),
        npmVersionExists: npmVersionExists(cut.version),
        edgeTag,
        ...(edgeTag ? readEdgeTagFacts(edgeTag, args.remote) : { pendingCount: 0 }),
    };
    const failures = preflightFailures(facts, cut);
    if (failures.length > 0) throw new Error(`preflight failed:\n  - ${failures.join('\n  - ')}`);
    reportDistanceFromEdgeTag(edgeTag);
    console.log(`preflight OK: ${edgeTag} -> ${cut.version} on ${cut.branch} (npm ${cut.npmTag}); ${facts.pendingCount} changesets at the tag; Edge resumes at ${cut.nextLine}.0-edge.0`);
    emitOutputs({ ...cut, edgeTag });
}

function readEdgeTagFacts(edgeTag, remote) {
    const versionJson = gitShowOrNull(edgeTag, VERSION_SOURCE);
    const preJson = gitShowOrNull(edgeTag, PRE_JSON);
    const want = edgeTag.slice(1);
    return {
        edgeTagVersion: versionJson ? JSON.parse(versionJson).version : undefined,
        edgeTagPre: preJson ? JSON.parse(preJson) : null,
        npmEdgeVersionExists: npmVersionExists(want),
        npmEdgeDistTag: npmDistTag('edge'),
        pendingCount: pendingChangesetsAt(edgeTag).length,
        mainAtEdgeTag: mainCommit(remote) === revParse(edgeTag),
        edgeTagIsAncestorOfNext: isAncestor(edgeTag, 'HEAD'),
    };
}

function isAncestor(ancestor, rev) {
    try {
        run('git', ['merge-base', '--is-ancestor', ancestor, rev]);
        return true;
    } catch (e) {
        if (e.status !== 1) throw e;
        return false;
    }
}

function mainCommit(remote) {
    run('git', ['fetch', remote, 'main']);
    return revParse(`${remote}/main`);
}

/** Informational: what on next is NOT going into the candidate. */
function reportDistanceFromEdgeTag(edgeTag) {
    const ahead = run('git', ['rev-list', '--count', `${edgeTag}..HEAD`]);
    console.log(`next is ${ahead} commit(s) ahead of ${edgeTag}; those ride the next Edge stream, not the candidate`);
}

function version(args) {
    const edgeCommit = assertEdgeTagArg(args);
    if (revParse('HEAD') !== edgeCommit) throw new Error(`HEAD is not at ${args.edgeTag}; the candidate is versioned from the Edge tag's commit`);
    const cut = assertRequestedLineMatches(args.line, readEdgeVersion());
    assertEdgePreMode(readPreJson());

    console.log('changeset pre exit');
    run('pnpm', ['exec', 'changeset', 'pre', 'exit'], { stdio: 'inherit' });
    gitCommitAll(`chore: exit Edge pre-mode for the ${cut.line} candidate`);

    console.log('changeset version');
    run('pnpm', ['exec', 'changeset', 'version'], { stdio: 'inherit' }); // .changeset/config.json commit:true
    if (fs.existsSync(PRE_JSON)) throw new Error(`${PRE_JSON} still exists after changeset version in exit mode`);
    const left = pendingChangesets(fs.readdirSync('.changeset'));
    if (left.length > 0) throw new Error(`${left.length} changesets survived changeset version: ${left.slice(0, 5).join(', ')}`);
    const count = assertFixedGroupAt(listWorkspacePackages(), cut.version);

    refreshCandidateLockfile('chore: lockfile for the candidate [skip ci]');
    console.log(`version OK: ${count} ${FIXED_GROUP_PREFIX}* packages at ${cut.version}`);
    emitOutputs(cut);
}

/** Regenerate the lockfile, commit it if it moved, then prove it with a frozen install. */
function refreshCandidateLockfile(message) {
    console.log(`refreshing ${LOCKFILE}`);
    run('pnpm', ['install', '--no-frozen-lockfile'], { stdio: 'inherit' });
    if (run('git', ['status', '--porcelain', '--', LOCKFILE]) !== '') {
        run('git', ['add', LOCKFILE]);
        run('git', ['commit', '-m', message]);
    }
    run('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' }); // the only proof the lockfile is in sync
}

/**
 * Rewrite the given package.json files with rewriteEdgePins. Writes files, does not
 * commit. Exported for the git-backed test.
 * @param {string} line
 * @param {string[]} files package.json paths (the workspace's, as `changeset version` sees them)
 * @returns {string[]} the files it changed
 */
export function rewriteWorkspacePins(line, files) {
    const changed = [];
    for (const f of files) {
        const before = fs.readFileSync(f, 'utf8');
        const after = rewriteEdgePins(before, line);
        if (after === before) continue;
        fs.writeFileSync(f, after);
        changed.push(f);
    }
    return changed;
}

/**
 * The slice of simple-git's client that back-merge.mjs's refreshLockfile uses, over plain
 * git, so the Edge back-merge and the cut regenerate next's lockfile the same way.
 */
const syncGitClient = {
    status: async () => ({
        modified: run('git', ['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean),
        not_added: run('git', ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean),
    }),
    add: async (file) => run('git', ['add', '--', file]),
    commit: async (message) => run('git', ['commit', '-m', message]),
};

/**
 * After a merge onto next: every X.Y.0-edge.N version and pin becomes X.Y.0 (packages
 * and pins added after the Edge tag included), the lockfile is regenerated the way the
 * Edge back-merge does it (required: the manifests just moved) and proven with a frozen
 * install, and the whole fixed group must sit at X.Y.0.
 */
async function syncNextToCandidate(line) {
    const manifests = listWorkspacePackages().map((p) => path.relative(process.cwd(), path.join(p.path, 'package.json')));
    const changed = rewriteWorkspacePins(line, manifests);
    if (changed.length > 0) {
        run('git', ['add', '--', ...changed]);
        run('git', ['commit', '-m', `chore: move next's ${line}.0-edge versions and pins to ${line}.0 [skip ci]`]);
    }
    console.log(`rewrote ${changed.length} package.json file(s) to ${line}.0`);
    await refreshLockfileAfterMerge(syncGitClient, { required: true });
    run('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' }); // the only proof the lockfile is in sync
    return assertFixedGroupAt(listWorkspacePackages(), `${line}.0`);
}

/**
 * Merge `theirs` into `ours` without touching the index or the working tree: the merged
 * tree's id and the paths that would conflict. Exported for the git-backed test.
 * @returns {{tree: string, conflicts: string[]}}
 */
export function trialMerge(ours, theirs) {
    let stdout;
    try {
        stdout = run('git', ['merge-tree', '--write-tree', '--name-only', ours, theirs], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        if (e.status !== 1) throw e; // 1 = conflicts; anything else is git failing
        stdout = String(e.stdout ?? '');
    }
    return { tree: stdout.split('\n')[0].trim(), conflicts: parseMergeTreeConflicts(stdout) };
}

/**
 * Refuse, while nothing is published, if the cut could not finish: main moved past the
 * Edge tag (a release queued behind this run would publish an Edge build of the closed
 * stream and back-merge it into next), or HEAD cannot merge into next mechanically.
 */
function prePublishCheck(args) {
    const edgeCommit = assertEdgeTagArg(args);
    if (mainCommit(args.remote) !== edgeCommit) {
        throw new Error(`${args.remote}/main moved off ${args.edgeTag} during the cut. Nothing is published; let that release go out as Edge, then re-dispatch.`);
    }
    run('git', ['fetch', args.remote, 'next']);
    const nextRef = `${args.remote}/next`;
    const { tree, conflicts } = trialMerge(nextRef, 'HEAD');
    const unresolvable = unresolvableConflicts(conflicts);
    if (unresolvable.length > 0) {
        throw new Error(`the candidate would not merge into ${nextRef}: conflicts outside package.json and ${LOCKFILE}: ${unresolvable.join(', ')}. Nothing is published.`);
    }
    // The same partition merge-into-next asserts, on the trial tree, while it is still free.
    assertChangesetsAfterMerge(pendingChangesetsAt(tree), keptChangesets(pendingChangesetsAt(edgeCommit), pendingChangesetsAt(nextRef)));
    console.log(`pre-publish-check OK: main at ${args.edgeTag}; trial merge into next has ${conflicts.length} package.json/lockfile conflict(s), all mechanical`);
}

/**
 * HEAD is the candidate tag (built off the Edge tag, on no branch). Move to next and merge
 * the candidate in, so next carries X.Y.0's versions and changelogs and loses the
 * changesets it consumed, while keeping every changeset merged after the Edge tag. Only
 * the lockfile may auto-resolve; the packages are already on npm if this stops.
 */
async function mergeIntoNext(args) {
    const edgeCommit = assertEdgeTagArg(args);
    const cut = deriveCut(args.edgeTag.slice(1));
    const candidateCommit = revParse(cut.tag);
    if (revParse('HEAD') !== candidateCommit) throw new Error(`HEAD is not at ${cut.tag}; tag the candidate before merging it into next`);
    if (!isAncestor(edgeCommit, candidateCommit)) throw new Error(`${cut.tag} is not built on ${args.edgeTag}; refusing to merge it into next`);

    run('git', ['fetch', args.remote, 'next']);
    const nextRef = `${args.remote}/next`;
    const kept = keptChangesets(pendingChangesetsAt(edgeCommit), pendingChangesetsAt(nextRef));
    run('git', ['checkout', '-B', 'candidate-cut-next', nextRef]);
    mergeIntoHead(cut.tag, 'ours', `chore: merge the ${cut.version} candidate into next [skip ci]`);

    assertChangesetsAfterMerge(pendingChangesets(fs.readdirSync('.changeset')), kept);
    const count = await syncNextToCandidate(cut.line);
    console.log(`merge-into-next OK: ${cut.tag} merged into ${nextRef}; ${count} packages at ${cut.version}; ${kept.length} changeset(s) added after ${args.edgeTag} stay for the ${cut.nextLine} stream`);
}

function reenter(args) {
    if (!LINE_RX.test(args.line ?? '')) throw new Error(`--line must look like X.Y (got "${args.line}")`);
    const current = readEdgeVersion();
    if (current !== `${args.line}.0`) throw new Error(`expected the tree at ${args.line}.0 before re-entering pre-mode, found ${current}`);
    if (fs.existsSync(PRE_JSON)) throw new Error(`${PRE_JSON} already exists; re-entry already happened?`);
    const [major, minor] = args.line.split('.').map(Number);
    const seed = seedChangeset(`${major}.${minor + 1}`);

    console.log('changeset pre enter edge');
    run('pnpm', ['exec', 'changeset', 'pre', 'enter', 'edge'], { stdio: 'inherit' });
    assertReenteredPreJson(readPreJson(), current);
    fs.writeFileSync(seed.file, seed.content);
    gitCommitAll(`chore: re-enter Edge pre-mode; open the ${major}.${minor + 1} stream`);
    console.log(`reenter OK: ${seed.file} written; next Edge publish is ${major}.${minor + 1}.0-edge.0`);
}

/**
 * Push HEAD to next. next keeps merging while the job runs (~40 minutes of build and
 * publish), so a plain push can be rejected as non-fast-forward. Merge origin/next in and
 * retry, bounded. Only the lockfile may auto-resolve; anything else stops here with the
 * packages already on npm, which is the same "released, not yet recorded" posture the Edge
 * back-merge takes. Never force.
 */
async function pushNext(args) {
    if (!LINE_RX.test(args.line ?? '')) throw new Error(`--line must look like X.Y (got "${args.line}")`);
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
        run('git', ['fetch', args.remote, 'next']);
        const before = revParse('HEAD');
        mergeIntoHead(`${args.remote}/next`, 'theirs');
        if (revParse('HEAD') !== before) await syncNextToCandidate(args.line);
        try {
            run('git', ['push', args.remote, 'HEAD:next'], { stdio: 'inherit' });
            console.log(`push-next OK on attempt ${attempt}`);
            return;
        } catch (e) {
            console.error(`push to next rejected on attempt ${attempt}/${MAX_PUSH_ATTEMPTS}: ${e.message}`);
        }
    }
    throw new Error(`could not push to next after ${MAX_PUSH_ATTEMPTS} attempts. The packages are on npm; finish the push by hand.`);
}

/**
 * Merge `ref` into HEAD. Conflicts in package.json files and the lockfile resolve to
 * `nextSide` ('ours' when HEAD is next, 'theirs' when `ref` is), including a deletion on
 * that side; the caller then re-applies the version/pin sync. Any other conflict aborts
 * the merge and throws. Exported for the git-backed test.
 * @param {string} ref
 * @param {'ours' | 'theirs'} nextSide which side of the merge is next
 * @param {string} [message] merge commit message; git's default when omitted
 */
export function mergeIntoHead(ref, nextSide, message) {
    if (nextSide !== 'ours' && nextSide !== 'theirs') throw new Error(`nextSide must be ours or theirs (got "${nextSide}")`);
    const messageArgs = message ? ['--no-ff', '-m', message] : ['--no-edit'];
    try {
        run('git', ['merge', ...messageArgs, ref], { stdio: ['ignore', 'pipe', 'pipe'] });
        return;
    } catch (mergeError) {
        const conflicted = run('git', ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
        if (conflicted.length === 0) throw mergeError;
        const unresolvable = unresolvableConflicts(conflicted);
        if (unresolvable.length > 0) {
            run('git', ['merge', '--abort']);
            throw new Error(`merging ${ref} conflicts outside package.json and ${LOCKFILE}: ${unresolvable.join(', ')}. Aborted; resolve by hand. ${mergeError.message}`);
        }
        for (const p of conflicted) takeNextSide(p, nextSide);
        run('git', ['commit', '--no-edit']);
        console.log(`merged ${ref}: ${conflicted.length} package.json/lockfile conflict(s) resolved to next's side`);
    }
}

function takeNextSide(file, nextSide) {
    const stage = nextSide === 'ours' ? 2 : 3;
    try {
        run('git', ['cat-file', '-e', `:${stage}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
        if (e.status !== 128 && e.status !== 1) throw e;
        run('git', ['rm', '-q', '--', file]); // next deleted it
        return;
    }
    run('git', ['checkout', `--${nextSide}`, '--', file]);
    run('git', ['add', '--', file]);
}

/** Expose the derived names to later workflow steps via $GITHUB_OUTPUT when present. */
function emitOutputs(cut) {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) return;
    const lines = Object.entries(cut).map(([k, v]) => `${k.toUpperCase()}=${v}`);
    fs.appendFileSync(out, lines.join('\n') + '\n');
}

const COMMANDS = { preflight, version, 'pre-publish-check': prePublishCheck, 'merge-into-next': mergeIntoNext, reenter, 'push-next': pushNext };

async function main(argv) {
    const args = parseCliArgs(argv);
    const fn = COMMANDS[args.command];
    if (!fn) throw new Error(`usage: candidate-cut.mjs <${Object.keys(COMMANDS).join('|')}> --line X.Y [--edge-tag vX.Y.0-edge.N] [--remote origin]`);
    await fn(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((e) => {
        console.error(`FAIL ${e.message}`);
        process.exit(1);
    });
}
