# MemberJunction OpenTelemetry Setup Guide

MemberJunction includes a native, opt-in **OpenTelemetry (OTel) observability spine** provided by `@memberjunction/health`. It bridges runtime execution events, database queries, AI model prompts, HTTP traffic, runtime lag, and live health probe evaluations into standard OpenTelemetry traces and metrics.

---

## 1. Zero Overhead When Disabled (Default)

The OpenTelemetry spine is **disabled by default**. When disabled:
- Zero SDK providers or span processors are initialized.
- Zero listeners are attached to `TelemetryManager.Instance.OnEvent`.
- CPU, memory, and event-loop overhead is zero.

The SDK only initializes when explicitly enabled via environment variables or host configuration.

---

## 2. Configuration

### Standard Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP HTTP collector URL (e.g. `http://localhost:4318`) | None (Disabled) |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Dedicated OTLP traces URL (e.g. `http://localhost:4318/v1/traces`) | `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Dedicated OTLP metrics URL (e.g. `http://localhost:4318/v1/metrics`) | `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics` |
| `OTEL_SERVICE_NAME` | Service name resource attribute | `memberjunction` |
| `OTEL_SERVICE_VERSION` | Service version resource attribute | Current MJ release version |
| `OTEL_TRACES_SAMPLER` | Sampling ratio (`1.0` = 100%, `0.1` = 10%) | `1.0` |
| `OTEL_SDK_DISABLED` | Emergency kill-switch (`true` completely disables OTel) | `false` |
| `NODE_ENV` | Mapped to `deployment.environment` | `development` |
| `MJ_DATABASE_DIALECT` | Mapped to `db.system` (`sqlserver` or `postgresql`) | `sqlserver` |

### Programmatic Configuration (`mj.config.cjs`)

You can also configure the spine programmatically when starting your host process:

```javascript
const { OtelSdk } = require('@memberjunction/health');

OtelSdk.Instance.Initialize({
  Enabled: true,
  ServiceName: 'mj-production-api',
  ServiceVersion: '6.3.0',
  Environment: 'production',
  OtlpEndpoint: 'http://otel-collector:4318',
  DatabasePlatform: 'sqlserver',
  SamplingRatio: 1.0,
});
```

---

## 3. Collector & Backend Setups

### A. Local OpenTelemetry Collector (Docker Compose)

Run a local OTel collector container that receives OTLP HTTP on port `4318`:

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    ports:
      - "4318:4318" # OTLP HTTP receiver
```

Point MJ to the collector:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="mj-api"
```

### B. Datadog

Point MemberJunction to your Datadog Agent with OTLP ingest enabled, or directly to Datadog's OTLP HTTP endpoint:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.datadoghq.com"
export OTEL_EXPORTER_OTLP_HEADERS="dd-api-key=<YOUR_DATADOG_API_KEY>"
export OTEL_SERVICE_NAME="memberjunction-api"
```

### C. Grafana Cloud (Tempo + Mimir)

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp-gateway-<zone>.grafana.net/otlp"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <BASE64_USER_TOKEN>"
export OTEL_SERVICE_NAME="memberjunction"
```

---

## 4. Exported Signals

### Distributed Traces

`OtelSpanBridge` translates MemberJunction telemetry events directly into OpenTelemetry spans:

| Category | Span Name Pattern | Key Semantic Attributes |
|---|---|---|
| **RunView** | `RunView <EntityName>` | `db.system`, `db.operation=RunView`, `mj.entity`, `mj.elapsed_ms` |
| **RunQuery** | `RunQuery <QueryName>` | `db.system`, `db.operation=RunQuery`, `mj.query_name`, `mj.query_id` |
| **AI** | `AI <PromptName>` | `gen_ai.system=memberjunction`, `gen_ai.request.model`, `gen_ai.usage.prompt_tokens`, `gen_ai.usage.completion_tokens` |
| **Engine** | `Engine <Operation>` | `mj.engine.class`, `mj.elapsed_ms` |
| **Cache** | `Cache <Operation>` | `mj.cache.status` (`hit` / `miss`) |
| **HTTP Request** | `HTTP <METHOD> <PATH>` | `http.method`, `http.target`, `http.status_code`, W3C `traceparent` |

### Runtime & Health Metrics

`OtelMetrics` provides continuous meters and observable gauges:

| Metric Name | Instrument | Unit | Description |
|---|---|---|---|
| `mj.requests.count` | Counter | `1` | Total incoming HTTP/GraphQL requests partitioned by method, path, status |
| `mj.requests.duration_ms` | Histogram | `ms` | End-to-end incoming request latency |
| `mj.db.runview.duration_ms` | Histogram | `ms` | RunView query execution time |
| `mj.db.runquery.duration_ms` | Histogram | `ms` | RunQuery execution time |
| `mj.cache.operations` | Counter | `1` | Cache accesses partitioned by hit (`true` / `false`) |
| `mj.ai.tokens` | Counter | `1` | AI token consumption partitioned by `model` and `direction` (`input` / `output`) |
| `mj.runtime.event_loop_lag_ms` | Gauge | `ms` | Node.js event-loop p99 delay sampled via `perf_hooks.monitorEventLoopDelay` |
| `mj.db.pool.active_connections` | Gauge | `1` | Database connection pool active connections in use |
| `mj.db.pool.idle_connections` | Gauge | `1` | Database connection pool idle connections available |
| `mj.health.signal_status` | Gauge | `1` | `MJHealthEngine` probe evaluations (`0 = GREEN`, `1 = YELLOW`, `2 = RED`) per signal code |

---

## 5. Security & Attribute Sanitization

All telemetry parameters pass through `SanitizeSpanAttributes` before reaching OpenTelemetry:
- **Redacted Keys**: Any attribute name containing substrings like `password`, `secret`, `token`, `key`, `credential`, `auth`, `hash`, `bearer`, `cookie`, `payload`, `body`, `record`, `sql`, or `filter` is stripped immediately.
- **Payload Safety**: Arbitrary user inputs, SQL WHERE clauses, and database record contents are never placed onto spans.
- **Bounded Values**: Strings longer than 256 characters and complex nested objects/arrays are discarded to avoid buffer bloat.

---

## 6. Distinction Between OTel Spine & Share Layer

| Aspect | OpenTelemetry Spine | Opt-In Phone-Home Share Layer |
|---|---|---|
| **Destination** | The operator's own monitoring infrastructure (Datadog, Grafana, OTel Collector) | Central MemberJunction or federated coordinator |
| **Granularity** | Real-time, per-operation distributed spans and metrics | Coarse daily or aggregated rollups |
| **Payload** | Full operational performance & latency traces | Closed, allowlisted schema DSL records only |
| **Consent Tier** | Operator configured (`mj.config.cjs` / `OTEL_*` env vars) | Formal instance consent tier (`Tier 1` to `Tier 3`) with HMAC signatures |
