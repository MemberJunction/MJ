/**
 * The LTS candidate cut (plans/lts-process.md 5.2 rule 1; runbook operation 2), as code.
 *
 * Driven by publish.yml's `cut-candidate` job. Three subcommands, run in this order with
 * the build + `changeset publish` between `version` and `reenter`:
 *
 *   preflight --line 6.1   refuse to start unless every precondition holds
 *   version   --line 6.1   changeset pre exit -> changeset version -> lockfile refresh,
 *                          then prove every @memberjunction/* package is at 6.1.0
 *   reenter   --line 6.1   changeset pre enter edge + the seed changeset that makes the
 *                          next Edge publish 6.2.0-edge.0 (not 6.1.1-edge.0)
 *   push-next              push HEAD to origin/next, merging in anything that landed on
 *                          next while the job ran (bounded retries, lockfile-only auto-merge)
 *
 * Everything that decides is a pure function exported for ci/candidate-cut.test.mjs; the
 * functions that touch git, pnpm or npm are thin and named for what they do. Imports
 * nothing outside Node's stdlib so ci-scripts.yml runs the tests with no install.
 *
 * Rehearsed 2026-09-03 on a scratch clone of origin/next: exit + version gives a clean
 * 6.1.0 across 305 packages; without the seed changeset the first patch-only merge after
 * re-entry versions Edge to 6.1.1-edge.0, which collides with the line's first patch.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
 * Group the preflight facts into failures. Pure so the test can drive every branch.
 * @param {{
 *   remoteBranchExists: boolean, remoteTagExists: boolean, npmVersionExists: boolean,
 *   pendingCount: number, currentBranch: string
 * }} facts
 * @param {ReturnType<typeof deriveCut>} cut
 */
export function preflightFailures(facts, cut) {
    const failures = [];
    if (facts.currentBranch !== 'next') failures.push(`HEAD is "${facts.currentBranch}", the cut runs on next`);
    if (facts.remoteBranchExists) failures.push(`origin already has ${cut.branch}; this line was cut before`);
    if (facts.remoteTagExists) failures.push(`origin already has tag ${cut.tag}`);
    if (facts.npmVersionExists) failures.push(`npm already has @memberjunction/core@${cut.version}`);
    if (facts.pendingCount === 0) failures.push(`no pending changesets: changeset version would be a no-op`);
    return failures;
}

/** @param {string[]} argv */
export function parseCliArgs(argv) {
    const args = { command: argv[0], line: undefined, remote: 'origin' };
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--line') args.line = argv[++i];
        else if (a === '--remote') args.remote = argv[++i];
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

function readEdgeVersion() {
    return readJson(path.join('packages', 'MJServer', 'package.json')).version;
}

function listWorkspacePackages() {
    const raw = run('pnpm', ['-r', 'ls', '--depth', '-1', '--json']);
    return JSON.parse(raw).map((p) => ({ name: p.name, version: p.version }));
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
    const edgeVersion = readEdgeVersion();
    const cut = assertRequestedLineMatches(args.line, edgeVersion);
    assertEdgePreMode(readPreJson());
    assertLedgerReadyForCut(readJson(LEDGER), cut.line);
    const facts = {
        currentBranch: run('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
        remoteBranchExists: tryRemoteRefExists(args.remote, `refs/heads/${cut.branch}`),
        remoteTagExists: tryRemoteRefExists(args.remote, `refs/tags/${cut.tag}`),
        npmVersionExists: npmVersionExists(cut.version),
        pendingCount: pendingChangesets(fs.readdirSync('.changeset')).length,
    };
    const failures = preflightFailures(facts, cut);
    if (failures.length > 0) throw new Error(`preflight failed:\n  - ${failures.join('\n  - ')}`);
    console.log(`preflight OK: ${edgeVersion} -> ${cut.version} on ${cut.branch} (npm ${cut.npmTag}); ${facts.pendingCount} changesets pending; Edge resumes at ${cut.nextLine}.0-edge.0`);
    emitOutputs(cut);
}

function version(args) {
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

    console.log(`refreshing ${LOCKFILE} for the version bump`);
    run('pnpm', ['install', '--no-frozen-lockfile'], { stdio: 'inherit' });
    if (run('git', ['status', '--porcelain', '--', LOCKFILE]) !== '') {
        run('git', ['add', LOCKFILE]);
        run('git', ['commit', '-m', 'chore: lockfile for the candidate [skip ci]']);
    }
    run('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' }); // the only proof the lockfile is in sync
    console.log(`version OK: ${count} ${FIXED_GROUP_PREFIX}* packages at ${cut.version}`);
    emitOutputs(cut);
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
    assertEdgePreMode(readPreJson());
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
function pushNext(args) {
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
        run('git', ['fetch', args.remote, 'next']);
        mergeRemoteNextIntoHead(args.remote);
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

function mergeRemoteNextIntoHead(remote) {
    try {
        run('git', ['merge', '--no-edit', `${remote}/next`]);
    } catch (mergeError) {
        const conflicted = run('git', ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
        const unresolvable = conflicted.filter((p) => p !== LOCKFILE);
        if (unresolvable.length > 0) {
            run('git', ['merge', '--abort']);
            throw new Error(`merging ${remote}/next conflicts outside ${LOCKFILE}: ${unresolvable.join(', ')}. Aborted; resolve by hand. ${mergeError.message}`);
        }
        if (conflicted.length === 0) throw mergeError;
        run('git', ['checkout', '--ours', '--', LOCKFILE]);
        run('git', ['add', LOCKFILE]);
        run('git', ['commit', '--no-edit']);
        // The lockfile is derived, so regenerate it from the merged manifests rather than
        // trust whichever side won. pnpm leaves the file alone when it already satisfies
        // them, in which case there is nothing to commit.
        run('pnpm', ['install', '--no-frozen-lockfile'], { stdio: 'inherit' });
        if (run('git', ['status', '--porcelain', '--', LOCKFILE]) !== '') {
            run('git', ['add', LOCKFILE]);
            run('git', ['commit', '-m', `chore: lockfile after merging ${remote}/next [skip ci]`]);
        }
    }
}

/** Expose the derived names to later workflow steps via $GITHUB_OUTPUT when present. */
function emitOutputs(cut) {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) return;
    const lines = Object.entries(cut).map(([k, v]) => `${k.toUpperCase()}=${v}`);
    fs.appendFileSync(out, lines.join('\n') + '\n');
}

const COMMANDS = { preflight, version, reenter, 'push-next': pushNext };

function main(argv) {
    const args = parseCliArgs(argv);
    const fn = COMMANDS[args.command];
    if (!fn) throw new Error(`usage: candidate-cut.mjs <${Object.keys(COMMANDS).join('|')}> --line X.Y [--remote origin]`);
    fn(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error(`FAIL ${e.message}`);
        process.exit(1);
    }
}
