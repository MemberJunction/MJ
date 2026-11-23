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
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HarnessAuthMode } from './types.js';

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
 * Local CLI harness driver classes that support subscription login (`cli-login`) via the user's
 * local CLI session files under `HOME` / `XDG_CONFIG_HOME`.
 * Cloud adapters (`AntigravityCloudAdapter`, `ClaudeCodeCloudAdapter`, `CodexCloudAdapter`) always
 * require API keys or bearer tokens and are intentionally excluded.
 */
export const LOCAL_CLI_LOGIN_DRIVER_CLASSES: ReadonlySet<string> = new Set([
    'AntigravityCliAdapter',
    'ClaudeCodeCliAdapter',
    'CodexAdapter',
    'GeminiCliAdapter',
]);

/**
 * Provider API-key environment variable names stripped from the subprocess environment when
 * running in `cli-login` mode so the CLI authenticates strictly via its logged-in subscription
 * rather than billing pay-as-you-go API keys.
 */
export const HARNESS_STRIPPED_API_KEY_VARS: readonly string[] = [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'ANTIGRAVITY_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
];

const HARNESS_STRIPPED_API_KEY_SET: ReadonlySet<string> = new Set(HARNESS_STRIPPED_API_KEY_VARS);

/** Returns true when `driverClass` is one of the 4 local CLI adapters supporting `cli-login`. */
export function IsLocalCliLoginDriver(driverClass: string | null | undefined): boolean {
    return typeof driverClass === 'string' && LOCAL_CLI_LOGIN_DRIVER_CLASSES.has(driverClass);
}

/** Returns true when `envVarName` is a pay-as-you-go LLM API key variable stripped in `cli-login` mode. */
export function IsHarnessApiKeyEnvVar(envVarName: string): boolean {
    const normalized = envVarName.trim();
    if (!normalized) {
        return false;
    }
    const upper = normalized.toUpperCase();
    return HARNESS_STRIPPED_API_KEY_SET.has(upper) || upper.startsWith('AI_VENDOR_API_KEY__');
}

/**
 * Removes all provider API-key variables (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `ANTIGRAVITY_API_KEY`,
 * `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY`, and any `AI_VENDOR_API_KEY__*` keys)
 * from `environment` in-place so local CLI harnesses use subscription login with zero key leakage.
 */
export function StripHarnessApiKeyEnvironment(
    environment: Record<string, string>,
): Record<string, string> {
    for (const key of Object.keys(environment)) {
        if (IsHarnessApiKeyEnvVar(key)) {
            delete environment[key];
        }
    }
    return environment;
}

/** Parses and validates a raw auth mode string into a {@link HarnessAuthMode}, or `undefined`. */
export function ParseHarnessAuthMode(value: string | null | undefined): HarnessAuthMode | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'auto' || normalized === 'cli-login' || normalized === 'api-key') {
        return normalized;
    }
    return undefined;
}

interface HarnessAuthModeConfigJson {
    authMode?: string;
    AuthMode?: string;
}

/** Extracts an optional `authMode` setting from a harness configuration JSON string. */
export function ExtractAuthModeFromConfigJson(
    configJson: string | null | undefined,
): HarnessAuthMode | undefined {
    if (!configJson || !configJson.trim().startsWith('{')) {
        return undefined;
    }
    try {
        const parsed: HarnessAuthModeConfigJson = JSON.parse(configJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined;
        }
        return ParseHarnessAuthMode(parsed.authMode ?? parsed.AuthMode);
    } catch {
        return undefined;
    }
}

/** Result of inspecting the local filesystem for an active CLI subscription login session. */
export interface LocalCliLoginDetectionResult {
    hasLocalLogin: boolean;
    indicatorPath: string | null;
}

/** Options for {@link DetectLocalCliLoginSession}. */
export interface DetectLocalCliLoginOptions {
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
}

/**
 * Inspects standard local CLI credential/session paths for the given `driverClass` to determine
 * whether the user has an active local CLI login session.
 */
