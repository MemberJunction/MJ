/**
 * Tests for ResolveDependencyVersion (B26).
 *
 * A dependency declares a semver range; the installer must pin to the highest PUBLISHED
 * version that satisfies it — not silently install whatever the default branch reports (which
 * could be a different major). An unsatisfiable or invalid range fails loudly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// install-orchestrator imports @memberjunction/core at module load — mock it minimally.
vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
    CompositeKey: class {},
}));

// The functions ResolveDependencyVersion consults — controllable per test.
vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
}));

import { ResolveDependencyVersion } from '../install/install-orchestrator.js';
import { ListGitHubReleases, ListGitHubTags } from '../github/github-client.js';

type Release = { TagName: string; PreRelease: boolean; Draft: boolean; CreatedAt: string };
function release(tag: string, draft = false): Release {
    return { TagName: tag, PreRelease: false, Draft: draft, CreatedAt: '2026-01-01T00:00:00Z' };
}

const REPO = 'https://github.com/Acme/Dep';

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ListGitHubReleases).mockResolvedValue([]);
    vi.mocked(ListGitHubTags).mockResolvedValue([]);
});

describe('ResolveDependencyVersion (B26)', () => {
    it('picks the highest tag satisfying the range (^1.0.0 → 1.5.0, not 2.0.0)', async () => {
        vi.mocked(ListGitHubTags).mockResolvedValue(['1.0.0', '1.5.0', '2.0.0']);
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.5.0');
        expect(r.ErrorMessage).toBeUndefined();
    });

    it('combines releases and tags as candidates', async () => {
        vi.mocked(ListGitHubReleases).mockResolvedValue([release('v1.4.0')]);
        vi.mocked(ListGitHubTags).mockResolvedValue(['1.2.0']);
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBe('1.4.0');
    });

    it('excludes draft releases from the candidate set', async () => {
        vi.mocked(ListGitHubReleases).mockResolvedValue([release('v2.0.0', true)]); // draft, ignored
        vi.mocked(ListGitHubTags).mockResolvedValue(['1.0.0']);
        const r = await ResolveDependencyVersion(REPO, '>=1.0.0', {});
        expect(r.Version).toBe('1.0.0');
    });

    it('fails loudly when NO published version satisfies the range (the silent-wrong-major bug)', async () => {
        vi.mocked(ListGitHubTags).mockResolvedValue(['2.0.0', '3.0.0']);
        const r = await ResolveDependencyVersion(REPO, '^1.0.0', {});
        expect(r.Version).toBeUndefined();
        expect(r.ErrorMessage).toContain('satisfies');
    });

    it('pins an exact version directly without listing', async () => {
        const r = await ResolveDependencyVersion(REPO, '1.2.3', {});
        expect(r.Version).toBe('1.2.3');
        expect(vi.mocked(ListGitHubTags)).not.toHaveBeenCalled();
    });

    it('treats empty / * / latest as "no constraint" (default-branch latest)', async () => {
        for (const range of ['', '*', 'latest']) {
            const r = await ResolveDependencyVersion(REPO, range, {});
            expect(r.Version).toBeUndefined();
            expect(r.ErrorMessage).toBeUndefined();
        }
    });

    it('rejects an invalid semver range', async () => {
        const r = await ResolveDependencyVersion(REPO, 'not-a-range!!', {});
        expect(r.ErrorMessage).toContain('not a valid semver');
    });
});
