import { describe, it, expect, afterEach, vi } from 'vitest';
import { LogError, LogStatus } from '../generic/logging';

describe('console logging strips CR and LF from string values', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LogStatus writes a caller-supplied message as one line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    LogStatus('login for bob\n[ERROR] forged entry');
    const written = spy.mock.calls.flat().filter((a): a is string => typeof a === 'string');
    expect(written.join(' ')).toContain('login for bob');
    expect(written.some((a) => /[\r\n]/.test(a))).toBe(false);
  });

  it('LogError writes a caller-supplied message as one line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    LogError('failed for bob\r\n[INFO] forged entry');
    const written = spy.mock.calls.flat().filter((a): a is string => typeof a === 'string');
    expect(written.join(' ')).toContain('failed for bob');
    expect(written.some((a) => /[\r\n]/.test(a))).toBe(false);
  });
});
