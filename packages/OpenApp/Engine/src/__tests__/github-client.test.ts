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

/**
 * Stand-in for Octokit's paginate plugin: calls the endpoint page by page and concatenates the
 * results, stopping on the first short page (Octokit follows Link headers; page length is the
 * faithful equivalent for a mocked endpoint). A test that stubs a single sub-`per_page` page
 * therefore behaves exactly as it did before pagination was introduced.
 */
type PagedEndpoint = (params: Record<string, unknown>) => Promise<{ data: unknown[] }>;
async function fakePaginate(endpoint: PagedEndpoint, params: Record<string, unknown>): Promise<unknown[]> {
    const perPage = typeof params.per_page === 'number' ? params.per_page : 100;
    const all: unknown[] = [];
    for (let page = 1; ; page++) {
        const { data } = await endpoint({ ...params, page });
        all.push(...data);
        if (data.length < perPage) return all;
    }
}

vi.mock('@octokit/rest', () => ({
    Octokit: class {
        repos = { getContent: mocks.getContent, listTags: mocks.listTags, listReleases: mocks.listReleases };
        git = { getRef: mocks.getRef, getBlob: mocks.getBlob };
        paginate = fakePaginate;
        constructor(opts: { auth?: string; userAgent?: string }) {
            mocks.ctor(opts);
        }
    },
}));

import {
    ValidateGitHubTag,
    ListGitHubTags,
    ListGitHubReleases,
    GetLatestVersion,
    ParseGitHubUrl,
    FetchManifestFromGitHub,
    IsPrereleaseVersion,
    ClearGitHubTagCache,
} from '../github/github-client.js';
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

/** Stubs one short page of tags (short => fakePaginate stops, so exactly one request). */
function stubTags(names: string[]): void {
    mocks.listTags.mockResolvedValueOnce({ data: names.map(name => ({ name })) });
}

/** Stubs one short page of releases. */
function stubReleases(releases: Array<{ tag_name: string; prerelease: boolean; draft: boolean; created_at: string }>): void {
    mocks.listReleases.mockResolvedValueOnce({ data: releases });
}

beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    // The tag-list cache is module state that outlives a single test. Without this, a test that
    // stubs `listTags` could be served the PREVIOUS test's tag list and pass for the wrong reason
    // — or assert a call count that a cache hit had silently absorbed.
    ClearGitHubTagCache();
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

    it('picks the highest stable RELEASE, not the most recently created one', async () => {
        // A hotfix backported to an older line ships after a major: it is the newest release by
        // creation date but the lower version, and offering it would be a downgrade prompt.
        mocks.listReleases.mockResolvedValueOnce({
            data: [
                { tag_name: 'v1.9.1', prerelease: false, draft: false, created_at: '2026-05-01T00:00:00Z' },
                { tag_name: 'v2.0.0', prerelease: false, draft: false, created_at: '2026-04-01T00:00:00Z' },
            ],
        });

        expect(await GetLatestVersion('https://github.com/Acme/App', {})).toBe('2.0.0');
    });

    it('ignores a prerelease release that sorts above the newest stable one', async () => {
        mocks.listReleases.mockResolvedValueOnce({
            data: [
                { tag_name: 'v2.1.0-beta.1', prerelease: true, draft: false, created_at: '2026-05-01T00:00:00Z' },
                { tag_name: 'v1.9.1', prerelease: false, draft: false, created_at: '2026-04-20T00:00:00Z' },
                { tag_name: 'v2.0.0', prerelease: false, draft: false, created_at: '2026-04-01T00:00:00Z' },
            ],
        });

        expect(await GetLatestVersion('https://github.com/Acme/App', {})).toBe('2.0.0');
    });

    it('never returns a scoped release NAME as if it were a version', async () => {
        // `@scope/pkg@1.2.3` is not a repo-wide version — ParseSemver reads the `-` inside
        // `wild-apricot` as a prerelease delimiter, so ordering these by semver produces a
        // meaningless answer. Neither is taking GitHub's first one, which is what `next` does:
        // that returns '@memberjunction/connector-wild-apricot@1.3.0' as this app's "latest
        // version". It can never equal the installed version, so it reads as a permanent
        // "update available" pointing at a target `mj app upgrade` would act on. Verified live:
        // GetLatestVersion(MemberJunction/Integrations) returns
        // '@memberjunction/connector-nimble-ams@1.3.2' on next.
        //
        // With nothing repo-wide-versioned to report, the honest answer is to fall through to the
        // tag path — which matches only `v?<semver>` for a repo-wide app — and resolve to null.
        mocks.listReleases.mockResolvedValueOnce({
            data: [
                { tag_name: '@memberjunction/connector-wild-apricot@1.3.0', prerelease: false, draft: false, created_at: '2026-07-28T00:00:00Z' },
                { tag_name: '@memberjunction/connector-orcid@1.1.3', prerelease: false, draft: false, created_at: '2026-07-28T00:00:00Z' },
            ],
        });
        mocks.listTags.mockResolvedValueOnce({ data: [{ name: '@memberjunction/connector-orcid@1.1.3' }] });

        expect(await GetLatestVersion('https://github.com/Acme/App', {})).toBeNull();
    });

    it('still prefers a real repo-wide version when the release list MIXES both shapes', async () => {
        // The scoped names must not suppress a genuine repo-wide release that is present.
        mocks.listReleases.mockResolvedValueOnce({
            data: [
                { tag_name: '@memberjunction/connector-wild-apricot@9.9.9', prerelease: false, draft: false, created_at: '2026-07-28T00:00:00Z' },
                { tag_name: 'v1.4.0', prerelease: false, draft: false, created_at: '2026-07-01T00:00:00Z' },
            ],
        });

        expect(await GetLatestVersion('https://github.com/Acme/App', {})).toBe('1.4.0');
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

describe('version ordering and normalization through the public API', () => {
    // The comparator itself is `semver` (already a dependency of this package), so these test OUR USE
    // of it -- ordering, prerelease preference and normalization as observed through ListGitHubTags /
    // GetLatestVersion -- rather than re-deriving the library's own semantics. The prior suite proved a
    // hand-rolled comparator matched `semver` over 14,400 pairs; adopting the library retires that
    // obligation along with the ~60 lines it was defending.

    it('orders tags by semver precedence, not lexically or by GitHub order', async () => {
        // GitHub returns tags in its own order; 1.10.0 must beat 1.9.0, and a prerelease must rank
        // below its release.
        stubTags(['v1.2.0', 'v1.2.0-beta.1', 'v1.10.0', 'v1.2.0-rc.1', 'v1.9.0', 'v2.0.0-alpha.1']);
        const tags = await ListGitHubTags('https://github.com/o/r', {});
        // Tag TEXT is preserved (callers and ValidateGitHubTag depend on it); only the order changes.
        expect(tags).toEqual(['v2.0.0-alpha.1', 'v1.10.0', 'v1.9.0', 'v1.2.0', 'v1.2.0-rc.1', 'v1.2.0-beta.1']);
    });

    it('drops a tag whose core cannot be parsed rather than letting it poison the sort', async () => {
        // The old comparator returned NaN for these, making Array.sort implementation-defined.
        stubTags(['v1.2.0', 'v1.2.0-beta.1']);
        expect(await ListGitHubTags('https://github.com/o/r', {})).toEqual(['v1.2.0', 'v1.2.0-beta.1']);
    });

    it('never returns build metadata as part of a version (the permanent-update-available defect)', async () => {
        // A release tagged v1.2.3+build.7 used to come back verbatim. '1.2.3+build.7' can never equal
        // an installed '1.2.3', so it read as an update forever, pointing at a target upgrade would act on.
        stubReleases([{ tag_name: 'v1.2.3+build.7', prerelease: false, draft: false, created_at: '2026-01-01' }]);
        expect(await GetLatestVersion('https://github.com/o/r', {})).toBe('1.2.3');
    });

    it('prefers a stable release even when the prerelease flag was not ticked', async () => {
        // The flag is a checkbox a maintainer can forget. Guarding only on it let the releases path
        // offer an rc as the upgrade target while the tag path, guarding on the string, said 2.0.0.
        stubReleases([
            { tag_name: 'v2.1.0-rc.1', prerelease: false, draft: false, created_at: '2026-02-01' },
            { tag_name: 'v2.0.0', prerelease: false, draft: false, created_at: '2026-01-01' },
        ]);
        expect(await GetLatestVersion('https://github.com/o/r', {})).toBe('2.0.0');
    });

    it('falls back to a prerelease only when nothing stable exists', async () => {
        stubReleases([{ tag_name: 'v2.1.0-rc.1', prerelease: false, draft: false, created_at: '2026-02-01' }]);
        expect(await GetLatestVersion('https://github.com/o/r', {})).toBe('2.1.0-rc.1');
    });

    it('ignores release names that merely CONTAIN a version', async () => {
        // A scoped release name is not a repo-wide version; ordering those by semver is meaningless
        // (the '-' inside 'wild-apricot' reads as a prerelease delimiter). No repo-wide version here,
        // so the releases path must decline and let the tag path answer.
        stubReleases([{ tag_name: '@memberjunction/connector-wild-apricot@1.3.0', prerelease: false, draft: false, created_at: '2026-01-01' }]);
        stubTags([]);
        expect(await GetLatestVersion('https://github.com/o/r', {})).toBeNull();
    });

    it('IsPrereleaseVersion detects the suffix, not build metadata', () => {
        expect(IsPrereleaseVersion('1.2.0-beta.1')).toBe(true);
        expect(IsPrereleaseVersion('v1.2.0')).toBe(false);
        expect(IsPrereleaseVersion('1.2.0+sha.abc')).toBe(false);
        // Total: junk is not a prerelease rather than a throw, so callers need no guard.
        expect(IsPrereleaseVersion('not-a-version')).toBe(false);
    });
});

describe('tag listing — prerelease sorting and pagination', () => {
    it('sorts prerelease tags below their stable release', async () => {
        mocks.listTags.mockResolvedValueOnce({
            data: [{ name: 'v1.2.0-beta.1' }, { name: 'v1.2.0' }, { name: 'v1.2.0-rc.1' }, { name: 'v1.1.0' }],
        });

        const tags = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(tags).toEqual(['v1.2.0', 'v1.2.0-rc.1', 'v1.2.0-beta.1', 'v1.1.0']);
    });

    it('reads every page of tags — the newest version past the first 100 is not lost', async () => {
        // GitHub returns tags in its own order, so a full first page can hide the newest version.
        const firstPage = Array.from({ length: 100 }, (_, i) => ({ name: `v1.0.${i}` }));
        mocks.listTags
            .mockResolvedValueOnce({ data: firstPage })
            .mockResolvedValueOnce({ data: [{ name: 'v2.0.0' }] });

        const tags = await ListGitHubTags('https://github.com/Acme/App', {});
        expect(mocks.listTags).toHaveBeenCalledTimes(2);
        expect(tags[0]).toBe('v2.0.0');
        expect(tags).toHaveLength(101);
    });

    it('reads every page of releases — a stable release past the first 100 is not lost', async () => {
        const prereleases = Array.from({ length: 100 }, (_, i) => ({
            tag_name: `v1.0.${i}-beta.1`, prerelease: true, draft: false, created_at: '2026-04-20T00:00:00Z',
        }));
        mocks.listReleases
            .mockResolvedValueOnce({ data: prereleases })
            .mockResolvedValueOnce({ data: [{ tag_name: 'v1.0.0', prerelease: false, draft: false, created_at: '2026-01-01T00:00:00Z' }] });

        const releases = await ListGitHubReleases('https://github.com/Acme/App', {});
        expect(mocks.listReleases).toHaveBeenCalledTimes(2);
        expect(releases).toHaveLength(101);
        expect(releases.some(r => !r.PreRelease)).toBe(true);
    });
});

describe('tag listing — one paginated fetch per repository, not per app', () => {
    /**
     * Pagination is required for correctness, but the fetch is per-REPOSITORY while the filtering
     * is per-app. A sweep like `mj app check-updates` over several apps sharing one repo was
     * paying for the whole paginated walk once per app: measured against
     * `MemberJunction/Integrations` (9 installed apps, 4 pages of tags) that is 36 HTTP requests
     * where 4 suffice — and it grows with the repo's tag count on every release.
     */
    const REPO = 'https://github.com/MemberJunction/Integrations';

    function twoPagesOfScopedTags() {
        const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `Filler-App@1.0.${i}` }));
        mocks.listTags
            .mockResolvedValueOnce({ data: page1 })
            .mockResolvedValueOnce({ data: [{ name: 'CRM-HubSpot@1.1.2' }, { name: 'Platform-ORCID@1.2.0' }] });
    }

    it('fetches the repo ONCE across lookups for different apps in it', async () => {
        twoPagesOfScopedTags();

        const hubspot = await ListGitHubTags(REPO, {}, 'CRM/HubSpot');
        const orcid = await ListGitHubTags(REPO, {}, 'Platform/ORCID');

        // Each app still gets its OWN filtered answer...
        expect(hubspot).toEqual(['1.1.2']);
        expect(orcid).toEqual(['1.2.0']);
        // ...from a single 2-page walk, not two.
        expect(mocks.listTags).toHaveBeenCalledTimes(2);
    });

    it('does not serve one token\'s tag list to a caller with a different token', async () => {
        // A private repo's tags fetched with a privileged token must not leak to a caller who
        // did not supply it, so the cache key includes the resolved token.
        mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }] });
        await ListGitHubTags('https://github.com/Acme/Private', { Token: 'privileged' });

        mocks.listTags.mockResolvedValueOnce({ data: [] });
        const anonymous = await ListGitHubTags('https://github.com/Acme/Private', {});

        expect(anonymous).toEqual([]);
        expect(mocks.listTags).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed fetch', async () => {
        // A rate-limited call must not pin an empty answer for the rest of the sweep.
        mocks.listTags.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 403 }));
        await expect(ListGitHubTags('https://github.com/Acme/App', {})).rejects.toThrow();

        mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }] });
        expect(await ListGitHubTags('https://github.com/Acme/App', {})).toEqual(['v1.0.0']);
    });

    it('collapses CONCURRENT lookups into one fetch, not just sequential ones', async () => {
        // The cache used to store the RESOLVED array, so it only helped a caller that awaited between
        // apps. `mj app check-updates` happens to be a sequential for...of, so the win was real -- but
        // it was contingent on a loop shape in a package this one does not own, and a Promise.all
        // refactor there would have silently reverted it with no failing test. Measured before the fix:
        // 9 apps over one 2-page repo cost 18 requests in parallel against 2 sequentially.
        twoPagesOfScopedTags();

        const results = await Promise.all([
            ListGitHubTags(REPO, {}, 'CRM/HubSpot'),
            ListGitHubTags(REPO, {}, 'Platform/ORCID'),
            ListGitHubTags(REPO, {}, 'CRM/HubSpot'),
        ]);

        expect(results[0]).toEqual(['1.1.2']);
        expect(results[1]).toEqual(['1.2.0']);
        // One 2-page walk shared by all three, not three walks.
        expect(mocks.listTags).toHaveBeenCalledTimes(2);
    });

    it('refetches once the TTL has elapsed', async () => {
        // The one cache behavior nothing exercised. Without this, a typo turning 60_000 into
        // 60_000_000 would pin a stale tag list for ~16 hours and no test would notice.
        vi.useFakeTimers();
        try {
            mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }] });
            expect(await ListGitHubTags('https://github.com/Acme/App', {})).toEqual(['v1.0.0']);

            // Still inside the window: served from cache, no second request.
            vi.advanceTimersByTime(59_000);
            expect(await ListGitHubTags('https://github.com/Acme/App', {})).toEqual(['v1.0.0']);
            expect(mocks.listTags).toHaveBeenCalledTimes(1);

            // Past it: a newly pushed tag becomes visible.
            vi.advanceTimersByTime(2_000);
            mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }, { name: 'v1.1.0' }] });
            expect(await ListGitHubTags('https://github.com/Acme/App', {})).toEqual(['v1.1.0', 'v1.0.0']);
            expect(mocks.listTags).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('hands each caller its own array, so an in-place sort cannot corrupt the cache', async () => {
        // Every joiner shares one cached promise; returning the same array would let one caller's
        // mutation change what the others see.
        mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }, { name: 'v2.0.0' }] });
        const first = await ListGitHubTags('https://github.com/Acme/App', {});
        first.reverse();

        expect(await ListGitHubTags('https://github.com/Acme/App', {})).toEqual(['v2.0.0', 'v1.0.0']);
        expect(mocks.listTags).toHaveBeenCalledTimes(1);
    });

    it('ClearGitHubTagCache forces the next lookup to refetch', async () => {
        mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }] });
        await ListGitHubTags('https://github.com/Acme/App', {});

        ClearGitHubTagCache();
        mocks.listTags.mockResolvedValueOnce({ data: [{ name: 'v1.0.0' }, { name: 'v1.1.0' }] });
        const after = await ListGitHubTags('https://github.com/Acme/App', {});

        expect(after).toEqual(['v1.1.0', 'v1.0.0']);
        expect(mocks.listTags).toHaveBeenCalledTimes(2);
    });
});

