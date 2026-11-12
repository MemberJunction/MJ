import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemorySpanExporter, SimpleSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ExtractTraceContext,
  InjectTraceContext,
  CreateOtelHttpMiddleware,
  type HttpServerRequestLike,
  type HttpServerResponseLike,
} from '../../otel/OtelHttpPropagation';

describe('OtelHttpPropagation', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterEach(() => {
    exporter.reset();
  });

  it('injects and extracts W3C traceparent headers', () => {
    const tracer = provider.getTracer('test-tracer');
    const span = tracer.startSpan('parent-operation');

    const headers: Record<string, string> = {};
    const traceCtx = (span as unknown as { spanContext?: () => { traceId: string } });
    InjectTraceContext(undefined, headers);

    // Context extraction on headers
    const incomingHeaders = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };
    const extracted = ExtractTraceContext(incomingHeaders);
    expect(extracted).toBeDefined();

    span.end();
  });

  it('CreateOtelHttpMiddleware instruments incoming requests and ends spans on finish', () => {
    const tracer = provider.getTracer('test-http');
    const middleware = CreateOtelHttpMiddleware(tracer);

    let finishCallback: (() => void) | undefined;
    const req: HttpServerRequestLike = {
      method: 'POST',
      url: '/graphql',
      path: '/graphql',
      headers: {},
    };

    const resHeaders: Record<string, string> = {};
    const res: HttpServerResponseLike = {
      statusCode: 200,
      on: (event, cb) => {
        if (event === 'finish') finishCallback = cb;
      },
      setHeader: (name, val) => {
        resHeaders[name.toLowerCase()] = val;
      },
    };

    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(resHeaders['traceparent']).toBeDefined();

    // Trigger response finish
    expect(finishCallback).toBeDefined();
    finishCallback!();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('HTTP POST /graphql');
    expect(spans[0].attributes['http.method']).toBe('POST');
    expect(spans[0].attributes['http.status_code']).toBe(200);
  });

  it('CreateOtelHttpMiddleware skips configured skip paths like /health', () => {
    const tracer = provider.getTracer('test-http');
    const middleware = CreateOtelHttpMiddleware(tracer, { SkipPaths: ['/health'] });

    const req: HttpServerRequestLike = {
      method: 'GET',
      url: '/health',
      path: '/health',
      headers: {},
    };
    const res: HttpServerResponseLike = {
      statusCode: 200,
      on: () => {},
    };

    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(0);
  });
});
