import { describe, it, expect, afterEach, vi } from 'vitest';
import { IsVerboseLoggingEnabled } from '../generic/logging';

/**
 * Regression tests for the environment guard inside `runningOnNode()` in
 * generic/logging.ts.
 *
 * `runningOnNode()` is a private helper, so we exercise it through the public
 * `IsVerboseLoggingEnabled()`, whose very first branch calls it. The behavior
 * under test: `runningOnNode()` must use a loose `process.versions != null`
 * guard so it is safe under React Native / Hermes, where `process` exists as a
 * shim but `process.versions` is `undefined`. With the old strict `!== null`
 * check, `process.versions` (undefined) passed the guard and the subsequent
 * `.node` dereference threw a TypeError.
 *
 * Global mutations (process.versions, process.env.MJ_VERBOSE, and the whole
 * `process` global) are saved and restored in `afterEach` so nothing leaks into
 * other test files.
 */
describe('runningOnNode() env guard (via IsVerboseLoggingEnabled)', () => {
  const originalVersionsDescriptor = Object.getOwnPropertyDescriptor(process, 'versions');
  const originalMjVerbose = process.env.MJ_VERBOSE;

  afterEach(() => {
    // Restore the `process` global first (in case a test stubbed it away),
    // then restore the versions property and env var to pristine state.
    vi.unstubAllGlobals();
    if (originalVersionsDescriptor) {
      Object.defineProperty(process, 'versions', originalVersionsDescriptor);
    }
    if (originalMjVerbose === undefined) {
      delete process.env.MJ_VERBOSE;
    } else {
      process.env.MJ_VERBOSE = originalMjVerbose;
    }
  });

  it('does not throw and returns a boolean when process.versions is undefined (RN/Hermes shim)', () => {
    // Simulate React Native / Hermes: `process` is defined, `process.versions` is not.
    Object.defineProperty(process, 'versions', { value: undefined, configurable: true, writable: true });

    let result: boolean | undefined;
    expect(() => { result = IsVerboseLoggingEnabled(); }).not.toThrow();
    expect(typeof result).toBe('boolean');
    // No Node env, no browser globals → falls through to the default of false.
    expect(result).toBe(false);
  });

  it('reads the Node env (runningOnNode() true) when process.versions.node is set', () => {
    // The vitest process is a real Node process, so process.versions.node exists.
    expect(process.versions.node).toBeDefined();

    process.env.MJ_VERBOSE = 'true';
    expect(IsVerboseLoggingEnabled()).toBe(true);

    process.env.MJ_VERBOSE = 'false';
    expect(IsVerboseLoggingEnabled()).toBe(false);
  });

  it('returns false without throwing when process is entirely undefined', () => {
    // typeof process === 'undefined' → runningOnNode() short-circuits to false.
    vi.stubGlobal('process', undefined);
    expect(() => IsVerboseLoggingEnabled()).not.toThrow();
    expect(IsVerboseLoggingEnabled()).toBe(false);
  });
});
