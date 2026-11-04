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
 * Git remote to PUSH `next` through.
 *
 * `next` is protected by ruleset `next-protect`, whose bypass list accepts only roles,
 * teams and GitHub Apps — never an individual user. The release PAT's account
 * (`MJ-GH-bot`) is an outside collaborator, so it cannot be granted a bypass at all, and
 * as of 2026-09-03 it no longer has one: every push to `next` from publish.yml was
 * rejected with GH013 until the `blue-cypress-ci-bot` App was added as a bypass actor.
 *
 * The workflow therefore adds a second remote authenticated as that App and points this
 * at it. Reads still go through `origin` on the PAT — only the write to `next` moves, so
 * pushes to `main` and `lts/**` and every `gh` call are untouched.
 *
 * Defaults to `origin` so a developer running `pnpm run mergemain` by hand behaves exactly
 * as before (and succeeds if they are in `break-glass`).
 *
 * @returns {string} remote name
 */
export function nextPushRemote() {
    const remote = (process.env.MJ_NEXT_PUSH_REMOTE ?? '').trim();
    return remote === '' ? 'origin' : remote;
}

/**
 * Paths a conflicted back-merge may resolve without a human, whatever their content.
 *
 * The lockfile qualifies because it is *derived* — regenerated from the package.json files
 * that merged cleanly — so discarding both conflicting sides loses no information. Nothing
 * else belongs in this set: for a hand-authored file, picking a side by rule is
 * indistinguishable from deleting whichever side lost. (A package.json can still be
 * resolved, but only after its content proves main's side is derived — see
 * {@link analyzeManifestConflict}.)
 */
const REGENERABLE_ON_CONFLICT = new Set([LOCKFILE]);

/** package.json sections whose `@memberjunction/*` entries `changeset version` rewrites. */
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const INTERNAL_SCOPE = '@memberjunction/';

/**
 * @param {string} path
 * @returns {boolean} whether the path is a package manifest
 */
export function isManifestPath(path) {
    return path === 'package.json' || path.endsWith('/package.json');
}

/**
 * Split a merge's conflicted paths into "we can regenerate it", "a manifest that may be
 * resolvable if main's side is only a version bump", and "a human must look".
 *
 * @param {string[]} conflictedPaths
 * @returns {{unresolvable: string[], manifests: string[], lockfileConflicted: boolean}}
 */
export function classifyMergeConflicts(conflictedPaths = []) {
    const remaining = conflictedPaths.filter((p) => !REGENERABLE_ON_CONFLICT.has(p));
    return {
        unresolvable: remaining.filter((p) => !isManifestPath(p)),
        manifests: remaining.filter(isManifestPath),
        lockfileConflicted: conflictedPaths.includes(LOCKFILE),
    };
}

/**
 * Every version string `changeset version` may rewrite in a manifest: the package's own
 * `version`, and each `@memberjunction/*` dependency, keyed so two manifests can be
 * compared entry by entry.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {Map<string, string>} e.g. `version` -> `6.1.0`, `dependencies:@memberjunction/core` -> `6.1.0`
 */
function versionEntries(manifest) {
    const entries = new Map();
    if (typeof manifest.version === 'string') entries.set('version', manifest.version);
    for (const section of DEPENDENCY_SECTIONS) {
        const deps = manifest[section];
        if (deps === null || typeof deps !== 'object') continue;
        for (const [name, value] of Object.entries(deps)) {
            if (name.startsWith(INTERNAL_SCOPE) && typeof value === 'string') {
                entries.set(`${section}:${name}`, value);
            }
        }
    }
    return entries;
}

/**
 * Set every entry named in `versions` on a copy of `manifest`. Entries the manifest does
 * not have are skipped, so keys and key order are never changed.
 *
 * @param {Record<string, unknown>} manifest
 * @param {(key: string, current: string) => string} pick — the value to store for an entry
 * @returns {Record<string, unknown>}
 */
function mapVersionEntries(manifest, pick) {
    const copy = structuredClone(manifest);
    if (typeof copy.version === 'string') copy.version = pick('version', copy.version);
    for (const section of DEPENDENCY_SECTIONS) {
        const deps = copy[section];
        if (deps === null || typeof deps !== 'object') continue;
        for (const [name, value] of Object.entries(deps)) {
            if (name.startsWith(INTERNAL_SCOPE) && typeof value === 'string') {
                deps[name] = pick(`${section}:${name}`, value);
            }
        }
    }
    return copy;
}

/**
 * Decide whether a conflicted package.json can be resolved without a human, and if so,
 * how.
 *
 * It can when main's side differs from the merge base ONLY in version strings that
 * `changeset version` writes — the package's own `version` and `@memberjunction/*`
 * dependency versions — all moved to one release version. Main's side then carries no
 * information beyond "bump to X", so the resolution is next's file with every entry that
 * was at a pre-release version moved to X. Next's hand-authored changes all survive, and
 * main's side is regenerated rather than picked over.
 *
 * `@memberjunction/*` entries that main did not move (packages outside the release, such
 * as ones published from other repos) keep next's value.
 *
 * @param {{base: string, ours: string, theirs: string}} sides — the merge base, next's
 *   side and main's side, as file text
 * @returns {{resolvable: true, content: string, releaseVersion: string, oldVersions: string[]}
 *   | {resolvable: false, reason: string}}
 */
