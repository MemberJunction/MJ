/**
 * Tests for GitHub client functions: tag validation, tag listing,
 * and GetLatestVersion fallback to tags.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ValidateGitHubTag, ListGitHubTags, GetLatestVersion, ParseGitHubUrl, FetchManifestFromGitHub } from '../github/github-client.js';
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