describe('GetLatestVersion — stable preference on the tag path', () => {
    it('does not offer a prerelease tag as the latest version when a stable tag exists', async () => {
        mocks.listReleases.mockResolvedValueOnce({ data: [] });
        mocks.listTags.mockResolvedValueOnce({
            data: [{ name: 'v1.3.0-beta.1' }, { name: 'v1.2.0' }, { name: 'v1.1.0' }],
        });

        // Matches the releases path, which already filters `!PreRelease && !Draft`.
        expect(await GetLatestVersion('https://github.com/Acme/App', {})).toBe('1.2.0');
    });

    it('falls back to the newest prerelease when nothing stable is tagged', async () => {
        mocks.listReleases.mockResolvedValueOnce({ data: [] });
        mocks.listTags.mockResolvedValueOnce({
            data: [{ name: 'v1.0.0-alpha.1' }, { name: 'v1.0.0-alpha.2' }],
        });

        expect(await GetLatestVersion('https://github.com/Acme/App', {})).toBe('1.0.0-alpha.2');
    });

    it('applies the same stable preference to scoped multi-app tags', async () => {
        mocks.listTags.mockResolvedValueOnce({
            data: [
                { name: 'CRM-HubSpot@2.0.0-rc.1' },
                { name: 'CRM-HubSpot@1.4.1' },
                { name: 'CRM-Salesforce@9.9.9' },
            ],
        });

        const v = await GetLatestVersion('https://github.com/MemberJunction/Integrations/CRM/HubSpot', {});
        expect(v).toBe('1.4.1');
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