export function analyzeManifestConflict({ base, ours, theirs }) {
    let baseJson;
    let oursJson;
    let theirsJson;
    try {
        baseJson = JSON.parse(base);
        oursJson = JSON.parse(ours);
        theirsJson = JSON.parse(theirs);
    } catch (error) {
        return { resolvable: false, reason: `a side is not valid JSON (${error.message})` };
    }

    // What main changed, entry by entry. An entry main added or removed is not a bump.
    const baseVersions = versionEntries(baseJson);
    const theirVersions = versionEntries(theirsJson);
    const bumps = [];
    for (const [key, value] of theirVersions) {
        if (!baseVersions.has(key)) {
            return { resolvable: false, reason: `main added ${key}` };
        }
        if (baseVersions.get(key) !== value) bumps.push({ key, from: baseVersions.get(key), to: value });
    }
    for (const key of baseVersions.keys()) {
        if (!theirVersions.has(key)) return { resolvable: false, reason: `main removed ${key}` };
    }

    // Main's side with its version moves undone must be the merge base exactly — same
    // fields, same values, same key order. Anything else is a real change on main.
    const theirsUnbumped = mapVersionEntries(theirsJson, (key) => baseVersions.get(key));
    if (JSON.stringify(theirsUnbumped) !== JSON.stringify(baseJson)) {
        return { resolvable: false, reason: 'main changed more than version strings' };
    }
    if (bumps.length === 0) {
        return { resolvable: false, reason: 'main changed no version strings' };
    }

    const targets = new Set(bumps.map((b) => b.to));
    if (targets.size !== 1) {
        return {
            resolvable: false,
            reason: `main moved versions to more than one value (${[...targets].join(', ')})`,
        };
    }
    const [releaseVersion] = targets;
    const oldVersions = new Set(bumps.map((b) => b.from));

    const resolved = mapVersionEntries(oursJson, (_key, value) =>
        oldVersions.has(value) ? releaseVersion : value
    );

    const stale = findStaleVersions(resolved, oldVersions);
    if (stale.length > 0) {
        return { resolvable: false, reason: `still at a pre-release version: ${stale.join(', ')}` };
    }

    return {
        resolvable: true,
        content: serializeLike(ours, resolved, oldVersions, releaseVersion),
        releaseVersion,
        oldVersions: [...oldVersions],
    };
}

/**
 * Postcondition on a resolved manifest: name every version entry still at a pre-release
 * version. Non-empty means the resolution would leave a stale internal dependency on next
 * (for example one next added after the release was cut), so it must not be committed.
 *
 * @param {Record<string, unknown>} manifest
 * @param {Set<string>} oldVersions
 * @returns {string[]}
 */
export function findStaleVersions(manifest, oldVersions) {
    return [...versionEntries(manifest)]
        .filter(([, value]) => oldVersions.has(value))
        .map(([key, value]) => `${key}@${value}`);
}

/**
 * Write `resolved` as next's file text with only the moved version strings changed, so
 * next's layout (inline arrays, spacing) survives byte for byte. Falls back to
 * JSON.stringify with next's indent — the layout `changeset version` itself writes — when
 * the text edit does not parse back to exactly `resolved` (for example a nested `version`
 * key the pattern also matched).
 *
 * @param {string} oursText — next's file
 * @param {Record<string, unknown>} resolved
 * @param {Set<string>} oldVersions
 * @param {string} releaseVersion
 * @returns {string}
 */
function serializeLike(oursText, resolved, oldVersions, releaseVersion) {
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
    const olds = [...oldVersions].map(escape).join('|');
    const pattern = new RegExp(`("(?:version|${escape(INTERNAL_SCOPE)}[^"]+)"\\s*:\\s*")(${olds})(")`, 'g');
    const edited = oursText.replace(pattern, (_match, prefix, _old, suffix) => `${prefix}${releaseVersion}${suffix}`);
    try {
        if (JSON.stringify(JSON.parse(edited)) === JSON.stringify(resolved)) return edited;
    } catch {
        // fall through to a full rewrite
    }
    const indent = /^([ \t]+)"/m.exec(oursText)?.[1] ?? '  ';
    return JSON.stringify(resolved, null, indent) + (oursText.endsWith('\n') ? '\n' : '');
}

/**
 * Read the three sides of a conflicted path from the index (stage 1 = merge base,
 * 2 = ours/next, 3 = theirs/main).
 *
 * @param {import('simple-git').SimpleGit} client
 * @param {string} path
 * @returns {Promise<{base: string, ours: string, theirs: string} | null>} null when a side
 *   is missing (added or deleted on one side), which is never a plain version bump.
 */
async function readConflictSides(client, path) {
    try {
        const [base, ours, theirs] = await Promise.all(
            [1, 2, 3].map((stage) => client.raw(['show', `:${stage}:${path}`]))
        );
        if ([base, ours, theirs].some((side) => typeof side !== 'string')) return null;
        return { base, ours, theirs };
    } catch {
        return null;
    }
}

