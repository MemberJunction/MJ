import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the provider-utils module before importing TransactionManager so
// `getDataProvider` returns a fake provider we can spy on.
const mockProvider = {
  BeginTransaction: vi.fn(async () => {}),
  CommitTransaction: vi.fn(async () => {}),
  RollbackTransaction: vi.fn(async () => {}),
};

vi.mock('../lib/provider-utils', () => ({
  getDataProvider: () => mockProvider,
}));

// Imported AFTER vi.mock so the mock is applied
import { TransactionManager } from '../lib/transaction-manager';

describe('TransactionManager', () => {
  beforeEach(() => {
    mockProvider.BeginTransaction.mockClear();
    mockProvider.CommitTransaction.mockClear();
    mockProvider.RollbackTransaction.mockClear();
  });

  describe('beginTransaction', () => {
    it('calls provider.BeginTransaction and tracks state', async () => {
      const tm = new TransactionManager();
      expect(tm.isInTransaction).toBe(false);
      await tm.beginTransaction();
      expect(mockProvider.BeginTransaction).toHaveBeenCalledTimes(1);
      expect(tm.isInTransaction).toBe(true);
    });

    it('throws if a transaction is already in progress', async () => {
      const tm = new TransactionManager();
      await tm.beginTransaction();
      await expect(tm.beginTransaction()).rejects.toThrow(/already in progress/);
    });

    it('wraps provider errors with a descriptive message', async () => {
      mockProvider.BeginTransaction.mockRejectedValueOnce(new Error('connection lost'));
      const tm = new TransactionManager();
      await expect(tm.beginTransaction()).rejects.toThrow(/Failed to begin transaction.*connection lost/);
    });
  });

  describe('commitTransaction', () => {
    it('calls provider.CommitTransaction and clears state', async () => {
      const tm = new TransactionManager();
      await tm.beginTransaction();
      await tm.commitTransaction();
      expect(mockProvider.CommitTransaction).toHaveBeenCalledTimes(1);
      expect(tm.isInTransaction).toBe(false);
    });

    it('is a no-op when no transaction is active', async () => {
      const tm = new TransactionManager();
      await tm.commitTransaction();
      expect(mockProvider.CommitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('rollbackTransaction', () => {
    it('calls provider.RollbackTransaction and clears state', async () => {
      const tm = new TransactionManager();
      await tm.beginTransaction();
      await tm.rollbackTransaction();
      expect(mockProvider.RollbackTransaction).toHaveBeenCalledTimes(1);
      expect(tm.isInTransaction).toBe(false);
    });

    it('is a no-op when no transaction is active', async () => {
      const tm = new TransactionManager();
      await tm.rollbackTransaction();
      expect(mockProvider.RollbackTransaction).not.toHaveBeenCalled();
    });

    it('swallows provider rollback errors (already in error state)', async () => {
      mockProvider.RollbackTransaction.mockRejectedValueOnce(new Error('connection broken'));
      const tm = new TransactionManager();
      await tm.beginTransaction();
      // Should not throw — rollback errors are logged, not rethrown
      await expect(tm.rollbackTransaction()).resolves.toBeUndefined();
    });
  });

  describe('executeInTransaction', () => {
    it('commits when fn succeeds', async () => {
      const tm = new TransactionManager();
      const fn = vi.fn(async () => 'result');
      const result = await tm.executeInTransaction(fn);
      expect(result).toBe('result');
      expect(mockProvider.BeginTransaction).toHaveBeenCalledTimes(1);
      expect(mockProvider.CommitTransaction).toHaveBeenCalledTimes(1);
      expect(mockProvider.RollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back when fn throws', async () => {
      const tm = new TransactionManager();
      const fn = vi.fn(async () => {
        throw new Error('save failed mid-tx');
      });
      await expect(tm.executeInTransaction(fn)).rejects.toThrow('save failed mid-tx');
      expect(mockProvider.BeginTransaction).toHaveBeenCalledTimes(1);
      expect(mockProvider.CommitTransaction).not.toHaveBeenCalled();
      expect(mockProvider.RollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('rolls back when fn throws synchronously', async () => {
      const tm = new TransactionManager();
      const fn = (() => {
        throw new Error('sync failure');
      }) as () => Promise<unknown>;
      await expect(tm.executeInTransaction(fn)).rejects.toThrow('sync failure');
      expect(mockProvider.RollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('preserves transaction state after a successful commit', async () => {
      const tm = new TransactionManager();
      await tm.executeInTransaction(async () => 'ok');
      expect(tm.isInTransaction).toBe(false);
    });

    it('preserves transaction state after a failed rollback', async () => {
      const tm = new TransactionManager();
      await expect(
        tm.executeInTransaction(async () => { throw new Error('boom'); })
      ).rejects.toThrow('boom');
      expect(tm.isInTransaction).toBe(false);
    });
  });
});
