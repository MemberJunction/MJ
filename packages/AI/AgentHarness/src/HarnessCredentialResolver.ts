/**
 * @fileoverview Credential value extraction, GitHub App short-lived installation token minting,
 * and `git`/`gh` CLI environment variable conventions for `@memberjunction/ai-agent-harness`.
 *
 * Fixes two critical issues when injecting `MJ: Credentials` into a harness sandbox:
 * 1. `MJCredentialEntity.Values` is stored as a JSON object (e.g., `{"apiKey":"sk-..."}` or
 *    `{"token":"ghp_..."}`). Injecting the raw JSON string into `ANTHROPIC_API_KEY` or `GITHUB_TOKEN`
 *    causes CLI tools to fail authentication. {@link ExtractHarnessCredentialSecret} extracts the
 *    scalar secret or mints a short-lived installation token.
 * 2. For `GitHub App` credentials (`{ appId, installationId, privateKey }`), the App's RSA private key
 *    must NEVER enter the sandbox container. Instead, the host mints a 1-hour installation access
 *    token (`ghs_...`) scoped to the credential's `allowedRepositories` and injects only that token.
 *
 * @module @memberjunction/ai-agent-harness
 */

import * as crypto from 'node:crypto';

/** Priority-ordered scalar keys inspected when extracting a single secret from `MJ: Credentials.Values`. */
const SCALAR_SECRET_KEYS: readonly string[] = [
    'token',
    'apiKey',
    'antigravityApiKey',
    'geminiApiKey',
    'googleApiKey',
    'anthropicApiKey',
    'openaiApiKey',
    'codexApiKey',
    'bearerToken',
    'accessToken',
    'personalAccessToken',
    'secret',
    'secretKey',
    'clientSecret',
    'password',
    'value',
];

/** Credential environment specification for a registered harness driver class. */
export interface HarnessDriverCredentialSpec {
    /** Canonical environment variable injected into the session for this driver. */
    PrimaryEnvVar: string;
    /** Ordered candidate environment variables inspected during zero-config server fallback. */
    FallbackEnvVars: readonly string[];
}

/**
 * Canonical credential environment variable mappings across CLI and Cloud harness adapters.
 */
export const HARNESS_DRIVER_CREDENTIAL_SPECS: Readonly<Record<string, HarnessDriverCredentialSpec>> = {
    ClaudeCodeCliAdapter: {
        PrimaryEnvVar: 'ANTHROPIC_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__CLAUDECODECLIADAPTER',
            'AI_VENDOR_API_KEY__ANTHROPICLLM',
            'ANTHROPIC_API_KEY',
        ],
    },
    ClaudeCodeCloudAdapter: {
        PrimaryEnvVar: 'ANTHROPIC_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__CLAUDECODECLOUDADAPTER',
            'AI_VENDOR_API_KEY__ANTHROPICLLM',
            'ANTHROPIC_API_KEY',
        ],
    },
    CodexAdapter: {
        PrimaryEnvVar: 'OPENAI_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__CODEXADAPTER',
            'AI_VENDOR_API_KEY__OPENAILM',
            'OPENAI_API_KEY',
        ],
    },
    CodexCloudAdapter: {
        PrimaryEnvVar: 'OPENAI_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__CODEXCLOUDADAPTER',
            'AI_VENDOR_API_KEY__OPENAILM',
            'OPENAI_API_KEY',
            'CODEX_API_KEY',
        ],
    },
    GeminiCliAdapter: {
        PrimaryEnvVar: 'GEMINI_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__GEMINICLIADAPTER',
            'AI_VENDOR_API_KEY__GEMINILLM',
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
        ],
    },
    AntigravityCliAdapter: {
        PrimaryEnvVar: 'GEMINI_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__ANTIGRAVITYCLIADAPTER',
            'ANTIGRAVITY_API_KEY',
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
            'AI_VENDOR_API_KEY__GEMINILLM',
        ],
    },
    AntigravityCloudAdapter: {
        PrimaryEnvVar: 'GEMINI_API_KEY',
        FallbackEnvVars: [
            'AI_VENDOR_API_KEY__ANTIGRAVITYCLOUDADAPTER',
            'ANTIGRAVITY_API_KEY',
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
            'AI_VENDOR_API_KEY__GEMINILLM',
        ],
    },
};

