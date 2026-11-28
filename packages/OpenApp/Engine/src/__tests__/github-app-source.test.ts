/**
 * Tests for GitHubAppSource: the Open App source that reads manifests, versions and SQL files
 * from a GitHub repository through the GitHub client.
 *
 * The GitHub client is the network boundary, so it is stubbed; each test asserts the repository,
 * subpath, version and app name the source hands it, because a wrong or missing one resolves the
 * wrong git ref (a package-tagged monorepo app needs its app name to find its tag).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    GetLatestVersion: vi.fn(),
    DescribeUnresolvedVersion: vi.fn(),
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
}));

import { GitHubAppSource } from '../source/github-app-source.js';
import {
    FetchManifestFromGitHub,
    DownloadMigrations,
    ValidateGitHubTag,
    GetLatestVersion,
    DescribeUnresolvedVersion,
    ListGitHubReleases,
    ListGitHubTags,
    type GitHubClientOptions,
} from '../github/github-client.js';

const OPTIONS: GitHubClientOptions = { Token: 'test-token' };
const REPO = 'https://github.com/MemberJunction/Integrations';

describe('GitHubAppSource', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends its repository, subpath and app name with every lookup', async () => {
        vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: '{"name":"connector-hubspot"}' });
        vi.mocked(ValidateGitHubTag).mockResolvedValue({ Exists: false, ErrorMessage: 'no tag 9.9.9' });
        vi.mocked(GetLatestVersion).mockResolvedValue('1.4.0');
        vi.mocked(DescribeUnresolvedVersion).mockResolvedValue('no tags in MemberJunction/Integrations (CRM/HubSpot)');
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, LocalPath: '/tmp/target', Files: ['V1__init.sql'] });

        const source = new GitHubAppSource(REPO, { GitHubOptions: OPTIONS, Subpath: 'CRM/HubSpot', AppName: 'connector-hubspot' });

        expect(await source.FetchManifest('1.4.0')).toEqual({ Success: true, ManifestJSON: '{"name":"connector-hubspot"}' });
        expect(FetchManifestFromGitHub).toHaveBeenCalledWith(REPO, '1.4.0', OPTIONS, 'CRM/HubSpot', 'connector-hubspot');

        expect(await source.ValidateVersion('9.9.9')).toEqual({ Exists: false, ErrorMessage: 'no tag 9.9.9' });
        expect(ValidateGitHubTag).toHaveBeenCalledWith(REPO, '9.9.9', OPTIONS, 'CRM/HubSpot', 'connector-hubspot');

        expect(await source.GetLatestVersion()).toBe('1.4.0');
        expect(GetLatestVersion).toHaveBeenCalledWith(REPO, OPTIONS, 'CRM/HubSpot', 'connector-hubspot');

        expect(await source.DescribeUnresolvedVersion()).toBe('no tags in MemberJunction/Integrations (CRM/HubSpot)');
        expect(DescribeUnresolvedVersion).toHaveBeenCalledWith(REPO, OPTIONS, 'CRM/HubSpot');

        expect(await source.CopySqlDirectory('migrations', '1.4.0', '/tmp/target')).toEqual({ Success: true, LocalPath: '/tmp/target', Files: ['V1__init.sql'] });
        expect(DownloadMigrations).toHaveBeenCalledWith(REPO, '1.4.0', 'migrations', '/tmp/target', OPTIONS, 'CRM/HubSpot', 'connector-hubspot');
    });

    it('reads app files from the manifest repository, under the same subpath, with the manifest name', async () => {
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, LocalPath: '/tmp/target', Files: [] });
        // An install source URL carries the subpath; the manifest names the repository root.
        const installSource = new GitHubAppSource(`${REPO}/CRM/HubSpot`, { GitHubOptions: OPTIONS, Subpath: 'CRM/HubSpot' });

        const appFiles = installSource.ForManifest({ name: 'connector-hubspot', repository: REPO });
        await appFiles.CopySqlDirectory('migrations-teardown', '1.0.0', '/tmp/target');

        expect(appFiles.Locator).toBe(REPO);
        expect(appFiles.Subpath).toBe('CRM/HubSpot');
        expect(DownloadMigrations).toHaveBeenCalledWith(REPO, '1.0.0', 'migrations-teardown', '/tmp/target', OPTIONS, 'CRM/HubSpot', 'connector-hubspot');
    });

    it('lists published releases and tags as versions without a leading v, skipping drafts and non-versions', async () => {
        vi.mocked(ListGitHubReleases).mockResolvedValue([
            { TagName: 'v1.2.0', PreRelease: false, Draft: false, CreatedAt: '2026-01-01T00:00:00Z' },
            { TagName: 'v2.0.0', PreRelease: false, Draft: true, CreatedAt: '2026-02-01T00:00:00Z' },
        ]);
        vi.mocked(ListGitHubTags).mockResolvedValue(['v1.0.0', '1.3.0', 'nightly']);

        const source = new GitHubAppSource('https://github.com/acme/mj-crm', { GitHubOptions: OPTIONS });
        const versions = await source.ListVersions();

        expect([...versions].sort()).toEqual(['1.0.0', '1.2.0', '1.3.0']);
        expect(ListGitHubReleases).toHaveBeenCalledWith('https://github.com/acme/mj-crm', OPTIONS);
    });
});
