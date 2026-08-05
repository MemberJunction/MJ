/**
 * The post-publish `main` -> `next` back-merge, as logic.
 *
 * Split out from merge_main_and_update_lock.mjs deliberately: everything here takes its
 * git client as a parameter and imports nothing outside Node's stdlib, so ci-scripts.yml
 * can run the tests with no `pnpm install` at all. The entry points keep the `simple-git`
 * dependency; the rules live here.
 *
 * All of it runs AFTER packages are published to npm and the tag is pushed, which shapes
 * every failure path below: nothing may push a tree it cannot vouch for, and nothing may
 * fail the job over a problem that leaves `next` intact.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

export const LOCKFILE = 'pnpm-lock.yaml';

/**
 * Paths a conflicted back-merge may resolve without a human.
 *
 * The lockfile qualifies because it is *derived* — regenerated from the package.json files
 * that merged cleanly — so discarding both conflicting sides loses no information. Nothing
 * else belongs in this set: for a hand-authored file, picking a side by rule is
 * indistinguishable from deleting whichever side lost.
 */
const REGENERABLE_ON_CONFLICT = new Set([LOCKFILE]);

/**
 * Split a merge's conflicted paths into "we can regenerate it" and "a human must look".
 *
 * @param {string[]} conflictedPaths
 * @returns {{unresolvable: string[], lockfileConflicted: boolean}}
 */
export function classifyMergeConflicts(conflictedPaths = []) {
    return {
        unresolvable: conflictedPaths.filter((p) => !REGENERABLE_ON_CONFLICT.has(p)),
        lockfileConflicted: conflictedPaths.includes(LOCKFILE),
    };
}

/**
 * Merge origin/main into next.
 *
 * Deliberately NOT `-X theirs`, which is what this used to do. Under a frozen next, main's
 * source and next's were identical so the strategy never actually fired. Now that
 * release-edge.yml can pin a release to a commit, next legitimately runs ahead of what
 * shipped — and `-X theirs` would resolve every conflicting hunk in main's favour,
 * silently discarding whatever landed after the pin. The lockfile is the one exception,
 * and it gets regenerated rather than guessed at.
 *
 * @param {import('simple-git').SimpleGit} client
 * @returns {Promise<{lockfileConflicted: boolean}>} whether the caller must regenerate the
 *   lockfile before pushing.
 * @throws when anything else conflicts, or when the merge fails for a non-conflict reason.
 *   The working tree is left clean (the merge is aborted) and next is untouched.
 */
export async function mergeMainIntoNext(client) {
    const branch = (await client.revparse(['--abbrev-ref', 'HEAD'])).trim();
    if (branch !== 'next') {
        throw new Error(`the main -> next back-merge must run on next, but HEAD is '${branch}'.`);
    }

    await client.fetch('origin', 'main');
    try {
        await client.merge(['--no-edit', 'origin/main']);
        return { lockfileConflicted: false };
    } catch (mergeError) {
        const status = await client.status();
        const conflicted = status.conflicted ?? [];

        if (conflicted.length === 0) {
            throw new Error(
                `main -> next merge failed with no conflicts to resolve, so there is nothing to ` +
                    `fix up automatically. next is unchanged. Original error: ${mergeError.message}`
            );
        }

        const { unresolvable, lockfileConflicted } = classifyMergeConflicts(conflicted);
        if (unresolvable.length > 0) {
            await client.merge(['--abort']);
            throw new Error(
                `main -> next back-merge conflicts outside ${LOCKFILE}: ${unresolvable.join(', ')}. ` +
                    `The merge was aborted and next is unchanged on the remote. The release itself is ` +
                    `already published — only the back-merge is outstanding, so resolve it by hand: ` +
                    `git checkout next && git merge origin/main. Original error: ${mergeError.message}`
            );
        }

        // Take next's copy purely as a placeholder to complete the merge commit; the caller
        // must regenerate it before pushing. `--ours` rather than `--theirs` so that if
        // anything downstream goes wrong, the failure mode is a stale lockfile on a tree that
        // never gets pushed, not a lockfile missing post-pin dependencies.
        //
        // `unresolvable` is empty here, so conflicted ⊆ REGENERABLE_ON_CONFLICT — this loop is
        // bounded by that set's size.
        for (const path of conflicted) {
            await client.raw(['checkout', '--ours', '--', path]);
            await client.add(path);
        }
        await client.raw(['commit', '--no-edit']);
        return { lockfileConflicted };
    }
}

/** Rewrite the lockfile from the merged manifests. Side effect: runs pnpm. */
const defaultInstall = () => execSync('pnpm install --lockfile-only', { stdio: 'inherit' });

/**
 * Regenerate {@link LOCKFILE} from the merged package.json files and commit it if it moved.
 *
 * @param {import('simple-git').SimpleGit} client
 * @param {{required: boolean, runInstall?: () => void}} opts — `required` is set when the
 *   merge resolved a lockfile conflict. The committed lockfile is then a placeholder that
 *   neither side of the merge vouches for, so a failed regeneration MUST fail the job
 *   rather than push a wrong lockfile. When it is false the refresh is best-effort: an
 *   already-published release must not be failed by a lockfile hiccup.
 * @returns {Promise<boolean>} whether a lockfile commit was created.
 */
export async function refreshLockfile(client, { required, runInstall = defaultInstall }) {
    console.log(`\nUpdating ${LOCKFILE} with new package versions...`);
    try {
        // --lockfile-only resolves and rewrites the lockfile without materializing
        // node_modules — the pnpm equivalent of `npm install --package-lock-only`.
        runInstall();
    } catch (error) {
        if (required) {
            throw new Error(
                `${LOCKFILE} could not be regenerated after a merge conflict, so the tree still holds ` +
                    `the placeholder copy taken from next. Refusing to push it. next is unchanged on the ` +
                    `remote and the release is already published; resolve by hand with ` +
                    `git checkout next && git merge origin/main && pnpm install --lockfile-only. ` +
                    `Original error: ${error.message}`
            );
        }
        console.error(`Error updating ${LOCKFILE}:`, error);
        console.log(
            `Continuing despite the ${LOCKFILE} update error — the merge itself resolved cleanly, ` +
                `so the back-merge is still safe to push.`
        );
        return false;
    }

    const status = await client.status();
    const lockFileModified =
        status.modified.includes(LOCKFILE) || status.not_added.includes(LOCKFILE);
    if (!lockFileModified) {
        console.log(`No changes to ${LOCKFILE} needed`);
        return false;
    }

    const { version } = JSON.parse(fs.readFileSync('packages/MJCore/package.json', 'utf8'));
    await client.add(LOCKFILE);
    await client.commit(
        `chore: Update ${LOCKFILE} with v${version} dependencies\n\n` +
            `Updates @memberjunction/* package versions in lock file after publishing v${version}`
    );
    console.log(`Committed ${LOCKFILE} updates`);
    return true;
}
