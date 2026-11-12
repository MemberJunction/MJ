import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { DbConnectivityProbe, DB_CONNECTIVITY_SIGNAL_CODE } from '../../probes/DbConnectivityProbe';
import type { HealthProbeContext } from '../../types';

function makeContext(provider: DatabaseProviderStub): HealthProbeContext {
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    Mode: 'passive',
    TimeoutMs: 15_000,
  };
}

describe('DbConnectivityProbe', () => {
  it('reports GREEN when ExecuteSQL resolves quickly', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{}]);
    const probe = new DbConnectivityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(DB_CONNECTIVITY_SIGNAL_CODE);
    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ActivePlaybook).toBeUndefined();
    expect(evaluation.ObservedMetrics.LatencyMs).toBeTypeOf('number');
  });

  it('reports RED with a diagnostic when ExecuteSQL throws', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('connection refused'));
    const probe = new DbConnectivityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('connection refused');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports YELLOW when latency crosses the warning threshold but stays below RED', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([{}]), 80)));
    const probe = new DbConnectivityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('YELLOW');
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new DbConnectivityProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
    expect(probe.SignalDefinitions[0].Code).toBe(DB_CONNECTIVITY_SIGNAL_CODE);
  });
});
