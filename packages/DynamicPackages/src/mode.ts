/**
 * Mode resolution — the same precedence shape as `ResolveStartupMode` in @memberjunction/core
 * (env var > programmatic option > config > default), so an operator who already knows
 * `MJ_STARTUP_MODE=task npx mj sync push` can reach for `MJ_DYNAMIC_PACKAGES=none` the same way.
 */
import { ResolveMostSpecific } from './process-id.js';
import type { DynamicPackagesMode, DynamicPackagesModeSource } from './types.js';

/**
 * Environment variable for a per-invocation override, e.g.
 * `MJ_DYNAMIC_PACKAGES=none npx mj sync push` to push with generic BaseEntity only.
 */
export const DYNAMIC_PACKAGES_MODE_ENV_VAR = 'MJ_DYNAMIC_PACKAGES';

const MODES: readonly DynamicPackagesMode[] = ['load', 'none'];

/** Accepts the canonical values plus the obvious spellings people will try. */
function parseMode(value: string | undefined | null): DynamicPackagesMode | undefined {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'off' || normalized === 'skip' || normalized === 'false' || normalized === '0') {
        return 'none';
    }
    if (normalized === 'on' || normalized === 'true' || normalized === '1' || normalized === 'full') {
        return 'load';
    }
    return MODES.find((m) => m === normalized);
}

function readEnv(): string | undefined {
    if (typeof process === 'undefined' || !process.env) {
        return undefined;
    }
    return process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
}

export interface ResolvedDynamicPackagesMode {
    mode: DynamicPackagesMode;
    source: DynamicPackagesModeSource;
    /** Set when an env/policy value was present but unparseable — the caller should surface it. */
    ignoredInvalid?: string;
}

/**
 * Highest wins:
 * 1. `MJ_DYNAMIC_PACKAGES` env var
 * 2. `option` — programmatic override from the entry point (e.g. a CLI flag)
 * 3. `policy` — `dynamicPackages.policy` from mj.config.cjs, most specific process key
 * 4. `'load'`
 *
 * An invalid env/policy value never crashes a process; it is reported and falls through.
 */
export function ResolveDynamicPackagesMode(args: {
    processId: string;
    option?: DynamicPackagesMode;
    policy?: Record<string, string> | null;
}): ResolvedDynamicPackagesMode {
    const envRaw = readEnv();
    const envMode = parseMode(envRaw);
    if (envMode) {
        return { mode: envMode, source: 'env' };
    }
    const ignoredInvalid = envRaw && !envMode ? `${DYNAMIC_PACKAGES_MODE_ENV_VAR}='${envRaw}'` : undefined;

    if (args.option) {
        return { mode: args.option, source: 'option', ignoredInvalid };
    }

    const policyRaw = ResolveMostSpecific(args.processId, args.policy);
    const policyMode = parseMode(policyRaw);
    if (policyMode) {
        return { mode: policyMode, source: 'policy', ignoredInvalid };
    }
    const policyInvalid = policyRaw && !policyMode ? `dynamicPackages.policy value '${policyRaw}'` : undefined;

    return { mode: 'load', source: 'default', ignoredInvalid: ignoredInvalid ?? policyInvalid };
}
