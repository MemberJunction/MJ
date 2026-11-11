import { createHash, createHmac } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { ShareLayerPackager, type TelemetryBucketSource } from '../../telemetry/ShareLayerPackager';
import {
  BaseTelemetrySink,
  NoopTelemetrySink,
  MJCentralTelemetrySink,
  FederatedMJTelemetrySink,
  OtlpHttpTelemetrySink,
  type ConsentTier,
  type SinkAckResult,
  type SinkExecutionContext,
  type TelemetryHttpRequest,
  type TelemetryHttpTransport,
} from '../../telemetry/BaseTelemetrySink';
import type { TelemetryPackage } from '../../telemetry/ShareLayerPackager';
import type { HealthStatusBucket, TelemetryCountBucket, FeatureUsageBucket } from '../../telemetry/LocalTelemetrySignalBridge';
import { ValidateTelemetryRecord, HEALTH_REPORT_SHARE_SCHEMA } from '../../telemetry/TelemetrySchemaDsl';

const HEALTH_BUCKET: HealthStatusBucket = { BucketStartIso: '2026-11-11', Green: 5, Yellow: 1, Red: 0 };
const COUNT_BUCKET: TelemetryCountBucket = { BucketStartIso: '2026-11-11T00:00:00.000Z', Category: 'RunView', Count: 10, TotalElapsedMs: 500, TotalInputTokens: 0, TotalOutputTokens: 0 };

function makeSource(featureBuckets?: FeatureUsageBucket[]): TelemetryBucketSource {
  return {
    GetHealthBuckets: () => [HEALTH_BUCKET],
    GetCountBuckets: () => [COUNT_BUCKET],
    GetFeatureUsageBuckets: featureBuckets ? () => featureBuckets : undefined,
  };
}

class FixtureSink extends BaseTelemetrySink {
  public readonly SinkKey = 'fixture-sink';
  public readonly DisplayName = 'Fixture Sink';
  public readonly RequiredConsentTier = 'HealthAndAggregatedUsage' as const;
  public readonly BatchCadenceMinutes = 60;
  public DeliverCalls: TelemetryPackage[] = [];
  public LastContext?: SinkExecutionContext;

  public async DeliverPackage(pkg: TelemetryPackage, context: SinkExecutionContext): Promise<SinkAckResult> {
    this.DeliverCalls.push(pkg);
    this.LastContext = context;
    return { Success: true, StatusCode: 202 };
  }
}

const SIGNING_KEY_HEX = Buffer.from('a-test-signing-key-32-bytes-long', 'utf8').toString('hex');
const CONTEXT: SinkExecutionContext = { SigningKeyHex: SIGNING_KEY_HEX, InstallId: 'install-fixture' };

