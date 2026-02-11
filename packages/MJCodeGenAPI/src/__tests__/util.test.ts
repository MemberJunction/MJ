import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/codegen-lib', () => ({
  initializeConfig: vi.fn(),
  RunCodeGenBase: class {},
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      ClassFactory: {
        CreateInstance: vi.fn().mockReturnValue({
          setupDataSource: vi.fn().mockResolvedValue(undefined),
        }),
      },
    },
  },
}));

import { timeout, ___initialized, handleServerInit } from '../util';

describe('MJCodeGenAPI util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('timeout', () => {
    it('should reject after the specified time', async () => {
      vi.useFakeTimers();
      const promise = timeout(1000);
      vi.advanceTimersByTime(1000);
      await expect(promise).rejects.toThrow('Batch operation timed out');
      vi.useRealTimers();
    });

    it('should not resolve before timeout', async () => {
      vi.useFakeTimers();
      let rejected = false;
      timeout(5000).catch(() => { rejected = true; });
      vi.advanceTimersByTime(2000);
      // Flush all pending microtasks
      await vi.advanceTimersByTimeAsync(0);
      expect(rejected).toBe(false);
      vi.advanceTimersByTime(3000);
      await vi.advanceTimersByTimeAsync(0);
      expect(rejected).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('___initialized', () => {
    it('should start as false', () => {
      expect(___initialized).toBe(false);
    });
  });

  describe('handleServerInit', () => {
    it('should be a function', () => {
      expect(typeof handleServerInit).toBe('function');
    });
  });
});
