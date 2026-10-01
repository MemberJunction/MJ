import { describe, it, expect } from 'vitest';
import { CODE_EXECUTION_LIMITS, ResolveExecutionLimits } from '../limits';

describe('ResolveExecutionLimits', () => {
  it('leaves unsupplied limits absent and reports no adjustments', () => {
    const r = ResolveExecutionLimits({});
    expect(r.TimeoutSeconds).toBeUndefined();
    expect(r.MemoryLimitMB).toBeUndefined();
    expect(r.Adjustments).toEqual([]);
  });

  it('treats null like undefined', () => {
    const r = ResolveExecutionLimits({ timeoutSeconds: null, memoryLimitMB: null });
    expect(r.TimeoutSeconds).toBeUndefined();
    expect(r.Adjustments).toEqual([]);
  });

  it('passes values at the boundaries through untouched', () => {
    const r = ResolveExecutionLimits({
      timeoutSeconds: CODE_EXECUTION_LIMITS.Timeout.MaxSeconds,
      memoryLimitMB: CODE_EXECUTION_LIMITS.Memory.MinMB
    });
    expect(r.TimeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.MaxSeconds);
    expect(r.MemoryLimitMB).toBe(CODE_EXECUTION_LIMITS.Memory.MinMB);
    expect(r.Adjustments).toEqual([]);
  });

  it('records the reason for each adjustment', () => {
    const r = ResolveExecutionLimits({ timeoutSeconds: 1e9, memoryLimitMB: 0 });
    expect(r.Adjustments).toEqual([
      { Parameter: 'timeoutSeconds', Requested: 1e9, Applied: CODE_EXECUTION_LIMITS.Timeout.MaxSeconds, Reason: 'above-maximum' },
      { Parameter: 'memoryLimitMB', Requested: 0, Applied: CODE_EXECUTION_LIMITS.Memory.DefaultMB, Reason: 'invalid' }
    ]);
  });

  it('rejects non-numeric input as invalid instead of coercing it', () => {
    const r = ResolveExecutionLimits({ timeoutSeconds: '999999', memoryLimitMB: {} });
    expect(r.TimeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.DefaultSeconds);
    expect(r.MemoryLimitMB).toBe(CODE_EXECUTION_LIMITS.Memory.DefaultMB);
    expect(r.Adjustments.every(a => a.Reason === 'invalid')).toBe(true);
  });

  it('floors fractional memory to a whole MB for isolated-vm', () => {
    expect(ResolveExecutionLimits({ memoryLimitMB: 100.9 }).MemoryLimitMB).toBe(100);
  });

  it('keeps fractional timeouts', () => {
    expect(ResolveExecutionLimits({ timeoutSeconds: 1.5 }).TimeoutSeconds).toBe(1.5);
  });

  it('raises a sub-floor timeout to the floor', () => {
    const r = ResolveExecutionLimits({ timeoutSeconds: 0.2 });
    expect(r.TimeoutSeconds).toBe(CODE_EXECUTION_LIMITS.Timeout.MinSeconds);
    expect(r.Adjustments[0].Reason).toBe('below-minimum');
  });

  it('keeps defaults within the allowed range', () => {
    const { Timeout, Memory } = CODE_EXECUTION_LIMITS;
    expect(Timeout.DefaultSeconds).toBeGreaterThanOrEqual(Timeout.MinSeconds);
    expect(Timeout.DefaultSeconds).toBeLessThanOrEqual(Timeout.MaxSeconds);
    expect(Memory.DefaultMB).toBeGreaterThanOrEqual(Memory.MinMB);
    expect(Memory.DefaultMB).toBeLessThanOrEqual(Memory.MaxMB);
  });
});
