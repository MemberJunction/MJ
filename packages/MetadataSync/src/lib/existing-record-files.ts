/**
 * Finding the files that already represent a set of records, for pull.
 *
 * Pull needs this to update a record's file in place rather than writing a second copy,
 * and to read the `@file:` reference a field currently carries so externalization keeps
 * writing to the path already chosen there.
 *
 * A `filePattern` of `**\/.*.json` declares that records may live in subdirectories.
 * Two metadata roots in this repo rely on that — the regression suite keeps its tests in
 * `tests/regression/` and integration-test keeps its own in `tests/integration/` — so
 * discovery honors the prefix. Without it every record in a subdirectory looks new: pull
 * writes a hash-named duplicate beside the real file and the reference is lost.
 */
import fs from 'fs-extra';
import * as path from 'path';

/** Does `fileName` satisfy the (already `**\/`-stripped) pattern? */
function matchesPattern(fileName: string, pattern: string): boolean {
    if (pattern === '*.json') {
        // A record file, but not one of the dot-prefixed ones — those are a distinct convention.
        return fileName.endsWith('.json') && !fileName.startsWith('.');
    }
    if (pattern === '.*.json') {
        return fileName.startsWith('.') && fileName.endsWith('.json');
    }
    return pattern === fileName;
}

function isIgnored(relativeDir: string, ignoreDirectories: string[]): boolean {
    if (relativeDir === '') {
        return false;
    }
    const normalized = relativeDir.split(path.sep).join('/');
    return ignoreDirectories.some((raw) => {
        const pattern = raw.split(path.sep).join('/').replace(/^\/+|\/+$/g, '');
        return (
            pattern !== '' &&
            (normalized === pattern ||
                normalized.endsWith(`/${pattern}`) ||
                normalized.startsWith(`${pattern}/`))
        );
    });
}

/**
 * The record files under `dir` matching `filePattern`.
 *
 * Recurses only when the pattern carries the `**\/` prefix. Dot-directories are never
 * entered (`.backups` holds pre-update copies of the very files being matched, and would
 * otherwise return stale duplicates), and `ignoreDirectories` is honored so externalized
 * content — a replay script, a template — is never mistaken for a record.
 *
 * A missing directory yields an empty list: on a first pull the target may not exist yet.
 */
export async function FindExistingRecordFiles(
    dir: string,
    filePattern: string,
    ignoreDirectories: string[] = []
): Promise<string[]> {
    const recursive = filePattern.startsWith('**/');
    const pattern = recursive ? filePattern.substring(3) : filePattern;
    const found: string[] = [];

    async function walk(current: string, relativeDir: string): Promise<void> {
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return;
            }
            throw error;
        }

        for (const entry of entries) {
            if (entry.isFile()) {
                if (matchesPattern(entry.name, pattern)) {
                    found.push(path.join(current, entry.name));
                }
                continue;
            }
            if (!recursive || !entry.isDirectory() || entry.name.startsWith('.')) {
                continue;
            }
            const childRelative = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
            if (isIgnored(childRelative, ignoreDirectories)) {
                continue;
            }
            await walk(path.join(current, entry.name), childRelative);
        }
    }

    await walk(dir, '');
    return found;
}

/** @deprecated Use {@link FindExistingRecordFiles}. */
export async function findExistingRecordFiles(
    dir: string,
    filePattern: string,
    ignoreDirectories: string[] = []
): Promise<string[]> {
    return FindExistingRecordFiles(dir, filePattern, ignoreDirectories);
}
