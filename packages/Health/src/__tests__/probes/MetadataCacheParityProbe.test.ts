import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MetadataCacheParityProbe, METADATA_CACHE_PARITY_SIGNAL_CODE } from '../../probes/MetadataCacheParityProbe';
import type { HealthProbeContext } from '../../types';

function makeContext(entityCount: number): HealthProbeContext {
  const metadataProvider = {
    Entities: Array.from({ length: entityCount }, () => ({}) as EntityInfo),
  } as unknown as IMetadataProvider;

  return {
    DatabaseProvider: {} as HealthProbeContext['DatabaseProvider'],
    MetadataProvider: metadataProvider,
    SystemUser: {} as UserInfo,
    Mode: 'passive',
    TimeoutMs: 15_000,
  };
}

describe('MetadataCacheParityProbe', () => {
  it('reports RED when no entities are loaded', async () => {
    const probe = new MetadataCacheParityProbe();
    const [evaluation] = await probe.Evaluate(makeContext(0));

    expect(evaluation.Code).toBe(METADATA_CACHE_PARITY_SIGNAL_CODE);
    expect(evaluation.Status).toBe('RED');
    expect(evaluation.ObservedMetrics.EntityCount).toBe(0);
  });

  it('reports YELLOW when the entity count is implausibly small', async () => {
    const probe = new MetadataCacheParityProbe();
    const [evaluation] = await probe.Evaluate(makeContext(3));

    expect(evaluation.Status).toBe('YELLOW');
  });

  it('reports GREEN when a healthy number of entities are loaded', async () => {
    const probe = new MetadataCacheParityProbe();
    const [evaluation] = await probe.Evaluate(makeContext(250));

    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ActivePlaybook).toBeUndefined();
  });
});
