import { parseBooleanEnv } from '@memberjunction/config';

/**
 * Resolves the shipped default for `realtime.enabled` from the MJ_REALTIME_ENABLED env var.
 *
 * ## Why this is a function and not an inline expression
 *
 * Like telemetry, `DEFAULT_SERVER_CONFIG` — the base of the merge in `loadConfig()` — supplies
 * `realtime.enabled`. Extracting it here keeps it unit-testable without pulling in config.ts's full
 * dependency graph.
 *
 * ## Semantics
 *
 * Realtime is **on by default**. An unset or blank variable leaves it on; anything
 * {@link parseBooleanEnv} reads as false (`'false'`, `'0'`, `'no'`, `'off'`) turns it off.
 * Blank is deliberately treated as unset rather than as false, so an empty variable exported by a
 * deployment script cannot silently disable realtime.
 *
 * @param rawEnvValue - the raw `process.env.MJ_REALTIME_ENABLED` value
 * @returns whether realtime broker should be enabled by default
 */
export function RealtimeEnabledDefault(rawEnvValue: string | undefined | null): boolean {
  return rawEnvValue?.trim() ? parseBooleanEnv(rawEnvValue) : true;
}
