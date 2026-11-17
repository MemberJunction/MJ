/**
 * Tests for LocalAppSource: the Open App source that reads an app from a folder inside the
 * consumer repository, and the helpers that turn a CLI path into a `file:` locator.
 *
 * Each test builds a real folder in the OS temp directory, because the source's job is reading
 * and copying files; a mocked file system would not show which files it copies.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { LocalAppSource, NormalizeAppSource, IsLocalAppLocator } from '../source/local-app-source.js';
import { ResolveAppSource } from '../source/open-app-source.js';
import { GitHubAppSource } from '../source/github-app-source.js';

const LOCATOR = 'file:openapps/analytics';
const CREATE_SQL = 'CREATE TABLE analytics.Event (ID INT);';

let repoRoot: string;
let appDir: string;
let targetDir: string;

/** Writes a file under the app folder, creating parent folders. */
function writeAppFile(relativePath: string, content: string): void {
    const full = join(appDir, relativePath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
}

function writeManifest(version: string): string {
    const json = JSON.stringify({ name: 'analytics', version, repository: 'https://github.com/acme/platform' });
    writeAppFile('mj-app.json', json);
    return json;
}

function newSource(locator = LOCATOR): LocalAppSource {
    return new LocalAppSource(locator, repoRoot);
}

beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'local-app-repo-'));
    appDir = join(repoRoot, 'openapps', 'analytics');
    mkdirSync(appDir, { recursive: true });
    targetDir = mkdtempSync(join(tmpdir(), 'local-app-target-'));
});

afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
});

