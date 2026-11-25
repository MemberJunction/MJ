import { z } from 'zod';
import { GetGlobalObjectStore } from '@memberjunction/global';

/** Minimum allowed lifetime (minutes) for temporary impersonation API keys. */
export const USER_IMPERSONATION_MIN_TTL_MINUTES = 5;

/** Default lifetime (minutes) for temporary impersonation API keys (15 minutes). */
export const USER_IMPERSONATION_DEFAULT_TTL_MINUTES = 15;

/** Hard upper ceiling (minutes) for temporary impersonation API keys (60 minutes). */
export const USER_IMPERSONATION_MAX_TTL_MINUTES = 60;

/**
 * Baseline privileged role names whose holders may NEVER be listed or impersonated.
 * Deployments may configure `userImpersonation.protectedTargetRoles` to customize or extend this set;
 * baseline roles (`Administrator`, `Developer`, `Integration`) are the default.
 */
export const DEFAULT_PROTECTED_TARGET_ROLES: readonly string[] = Object.freeze([
    'Administrator',
    'Developer',
    'Integration',
]);

const GLOBAL_USER_IMPERSONATION_CONFIG_KEY = '___MJServer___UserImpersonationConfig';

const strictBooleanOrDefaultFalse = z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .default(false)
    .transform((v) => {
        if (typeof v === 'boolean') {
            return v;
        }
        if (typeof v === 'string') {
            return v.trim() === 'true';
        }
        return false;
    });

/**
 * Zod schema for `mj.config.cjs` `userImpersonation` configuration block.
 *
 * Security posture (fail-closed everywhere):
 * - `enabled`: strictly `false` by default (requires `MJ_ENABLE_USER_IMPERSONATION === 'true'`
 *   or `userImpersonation.enabled === true` PLUS an explicit `User Impersonation` authorization grant).
 * - `allowWrites`: strictly `false` by default (requires `MJ_USER_IMPERSONATION_ALLOW_WRITES === 'true'`
 *   or `userImpersonation.allowWrites === true` PLUS a direct `Allow` grant on
 *   `User Impersonation: Act As (Allow Writes)`).
 * - `defaultTtlMinutes`: `15` minutes (clamped to `5..60`).
 * - `maxTtlMinutes`: `60` minutes hard ceiling (configurable downward to `5..60`).
 * - `protectedTargetRoles`: defaults to `['Administrator', 'Developer', 'Integration']`.
 */
export const UserImpersonationConfigSchema = z.object({
    enabled: strictBooleanOrDefaultFalse,
    allowWrites: strictBooleanOrDefaultFalse,
    defaultTtlMinutes: z.coerce
        .number()
        .int()
        .min(USER_IMPERSONATION_MIN_TTL_MINUTES)
        .max(USER_IMPERSONATION_MAX_TTL_MINUTES)
        .optional()
        .default(USER_IMPERSONATION_DEFAULT_TTL_MINUTES),
    maxTtlMinutes: z.coerce
        .number()
        .int()
        .min(USER_IMPERSONATION_MIN_TTL_MINUTES)
        .max(USER_IMPERSONATION_MAX_TTL_MINUTES)
        .optional()
        .default(USER_IMPERSONATION_MAX_TTL_MINUTES),
    protectedTargetRoles: z
        .array(z.string())
        .optional()
        .default([...DEFAULT_PROTECTED_TARGET_ROLES]),
});

export type UserImpersonationConfig = z.infer<typeof UserImpersonationConfigSchema>;

export interface ResolvedUserImpersonationConfig {
    readonly enabled: boolean;
    readonly allowWrites: boolean;
    readonly defaultTtlMinutes: number;
    readonly maxTtlMinutes: number;
    readonly protectedTargetRoles: readonly string[];
}

function clampTtlCeiling(raw: number | undefined, fallback: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return fallback;
    }
    return Math.min(
        USER_IMPERSONATION_MAX_TTL_MINUTES,
        Math.max(USER_IMPERSONATION_MIN_TTL_MINUTES, Math.round(raw))
    );
}

/**
 * Builds the `DEFAULT_SERVER_CONFIG.userImpersonation` block from environment variables.
 * Strictly requires exact `'true'` string for `MJ_ENABLE_USER_IMPERSONATION` and
 * `MJ_USER_IMPERSONATION_ALLOW_WRITES` so ambiguous values fail closed to `false`.
 */
export function UserImpersonationDefaultsFromEnv(
    env: NodeJS.ProcessEnv = process.env
): UserImpersonationConfig {
    const rawMaxTtl = env.MJ_USER_IMPERSONATION_MAX_TTL_MINUTES
        ? Number(env.MJ_USER_IMPERSONATION_MAX_TTL_MINUTES)
        : undefined;
    const maxTtlMinutes = clampTtlCeiling(rawMaxTtl, USER_IMPERSONATION_MAX_TTL_MINUTES);
    const defaultTtlMinutes = Math.min(USER_IMPERSONATION_DEFAULT_TTL_MINUTES, maxTtlMinutes);

    return {
        enabled: env.MJ_ENABLE_USER_IMPERSONATION === 'true',
        allowWrites: env.MJ_USER_IMPERSONATION_ALLOW_WRITES === 'true',
        defaultTtlMinutes,
        maxTtlMinutes,
        protectedTargetRoles: [...DEFAULT_PROTECTED_TARGET_ROLES],
    };
}

/**
 * Registers the validated `configInfo.userImpersonation` object into MJ's Global Object Store
 * so resolvers and auth guards can inspect it without importing `config.ts` directly (which would
 * trigger full DB config validation in isolated unit test suites).
 */
