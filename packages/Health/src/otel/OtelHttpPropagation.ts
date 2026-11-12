import {
  propagation,
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  type Context,
  type Tracer,
  type TextMapGetter,
  type TextMapSetter,
} from '@opentelemetry/api';
import { OtelMetrics } from './OtelMetrics';

const headerGetter: TextMapGetter<Record<string, string | string[] | undefined>> = {
  get(carrier, key) {
    if (!carrier) return undefined;
    const val = carrier[key.toLowerCase()];
    return Array.isArray(val) ? val[0] : val;
  },
  keys(carrier) {
    return carrier ? Object.keys(carrier) : [];
  },
};

const headerSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    if (carrier) {
      carrier[key] = value;
    }
  },
};

/** Extracts active W3C trace context from incoming HTTP headers. */
export function ExtractTraceContext(
  headers: Record<string, string | string[] | undefined>,
): Context {
  return propagation.extract(context.active(), headers, headerGetter);
}

/** Injects active W3C traceparent into an outgoing HTTP header dictionary. */
export function InjectTraceContext(
  ctx: Context = context.active(),
  headers: Record<string, string>,
): void {
  propagation.inject(ctx, headers, headerSetter);
}

/** Simplified request shape for HTTP middleware instrumentation. */
export interface HttpServerRequestLike {
  method?: string;
  path?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Simplified response shape for HTTP middleware instrumentation. */
export interface HttpServerResponseLike {
  statusCode: number;
  on(event: 'finish' | 'close', listener: () => void): void;
  setHeader?(name: string, value: string): void;
}

/**
 * Creates an Express/Connect-compatible middleware for incoming HTTP request instrumentation
 * with W3C trace propagation, server span lifecycle, and metric recording.
 */
export function CreateOtelHttpMiddleware(
  tracer: Tracer,
  options?: { SkipPaths?: readonly string[] },
) {
  const skipPaths = new Set(options?.SkipPaths ?? ['/health', '/healthz', '/favicon.ico']);

  return (
    req: HttpServerRequestLike,
    res: HttpServerResponseLike,
    next: () => void,
  ): void => {
    const rawPath = req.path || req.url || '/';
    if (skipPaths.has(rawPath)) {
      next();
      return;
    }

    const parentContext = ExtractTraceContext(req.headers);
    const method = req.method || 'GET';
    const spanName = `HTTP ${method} ${rawPath.split('?')[0]}`;
    const startTime = Date.now();

    const span = tracer.startSpan(
      spanName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': method,
          'http.target': rawPath,
          'http.url': req.url,
        },
      },
      parentContext,
    );

    const spanContext = trace.setSpan(parentContext, span);

    // Inject traceparent onto the outgoing response if possible
    if (typeof res.setHeader === 'function') {
      const outgoingHeaders: Record<string, string> = {};
      InjectTraceContext(spanContext, outgoingHeaders);
      for (const [k, v] of Object.entries(outgoingHeaders)) {
        res.setHeader(k, v);
      }
    }

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const status = res.statusCode || 200;

      span.setAttribute('http.status_code', status);
      if (status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();

      OtelMetrics.Instance.RecordRequest(method, rawPath.split('?')[0], status, durationMs);
    });

    context.with(spanContext, next);
  };
}
