/**
 * Fallback for a post-publish `main` -> `next` back-merge that could not be pushed.
 *
 * WHY THIS EXISTS
 * ---------------
 * publish.yml's back-merge step is the LAST thing a release does, and it runs after the
 * packages are already on npm. When it fails, the repo is left "published, not merged":
 * recoverable, but only by someone reconstructing the release commits by hand. That has
 * now happened twice — MJ#3658 (edge.1), MJ#3752 (edge.2) — and a third time at
 * v6.1.0-edge.6 (MJ#4382), which is what prompted this.
 *
 * Two distinct things make the push fail, and a PR is the answer to both:
 *
 *   1. A CONFLICT. ci/back-merge.mjs refuses to guess at anything but the lockfile (see
 *      the note there on why `-X theirs` was removed), so a real conflict aborts the merge
 *      and leaves `next` untouched. No amount of credential fixing helps: a human has to
 *      resolve it, and a PR is where they do that.
 *   2. A REJECTED PUSH. `next` is protected; the release identity must hold a ruleset
 *      bypass. That is fixed for now, but a bypass is configuration living outside this
 *      repo — it can be revoked, expire with a credential, or be dropped in a future
 *      ruleset edit, exactly as it was on 2026-09-03. This path is what turns that from a
 *      manual salvage into a link.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not resolve the conflict, and it does not make the release "done". The back-merge
 * is still outstanding until a human merges the PR — so the caller is expected to fail the
 * job after this runs. The value is that the recovery is a review instead of an
 * archaeology exercise: the branch is main's actual tip, pushed by the workflow's own
 * tooling, rather than commits reassembled by hand.
 *
 * Idempotent. Re-running a partially-completed publish reuses the branch and the open PR
 * rather than stacking duplicates.
 *
 * Usage:
 *   node ci/backmerge-fallback.mjs --version v6.1.0-edge.6 [--remote next-push] [--base next]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Branch name carrying the back-merge.
 *
 * Version-stamped, not timestamped: re-running the same failed publish must land on the
 * same branch so the run is idempotent. Exactly one leading `v` regardless of how the
 * caller spells the version — publish.yml has both forms in flight (`$VERSION` is
 * `v`-prefixed, `${VERSION#v}` is not) and a branch pair differing only by a `v` would
 * defeat the idempotency this exists for.
 *
 * @param {string} version
 * @returns {string}
 */
export function backmergeBranchName(version) {
    const v = String(version ?? '').trim();
    if (v === '') throw new Error('a version is required to name the back-merge branch');
    return `chore/backmerge-v${v.replace(/^v+/, '')}`;
}

/**
 * Decide what still needs doing, given what already exists on the remote.
 *
 * Split out from the IO so the idempotency rules are testable without a network: the
 * interesting cases are all "a previous run got part way".
 *
 * @param {{branchExists: boolean, openPrUrl: string|null}} state
 * @returns {{pushBranch: boolean, createPr: boolean, note: string}}
 */
export function planFallback({ branchExists, openPrUrl }) {
    if (openPrUrl) {
        // The PR is the deliverable. If one is already open, the branch behind it is
        // whatever a human has been working on — re-pushing main's tip over it could
        // discard conflict resolutions already committed there.
        return { pushBranch: false, createPr: false, note: `back-merge PR already open: ${openPrUrl}` };
    }
    if (branchExists) {
        return { pushBranch: false, createPr: true, note: 'branch already pushed by an earlier run; opening the PR' };
    }
    return { pushBranch: true, createPr: true, note: 'creating the back-merge branch and PR' };
}

/** Body for the PR. Kept out of main() so a test can read it without running anything. */
export function prBody({ version, branch, base, reason }) {
    return [
        `Automated fallback: publish.yml could not complete the post-publish \`main\` -> \`${base}\` back-merge for **${version}**.`,
        '',
        '```',
        (reason || 'no failure detail was captured').trim(),
        '```',
        '',
        `\`${branch}\` is \`main\`'s current tip, pushed by the workflow — not commits reassembled by hand.`,
        '',
        '**The release itself is fine.** Packages are on npm and the tag is pushed; only the back-merge is outstanding.',
        'Verify against the registry rather than the run\'s exit code, then resolve any conflicts here and merge.',
        '',
        'The publish run is deliberately red while this is open — that is the signal the back-merge has not landed.',
    ].join('\n');
}

/** @returns {string} stdout, trimmed */
const defaultRun = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim();

export async function main(argv, { run = defaultRun, env = process.env, log = console.log } = {}) {
    const args = { remote: 'origin', base: 'next', version: undefined, reason: '' };
    // Pin gh to the repository explicitly. `origin` carries an embedded credential in CI,
    // and letting gh infer the repo from a remote URL it has to parse is an avoidable
    // dependency at the exact moment things are already going wrong.
    const repoArgs = (env.GITHUB_REPOSITORY ?? '') !== '' ? ['--repo', env.GITHUB_REPOSITORY] : [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--version') args.version = argv[++i];
        else if (argv[i] === '--remote') args.remote = argv[++i];
        else if (argv[i] === '--base') args.base = argv[++i];
        else if (argv[i] === '--reason') args.reason = argv[++i];
    }
    if (!args.version) throw new Error('usage: backmerge-fallback.mjs --version <vX.Y.Z> [--remote r] [--base b] [--reason text]');

    const branch = backmergeBranchName(args.version);

    // Read main from `origin`: the push remote exists only to satisfy the protection on
    // `next` and is not guaranteed to have been fetched.
    run('git', ['fetch', '--no-tags', 'origin', 'main']);
    const mainSha = run('git', ['rev-parse', 'FETCH_HEAD']);

    let branchExists = true;
    try {
        run('git', ['ls-remote', '--exit-code', args.remote, `refs/heads/${branch}`]);
    } catch {
        branchExists = false;
    }

    let openPrUrl = null;
    const found = run('gh', ['pr', 'list', ...repoArgs, '--head', branch, '--base', args.base, '--state', 'open', '--json', 'url', '--jq', '.[0].url // ""']);
    if (found) openPrUrl = found;

    const plan = planFallback({ branchExists, openPrUrl });
    log(`::notice::${plan.note}`);

    if (plan.pushBranch) {
        // Push main's tip straight to the new ref — no checkout, so the job's working tree
        // (which still holds the aborted merge's aftermath) is irrelevant here.
        run('git', ['push', args.remote, `${mainSha}:refs/heads/${branch}`]);
        log(`pushed ${branch} at ${mainSha}`);
    }

    if (plan.createPr) {
        const bodyFile = `${env.RUNNER_TEMP || '/tmp'}/backmerge-fallback-body.md`;
        fs.writeFileSync(bodyFile, prBody({ version: args.version, branch, base: args.base, reason: args.reason }));
        openPrUrl = run('gh', ['pr', 'create', ...repoArgs, '--base', args.base, '--head', branch,
            '--title', `chore: back-merge main into ${args.base} after ${args.version}`,
            '--body-file', bodyFile]);
    }

    log(`::notice::back-merge PR: ${openPrUrl}`);
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `pr_url=${openPrUrl}\n`);
    if (env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(env.GITHUB_STEP_SUMMARY,
            `### Back-merge could not be pushed\n\nOpened ${openPrUrl} carrying \`main\` at \`${mainSha.slice(0, 10)}\`.\n`);
    }
    return openPrUrl;
}

// Entry point only when executed directly, so the tests can import this file.
if (process.argv[1] && process.argv[1].endsWith('backmerge-fallback.mjs')) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(`FAIL ${err.message}`);
        process.exit(1);
    });
}
