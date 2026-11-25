/**
 * @fileoverview Governed GitHub credential resolution for MemberJunction Actions and Agents.
 *
 * Resolves credentials through a deterministic 5-step priority chain:
 *   1. Explicit `CredentialID` or `CredentialName` parameter → `CredentialEngine`
 *   2. Per-User Delegated OAuth 2.0 (`3LO`) when `UseUserDelegatedAuth: true` → `CredentialEngine.GetUserDelegatedCredential`
 *   3. `CompanyID` parameter → active `MJ: Company Integrations` (`Integration='GitHub'`) → `CredentialEngine`
 *   4. Default `GitHub App` or `GitHub Personal Access Token` credential in `CredentialEngine`
 *   5. Process environment fallback (`GITHUB_APP_*` or `GITHUB_TOKEN` / `GH_TOKEN`)
 *
 * Every database credential lookup flows through `CredentialEngine.Instance` so access is
 * audited in `MJ: Audit Logs`, `LastUsedAt` is stamped, `IsActive` is enforced, and
 * expiration policies apply.
 *
 * @module @memberjunction/core-actions/github
 */

import { LogError, RunView, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntityType } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { IndexByUUID } from '@memberjunction/global';
import {
    DEFAULT_GITHUB_WRITE_PERMISSIONS,
    IsRepositoryAllowed,
    MintGitHubInstallationToken,
    NormalizePrivateKey,
    ParseAllowedRepositories,
    ReadGitHubAppFromEnv,
    ResolveInstallationRepositoryScope,
    TrimTrailingSlashes,
} from './github-app-auth.js';
import type {
    GitHubAuthSource,
    GitHubInstallationPermissions,
    GitHubResolvedAuth,
} from './github-types.js';

export const GITHUB_INTEGRATION_NAME = 'GitHub';

/** Canonical 8-4-4-4-12 UUID format to prevent SQL boolean injection in RunView ExtraFilter. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Options for resolving GitHub authentication.
 */
export interface ResolveGitHubAuthOptions {
    /** Optional explicit MJ Credential ID. */
    CredentialID?: string;
    /** Optional explicit MJ Credential Name. */
    CredentialName?: string;
    /** Optional MJ Company ID to resolve via `MJ: Company Integrations`. */
    CompanyID?: string;
    /** When true, resolves the calling user's personal 3LO OAuth token (`UserOAuth3LO:GitHub:<userId>`). */
    UseUserDelegatedAuth?: boolean;
    /** Target repository (`owner/repo`) to scope minted GitHub App tokens and validate allowlists. */
    TargetRepository?: { owner: string; repo: string };
    /** Requested GitHub App installation permissions (defaults to `DEFAULT_GITHUB_WRITE_PERMISSIONS`). */
    Permissions?: GitHubInstallationPermissions;
    /** Server-side user context for `CredentialEngine` audit logging and 3LO ownership checks. */
    ContextUser?: UserInfo;
    /** Injectable `fetch` implementation for deterministic unit testing of token minting. */
    FetchImpl?: typeof fetch;
    /** Injectable environment object for testing. */
    Env?: NodeJS.ProcessEnv;
}

function parseBoolFlag(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
    }
    return defaultValue;
}

function parsePRMode(value: unknown): 'draft' | 'ready' {
    if (typeof value === 'string' && value.trim().toLowerCase() === 'ready') {
        return 'ready';
    }
    return 'draft';
}

/**
 * Hydrates a {@link GitHubResolvedAuth} from a decrypted `MJ: Credentials` values map.
 * Supports both `GitHub App` credentials (`appId`, `installationId`, `privateKey`) and
 * `GitHub Personal Access Token` / `API Key` credentials (`token`, `apiKey`, `accessToken`).
 */
