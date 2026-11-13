import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemorySpanExporter, SimpleSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { TelemetryManager } from '@memberjunction/core';
import { OtelSpanBridge, SanitizeSpanAttributes } from '../../otel/OtelSpanBridge';
import { OtelMetrics } from '../../otel/OtelMetrics';

describe('OtelSpanBridge & SanitizeSpanAttributes', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();

    TelemetryManager.Instance.UpdateSettings({
      enabled: true,
      level: 'standard',
    });
  });

  afterEach(() => {
    OtelSpanBridge.Instance.Stop();
    OtelMetrics.Instance.Reset();
    exporter.reset();
  });

  it('SanitizeSpanAttributes strips sensitive substrings and complex objects', () => {
    const raw = {
      EntityName: 'Users',
      PasswordHash: 'secret123',
      ApiKey: 'sk-1234',
      AuthToken: 'bearer-xyz',
      SqlQuery: 'SELECT * FROM Users',
      MaxRows: 50,
      IsActive: true,
      NestedObject: { foo: 'bar' },
      LongString: 'a'.repeat(300),
    };

    const sanitized = SanitizeSpanAttributes(raw);
    expect(sanitized.EntityName).toBe('Users');
    expect(sanitized.MaxRows).toBe(50);
    expect(sanitized.IsActive).toBe(true);

    expect(sanitized.PasswordHash).toBeUndefined();
    expect(sanitized.ApiKey).toBeUndefined();
    expect(sanitized.AuthToken).toBeUndefined();
    expect(sanitized.SqlQuery).toBeUndefined();
    expect(sanitized.NestedObject).toBeUndefined();
    expect(sanitized.LongString).toBeUndefined();
  });

  it('bridges StartEvent and EndEvent into an OpenTelemetry span with semantic attributes', () => {
    const tracer = provider.getTracer('test-tracer');
    OtelSpanBridge.Instance.Start(tracer, 'sqlserver');

    const eventId = TelemetryManager.Instance.StartEvent('RunView', 'RunView.Execute', {
      EntityName: 'Customers',
      MaxRows: 100,
    });
    expect(eventId).toBeDefined();
    expect(OtelSpanBridge.Instance.ActiveSpanCount).toBe(1);

    TelemetryManager.Instance.EndEvent(eventId, { cacheHit: true, success: true });
    expect(OtelSpanBridge.Instance.ActiveSpanCount).toBe(0);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];

    expect(span.name).toBe('RunView Customers');
    expect(span.attributes['mj.category']).toBe('RunView');
    expect(span.attributes['db.system']).toBe('sqlserver');
    expect(span.attributes['db.operation']).toBe('RunView');
    expect(span.attributes['mj.entity']).toBe('Customers');
    expect(span.attributes['mj.success']).toBe(true);
    expect(span.attributes['mj.elapsed_ms']).toBeDefined();
  });

  it('captures AI token usage attributes when category is AI', () => {
    const tracer = provider.getTracer('test-tracer');
    OtelSpanBridge.Instance.Start(tracer, 'sqlserver');

    const eventId = TelemetryManager.Instance.StartEvent('AI', 'AI.Prompt', {
      modelName: 'gpt-4o',
      promptName: 'SummarizeRecord',
      inputTokens: 150,
    });

    TelemetryManager.Instance.EndEvent(eventId, {
      outputTokens: 75,
      success: true,
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];

    expect(span.name).toBe('AI SummarizeRecord');
    expect(span.attributes['gen_ai.system']).toBe('memberjunction');
    expect(span.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(span.attributes['mj.prompt']).toBe('SummarizeRecord');
    expect(span.attributes['gen_ai.usage.prompt_tokens']).toBe(150);
    expect(span.attributes['gen_ai.usage.completion_tokens']).toBe(75);
  });

  it('sets ERROR status when event finishes with error or success: false', () => {
    const tracer = provider.getTracer('test-tracer');
    OtelSpanBridge.Instance.Start(tracer, 'sqlserver');

    const eventId = TelemetryManager.Instance.StartEvent('RunQuery', 'RunQuery.Execute', {
      QueryName: 'TopOrders',
    });

    TelemetryManager.Instance.EndEvent(eventId, {
      success: false,
      error: 'Query timeout after 30s',
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0];

    expect(span.status.code).toBe(2); // SpanStatusCode.ERROR = 2
    expect(span.status.message).toBe('Query timeout after 30s');
  });

  it('ends open spans when Stop is called', () => {
    const tracer = provider.getTracer('test-tracer');
    OtelSpanBridge.Instance.Start(tracer, 'sqlserver');

    TelemetryManager.Instance.StartEvent('Engine', 'Engine.Load', {
      engineClass: 'MetadataSync',
      operation: 'Load',
    });
    expect(OtelSpanBridge.Instance.ActiveSpanCount).toBe(1);

    OtelSpanBridge.Instance.Stop();
    expect(OtelSpanBridge.Instance.ActiveSpanCount).toBe(0);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.message).toBe('Span bridge stopped');
  });
});
