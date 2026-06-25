/**
 * Tests for GitHub client functions: tag validation, tag listing,
 * and GetLatestVersion fallback to tags.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ValidateGitHubTag, ListGitHubTags, ListGitHubReleases, GetLatestVersion, ParseGitHubUrl, FetchManifestFromGitHub, GitHubAccessError, compareSemver } from '../github/github-client.js';
import type { GitHubClientOptions } from '../github/github-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ParseGitHubUrl', () => {
    it('parses a standard GitHub URL', () => {
        const result = ParseGitHubUrl('https://github.com/BlueCypress/SaaS');
        expect(result).toEqual({ Owner: 'BlueCypress', Repo: 'SaaS' });
    });

    it('parses a .git URL', () => {
        const result = ParseGitHubUrl('https://github.com/BlueCypress/SaaS.git');
        expect(result).toEqual({ Owner: 'BlueCypress', Repo: 'SaaS' });
    });

    it('returns null for invalid URL', () => {
        expect(ParseGitHubUrl('https://gitlab.com/foo/bar')).toBeNull();
    });
});

describe('ValidateGitHubTag', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('returns Exists: true when tag is found', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await ValidateGitHubTag('https://github.com/Acme/App', '1.0.7', {});
        expect(result.Exists).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/git/ref/tags/v1.0.7'),
            expect.objectContaining({ headers: expect.any(Object) }),
        );
    });

    it('normalizes version with existing v prefix', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        await ValidateGitHubTag('https://github.com/Acme/App', 'v1.0.7', {});
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/git/ref/tags/v1.0.7'),
            expect.anything(),
        );
    });

    it('returns Exists: false with helpful message when tag not found', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

        const result = await ValidateGitHubTag('https://github.com/Acme/App', '9.9.9', {});
        expect(result.Exists).toBe(false);
        expect(result.ErrorMessage).toContain("Tag 'v9.9.9' not found");
        expect(result.ErrorMessage).toContain('Acme/App');
    });

    it('returns error for invalid GitHub URL', async () => {
        const result = await ValidateGitHubTag('https://gitlab.com/foo/bar', '1.0.0', {});
        expect(result.Exists).toBe(false);
        expect(result.ErrorMessage).toContain('Invalid GitHub URL');
    });

    it('includes auth token in request when provided', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        await ValidateGitHubTag('https://github.com/Acme/App', '1.0.0', { Token: 'ghp_test123' });
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer ghp_test123');
    });
});

describe('ListGitHubTags', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('returns semver tags sorted by version descending', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { name: 'v1.0.0' },
                { name: 'v1.0.7' },
                { name: 'v1.0.3' },
                { name: 'v1.0.6' },
                { name: 'not-semver' },
            ],
        });

        const result = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(result).toEqual(['v1.0.7', 'v1.0.6', 'v1.0.3', 'v1.0.0']);
    });

    it('filters out non-semver tags', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { name: 'latest' },
                { name: 'release-candidate' },
                { name: 'v1.0.0' },
            ],
        });

        const result = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(result).toEqual(['v1.0.0']);
    });

    it('returns empty array on API failure', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
        const result = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(result).toEqual([]);
    });
});

describe('GetLatestVersion', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('returns latest version from GitHub Releases when available', async () => {
        // Releases endpoint returns results
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { tag_name: 'v1.0.7', prerelease: false, draft: false, created_at: '2026-04-20T00:00:00Z' },
                { tag_name: 'v1.0.6', prerelease: false, draft: false, created_at: '2026-04-10T00:00:00Z' },
            ],
        });

        const result = await GetLatestVersion('https://github.com/Acme/App', {});
        expect(result).toBe('1.0.7');
    });

    it('falls back to tags when no GitHub Releases exist', async () => {
        // Releases endpoint returns empty
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });

        // Tags endpoint returns results
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { name: 'v1.0.7' },
                { name: 'v1.0.6' },
                { name: 'v1.0.0' },
            ],
        });

        const result = await GetLatestVersion('https://github.com/Acme/App', {});
        expect(result).toBe('1.0.7');
    });

    it('returns null when neither releases nor tags exist', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] }); // releases
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] }); // tags

        const result = await GetLatestVersion('https://github.com/Acme/App', {});
        expect(result).toBeNull();
    });
});

describe('TokenMap resolution', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('uses per-repo token from TokenMap when available', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: btoa('{}'), encoding: 'base64' }),
        });

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: {
                'https://github.com/Acme/SpecialRepo': 'special-token',
            },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/SpecialRepo', undefined, options);
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer special-token');
    });

    it('falls back to default Token when repo not in TokenMap', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: btoa('{}'), encoding: 'base64' }),
        });

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: {
                'https://github.com/Acme/OtherRepo': 'other-token',
            },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/UnmatchedRepo', undefined, options);
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer default-token');
    });

    it('matches TokenMap keys case-insensitively', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: btoa('{}'), encoding: 'base64' }),
        });

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: {
                'https://github.com/BlueCypress/SaaS': 'saas-token',
            },
        };

        await FetchManifestFromGitHub('https://github.com/bluecypress/saas', undefined, options);
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer saas-token');
    });

    it('strips .git suffix when matching TokenMap keys', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: btoa('{}'), encoding: 'base64' }),
        });

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: {
                'https://github.com/Acme/App': 'app-token',
            },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/App.git', undefined, options);
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer app-token');
    });

    it('sends no auth header when no token matches and no default', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: btoa('{}'), encoding: 'base64' }),
        });

        const options: GitHubClientOptions = {
            TokenMap: {
                'https://github.com/Acme/OtherRepo': 'other-token',
            },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/UnmatchedRepo', undefined, options);
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBeUndefined();
    });
});

describe('rate-limit / forbidden handling (B36)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('ListGitHubTags throws GitHubAccessError on 403 (not silently empty)', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
        // Pre-fix this returned [] — indistinguishable from "no tags".
        await expect(ListGitHubTags('https://github.com/Acme/App', {})).rejects.toBeInstanceOf(GitHubAccessError);
    });

    it('ListGitHubReleases throws GitHubAccessError on 429', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
        await expect(ListGitHubReleases('https://github.com/Acme/App', {})).rejects.toBeInstanceOf(GitHubAccessError);
    });

    it('GetLatestVersion propagates a rate-limit instead of returning null (wrong "no version")', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 403 }); // releases call rate-limited
        await expect(GetLatestVersion('https://github.com/Acme/App', {})).rejects.toBeInstanceOf(GitHubAccessError);
    });

    it('still returns [] for a genuine 404 (no releases endpoint / repo)', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
        await expect(ListGitHubTags('https://github.com/Acme/App', {})).resolves.toEqual([]);
    });
});

describe('ListGitHubReleases ordering (B38)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('sorts releases newest-first by CreatedAt even when the API returns them out of order', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => [
                { tag_name: 'v1.0.1', prerelease: false, draft: false, created_at: '2026-01-10T00:00:00Z' },
                { tag_name: 'v1.0.3', prerelease: false, draft: false, created_at: '2026-03-10T00:00:00Z' },
                { tag_name: 'v1.0.2', prerelease: false, draft: false, created_at: '2026-02-10T00:00:00Z' },
            ],
        });
        const result = await ListGitHubReleases('https://github.com/Acme/App', {});
        expect(result.map(r => r.TagName)).toEqual(['v1.0.3', 'v1.0.2', 'v1.0.1']);
    });
});

describe('compareSemver — prerelease handling (B37)', () => {
    it('ranks a stable version above the same-core prerelease (1.0.0 > 1.0.0-rc.1)', () => {
        expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
        expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    });

    it('does not produce NaN for prerelease cores (the old map(Number) bug)', () => {
        // Pre-fix: '1.0.0-rc'.split('.').map(Number) → [1,0,NaN] → NaN comparisons → unstable.
        const r = compareSemver('1.0.0-rc.1', '1.0.0-rc.2');
        expect(Number.isNaN(r)).toBe(false);
        expect(r).toBeLessThan(0); // rc.1 < rc.2
    });

    it('compares numeric prerelease identifiers numerically (rc.2 < rc.10)', () => {
        expect(compareSemver('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0);
    });

    it('sorts a mixed list correctly via the comparator (stable last when ascending)', () => {
        const sorted = ['1.0.0', '1.0.0-rc.10', '1.0.0-rc.2', '1.0.1'].sort(compareSemver);
        expect(sorted).toEqual(['1.0.0-rc.2', '1.0.0-rc.10', '1.0.0', '1.0.1']);
    });
});
