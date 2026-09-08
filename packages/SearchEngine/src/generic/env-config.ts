/**
 * @fileoverview Internal helpers for reading deployment-time configuration overrides from the
 * environment. Not part of the package's public API — `index.ts` does not re-export this module.
 *
 * @module @memberjunction/search-engine
 */

import { LogErrorEx } from '@memberjunction/core';

/**
 * Read a positive-integer deployment override from an environment variable, falling back to
 * `defaultValue` when the variable is unset, non-numeric, or non-positive. The `typeof process`
 * guard keeps this safe in browser bundles, where `process` is undefined. Mirrors the
 * `Number(process.env.X)` + `Number.isFinite && > 0` idiom used for the `MJ_INTEGRATION_*`
 * ceilings in `@memberjunction/integration`.
 *
 * When the variable is *present but invalid* (e.g. `"5s"`, `"0"`, `"-1"`) a warning is logged so
 * an ops-side typo surfaces at boot instead of silently reverting to the default. An unset
 * variable is the normal path and stays silent.
 */
export function envIntOverride(name: string, defaultValue: number): number {
    const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
    // Unset (or explicitly emptied) — the normal path, no override, no noise.
    if (raw === undefined || raw === '') {
        return defaultValue;
    }
    const override = Number(raw);
    if (Number.isFinite(override) && override > 0) {
        return Math.floor(override);
    }
    LogErrorEx({
        message: `Ignoring invalid ${name}="${raw}" — expected a positive integer; using default ${defaultValue}.`,
        severity: 'warning',
        category: 'SearchEngineConfig',
    });
    return defaultValue;
}
