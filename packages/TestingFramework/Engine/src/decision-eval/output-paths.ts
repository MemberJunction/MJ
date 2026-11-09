/**
 * @fileoverview Keeps generated Decision Eval files out of the repository.
 *
 * Everything the suite generator and the scorecard write is derived from the measurement corpus:
 * the test records carry its points verbatim. The corpus must never be committed, so the rigs
 * refuse outright to write inside a git working tree. The check resolves symlinks first, so a
 * link from outside that points into the repository is refused too.
 *
 * Outside a repository nothing can recover a deleted file, so a rig that regenerates its output
 * ({@link WriteGeneratedFiles}) writes only into a new or empty directory, or, when allowed to
 * replace an earlier run, removes only the files that run listed in its manifest.
 *
 * @module @memberjunction/testing-engine
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, isAbsolute, normalize, sep } from 'node:path';
import { z } from 'zod';

/** An output directory that resolves inside a git working tree. */
export class OutputInsideRepoError extends Error {
    /**
     * @param OutputPath The output directory, resolved.
     * @param RepoRoot The working tree it falls inside.
     */
    constructor(public readonly OutputPath: string, public readonly RepoRoot: string) {
        super(`Refusing to write to ${OutputPath}: it is inside the git repository at ${RepoRoot}. `
            + 'Decision Eval output is derived from the corpus, which must never enter a repository. '
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

/** The manifest a generating rig leaves in its output directory: the files it wrote there. */
export const GENERATED_FILES_MANIFEST = 'generated-files.json';

/** The shape of {@link GENERATED_FILES_MANIFEST}. */
const GeneratedFilesManifestSchema = z.object({
    generator: z.string(),
    files: z.array(z.string())
});

/** One file a rig generates: where it goes, relative to the output directory, and its content. */
export interface GeneratedFile {
    /** A relative path inside the output directory, with no `..` segment. */
    RelativePath: string;
    Content: string;
}

/** How {@link WriteGeneratedFiles} treats a directory that already holds files. */
export interface WriteGeneratedFilesOptions {
    /** Which rig writes. It is recorded in the manifest, and only a manifest it wrote is trusted. */
    Generator: string;
    /**
     * Allow a directory that is not empty. The files the previous run's manifest lists are removed
     * and replaced; everything else is kept, and a file that would be overwritten but is not in that
     * manifest stops the run before anything changes.
     */
    Replace: boolean;
}

/** What {@link WriteGeneratedFiles} did. */
export interface WriteGeneratedFilesResult {
    /** Files written, the manifest not counted. */
    Written: number;
    /** Files of the previous run that this run no longer writes, removed. */
    Removed: number;
    /** Files in the directory this rig did not write, left as they were, relative to it. */
    Kept: string[];
}

/** A generated-output directory that holds files and may not be replaced. */
export class OutputNotEmptyError extends Error {
    /**
     * @param OutputPath The output directory, resolved.
     */
    constructor(public readonly OutputPath: string) {
        super(`Refusing to write to ${OutputPath}: it is not empty. Choose a new or empty directory, `
            + 'or allow replacing an earlier run of this rig there (--force). Replacing removes only the files '
            + `that run listed in its ${GENERATED_FILES_MANIFEST}; nothing else is removed or overwritten.`);
        this.name = 'OutputNotEmptyError';
    }
}

/** A generated file that would overwrite a file this rig did not write, or land outside the directory. */
export class OutputCollisionError extends Error {
    /**
     * @param OutputPath The output directory, resolved.
     * @param Collisions The files, relative to it.
     */
    constructor(public readonly OutputPath: string, public readonly Collisions: readonly string[]) {
        super(`Refusing to write to ${OutputPath}: ${Collisions.length} file(s) there were not written by this rig, `
            + `or resolve outside it (${Collisions.slice(0, 5).join(', ')}${Collisions.length > 5 ? ', …' : ''}). `
            + 'Nothing was changed. Choose a new or empty directory.');
        this.name = 'OutputCollisionError';
    }
}

/**
 * Writes a rig's generated files into `outDir` without ever removing or overwriting a file the
 * rig did not write, and records them in {@link GENERATED_FILES_MANIFEST}.
 *
 * - A missing or empty directory is created and written into.
 * - A directory that holds anything is refused ({@link OutputNotEmptyError}) unless
 *   `options.Replace` is set. Then the files the previous run's manifest lists (when the same
 *   generator wrote it) are removed, with any directory they leave empty, and the new files are
 *   written. Every other file is kept.
 * - A new file whose path is taken by a file that manifest doesn't list, or whose directory
 *   resolves outside `outDir` through a symlink, stops the run ({@link OutputCollisionError})
 *   before anything is removed or written.
 *
 * @param outDir The output directory, resolved (see {@link AssertOutputOutsideRepo}).
 * @param files The files to write.
 * @param options Who writes, and whether an earlier run may be replaced.
 */
export function WriteGeneratedFiles(
    outDir: string,
    files: readonly GeneratedFile[],
    options: WriteGeneratedFilesOptions
): WriteGeneratedFilesResult {
    const planned = files.map(f => checkedRelativePath(f.RelativePath));
    if (planned.includes(GENERATED_FILES_MANIFEST)) {
        throw new Error(`A generated file may not be named ${GENERATED_FILES_MANIFEST}: the manifest is written separately`);
    }
    const existing = new Set(existsSync(outDir) ? listFiles(outDir) : []);
    if (existing.size > 0 && !options.Replace) {
        throw new OutputNotEmptyError(outDir);
    }
    const manifest = readManifest(outDir);
    const previous = new Set(manifest?.generator === options.Generator ? [...manifest.files, GENERATED_FILES_MANIFEST] : []);
    const refused = [...planned, GENERATED_FILES_MANIFEST]
        .filter(path => (existing.has(path) && !previous.has(path)) || !IsPathInside(dirname(join(outDir, path)), outDir));
    if (refused.length > 0) {
        throw new OutputCollisionError(outDir, refused);
    }
    // Every file of the previous run goes first, the ones about to be rewritten too, so a write
    // never follows a symlink someone left in place of a generated file.
    const removed = [...previous].filter(path => removeGeneratedFile(outDir, path))
        .filter(path => !planned.includes(path) && path !== GENERATED_FILES_MANIFEST).length;
    files.forEach((file, i) => writeInside(outDir, planned[i], file.Content));
    const record: z.infer<typeof GeneratedFilesManifestSchema> = { generator: options.Generator, files: [...planned].sort() };
    writeInside(outDir, GENERATED_FILES_MANIFEST, `${JSON.stringify(record, null, 2)}\n`);
    const written = new Set([...planned, GENERATED_FILES_MANIFEST]);
    return { Written: planned.length, Removed: removed, Kept: listFiles(outDir).filter(path => !written.has(path)) };
}

/** A relative path, normalized with `/` separators, or an error when it is absolute or climbs out with `..`. */
function checkedRelativePath(path: string): string {
    const normalized = normalize(path).split(sep).join('/');
    if (!normalized || normalized === '.' || isAbsolute(path) || normalized.split('/').includes('..')) {
        throw new Error(`A generated file's path must be relative and stay inside the output directory, got '${path}'`);
    }
    return normalized;
}

/** Every file (and symlink) under a directory, relative to it with `/` separators. Symlinks are not followed. */
function listFiles(dir: string, prefix: string = ''): string[] {
    return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory() ? listFiles(dir, path) : [path];
    });
}

/**
 * The manifest in `outDir`, with every listed path checked to be a safe relative path (a tampered
 * entry is dropped, never followed), or null when there is none or it can't be read.
 */
function readManifest(outDir: string): z.infer<typeof GeneratedFilesManifestSchema> | null {
    const path = join(outDir, GENERATED_FILES_MANIFEST);
    if (!existsSync(path)) {
        return null;
    }
    let parsed: ReturnType<typeof GeneratedFilesManifestSchema.safeParse>;
    try {
        parsed = GeneratedFilesManifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
        return null;
    }
    if (!parsed.success) {
        return null;
    }
    const files = parsed.data.files.flatMap(file => {
        try {
            return [checkedRelativePath(file)];
        } catch {
            return [];
        }
    });
    return { generator: parsed.data.generator, files: files.filter(file => file !== GENERATED_FILES_MANIFEST) };
}

/**
 * Removes one previously generated file when it is a file or symlink whose directory resolves
 * inside `outDir`, then any directory it leaves empty, up to `outDir`. Returns whether it did.
 */
function removeGeneratedFile(outDir: string, path: string): boolean {
    const full = join(outDir, path);
    const stat = lstatIfPresent(full);
    if (!stat || stat.isDirectory() || !IsPathInside(dirname(full), outDir)) {
        return false;
    }
    unlinkSync(full);
    for (let dir = dirname(full); dir !== outDir && IsPathInside(dir, outDir); dir = dirname(dir)) {
        if (readdirSync(dir).length > 0) {
            break;
        }
        rmdirSync(dir);
    }
    return true;
}

/** The path's own status (a symlink is not followed), or null when nothing is there. */
function lstatIfPresent(path: string): ReturnType<typeof lstatSync> | null {
    try {
        return lstatSync(path);
    } catch {
        return null;
    }
}

/** Writes one file under `outDir`, creating its directories. The caller has checked it stays inside. */
function writeInside(outDir: string, path: string, content: string): void {
    const full = join(outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
}
