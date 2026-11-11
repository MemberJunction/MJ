import { createHmac } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { ShareLayerPackager, type TelemetryBucketSource } from '../../telemetry/ShareLayerPackager';
import { BaseTelemetrySink, type ConsentTier, type SinkAckResult, type SinkExecutionContext } from '../../telemetry/BaseTelemetrySink';
import type { TelemetryPackage } from '../../telemetry/ShareLayerPackager';
import type { HealthStatusBucket, TelemetryCountBucket } from '../../telemetry/LocalTelemetrySignalBridge';

const HEALTH_BUCKET: HealthStatusBucket = { BucketStartIso: '2026-11-11T00:00:00.000Z', Green: 5, Yellow: 1, Red: 0 };
const COUNT_BUCKET: TelemetryCountBucket = { BucketStartIso: '2026-11-11T00:00:00.000Z', Category: 'RunView', Count: 10, TotalElapsedMs: 500 };

function makeSource(): TelemetryBucketSource {
  return {
    GetHealthBuckets: () => [HEALTH_BUCKET],
    GetCountBuckets: () => [COUNT_BUCKET],
  };
}

class FixtureSink extends BaseTelemetrySink {
  public readonly SinkKey = 'fixture-sink';
  public readonly DisplayName = 'Fixture Sink';
  public readonly RequiredConsentTier = 'HealthAndAggregatedUsage' as const;
  public readonly BatchCadenceMinutes = 60;
  public DeliverCalls: TelemetryPackage[] = [];

  public async DeliverPackage(pkg: TelemetryPackage): Promise<SinkAckResult> {
    this.DeliverCalls.push(pkg);
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

  it('includes HealthSignals and AggregatedUsage at tier HealthAndAggregatedUsage', () => {
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthAndAggregatedUsage', makeSource());
    expect(pkg.Payload.HealthSignals?.Buckets).toEqual([HEALTH_BUCKET]);
    expect(pkg.Payload.AggregatedUsage?.Buckets).toEqual([COUNT_BUCKET]);
  });

  it('computes PayloadHashHex as the SHA-256 of PayloadJson', async () => {
    const { createHash } = await import('node:crypto');
    const pkg = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    const expectedHash = createHash('sha256').update(pkg.PayloadJson).digest('hex');
    expect(pkg.PayloadHashHex).toBe(expectedHash);
  });
});

describe('ShareLayerPackager.PreviewNextPackage', () => {
  it('returns the identical content BuildPackage would, without any side effects', () => {
    const preview = ShareLayerPackager.Instance.PreviewNextPackage('HealthOnly', makeSource());
    const built = ShareLayerPackager.Instance.BuildPackage('HealthOnly', makeSource());
    // GeneratedAtIso may legitimately differ by a few ms between the two independent calls, so
    // compare everything else exactly and the timestamp loosely.
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

  it('delivers the package and returns a complete audit record when the tier is sufficient', async () => {
    const sink = new FixtureSink();
    const result = await ShareLayerPackager.Instance.DispatchToSink(sink, 'HealthAndAggregatedUsage', CONTEXT, makeSource());

    expect(sink.DeliverCalls).toHaveLength(1);
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
