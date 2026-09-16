/**
 * The applying half. `MemoryGovernor` is where the decision is proven; this is where it can be
 * quietly wrong in ways that only show up on a live sync — a page size raised instead of lowered,
 * a calibration that never closes, a throw that fails a run it was meant to protect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let resident = 1000 * 1024 * 1024;
const HOST = 3830 * 1024 * 1024;

vi.mock('../ResourcePressure.js', () => ({
  ReadResourcePressure: async () => ({
    HeapUsedBytes: 0, HeapLimitBytes: 0, HeapUsedFraction: 0,
    ResidentBytes: resident,
    HostMemTotalBytes: HOST,
    HostMemAvailableBytes: HOST - resident,
    ResidentFraction: resident / HOST,
    ArtifactDiskFreeBytes: null, ArtifactDiskTotalBytes: null,
    WorkDirFreeBytes: null, WorkDirTotalBytes: null,
    RunDirCount: null, ActiveSyncCount: 1
  })
}));

const { RunMemoryControl, MIN_BATCH_SIZE, estimateBytesPerRecord } = await import('../RunMemoryControl.js');

const hooks = () => {
  const calls: string[] = [];
  let cap = 8;
  return {
    calls,
    capOf: () => cap,
    hooks: {
      HoldAdmissions: () => { calls.push('hold'); },
      ReduceConcurrency: () => { calls.push('reduce'); cap = Math.max(1, Math.floor(cap / 2)); },
      CurrentInFlight: () => cap,
      Report: () => { calls.push('report'); }
    }
  };
};

/** A fat record, so one batch models a meaningful amount of memory. */
const fat = { id: 1, blob: 'x'.repeat(4000) };

beforeEach(() => { resident = 1000 * 1024 * 1024; });

describe('the page-size floor bounds shrinking, and never raises', () => {
  it('leaves a deliberately small configured batch size alone', () => {
    // The regression this exists for: flooring the INITIAL size at 25 silently raises a batch size
    // of 2 — which changes what the connector is asked for, and stops an over-size batch from
    // reading as over-size, because the comparison is against what was asked.
    const h = hooks();
    expect(new RunMemoryControl(h.hooks, 2).BatchSize).toBe(2);
    expect(new RunMemoryControl(h.hooks, 1).BatchSize).toBe(1);
  });

  it('keeps a normal batch size exactly as configured', () => {
    expect(new RunMemoryControl(hooks().hooks, 200).BatchSize).toBe(200);
  });

  it('halves under pressure, and stops at the floor rather than reaching one record', () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 800);
    resident = Math.floor(HOST * 0.95);
    // Honouring the batch size makes SHRINK_BATCH the top-ranked lever.
    const shrinkTwice = async () => {
      for (let i = 0; i < 12; i++) {
        await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 800, SampleRecord: fat, HonoursBatchSize: true });
      }
    };
    return shrinkTwice().then(() => {
      expect(c.BatchSize).toBeLessThan(800);
      expect(c.BatchSize).toBeGreaterThanOrEqual(MIN_BATCH_SIZE);
    });
  });
});

describe('NoteBatch', () => {
  it('does nothing while there is headroom', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.2);
    const plan = await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 200, SampleRecord: fat, HonoursBatchSize: true });
    expect(plan?.Levers ?? []).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });

  it('sheds under pressure and reports ONCE, not every batch', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    for (let i = 0; i < 4; i++) {
      await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 2000, SampleRecord: fat, HonoursBatchSize: false });
    }
    expect(h.calls.filter(c => c === 'report')).toHaveLength(1);
    expect(h.calls).toContain('hold');
  });

  it('reaches for concurrency when the connector will not honour a smaller page', async () => {
    // Nimble: 2,000 returned against 200 asked. Shrinking the page frees nothing, so the plan must
    // fall through to a lever that actually does.
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.99);
    await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 2000, SampleRecord: fat, HonoursBatchSize: false });
    expect(c.BatchSize).toBe(200);            // untouched — it would have bought nothing
    expect(h.calls).toContain('hold');
  });

  it('never throws, whatever it is handed', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 10, SampleRecord: circular, HonoursBatchSize: true })
    ).resolves.not.toThrow();
  });

  it('ignores an empty sample rather than modelling zero-cost memory', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    const plan = await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 0, SampleRecord: fat, HonoursBatchSize: true });
    expect(plan?.Levers ?? []).toHaveLength(0);
  });

  it('corrects its model when shedding frees less than it promised', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    const before = c.Calibration;
    // First call sheds and records a projection; the second observes that RSS barely moved.
    await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 2000, SampleRecord: fat, HonoursBatchSize: false });
    resident = Math.floor(HOST * 0.945);
    await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 2000, SampleRecord: fat, HonoursBatchSize: false });
    expect(c.Calibration).toBeLessThan(before);
  });
});

describe('estimateBytesPerRecord', () => {
  it('scales with the record, and never stringifies a whole batch', () => {
    const small = estimateBytesPerRecord({ a: 1 });
    const big = estimateBytesPerRecord(fat);
    expect(big).toBeGreaterThan(small);
  });

  it('returns 0 rather than a wrong number on something unserialisable', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(estimateBytesPerRecord(circular)).toBe(0);
  });
});