export async function HydrateGitHubAuthFromValues(
    values: Record<string, unknown>,
    source: GitHubAuthSource,
    options?: {
        credentialId?: string;
        targetRepository?: { owner: string; repo: string };
        permissions?: GitHubInstallationPermissions;
        fetchImpl?: typeof fetch;
    },
): Promise<GitHubResolvedAuth | null> {
    const allowedRepos = ParseAllowedRepositories(
        typeof values.allowedRepositories === 'string' ? values.allowedRepositories : undefined,
    );

    if (options?.targetRepository) {
        const { owner, repo } = options.targetRepository;
        if (!IsRepositoryAllowed(owner, repo, allowedRepos)) {
            throw new GitHubRepoNotAllowedError(
                `Repository '${owner}/${repo}' is not permitted by credential allowlist (${allowedRepos.join(', ')}).`,
                owner,
                repo,
            );
        }
    }

    const defaultOwner =
        typeof values.defaultOwner === 'string' && values.defaultOwner.trim().length > 0
            ? values.defaultOwner.trim()
            : undefined;
    const allowMerge = parseBoolFlag(values.allowMerge, false);
    const defaultPRMode = parsePRMode(values.defaultPRMode);
    const apiBaseUrl =
        typeof values.apiBaseUrl === 'string' && values.apiBaseUrl.trim().length > 0
            ? TrimTrailingSlashes(values.apiBaseUrl.trim())
            : 'https://api.github.com';

    // Check for GitHub App shape first
    const appId = typeof values.appId === 'string' ? values.appId.trim() : '';
    const installationId = typeof values.installationId === 'string' ? values.installationId.trim() : '';
    const privateKey = NormalizePrivateKey(typeof values.privateKey === 'string' ? values.privateKey : undefined);

    if (appId && installationId && privateKey) {
        const repoScope = ResolveInstallationRepositoryScope(options?.targetRepository, allowedRepos);
        const token = await MintGitHubInstallationToken(
            {
                AppId: appId,
                InstallationId: installationId,
                PrivateKey: privateKey,
                ApiBaseUrl: apiBaseUrl,
            },
            {
                Repositories: repoScope,
                Permissions: options?.permissions ?? DEFAULT_GITHUB_WRITE_PERMISSIONS,
                FetchImpl: options?.fetchImpl,
            },
        );

        return {
            Token: token,
            Source: source,
            AuthKind: 'github-app',
            CredentialID: options?.credentialId,
            DefaultOwner: defaultOwner,
            AllowedRepositories: allowedRepos.length > 0 ? allowedRepos : undefined,
            AllowMerge: allowMerge,
            DefaultPRMode: defaultPRMode,
            ApiBaseUrl: apiBaseUrl,
        };
    }

    // Check for PAT / API Key / OAuth token shape
    for (const key of ['token', 'Token', 'personalAccessToken', 'apiKey', 'APIKey', 'api_key', 'accessToken']) {
        const candidate = values[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return {
                Token: candidate.trim(),
                Source: source,
                AuthKind: source === 'user-delegated' ? 'oauth-3lo' : 'pat',
                CredentialID: options?.credentialId,
                DefaultOwner: defaultOwner,
                AllowedRepositories: allowedRepos.length > 0 ? allowedRepos : undefined,
                AllowMerge: allowMerge,
                DefaultPRMode: defaultPRMode,
                ApiBaseUrl: apiBaseUrl,
            };
        }
    }

    return null;
}

/**
 * Thrown when a target repository violates the credential's `allowedRepositories` policy.
 */
export class GitHubRepoNotAllowedError extends Error {
    public readonly Owner: string;
    public readonly Repo: string;
    constructor(message: string, owner: string, repo: string) {
        super(message);
        this.name = 'GitHubRepoNotAllowedError';
        this.Owner = owner;
        this.Repo = repo;
    }
}

/**
 * Resolves a {@link GitHubResolvedAuth} using the 5-step priority chain.
 * Returns `null` when no GitHub credentials are configured anywhere.
 */
export async function ResolveGitHubAuth(
    options: ResolveGitHubAuthOptions,
): Promise<GitHubResolvedAuth | null> {
    const contextUser = options.ContextUser;
    const hydrateOpts = {
        targetRepository: options.TargetRepository,
        permissions: options.Permissions,
        fetchImpl: options.FetchImpl,
    };

    // 1. Explicit CredentialID or CredentialName
    if (options.CredentialID || options.CredentialName) {
        const explicit = await resolveByCredentialIdOrName(
            options.CredentialID,
            options.CredentialName,
            contextUser,
            hydrateOpts,
        );
        if (explicit) return explicit;
    }

    // 2. Per-User Delegated OAuth 2.0 (3LO)
    if (options.UseUserDelegatedAuth && contextUser?.ID) {
        const delegated = await resolveUserDelegated3LO(contextUser, hydrateOpts);
        if (delegated) return delegated;
    }

    // 3. CompanyIntegration lookup
    if (options.CompanyID) {
        const fromCompany = await resolveFromCompanyIntegration(
            options.CompanyID,
            contextUser,
            hydrateOpts,
        );
        if (fromCompany) return fromCompany;
    }

    // 4. Default Credential in CredentialEngine ('GitHub App' or 'GitHub Personal Access Token')
    const defaultCred = await resolveDefaultGitHubCredential(contextUser, hydrateOpts);
    if (defaultCred) return defaultCred;

    // 5. Process Environment fallback
    return resolveFromEnvironment(options.Env ?? process.env, hydrateOpts);
}

