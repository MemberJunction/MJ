import * as crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    BuildGitHubAppJwt,
    ClearGitHubInstallationTokenCache,
    INSTALLATION_TOKEN_CACHE_GLOBAL_KEY,
    IsRepositoryAllowed,
    MintGitHubInstallationToken,
    ParseAllowedRepositories,
    ParseGitHubRepository,
    ResolveInstallationRepositoryScope,
} from '../custom/github/github-app-auth';
import {
    GitHubPolicyError,
    GitHubRestClient,
} from '../custom/github/github-client';
import type { GitHubResolvedAuth } from '../custom/github/github-types';


const TEST_KEY_PAIR = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function createTestAuth(overrides: Partial<GitHubResolvedAuth> = {}): GitHubResolvedAuth {
    return {
        Token: 'ghs_test_token_123',
        Source: 'credential',
        AuthKind: 'github-app',
        DefaultOwner: 'MemberJunction',
        AllowedRepositories: ['MemberJunction/*'],
        AllowMerge: false,
        DefaultPRMode: 'draft',
        ApiBaseUrl: 'https://api.github.com',
        ...overrides,
    };
}

describe('GitHub App Auth & Repository Policy Helpers', () => {
    beforeEach(() => {
        ClearGitHubInstallationTokenCache();
    });

    it('builds a valid RS256 JWT verifiable with the RSA public key', () => {
        const escapedKey = TEST_KEY_PAIR.privateKey.replace(/\n/g, '\\n');
        const jwt = BuildGitHubAppJwt('98765', escapedKey, 1_700_000_000);
        const parts = jwt.split('.');
        expect(parts).toHaveLength(3);

        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
        expect(payload).toEqual({
            iat: 1_700_000_000 - 60,
            exp: 1_700_000_000 + 540,
            iss: '98765',
        });

        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(`${parts[0]}.${parts[1]}`);
        verifier.end();
        expect(verifier.verify(TEST_KEY_PAIR.publicKey, parts[2], 'base64url')).toBe(true);
    });

    it('mints and caches a short-lived GitHub App installation token', async () => {
        let callCount = 0;
        const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
            callCount++;
            expect(String(url)).toBe('https://api.github.com/app/installations/445566/access_tokens');
            expect(init?.method).toBe('POST');
            const body = JSON.parse(String(init?.body ?? '{}'));
            expect(body.repositories).toEqual(['MJ']);
            return new Response(
                JSON.stringify({
                    token: 'ghs_minted_installation_token',
                    expires_at: new Date(Date.now() + 3600_000).toISOString(),
                }),
                { status: 201 }
            );
        }) as typeof fetch;

        const first = await MintGitHubInstallationToken(
            {
                AppId: '12345',
                InstallationId: '445566',
                PrivateKey: TEST_KEY_PAIR.privateKey,
            },
            {
                Repositories: ['MJ'],
                Permissions: { contents: 'write', pull_requests: 'write' },
                FetchImpl: mockFetch,
            }
        );
        const second = await MintGitHubInstallationToken(
            {
                AppId: '12345',
                InstallationId: '445566',
                PrivateKey: TEST_KEY_PAIR.privateKey,
            },
            {
                Repositories: ['MJ'],
                Permissions: { contents: 'write', pull_requests: 'write' },
                FetchImpl: mockFetch,
            }
        );

        expect(first).toBe('ghs_minted_installation_token');
        expect(second).toBe('ghs_minted_installation_token');
        expect(callCount).toBe(1);

        const globalCache = GetGlobalObjectStore()?.[INSTALLATION_TOKEN_CACHE_GLOBAL_KEY] as Map<string, unknown> | undefined;
        expect(globalCache).toBeInstanceOf(Map);
        expect(globalCache?.size).toBe(1);
    });

    it('normalizes ApiBaseUrl in the global installation token cache while isolating distinct GitHub hosts', async () => {
        const urlsCalled: string[] = [];
        const mockFetch = (async (url: string | URL | Request) => {
            const urlStr = String(url);
            urlsCalled.push(urlStr);
            const hostTag = urlStr.toLowerCase().includes('ghe.example.com') ? 'ghe' : 'dotcom';
            return new Response(
                JSON.stringify({
                    token: `ghs_${hostTag}_${urlsCalled.length}`,
                    expires_at: new Date(Date.now() + 3600_000).toISOString(),
                }),
                { status: 201 }
            );
        }) as typeof fetch;

        const gheToken1 = await MintGitHubInstallationToken(
            {
                AppId: '12345',
                InstallationId: '445566',
                PrivateKey: TEST_KEY_PAIR.privateKey,
                ApiBaseUrl: 'https://GHE.Example.com/api/v3///',
            },
            { FetchImpl: mockFetch }
        );
        const gheToken2 = await MintGitHubInstallationToken(
            {
                AppId: '12345',
                InstallationId: '445566',
                PrivateKey: TEST_KEY_PAIR.privateKey,
                ApiBaseUrl: 'https://ghe.example.com/api/v3',
            },
            { FetchImpl: mockFetch }
        );
        const dotcomToken = await MintGitHubInstallationToken(
            {
                AppId: '12345',
                InstallationId: '445566',
                PrivateKey: TEST_KEY_PAIR.privateKey,
            },
            { FetchImpl: mockFetch }
        );

        expect(gheToken1).toBe('ghs_ghe_1');
        expect(gheToken2).toBe('ghs_ghe_1');
        expect(dotcomToken).toBe('ghs_dotcom_2');
        expect(urlsCalled).toEqual([
            'https://GHE.Example.com/api/v3/app/installations/445566/access_tokens',
            'https://api.github.com/app/installations/445566/access_tokens',
        ]);
    });

    it('parses GitHub repository coordinates from owner/repo, URLs, and defaultOwner', () => {
        expect(ParseGitHubRepository('MemberJunction/MJ')).toEqual({
            Owner: 'MemberJunction',
            Repo: 'MJ',
        });
        expect(
            ParseGitHubRepository('https://github.com/MemberJunction/MJ/blob/next/packages/Core/src/index.ts')
        ).toEqual({
            Owner: 'MemberJunction',
            Repo: 'MJ',
            Subpath: 'packages/Core/src/index.ts',
        });
        expect(ParseGitHubRepository('MJ', 'MemberJunction')).toEqual({
            Owner: 'MemberJunction',
            Repo: 'MJ',
        });
    });

    it('enforces repository allowlists with exact and wildcard patterns', () => {
        const allowlist = ParseAllowedRepositories('MemberJunction/*, BlueCypress/Skip-Client-Open-App');
        expect(IsRepositoryAllowed('MemberJunction', 'MJ', allowlist)).toBe(true);
        expect(IsRepositoryAllowed('memberjunction', 'forge', allowlist)).toBe(true);
        expect(IsRepositoryAllowed('BlueCypress', 'Skip-Client-Open-App', allowlist)).toBe(true);
        expect(IsRepositoryAllowed('BlueCypress', 'OtherRepo', allowlist)).toBe(false);
        expect(
            ResolveInstallationRepositoryScope({ owner: 'MemberJunction', repo: 'MJ' }, allowlist)
        ).toEqual(['MJ']);
    });
});

