/**
 * @fileoverview GitHub App RS256 JWT signing, scoped installation token minting,
 * token caching, and repository allowlist / URL parsing utilities.
 *
 * Uses Node's built-in `node:crypto` and `fetch` — zero external dependencies.
 * Consolidates and extends the patterns from `@memberjunction/schema-engine`'s
 * `GitHubAppAuth.ts` and `@memberjunction/open-app-engine`'s `ParseGitHubUrl`.
 *
 * @module @memberjunction/core-actions/github
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { GitHubInstallationPermissions, GitHubRepoCoordinate } from './github-types.js';

/**
 * Credentials required to authenticate as a GitHub App installation.
 */
export interface GitHubAppAuthConfig {
    AppId: string;
    InstallationId: string;
    /** RSA private key in PEM format. */
    PrivateKey: string;
    /** GitHub REST API base URL (defaults to `'https://api.github.com'`). */
    ApiBaseUrl?: string;
}

/**
 * Default permissions requested for write-capable agent operations when none are specified.
 */
export const DEFAULT_GITHUB_WRITE_PERMISSIONS: Readonly<GitHubInstallationPermissions> = Object.freeze({
    contents: 'write',
    pull_requests: 'write',
    issues: 'write',
    actions: 'read',
    metadata: 'read',
});

/**
 * Default permissions requested for read-only agent operations.
 */
export const DEFAULT_GITHUB_READ_PERMISSIONS: Readonly<GitHubInstallationPermissions> = Object.freeze({
    contents: 'read',
    pull_requests: 'read',
    issues: 'read',
    actions: 'read',
    metadata: 'read',
});

/**
 * Normalizes an RSA PEM private key string.
 * Turns literal `\n` two-character sequences (common when keys are stored in env vars
 * or JSON form fields) back into real newlines.
 */
export function NormalizePrivateKey(rawKey: string | null | undefined): string | null {
    if (!rawKey || !rawKey.trim()) {
        return null;
    }
    return rawKey.trim().replace(/\\n/g, '\n');
}

/**
 * Reads GitHub App credentials from process environment variables
 * (`GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY_PATH` or `GITHUB_APP_PRIVATE_KEY`).
 */
export function ReadGitHubAppFromEnv(env: NodeJS.ProcessEnv = process.env): GitHubAppAuthConfig | null {
    const appId = (env.GITHUB_APP_ID ?? '').trim();
    const installationId = (env.GITHUB_APP_INSTALLATION_ID ?? '').trim();
    if (!appId || !installationId) {
        return null;
    }

    let privateKey: string | null = null;
    const keyPath = (env.GITHUB_APP_PRIVATE_KEY_PATH ?? '').trim();
    if (keyPath) {
        const resolved = keyPath.startsWith('~/') ? resolve(homedir(), keyPath.slice(2)) : resolve(keyPath);
        try {
            privateKey = NormalizePrivateKey(readFileSync(resolved, 'utf-8'));
        } catch {
            privateKey = null;
        }
    }
    if (!privateKey) {
        privateKey = NormalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY);
    }
    if (!privateKey) {
        return null;
    }

    return {
        AppId: appId,
        InstallationId: installationId,
        PrivateKey: privateKey,
        ApiBaseUrl: (env.GITHUB_API_URL ?? 'https://api.github.com').trim(),
    };
}

function base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
}

/**
 * Removes trailing `/` characters in linear $O(n)$ time (avoids polynomial ReDoS on `/\/+$/`).
 */
export function TrimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47 /* / */) {
        end--;
    }
    return end === value.length ? value : value.slice(0, end);
}

/**
 * Removes leading and trailing `/` characters in linear $O(n)$ time (avoids polynomial ReDoS on `/^\/+|\/+$/g`).
 */
export function TrimSlashes(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && value.charCodeAt(start) === 47 /* / */) start++;
    while (end > start && value.charCodeAt(end - 1) === 47 /* / */) end--;
    return start === 0 && end === value.length ? value : value.slice(start, end);
}

