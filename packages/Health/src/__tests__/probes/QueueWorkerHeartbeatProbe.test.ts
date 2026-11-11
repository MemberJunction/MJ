import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { QueueWorkerHeartbeatProbe, QUEUE_WORKER_HEARTBEAT_SIGNAL_CODE } from '../../probes/QueueWorkerHeartbeatProbe';
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

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('QueueWorkerHeartbeatProbe', () => {
  it('reports GREEN when no scheduled job run has ever been recorded', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([]);
    const probe = new QueueWorkerHeartbeatProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(QUEUE_WORKER_HEARTBEAT_SIGNAL_CODE);
    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.TotalRunsObserved).toBe(0);
  });

  it('reports GREEN with a fresh heartbeat and no recent failures', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([
      { StartedAt: isoAgo(5_000), Success: true },
      { StartedAt: isoAgo(65_000), Success: true },
    ]);
    const probe = new QueueWorkerHeartbeatProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.FailureRatio).toBe(0);
  });

  it('reports RED when the heartbeat is stale beyond 180s', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ StartedAt: isoAgo(5 * 60 * 1000), Success: true }]);
    const probe = new QueueWorkerHeartbeatProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports RED when the recent failure ratio exceeds 15%', async () => {
    const provider = new DatabaseProviderStub();
    const rows = Array.from({ length: 10 }, (_, i) => ({ StartedAt: isoAgo(i * 1000), Success: i < 2 ? false : true }));
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue(rows);
    const probe = new QueueWorkerHeartbeatProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.ObservedMetrics.FailureRatio).toBeCloseTo(0.2, 5);
  });

  it('reports YELLOW when the failure ratio is elevated but under the RED threshold', async () => {
    const provider = new DatabaseProviderStub();
    const rows = Array.from({ length: 20 }, (_, i) => ({ StartedAt: isoAgo(i * 1000), Success: i === 0 ? false : true }));
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue(rows);
    const probe = new QueueWorkerHeartbeatProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('YELLOW');
  });

  it('reports RED with a diagnostic when the query throws', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('connection lost'));
    const probe = new QueueWorkerHeartbeatProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('connection lost');
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new QueueWorkerHeartbeatProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
  });
});
