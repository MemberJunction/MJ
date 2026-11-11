import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { LiveEntityCrudProbe, LIVE_ENTITY_CRUD_SIGNAL_CODE } from '../../probes/LiveEntityCrudProbe';
import type { HealthProbeContext } from '../../types';

function makeContext(provider: DatabaseProviderStub): HealthProbeContext {
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    Mode: 'live-test',
    TimeoutMs: 15_000,
  };
}

describe('LiveEntityCrudProbe', () => {
  it('reports GREEN and always rolls back the synthetic transaction on success', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{}]);
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const commitSpy = vi.spyOn(provider, 'CommitTransaction');
    const probe = new LiveEntityCrudProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(LIVE_ENTITY_CRUD_SIGNAL_CODE);
    expect(evaluation.Status).toBe('GREEN');
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('reports RED and still rolls back when the synthetic write fails', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('write path broken'));
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const probe = new LiveEntityCrudProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('write path broken');
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
  });

  it('declares itself as a live-test probe owned by MJ Core', () => {
    const probe = new LiveEntityCrudProbe();
    expect(probe.Mode).toBe('live-test');
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.SignalDefinitions[0].Layer).toBe('live-test');
  });
});