/**
 * Builds a short-lived RS256 JWT assertion for a GitHub App.
 *
 * Issued 60 seconds in the past to absorb clock skew behind GitHub's servers, and
 * expiring 9 minutes from `nowSeconds` (inside GitHub's 10-minute maximum).
 */
export function BuildGitHubAppJwt(
    appId: string,
    privateKeyPem: string,
    nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
    const normalizedKey = NormalizePrivateKey(privateKeyPem);
    if (!normalizedKey) {
        throw new Error('GitHub App private key is empty or invalid.');
    }
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(
        JSON.stringify({
            iat: nowSeconds - 60,
            exp: nowSeconds + 540,
            iss: appId,
        }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = base64url(signer.sign(normalizedKey));
    return `${header}.${payload}.${signature}`;
}

/**
 * Options for minting an installation access token.
 */
export interface MintInstallationTokenOptions {
    /** Optional list of repository names (without owner prefix, e.g. `['MJ', 'Integrations']`) to scope the token to. */
    Repositories?: string[];
    /** Optional granular permissions to request on the minted token. */
    Permissions?: GitHubInstallationPermissions;
    /** Injectable `fetch` implementation for deterministic unit testing. */
    FetchImpl?: typeof fetch;
    /** Injectable clock in seconds for deterministic JWT signing. */
    NowSeconds?: number;
    /** Bypass the in-memory token cache and force a fresh mint. */
    SkipCache?: boolean;
}

interface CachedInstallationToken {
    token: string;
    expiresAtMs: number;
}

/**
 * 50-minute cache TTL for installation tokens (GitHub installation tokens are valid for 60 minutes).
 */
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;
const installationTokenCache = new Map<string, CachedInstallationToken>();

function buildTokenCacheKey(
    config: GitHubAppAuthConfig,
    repos: string[] | undefined,
    permissions: GitHubInstallationPermissions | undefined,
): string {
    const repoPart = repos && repos.length > 0 ? [...repos].sort().join(',') : '*';
    const permPart = permissions
        ? Object.entries(permissions)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => `${k}:${v}`)
              .join(',')
        : '*';
    return `${config.ApiBaseUrl ?? 'https://api.github.com'}|${config.AppId}|${config.InstallationId}|${repoPart}|${permPart}`;
}

/**
 * Clears the in-memory installation token cache (used in tests and credential rotation).
 */
export function ClearGitHubInstallationTokenCache(): void {
    installationTokenCache.clear();
}

/**
 * Exchanges a GitHub App JWT for an installation access token, optionally scoped to
 * specific repositories and least-privilege permissions.
 */
export async function MintGitHubInstallationToken(
    config: GitHubAppAuthConfig,
    options?: MintInstallationTokenOptions,
): Promise<string> {
    const cacheKey = buildTokenCacheKey(config, options?.Repositories, options?.Permissions);
    const nowMs = options?.NowSeconds !== undefined ? options.NowSeconds * 1000 : Date.now();

    if (!options?.SkipCache) {
        const cached = installationTokenCache.get(cacheKey);
        if (cached && cached.expiresAtMs > nowMs) {
            return cached.token;
        }
    }

    const jwt = BuildGitHubAppJwt(config.AppId, config.PrivateKey, options?.NowSeconds);
    const baseUrl = TrimTrailingSlashes(config.ApiBaseUrl ?? 'https://api.github.com');
    const url = `${baseUrl}/app/installations/${encodeURIComponent(config.InstallationId)}/access_tokens`;

    const bodyPayload: Record<string, unknown> = {};
    if (options?.Repositories && options.Repositories.length > 0) {
        bodyPayload.repositories = options.Repositories;
    }
    if (options?.Permissions && Object.keys(options.Permissions).length > 0) {
        bodyPayload.permissions = options.Permissions;
    }

    const fetchFn = options?.FetchImpl ?? fetch;
    const response = await fetchFn(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'MemberJunction-GitHub-Integration',
            'Content-Type': 'application/json',
        },
        body: Object.keys(bodyPayload).length > 0 ? JSON.stringify(bodyPayload) : undefined,
    });

    if (!response.ok) {
        let detail = '';
        try {
            const text = await response.text();
            const parsed = JSON.parse(text) as { message?: string };
            detail = parsed.message ?? text.slice(0, 200);
        } catch {
            /* ignore parse error */
        }
        throw new Error(
            `GitHub App installation ${config.InstallationId} token exchange failed with HTTP ${response.status}` +
                (detail ? `: ${detail}` : ''),
        );
    }

    const data = (await response.json()) as { token?: string; expires_at?: string };
    if (!data?.token) {
        throw new Error(
            `GitHub App installation ${config.InstallationId} returned no access token.`,
        );
    }

    installationTokenCache.set(cacheKey, {
        token: data.token,
        expiresAtMs: nowMs + TOKEN_CACHE_TTL_MS,
    });

    return data.token;
}

