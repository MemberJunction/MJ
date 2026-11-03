# @memberjunction/work-queue-engine

## 6.2.0-edge.7

### Patch Changes

- f65fec7: Enable durable `WorkQueue` Database transport by default in `MJServer`, defer `NotifyPublished` and `KickTaskGraphDispatchers` onto `RunAfterCommit`, add `ExhaustionBehavior: 'DeadLetter' | 'Discard'` for ordered partitions, and enlist `DurableEntityActionRegistry` submissions atomically inside `entity.Save()`'s SQL transaction.
- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/work-queue-core@6.2.0-edge.7
  - @memberjunction/work-queue-base@6.2.0-edge.7
  - @memberjunction/sql-dialect@6.2.0-edge.7
  - @memberjunction/credentials@6.2.0-edge.7
  - @memberjunction/work-queue-aws@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/sql-dialect@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/credentials@6.2.0-edge.6
  - @memberjunction/work-queue-base@6.2.0-edge.6
  - @memberjunction/work-queue-aws@6.2.0-edge.6
  - @memberjunction/work-queue-core@6.2.0-edge.6

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
- Updated dependencies [c7d1170]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/sql-dialect@6.2.0-edge.5
  - @memberjunction/credentials@6.2.0-edge.5
  - @memberjunction/work-queue-base@6.2.0-edge.5
  - @memberjunction/work-queue-aws@6.2.0-edge.5
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
- Updated dependencies [20650af]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [e1942c7]
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
  - @memberjunction/sql-dialect@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/credentials@6.2.0-edge.4
  - @memberjunction/work-queue-base@6.2.0-edge.4
  - @memberjunction/work-queue-aws@6.2.0-edge.4
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
  - @memberjunction/sql-dialect@6.2.0-edge.3
  - @memberjunction/work-queue-core@6.2.0-edge.3
  - @memberjunction/work-queue-base@6.2.0-edge.3
  - @memberjunction/work-queue-aws@6.2.0-edge.3
  - @memberjunction/credentials@6.2.0-edge.3
