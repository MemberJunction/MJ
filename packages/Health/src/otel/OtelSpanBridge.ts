import { trace, type Tracer, type Span, SpanStatusCode, context, type Context } from '@opentelemetry/api';
import { BaseSingleton } from '@memberjunction/global';
import {
  TelemetryManager,
  type TelemetryCategory,
  type TelemetryEvent,
  type TelemetryRunViewParams,
  type TelemetryRunQueryParams,
  type TelemetryAIParams,
  type TelemetryCacheParams,
  type TelemetryEngineParams,
  type TelemetryParamsUnion,
} from '@memberjunction/core';
import { OtelMetrics } from './OtelMetrics';

const FORBIDDEN_SPAN_ATTR_SUBSTRINGS = [
  'password',
  'secret',
  'token',
  'key',
  'credential',
  'auth',
  'hash',
  'bearer',
  'cookie',
  'payload',
  'body',
  'record',
  'sql',
  'filter',
];

const MAX_ACTIVE_SPANS = 2000;

/**
 * Sanitizes arbitrary parameter dictionaries into safe, flat OpenTelemetry span attributes.
 * Discards objects, arrays, long strings (>256 chars), and any key matching sensitive substrings.
 */
export function SanitizeSpanAttributes(
  params?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!params || typeof params !== 'object') {
    return result;
  }

  for (const [key, val] of Object.entries(params)) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 128) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    const isSensitive = FORBIDDEN_SPAN_ATTR_SUBSTRINGS.some((sub) => lowerKey.includes(sub));
    if (isSensitive) {
      continue;
    }

    if (typeof val === 'string') {
      if (val.length <= 256) {
        result[key] = val;
      }
    } else if (typeof val === 'number') {
      if (Number.isFinite(val)) {
        result[key] = val;
      }
    } else if (typeof val === 'boolean') {
      result[key] = val;
    }
  }

  return result;
}

/**
 * Bridges `TelemetryManager.Instance.OnEvent` lifecycle events ('start' / 'end') to OpenTelemetry Spans.
 * Maintains parent/child nesting, maps categories to semantic conventions, records corresponding metrics,
 * and ensures spans are closed deterministically on event completion or eviction.
 */
export class OtelSpanBridge extends BaseSingleton<OtelSpanBridge> {
  private _tracer?: Tracer;
  private _databasePlatform: string = 'sqlserver';
  private _unsubscribe?: () => void;
  private _activeSpans = new Map<string, Span>();

  protected constructor() {
    super();
  }

  public static get Instance(): OtelSpanBridge {
    return super.getInstance<OtelSpanBridge>();
  }

  /**
   * Starts the span bridge with the given tracer and configuration.
   * If already running, replaces the active subscription.
   */
  public Start(tracer: Tracer, databasePlatform: string = 'sqlserver'): void {
    this.Stop();
    this._tracer = tracer;
    this._databasePlatform = databasePlatform;

    this._unsubscribe = TelemetryManager.Instance.OnEvent(
      (event, phase) => {
        if (phase === 'start') {
          this.handleEventStart(event);
        } else if (phase === 'end') {
          this.handleEventEnd(event);
        }
      },
      { Phases: ['start', 'end'] },
    );
  }

  /** Stops the span bridge, unhooks from TelemetryManager, and ends any open active spans. */
  public Stop(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = undefined;
    }

