import { describe, it, expect, beforeEach } from 'vitest';
import type { TelemetryEvent, TelemetryEventCallback, TelemetryManager } from '@memberjunction/core';
import { LocalTelemetrySignalBridge } from '../../telemetry/LocalTelemetrySignalBridge';
import type { InstanceHealthReport } from '../../types';

/** Minimal fake standing in for `Pick<TelemetryManager, 'OnEvent'>` — lets tests fire events on demand. */
class FakeTelemetryManager implements Pick<TelemetryManager, 'OnEvent'> {
  private listeners: TelemetryEventCallback[] = [];

  public OnEvent(listener: TelemetryEventCallback): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public Emit(event: TelemetryEvent, type: 'start' | 'end'): void {
    for (const listener of this.listeners) listener(event, type);
  }

  public get ListenerCount(): number {
    return this.listeners.length;
  }
}

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: 'evt-1',
    category: 'RunView',
    operation: 'ProviderBase.RunView',
    fingerprint: 'fp-1',
    startTime: 0,
    endTime: 10,
    elapsedMs: 10,
    params: {},
    ...overrides,
  };
}

function makeHealthReport(overrides: Partial<InstanceHealthReport['SummaryCounts']> = {}): InstanceHealthReport {
  return {
    OverallStatus: 'GREEN',
    MJVersion: '6.2.0',
    DatabasePlatform: 'sqlserver',
    EvaluatedAt: new Date().toISOString(),
    TotalDurationMs: 5,
    Mode: 'passive',
    SummaryCounts: { Green: 1, Yellow: 0, Red: 0, ...overrides },
    Signals: [],
  };
}

describe('LocalTelemetrySignalBridge', () => {
  beforeEach(() => {
    LocalTelemetrySignalBridge.Instance.Detach();
    LocalTelemetrySignalBridge.Instance.Reset();
    LocalTelemetrySignalBridge.Instance.Configure({ Granularity: 'minute', MaxBucketsPerSeries: 1440, MaxAgeMs: 24 * 60 * 60 * 1000 });
  });

  it('rolls a completed telemetry event into a count bucket for its category', () => {
    const fakeManager = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);

    fakeManager.Emit(makeEvent({ category: 'RunView', elapsedMs: 42 }), 'end');

    const buckets = LocalTelemetrySignalBridge.Instance.GetCountBuckets('RunView');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].Count).toBe(1);
    expect(buckets[0].TotalElapsedMs).toBe(42);
  });

  it('ignores "start" lifecycle notifications — only "end" events are counted', () => {
    const fakeManager = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);

    fakeManager.Emit(makeEvent(), 'start');

    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets()).toHaveLength(0);
  });

  it('accumulates multiple events in the same bucket rather than overwriting', () => {
    const fakeManager = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);

    fakeManager.Emit(makeEvent({ category: 'AI', elapsedMs: 10 }), 'end');
    fakeManager.Emit(makeEvent({ category: 'AI', elapsedMs: 20 }), 'end');

    const [bucket] = LocalTelemetrySignalBridge.Instance.GetCountBuckets('AI');
    expect(bucket.Count).toBe(2);
    expect(bucket.TotalElapsedMs).toBe(30);
  });

  it('keeps separate buckets per category', () => {
    const fakeManager = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);

    fakeManager.Emit(makeEvent({ category: 'RunView' }), 'end');
    fakeManager.Emit(makeEvent({ category: 'AI' }), 'end');

    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets('RunView')).toHaveLength(1);
    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets('AI')).toHaveLength(1);
    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets()).toHaveLength(2);
  });

  it('Detach stops further telemetry events from being recorded', () => {
    const fakeManager = new FakeTelemetryManager();
    const detach = LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);
    expect(fakeManager.ListenerCount).toBe(1);

    detach();
    expect(fakeManager.ListenerCount).toBe(0);

    fakeManager.Emit(makeEvent(), 'end');
    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets()).toHaveLength(0);
  });

  it('replaces a prior subscription rather than stacking a second one', () => {
    const fakeManagerA = new FakeTelemetryManager();
    const fakeManagerB = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManagerA);
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManagerB);

    expect(fakeManagerA.ListenerCount).toBe(0);
    expect(fakeManagerB.ListenerCount).toBe(1);
  });

  it('rolls a health report into the health bucket series by summary counts', () => {
    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport({ Green: 3, Yellow: 1, Red: 0 }));
    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport({ Green: 2, Yellow: 0, Red: 1 }));

    const [bucket] = LocalTelemetrySignalBridge.Instance.GetHealthBuckets();
    expect(bucket.Green).toBe(5);
    expect(bucket.Yellow).toBe(1);
    expect(bucket.Red).toBe(1);
  });

  it('prunes buckets older than MaxAgeMs', () => {
    // MaxAgeMs must exceed one minute-bucket's worst-case floor drift (up to just under 60s), or
    // even a bucket recorded "now" would be evicted for having an apparently-stale BucketStartIso.
    LocalTelemetrySignalBridge.Instance.Configure({ MaxAgeMs: 5 * 60 * 1000 });
    const oldTimestamp = Date.now() - 10 * 60 * 1000;

    // Each RecordHealthReport call runs a prune pass, so the stale bucket is evicted immediately
    // on this very call (pruning is eager, not deferred to the next write).
    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport(), oldTimestamp);
    expect(LocalTelemetrySignalBridge.Instance.GetHealthBuckets()).toHaveLength(0);

    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport());
    const buckets = LocalTelemetrySignalBridge.Instance.GetHealthBuckets();
    expect(buckets).toHaveLength(1);
    expect(new Date(buckets[0].BucketStartIso).getTime()).toBeGreaterThan(oldTimestamp);
  });

  it('prunes down to MaxBucketsPerSeries, keeping the most recent buckets', () => {
    LocalTelemetrySignalBridge.Instance.Configure({ MaxBucketsPerSeries: 2, Granularity: 'minute' });
    const now = Date.now();

    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport(), now - 3 * 60 * 1000);
    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport(), now - 2 * 60 * 1000);
    LocalTelemetrySignalBridge.Instance.RecordHealthReport(makeHealthReport(), now - 1 * 60 * 1000);

    expect(LocalTelemetrySignalBridge.Instance.GetHealthBuckets()).toHaveLength(2);
  });

  it('Reset clears all recorded buckets without affecting an active telemetry subscription', () => {
    const fakeManager = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);
    fakeManager.Emit(makeEvent(), 'end');
    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets()).toHaveLength(1);

    LocalTelemetrySignalBridge.Instance.Reset();
    expect(LocalTelemetrySignalBridge.Instance.GetCountBuckets()).toHaveLength(0);
    expect(fakeManager.ListenerCount).toBe(1);
  });
});