async function resolveByCredentialIdOrName(
    credentialId: string | undefined,
    credentialName: string | undefined,
    contextUser: UserInfo | undefined,
    hydrateOpts: {
        targetRepository?: { owner: string; repo: string };
        permissions?: GitHubInstallationPermissions;
        fetchImpl?: typeof fetch;
    },
): Promise<GitHubResolvedAuth | null> {
    await CredentialEngine.Instance.Config(false, contextUser);

    let targetName = credentialName?.trim();
    if (credentialId) {
        const match = CredentialEngine.Instance.Credentials.find(
            (c) => c.ID.toLowerCase() === credentialId.trim().toLowerCase(),
        );
        if (!match) {
            LogError(`ResolveGitHubAuth: MJ: Credentials record '${credentialId}' was not found.`);
            return null;
        }
        if (match.IsActive === false) {
            LogError(`ResolveGitHubAuth: MJ: Credentials record '${match.Name}' is inactive.`);
            return null;
        }
        targetName = match.Name;
    }

    if (!targetName) return null;

    const resolved = await CredentialEngine.Instance.getCredential<Record<string, string>>(targetName, {
        credentialId,
        contextUser,
        subsystem: 'GitHub',
    });

    return HydrateGitHubAuthFromValues(resolved.values, 'credential', {
        ...hydrateOpts,
        credentialId: resolved.credential?.ID ?? credentialId,
    });
}

async function resolveUserDelegated3LO(
    contextUser: UserInfo,
    hydrateOpts: {
        targetRepository?: { owner: string; repo: string };
        permissions?: GitHubInstallationPermissions;
        fetchImpl?: typeof fetch;
    },
): Promise<GitHubResolvedAuth | null> {
    await CredentialEngine.Instance.Config(false, contextUser);
    const engineWith3LO = CredentialEngine.Instance as unknown as {
        GetUserDelegatedCredential?: (
            providerName: string,
            user: UserInfo,
        ) => Promise<{ credential?: { ID?: string } | null; values: Record<string, string> } | null>;
    };
    let delegated: { credential?: { ID?: string } | null; credentialId?: string; values: Record<string, unknown> } | null = null;
    if (typeof engineWith3LO.GetUserDelegatedCredential === 'function') {
        delegated = await engineWith3LO.GetUserDelegatedCredential('GitHub', contextUser);
    } else if (contextUser?.ID) {
        try {
            delegated = await CredentialEngine.Instance.getCredential<Record<string, string>>(
                `UserOAuth3LO:GitHub:${contextUser.ID}`,
                {
                    contextUser,
                    subsystem: 'GitHub',
                },
            );
        } catch {
            delegated = null;
        }
    }
    const accessToken =
        typeof delegated?.values?.accessToken === 'string'
            ? delegated.values.accessToken
            : typeof delegated?.values?.token === 'string'
            ? delegated.values.token
            : undefined;
    if (!accessToken) {
        return null;
    }
    const allowedReposRaw = delegated?.values?.allowedRepositories;
    const allowedRepositories = Array.isArray(allowedReposRaw)
        ? allowedReposRaw.join(',')
        : typeof allowedReposRaw === 'string'
        ? allowedReposRaw
        : undefined;
    return HydrateGitHubAuthFromValues(
        {
            token: accessToken,
            ...(allowedRepositories ? { allowedRepositories } : {}),
            // A human user's delegated 3LO token carries that user's own GitHub review/merge identity
            allowMerge: 'true',
            defaultPRMode: typeof delegated?.values?.defaultPRMode === 'string' ? delegated.values.defaultPRMode : 'draft',
        },
        'user-delegated',
        {
            ...hydrateOpts,
            credentialId: delegated?.credential?.ID ?? delegated?.credentialId,
        },
    );
}

