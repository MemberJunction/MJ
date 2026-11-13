import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { OpenAppFleetStatusProbe, OPEN_APP_FLEET_STATUS_SIGNAL_CODE } from '../../probes/OpenAppFleetStatusProbe';
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

describe('OpenAppFleetStatusProbe', () => {
  it('reports GREEN when no Open Apps are installed', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([]);
    const probe = new OpenAppFleetStatusProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(OPEN_APP_FLEET_STATUS_SIGNAL_CODE);
    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.InstalledAppCount).toBe(0);
  });

  it('reports GREEN when every installed Open App is Active', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ Name: 'mj-bizapps-collaboration', Status: 'Active', __mj_UpdatedAt: isoAgo(0) }]);
    const probe = new OpenAppFleetStatusProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('GREEN');
  });

  it('reports RED when any Open App is in Error', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([
      { Name: 'mj-bizapps-collaboration', Status: 'Active', __mj_UpdatedAt: isoAgo(0) },
      { Name: 'mj-bizapps-community', Status: 'Error', __mj_UpdatedAt: isoAgo(0) },
    ]);
    const probe = new OpenAppFleetStatusProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.Summary).toContain('mj-bizapps-community');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports YELLOW when an Open App is stuck Installing/Upgrading past the transition window', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ Name: 'mj-bizapps-community', Status: 'Upgrading', __mj_UpdatedAt: isoAgo(15 * 60 * 1000) }]);
    const probe = new OpenAppFleetStatusProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('YELLOW');
  });

  it('does not flag an Open App Installing/Upgrading within the transition window', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ Name: 'mj-bizapps-community', Status: 'Installing', __mj_UpdatedAt: isoAgo(60 * 1000) }]);
    const probe = new OpenAppFleetStatusProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('GREEN');
  });

  it('reports RED with a diagnostic when the query throws', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('timeout'));
    const probe = new OpenAppFleetStatusProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('timeout');
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new OpenAppFleetStatusProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
  });
});