export interface ResolvedProviderCredential {
    Secret: string;
    SourceKey: string;
    IsBearer: boolean;
}

export interface ResolveHarnessCredentialOptions {
    /** Optional environment variable name being populated (e.g., `'GH_TOKEN'`, `'GITHUB_TOKEN'`). */
    EnvVariableName?: string;
    /** Calling user's ID, required when resolving a 3LO user-delegated credential (`ownerUserId`). */
    ContextUserId?: string;
    /** Custom `fetch` implementation for unit testing GitHub App token minting. */
    FetchImpl?: typeof fetch;
}

export interface GitHubUserAttribution {
    /** Human user's display name when operating with a per-user 3LO token. */
    UserName?: string;
    /** Human user's email when operating with a per-user 3LO token. */
    UserEmail?: string;
    /** Whether the GitHub token was resolved from the user's personal 3LO OAuth credential. */
    IsUserDelegated?: boolean;
}

/**
 * Extracts a ready-to-inject environment variable string from a raw `MJ: Credentials.Values` payload.
 *
 * - Enforces per-user isolation on 3LO credentials (`ownerUserId` must match `options.ContextUserId`).
 * - If `rawValues` is a JSON object with `appId`, `installationId`, and `privateKey`, mints a
 *   short-lived GitHub App installation token (`ghs_...`) so the RSA private key never enters the sandbox.
 * - If `rawValues` is a JSON object with a known secret field (`token`, `apiKey`, `accessToken`, etc.)
 *   or a single string property, returns that scalar string.
 * - If `rawValues` is a plain non-JSON string, returns the trimmed string.
 */
export async function ExtractHarnessCredentialSecret(
    rawValues: string | null | undefined,
    options: ResolveHarnessCredentialOptions = {}
): Promise<string | null> {
    if (!rawValues) {
        return null;
    }
    const trimmed = rawValues.trim();
    if (!trimmed) {
        return null;
    }

    if (!trimmed.startsWith('{')) {
        return trimmed;
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        return trimmed;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return trimmed;
    }

    // Enforce strict per-user isolation on 3LO user-delegated credentials (UserOAuth3LO:*)
    if (typeof parsed.ownerUserId === 'string' && parsed.ownerUserId.trim().length > 0) {
        const ownerId = parsed.ownerUserId.trim().toLowerCase();
        const callerId = options.ContextUserId?.trim().toLowerCase();
        if (!callerId || ownerId !== callerId) {
            throw new Error(
                `3LO credential ownership mismatch: credential belongs to user '${parsed.ownerUserId}', ` +
                    `cannot be accessed by user '${options.ContextUserId ?? 'anonymous'}'.`
            );
        }
    }

    // Check if this is a GitHub App credential ({ appId, installationId, privateKey })
    if (
        typeof parsed.appId === 'string' &&
        parsed.appId.trim().length > 0 &&
        typeof parsed.installationId === 'string' &&
        parsed.installationId.trim().length > 0 &&
        typeof parsed.privateKey === 'string' &&
        parsed.privateKey.trim().length > 0
    ) {
        return MintSandboxGitHubAppToken(
            {
                appId: parsed.appId.trim(),
                installationId: parsed.installationId.trim(),
                privateKey: parsed.privateKey,
                apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : undefined,
                allowedRepositories: parsed.allowedRepositories,
            },
            options.FetchImpl ?? fetch
        );
    }

    // Check priority scalar secret keys (case-insensitive)
    const entries = Object.entries(parsed);
    for (const targetKey of SCALAR_SECRET_KEYS) {
        const match = entries.find(([k]) => k.toLowerCase() === targetKey.toLowerCase());
        if (match && typeof match[1] === 'string' && match[1].trim().length > 0) {
            return match[1].trim();
        }
    }

    // If the JSON object has exactly one string property, return that property's value
    const stringEntries = entries.filter(
        ([, v]) => typeof v === 'string' && (v as string).trim().length > 0
    );
    if (stringEntries.length === 1) {
        return (stringEntries[0][1] as string).trim();
    }

    return trimmed;
}