async function resolveFromCompanyIntegration(
    companyId: string,
    contextUser: UserInfo | undefined,
    hydrateOpts: {
        targetRepository?: { owner: string; repo: string };
        permissions?: GitHubInstallationPermissions;
        fetchImpl?: typeof fetch;
    },
): Promise<GitHubResolvedAuth | null> {
    if (!UUID_PATTERN.test(companyId.trim())) {
        LogError(`ResolveGitHubAuth: CompanyID '${companyId}' is not a valid UUID; refusing to build filter.`);
        return null;
    }

    const rv = new RunView();
    const result = await rv.RunView<MJCompanyIntegrationEntityType>(
        {
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CompanyID = '${companyId.trim()}' AND Integration = '${GITHUB_INTEGRATION_NAME}' AND (IsActive IS NULL OR IsActive = 1)`,
            ResultType: 'simple',
        },
        contextUser,
    );

    if (!result.Success || !result.Results?.length) {
        return null;
    }

    const row = result.Results[0];
    if (!row.CredentialID) {
        LogError(
            `ResolveGitHubAuth: CompanyIntegration ${row.ID} has no CredentialID. Link an MJ: Credentials record.`,
        );
        return null;
    }

    const resolved = await resolveByCredentialIdOrName(row.CredentialID, undefined, contextUser, hydrateOpts);
    if (!resolved) return null;
    return {
        ...resolved,
        Source: 'company-integration',
    };
}

async function resolveDefaultGitHubCredential(
    contextUser: UserInfo | undefined,
    hydrateOpts: {
        targetRepository?: { owner: string; repo: string };
        permissions?: GitHubInstallationPermissions;
        fetchImpl?: typeof fetch;
    },
): Promise<GitHubResolvedAuth | null> {
    try {
        await CredentialEngine.Instance.Config(false, contextUser);
        const defaultByTypeId = IndexByUUID(
            CredentialEngine.Instance.Credentials.filter((c) => c.IsActive !== false && c.IsDefault === true),
            (c) => c.CredentialTypeID,
        );
        for (const typeName of ['GitHub App', 'GitHub Personal Access Token']) {
            const credType = CredentialEngine.Instance.CredentialTypes.find(
                (t) => t.Name.trim().toLowerCase() === typeName.toLowerCase(),
            );
            if (!credType) continue;

            const defaultCred = defaultByTypeId.Get(credType.ID);
            if (!defaultCred) continue;

            const resolved = await CredentialEngine.Instance.getCredential<Record<string, string>>(defaultCred.Name, {
                credentialId: defaultCred.ID,
                contextUser,
                subsystem: 'GitHub',
            });
            const hydrated = await HydrateGitHubAuthFromValues(resolved.values, 'default-credential', {
                ...hydrateOpts,
                credentialId: defaultCred.ID,
            });
            if (hydrated) return hydrated;
        }
    } catch {
        // Fall through to environment if CredentialEngine is not initialized (e.g. standalone CLI / unit test)
    }
    return null;
}

async function resolveFromEnvironment(
    env: NodeJS.ProcessEnv,
    hydrateOpts: {
        targetRepository?: { owner: string; repo: string };
        permissions?: GitHubInstallationPermissions;
        fetchImpl?: typeof fetch;
    },
): Promise<GitHubResolvedAuth | null> {
    const allowedRepos = ParseAllowedRepositories(env.GITHUB_ALLOWED_REPOS);
    const defaultOwner = env.GITHUB_DEFAULT_OWNER?.trim() || undefined;
    const allowMerge = parseBoolFlag(env.GITHUB_ALLOW_MERGE, false);
    const defaultPRMode = parsePRMode(env.GITHUB_DEFAULT_PR_MODE);
    const apiBaseUrl = TrimTrailingSlashes((env.GITHUB_API_URL ?? 'https://api.github.com').trim());

    if (hydrateOpts.targetRepository) {
        const { owner, repo } = hydrateOpts.targetRepository;
        if (!IsRepositoryAllowed(owner, repo, allowedRepos)) {
            throw new GitHubRepoNotAllowedError(
                `Repository '${owner}/${repo}' is not permitted by GITHUB_ALLOWED_REPOS (${allowedRepos.join(', ')}).`,
                owner,
                repo,
            );
        }
    }

    // Prefer GitHub App from env when present (scoped installation token)
    const appFromEnv = ReadGitHubAppFromEnv(env);
    if (appFromEnv) {
        const repoScope = ResolveInstallationRepositoryScope(hydrateOpts.targetRepository, allowedRepos);
        const token = await MintGitHubInstallationToken(appFromEnv, {
            Repositories: repoScope,
            Permissions: hydrateOpts.permissions ?? DEFAULT_GITHUB_WRITE_PERMISSIONS,
            FetchImpl: hydrateOpts.fetchImpl,
        });
        return {
            Token: token,
            Source: 'environment',
            AuthKind: 'github-app',
            DefaultOwner: defaultOwner,
            AllowedRepositories: allowedRepos.length > 0 ? allowedRepos : undefined,
            AllowMerge: allowMerge,
            DefaultPRMode: defaultPRMode,
            ApiBaseUrl: appFromEnv.ApiBaseUrl ?? apiBaseUrl,
        };
    }

    const pat = (env.GITHUB_TOKEN ?? env.GH_TOKEN ?? '').trim();
    if (pat) {
        return {
            Token: pat,
            Source: 'environment',
            AuthKind: 'pat',
            DefaultOwner: defaultOwner,
            AllowedRepositories: allowedRepos.length > 0 ? allowedRepos : undefined,
            AllowMerge: allowMerge,
            DefaultPRMode: defaultPRMode,
            ApiBaseUrl: apiBaseUrl,
        };
    }

    return null;
}
