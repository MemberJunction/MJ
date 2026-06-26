/**
 * Tests for the GitHub client. The client talks to GitHub IN-PROCESS via Octokit
 * (@octokit/rest), so these tests mock the Octokit class and assert on the REST
 * methods it calls (repos.getContent / git.getRef / repos.listTags / repos.listReleases)
 * and the auth token each constructed client receives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted shared mocks: every `new Octokit()` returns an object backed by the SAME
// method mocks, so a test can stub the next response and assert on the call args.
const mocks = vi.hoisted(() => ({
    ctor: vi.fn(),
    getContent: vi.fn(),
    listTags: vi.fn(),
    listReleases: vi.fn(),
    getRef: vi.fn(),
    getBlob: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
    Octokit: class {
        repos = { getContent: mocks.getContent, listTags: mocks.listTags, listReleases: mocks.listReleases };
        git = { getRef: mocks.getRef, getBlob: mocks.getBlob };
        constructor(opts: { auth?: string; userAgent?: string }) {
            mocks.ctor(opts);
        }
    },
}));

import { ValidateGitHubTag, ListGitHubTags, GetLatestVersion, ParseGitHubUrl, FetchManifestFromGitHub } from '../github/github-client.js';
import type { GitHubClientOptions } from '../github/github-client.js';

/** The auth token the most-recently-constructed Octokit received. */
function lastAuth(): string | undefined {
    const calls = mocks.ctor.mock.calls;
    return calls.length > 0 ? (calls[calls.length - 1][0] as { auth?: string }).auth : undefined;
}

/** A getContent response for a small inline file. */
function fileResponse(text: string) {
    return { data: { type: 'file', content: Buffer.from(text, 'utf-8').toString('base64'), encoding: 'base64', sha: 'deadbeef' } };
}

beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
});

describe('ParseGitHubUrl', () => {
    it('parses a standard GitHub URL (no subpath)', () => {
        const result = ParseGitHubUrl('https://github.com/BlueCypress/SaaS');
        expect(result).toEqual({ Owner: 'BlueCypress', Repo: 'SaaS', Subpath: undefined });
    });

    it('parses a .git URL', () => {
        const result = ParseGitHubUrl('https://github.com/BlueCypress/SaaS.git');
        expect(result).toEqual({ Owner: 'BlueCypress', Repo: 'SaaS', Subpath: undefined });
    });

    it('parses a multi-app URL with an in-repo subpath', () => {
        const result = ParseGitHubUrl('https://github.com/MemberJunction/Integrations/CRM/HubSpot');
        expect(result).toEqual({ Owner: 'MemberJunction', Repo: 'Integrations', Subpath: 'CRM/HubSpot' });
    });

    it('ignores a trailing slash (no subpath)', () => {
        expect(ParseGitHubUrl('https://github.com/Acme/App/')?.Subpath).toBeUndefined();
    });

    it('returns null for invalid URL', () => {
        expect(ParseGitHubUrl('https://gitlab.com/foo/bar')).toBeNull();
    });
});

