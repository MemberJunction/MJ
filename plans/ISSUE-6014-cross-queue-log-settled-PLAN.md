# ISSUE-6014 — wait for the Action log row before the Process Run Detail row

**Goal:** `ActionRecordProcessor.ProcessRecord` must not report a record's result (whose detail row carries
`ActionExecutionLogID`, a foreign key to `MJ: Action Execution Logs`) before the Action engine's queued log
write has landed. Design is fixed by the issue brief; this plan only orders the work.

**Architecture:** A pure-read `Settled(key)` query on `KeyedSerialTaskQueue`, forwarded by
`BaseEntitySaveQueue.Settled(entity)`. `ActionEngine` exposes it on `ActionResult.LogEntryPersisted`; the
record processor awaits it. The tracker's detail write stays fire-and-forget.

## Task 1 — `KeyedSerialTaskQueue.Settled` (packages/MJGlobal)
- Tests first in `src/__tests__/KeyedSerialTaskQueue.test.ts`:
  - resolves only after the key's latest task settles (two tasks on the key; Settled taken after both);
  - resolves at once for a key with no task;
  - resolves (does not reject) when the key's task threw.
- Implement `public Settled(key: object): Promise<void>` → `this.tails.get(key) ?? Promise.resolve()`.
  Doc comment next to `Enqueue`'s `after`: `after` is the in-queue form, `Settled` the cross-queue form.

## Task 2 — `BaseEntitySaveQueue.Settled` (packages/MJCore)
- Red test already committed (`src/__tests__/BaseEntitySaveQueue.test.ts`, "Settled (#6014)").
- Implement `public Settled(entity: BaseEntity): Promise<void>` → `this.queue.Settled(entity)`.

## Task 3 — `ActionResult.LogEntryPersisted` (packages/Actions/Base + Engine)
- Add `public LogEntryPersisted?: Promise<void>` to `ActionResult` with the brief's doc comment.
- Tests first in `packages/Actions/Engine/src/__tests__/ActionEngine.test.ts`:
  - normal path (`RunAction`, logging on): `LogEntryPersisted` is set and does not resolve until the log
    entity's `Save` resolves;
  - validation-failure path (`StartAndEndActionLog`): set; with `SkipActionLog: true`: absent.
- Implement in `EndActionLog`: after queuing the UPDATE, set
  `result.LogEntryPersisted = this._logQueue.Settled(logEntity)`. `EndActionLog` is the one call every
  path that returns a `LogEntry` makes (normal, `catch`, and `StartAndEndActionLog` for validation,
  filter and timeout), and it is skipped exactly where `LogEntry` is dropped (`FailuresOnly` + success).

## Task 4 — `ActionRecordProcessor.ProcessRecord` (packages/RecordSetProcessor/engine)
- Tests first in `src/__tests__/processors.test.ts`: stub `ActionEngineServer.Instance` (Config, Actions,
  RunAction); with a pending `LogEntryPersisted`, `ProcessRecord` stays pending until it resolves; with the
  field absent, it resolves normally.
- Implement: `if (result.LogEntryPersisted) await result.LogEntryPersisted;` with the FK reason comment.

## Verification
- `pnpm test` and `pnpm build` in the five packages (build MJGlobal → MJCore → Actions/Base → Actions/Engine
  → RecordSetProcessor/engine, since each depends on the previous dist types).
- Lint the changed files.
- Slot: rebuild, `restart-api`, check the API log for `FK_ProcessRunDetail_ActionExecutionLog`.
