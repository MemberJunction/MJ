import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { BaseHealthProbe, HealthProbeRollbackError } from '../BaseHealthProbe';
import type { HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from '../types';

/** Minimal concrete probe so tests can reach the protected `WithRolledBackTransaction` helper. */
class TestProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return 'test.probe';
  }
  public override get OwnerApp(): string {
    return '__mj';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'live-test';
  }
  public override get SignalDefinitions(): readonly HealthSignalDefinition[] {
    return [];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    return [];
  }

  public async RunRolledBack<T>(context: HealthProbeContext, fn: (txProvider: DatabaseProviderBase) => Promise<T>): Promise<T> {
    return this.WithRolledBackTransaction(context, fn);
  }
}

function makeContext(provider: DatabaseProviderBase): HealthProbeContext {
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    Mode: 'live-test',
    TimeoutMs: 15_000,
  };
}

describe('BaseHealthProbe.WithRolledBackTransaction', () => {
  it('rolls back after the work succeeds', async () => {
    const provider = new DatabaseProviderStub();
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const commitSpy = vi.spyOn(provider, 'CommitTransaction');
    const probe = new TestProbe();

    const result = await probe.RunRolledBack(makeContext(provider), async () => 'done');

    expect(result).toBe('done');
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('rolls back and re-throws when the work fails', async () => {
    const provider = new DatabaseProviderStub();
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const probe = new TestProbe();

    await expect(
      probe.RunRolledBack(makeContext(provider), async () => {
        throw new Error('synthetic failure');
      }),
    ).rejects.toThrow('synthetic failure');

    expect(rollbackSpy).toHaveBeenCalledTimes(1);
  });

  it('passes the same provider instance through to the callback', async () => {
    const provider = new DatabaseProviderStub();
    const probe = new TestProbe();

    let receivedProvider: DatabaseProviderBase | undefined;
    await probe.RunRolledBack(makeContext(provider), async (txProvider) => {
      receivedProvider = txProvider;
    });

    expect(receivedProvider).toBe(provider);
  });

  it('surfaces a rollback failure as HealthProbeRollbackError when the work succeeded', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'RollbackTransaction').mockRejectedValue(new Error('savepoint vanished'));
    const probe = new TestProbe();

    await expect(probe.RunRolledBack(makeContext(provider), async () => 'done')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HealthProbeRollbackError);
      const rollbackError = error as HealthProbeRollbackError;
      expect(rollbackError.ProbeKey).toBe('test.probe');
      expect(rollbackError.FnError).toBeUndefined();
      return true;
    });
  });

  it('re-throws the original work error (not the rollback error) when both fail', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'RollbackTransaction').mockRejectedValue(new Error('savepoint vanished'));
    const probe = new TestProbe();

    await expect(
      probe.RunRolledBack(makeContext(provider), async () => {
        throw new Error('synthetic failure');
      }),
    ).rejects.toThrow('synthetic failure');
  });
});