/**
 * Normalizes GitHub CLI (`gh`) and `git` environment variables when a GitHub token is present
 * in the resolved sandbox environment:
 * - Mirrors `GH_TOKEN` <-> `GITHUB_TOKEN` so both `gh` CLI and `git`/API tools authenticate seamlessly.
 * - Sets `GH_PROMPT_DISABLED=1` and `GIT_TERMINAL_PROMPT=0` to prevent headless container hangs.
 * - When `userAttribution.IsUserDelegated` is true (3LO), sets `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`
 *   to the human user while keeping `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` as the MJ Agent
 *   (so GitHub renders "User authored and Agent committed").
 */
export function ApplyGitHubEnvironmentConventions(
    environment: Record<string, string>,
    agentName?: string,
    userAttribution?: GitHubUserAttribution
): Record<string, string> {
    const ghToken = environment.GH_TOKEN || environment.GITHUB_TOKEN;
    if (!ghToken) {
        return environment;
    }

    if (!environment.GH_TOKEN) {
        environment.GH_TOKEN = ghToken;
    }
    if (!environment.GITHUB_TOKEN) {
        environment.GITHUB_TOKEN = ghToken;
    }

    if (!environment.GH_PROMPT_DISABLED) {
        environment.GH_PROMPT_DISABLED = '1';
    }
    if (!environment.GIT_TERMINAL_PROMPT) {
        environment.GIT_TERMINAL_PROMPT = '0';
    }

    const cleanAgentName = (agentName ?? 'MemberJunction Agent').trim() || 'MemberJunction Agent';
    const slug = trimHyphens(cleanAgentName.toLowerCase().replace(/[^a-z0-9]+/g, '-')) || 'mj-agent';

    const agentDisplay = `${cleanAgentName} (MJ Agent)`;
    const agentEmail = `${slug}@agents.memberjunction.local`;

    if (!environment.GIT_AUTHOR_NAME) {
        environment.GIT_AUTHOR_NAME =
            userAttribution?.IsUserDelegated && userAttribution.UserName?.trim()
                ? userAttribution.UserName.trim()
                : agentDisplay;
    }
    if (!environment.GIT_AUTHOR_EMAIL) {
        environment.GIT_AUTHOR_EMAIL =
            userAttribution?.IsUserDelegated && userAttribution.UserEmail?.trim()
                ? userAttribution.UserEmail.trim()
                : agentEmail;
    }
    if (!environment.GIT_COMMITTER_NAME) {
        environment.GIT_COMMITTER_NAME = agentDisplay;
    }
    if (!environment.GIT_COMMITTER_EMAIL) {
        environment.GIT_COMMITTER_EMAIL = agentEmail;
    }

    return environment;
}

/**
 * Mirrors Antigravity / Gemini API key environment variables within a granted environment bag so
 * granting any one of `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `ANTIGRAVITY_API_KEY` satisfies both
 * `agy` CLI (`GEMINI_API_KEY`) and `AntigravityCloudAdapter` without leaking ungranted host vars.
 */
export function NormalizeAntigravityEnvironment(
    environment: Record<string, string>
): Record<string, string> {
    const resolved =
        nonEmptyEnvValue(environment.GEMINI_API_KEY) ??
        nonEmptyEnvValue(environment.ANTIGRAVITY_API_KEY) ??
        nonEmptyEnvValue(environment.GOOGLE_API_KEY);

    if (!resolved) {
        return environment;
    }

    if (!nonEmptyEnvValue(environment.GEMINI_API_KEY)) {
        environment.GEMINI_API_KEY = resolved;
    }
    if (!nonEmptyEnvValue(environment.ANTIGRAVITY_API_KEY)) {
        environment.ANTIGRAVITY_API_KEY = resolved;
    }
    if (!nonEmptyEnvValue(environment.GOOGLE_API_KEY)) {
        environment.GOOGLE_API_KEY = resolved;
    }

    return environment;
}

