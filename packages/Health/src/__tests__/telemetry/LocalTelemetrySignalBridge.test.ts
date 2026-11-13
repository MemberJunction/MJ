import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager, type TelemetryEvent, type TelemetryEventCallback } from '@memberjunction/core';
import { LocalTelemetrySignalBridge } from '../../telemetry/LocalTelemetrySignalBridge';
import type { InstanceHealthReport, HealthSignalEvaluation } from '../../types';

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

  it('accumulates AI inputTokens and outputTokens in count buckets', () => {
    const fakeManager = new FakeTelemetryManager();
    LocalTelemetrySignalBridge.Instance.AttachToTelemetryManager(fakeManager);

    fakeManager.Emit(
      makeEvent({
        category: 'AI',
        elapsedMs: 50,
        params: { inputTokens: 100, outputTokens: 200 },
      }),
      'end',
    );
    fakeManager.Emit(
      makeEvent({
        category: 'AI',
        elapsedMs: 70,
        params: { inputTokens: 50, outputTokens: 80 },
      }),
      'end',
    );

    const [bucket] = LocalTelemetrySignalBridge.Instance.GetCountBuckets('AI');
    expect(bucket.Count).toBe(2);
    expect(bucket.TotalElapsedMs).toBe(120);
    expect(bucket.TotalInputTokens).toBe(150);
    expect(bucket.TotalOutputTokens).toBe(280);
  });

  it('records per-probe signal evaluations from health reports into probe signal buckets', () => {
    const signal1: HealthSignalEvaluation = {
      Code: 'PROBE.ONE',
      Title: 'Probe One',
      Layer: 'core',
      OwnerApp: '__mj',
      Mode: 'passive',
      Status: 'GREEN',
      Summary: 'healthy',
      ObservedMetrics: {},
      EvaluatedAt: new Date().toISOString(),
      DurationMs: 15,
    };
    const signal2: HealthSignalEvaluation = {
      Code: 'PROBE.TWO',
      Title: 'Probe Two',
      Layer: 'open-app',
      OwnerApp: 'app-a',
      Mode: 'passive',
      Status: 'YELLOW',
      Summary: 'degraded',
      ObservedMetrics: {},
      EvaluatedAt: new Date().toISOString(),
      DurationMs: 35,
    };

    const report: InstanceHealthReport = {
      OverallStatus: 'YELLOW',
      MJVersion: '6.2.0',
      DatabasePlatform: 'sqlserver',
      EvaluatedAt: new Date().toISOString(),
      TotalDurationMs: 50,
      Mode: 'passive',
      SummaryCounts: { Green: 1, Yellow: 1, Red: 0 },
      Signals: [signal1, signal2],
    };

    LocalTelemetrySignalBridge.Instance.RecordHealthReport(report);

    const probeBuckets = LocalTelemetrySignalBridge.Instance.GetProbeSignalBuckets();
    expect(probeBuckets).toHaveLength(2);

    const b1 = probeBuckets.find((b) => b.SignalCode === 'PROBE.ONE');
    expect(b1).toBeDefined();
    expect(b1?.Green).toBe(1);
    expect(b1?.Yellow).toBe(0);
    expect(b1?.TotalDurationMs).toBe(15);
    expect(b1?.SampleCount).toBe(1);

    const b2 = probeBuckets.find((b) => b.SignalCode === 'PROBE.TWO');
    expect(b2).toBeDefined();
    expect(b2?.Green).toBe(0);
    expect(b2?.Yellow).toBe(1);
    expect(b2?.TotalDurationMs).toBe(35);
    expect(b2?.SampleCount).toBe(1);
  });

  it('records scrubbed feature usage into bounded feature usage buckets', () => {
    const scrubbed1 = LocalTelemetrySignalBridge.Instance.RecordFeatureUsage('CRM', '/app/CRM/record/Contacts/123#notes');
    expect(scrubbed1.RouteTemplate).toBe('app/:appName/record/:entityName/:recordId');

    const scrubbed2 = LocalTelemetrySignalBridge.Instance.RecordFeatureUsage('CRM', '/app/CRM/record/Contacts/456');
    expect(scrubbed2.RouteTemplate).toBe('app/:appName/record/:entityName/:recordId');

    // Unrecognized route is not bucketed
    const unrecognized = LocalTelemetrySignalBridge.Instance.RecordFeatureUsage('CRM', '/some/unrecognized/path');
    expect(unrecognized.RouteTemplate).toBe('unknown');

    const featureBuckets = LocalTelemetrySignalBridge.Instance.GetFeatureUsageBuckets();
    expect(featureBuckets).toHaveLength(1);
    expect(featureBuckets[0].RouteTemplate).toBe('app/:appName/record/:entityName/:recordId');
    expect(featureBuckets[0].Count).toBe(2);
  });

  it('integrates with real TelemetryManager.Instance end-to-end', () => {
    const tm = TelemetryManager.Instance;
    tm.Reset();
    tm.SetEnabled(true);

    const bridge = LocalTelemetrySignalBridge.Instance;
    bridge.AttachToTelemetryManager(tm);

    // 1. StartEvent + EndEvent
    const eventId = tm.StartEvent('RunView', 'ProviderBase.RunView', { EntityName: 'MJ: Users' });
    tm.EndEvent(eventId);

    // 2. RecordEvent with AI tokens
    tm.RecordEvent(
      'AI',
      'Chat.Complete',
      {
        modelName: 'gpt-4o',
        inputTokens: 250,
        outputTokens: 750,
      },
      80,
    );

    const countBuckets = bridge.GetCountBuckets();
    expect(countBuckets.length).toBeGreaterThanOrEqual(2);

    const aiBucket = bridge.GetCountBuckets('AI')[0];
    expect(aiBucket).toBeDefined();
    expect(aiBucket.Count).toBe(1);
    expect(aiBucket.TotalInputTokens).toBe(250);
    expect(aiBucket.TotalOutputTokens).toBe(750);

    // 3. Health report signal rollups
    bridge.RecordHealthReport({
      OverallStatus: 'GREEN',
      MJVersion: '6.2.0',
      DatabasePlatform: 'sqlserver',
      EvaluatedAt: new Date().toISOString(),
      TotalDurationMs: 20,
      Mode: 'passive',
      SummaryCounts: { Green: 1, Yellow: 0, Red: 0 },
      Signals: [
        {
          Code: 'MJ.CORE.EVENT_LOOP_LAG',
          Title: 'Event Loop Lag',
          Layer: 'core',
          OwnerApp: '__mj',
          Mode: 'passive',
          Status: 'GREEN',
          Summary: 'Lag healthy',
          ObservedMetrics: { EventLoopLagMs: 1.5 },
          EvaluatedAt: new Date().toISOString(),
          DurationMs: 2,
        },
      ],
    });

    const probeBuckets = bridge.GetProbeSignalBuckets();
    expect(probeBuckets.some((b) => b.SignalCode === 'MJ.CORE.EVENT_LOOP_LAG')).toBe(true);

    // 4. Feature usage route scrubbing
    bridge.RecordFeatureUsage('CoreExplorer', '/resource/view/view-uuid-1234');
    const featBuckets = bridge.GetFeatureUsageBuckets();
    expect(featBuckets.some((fb) => fb.RouteTemplate === 'resource/view/:viewId')).toBe(true);

    bridge.Detach();
  });
});