    for (const [id, span] of this._activeSpans) {
      span.setStatus({ code: SpanStatusCode.UNSET, message: 'Span bridge stopped' });
      span.end();
      this._activeSpans.delete(id);
    }
    this._tracer = undefined;
  }

  /** Number of currently open active spans tracked by the bridge. */
  public get ActiveSpanCount(): number {
    return this._activeSpans.size;
  }

  private handleEventStart(event: TelemetryEvent): void {
    if (!this._tracer) return;

    // Guard against active span leaks: evict oldest span if buffer is at capacity
    if (this._activeSpans.size >= MAX_ACTIVE_SPANS) {
      const oldestId = this._activeSpans.keys().next().value;
      if (oldestId !== undefined) {
        const evictedSpan = this._activeSpans.get(oldestId);
        this._activeSpans.delete(oldestId);
        if (evictedSpan) {
          evictedSpan.setAttribute('mj.evicted', true);
          evictedSpan.setStatus({
            code: SpanStatusCode.UNSET,
            message: 'Evicted from active spans buffer',
          });
          evictedSpan.end();
        }
      }
    }

    const spanName = this.formatSpanName(event);
    const attributes = this.buildStartAttributes(event);

    const span = this._tracer.startSpan(
      spanName,
      {
        attributes,
        startTime: typeof event.startTime === 'number' && event.startTime > 0 ? event.startTime : undefined,
      },
      context.active(),
    );

    this._activeSpans.set(event.id, span);
  }

  private handleEventEnd(event: TelemetryEvent): void {
    const span = this._activeSpans.get(event.id);
    const elapsedMs = typeof event.elapsedMs === 'number' ? event.elapsedMs : 0;
    const params = (event.params && typeof event.params === 'object')
      ? (event.params as Record<string, unknown>)
      : undefined;

    const isSuccess =
      params?.success !== false &&
      (typeof params?.statusCode !== 'number' || params.statusCode < 400) &&
      !params?.error;
    const errorMessage = typeof params?.error === 'string' ? params.error : undefined;

    if (span) {
      this._activeSpans.delete(event.id);

      span.setAttribute('mj.elapsed_ms', elapsedMs);
      span.setAttribute('mj.success', isSuccess);

      if (event.category === 'AI') {
        const aiParams = event.params as TelemetryAIParams | undefined;
        if (typeof aiParams?.inputTokens === 'number') {
          span.setAttribute('gen_ai.usage.prompt_tokens', aiParams.inputTokens);
        }
        if (typeof aiParams?.outputTokens === 'number') {
          span.setAttribute('gen_ai.usage.completion_tokens', aiParams.outputTokens);
        }
      }

      if (!isSuccess) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage || 'Operation failed',
        });
        if (errorMessage) {
          span.recordException(new Error(errorMessage));
        }
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end(typeof event.endTime === 'number' && event.endTime > 0 ? event.endTime : undefined);
    }

    // Bridge metrics synchronously from the same end event
    this.recordMetricsFromEvent(event, elapsedMs, isSuccess);
  }

  private recordMetricsFromEvent(event: TelemetryEvent, elapsedMs: number, success: boolean): void {
    switch (event.category) {
      case 'RunView': {
        const rvParams = event.params as TelemetryRunViewParams | undefined;
        const entity = rvParams?.EntityName || 'Unknown';
        OtelMetrics.Instance.RecordRunView(entity, elapsedMs, success);
        break;
      }
      case 'RunQuery': {
        const rqParams = event.params as TelemetryRunQueryParams | undefined;
        const query = rqParams?.QueryName || rqParams?.QueryID || 'Unknown';
        OtelMetrics.Instance.RecordRunQuery(query, elapsedMs, success);
        break;
      }
      case 'AI': {
        const aiParams = event.params as TelemetryAIParams | undefined;
        const model = aiParams?.modelName || 'unknown-model';
        if (typeof aiParams?.inputTokens === 'number' && aiParams.inputTokens > 0) {
          OtelMetrics.Instance.RecordAiTokens(model, 'input', aiParams.inputTokens);
        }
        if (typeof aiParams?.outputTokens === 'number' && aiParams.outputTokens > 0) {
          OtelMetrics.Instance.RecordAiTokens(model, 'output', aiParams.outputTokens);
        }
        break;
      }
      case 'Cache': {
        const cacheParams = event.params as TelemetryCacheParams | undefined;
        const op = cacheParams?.operation || 'get';
        const hit = cacheParams?.status === 'hit';
        OtelMetrics.Instance.RecordCacheOperation(op, hit);
        break;
      }
    }
  }

  private formatSpanName(event: TelemetryEvent): string {
    const category = event.category;
    const params = event.params as Record<string, unknown> | undefined;

    switch (category) {
      case 'RunView': {
        const entityName = typeof params?.EntityName === 'string' ? params.EntityName : undefined;
        return entityName ? `RunView ${entityName}` : 'RunView';
      }
      case 'RunQuery': {
        const queryName = typeof params?.QueryName === 'string' ? params.QueryName : undefined;
        return queryName ? `RunQuery ${queryName}` : 'RunQuery';
      }
      case 'AI': {
        const promptName = typeof params?.promptName === 'string' ? params.promptName : undefined;
        return `AI ${promptName || event.operation || 'Prompt'}`;
      }
      case 'Cache':
        return `Cache ${event.operation || 'Operation'}`;
      case 'Engine':
        return `Engine ${event.operation || 'Operation'}`;
      case 'Network':
        return `Network ${event.operation || 'Request'}`;
      case 'Coalesce':
        return `Coalesce ${event.operation || 'Batch'}`;
      case 'Custom':
      default:
        return event.operation || `Custom ${category}`;
    }
  }

  private buildStartAttributes(event: TelemetryEvent): Record<string, string | number | boolean> {
    const rawParams = (event.params && typeof event.params === 'object')
      ? (event.params as Record<string, unknown>)
      : undefined;
    const safeParams = SanitizeSpanAttributes(rawParams);
    const attrs: Record<string, string | number | boolean> = {
      'mj.category': event.category,
      'mj.event_id': event.id,
      'mj.operation': event.operation,
      ...safeParams,
    };

    switch (event.category) {
      case 'RunView': {
        attrs['db.system'] = this._databasePlatform;
        attrs['db.operation'] = 'RunView';
        if (typeof rawParams?.EntityName === 'string') {
          attrs['mj.entity'] = rawParams.EntityName;
        }
        break;
      }
      case 'RunQuery': {
        attrs['db.system'] = this._databasePlatform;
        attrs['db.operation'] = 'RunQuery';
        if (typeof rawParams?.QueryID === 'string') {
          attrs['mj.query_id'] = rawParams.QueryID;
        }
        if (typeof rawParams?.QueryName === 'string') {
          attrs['mj.query_name'] = rawParams.QueryName;
        }
        break;
      }
      case 'AI': {
        attrs['gen_ai.system'] = 'memberjunction';
        if (typeof rawParams?.modelName === 'string') {
          attrs['gen_ai.request.model'] = rawParams.modelName;
        }
        if (typeof rawParams?.promptName === 'string') {
          attrs['mj.prompt'] = rawParams.promptName;
        }
        break;
      }
      case 'Cache': {
        if (typeof rawParams?.status === 'string') {
          attrs['mj.cache.status'] = rawParams.status;
        }
        break;
      }
      case 'Engine': {
        if (typeof rawParams?.engineClass === 'string') {
          attrs['mj.engine.class'] = rawParams.engineClass;
        }
        break;
      }
    }

    return attrs;
  }
}
