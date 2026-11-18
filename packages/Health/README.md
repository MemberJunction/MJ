# @memberjunction/health

MemberJunction health signal catalog, live verification probes, agent remediation contracts, and local-first telemetry share layer.

## Overview

`@memberjunction/health` provides continuous observability and autonomous agent-assisted operational contracts for MemberJunction deployments:

1. **Health Signal Catalog & Probes**: Pluggable probe architecture discovered via `@RegisterClass(BaseHealthProbe, SignalCode)` providing point-in-time and continuous evaluation of database connectivity, metadata cache parity, background queue worker heartbeats, OpenApp fleet statuses, runtime event loop lag, and AI provider readiness.
2. **Deterministic Agent Remediation Playbooks**: Every signal defines structured `YellowPlaybook` and `RedPlaybook` specifications outlining autonomous action bounds (`AllowedAutonomousActions`, `MaxAutonomousAttempts`), cooldowns, and human operator escalation runbooks.
3. **Live Entity CRUD Probes & Verifiers**: Synthetic, transactional end-to-end verification (`BaseLiveCrudVerifier`) proving that create, read, update, and delete paths work across registered entities and row-level security (RLS) policies, with guaranteed transaction rollback.
4. **Local-First Observability & Bridge**: `LocalTelemetrySignalBridge` subscribes to `@memberjunction/core`'s `TelemetryManager.Instance.OnEvent` and rolls execution counts, durations, and token metrics into bounded in-memory time buckets with zero network egress.
5. **Consent-Gated Share Layer & Closed DSL**: `ShareLayerPackager` and `BaseTelemetrySink` enforce installation consent tiers (`Off`, `HealthOnly`, `HealthAndAggregatedUsage`, `HealthAndMetadataEvents`) using a closed compile-time and runtime allowlist schema DSL (`TelemetrySchemaDsl`). Field names and shapes are strictly constrained so that customer data, raw SQL text, prompt text, completions, and user IDs can never leave the deployment boundary.

## Installation

```bash
npm install @memberjunction/health
```

## Basic Usage

### Evaluating Instance Health

```typescript
import { MJHealthEngine } from '@memberjunction/health';

// Passive health evaluation (safe for continuous polling every 1-5 minutes)
const report = await MJHealthEngine.Instance.Evaluate({
  Mode: 'passive',
});

console.log(`Instance Status: ${report.OverallStatus}`);
for (const signal of report.Signals) {
  console.log(`- [${signal.Status}] ${signal.Title} (${signal.Code}): ${signal.Summary}`);
}
```

### Authoring a Custom Probe

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseHealthProbe, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation } from '@memberjunction/health';

const CUSTOM_SIGNAL_CODE = 'MY_APP.SERVICE.HEALTH';

@RegisterClass(BaseHealthProbe, CUSTOM_SIGNAL_CODE)
export class CustomServiceProbe extends BaseHealthProbe {
  public override get ProbeKey(): string {
    return CUSTOM_SIGNAL_CODE;
  }

  public override get OwnerApp(): string {
    return 'MyApp';
  }

  public override get Mode() {
    return 'passive' as const;
  }

  public override get SignalDefinitions(): readonly HealthSignalDefinition[] {
    return [
      {
        Code: CUSTOM_SIGNAL_CODE,
        Title: 'Custom Service Health',
        Layer: 'application',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Description: 'Verifies external service availability.',
      },
    ];
  }

  public override async Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const startedAt = Date.now();
    return [
      {
        Code: CUSTOM_SIGNAL_CODE,
        Title: 'Custom Service Health',
        Layer: 'application',
        OwnerApp: this.OwnerApp,
        Mode: this.Mode,
        Status: 'GREEN',
        Summary: 'Custom service is operating normally.',
        ObservedMetrics: {},
        EvaluatedAt: new Date().toISOString(),
        DurationMs: Date.now() - startedAt,
      },
    ];
  }
}
```

### OpenTelemetry Integration

The package includes an opt-in OpenTelemetry spine (`OtelSdk`, `OtelSpanBridge`, `OtelMetrics`, `OtelHttpPropagation`) to bridge all runtime events into distributed spans and metrics for Datadog, Grafana, or OpenTelemetry collectors.

```typescript
import { OtelSdk } from '@memberjunction/health';

// Initialize with standard OTEL_* env vars or explicit options
OtelSdk.Instance.Initialize({
  Enabled: true,
  ServiceName: 'memberjunction-api',
  OtlpEndpoint: 'http://localhost:4318',
});
```

See [OpenTelemetry Setup Guide](../../docs/opentelemetry-setup.md) for full configuration, metric dictionaries, and backend setups.

## License

BUSL-1.1
