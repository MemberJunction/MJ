# @memberjunction/record-set-processor-base

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/global@5.49.0

## 5.48.0

### Minor Changes

- bda123a: Lists performance overhaul + bug fixes. Read path: the custom List form paginates its Items section (100/page) and resolves member display names in one batched `IN` query per page instead of one query per item (a 1,000-member list drops from ~1,000 requests to 3); the Lists Browse/My Lists dashboards and the Add-to-List panel compute per-list counts via batched count_only queries instead of downloading every List Detail row; single-list-detail export filters membership server-side via a vwListDetails subquery instead of a client-built giant IN clause. Write path: client-side removals batch through TransactionGroups; server-side ListOperations bulk insert/remove and the "Add Records to List" action run with bounded concurrency (10 in-flight) while preserving per-record error isolation. ListSource switches to keyset (AfterKey) pagination with legacy Offset-cursor resume support. DB migration dedupes ListDetail in-place (keeping the oldest row per pair), adds a UNIQUE composite (ListID, RecordID) index that covers the duplicate-check predicate and closes the concurrent-add race, and drops the redundant single-column ListID index. Bug fixes: Add Records dialog spinner never cleared without a user click (missing change-detection after async loads, fixed in both the List form and single-list-detail); the List form's open-record button did nothing; silently-skipped duplicate adds now surface in a result toast (new optional `summary` on `ListManagementResult`). Also: Browse favorites filter persists as a server-side user preference; entities without a NameField now display and search on a sensible fallback field (`ID — value`, new `GetRecordDisplayField` helper); set-operation membership loads and operand pickers carry defensive MaxRows caps with truncation flagging.

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0

## 5.42.0

### Minor Changes

- 0fa3cbc: Record Set Processing & Record Processes, plus the Remote Operations primitive.

  **Remote Operations** (`@memberjunction/core`, `@memberjunction/global`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`) — a typed, provider-routed capability the browser and server both invoke through one call site, the peer of `BaseEntity` (CRUD) and `RunView` (set reads):
  - `BaseRemotableOperation<TInput,TOutput>` with `OperationKey` / `RequiredScope` / `RequiresSystemUser` / `ExecutionMode`; `Execute()` routes per-provider, `ExecuteServer()` runs in-process and never throws on logical failure.
  - `IRemoteOperationProvider.RouteOperation` on `ProviderBase` (the documented power tool), in-process dispatch in `DatabaseProviderBase`, GraphQL marshalling in `GraphQLDataProvider`, and the single generic `ExecuteRemoteOperation` resolver that composes the existing API-key-scope + user-permission auth chain.
  - Genericized value-mapping resolver in `@memberjunction/global` (`getValueAtPath` / `resolveMappingRef` / `resolveValueMapping`) — one canonical mapping engine over pluggable named sources.

  **Record Set Processing substrate** (`@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`) — a hardened iterate-a-record-set-and-do-work engine with three pluggable seams (source / processor / run-tracker): batching, bounded concurrency, rate limiting, circuit breaker, checkpoint/resume, and pause/cancel. Ships Array/View/List/Filter/Keyset sources; Action / Agent / Infer record processors; a uniform `WriteBackProcessor` that applies an `OutputMapping` (fields / child record) to any work type; the `RecordProcessExecutor` facade (Scope→source, Work→processor); and the `RecordProcess.RunNow` / `GetRunStatus` / `Pause` / `Resume` / `Cancel` control operations.

  **Record Processes facade** (`@memberjunction/core-entities`, `@memberjunction/core-entities-server`, `@memberjunction/scheduling-engine`, `@memberjunction/actions`) — the `MJ: Record Processes` definition (Work × Scope × Trigger) plus generic `MJ: Process Runs` / `Process Run Details` tracking and the `MJ: Remote Operations` registry. `MJRecordProcessEntityServer` reconciles the owned recurrence Scheduled Job on save; `RecordProcessScheduledJobDriver` runs a process on its cron schedule and links each `ProcessRun` back to its `ScheduledJobRun`; the Entity Action `GetRecordList` View/List fan-out backs scoped iteration.

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0