describe('ShareLayerPackager.BuildPackage', () => {
  it('throws when attempting to build a package at ConsentTier "Off"', () => {
    expect(() => ShareLayerPackager.Instance.BuildPackage('Off', makeSource())).toThrow(/Off/);
  });

  it('includes only HealthSignals at tier HealthOnly', () => {
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    expect(pkg.Payload.HealthSignals?.Buckets).toEqual([HEALTH_BUCKET]);
    expect(pkg.Payload.AggregatedUsage).toBeUndefined();
  });

  it('includes HealthSignals, daily-floored AggregatedUsage, and DailyBuckets at tier HealthAndAggregatedUsage', () => {
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthAndAggregatedUsage', makeSource());
    expect(pkg.Payload.HealthSignals?.Buckets).toEqual([HEALTH_BUCKET]);
    expect(pkg.Payload.AggregatedUsage?.Buckets).toEqual([
      { ...COUNT_BUCKET, BucketStartIso: '2026-11-11' },
    ]);
    expect(pkg.Payload.AggregatedUsage?.DailyBuckets).toEqual([
      {
        DateBucket: '2026-11-11',
        Category: 'RunView',
        Count: 10,
        TotalElapsedMs: 500,
        TotalInputTokens: 0,
        TotalOutputTokens: 0,
      },
    ]);
  });

  it('re-aggregates multiple minute count buckets from the same day into one DailyBucket and strips minute timestamps at Tier 2', () => {
    const source: TelemetryBucketSource = {
      GetHealthBuckets: () => [
        { BucketStartIso: '2026-11-11T09:00:00.000Z', Green: 3, Yellow: 1, Red: 0 },
        { BucketStartIso: '2026-11-11T14:30:00.000Z', Green: 2, Yellow: 0, Red: 0 },
      ],
      GetCountBuckets: () => [
        { BucketStartIso: '2026-11-11T09:00:00.000Z', Category: 'Coalesce', Count: 2, TotalElapsedMs: 25, TotalInputTokens: 0, TotalOutputTokens: 0 },
        { BucketStartIso: '2026-11-11T09:00:00.000Z', Category: 'AI', Count: 5, TotalElapsedMs: 100, TotalInputTokens: 1000, TotalOutputTokens: 500 },
        { BucketStartIso: '2026-11-11T14:30:00.000Z', Category: 'AI', Count: 3, TotalElapsedMs: 80, TotalInputTokens: 600, TotalOutputTokens: 300 },
      ],
    };
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthAndAggregatedUsage', source);
    expect(pkg.Payload.HealthSignals?.Buckets).toEqual([
      { BucketStartIso: '2026-11-11', Green: 5, Yellow: 1, Red: 0 },
    ]);
    expect(pkg.PayloadJson).not.toContain('T09:00:00');
    expect(pkg.PayloadJson).not.toContain('T14:30:00');
    expect(pkg.Payload.AggregatedUsage?.DailyBuckets).toEqual([
      {
        DateBucket: '2026-11-11',
        Category: 'Coalesce',
        Count: 2,
        TotalElapsedMs: 25,
        TotalInputTokens: 0,
        TotalOutputTokens: 0,
      },
      {
        DateBucket: '2026-11-11',
        Category: 'AI',
        Count: 8,
        TotalElapsedMs: 180,
        TotalInputTokens: 1600,
        TotalOutputTokens: 800,
      },
    ]);
  });

  it('re-aggregates feature usage into FeatureUsage.DailyBuckets when provided by source', () => {
    const featureBuckets: FeatureUsageBucket[] = [
      { BucketStartIso: '2026-11-11T10:00:00.000Z', ApplicationName: 'CRM', RouteTemplate: 'resource/record/:entityName/:recordId', Count: 12 },
      { BucketStartIso: '2026-11-11T12:00:00.000Z', ApplicationName: 'CRM', RouteTemplate: 'resource/record/:entityName/:recordId', Count: 8 },
    ];
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthAndAggregatedUsage', makeSource(featureBuckets));
    expect(pkg.Payload.FeatureUsage?.DailyBuckets).toEqual([
      {
        DateBucket: '2026-11-11',
        RouteTemplate: 'resource/record/:entityName/:recordId',
        NavigationCount: 20,
      },
    ]);
  });

  it('validates records against allowlisted share schemas and strips unexpected properties', () => {
    // If a caller passes extra properties, ValidateTelemetryRecord rejects them
    const dirtyRecord = { BucketStartIso: '2026-11-11', Green: 1, Yellow: 0, Red: 0, LeakedSecret: 'bad' };
    const valResult = ValidateTelemetryRecord(HEALTH_REPORT_SHARE_SCHEMA, dirtyRecord);
    expect(valResult.Valid).toBe(false);
    expect(valResult.Errors.some((e) => e.Field === 'LeakedSecret')).toBe(true);

    // BuildPackage constructs clean records so extra caller properties never enter PayloadJson
    interface DirtyHealthBucket extends HealthStatusBucket {
      LeakedSecret: string;
    }
    const dirtyBucket: DirtyHealthBucket = {
      BucketStartIso: '2026-11-11',
      Green: 1,
      Yellow: 0,
      Red: 0,
      LeakedSecret: 'bad',
    };
    const dirtySource = {
      GetHealthBuckets: () => [dirtyBucket],
      GetCountBuckets: () => [],
    };
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', dirtySource);
    expect(pkg.PayloadJson).not.toContain('LeakedSecret');
  });

  it('computes PayloadHashHex as the SHA-256 of PayloadJson', () => {
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const expectedHash = createHash('sha256').update(pkg.PayloadJson).digest('hex');
    expect(pkg.PayloadHashHex).toBe(expectedHash);
  });
});

describe('ShareLayerPackager.PreviewNextPackage', () => {
  it('returns the identical content BuildPackage would, without any side effects', () => {
    const preview = ShareLayerPackager.Instance.PreviewNextPackage('HealthOnly', makeSource());
    const built = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    expect(preview.Payload.HealthSignals).toEqual(built.Payload.HealthSignals);
    expect(preview.Payload.ConsentTier).toBe(built.Payload.ConsentTier);
  });
});

describe('ShareLayerPackager.SignPackage', () => {
  it('produces an HMAC-SHA256 x-mj-signature header matching an independent computation', () => {
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const signature = ShareLayerPackager.Instance.SignPackage(pkg, SIGNING_KEY_HEX);

    const expected = `sha256=${createHmac('sha256', Buffer.from(SIGNING_KEY_HEX, 'hex')).update(pkg.PayloadJson).digest('hex')}`;
    expect(signature).toBe(expected);
  });

  it('produces a different signature for a different signing key', () => {
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const signatureA = ShareLayerPackager.Instance.SignPackage(pkg, SIGNING_KEY_HEX);
    const otherKeyHex = Buffer.from('a-different-signing-key-32-bytes', 'utf8').toString('hex');
    const signatureB = ShareLayerPackager.Instance.SignPackage(pkg, otherKeyHex);
    expect(signatureA).not.toBe(signatureB);
  });
});

