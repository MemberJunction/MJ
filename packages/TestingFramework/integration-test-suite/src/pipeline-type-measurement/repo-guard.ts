/**
 * repo-guard.ts — refuses an output directory inside a git working tree.
 *
 * The report holds prompt-run IDs and measured numbers from a live database. That belongs outside any
 * repository, where it cannot be committed by accident. `@memberjunction/testing-engine` has no such
 * check on this branch, so this is the same idea kept small: walk up from the directory (or its
 * nearest existing ancestor, with symlinks resolved) and refuse if any level has a `.git` entry. A
 * `.git` file counts too, because that is what a linked worktree has.
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The root of the git working tree containing `path`, or null when it is in none. */
export function FindRepoRoot(path: string): string | null {
    let dir = nearestExistingRealPath(resolve(path));
    for (;;) {
        if (existsSync(join(dir, '.git'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

/**
 * Returns `outDir` resolved to an absolute path.
 * @throws Error when it is inside a git working tree.
 */
export function AssertOutputOutsideRepo(outDir: string): string {
    const absolute = resolve(outDir);
    const root = FindRepoRoot(absolute);
    if (root !== null) {
        throw new Error(`--out '${absolute}' is inside the git working tree at '${root}'. Write the report outside any repository.`);
    }
    return absolute;
}

/** The real path of `path`, or of its nearest ancestor that exists (the output directory may not yet). */
function nearestExistingRealPath(path: string): string {
    let current = path;
    while (!existsSync(current)) {
        const parent = dirname(current);
        if (parent === current) {
            return current;
        }
        current = parent;
    }
    return realpathSync(current);
}