/**
 * Parses a comma- or whitespace-separated allowlist string (e.g., `"MemberJunction/*, BlueCypress/Skip-Client-Open-App"`)
 * into normalized pattern strings.
 */
export function ParseAllowedRepositories(raw: string | null | undefined): string[] {
    if (!raw || !raw.trim()) {
        return [];
    }
    return raw
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Checks whether `owner/repo` is permitted by the given `allowedRepositories` patterns.
 *
 * Supports:
 * - Empty / undefined list → allowed (`true`)
 * - `*` (wildcard all) → allowed (`true`)
 * - `owner/<wildcard>` → matches any repository under `owner` (case-insensitive)
 * - `owner/repo` → exact match (case-insensitive)
 * - `repo` (no slash) → matches repository name regardless of owner (case-insensitive)
 */
export function IsRepositoryAllowed(
    owner: string,
    repo: string,
    allowedRepositories: string[] | undefined,
): boolean {
    if (!allowedRepositories || allowedRepositories.length === 0) {
        return true;
    }
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedRepo = repo.trim().toLowerCase();
    const full = `${normalizedOwner}/${normalizedRepo}`;

    for (const rawPattern of allowedRepositories) {
        const pattern = rawPattern.trim().toLowerCase();
        if (!pattern) continue;
        if (pattern === '*' || pattern === '*/*') {
            return true;
        }
        if (pattern.endsWith('/*')) {
            const patternOwner = pattern.slice(0, -2);
            if (patternOwner === normalizedOwner) {
                return true;
            }
            continue;
        }
        if (!pattern.includes('/')) {
            if (pattern === normalizedRepo) {
                return true;
            }
            continue;
        }
        if (pattern === full) {
            return true;
        }
    }
    return false;
}

/**
 * Extracts explicit repository names (without owner prefix) from `allowedRepositories`
 * that can be passed to GitHub's `POST /app/installations/{id}/access_tokens` `repositories` array
 * when no single target repository was specified (e.g., when minting a sandbox CLI token).
 *
 * Note: Wildcard entries like `MemberJunction/*` cannot be enumerated without an API call, so
 * if a wildcard is present and no target `repo` is provided, this returns `undefined` (installation-wide scope).
 * When a specific target `repo` IS provided and allowed, `[repo]` is returned so the token is strictly scoped to that one repo.
 */
export function ResolveInstallationRepositoryScope(
    targetRepo: { owner: string; repo: string } | undefined,
    allowedRepositories: string[] | undefined,
): string[] | undefined {
    if (targetRepo) {
        if (!IsRepositoryAllowed(targetRepo.owner, targetRepo.repo, allowedRepositories)) {
            throw new Error(
                `Repository '${targetRepo.owner}/${targetRepo.repo}' is not in the credential's allowedRepositories list (${allowedRepositories?.join(', ')}).`,
            );
        }
        return [targetRepo.repo];
    }

    if (!allowedRepositories || allowedRepositories.length === 0) {
        return undefined;
    }

    const explicitRepos: string[] = [];
    for (const pattern of allowedRepositories) {
        const trimmed = pattern.trim();
        if (trimmed.includes('*')) {
            // Wildcard org pattern; cannot pass a literal '*' to GitHub's `repositories` array
            return undefined;
        }
        const slashIdx = trimmed.indexOf('/');
        const repoName = slashIdx >= 0 ? trimmed.slice(slashIdx + 1).trim() : trimmed;
        if (repoName && !explicitRepos.includes(repoName)) {
            explicitRepos.push(repoName);
        }
    }

    return explicitRepos.length > 0 ? explicitRepos : undefined;
}

/**
 * Parses a GitHub repository reference in any of the following forms:
 * - Full URL: `https://github.com/MemberJunction/MJ` or `https://github.com/MemberJunction/Integrations/CRM/HubSpot`
 * - `owner/repo` shorthand: `MemberJunction/MJ`
 * - Bare `repo` name when `defaultOwner` is supplied: `MJ` + `defaultOwner='MemberJunction'`
 */
export function ParseGitHubRepository(
    input: string | undefined,
    ownerParam?: string,
    repoParam?: string,
    defaultOwner?: string,
): GitHubRepoCoordinate | null {
    const explicitOwner = ownerParam?.trim() || defaultOwner?.trim();
    const explicitRepo = repoParam?.trim();

    if (explicitOwner && explicitRepo && !explicitRepo.includes('/')) {
        const cleanRepo = explicitRepo.endsWith('.git') ? explicitRepo.slice(0, -4) : explicitRepo;
        return cleanRepo ? { Owner: explicitOwner, Repo: cleanRepo } : null;
    }

    const candidate = (input ?? explicitRepo ?? '').trim();
    if (!candidate) {
        return null;
    }

    // Check for github.com URL
    const hostIdx = candidate.indexOf('github.com/');
    if (hostIdx >= 0) {
        const afterHost = candidate.slice(hostIdx + 'github.com/'.length);
        let endIdx = afterHost.length;
        const qIdx = afterHost.indexOf('?');
        if (qIdx >= 0 && qIdx < endIdx) endIdx = qIdx;
        const hIdx = afterHost.indexOf('#');
        if (hIdx >= 0 && hIdx < endIdx) endIdx = hIdx;

        const pathPart = TrimSlashes(afterHost.slice(0, endIdx));
        const firstSlash = pathPart.indexOf('/');
        if (firstSlash <= 0) return null;

        const owner = pathPart.slice(0, firstSlash);
        const remainder = pathPart.slice(firstSlash + 1);
        const secondSlash = remainder.indexOf('/');
        const rawRepo = secondSlash >= 0 ? remainder.slice(0, secondSlash) : remainder;
        const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
        if (!owner || !repo) return null;

        let rawSubpath = secondSlash >= 0 ? TrimSlashes(remainder.slice(secondSlash + 1)) : '';
        if (rawSubpath.startsWith('blob/') || rawSubpath.startsWith('tree/')) {
            const afterPrefix = rawSubpath.slice(5);
            const refSlash = afterPrefix.indexOf('/');
            rawSubpath = refSlash >= 0 ? TrimSlashes(afterPrefix.slice(refSlash + 1)) : '';
        }
        return {
            Owner: owner,
            Repo: repo,
            ...(rawSubpath.length > 0 ? { Subpath: rawSubpath } : {}),
        };
    }

    // Check for owner/repo shorthand
    const cleaned = TrimSlashes(candidate);
    const slashIdx = cleaned.indexOf('/');
    if (slashIdx > 0) {
        const owner = cleaned.slice(0, slashIdx).trim();
        const rest = cleaned.slice(slashIdx + 1).trim();
        const nextSlash = rest.indexOf('/');
        const rawRepo = nextSlash >= 0 ? rest.slice(0, nextSlash) : rest;
        const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
        if (!owner || !repo) return null;
        const subpath = nextSlash >= 0 ? TrimSlashes(rest.slice(nextSlash + 1)) : '';
        return {
            Owner: owner,
            Repo: repo,
            ...(subpath.length > 0 ? { Subpath: subpath } : {}),
        };
    }

    // Bare repo name with defaultOwner
    if (explicitOwner && cleaned) {
        const repo = cleaned.endsWith('.git') ? cleaned.slice(0, -4) : cleaned;
        return repo ? { Owner: explicitOwner, Repo: repo } : null;
    }

    return null;
}