describe('GitHubRestClient Policy Guardrails & Atomic Git Data API Commits', () => {
    it('blocks repositories outside AllowedRepositories', async () => {
        const client = new GitHubRestClient(
            createTestAuth({ AllowedRepositories: ['MemberJunction/MJ'] })
        );
        await expect(client.GetRepositoryContext('OtherOrg', 'SecretRepo')).rejects.toThrowError(
            GitHubPolicyError
        );
    });

    it('blocks direct commits to protected branches (main, next, or repo default_branch)', async () => {
        const mockFetch = (async () =>
            new Response(JSON.stringify({ default_branch: 'develop' }), { status: 200 })) as typeof fetch;

        const client = new GitHubRestClient(createTestAuth(), { FetchImpl: mockFetch });

        // Standard protected branch 'next'
        await expect(
            client.CommitFiles({
                Owner: 'MemberJunction',
                Repo: 'MJ',
                Branch: 'next',
                Message: 'Direct commit to next',
                Files: [{ path: 'README.md', content: '# Hi' }],
            })
        ).rejects.toMatchObject({
            name: 'GitHubPolicyError',
            PolicyCode: 'PROTECTED_BRANCH',
        });

        // Repo custom default branch 'develop'
        await expect(
            client.CommitFiles({
                Owner: 'MemberJunction',
                Repo: 'MJ',
                Branch: 'develop',
                Message: 'Direct commit to develop',
                Files: [{ path: 'README.md', content: '# Hi' }],
            })
        ).rejects.toMatchObject({
            name: 'GitHubPolicyError',
            PolicyCode: 'PROTECTED_BRANCH',
        });
    });

    it('enforces app-token-never-merges policy unless AllowMerge is true', async () => {
        const noMergeClient = new GitHubRestClient(createTestAuth({ AllowMerge: false }));
        await expect(
            noMergeClient.MergePullRequest({
                Owner: 'MemberJunction',
                Repo: 'MJ',
                PullNumber: 101,
            })
        ).rejects.toMatchObject({
            name: 'GitHubPolicyError',
            PolicyCode: 'MERGE_NOT_ALLOWED',
        });

        const mergeAllowedClient = new GitHubRestClient(createTestAuth({ AllowMerge: true }), {
            FetchImpl: (async () =>
                new Response(
                    JSON.stringify({ merged: true, sha: 'merged_sha_999', message: 'Pull Request successfully merged' }),
                    { status: 200 }
                )) as typeof fetch,
        });
        const merged = await mergeAllowedClient.MergePullRequest({
            Owner: 'MemberJunction',
            Repo: 'MJ',
            PullNumber: 101,
        });
        expect(merged.Merged).toBe(true);
        expect(merged.Sha).toBe('merged_sha_999');
    });

    it('executes an atomic multi-file commit and opens a draft PR via CommitFilesAndCreatePR', async () => {
        const calls: Array<{ method: string; url: string; body?: unknown }> = [];
        const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? 'GET';
            const body = init?.body ? JSON.parse(String(init.body)) : undefined;
            calls.push({ method, url, body });

            if (method === 'GET' && url.endsWith('/repos/MemberJunction/MJ')) {
                return new Response(JSON.stringify({ default_branch: 'next' }), { status: 200 });
            }
            if (method === 'GET' && url.endsWith('/git/ref/heads/agent%2Fgithub-integration')) {
                return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
            }
            if (method === 'GET' && url.endsWith('/git/ref/heads/next')) {
                return new Response(JSON.stringify({ object: { sha: 'base_commit_sha_1' } }), { status: 200 });
            }
            if (method === 'POST' && url.endsWith('/git/refs')) {
                return new Response(JSON.stringify({ ref: 'refs/heads/agent/github-integration' }), { status: 201 });
            }
            if (method === 'GET' && url.endsWith('/git/commits/base_commit_sha_1')) {
                return new Response(JSON.stringify({ tree: { sha: 'base_tree_sha_1' } }), { status: 200 });
            }
            if (method === 'POST' && url.endsWith('/git/trees')) {
                return new Response(JSON.stringify({ sha: 'new_tree_sha_2' }), { status: 201 });
            }
            if (method === 'POST' && url.endsWith('/git/commits')) {
                return new Response(
                    JSON.stringify({
                        sha: 'new_commit_sha_3',
                        html_url: 'https://github.com/MemberJunction/MJ/commit/new_commit_sha_3',
                    }),
                    { status: 201 }
                );
            }
            if (method === 'PATCH' && url.endsWith('/git/refs/heads/agent%2Fgithub-integration')) {
                return new Response(JSON.stringify({ object: { sha: 'new_commit_sha_3' } }), { status: 200 });
            }
            if (method === 'GET' && url.includes('/pulls?state=open')) {
                return new Response(JSON.stringify([]), { status: 200 });
            }
            if (method === 'POST' && url.endsWith('/pulls')) {
                return new Response(
                    JSON.stringify({
                        number: 420,
                        title: body.title,
                        state: 'open',
                        draft: body.draft,
                        html_url: 'https://github.com/MemberJunction/MJ/pull/420',
                        head: { ref: body.head, sha: 'new_commit_sha_3' },
                        base: { ref: body.base },
                        created_at: '2026-11-05T14:00:00Z',
                        updated_at: '2026-11-05T14:00:00Z',
                    }),
                    { status: 201 }
                );
            }
            return new Response(JSON.stringify({}), { status: 200 });
        }) as typeof fetch;

        const client = new GitHubRestClient(createTestAuth(), { FetchImpl: mockFetch });
        const result = await client.CommitFilesAndCreatePR({
            Commit: {
                Owner: 'MemberJunction',
                Repo: 'MJ',
                Branch: 'agent/github-integration',
                Message: 'feat(github): add first-class GitHub integration',
                Files: [
                    { path: 'src/new-file.ts', content: 'export const x = 1;\n' },
                    { path: 'src/obsolete.ts', delete: true },
                ],
            },
            PRTitle: 'feat(github): add first-class GitHub integration',
            PRBody: 'Implements atomic multi-file commits and PR creation.',
            Labels: ['enhancement'],
        });

        expect(result.CreatedNewPR).toBe(true);
        expect(result.CommitResult.CommitSha).toBe('new_commit_sha_3');
        expect(result.CommitResult.FilesCommitted).toBe(2);
        expect(result.PullRequest.Number).toBe(420);
        expect(result.PullRequest.Draft).toBe(true); // DefaultPRMode: 'draft'

        const treeCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/trees'));
        expect(treeCall?.body).toEqual({
            base_tree: 'base_tree_sha_1',
            tree: [
                { path: 'src/new-file.ts', mode: '100644', type: 'blob', content: 'export const x = 1;\n' },
                { path: 'src/obsolete.ts', mode: '100644', type: 'blob', sha: null },
            ],
        });
    });

    it('retries transient 502 and 429 responses automatically with backoff', async () => {
        let attempts = 0;
        const mockFetch = (async () => {
            attempts++;
            if (attempts === 1) {
                return new Response('Bad Gateway', { status: 502 });
            }
            if (attempts === 2) {
                return new Response('Rate limit', { status: 429, headers: { 'retry-after': '0' } });
            }
            return new Response(
                JSON.stringify({
                    id: 1,
                    number: 55,
                    title: 'Fix retry',
                    state: 'open',
                    html_url: 'https://github.com/MemberJunction/MJ/issues/55',
                }),
                { status: 201 }
            );
        }) as typeof fetch;

        const client = new GitHubRestClient(createTestAuth(), {
            FetchImpl: mockFetch,
            BaseRetryDelayMs: 1,
        });
        const issue = await client.CreateOrUpdateIssue({
            Owner: 'MemberJunction',
            Repo: 'MJ',
            Title: 'Fix retry',
        });
        expect(issue.Number).toBe(55);
        expect(attempts).toBe(3);
    });
});
