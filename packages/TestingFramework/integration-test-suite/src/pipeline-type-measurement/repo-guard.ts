/**
 * repo-guard.ts — checks the output directory before a run spends anything: it must be outside every
 * git working tree, and a directory the rig can write to.
 *
 * The report holds prompt-run IDs and measured numbers from a live database. That belongs outside any
 * repository, where it cannot be committed by accident. `@memberjunction/testing-engine` has no such
 * check on this branch, so this is the same idea kept small: walk up from the directory (or its
 * nearest existing ancestor, with symlinks resolved) and refuse if any level has a `.git` entry. A
 * `.git` file counts too, because that is what a linked worktree has.
 *
 * The report is written only once every batch and the cost wait have finished, so an `--out` that is a
 * file, or a directory the rig cannot write, would otherwise surface only after the whole paid run.
 * {@link PrepareOutputDirectory} creates the directory and writes a probe file first.
 */
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

/** The probe file {@link PrepareOutputDirectory} writes and removes. */
const WRITE_PROBE_FILE = '.pipeline-measure-write-check';

/**
 * Creates the output directory (and its parents) and checks a file can be written in it, removing the
 * probe afterwards.
 * @throws Error naming the directory when it is a file, or cannot be created or written.
 */
export function PrepareOutputDirectory(outDir: string): void {
    const probe = join(outDir, WRITE_PROBE_FILE);
    try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(probe, '', 'utf8');
        rmSync(probe, { force: true });
    } catch (e) {
        throw new Error(`--out '${outDir}' cannot be written: ${e instanceof Error ? e.message : String(e)}. Choose a directory the rig can create and write.`);
    }
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
