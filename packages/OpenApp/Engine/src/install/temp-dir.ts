import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Creates a fresh, private temp directory for an app's downloaded migration or teardown scripts.
 *
 * `mkdtempSync` appends a random suffix and creates the directory atomically with mode 0700, failing
 * rather than reusing a path that already exists. A predictable name created with
 * `mkdirSync({ recursive: true })` silently accepts a directory (or symlink) another local user
 * created first, and the SQL written into it is then run against the database.
 *
 * @param appName - The app's manifest name, kept in the prefix so the directory is recognizable.
 * @param purpose - Optional label for the download (e.g. `teardown`), also kept in the prefix.
 * @returns The absolute path of the new directory.
 */
export function CreateAppTempDir(appName: string, purpose?: string): string {
    const label = purpose ? `${appName}-${purpose}` : appName;
    return mkdtempSync(join(tmpdir(), `mj-app-${label}-`));
}
