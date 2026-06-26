# @memberjunction/record-set-processor-base

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
