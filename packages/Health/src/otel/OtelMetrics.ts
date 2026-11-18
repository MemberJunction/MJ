import {
  type Meter,
  type Counter,
  type Histogram,
  type ObservableGauge,
  ValueType,
} from '@opentelemetry/api';
import { BaseSingleton } from '@memberjunction/global';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { HealthSignalEvaluation, InstanceHealthReport, HealthStatus } from '../types';

let eventLoopLagHistogram: IntervalHistogram | undefined;
try {
  if (typeof monitorEventLoopDelay === 'function') {
    eventLoopLagHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopLagHistogram.enable();
  }
} catch {
  // Ignore if unsupported in environment
}

/** Numerical status codes for OTel health signal gauge metrics. */
export const HEALTH_STATUS_METRIC_VALUE: Readonly<Record<HealthStatus, number>> = {
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
};

/**
 * Manages OpenTelemetry metric instruments for MemberJunction runtime observability:
 * HTTP requests, DB operations (RunView/RunQuery), cache hits, AI token counts,
 * event loop lag, and health signal evaluation states.
 */
export class OtelMetrics extends BaseSingleton<OtelMetrics> {
  private _meter?: Meter;

  private _requestsCount?: Counter;
  private _requestsDuration?: Histogram;
  private _runViewDuration?: Histogram;
  private _runQueryDuration?: Histogram;
  private _cacheOperations?: Counter;
  private _aiTokens?: Counter;
  private _eventLoopGauge?: ObservableGauge;
  private _healthSignalGauge?: ObservableGauge;
  private _dbPoolActiveGauge?: ObservableGauge;
  private _dbPoolIdleGauge?: ObservableGauge;

  private _signalStatuses = new Map<string, { value: number; ownerApp: string }>();
  private _dbPoolStats = { active: 0, idle: 0 };

  protected constructor() {
    super();
  }

  public static get Instance(): OtelMetrics {
    return super.getInstance<OtelMetrics>();
  }

