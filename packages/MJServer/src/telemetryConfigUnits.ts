import { parseBooleanEnv } from '@memberjunction/config';

/**
 * Resolves the shipped default for `telemetry.enabled` from the MJ_TELEMETRY_ENABLED env var.
 *
 * ## Why this is a function and not an inline expression
 *
 * The env var used to be read inside `telemetrySchema`:
 *
 * ```ts
 * enabled: zodBooleanWithTransforms().default(process.env.MJ_TELEMETRY_ENABLED !== 'false')
 * ```
 *
 * A Zod `.default()` only fires when the key is **absent** from the object being parsed, and
 * `DEFAULT_SERVER_CONFIG` — the base of the merge in `loadConfig()` — always supplies
 * `telemetry.enabled`. The key was therefore never absent, the default never ran, and
 * `MJ_TELEMETRY_ENABLED=false` did nothing: telemetry came back on after every restart and the
 * only way to disable it was `telemetry: { enabled: false }` in `mj.config.cjs`.
 *
 * The read now happens where the value is actually produced (DEFAULT_SERVER_CONFIG), matching the
 * shape already used for `loggingSettings.graphql.logVariables`. Extracting it here keeps it
 * unit-testable without pulling in config.ts's full dependency graph — the same reason
 * `providerConfigUnits.ts` exists.
 *
 * ## Semantics
 *
 * Telemetry is **on by default**. An unset or blank variable leaves it on; anything
 * {@link parseBooleanEnv} reads as false (`'false'`, `'0'`, `'no'`, `'off'`) turns it off.
 * Blank is deliberately treated as unset rather than as false, so an empty variable exported by a
 * deployment script cannot silently disable telemetry.
 *
 * @param rawEnvValue - the raw `process.env.MJ_TELEMETRY_ENABLED` value
 * @returns whether telemetry should be enabled by default
 */
export function TelemetryEnabledDefault(rawEnvValue: string | undefined | null): boolean {
  return rawEnvValue?.trim() ? parseBooleanEnv(rawEnvValue) : true;
}