/**
 * Applies zero-config vendor API key fallback for `driverClass` into `targetEnvironment` when no
 * explicit `MJ: AI Agent Credentials` rows populated a key. Returns the matched source variable
 * name, or `null` when no fallback key was available.
 */
export function ResolveDriverVendorFallbackEnvironment(
    driverClass: string,
    targetEnvironment: Record<string, string>,
    sourceEnv: NodeJS.ProcessEnv = process.env
): string | null {
    const spec = HARNESS_DRIVER_CREDENTIAL_SPECS[driverClass];
    if (!spec) {
        return null;
    }

    for (const candidateKey of spec.FallbackEnvVars) {
        const val = nonEmptyEnvValue(sourceEnv[candidateKey]);
        if (val) {
            targetEnvironment[spec.PrimaryEnvVar] = val;
            if (
                driverClass === 'AntigravityCliAdapter' ||
                driverClass === 'AntigravityCloudAdapter'
            ) {
                NormalizeAntigravityEnvironment(targetEnvironment);
            }
            return candidateKey;
        }
    }

    return null;
}

/**
 * Resolves the effective API key or Bearer token for a cloud harness provider (`antigravity`,
 * `anthropic`, or `openai`), preferring secrets injected via `MJ: AI Agent Credentials` in
 * `environment` and falling back to `fallbackEnv` (`process.env`) when omitted.
 */
export function ResolveProviderCredentialSecret(
    provider: 'antigravity' | 'anthropic' | 'openai',
    environment: Record<string, string>,
    fallbackEnv?: NodeJS.ProcessEnv
): ResolvedProviderCredential | null {
    if (provider === 'antigravity') {
        const bearerKeys: readonly string[] = [
            'ANTIGRAVITY_BEARER_TOKEN',
            'GOOGLE_OAUTH_ACCESS_TOKEN',
        ];
        const bearerHit = findFirstEnvSecret(bearerKeys, environment, fallbackEnv);
        if (bearerHit) {
            return {
                Secret: stripBearerPrefix(bearerHit.Secret),
                SourceKey: bearerHit.SourceKey,
                IsBearer: true,
            };
        }

        const apiKeyCandidates: readonly string[] = [
            'ANTIGRAVITY_API_KEY',
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
            'AI_VENDOR_API_KEY__ANTIGRAVITYCLOUDADAPTER',
            'AI_VENDOR_API_KEY__GEMINILLM',
        ];
        const keyHit = findFirstEnvSecret(apiKeyCandidates, environment, fallbackEnv);
        if (!keyHit) {
            return null;
        }
        const isBearer = /^Bearer\s+/i.test(keyHit.Secret);
        return {
            Secret: isBearer ? stripBearerPrefix(keyHit.Secret) : keyHit.Secret,
            SourceKey: keyHit.SourceKey,
            IsBearer: isBearer,
        };
    }

    if (provider === 'anthropic') {
        const bearerHit = findFirstEnvSecret(['ANTHROPIC_AUTH_TOKEN'], environment, fallbackEnv);
        if (bearerHit) {
            return {
                Secret: stripBearerPrefix(bearerHit.Secret),
                SourceKey: bearerHit.SourceKey,
                IsBearer: true,
            };
        }
        const keyHit = findFirstEnvSecret(
            [
                'ANTHROPIC_API_KEY',
                'AI_VENDOR_API_KEY__CLAUDECODECLOUDADAPTER',
                'AI_VENDOR_API_KEY__ANTHROPICLLM',
            ],
            environment,
            fallbackEnv
        );
        if (!keyHit) {
            return null;
        }
        const isBearer = /^Bearer\s+/i.test(keyHit.Secret);
        return {
            Secret: isBearer ? stripBearerPrefix(keyHit.Secret) : keyHit.Secret,
            SourceKey: keyHit.SourceKey,
            IsBearer: isBearer,
        };
    }

    const openaiHit = findFirstEnvSecret(
        [
            'OPENAI_API_KEY',
            'CODEX_API_KEY',
            'AI_VENDOR_API_KEY__CODEXCLOUDADAPTER',
            'AI_VENDOR_API_KEY__OPENAILM',
        ],
        environment,
        fallbackEnv
    );
    if (!openaiHit) {
        return null;
    }
    return {
        Secret: stripBearerPrefix(openaiHit.Secret),
        SourceKey: openaiHit.SourceKey,
        IsBearer: true,
    };
}