/**
 * Merge origin/main into next.
 *
 * Deliberately NOT `-X theirs`, which is what this used to do. That was survivable only
 * while `next` was assumed frozen for the release, because main's source and next's were
 * then identical and the strategy never actually fired. Releases ship from a `release/*`
 * prep branch cut at an earlier commit (DEPLOYMENT.md Step 9), so by the time this runs
 * `next` has hours of merges main has never seen — and `-X theirs` would resolve every
 * conflicting hunk in main's favour, silently discarding all of it. Two exceptions, both
 * regenerated rather than guessed at: the lockfile, and a package.json whose main side is
 * only the release's version bump (see {@link analyzeManifestConflict}). Every edit next
 * made between the release cut and the publish survives either way.
 *
 * @param {import('simple-git').SimpleGit} client
 * @param {{writeFile?: (path: string, content: string) => void}} [opts] — how a resolved
 *   manifest is written to the working tree (replaced in tests).
 * @returns {Promise<{lockfileConflicted: boolean, manifestsResolved: string[]}>}
 *   `lockfileConflicted` — the committed lockfile is a placeholder; `manifestsResolved` —
 *   package.json files rewritten to the release version. The caller must regenerate the
 *   lockfile before pushing when either is set.
 * @throws when anything else conflicts, or when the merge fails for a non-conflict reason.
 *   The working tree is left clean (the merge is aborted) and next is untouched.
 */
export async function mergeMainIntoNext(client, { writeFile = defaultWriteFile } = {}) {
    const branch = (await client.revparse(['--abbrev-ref', 'HEAD'])).trim();
    if (branch !== 'next') {
        throw new Error(`the main -> next back-merge must run on next, but HEAD is '${branch}'.`);
    }

    await client.fetch('origin', 'main');
    try {
        await client.merge(['--no-edit', 'origin/main']);
        return { lockfileConflicted: false, manifestsResolved: [] };
    } catch (mergeError) {
        const status = await client.status();
        const conflicted = status.conflicted ?? [];

        if (conflicted.length === 0) {
            throw new Error(
                `main -> next merge failed with no conflicts to resolve, so there is nothing to ` +
                    `fix up automatically. next is unchanged. Original error: ${mergeError.message}`
            );
        }

        const { unresolvable, manifests, lockfileConflicted } = classifyMergeConflicts(conflicted);

        // Decide every manifest before touching the tree, so a single real conflict aborts
        // the whole merge with nothing half-written.
        const resolutions = [];
        const reasons = [];
        for (const path of manifests) {
            const sides = await readConflictSides(client, path);
            const verdict = sides
                ? analyzeManifestConflict(sides)
                : { resolvable: false, reason: 'a side is missing (added or deleted)' };
            if (verdict.resolvable) {
                resolutions.push({ path, content: verdict.content, releaseVersion: verdict.releaseVersion });
            } else {
                unresolvable.push(path);
                reasons.push(`${path}: ${verdict.reason}`);
            }
        }

        if (unresolvable.length > 0) {
            await client.merge(['--abort']);
            const detail = reasons.length > 0 ? ` (${reasons.join('; ')})` : '';
            throw new Error(
                `main -> next back-merge conflicts that are not a lockfile or a version-only ` +
                    `package.json bump: ${unresolvable.join(', ')}${detail}. ` +
                    `The merge was aborted and next is unchanged on the remote. The release itself is ` +
                    `already published — only the back-merge is outstanding, so resolve it by hand: ` +
                    `git checkout next && git merge origin/main. Original error: ${mergeError.message}`
            );
        }

        for (const { path, content, releaseVersion } of resolutions) {
            console.log(`${path}: main's side is only the bump to ${releaseVersion}; keeping next's file at that version.`);
            writeFile(path, content);
            await client.add(path);
        }

        // Take next's copy purely as a placeholder to complete the merge commit; the caller
        // must regenerate it before pushing. `--ours` rather than `--theirs` so that if
        // anything downstream goes wrong, the failure mode is a stale lockfile on a tree that
        // never gets pushed, not a lockfile missing post-pin dependencies.
        if (lockfileConflicted) {
            await client.raw(['checkout', '--ours', '--', LOCKFILE]);
            await client.add(LOCKFILE);
        }
        await client.raw(['commit', '--no-edit']);
        return { lockfileConflicted, manifestsResolved: resolutions.map((r) => r.path) };
    }
}

/** Write a resolved manifest into the working tree. */
const defaultWriteFile = (path, content) => fs.writeFileSync(path, content);

/** Rewrite the lockfile from the merged manifests. Side effect: runs pnpm. */
const defaultInstall = () => execSync('pnpm install --lockfile-only', { stdio: 'inherit' });

/**
 * Regenerate {@link LOCKFILE} from the merged package.json files and commit it if it moved.
 *
 * @param {import('simple-git').SimpleGit} client
 * @param {{required: boolean, runInstall?: () => void}} opts — `required` is set when the
 *   merge resolved a lockfile or package.json conflict. The committed lockfile is then a placeholder that
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