describe('ValidateGitHubTag', () => {
    it('returns Exists: true when tag is found', async () => {
        mocks.getRef.mockResolvedValueOnce({ data: {} });

        const result = await ValidateGitHubTag('https://github.com/Acme/App', '1.0.7', {});
        expect(result.Exists).toBe(true);
        expect(mocks.getRef).toHaveBeenCalledWith({ owner: 'Acme', repo: 'App', ref: 'tags/v1.0.7' });
    });

    it('normalizes version with existing v prefix', async () => {
        mocks.getRef.mockResolvedValueOnce({ data: {} });

        await ValidateGitHubTag('https://github.com/Acme/App', 'v1.0.7', {});
        expect(mocks.getRef).toHaveBeenCalledWith({ owner: 'Acme', repo: 'App', ref: 'tags/v1.0.7' });
    });

    it('returns Exists: false with helpful message when tag not found', async () => {
        mocks.getRef.mockRejectedValueOnce({ status: 404 });

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

    it('includes auth token in the constructed Octokit when provided', async () => {
        mocks.getRef.mockResolvedValueOnce({ data: {} });

        await ValidateGitHubTag('https://github.com/Acme/App', '1.0.0', { Token: 'ghp_test123' });
        expect(lastAuth()).toBe('ghp_test123');
    });
});

describe('ListGitHubTags', () => {
    it('returns semver tags sorted by version descending', async () => {
        mocks.listTags.mockResolvedValueOnce({
            data: [
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
        mocks.listTags.mockResolvedValueOnce({
            data: [{ name: 'latest' }, { name: 'release-candidate' }, { name: 'v1.0.0' }],
        });

        const result = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(result).toEqual(['v1.0.0']);
    });

    it('returns empty array on API failure', async () => {
        mocks.listTags.mockRejectedValueOnce({ status: 404 });
        const result = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(result).toEqual([]);
    });
});

describe('GetLatestVersion', () => {
    it('returns latest version from GitHub Releases when available', async () => {
        mocks.listReleases.mockResolvedValueOnce({
            data: [
                { tag_name: 'v1.0.7', prerelease: false, draft: false, created_at: '2026-04-20T00:00:00Z' },
                { tag_name: 'v1.0.6', prerelease: false, draft: false, created_at: '2026-04-10T00:00:00Z' },
            ],
        });

        const result = await GetLatestVersion('https://github.com/Acme/App', {});
        expect(result).toBe('1.0.7');
    });

    it('falls back to tags when no GitHub Releases exist', async () => {
        mocks.listReleases.mockResolvedValueOnce({ data: [] });
        mocks.listTags.mockResolvedValueOnce({
            data: [{ name: 'v1.0.7' }, { name: 'v1.0.6' }, { name: 'v1.0.0' }],
        });

        const result = await GetLatestVersion('https://github.com/Acme/App', {});
        expect(result).toBe('1.0.7');
    });

    it('returns null when neither releases nor tags exist', async () => {
        mocks.listReleases.mockResolvedValueOnce({ data: [] });
        mocks.listTags.mockResolvedValueOnce({ data: [] });

        const result = await GetLatestVersion('https://github.com/Acme/App', {});
        expect(result).toBeNull();
    });
});

describe('FetchManifestFromGitHub', () => {
    it('fetches mj-app.json at the repo root for a single-app repo', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{"manifestVersion":1}'));

        const result = await FetchManifestFromGitHub('https://github.com/Acme/App', undefined, {});
        expect(result.Success).toBe(true);
        expect(result.ManifestJSON).toBe('{"manifestVersion":1}');
        expect(mocks.getContent).toHaveBeenCalledWith({ owner: 'Acme', repo: 'App', path: 'mj-app.json', ref: 'HEAD' });
    });

    it('resolves the manifest under an in-repo subpath at the scoped tag (multi-app repo)', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{"manifestVersion":1}'));

        await FetchManifestFromGitHub('https://github.com/MemberJunction/Integrations/CRM/HubSpot', '1.2.0', {});
        expect(mocks.getContent).toHaveBeenCalledWith({
            owner: 'MemberJunction',
            repo: 'Integrations',
            path: 'CRM/HubSpot/mj-app.json',
            ref: 'CRM-HubSpot@1.2.0', // scoped per-connector tag, not repo-wide v1.2.0
        });
    });

    it('honors an explicit subpath argument', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{}'));

        await FetchManifestFromGitHub('https://github.com/MemberJunction/Integrations', undefined, {}, 'AMS/Aptify');
        expect(mocks.getContent).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'AMS/Aptify/mj-app.json' }),
        );
    });

    it('reads large (>1MB) files via the Git Blob API fallback', async () => {
        // getContent returns no inline content for big files; the client falls back to getBlob.
        mocks.getContent.mockResolvedValueOnce({ data: { type: 'file', content: '', encoding: 'none', sha: 'bigsha' } });
        mocks.getBlob.mockResolvedValueOnce({ data: { content: Buffer.from('{"big":true}', 'utf-8').toString('base64'), encoding: 'base64' } });

        const result = await FetchManifestFromGitHub('https://github.com/Acme/App', undefined, {});
        expect(result.Success).toBe(true);
        expect(result.ManifestJSON).toBe('{"big":true}');
        expect(mocks.getBlob).toHaveBeenCalledWith({ owner: 'Acme', repo: 'App', file_sha: 'bigsha' });
    });

    it('returns a not-found error on 404', async () => {
        mocks.getContent.mockRejectedValueOnce({ status: 404 });

        const result = await FetchManifestFromGitHub('https://github.com/Acme/App', undefined, {});
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('not found');
    });
});