describe('ShareLayerPackager.DispatchToSink', () => {
  it('refuses to call the sink when the granted tier does not satisfy RequiredConsentTier', async () => {
    const sink = new FixtureSink();
    await expect(ShareLayerPackager.Instance.DispatchToSink(sink, 'HealthOnly', CONTEXT, makeSource())).rejects.toThrow(/requires consent tier/);
    expect(sink.DeliverCalls).toHaveLength(0);
  });

  it('delivers the package and returns a complete audit record with SignatureHeader delivered to sink', async () => {
    const sink = new FixtureSink();
    const result = await ShareLayerPackager.Instance.DispatchToSink(sink, 'HealthAndAggregatedUsage', CONTEXT, makeSource());

    expect(sink.DeliverCalls).toHaveLength(1);
    expect(sink.LastContext?.SignatureHeader).toBe(result.SignatureHeader);
    expect(result.SinkKey).toBe('fixture-sink');
    expect(result.ConsentTier).toBe('HealthAndAggregatedUsage');
    expect(result.PayloadHashHex).toBe(result.Package.PayloadHashHex);
    expect(result.SignatureHeader).toMatch(/^sha256=[0-9a-f]+$/);
    expect(result.Ack.Success).toBe(true);
    expect(result.Ack.StatusCode).toBe(202);
  });

  it('a higher granted tier than required still satisfies the sink', async () => {
    const sink = new FixtureSink();
    const result = await ShareLayerPackager.Instance.DispatchToSink(sink, 'HealthAndMetadataEvents', CONTEXT, makeSource());
    expect(result.Ack.Success).toBe(true);
  });

  it('surfaces a failed delivery via the returned Ack rather than throwing', async () => {
    const sink = new FixtureSink();
    vi.spyOn(sink, 'DeliverPackage').mockResolvedValue({ Success: false, StatusCode: 503, ErrorMessage: 'sink unavailable' });

    const result = await ShareLayerPackager.Instance.DispatchToSink(sink, 'HealthAndAggregatedUsage', CONTEXT, makeSource());

    expect(result.Ack.Success).toBe(false);
    expect(result.Ack.ErrorMessage).toBe('sink unavailable');
  });
});

