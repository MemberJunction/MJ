/**
 * Config-contract regression test for MJ_TELEMETRY_ENABLED.
 *
 * The env var used to be read inside `telemetrySchema` in config.ts:
 *
 *   enabled: zodBooleanWithTransforms().default(process.env.MJ_TELEMETRY_ENABLED !== 'false')
 *
 * A Zod `.default()` only fires when the key is ABSENT from the object being parsed, and
 * `DEFAULT_SERVER_CONFIG` — the base of the merge in `loadConfig()` — always supplies
 * `telemetry.enabled`. The key was therefore never absent, the default never ran, and setting
 * MJ_TELEMETRY_ENABLED=false did nothing at all: telemetry came back on after every restart, and
 * the only way to disable it was `telemetry: { enabled: false }` in mj.config.cjs.
 *
 * The read now lives at the point the value is produced (DEFAULT_SERVER_CONFIG), via the pure
 * helper this suite pins — the same extract-for-testability shape as
 * `providerConfigUnits.ts` / `config-units.test.ts`, which keeps the test off config.ts's full
 * dependency graph.
 */
import { describe, it, expect } from 'vitest';
import { TelemetryEnabledDefault } from '../telemetryConfigUnits.js';

describe('TelemetryEnabledDefault (MJ_TELEMETRY_ENABLED)', () => {
  it('defaults to enabled when the variable is not set', () => {
    expect(TelemetryEnabledDefault(undefined)).toBe(true);
    expect(TelemetryEnabledDefault(null)).toBe(true);
  });

  it('treats a blank variable as unset, not as false', () => {
    // A deployment script exporting an empty value must not silently disable telemetry.
    expect(TelemetryEnabledDefault('')).toBe(true);
    expect(TelemetryEnabledDefault('   ')).toBe(true);
  });

  // The regression itself: every one of these evaluated to `true` before the fix, because the
  // schema default that read them could never fire.
  it.each(['false', 'FALSE', 'False', '0', 'no', 'off', ' false '])(
    'MJ_TELEMETRY_ENABLED=%j disables telemetry',
    value => {
      expect(TelemetryEnabledDefault(value)).toBe(false);
    }
  );

  it.each(['true', 'TRUE', '1', 'yes', 'y', 'on', 't'])(
    'MJ_TELEMETRY_ENABLED=%j keeps telemetry enabled',
    value => {
      expect(TelemetryEnabledDefault(value)).toBe(true);
    }
  );

  it('an unrecognised value is not treated as enabled', () => {
    // parseBooleanEnv is an allow-list, so anything outside it reads as false. Pinned so the
    // behaviour is a decision rather than an accident.
    expect(TelemetryEnabledDefault('maybe')).toBe(false);
  });
});
