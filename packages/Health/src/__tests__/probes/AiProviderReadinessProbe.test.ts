import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { AiProviderReadinessProbe, AI_PROVIDER_READINESS_SIGNAL_CODE } from '../../probes/AiProviderReadinessProbe';
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

describe('AiProviderReadinessProbe', () => {
  it('reports RED when zero active inference-provider routes are configured', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ ActiveRouteCount: 0 }]);
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(AI_PROVIDER_READINESS_SIGNAL_CODE);
    expect(evaluation.Status).toBe('RED');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports YELLOW when exactly one active route is configured (no fallback)', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ ActiveRouteCount: 1 }]);
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('YELLOW');
  });

  it('reports GREEN when two or more active routes are configured', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ ActiveRouteCount: 3 }]);
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.ActiveInferenceRouteCount).toBe(3);
    expect(evaluation.ActivePlaybook).toBeUndefined();
  });

  it('reports RED with a diagnostic when the query throws', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('permission denied'));
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('permission denied');
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new AiProviderReadinessProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
  });
});