describe('Concrete Telemetry Sinks', () => {
  it('NoopTelemetrySink returns 204 without sending HTTP requests', async () => {
    const sink = new NoopTelemetrySink();
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const ack = await sink.DeliverPackage(pkg, CONTEXT);
    expect(ack.Success).toBe(true);
    expect(ack.StatusCode).toBe(204);
  });

  it('MJCentralTelemetrySink sends package with proper headers and handles responses', async () => {
    let capturedRequest: TelemetryHttpRequest | undefined;
    const mockTransport: TelemetryHttpTransport = async (req) => {
      capturedRequest = req;
      return { StatusCode: 200, RetryAfterHeader: '120', BodyText: '{"status":"ok"}' };
    };
    const sink = new MJCentralTelemetrySink({
      EndpointUrl: 'https://test.mj.fleet/v1',
      Transport: mockTransport,
    });
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const ctx: SinkExecutionContext = { ...CONTEXT, SignatureHeader: 'sha256=test-sig' };
    const ack = await sink.DeliverPackage(pkg, ctx);

    expect(ack.Success).toBe(true);
    expect(ack.StatusCode).toBe(200);
    expect(ack.RetryAfterSeconds).toBe(120);
    expect(capturedRequest?.Headers['x-mj-install-id']).toBe('install-fixture');
    expect(capturedRequest?.Headers['x-mj-consent-tier']).toBe('HealthOnly');
    expect(capturedRequest?.Headers['x-mj-signature']).toBe('sha256=test-sig');

    // Error handling test
    const failingSink = new MJCentralTelemetrySink({
      Transport: async () => {
        throw new Error('network down');
      },
    });
    const failedAck = await failingSink.DeliverPackage(pkg, ctx);
    expect(failedAck.Success).toBe(false);
    expect(failedAck.StatusCode).toBe(0);
    expect(failedAck.ErrorMessage).toContain('network down');
  });

  it('FederatedMJTelemetrySink sends package with peer id and handles responses', async () => {
    let capturedRequest: TelemetryHttpRequest | undefined;
    const mockTransport: TelemetryHttpTransport = async (req) => {
      capturedRequest = req;
      return { StatusCode: 200, BodyText: 'peer-ack' };
    };
    const sink = new FederatedMJTelemetrySink({
      EndpointUrl: 'https://peer.mj/telemetry',
      PeerId: 'peer-node-99',
      Transport: mockTransport,
    });
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const ctx: SinkExecutionContext = { ...CONTEXT, SignatureHeader: 'sha256=peer-sig' };
    const ack = await sink.DeliverPackage(pkg, ctx);

    expect(ack.Success).toBe(true);
    expect(capturedRequest?.Headers['x-mj-peer-id']).toBe('peer-node-99');
    expect(capturedRequest?.Headers['x-mj-signature']).toBe('sha256=peer-sig');

    // Network error test
    const errorSink = new FederatedMJTelemetrySink({
      EndpointUrl: 'https://peer.mj/telemetry',
      Transport: async () => {
        throw new Error('peer unreachable');
      },
    });
    const failedAck = await errorSink.DeliverPackage(pkg, ctx);
    expect(failedAck.Success).toBe(false);
    expect(failedAck.StatusCode).toBe(0);
    expect(failedAck.ErrorMessage).toContain('peer unreachable');
  });

  it('OtlpHttpTelemetrySink transforms metrics to OTLP JSON format and posts to collector', async () => {
    let capturedRequest: TelemetryHttpRequest | undefined;
    const mockTransport: TelemetryHttpTransport = async (req) => {
      capturedRequest = req;
      return { StatusCode: 200, BodyText: 'accepted' };
    };
    const sink = new OtlpHttpTelemetrySink({
      CollectorUrl: 'https://collector.local:4318/v1/metrics',
      Headers: { 'x-custom-tenant': 'tenant-42' },
      Transport: mockTransport,
    });
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthAndAggregatedUsage', makeSource());
    const ctx: SinkExecutionContext = { ...CONTEXT, SignatureHeader: 'sha256=otlp-sig' };
    const ack = await sink.DeliverPackage(pkg, ctx);

    expect(ack.Success).toBe(true);
    expect(capturedRequest?.Url).toBe('https://collector.local:4318/v1/metrics');
    expect(capturedRequest?.Headers['x-custom-tenant']).toBe('tenant-42');
    expect(capturedRequest?.Headers['x-mj-signature']).toBe('sha256=otlp-sig');
    expect(capturedRequest?.Body).toContain('resourceMetrics');
    expect(capturedRequest?.Body).toContain('mj.health.status_count');
    expect(capturedRequest?.Body).toContain('mj.usage.operations');

    // Network error test
    const failingSink = new OtlpHttpTelemetrySink({
      Transport: async () => {
        throw new Error('collector connection refused');
      },
    });
    const failedAck = await failingSink.DeliverPackage(pkg, ctx);
    expect(failedAck.Success).toBe(false);
    expect(failedAck.StatusCode).toBe(0);
    expect(failedAck.ErrorMessage).toContain('collector connection refused');
  });
});

describe('ConsentTierSatisfies (via DispatchToSink gating)', () => {
  it.each<[ConsentTier, ConsentTier, boolean]>([
    ['Off', 'HealthOnly', false],
    ['HealthOnly', 'HealthOnly', true],
    ['HealthOnly', 'HealthAndAggregatedUsage', false],
    ['HealthAndAggregatedUsage', 'HealthOnly', true],
    ['HealthAndMetadataEvents', 'HealthAndAggregatedUsage', true],
  ])('granted=%s required=%s -> satisfies=%s', async (granted, required, satisfies) => {
    class ParamSink extends BaseTelemetrySink {
      public readonly SinkKey = 'param-sink';
      public readonly DisplayName = 'Param Sink';
      public readonly RequiredConsentTier = required as Exclude<ConsentTier, 'Off'>;
      public readonly BatchCadenceMinutes = 30;
      public async DeliverPackage(): Promise<SinkAckResult> {
        return { Success: true, StatusCode: 200 };
      }
    }
    const sink = new ParamSink();

    if (granted === 'Off') {
      await expect(ShareLayerPackager.Instance.DispatchToSink(sink, granted, CONTEXT, makeSource())).rejects.toThrow();
      return;
    }

    if (satisfies) {
      const result = await ShareLayerPackager.Instance.DispatchToSink(sink, granted, CONTEXT, makeSource());
      expect(result.Ack.Success).toBe(true);
    } else {
      await expect(ShareLayerPackager.Instance.DispatchToSink(sink, granted, CONTEXT, makeSource())).rejects.toThrow(/requires consent tier/);
    }
  });
});
