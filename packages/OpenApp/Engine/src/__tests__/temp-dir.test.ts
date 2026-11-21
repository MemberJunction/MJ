/**
 * App migration and teardown SQL is downloaded into a temp directory and then run against the
 * database. The directory must be a fresh, private one: a predictable path created with
 * `recursive: true` silently reuses a directory another local user created first.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, rmSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { CreateAppTempDir } from '../install/temp-dir.js';

const created: string[] = [];

afterEach(() => {
    for (const dir of created.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

function create(appName: string, purpose?: string): string {
    const dir = CreateAppTempDir(appName, purpose);
    created.push(dir);
    return dir;
}

describe('CreateAppTempDir', () => {
    it('creates a new directory under the OS temp dir, named for the app and purpose', () => {
        const dir = create('sample-app', 'teardown');
        expect(existsSync(dir)).toBe(true);
        expect(dirname(dir)).toBe(tmpdir());
        expect(basename(dir)).toMatch(/^mj-app-sample-app-teardown-.{6}$/);
    });

    it('returns a different directory on every call for the same app', () => {
        expect(create('sample-app')).not.toBe(create('sample-app'));
    });

    it.skipIf(process.platform === 'win32')('is readable only by the current user', () => {
        expect(statSync(create('sample-app')).mode & 0o777).toBe(0o700);
    });
});
