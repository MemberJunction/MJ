/**
 * The applying half. `MemoryGovernor` is where the decision is proven; this is where it can be
 * quietly wrong in ways that only show up on a live sync — a page size raised instead of lowered,
 * a calibration that never closes, a throw that fails a run it was meant to protect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let resident = 1000 * 1024 * 1024;
/** What the host still has to give. Null means "everything this process is not using". */
let available: number | null = null;
const HOST = 3830 * 1024 * 1024;

vi.mock('../ResourcePressure.js', () => ({
  ReadResourcePressure: async () => ({
    HeapUsedBytes: 0, HeapLimitBytes: 0, HeapUsedFraction: 0,
    ResidentBytes: resident,
    HostMemTotalBytes: HOST,
    HostMemAvailableBytes: available ?? HOST - resident,
    ResidentFraction: resident / HOST,
    ArtifactDiskFreeBytes: null, ArtifactDiskTotalBytes: null,
    WorkDirFreeBytes: null, WorkDirTotalBytes: null,
    RunDirCount: null, ActiveSyncCount: 1
  })
}));

const { RunMemoryControl, MIN_BATCH_SIZE, DECISION_INTERVAL_MS, estimateBytesPerRecord } = await import('../RunMemoryControl.js');

const hooks = () => {
  const calls: string[] = [];
  let cap = 8;
  const clock = { now: 1_000_000 };
  return {
    calls,
    clock,
    capOf: () => cap,
    /** Move past the decision window, so the next batch is allowed to decide. */
    tick: () => { clock.now += DECISION_INTERVAL_MS; },
    hooks: {
      HoldAdmissions: () => { calls.push('hold'); },
      ReleaseAdmissions: () => { calls.push('release'); },
      ReduceConcurrency: () => { calls.push('reduce'); cap = Math.max(1, Math.floor(cap / 2)); },
      CurrentInFlight: () => cap,
      Report: () => { calls.push('report'); },
      Now: () => clock.now
    }
  };
};

/** A fat record, so one batch models a meaningful amount of memory. */
const fat = { id: 1, blob: 'x'.repeat(4000) };

beforeEach(() => { resident = 1000 * 1024 * 1024; available = null; });

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
    const shrinkRepeatedly = async () => {
      for (let i = 0; i < 12; i++) {
        await c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 800, SampleRecord: fat, HonoursBatchSize: true });
        h.tick();
      }
    };
    return shrinkRepeatedly().then(() => {
      expect(c.BatchSize).toBe(MIN_BATCH_SIZE);
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
    h.tick();
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

describe('pacing and recovery', () => {
  const note = (c: InstanceType<typeof RunMemoryControl>) =>
    c.NoteBatch({ EntityMapID: 'm1', ObservedRecords: 200, SampleRecord: fat, HonoursBatchSize: true });

  it('does not shed on a busy box whose host still has room', async () => {
    // The sandbox, 2026-10-23: RSS past 70% of RAM because the heap is sized at (RAM - 1 GB) x 0.70, while
    // the kernel still had a fifth of the machine to give. That is a normal sync, not pressure.
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.72);
    available = Math.floor(HOST * 0.22);
    await note(c);
    expect(h.calls).toHaveLength(0);
    expect(c.BatchSize).toBe(200);
  });

  it('takes ONE step for a pressure reading, however many maps report it at once', async () => {
    // Five maps in flight each report a batch in the same instant. Acting on all five took the cap to 1
    // and the page to its floor before the first cut could free anything.
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    for (let i = 0; i < 5; i++) await note(c);
    expect(h.calls.filter(x => x === 'reduce')).toHaveLength(1);
    expect(c.BatchSize).toBe(100);
  });

  it('gives back the hold and the page once the host recovers', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    await note(c);
    h.tick();
    await note(c);
    expect(c.BatchSize).toBe(50);

    resident = Math.floor(HOST * 0.5);
    for (let i = 0; i < 4; i++) { h.tick(); await note(c); }
    expect(h.calls).toContain('release');
    expect(c.BatchSize).toBe(200);
  });

  it('holds steady between the lines', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    await note(c);
    resident = Math.floor(HOST * 0.8);
    for (let i = 0; i < 4; i++) { h.tick(); await note(c); }
    expect(c.BatchSize).toBe(100);
    expect(h.calls).not.toContain('release');
  });

  it('reports a new episode after a full recovery', async () => {
    const h = hooks();
    const c = new RunMemoryControl(h.hooks, 200);
    resident = Math.floor(HOST * 0.95);
    await note(c);
    resident = Math.floor(HOST * 0.5);
    h.tick(); await note(c);
    resident = Math.floor(HOST * 0.95);
    h.tick(); await note(c);
    expect(h.calls.filter(x => x === 'report')).toHaveLength(2);
  });
});