export function DetectLocalCliLoginSession(
    driverClass: string,
    options?: DetectLocalCliLoginOptions,
): LocalCliLoginDetectionResult {
    if (!IsLocalCliLoginDriver(driverClass)) {
        return { hasLocalLogin: false, indicatorPath: null };
    }

    const env = options?.env ?? process.env;
    const resolvedHome =
        nonEmptyEnvValue(options?.homeDir) ??
        nonEmptyEnvValue(env.HOME) ??
        nonEmptyEnvValue(os.homedir());
    if (!resolvedHome) {
        return { hasLocalLogin: false, indicatorPath: null };
    }

    const xdgConfigHome = nonEmptyEnvValue(env.XDG_CONFIG_HOME);
    const candidates: string[] = [];

    switch (driverClass) {
        case 'AntigravityCliAdapter':
            candidates.push(path.join(resolvedHome, '.gemini', 'antigravity'));
            if (xdgConfigHome) {
                candidates.push(path.join(xdgConfigHome, 'antigravity'));
            }
            candidates.push(path.join(resolvedHome, '.config', 'antigravity'));
            break;
        case 'ClaudeCodeCliAdapter':
            candidates.push(
                path.join(resolvedHome, '.claude', '.credentials.json'),
                path.join(resolvedHome, '.claude.json'),
                path.join(resolvedHome, '.claude'),
            );
            break;
        case 'CodexAdapter':
            candidates.push(path.join(resolvedHome, '.codex', 'auth.json'));
            break;
        case 'GeminiCliAdapter':
            candidates.push(
                path.join(resolvedHome, '.gemini', 'oauth_creds.json'),
                path.join(resolvedHome, '.gemini', 'google_accounts.json'),
            );
            break;
        default:
            return { hasLocalLogin: false, indicatorPath: null };
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return { hasLocalLogin: true, indicatorPath: candidate };
        }
    }

    return { hasLocalLogin: false, indicatorPath: null };
}

/** Returns the human-readable CLI login command for a local CLI harness driver. */
export function GetLocalCliLoginCommand(driverClass: string): string {
    switch (driverClass) {
        case 'AntigravityCliAdapter':
            return 'agy auth login';
        case 'ClaudeCodeCliAdapter':
            return 'claude login';
        case 'CodexAdapter':
            return 'codex login';
        case 'GeminiCliAdapter':
            return 'gemini';
        default:
            return 'your local CLI login command';
    }
}

/** Inputs for {@link ResolveEffectiveHarnessAuthMode}. */
export interface ResolveHarnessAuthModeOptions {
    /** Explicit auth mode from `HarnessSessionConfig.AuthMode` or `AIAgent.TypeConfiguration.authMode`. */
    configuredAuthMode?: HarnessAuthMode | string | null;
    /** Optional JSON string from `AIAgentHarness.Configuration` / `CapabilitySettings`. */
    harnessConfigurationJson?: string | null;
    /** True when the agent has an explicit active `MJ: AI Agent Credentials` API-key grant. */
    hasExplicitApiKeyGrant?: boolean;
    /** Override home directory for testing local CLI login detection. */
    homeDir?: string;
    /** Override process environment for testing `MJ_HARNESS_AUTH_MODE` / `MJ_HARNESS_PREFER_CLI_LOGIN`. */
    env?: NodeJS.ProcessEnv;
}

/** Resolved effective authentication mode and detection details for a harness session. */
export interface ResolvedHarnessAuthMode {
    effectiveMode: 'cli-login' | 'api-key';
    requestedMode: HarnessAuthMode;
    isLocalCliDriver: boolean;
    hasLocalLogin: boolean;
    indicatorPath: string | null;
}

/**
 * Resolves the effective authentication mode (`'cli-login'` vs `'api-key'`) for a harness driver.
 *
 * Precedence for requested mode:
 * 1. `options.configuredAuthMode` (`HarnessSessionConfig.AuthMode` / `AIAgent.TypeConfiguration.authMode`)
 * 2. `options.harnessConfigurationJson` (`authMode` field)
 * 3. `env.MJ_HARNESS_AUTH_MODE`
 * 4. Default `'auto'`
 *
 * Cloud adapters always resolve to `'api-key'`. On local CLI adapters, `'auto'` resolves to
 * `'cli-login'` when no explicit API-key grant is bound, `MJ_HARNESS_PREFER_CLI_LOGIN !== '0'`,
 * and {@link DetectLocalCliLoginSession} detects an active local login session.
 */
