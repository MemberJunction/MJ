# @memberjunction/work-queue-samples

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [59e32e0]
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/work-queue-engine@6.2.0-edge.8
  - @memberjunction/work-queue-core@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [29b16ee]
- Updated dependencies [4283a82]
- Updated dependencies [f65fec7]
- Updated dependencies [4ef13d6]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/work-queue-core@6.2.0-edge.7
  - @memberjunction/work-queue-engine@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [709de1a]
- Updated dependencies [914e6ff]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [5b41d48]
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/work-queue-engine@6.2.0-edge.6
  - @memberjunction/work-queue-core@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [81aea34]
- Updated dependencies [2274f42]
- Updated dependencies [17a4137]
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/work-queue-engine@6.2.0-edge.5
  - @memberjunction/work-queue-core@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [25f7b82]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/work-queue-engine@6.2.0-edge.4
  - @memberjunction/work-queue-core@6.2.0-edge.4

## 6.2.0-edge.3

### Minor Changes

- 49e0bd8: Add the MemberJunction Durable Work Queue and Messaging Framework:
  - **Core & Data Layer**: Transport-neutral queue contracts, database schema and entities for transports, topics, subscriptions, messages, deliveries, and deduplication ledger, backed by guarded-write stored procedures (`spWorkQueue*`) with SQL Server and PostgreSQL support.
  - **Transports**: Native Database transport driver, consumer, and operator; AWS transport (`@memberjunction/work-queue-aws` with SNS topic publishing, SQS FIFO consumer, visibility-timeout leases, dead-letter redrive, binding validation, and LocalStack conformance); and in-memory reference transport.
  - **Runtime & Host**: Competing-consumer `WorkQueueHost` (supporting continuous daemon and one-shot `RunOnce` container modes), `WorkQueueSweeper` (handling lease expiry and retention purging under a distributed sweep lock), REST publish endpoint (`POST /work-queue/topics/{topic}/messages` with API-key and scope authorization), and seven Remote Operations for operator control (`WorkQueue.GetSubscriptionStats`, `ReplayDeadLetter`, `DiscardDelivery`, `ValidateBindings`, etc.).
  - **Operator Surface**: Explorer `WorkQueueDashboard` with Overview, Dead Letters (envelope/payload inspection and replay/discard), Partitions (blocked, in-flight, and idle keys), and Bindings validation tabs, plus a new "Work Queue" application record.
  - **Tooling & Samples**: `mj queue` CLI commands (stats, dead-letters, partitions, replay, discard, backlog, work, export-topology, import-bindings, validate-bindings) and `@memberjunction/work-queue-samples` (`HelloWorldHandler` with sample topologies).

### Patch Changes

- Updated dependencies [dfe40a4]
- Updated dependencies [49e0bd8]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/work-queue-core@6.2.0-edge.3
  - @memberjunction/work-queue-engine@6.2.0-edge.3
