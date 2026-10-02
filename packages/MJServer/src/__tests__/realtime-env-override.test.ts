import { describe, it, expect } from 'vitest';
import { RealtimeEnabledDefault } from '../realtimeConfigUnits.js';

describe('RealtimeEnabledDefault (MJ_REALTIME_ENABLED)', () => {
  it('defaults to enabled when the variable is not set', () => {
    expect(RealtimeEnabledDefault(undefined)).toBe(true);
    expect(RealtimeEnabledDefault(null)).toBe(true);
  });

  it('treats a blank variable as unset, not as false', () => {
    // A deployment script exporting an empty value must not silently disable realtime.
    expect(RealtimeEnabledDefault('')).toBe(true);
    expect(RealtimeEnabledDefault('   ')).toBe(true);
  });

  it.each(['false', 'FALSE', 'False', '0', 'no', 'off', ' false '])(
    'MJ_REALTIME_ENABLED=%j disables realtime',
    value => {
      expect(RealtimeEnabledDefault(value)).toBe(false);
    }
  );

  it.each(['true', 'TRUE', '1', 'yes', 'y', 'on', 't'])(
    'MJ_REALTIME_ENABLED=%j keeps realtime enabled',
    value => {
      expect(RealtimeEnabledDefault(value)).toBe(true);
    }
  );

  it('an unrecognised value is not treated as enabled', () => {
    // parseBooleanEnv is an allow-list, so anything outside it reads as false.
    expect(RealtimeEnabledDefault('maybe')).toBe(false);
  });
});