describe('TokenMap resolution', () => {
    it('uses per-repo token from TokenMap when available', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{}'));

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: { 'https://github.com/Acme/SpecialRepo': 'special-token' },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/SpecialRepo', undefined, options);
        expect(lastAuth()).toBe('special-token');
    });

    it('falls back to default Token when repo not in TokenMap', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{}'));

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: { 'https://github.com/Acme/OtherRepo': 'other-token' },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/UnmatchedRepo', undefined, options);
        expect(lastAuth()).toBe('default-token');
    });

    it('matches TokenMap keys case-insensitively', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{}'));

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: { 'https://github.com/BlueCypress/SaaS': 'saas-token' },
        };

        await FetchManifestFromGitHub('https://github.com/bluecypress/saas', undefined, options);
        expect(lastAuth()).toBe('saas-token');
    });

    it('strips .git suffix when matching TokenMap keys', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{}'));

        const options: GitHubClientOptions = {
            Token: 'default-token',
            TokenMap: { 'https://github.com/Acme/App': 'app-token' },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/App.git', undefined, options);
        expect(lastAuth()).toBe('app-token');
    });

    it('sends no auth token when no token matches and no default', async () => {
        mocks.getContent.mockResolvedValueOnce(fileResponse('{}'));

        const options: GitHubClientOptions = {
            TokenMap: { 'https://github.com/Acme/OtherRepo': 'other-token' },
        };

        await FetchManifestFromGitHub('https://github.com/Acme/UnmatchedRepo', undefined, options);
        expect(lastAuth()).toBeUndefined();
    });
});

describe('scoped (multi-app) version resolution', () => {
    const MULTI = 'https://github.com/MemberJunction/Integrations/CRM/HubSpot';

    it('ValidateGitHubTag checks the connector-scoped tag, not repo-wide vX.Y.Z', async () => {
        mocks.getRef.mockResolvedValueOnce({ data: {} });
        const r = await ValidateGitHubTag(MULTI, '1.2.0', {});
        expect(r.Exists).toBe(true);
        expect(mocks.getRef).toHaveBeenCalledWith({ owner: 'MemberJunction', repo: 'Integrations', ref: 'tags/CRM-HubSpot@1.2.0' });
    });

    it('ListGitHubTags returns only THIS connector\'s versions from <prefix>@<version> tags', async () => {
        mocks.listTags.mockResolvedValueOnce({
            data: [
                { name: 'CRM-HubSpot@1.0.0' },
                { name: 'CRM-HubSpot@1.2.0' },
                { name: 'CRM-Salesforce@3.0.0' }, // a different connector — must be ignored
                { name: 'v9.9.9' },               // repo-wide tag — must be ignored
            ],
        });
        const tags = await ListGitHubTags(MULTI, {});
        expect(tags).toEqual(['1.2.0', '1.0.0']);
    });

    it('GetLatestVersion picks the newest scoped version (skips repo-wide releases)', async () => {
        mocks.listTags.mockResolvedValueOnce({
            data: [{ name: 'CRM-HubSpot@1.0.0' }, { name: 'CRM-HubSpot@1.4.1' }, { name: 'CRM-HubSpot@1.4.0' }],
        });
        const v = await GetLatestVersion(MULTI, {});
        expect(v).toBe('1.4.1');
        expect(mocks.listReleases).not.toHaveBeenCalled(); // releases are repo-wide; scoped apps go straight to tags
    });

    it('single-app repos still resolve repo-wide v-tags (backwards compatible)', async () => {
        mocks.getRef.mockResolvedValueOnce({ data: {} });
        await ValidateGitHubTag('https://github.com/Acme/App', '2.0.0', {});
        expect(mocks.getRef).toHaveBeenCalledWith({ owner: 'Acme', repo: 'App', ref: 'tags/v2.0.0' });
    });
});
