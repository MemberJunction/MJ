/**
 * Unit tests for GitHubSourceControlProvider.
 *
 * All HTTP calls are intercepted by mocking `global.fetch`.
 * SourceControlMetrics is a real singleton; we Reset() it between tests
 * so metric side-effects don't bleed across test cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubSourceControlProvider } from '../providers/github/GitHubSourceControlProvider.js';
import { SourceControlMetrics } from '../SourceControlMetrics.js';
import type { RepoRef, CreatePRInput } from '../interfaces.js';

// ─── Helpers ──────────────────────────────────────────────────────────

const REPO: RepoRef = { Owner: 'MemberJunction', Name: 'MJ' };
const TEST_TOKEN = 'ghp_test_token_abc123';

const resetEpoch = Math.floor(Date.now() / 1000) + 3600;

/** Build a mock Response with standard GitHub rate-limit headers. */
function githubResponse(body: unknown, status = 200, ok = true): Response {
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Not Found',
        headers: new Headers({
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '4999',
            'x-ratelimit-reset': String(resetEpoch),
        }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

/** Build an error Response (404, 403, etc.) */
function githubErrorResponse(status: number, message: string): Response {
    return githubResponse({ message }, status, false);
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('GitHubSourceControlProvider', () => {
    let provider: GitHubSourceControlProvider;
    let mockFetch: ReturnType<typeof vi.fn>;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch;

        provider = new GitHubSourceControlProvider();
        provider.Configure({ Token: TEST_TOKEN });

        SourceControlMetrics.Instance.Reset();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    // ─── Configuration ──────────────────────────────────────────────

    describe('Configure()', () => {
        it('should store the token and include it as a Bearer header in requests', async () => {
            mockFetch.mockResolvedValueOnce(
                githubResponse({ resources: { core: { limit: 5000, remaining: 4999, reset: resetEpoch, used: 1 } } }),
            );

            await provider.GetRateLimit();

            expect(mockFetch).toHaveBeenCalledOnce();
            const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBe(`Bearer ${TEST_TOKEN}`);
        });

        it('should set Accept and API version headers', async () => {
            mockFetch.mockResolvedValueOnce(
                githubResponse({ resources: { core: { limit: 5000, remaining: 4999, reset: resetEpoch, used: 1 } } }),
            );

            await provider.GetRateLimit();

            const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;
            expect(headers['Accept']).toBe('application/vnd.github+json');
            expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
        });
    });

    // ─── Token Resolution ───────────────────────────────────────────

    describe('Token resolution', () => {
        it('should fall back to GITHUB_TOKEN env var when no explicit token is configured', async () => {
            const noTokenProvider = new GitHubSourceControlProvider();
            noTokenProvider.Configure({});

            const originalEnv = process.env.GITHUB_TOKEN;
            process.env.GITHUB_TOKEN = 'env_fallback_token';

            mockFetch.mockResolvedValueOnce(
                githubResponse({ resources: { core: { limit: 5000, remaining: 4999, reset: resetEpoch, used: 1 } } }),
            );

            await noTokenProvider.GetRateLimit();

            const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBe('Bearer env_fallback_token');

            // Restore
            if (originalEnv === undefined) {
                delete process.env.GITHUB_TOKEN;
            } else {
                process.env.GITHUB_TOKEN = originalEnv;
            }
        });

        it('should use TokenEnvVar when provided', async () => {
            const envVarProvider = new GitHubSourceControlProvider();
            envVarProvider.Configure({ TokenEnvVar: 'MY_CUSTOM_GH_TOKEN' });

            const originalEnv = process.env.MY_CUSTOM_GH_TOKEN;
            process.env.MY_CUSTOM_GH_TOKEN = 'custom_env_token';

            mockFetch.mockResolvedValueOnce(
                githubResponse({ resources: { core: { limit: 5000, remaining: 4999, reset: resetEpoch, used: 1 } } }),
            );

            await envVarProvider.GetRateLimit();

            const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBe('Bearer custom_env_token');

            if (originalEnv === undefined) {
                delete process.env.MY_CUSTOM_GH_TOKEN;
            } else {
                process.env.MY_CUSTOM_GH_TOKEN = originalEnv;
            }
        });

        it('should omit Authorization header when no token is available', async () => {
            const noTokenProvider = new GitHubSourceControlProvider();
            noTokenProvider.Configure({});

            const originalEnv = process.env.GITHUB_TOKEN;
            delete process.env.GITHUB_TOKEN;

            mockFetch.mockResolvedValueOnce(
                githubResponse({ resources: { core: { limit: 60, remaining: 59, reset: resetEpoch, used: 1 } } }),
            );

            await noTokenProvider.GetRateLimit();

            const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBeUndefined();

            if (originalEnv !== undefined) {
                process.env.GITHUB_TOKEN = originalEnv;
            }
        });
    });

    // ─── Properties ─────────────────────────────────────────────────

    describe('Properties', () => {
        it('should return "github" for PlatformName', () => {
            expect(provider.PlatformName).toBe('github');
        });

        it('should return the GitHub API base URL for BaseApiUrl', () => {
            expect(provider.BaseApiUrl).toBe('https://api.github.com');
        });
    });

    // ─── Releases ───────────────────────────────────────────────────

    describe('ListReleases()', () => {
        const githubReleases = [
            {
                tag_name: 'v5.14.0',
                name: 'Release 5.14.0',
                prerelease: false,
                draft: false,
                created_at: '2026-03-01T00:00:00Z',
                body: 'Changelog here',
                assets: [
                    { name: 'dist.zip', browser_download_url: 'https://example.com/dist.zip', size: 1024, content_type: 'application/zip' },
                ],
                zipball_url: 'https://api.github.com/repos/MemberJunction/MJ/zipball/v5.14.0',
                tarball_url: 'https://api.github.com/repos/MemberJunction/MJ/tarball/v5.14.0',
            },
            {
                tag_name: 'v5.15.0-beta.1',
                name: 'Beta 5.15.0',
                prerelease: true,
                draft: false,
                created_at: '2026-03-10T00:00:00Z',
                body: 'Beta notes',
                assets: [],
                zipball_url: 'https://api.github.com/repos/MemberJunction/MJ/zipball/v5.15.0-beta.1',
                tarball_url: 'https://api.github.com/repos/MemberJunction/MJ/tarball/v5.15.0-beta.1',
            },
        ];

        it('should map GitHub releases to SCRelease[] and filter pre-releases by default', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse(githubReleases));

            const result = await provider.ListReleases(REPO);

            expect(result.Success).toBe(true);
            expect(result.Data).toHaveLength(1);
            expect(result.Data![0].TagName).toBe('v5.14.0');
            expect(result.Data![0].Name).toBe('Release 5.14.0');
            expect(result.Data![0].PreRelease).toBe(false);
            expect(result.Data![0].Draft).toBe(false);
            expect(result.Data![0].Body).toBe('Changelog here');
            expect(result.Data![0].Assets).toHaveLength(1);
            expect(result.Data![0].Assets[0].Name).toBe('dist.zip');
            expect(result.Data![0].Assets[0].DownloadUrl).toBe('https://example.com/dist.zip');
            expect(result.Data![0].Assets[0].Size).toBe(1024);
            expect(result.Data![0].ZipballUrl).toContain('zipball');
        });

        it('should include pre-releases when IncludePreRelease is true', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse(githubReleases));

            const result = await provider.ListReleases(REPO, { IncludePreRelease: true });

            expect(result.Success).toBe(true);
            expect(result.Data).toHaveLength(2);
            expect(result.Data![1].TagName).toBe('v5.15.0-beta.1');
            expect(result.Data![1].PreRelease).toBe(true);
        });

        it('should pass MaxResults as per_page query parameter', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListReleases(REPO, { MaxResults: 5 });

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('per_page=5');
        });

        it('should use null name fallback to tag_name', async () => {
            const releasesWithNullName = [
                {
                    tag_name: 'v1.0.0',
                    name: null,
                    prerelease: false,
                    draft: false,
                    created_at: '2026-01-01T00:00:00Z',
                    body: null,
                    assets: [],
                    zipball_url: 'https://example.com/zip',
                    tarball_url: 'https://example.com/tar',
                },
            ];
            mockFetch.mockResolvedValueOnce(githubResponse(releasesWithNullName));

            const result = await provider.ListReleases(REPO);

            expect(result.Data![0].Name).toBe('v1.0.0');
            expect(result.Data![0].Body).toBe('');
        });
    });

    describe('GetReleaseByTag()', () => {
        it('should fetch a release by tag and map it correctly', async () => {
            const ghRelease = {
                tag_name: 'v5.14.0',
                name: 'Release 5.14.0',
                prerelease: false,
                draft: false,
                created_at: '2026-03-01T00:00:00Z',
                body: 'Release notes',
                assets: [],
                zipball_url: 'https://example.com/zipball',
                tarball_url: 'https://example.com/tarball',
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghRelease));

            const result = await provider.GetReleaseByTag(REPO, 'v5.14.0');

            expect(result.Success).toBe(true);
            expect(result.Data!.TagName).toBe('v5.14.0');
            expect(result.Data!.Name).toBe('Release 5.14.0');

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('/releases/tags/v5.14.0');
        });
    });

    describe('GetLatestRelease()', () => {
        it('should fetch the latest release from the correct endpoint', async () => {
            const ghRelease = {
                tag_name: 'v5.14.0',
                name: 'Latest',
                prerelease: false,
                draft: false,
                created_at: '2026-03-01T00:00:00Z',
                body: 'Latest release notes',
                assets: [],
                zipball_url: 'https://example.com/zipball',
                tarball_url: 'https://example.com/tarball',
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghRelease));

            const result = await provider.GetLatestRelease(REPO);

            expect(result.Success).toBe(true);
            expect(result.Data!.TagName).toBe('v5.14.0');
            expect(result.Data!.Body).toBe('Latest release notes');

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('/releases/latest');
        });
    });

    // ─── Repository Content ─────────────────────────────────────────

    describe('GetFileContent()', () => {
        it('should decode base64 content from GitHub API response', async () => {
            const fileText = 'Hello, MemberJunction!';
            const base64Content = Buffer.from(fileText).toString('base64');
            const ghFileContent = {
                path: 'README.md',
                content: base64Content,
                sha: 'abc123sha',
                size: fileText.length,
                encoding: 'base64',
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghFileContent));

            const result = await provider.GetFileContent(REPO, 'README.md');

            expect(result.Success).toBe(true);
            expect(result.Data!.Path).toBe('README.md');
            expect(result.Data!.Content).toBe(fileText);
            expect(result.Data!.SHA).toBe('abc123sha');
            expect(result.Data!.Size).toBe(fileText.length);
        });

        it('should pass ref as query parameter when provided', async () => {
            const ghFileContent = {
                path: 'package.json',
                content: Buffer.from('{}').toString('base64'),
                sha: 'def456sha',
                size: 2,
                encoding: 'base64',
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghFileContent));

            await provider.GetFileContent(REPO, 'package.json', 'feature-branch');

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('?ref=feature-branch');
        });

        it('should handle empty content gracefully', async () => {
            const ghFileContent = {
                path: 'empty.txt',
                content: '',
                sha: 'emptysha',
                size: 0,
                encoding: 'base64',
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghFileContent));

            const result = await provider.GetFileContent(REPO, 'empty.txt');

            expect(result.Success).toBe(true);
            expect(result.Data!.Content).toBe('');
        });
    });

    describe('ListDirectory()', () => {
        it('should map GitHub directory entries to SCDirectoryEntry[]', async () => {
            const ghEntries = [
                { name: 'src', path: 'src', type: 'dir', size: 0, download_url: null, sha: 'dir-sha' },
                { name: 'README.md', path: 'README.md', type: 'file', size: 1234, download_url: 'https://raw.githubusercontent.com/README.md', sha: 'file-sha' },
                { name: 'link', path: 'link', type: 'symlink', size: 50, download_url: null, sha: 'link-sha' },
            ];
            mockFetch.mockResolvedValueOnce(githubResponse(ghEntries));

            const result = await provider.ListDirectory(REPO, '.');

            expect(result.Success).toBe(true);
            expect(result.Data).toHaveLength(3);

            expect(result.Data![0].Name).toBe('src');
            expect(result.Data![0].Type).toBe('dir');
            expect(result.Data![0].Size).toBe(0);
            expect(result.Data![0].DownloadUrl).toBeNull();

            expect(result.Data![1].Name).toBe('README.md');
            expect(result.Data![1].Type).toBe('file');
            expect(result.Data![1].Size).toBe(1234);
            expect(result.Data![1].DownloadUrl).toContain('raw.githubusercontent.com');

            expect(result.Data![2].Type).toBe('symlink');
        });

        it('should pass ref as query parameter when provided', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListDirectory(REPO, 'packages', 'v5.14.0');

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('?ref=v5.14.0');
        });
    });

    // ─── Branches ───────────────────────────────────────────────────

    describe('ListBranches()', () => {
        it('should map GitHub branches to SCBranch[]', async () => {
            const ghBranches = [
                { name: 'main', commit: { sha: 'sha-main' }, protected: true },
                { name: 'develop', commit: { sha: 'sha-dev' }, protected: false },
            ];
            mockFetch.mockResolvedValueOnce(githubResponse(ghBranches));

            const result = await provider.ListBranches(REPO);

            expect(result.Success).toBe(true);
            expect(result.Data).toHaveLength(2);
            expect(result.Data![0]).toEqual({ Name: 'main', SHA: 'sha-main', Protected: true });
            expect(result.Data![1]).toEqual({ Name: 'develop', SHA: 'sha-dev', Protected: false });
        });

        it('should pass MaxResults as per_page', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListBranches(REPO, { MaxResults: 10 });

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('per_page=10');
        });
    });

    describe('GetBranch()', () => {
        it('should fetch a single branch by name', async () => {
            const ghBranch = { name: 'feature/test', commit: { sha: 'sha-feature' }, protected: false };
            mockFetch.mockResolvedValueOnce(githubResponse(ghBranch));

            const result = await provider.GetBranch(REPO, 'feature/test');

            expect(result.Success).toBe(true);
            expect(result.Data!.Name).toBe('feature/test');
            expect(result.Data!.SHA).toBe('sha-feature');
            expect(result.Data!.Protected).toBe(false);

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('/branches/feature%2Ftest');
        });
    });

    describe('CreateBranch()', () => {
        it('should POST to git/refs with correct ref and sha', async () => {
            const ghRef = { ref: 'refs/heads/new-branch', object: { sha: 'sha-new' } };
            mockFetch.mockResolvedValueOnce(githubResponse(ghRef, 201));

            const result = await provider.CreateBranch(REPO, 'new-branch', 'sha-source');

            expect(result.Success).toBe(true);
            expect(result.Data!.Name).toBe('new-branch');
            expect(result.Data!.SHA).toBe('sha-new');
            expect(result.Data!.Protected).toBe(false);

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('/git/refs');
            expect(init.method).toBe('POST');
            const body = JSON.parse(init.body as string) as { ref: string; sha: string };
            expect(body.ref).toBe('refs/heads/new-branch');
            expect(body.sha).toBe('sha-source');
        });
    });

    // ─── Pull Requests ──────────────────────────────────────────────

    describe('CreatePullRequest()', () => {
        it('should POST to /pulls with correct body', async () => {
            const ghPR = {
                number: 42,
                title: 'My PR',
                body: 'Description',
                state: 'open',
                head: { ref: 'feature/x' },
                base: { ref: 'main' },
                html_url: 'https://github.com/MemberJunction/MJ/pull/42',
                created_at: '2026-03-15T12:00:00Z',
                merged_at: null,
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghPR, 201));

            const input: CreatePRInput = {
                Title: 'My PR',
                Body: 'Description',
                HeadBranch: 'feature/x',
                BaseBranch: 'main',
                Draft: true,
            };

            const result = await provider.CreatePullRequest(REPO, input);

            expect(result.Success).toBe(true);
            expect(result.Data!.Number).toBe(42);
            expect(result.Data!.Title).toBe('My PR');
            expect(result.Data!.State).toBe('open');
            expect(result.Data!.HeadBranch).toBe('feature/x');
            expect(result.Data!.BaseBranch).toBe('main');
            expect(result.Data!.HtmlUrl).toContain('/pull/42');

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('/pulls');
            expect(init.method).toBe('POST');
            const body = JSON.parse(init.body as string) as { title: string; body: string; head: string; base: string; draft: boolean };
            expect(body.title).toBe('My PR');
            expect(body.body).toBe('Description');
            expect(body.head).toBe('feature/x');
            expect(body.base).toBe('main');
            expect(body.draft).toBe(true);
        });

        it('should default draft to false when not specified', async () => {
            const ghPR = {
                number: 43,
                title: 'Non-draft',
                body: '',
                state: 'open',
                head: { ref: 'feature/y' },
                base: { ref: 'main' },
                html_url: 'https://github.com/MemberJunction/MJ/pull/43',
                created_at: '2026-03-15T12:00:00Z',
                merged_at: null,
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghPR, 201));

            const input: CreatePRInput = {
                Title: 'Non-draft',
                Body: '',
                HeadBranch: 'feature/y',
                BaseBranch: 'main',
            };

            await provider.CreatePullRequest(REPO, input);

            const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            const body = JSON.parse(init.body as string) as { draft: boolean };
            expect(body.draft).toBe(false);
        });
    });

    describe('GetPullRequest()', () => {
        it('should fetch a single PR by number', async () => {
            const ghPR = {
                number: 100,
                title: 'Fix bug',
                body: 'Fixes issue #99',
                state: 'open',
                head: { ref: 'fix/99' },
                base: { ref: 'main' },
                html_url: 'https://github.com/MemberJunction/MJ/pull/100',
                created_at: '2026-03-10T00:00:00Z',
                merged_at: null,
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghPR));

            const result = await provider.GetPullRequest(REPO, 100);

            expect(result.Success).toBe(true);
            expect(result.Data!.Number).toBe(100);
            expect(result.Data!.Title).toBe('Fix bug');
            expect(result.Data!.Body).toBe('Fixes issue #99');

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('/pulls/100');
        });

        it('should map merged PRs to State = "merged"', async () => {
            const ghPR = {
                number: 50,
                title: 'Merged PR',
                body: '',
                state: 'closed',
                head: { ref: 'feature/merged' },
                base: { ref: 'main' },
                html_url: 'https://github.com/MemberJunction/MJ/pull/50',
                created_at: '2026-02-01T00:00:00Z',
                merged_at: '2026-02-05T00:00:00Z',
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghPR));

            const result = await provider.GetPullRequest(REPO, 50);

            expect(result.Data!.State).toBe('merged');
        });

        it('should map closed non-merged PRs to State = "closed"', async () => {
            const ghPR = {
                number: 51,
                title: 'Closed PR',
                body: '',
                state: 'closed',
                head: { ref: 'feature/closed' },
                base: { ref: 'main' },
                html_url: 'https://github.com/MemberJunction/MJ/pull/51',
                created_at: '2026-02-01T00:00:00Z',
                merged_at: null,
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghPR));

            const result = await provider.GetPullRequest(REPO, 51);

            expect(result.Data!.State).toBe('closed');
        });
    });

    describe('ListPullRequests()', () => {
        it('should map GitHub PRs to SCPullRequest[] array', async () => {
            const ghPRs = [
                {
                    number: 10,
                    title: 'PR One',
                    body: 'First',
                    state: 'open',
                    head: { ref: 'branch-1' },
                    base: { ref: 'main' },
                    html_url: 'https://github.com/MemberJunction/MJ/pull/10',
                    created_at: '2026-03-01T00:00:00Z',
                    merged_at: null,
                },
                {
                    number: 11,
                    title: 'PR Two',
                    body: 'Second',
                    state: 'open',
                    head: { ref: 'branch-2' },
                    base: { ref: 'main' },
                    html_url: 'https://github.com/MemberJunction/MJ/pull/11',
                    created_at: '2026-03-02T00:00:00Z',
                    merged_at: null,
                },
            ];
            mockFetch.mockResolvedValueOnce(githubResponse(ghPRs));

            const result = await provider.ListPullRequests(REPO);

            expect(result.Success).toBe(true);
            expect(result.Data).toHaveLength(2);
            expect(result.Data![0].Number).toBe(10);
            expect(result.Data![1].Number).toBe(11);
        });

        it('should pass state filter as query parameter', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListPullRequests(REPO, { State: 'closed' });

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('state=closed');
        });

        it('should pass head filter as query parameter', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListPullRequests(REPO, { Head: 'feature/xyz' });

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('head=feature%2Fxyz');
        });

        it('should omit query string when no options are provided', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListPullRequests(REPO);

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toMatch(/\/pulls$/);
        });
    });

    // ─── Rate Limit ─────────────────────────────────────────────────

    describe('GetRateLimit()', () => {
        it('should fetch and map the rate limit response', async () => {
            const resetTimestamp = Math.floor(Date.now() / 1000) + 7200;
            const ghRateLimit = {
                resources: {
                    core: {
                        limit: 5000,
                        remaining: 4500,
                        reset: resetTimestamp,
                        used: 500,
                    },
                },
            };
            mockFetch.mockResolvedValueOnce(githubResponse(ghRateLimit));

            const result = await provider.GetRateLimit();

            expect(result.Success).toBe(true);
            expect(result.Data!.Limit).toBe(5000);
            expect(result.Data!.Remaining).toBe(4500);
            expect(result.Data!.ResetAt).toEqual(new Date(resetTimestamp * 1000));
        });

        it('should call the /rate_limit endpoint', async () => {
            mockFetch.mockResolvedValueOnce(
                githubResponse({ resources: { core: { limit: 5000, remaining: 4999, reset: resetEpoch, used: 1 } } }),
            );

            await provider.GetRateLimit();

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toBe('https://api.github.com/rate_limit');
        });
    });

    // ─── Rate Limit Headers ─────────────────────────────────────────

    describe('Rate limit headers extraction', () => {
        it('should extract rate limit info from response headers', async () => {
            const ghBranches = [{ name: 'main', commit: { sha: 'sha1' }, protected: false }];
            mockFetch.mockResolvedValueOnce(githubResponse(ghBranches));

            const result = await provider.ListBranches(REPO);

            expect(result.RateLimit).toBeDefined();
            expect(result.RateLimit!.Limit).toBe(5000);
            expect(result.RateLimit!.Remaining).toBe(4999);
            expect(result.RateLimit!.ResetAt).toEqual(new Date(resetEpoch * 1000));
        });

        it('should return undefined RateLimit when headers are missing', async () => {
            const response = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Headers({}),
                json: async () => [],
            } as unknown as Response;
            mockFetch.mockResolvedValueOnce(response);

            const result = await provider.ListBranches(REPO);

            expect(result.Success).toBe(true);
            expect(result.RateLimit).toBeUndefined();
        });
    });

    // ─── Error Handling ─────────────────────────────────────────────

    describe('Error handling', () => {
        it('should return Success = false with error message on 404', async () => {
            mockFetch.mockResolvedValueOnce(githubErrorResponse(404, 'Not Found'));

            const result = await provider.GetReleaseByTag(REPO, 'nonexistent');

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('Not Found');
            expect(result.StatusCode).toBe(404);
            expect(result.Data).toBeUndefined();
        });

        it('should return Success = false on 403 Forbidden', async () => {
            mockFetch.mockResolvedValueOnce(
                githubErrorResponse(403, 'API rate limit exceeded'),
            );

            const result = await provider.ListReleases(REPO);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('API rate limit exceeded');
            expect(result.StatusCode).toBe(403);
        });

        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

            const result = await provider.ListBranches(REPO);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('fetch failed: ECONNREFUSED');
            expect(result.StatusCode).toBeUndefined();
        });

        it('should handle non-Error thrown values', async () => {
            mockFetch.mockRejectedValueOnce('string error');

            const result = await provider.GetBranch(REPO, 'main');

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('string error');
        });

        it('should handle unparseable error response bodies', async () => {
            const response = {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers({
                    'x-ratelimit-limit': '5000',
                    'x-ratelimit-remaining': '4998',
                    'x-ratelimit-reset': String(resetEpoch),
                }),
                json: async () => { throw new Error('Invalid JSON'); },
            } as unknown as Response;
            mockFetch.mockResolvedValueOnce(response);

            const result = await provider.GetLatestRelease(REPO);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('HTTP 500 Internal Server Error');
            expect(result.StatusCode).toBe(500);
        });

        it('should forward errors correctly for list operations', async () => {
            mockFetch.mockResolvedValueOnce(githubErrorResponse(404, 'Not Found'));

            const result = await provider.ListDirectory(REPO, 'nonexistent/path');

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('Not Found');
            expect(result.Data).toBeUndefined();
        });
    });

    // ─── URL Construction ───────────────────────────────────────────

    describe('URL construction', () => {
        it('should encode Owner and Name in repo URLs', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            const repoWithSpecialChars: RepoRef = { Owner: 'org name', Name: 'repo name' };
            await provider.ListBranches(repoWithSpecialChars);

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toContain('/repos/org%20name/repo%20name/');
        });

        it('should construct correct repo-scoped URLs', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListReleases(REPO);

            const [url] = mockFetch.mock.calls[0] as [string];
            expect(url).toBe('https://api.github.com/repos/MemberJunction/MJ/releases?per_page=30');
        });
    });

    // ─── Metrics Recording ──────────────────────────────────────────

    describe('Metrics recording', () => {
        it('should record API calls to SourceControlMetrics', async () => {
            mockFetch.mockResolvedValueOnce(githubResponse([]));

            await provider.ListBranches(REPO);

            const summary = SourceControlMetrics.Instance.GetSummary();
            expect(summary.TotalAPICalls).toBe(1);
            expect(summary.CallsByPlatform['github']).toBe(1);
        });

        it('should record failed API calls to metrics', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await provider.ListReleases(REPO);

            const summary = SourceControlMetrics.Instance.GetSummary();
            expect(summary.TotalAPICalls).toBe(1);
        });
    });
});