  /** Initializes all metric instruments on the provided OpenTelemetry Meter. */
  public Initialize(meter: Meter): void {
    this._meter = meter;

    this._requestsCount = meter.createCounter('mj.requests.count', {
      description: 'Total number of incoming HTTP and GraphQL requests',
      unit: '1',
      valueType: ValueType.INT,
    });

    this._requestsDuration = meter.createHistogram('mj.requests.duration_ms', {
      description: 'End-to-end incoming request duration in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    });

    this._runViewDuration = meter.createHistogram('mj.db.runview.duration_ms', {
      description: 'RunView execution duration in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    });

    this._runQueryDuration = meter.createHistogram('mj.db.runquery.duration_ms', {
      description: 'RunQuery execution duration in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    });

    this._cacheOperations = meter.createCounter('mj.cache.operations', {
      description: 'Cache lookup operations partitioned by hit status',
      unit: '1',
      valueType: ValueType.INT,
    });

    this._aiTokens = meter.createCounter('mj.ai.tokens', {
      description: 'AI model input and output token consumption',
      unit: '1',
      valueType: ValueType.INT,
    });

    if (eventLoopLagHistogram) {
      this._eventLoopGauge = meter.createObservableGauge('mj.runtime.event_loop_lag_ms', {
        description: 'Node.js event loop delay (p99 over sampling window in milliseconds)',
        unit: 'ms',
        valueType: ValueType.DOUBLE,
      });

      this._eventLoopGauge.addCallback((observable) => {
        if (!eventLoopLagHistogram) return;
        const p99 = eventLoopLagHistogram.percentile(99);
        if (typeof p99 === 'number' && Number.isFinite(p99) && p99 > 0) {
          observable.observe(p99 / 1_000_000);
        }
      });
    }

    this._healthSignalGauge = meter.createObservableGauge('mj.health.signal_status', {
      description: 'Current health probe evaluation status (0 = GREEN, 1 = YELLOW, 2 = RED)',
      unit: '1',
      valueType: ValueType.INT,
    });

    this._healthSignalGauge.addCallback((observable) => {
      for (const [code, info] of this._signalStatuses.entries()) {
        observable.observe(info.value, {
          signal_code: code,
          owner_app: info.ownerApp,
        });
      }
    });

    this._dbPoolActiveGauge = meter.createObservableGauge('mj.db.pool.active_connections', {
      description: 'Current number of active database pool connections in use',
      unit: '1',
      valueType: ValueType.INT,
    });
    this._dbPoolActiveGauge.addCallback((observable) => {
      observable.observe(this._dbPoolStats.active);
    });

    this._dbPoolIdleGauge = meter.createObservableGauge('mj.db.pool.idle_connections', {
      description: 'Current number of idle database pool connections available',
      unit: '1',
      valueType: ValueType.INT,
    });
    this._dbPoolIdleGauge.addCallback((observable) => {
      observable.observe(this._dbPoolStats.idle);
    });
  }

  /** Records incoming HTTP or GraphQL request outcome and latency. */
  public RecordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    const attributes = {
      method: method.toUpperCase(),
      path,
      status_code: String(statusCode),
    };
    this._requestsCount?.add(1, attributes);
    this._requestsDuration?.record(durationMs, attributes);
  }

  /** Records RunView execution duration and success state. */
  public RecordRunView(entityName: string, durationMs: number, success: boolean): void {
    this._runViewDuration?.record(durationMs, {
      entity: entityName,
      status: success ? 'success' : 'error',
    });
  }

  /** Records RunQuery execution duration and success state. */
  public RecordRunQuery(queryNameOrId: string, durationMs: number, success: boolean): void {
    this._runQueryDuration?.record(durationMs, {
      query: queryNameOrId,
      status: success ? 'success' : 'error',
    });
  }

  /** Records a cache operation hit or miss. */
  public RecordCacheOperation(operation: string, hit: boolean): void {
    this._cacheOperations?.add(1, {
      operation,
      hit: hit ? 'true' : 'false',
    });
  }

  /** Records consumed AI tokens partitioned by model and direction ('input' | 'output'). */
  public RecordAiTokens(model: string, direction: 'input' | 'output', count: number): void {
    if (count <= 0 || !Number.isFinite(count)) {
      return;
    }
    this._aiTokens?.add(count, {
      model,
      direction,
    });
  }

  /**
   * Updates health signal gauge values from a report or array of evaluations
   * (0 = GREEN, 1 = YELLOW, 2 = RED).
   */
  public RecordHealthSignals(evaluations: readonly HealthSignalEvaluation[]): void {
    for (const ev of evaluations) {
      const val = HEALTH_STATUS_METRIC_VALUE[ev.Status] ?? 0;
      this._signalStatuses.set(ev.Code, {
        value: val,
        ownerApp: ev.OwnerApp,
      });
    }
  }

  /** Updates health signal gauge values from a full InstanceHealthReport. */
  public RecordHealthReport(report: InstanceHealthReport): void {
    if (report?.Signals) {
      this.RecordHealthSignals(report.Signals);
    }
  }

  /** Updates database connection pool utilization gauges. */
  public RecordDbPoolUsage(active: number, idle: number): void {
    this._dbPoolStats = {
      active: Math.max(0, active),
      idle: Math.max(0, idle),
    };
  }

  /** Clears all metric instrument references and cached signal statuses. */
  public Reset(): void {
    this._signalStatuses.clear();
    this._dbPoolStats = { active: 0, idle: 0 };
    this._meter = undefined;
    this._requestsCount = undefined;
    this._requestsDuration = undefined;
    this._runViewDuration = undefined;
    this._runQueryDuration = undefined;
    this._cacheOperations = undefined;
    this._aiTokens = undefined;
    this._eventLoopGauge = undefined;
    this._healthSignalGauge = undefined;
    this._dbPoolActiveGauge = undefined;
    this._dbPoolIdleGauge = undefined;
  }
}