export function ResolveEffectiveHarnessAuthMode(
    driverClass: string,
    options: ResolveHarnessAuthModeOptions = {},
): ResolvedHarnessAuthMode {
    const env = options.env ?? process.env;
    const requestedMode: HarnessAuthMode =
        ParseHarnessAuthMode(options.configuredAuthMode) ??
        ExtractAuthModeFromConfigJson(options.harnessConfigurationJson) ??
        ParseHarnessAuthMode(env.MJ_HARNESS_AUTH_MODE) ??
        'auto';

    const isLocalCliDriver = IsLocalCliLoginDriver(driverClass);
    if (!isLocalCliDriver) {
        return {
            effectiveMode: 'api-key',
            requestedMode,
            isLocalCliDriver: false,
            hasLocalLogin: false,
            indicatorPath: null,
        };
    }

    const detection = DetectLocalCliLoginSession(driverClass, {
        homeDir: options.homeDir,
        env,
    });

    if (requestedMode === 'cli-login') {
        return {
            effectiveMode: 'cli-login',
            requestedMode,
            isLocalCliDriver: true,
            hasLocalLogin: detection.hasLocalLogin,
            indicatorPath: detection.indicatorPath,
        };
    }

    if (requestedMode === 'api-key') {
        return {
            effectiveMode: 'api-key',
            requestedMode,
            isLocalCliDriver: true,
            hasLocalLogin: detection.hasLocalLogin,
            indicatorPath: detection.indicatorPath,
        };
    }

    const preferCliLogin = env.MJ_HARNESS_PREFER_CLI_LOGIN !== '0';
    const useCliLogin =
        !options.hasExplicitApiKeyGrant && preferCliLogin && detection.hasLocalLogin;

    return {
        effectiveMode: useCliLogin ? 'cli-login' : 'api-key',
        requestedMode,
        isLocalCliDriver: true,
        hasLocalLogin: detection.hasLocalLogin,
        indicatorPath: detection.indicatorPath,
    };
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

/** Placeholder substituted whenever a secret is scrubbed from harness turn output or error logs. */
export const HARNESS_REDACTED_SECRET_PLACEHOLDER = '[REDACTED_SECRET]';

const NON_SECRET_ENV_KEYS: ReadonlySet<string> = new Set([
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'LANG',
    'TERM',
    'XDG_CONFIG_HOME',
    'GH_PROMPT_DISABLED',
    'GIT_TERMINAL_PROMPT',
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
    'DB_HOST',
    'DB_PORT',
    'DB_DATABASE',
    'DB_USER',
    'DB_USERNAME',
    'CODEGEN_DB_USER',
    'CODEGEN_DB_USERNAME',
]);

/**
 * Deterministically scrubs injected credential values, database passwords, CLI `-P` flags,
 * connection string passwords, and API/GitHub tokens from harness turn output or error strings
 * before they are persisted to `AIPromptRun` or replayed into subsequent LLM turns.
 */
export function ScrubHarnessSecrets(
    text: string | undefined,
    environment?: Readonly<Record<string, string>>,
): string {
    if (!text) {
        return '';
    }

    let scrubbed = text;

    if (environment) {
        const candidateValues: string[] = [];
        for (const [key, val] of Object.entries(environment)) {
            if (NON_SECRET_ENV_KEYS.has(key)) {
                continue;
            }
            const trimmed = val?.trim();
            if (trimmed && trimmed.length >= 6) {
                candidateValues.push(trimmed);
            }
        }
        candidateValues.sort((a, b) => b.length - a.length);
        for (const secret of candidateValues) {
            scrubbed = scrubbed.split(secret).join(HARNESS_REDACTED_SECRET_PLACEHOLDER);
        }
    }

    scrubbed = scrubbed.replace(
        /\b(Password|Pwd)\s*=\s*([^;'"\s]+)/gi,
        `$1=${HARNESS_REDACTED_SECRET_PLACEHOLDER}`,
    );
    scrubbed = scrubbed.replace(
        /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:@/\s]+:)([^@/\s]+)(@)/g,
        `$1${HARNESS_REDACTED_SECRET_PLACEHOLDER}$3`,
    );
    scrubbed = scrubbed.replace(
        /(?:^|\s)(-P|--password)(?:\s+|=)(\S+)/g,
        (match, flag: string) => {
            const leading = match.startsWith(' ') ? ' ' : '';
            return `${leading}${flag} ${HARNESS_REDACTED_SECRET_PLACEHOLDER}`;
        },
    );
    scrubbed = scrubbed.replace(
        /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*([^\r\n]+)/g,
        `$1=${HARNESS_REDACTED_SECRET_PLACEHOLDER}`,
    );
    scrubbed = scrubbed.replace(
        /\b(?:ghp_[A-Za-z0-9_]{16,}|ghs_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b/g,
        HARNESS_REDACTED_SECRET_PLACEHOLDER,
    );

    return scrubbed;
}