export function RegisterServerUserImpersonationConfig(
    config: Partial<UserImpersonationConfig> | null | undefined
): void {
    const store = GetGlobalObjectStore();
    if (!store) {
        return;
    }
    if (!config) {
        delete store[GLOBAL_USER_IMPERSONATION_CONFIG_KEY];
        return;
    }
    store[GLOBAL_USER_IMPERSONATION_CONFIG_KEY] = config;
}

export function GetRegisteredServerUserImpersonationConfig():
    | Partial<UserImpersonationConfig>
    | undefined {
    const store = GetGlobalObjectStore();
    return store?.[GLOBAL_USER_IMPERSONATION_CONFIG_KEY] as
        | Partial<UserImpersonationConfig>
        | undefined;
}

/**
 * Resolves the effective runtime user impersonation policy, combining registered `mj.config.cjs`
 * settings with live environment variables (`MJ_ENABLE_USER_IMPERSONATION`,
 * `MJ_USER_IMPERSONATION_ALLOW_WRITES`).
 *
 * Precedence for kill switches:
 * - If `MJ_ENABLE_USER_IMPERSONATION` is explicitly set in `env`: ONLY exact `'true'` enables it;
 *   `'false'` / `'0'` / any other value immediately forces it OFF even if `mj.config.cjs` set `enabled: true`
 *   (emergency incident-response override).
 * - If `MJ_ENABLE_USER_IMPERSONATION` is unset in `env`: uses `cfg.enabled === true` (default `false`).
 * - `allowWrites` additionally requires `enabled === true` AND (`MJ_USER_IMPERSONATION_ALLOW_WRITES === 'true'`
 *   when set in `env`, else `cfg.allowWrites === true`, default `false`).
 */
export function ResolveUserImpersonationConfig(
    configOverride?: Partial<UserImpersonationConfig>,
    env: NodeJS.ProcessEnv = process.env
): ResolvedUserImpersonationConfig {
    const cfg = configOverride ?? GetRegisteredServerUserImpersonationConfig();

    const envEnabledRaw = env.MJ_ENABLE_USER_IMPERSONATION;
    const enabled =
        envEnabledRaw !== undefined && envEnabledRaw.trim() !== ''
            ? envEnabledRaw.trim() === 'true'
            : cfg?.enabled === true;

    const envWritesRaw = env.MJ_USER_IMPERSONATION_ALLOW_WRITES;
    const allowWritesRaw =
        envWritesRaw !== undefined && envWritesRaw.trim() !== ''
            ? envWritesRaw.trim() === 'true'
            : cfg?.allowWrites === true;
    const allowWrites = enabled && allowWritesRaw;

    const envMaxTtl =
        env.MJ_USER_IMPERSONATION_MAX_TTL_MINUTES !== undefined &&
        env.MJ_USER_IMPERSONATION_MAX_TTL_MINUTES.trim() !== ''
            ? Number(env.MJ_USER_IMPERSONATION_MAX_TTL_MINUTES)
            : undefined;
    const maxTtlMinutes = clampTtlCeiling(
        envMaxTtl ?? cfg?.maxTtlMinutes,
        USER_IMPERSONATION_MAX_TTL_MINUTES
    );
    const defaultTtlMinutes = Math.min(
        maxTtlMinutes,
        clampTtlCeiling(cfg?.defaultTtlMinutes, USER_IMPERSONATION_DEFAULT_TTL_MINUTES)
    );

    const configuredRoles = cfg?.protectedTargetRoles;
    const protectedTargetRoles = Array.isArray(configuredRoles)
        ? configuredRoles.map((r) => r.trim()).filter(Boolean)
        : [...DEFAULT_PROTECTED_TARGET_ROLES];

    return {
        enabled,
        allowWrites,
        defaultTtlMinutes,
        maxTtlMinutes,
        protectedTargetRoles,
    };
}

export function IsUserImpersonationEnabled(
    configOverride?: Partial<UserImpersonationConfig>,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    return ResolveUserImpersonationConfig(configOverride, env).enabled;
}

export function IsUserImpersonationWritesEnabled(
    configOverride?: Partial<UserImpersonationConfig>,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    return ResolveUserImpersonationConfig(configOverride, env).allowWrites;
}

/**
 * Clamps a requested TTL (minutes) to `[5, effectiveMaxTtlMinutes]`, defaulting to
 * `effectiveDefaultTtlMinutes` (`15` minutes by default, never exceeding `60` minutes).
 */
export function ClampUserImpersonationTtlMinutes(
    rawMinutes: number | null | undefined,
    resolvedConfig: Pick<
        ResolvedUserImpersonationConfig,
        'defaultTtlMinutes' | 'maxTtlMinutes'
    > = ResolveUserImpersonationConfig()
): number {
    const ceiling = clampTtlCeiling(
        resolvedConfig.maxTtlMinutes,
        USER_IMPERSONATION_MAX_TTL_MINUTES
    );
    const defaultTtl = Math.min(
        ceiling,
        clampTtlCeiling(resolvedConfig.defaultTtlMinutes, USER_IMPERSONATION_DEFAULT_TTL_MINUTES)
    );
    if (typeof rawMinutes !== 'number' || !Number.isFinite(rawMinutes)) {
        return defaultTtl;
    }
    return Math.min(ceiling, Math.max(USER_IMPERSONATION_MIN_TTL_MINUTES, Math.round(rawMinutes)));
}