function findFirstEnvSecret(
    keys: readonly string[],
    primary: Record<string, string>,
    fallback?: NodeJS.ProcessEnv
): { Secret: string; SourceKey: string } | null {
    for (const key of keys) {
        const fromPrimary = nonEmptyEnvValue(primary[key]);
        if (fromPrimary) {
            return { Secret: fromPrimary, SourceKey: key };
        }
    }
    if (fallback) {
        for (const key of keys) {
            const fromFallback = nonEmptyEnvValue(fallback[key]);
            if (fromFallback) {
                return { Secret: fromFallback, SourceKey: key };
            }
        }
    }
    return null;
}

function nonEmptyEnvValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function stripBearerPrefix(value: string): string {
    return value.replace(/^Bearer\s+/i, '').trim();
}

// ============================================================================
// Internal GitHub App JWT & Installation Token Helper
// ============================================================================

async function MintSandboxGitHubAppToken(
    config: {
        appId: string;
        installationId: string;
        privateKey: string;
        apiBaseUrl?: string;
        allowedRepositories?: unknown;
    },
    fetchImpl: typeof fetch
): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
        JSON.stringify({
            iat: nowSeconds - 60,
            exp: nowSeconds + 540,
            iss: config.appId,
        })
    ).toString('base64url');

    const normalizedPem = config.privateKey.includes('\\n')
        ? config.privateKey.replace(/\\n/g, '\n').trim()
        : config.privateKey.trim();

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const signature = signer.sign(normalizedPem, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const baseUrl = trimTrailingSlashes(config.apiBaseUrl ?? 'https://api.github.com');
    const url = `${baseUrl}/app/installations/${encodeURIComponent(config.installationId)}/access_tokens`;

    // Scope installation token to specific repository names when allowedRepositories contains exact repos
    const body: Record<string, unknown> = {};
    const repoNames = ExtractExactRepoNames(config.allowedRepositories);
    if (repoNames) {
        body.repositories = repoNames;
    }

    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${jwt}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'MemberJunction-AgentHarness/1.0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(
            `Failed to mint GitHub App installation token for sandbox (${response.status}): ${text}`
        );
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) {
        throw new Error('GitHub App installation token response did not contain a token.');
    }
    return data.token;
}

function ExtractExactRepoNames(rawAllowlist: unknown): string[] | undefined {
    let patterns: string[] = [];
    if (Array.isArray(rawAllowlist)) {
        patterns = rawAllowlist.map((v) => String(v).trim()).filter(Boolean);
    } else if (typeof rawAllowlist === 'string' && rawAllowlist.trim()) {
        const trimmed = rawAllowlist.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    patterns = parsed.map((v) => String(v).trim()).filter(Boolean);
                }
            } catch {
                patterns = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
            }
        } else {
            patterns = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
        }
    }

    if (patterns.length === 0) {
        return undefined;
    }

    const repoNames: string[] = [];
    for (const pattern of patterns) {
        if (pattern.includes('*')) {
            // Wildcard org/* cannot be restricted via the `repositories` array parameter
            return undefined;
        }
        const parts = pattern.split('/');
        const repoName = parts[parts.length - 1]?.trim();
        if (repoName && !repoNames.includes(repoName)) {
            repoNames.push(repoName);
        }
    }

    return repoNames.length > 0 ? repoNames : undefined;
}

function trimHyphens(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && value.charCodeAt(start) === 45) {
        start++;
    }
    while (end > start && value.charCodeAt(end - 1) === 45) {
        end--;
    }
    return start === 0 && end === value.length ? value : value.slice(start, end);
}

function trimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47) {
        end--;
    }
    return end === value.length ? value : value.slice(0, end);
}
