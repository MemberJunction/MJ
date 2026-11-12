import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { SchemaMigrationParityProbe, SCHEMA_MIGRATION_PARITY_SIGNAL_CODE } from '../../probes/SchemaMigrationParityProbe';
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

describe('SchemaMigrationParityProbe', () => {
  it('reports GREEN when every migration succeeded', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([
      { version: '202601010000', success: true },
      { version: '202601020000', success: true },
    ]);
    const probe = new SchemaMigrationParityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(SCHEMA_MIGRATION_PARITY_SIGNAL_CODE);
    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.AppliedMigrationCount).toBe(2);
    expect(evaluation.ActivePlaybook).toBeUndefined();
  });

  it('reports RED when the most recent migration failed', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([
      { version: '202601010000', success: true },
      { version: '202601020000', success: false },
    ]);
    const probe = new SchemaMigrationParityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.Summary).toContain('202601020000');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports GREEN when a historical failure was repaired by a subsequent successful attempt', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([
      { version: '202601010000', success: false },
      { version: '202601010000', success: true },
      { version: '202601020000', success: true },
    ]);
    const probe = new SchemaMigrationParityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.HistoricalFailedAttempts).toBe(1);
    expect(evaluation.ObservedMetrics.UnrepairedCount).toBe(0);
  });

  it('reports YELLOW when an earlier migration failed and was never repaired', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([
      { version: '202601010000', success: false },
      { version: '202601020000', success: true },
    ]);
    const probe = new SchemaMigrationParityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('YELLOW');
    expect(evaluation.ObservedMetrics.UnrepairedCount).toBe(1);
  });

  it('reports RED when no migration history can be read at all', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([]);
    const probe = new SchemaMigrationParityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.Summary).toContain('No migration history');
  });

  it('reports RED with a diagnostic when the history query throws', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('table does not exist'));
    const probe = new SchemaMigrationParityProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('table does not exist');
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new SchemaMigrationParityProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
    expect(probe.SignalDefinitions[0].Code).toBe(SCHEMA_MIGRATION_PARITY_SIGNAL_CODE);
  });
});
