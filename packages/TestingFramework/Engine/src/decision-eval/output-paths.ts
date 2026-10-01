/**
 * @fileoverview Keeps a measurement rig's output out of the repository.
 *
 * What a measurement rig writes is derived from its labelled corpus: the reports quote its points.
 * The corpus must never be committed, so the rigs refuse outright to write inside a git working
 * tree. The check resolves symlinks first, so a link from outside that points into the repository
 * is refused too.
 *
 * @module @memberjunction/testing-engine
 */

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path';

/** An output directory that resolves inside a git working tree. */
export class OutputInsideRepoError extends Error {
    /**
     * @param OutputPath The output directory, resolved.
     * @param RepoRoot The working tree it falls inside.
     */
    constructor(public readonly OutputPath: string, public readonly RepoRoot: string) {
        super(`Refusing to write to ${OutputPath}: it is inside the git repository at ${RepoRoot}. `
            + 'Measurement output is derived from the corpus, which must never enter a repository. '
            + 'Choose a directory outside any repository.');
        this.name = 'OutputInsideRepoError';
    }
}

/**
 * The nearest directory at or above `startPath` that holds a `.git` entry (a directory in a normal
 * clone, a file in a worktree), or null when there is none. Symlinks are resolved first.
 *
 * @param startPath A file or directory; it need not exist yet.
 */
export function FindRepoRoot(startPath: string): string | null {
    let current = ResolveRealPath(startPath);
    for (;;) {
        if (existsSync(join(current, '.git'))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

/**
 * True when `childPath` is `parentPath` or lies under it, after both are resolved.
 *
 * @param childPath The path to test.
 * @param parentPath The directory it may lie under.
 */
export function IsPathInside(childPath: string, parentPath: string): boolean {
    const fromParent = relative(ResolveRealPath(parentPath), ResolveRealPath(childPath));
    return fromParent === '' || (!fromParent.startsWith('..') && !isAbsolute(fromParent));
}

/**
 * Resolves an output directory and throws an {@link OutputInsideRepoError} when it is inside a git
 * working tree: the one found by walking up from the directory itself, or any of `repoRoots`
 * (the rig's own repository, for example). Returns the resolved directory.
 *
 * @param outputPath The output directory, as given; it need not exist yet.
 * @param repoRoots Repositories the directory must also stay out of.
 */
export function AssertOutputOutsideRepo(outputPath: string, repoRoots: readonly string[] = []): string {
    const resolved = ResolveRealPath(outputPath);
    const enclosing = FindRepoRoot(resolved);
    if (enclosing) {
        throw new OutputInsideRepoError(resolved, enclosing);
    }
    const listed = repoRoots.find(root => IsPathInside(resolved, root));
    if (listed) {
        throw new OutputInsideRepoError(resolved, ResolveRealPath(listed));
    }
    return resolved;
}

/**
 * The absolute path with every symlink in its existing part resolved; the part that doesn't exist
 * yet is appended unchanged.
 *
 * @param path Any path.
 */
export function ResolveRealPath(path: string): string {
    const absolute = resolve(path);
    const missing: string[] = [];
    let existing = absolute;
    while (!existsSync(existing)) {
        const parent = dirname(existing);
        if (parent === existing) {
            return absolute;
        }
        missing.unshift(basename(existing));
        existing = parent;
    }
    return join(realpathSync(existing), ...missing);
}