describe('LocalAppSource versions and manifest', () => {
    it('reads mj-app.json and publishes only the version it declares', async () => {
        const json = writeManifest('1.2.0');
        const source = newSource();

        expect(await source.FetchManifest()).toEqual({ Success: true, ManifestJSON: json });
        expect(await source.FetchManifest('v1.2.0')).toEqual({ Success: true, ManifestJSON: json });
        expect(await source.GetLatestVersion()).toBe('1.2.0');
        expect(await source.ListVersions()).toEqual(['1.2.0']);
        expect(await source.ValidateVersion('1.2.0')).toEqual({ Exists: true });

        const other = await source.ValidateVersion('1.3.0');
        expect(other.Exists).toBe(false);
        expect(other.ErrorMessage).toContain('1.2.0');
        expect(other.ErrorMessage).toContain('1.3.0');
        const wrongFetch = await source.FetchManifest('1.3.0');
        expect(wrongFetch.Success).toBe(false);
        expect(wrongFetch.ErrorMessage).toContain('1.2.0');
    });

    it('reports a missing manifest instead of a version', async () => {
        const source = newSource();

        const fetched = await source.FetchManifest();
        expect(fetched.Success).toBe(false);
        expect(fetched.ErrorMessage).toContain('mj-app.json');
        expect(await source.GetLatestVersion()).toBeNull();
        expect(await source.ListVersions()).toEqual([]);
        expect(await source.DescribeUnresolvedVersion()).toContain('mj-app.json');
    });

    it('refuses a locator that points outside the repository root', async () => {
        const source = newSource('file:../outside');

        const fetched = await source.FetchManifest();
        expect(fetched.Success).toBe(false);
        expect(fetched.ErrorMessage).toContain('outside');
    });

    it('refuses a locator outside the repository root even when that folder has an mj-app.json', async () => {
        const outside = `${repoRoot}-outside`;
        mkdirSync(outside, { recursive: true });
        writeFileSync(join(outside, 'mj-app.json'), JSON.stringify({ name: 'outside', version: '1.0.0' }));
        try {
            const source = newSource(`file:../${basename(outside)}`);

            expect((await source.FetchManifest()).Success).toBe(false);
            expect(await source.GetLatestVersion()).toBeNull();
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });

    it('keeps its folder and the workspace package strategy for the app files of any manifest', () => {
        const appFiles = newSource().ForManifest({ name: 'analytics', repository: 'https://github.com/acme/platform' });

        expect(appFiles.Locator).toBe(LOCATOR);
        expect(appFiles.Subpath).toBeUndefined();
        expect(appFiles.PackageVersionStrategy).toBe('workspace');
    });
});

describe('LocalAppSource.CopySqlDirectory', () => {
    beforeEach(() => {
        writeManifest('1.0.0');
    });

    it('copies the .sql files under the directory, keeping subfolders and skipping other files and links', async () => {
        writeAppFile('migrations/V1__create.sql', CREATE_SQL);
        writeAppFile('migrations/seed/V2__seed.sql', 'INSERT 1;');
        writeAppFile('migrations/README.md', '# notes');
        writeFileSync(join(repoRoot, 'secret.sql'), 'SELECT 1;');
        symlinkSync(join(repoRoot, 'secret.sql'), join(appDir, 'migrations', 'V3__link.sql'));

        const result = await newSource().CopySqlDirectory('migrations', '1.0.0', targetDir);

        expect(result).toEqual({ Success: true, LocalPath: targetDir, Files: ['V1__create.sql', 'seed/V2__seed.sql'] });
        expect(readFileSync(join(targetDir, 'V1__create.sql'), 'utf-8')).toBe(CREATE_SQL);
        expect(readFileSync(join(targetDir, 'seed', 'V2__seed.sql'), 'utf-8')).toBe('INSERT 1;');
        expect(existsSync(join(targetDir, 'README.md'))).toBe(false);
        expect(existsSync(join(targetDir, 'V3__link.sql'))).toBe(false);
    });

    it('refuses a .sql file nested deeper than the migration depth limit', async () => {
        writeAppFile('migrations/a/b/c/d/e/f/g/V9__deep.sql', 'SELECT 1;');

        const result = await newSource().CopySqlDirectory('migrations', '1.0.0', targetDir);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('nesting');
    });

    it('fails when the directory has no .sql files or does not exist', async () => {
        writeAppFile('migrations/README.md', '# notes');

        const empty = await newSource().CopySqlDirectory('migrations', '1.0.0', targetDir);
        expect(empty.Success).toBe(false);
        expect(empty.ErrorMessage).toContain('No .sql files');

        const missing = await newSource().CopySqlDirectory('migrations-pg', '1.0.0', targetDir);
        expect(missing.Success).toBe(false);
        expect(missing.ErrorMessage).toContain('migrations-pg');
    });

    it('refuses a directory outside the app folder', async () => {
        writeFileSync(join(repoRoot, 'openapps', 'V1__other.sql'), 'DROP TABLE x;');

        const result = await newSource().CopySqlDirectory('..', '1.0.0', targetDir);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('outside');
        expect(existsSync(join(targetDir, 'V1__other.sql'))).toBe(false);
    });

    it('refuses to copy files for a version the folder is no longer at', async () => {
        writeAppFile('migrations-teardown/V1__teardown.sql', 'DELETE 1;');

        const result = await newSource().CopySqlDirectory('migrations-teardown', '0.9.0', targetDir);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('0.9.0');
        expect(result.ErrorMessage).toContain('1.0.0');
        expect(existsSync(join(targetDir, 'V1__teardown.sql'))).toBe(false);
    });
});

describe('ResolveAppSource', () => {
    it('returns a local source for a file: locator and a GitHub source for a URL', () => {
        expect(ResolveAppSource(LOCATOR, { GitHubOptions: {}, RepoRoot: '/repo' })).toBeInstanceOf(LocalAppSource);
        expect(ResolveAppSource('https://github.com/acme/mj-crm', { GitHubOptions: {}, RepoRoot: '/repo' })).toBeInstanceOf(GitHubAppSource);
        expect(IsLocalAppLocator(LOCATOR)).toBe(true);
        expect(IsLocalAppLocator('https://github.com/acme/mj-crm')).toBe(false);
    });
});

describe('NormalizeAppSource', () => {
    beforeEach(() => {
        writeManifest('1.0.0');
    });

    it('turns a folder path into a file: locator relative to the repository root', () => {
        expect(NormalizeAppSource('./openapps/analytics', repoRoot)).toEqual({ Success: true, Source: LOCATOR });
        expect(NormalizeAppSource('openapps/analytics/', repoRoot)).toEqual({ Success: true, Source: LOCATOR });
        expect(NormalizeAppSource(appDir, repoRoot)).toEqual({ Success: true, Source: LOCATOR });
        expect(NormalizeAppSource('file:./openapps/analytics', repoRoot)).toEqual({ Success: true, Source: LOCATOR });
    });

    it('accepts an absolute path that reaches the repository root through a link', () => {
        const alias = `${repoRoot}-link`;
        symlinkSync(repoRoot, alias);
        try {
            expect(NormalizeAppSource(join(alias, 'openapps', 'analytics'), repoRoot)).toEqual({ Success: true, Source: LOCATOR });
        } finally {
            rmSync(alias, { force: true });
        }
    });

    it('leaves a GitHub URL unchanged', () => {
        const url = 'https://github.com/MemberJunction/Integrations/CRM/HubSpot';
        expect(NormalizeAppSource(url, repoRoot)).toEqual({ Success: true, Source: url });
    });

    it('refuses a folder outside the repository root', () => {
        const result = NormalizeAppSource('../elsewhere/app', repoRoot);
        expect(result.Success).toBe(false);
        expect(result.Success === false && result.ErrorMessage).toContain('outside');
    });
});
