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
  HEAP_WARN_FRACTION, DISK_WARN_FREE_BYTES, RESIDENT_WARN_FRACTION,
  type ResourcePressureReading,
} from '../ResourcePressure.js';

const GB = 1024 * 1024 * 1024;
const base = (over: Partial<ResourcePressureReading> = {}): ResourcePressureReading => ({
  HeapUsedBytes: 1 * GB, HeapLimitBytes: 4 * GB, HeapUsedFraction: 0.25,
  ResidentBytes: 1.5 * GB,
  HostMemTotalBytes: 8 * GB, HostMemAvailableBytes: 6 * GB, ResidentFraction: 1.5 / 8,
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
    expect(SRC).toMatch(/this\.MergeResult\(aggregate, mapResult\);\s*\n\s*(?:const \w+ = )?await this\.warnOnResourcePressure\(/);
  });

  it('reports each code once per run', () => {
    const body = SRC.slice(SRC.indexOf('private async warnOnResourcePressure'));
    // Deliberately not anchored to the whole condition: the guard gained a `!logger ||` clause when
    // measurement stopped depending on a logger. What must not change is that a code seen once is
    // skipped thereafter and recorded on the way past.
    expect(body).toMatch(/warned\.has\(f\.Code\)\) continue;/);
    expect(body).toMatch(/warned\.add\(f\.Code\)/);
  });

  it('feeds memory pressure into the SAME throttle signal a source rate-limit uses', () => {
    // The load-bearing line. Without it the reading is a message and nothing else, which is exactly
    // the state that let the sandbox run to a SIGKILL on 2026-09-14 with the measurement already in
    // the process. `|| memoryPressure` is what makes the AIMD controller halve the in-flight cap.
    expect(SRC).toMatch(/throttled: mapResult\.Throttled === true \|\| memoryPressure/);
  });

  it('keeps measuring when there is no logger — the throttle outlives the warning', () => {
    const body = SRC.slice(SRC.indexOf('private async warnOnResourcePressure'));
    const head = body.slice(0, body.indexOf('EvaluatePressure'));
    expect(head).not.toMatch(/if \(!logger\) return/);
  });

  it('the set is per RUN, not per engine — the engine is a singleton across concurrent syncs', () => {
    expect(SRC).toMatch(/const pressureWarned = new Set<string>\(\);/);
  });

  it('never lets measurement end a sync', () => {
    const body = SRC.slice(SRC.indexOf('private async warnOnResourcePressure'));
    expect(body).toMatch(/catch \{/);
  });
});

/**
 * The sandbox OOM of 2026-09-14, as a regression test.
 *
 * The kernel killed node at 3,478 MB RSS on a 3,830 MB box while the heap ceiling was 1,964 MB —
 * 1.8x the ceiling, because `--max-old-space-size` bounds V8's old space and NOT `Buffer` /
 * `ArrayBuffer`, which is where a connector's oversized HTTP response bodies live. Heap usage was
 * unremarkable throughout. The evaluator read ResidentBytes and then judged on HeapUsedFraction
 * alone, so the one warning that could have shed load before the SIGKILL was unreachable.
 */
const MB = 1024 * 1024;
const sandboxKill = (): ResourcePressureReading => base({
  // What the process was actually costing the box.
  ResidentBytes: 3478 * MB,
  HostMemTotalBytes: 3830 * MB,
  HostMemAvailableBytes: 120 * MB,
  ResidentFraction: 3478 / 3830,
  // ...while the heap gauge looked fine. This is the whole point.
  HeapLimitBytes: 1964 * MB, HeapUsedBytes: 600 * MB, HeapUsedFraction: 600 / 1964,
});

describe('EvaluatePressure — host memory, not just heap', () => {
  it('fires on the sandbox kill, where the heap gauge reads healthy', () => {
    const r = sandboxKill();
    expect(r.HeapUsedFraction).toBeLessThan(HEAP_WARN_FRACTION);   // the old gauge saw nothing
    const findings = EvaluatePressure(r);
    const mem = findings.filter(f => f.Code === 'HOST_MEMORY_PRESSURE');
    expect(mem).toHaveLength(1);
    expect(mem[0].Fraction).toBeCloseTo(3478 / 3830, 3);
  });

  it("names the machine, not the workspace's allowance, when the host is the bound", () => {
    expect(EvaluatePressure(sandboxKill())[0].Message).toContain("machine's memory");
  });

  it('keeps the heap wording when the heap is the bound', () => {
    const r = base({ HeapUsedFraction: 0.92, ResidentFraction: 0.10 });
    const mem = EvaluatePressure(r).filter(f => f.Code === 'HOST_MEMORY_PRESSURE');
    expect(mem).toHaveLength(1);
    expect(mem[0].Message).toContain('memory available to it');
    expect(mem[0].Message).not.toContain("machine's memory");
  });

  it('reports ONE finding at the worse of the two fractions when both are over', () => {
    const mem = EvaluatePressure(base({ HeapUsedFraction: 0.88, ResidentFraction: 0.95 }))
      .filter(f => f.Code === 'HOST_MEMORY_PRESSURE');
    expect(mem).toHaveLength(1);
    expect(mem[0].Fraction).toBeCloseTo(0.95, 3);
  });

  it('is silent just below the resident threshold, and fires just above it', () => {
    const under = base({ ResidentFraction: RESIDENT_WARN_FRACTION - 0.01 });
    const over = base({ ResidentFraction: RESIDENT_WARN_FRACTION + 0.01 });
    expect(EvaluatePressure(under).filter(f => f.Code === 'HOST_MEMORY_PRESSURE')).toHaveLength(0);
    expect(EvaluatePressure(over).filter(f => f.Code === 'HOST_MEMORY_PRESSURE')).toHaveLength(1);
  });

  it('falls back to heap-only where /proc is unreadable (ResidentFraction null)', () => {
    const r = base({ ResidentFraction: null, HostMemTotalBytes: null, HostMemAvailableBytes: null });
    expect(EvaluatePressure(r).filter(f => f.Code === 'HOST_MEMORY_PRESSURE')).toHaveLength(0);
    const hot = base({ ResidentFraction: null, HostMemTotalBytes: null, HeapUsedFraction: 0.9 });
    expect(EvaluatePressure(hot).filter(f => f.Code === 'HOST_MEMORY_PRESSURE')).toHaveLength(1);
  });
});
