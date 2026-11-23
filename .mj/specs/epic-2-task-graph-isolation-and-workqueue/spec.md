# Epic 2 — Task Graph Isolation Levels, Queued Graphs & Cloud WorkQueue Transports

## Overview

Epic 2 introduces isolated task-graph execution boundaries, durable queue-backed graph dispatch, an `Enqueue` waiting-step primitive for bounded high-volume fan-out, and full cloud parity across **Database**, **AWS SQS/SNS**, **Azure Service Bus**, and **Google Cloud Pub/Sub** transports.

## 1. Per-Graph Isolation Levels

### Schema & Entity Defaults (`AC-1`)
- **Dual-dialect additive migrations** (`migrations/v6/V202611221400__v6.3.x__TaskGraph_Workflow_Isolation.sql` and `migrations-pg/v6/V202611221400__v6.3.x__TaskGraph_Workflow_Isolation.pg.sql`) add `Isolation` (`InProcess | Worker | Process | Container`) to `__mj.AIAgent` (the owning workflow/flow-agent definition table) and backfill existing rows to `'InProcess'`.
- Generated entity types (`MJAIAgentEntity`) and `Workflow.Draft` default newly authored/model-drafted workflows to `'Worker'` while existing persisted workflows read `'InProcess'` through strongly typed properties (zero `any`, zero `.Get()`/`.Set()`).

### Fault Boundaries & Runners (`AC-2`)
| Isolation Level | Execution Mechanism | Fault & Memory Containment Guarantees |
| --- | --- | --- |
| `InProcess` | Direct host execution in MJAPI | No process/heap isolation; lowest overhead for trusted built-in workflows. |
| `Worker` | Node.js `worker_threads` with V8 `resourceLimits` (`maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`) | Cleanly terminates unbounded V8 JavaScript heap allocations (`ERR_WORKER_OUT_OF_MEMORY`) without crashing MJAPI. **Note:** Native C++ addons and off-heap `Buffer` allocations bypass V8 heap limits and require `Process` or `Container` isolation for OS-level containment. |
| `Process` | Isolated `child_process` | Enforces OS-level memory/timeout resource guards and propagates non-zero exit codes / startup failures cleanly. |
| `Container` | Isolated container runtime (`docker` / OCI CLI) | Full filesystem, network, CPU, and OS-memory cgroup containment with explicit container runtime prerequisite checks and timeout/exit-failure propagation. |

## 2. Queued Graph Dispatch & Durable `Enqueue` Fan-Out (`AC-3`)

- **Queued `TaskGraph.Submit`**: Accepts `Dispatch: 'Inline' | 'Queue'`. When `'Queue'`, publishes a graph-run envelope to the task-graph WorkQueue topic and returns immediately; worker completion records durable terminal state and triggers recoverable caller notification across restarts.
- **`Enqueue` Step Type**: Durably persists waiting-step correlation state (`graphRunId`, `stepInvocationId`, `correlationKey`), publishes work to a named WorkQueue topic, and waits as an `External` step until resolved via idempotent `CompleteWaitingStep`.
- **Early-Completion & Idempotency**: Handles callbacks arriving before waiting-state persistence finishes without stranding the step, and deduplicates repeated completions / redeliveries.
- **Bounded 10,000-Item `ForEach` + `Enqueue` Fan-Out**: Enforces configurable bounded publish concurrency, bounded active isolated runners, backpressure, and retry exhaustion terminal outcomes across both Database and AWS SQS transports.

## 3. Unified Cloud WorkQueue Transports (`AC-4`)

| Transport | Driver Class | Package & Engine Subpath | Partitioning (`Exclusive`) | Serverless Adapter |
| --- | --- | --- | --- | --- |
| Database (SQL Server / PG) | `Database` | `@memberjunction/work-queue-engine` | Atomic SQL claim locks (`Exclusive` & `Ordered`) | In-process `WorkQueueHost` / `mj queue work` |
| AWS SNS + SQS | `AWS` | `@memberjunction/work-queue-aws` / `@memberjunction/work-queue-engine/aws` | FIFO topic/queue `MessageGroupId` | `@memberjunction/work-queue-aws/lambda` (`CreateSqsLambdaHandler`) |
| Azure Service Bus | `Azure` | `@memberjunction/work-queue-azure` / `@memberjunction/work-queue-engine/azure` | Session-enabled subscriptions (`SessionId`) | `@memberjunction/work-queue-azure/functions` (`CreateServiceBusFunctionHandler`) |
| Google Cloud Pub/Sub | `GCP` | `@memberjunction/work-queue-gcp` / `@memberjunction/work-queue-engine/gcp` | Ordering keys (`enableMessageOrdering` + `orderingKey`) | `@memberjunction/work-queue-gcp/cloudrun` (`CreateCloudRunPushHandler`) |

- **Layering & Bundle Budgets**: `ServerBootstrap` and cloud `mj queue` CLI commands load `@memberjunction/work-queue-engine/{aws,azure,gcp}`, keeping `ServerBootstrapLite`, CodeGen, and data providers free of cloud SDKs. Thin serverless adapters enforce <= 150 KB bundle budgets with zero admin client imports.
- **Deterministic CI & Opt-In Live Gates**: All cloud transports ship in-memory gateway fakes (`FakeServiceBusGateway`, `FakePubSubGateway`) running the full `RunTransportConformanceSuite`, while live cloud tests are gated behind `MJ_TEST_LIVE_AZURE_SERVICE_BUS=1` and `MJ_TEST_LIVE_GCP_PUBSUB=1`.
