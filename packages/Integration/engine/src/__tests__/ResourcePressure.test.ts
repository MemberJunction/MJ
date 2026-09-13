/**
 * plan.md line 158: "what happens if we run out of storage when we sync, how do we alert the user,
 * OOM (MJC should handle)".
 *
 * Nothing measured any of this, so a sync that died of OOM or a full disk did so with no warning
 * ahead of it and no explanation after — the customer was told the sync failed, never why.
 *
 * These pin the two decisions that are easy to get subtly wrong: which "free" number to trust, and
 * that a reading never throws.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EvaluatePressure, IsOutOfSpaceError, ReadResourcePressure,
  HEAP_WARN_FRACTION, DISK_WARN_FREE_BYTES,
  type ResourcePressureReading,
} from '../ResourcePressure.js';

const GB = 1024 * 1024 * 1024;
const base = (over: Partial<ResourcePressureReading> = {}): ResourcePressureReading => ({
  HeapUsedBytes: 1 * GB, HeapLimitBytes: 4 * GB, HeapUsedFraction: 0.25,
  ResidentBytes: 1.5 * GB,
  ArtifactDiskFreeBytes: 10 * GB, ArtifactDiskTotalBytes: 50 * GB,
  WorkDirFreeBytes: 10 * GB, WorkDirTotalBytes: 50 * GB,
  RunDirCount: 12, ActiveSyncCount: 1, ...over,
});

describe('EvaluatePressure', () => {
  it('is silent when there is headroom', () => {
    expect(EvaluatePressure(base())).toEqual([]);
  });

  it('warns on heap before the ceiling, not at it', () => {
    const f = EvaluatePressure(base({ HeapUsedFraction: HEAP_WARN_FRACTION + 0.01 }));
    expect(f.map(x => x.Code)).toEqual(['HOST_MEMORY_PRESSURE']);
    // the message has to be actionable by a customer, not a byte dump
    expect(f[0].Message).toMatch(/running fewer at once|batch size/);
  });

  it('reports the TIGHTER of the two volumes, since either one stops a sync', () => {
    const f = EvaluatePressure(base({
      ArtifactDiskFreeBytes: 10 * GB,
      WorkDirFreeBytes: DISK_WARN_FREE_BYTES - 1,
    }));
    expect(f.map(x => x.Code)).toContain('HOST_DISK_PRESSURE');
  });

  it('says nothing about disk when neither volume could be read', () => {
    // unreadable is not the same as full; claiming pressure here would be a false alarm
    const f = EvaluatePressure(base({ ArtifactDiskFreeBytes: null, WorkDirFreeBytes: null }));
    expect(f.map(x => x.Code)).not.toContain('HOST_DISK_PRESSURE');
  });

  it('can report both at once, memory first', () => {
    const f = EvaluatePressure(base({ HeapUsedFraction: 0.99, WorkDirFreeBytes: 1024 }));
    expect(f.map(x => x.Code)).toEqual(['HOST_MEMORY_PRESSURE', 'HOST_DISK_PRESSURE']);
  });

  it('does not divide by a zero heap limit', () => {
    expect(() => EvaluatePressure(base({ HeapLimitBytes: 0, HeapUsedFraction: 0 }))).not.toThrow();
  });
});

describe('ReadResourcePressure', () => {
  it('returns a reading even when the paths do not exist', async () => {
    // a fresh workspace has no artifact dir; a reading that threw would take the poller with it
    const r = await ReadResourcePressure({ artifactDir: '/nope/nowhere', workDir: '/nope/nowhere' });
    expect(r.ArtifactDiskFreeBytes).toBeNull();
    expect(r.HeapLimitBytes).toBeGreaterThan(0);
  });

  it('measures the real heap', async () => {
    const r = await ReadResourcePressure();
    expect(r.HeapUsedBytes).toBeGreaterThan(0);
    expect(r.HeapUsedFraction).toBeGreaterThan(0);
    expect(r.HeapUsedFraction).toBeLessThanOrEqual(1);
  });
});

describe('IsOutOfSpaceError', () => {
  it('recognises the errno forms', () => {
    expect(IsOutOfSpaceError(Object.assign(new Error('write failed'), { code: 'ENOSPC' }))).toBe(true);
    expect(IsOutOfSpaceError(Object.assign(new Error('write failed'), { code: 'EDQUOT' }))).toBe(true);
  });

  it('recognises the message forms drivers wrap it in', () => {
    expect(IsOutOfSpaceError(new Error('ENOSPC: no space left on device, write'))).toBe(true);
    expect(IsOutOfSpaceError(new Error('Disk quota exceeded'))).toBe(true);
  });

  it('does not claim an unrelated failure is a full disk', () => {
    expect(IsOutOfSpaceError(new Error('connection reset by peer'))).toBe(false);
    expect(IsOutOfSpaceError(null)).toBe(false);
  });
});

/**
 * The warning has to reach the RUN's own stream, once, before the failure — a warning that
 * repeats every entity map buries the events the run is actually about, and one that arrives
 * after the OOM is not a warning.
 */
describe('the sync loop emits pressure warnings', () => {
  const SRC = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf-8');

  it('checks at an entity-map boundary, not per record', () => {
    expect(SRC).toMatch(/this\.MergeResult\(aggregate, mapResult\);\s*\n\s*await this\.warnOnResourcePressure\(/);
  });

  it('reports each code once per run', () => {
    const body = SRC.slice(SRC.indexOf('private async warnOnResourcePressure'));
    expect(body).toMatch(/if \(warned\.has\(f\.Code\)\) continue;/);
    expect(body).toMatch(/warned\.add\(f\.Code\)/);
  });

  it('the set is per RUN, not per engine — the engine is a singleton across concurrent syncs', () => {
    expect(SRC).toMatch(/const pressureWarned = new Set<string>\(\);/);
  });

  it('never lets measurement end a sync', () => {
    const body = SRC.slice(SRC.indexOf('private async warnOnResourcePressure'));
    expect(body).toMatch(/catch \{/);
  });
});
