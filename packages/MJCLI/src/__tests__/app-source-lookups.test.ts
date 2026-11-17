/**
 * Tests for the version lookups `mj app check-updates` passes to CheckAppsForUpdates.
 *
 * An app installed from a folder in the repository is stored with a `file:` locator. Its latest
 * version is the `version` in the folder's mj-app.json, so the check must read the folder, not
 * GitHub. The folder is real (OS temp directory); no GitHub call is made for a `file:` app.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckAppsForUpdates } from '../utils/update-check.js';
import { BuildAppVersionLookups } from '../utils/app-source-lookups.js';

let repoRoot: string;

beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'check-updates-'));
    mkdirSync(join(repoRoot, 'openapps', 'analytics'), { recursive: true });
});

afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
});

describe('BuildAppVersionLookups', () => {
    it('reports the folder version of a local app as its latest version', async () => {
        writeFileSync(join(repoRoot, 'openapps', 'analytics', 'mj-app.json'), JSON.stringify({ name: 'analytics', version: '1.1.0' }));
        const lookups = BuildAppVersionLookups({}, repoRoot);

        const report = await CheckAppsForUpdates(
            [{ Name: 'analytics', Version: '1.0.0', RepositoryURL: 'file:openapps/analytics', Subpath: null }],
            lookups.LookupLatestVersion,
            lookups.DescribeUnresolved,
        );

        expect(report).toEqual({ Updates: [{ Name: 'analytics', Current: '1.0.0', Latest: '1.1.0' }], Failures: [], Unresolved: [] });
    });

    it('explains a local app whose folder has no manifest', async () => {
        const lookups = BuildAppVersionLookups({}, repoRoot);

        const report = await CheckAppsForUpdates(
            [{ Name: 'reports', Version: '1.0.0', RepositoryURL: 'file:openapps/reports', Subpath: null }],
            lookups.LookupLatestVersion,
            lookups.DescribeUnresolved,
        );

        expect(report.Unresolved).toHaveLength(1);
        expect(report.Unresolved[0].Reason).toContain('mj-app.json not found');
    });
});
