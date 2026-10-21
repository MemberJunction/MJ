# @memberjunction/work-queue-base

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/work-queue-core@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [08b3d7b]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
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

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/work-queue-core@6.2.0-edge.3
