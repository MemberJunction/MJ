# Legacy Queue Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `@memberjunction/queue` hand its tasks to the durable work queue, queue type by queue type, without changing its public API — and repair the legacy path it falls back to.

**Architecture:** `QueueManager.AddTask` first asks whether an **active work queue with the queue type's name** exists; if so it enqueues `{ data, options }` there and returns. A fallback work-queue handler resolves the `QueueBase` driver registered under the queue name and runs its `ProcessTask` through a new `ExecuteTask` method. Entity AI Action tasks stop carrying live `BaseEntity` objects: providers enqueue a serialisable record reference, which the driver reloads. When no such work queue exists, the legacy in-process path runs as before, on a repaired `QueueTask.Status` column.

**Tech Stack:** TypeScript, `@memberjunction/queue`, `@memberjunction/work-queue` (plan 03), SQL Server migration, mj-sync metadata, Vitest.

**Spec:** [01-design.md](01-design.md) and [02-interfaces-and-schema.md](02-interfaces-and-schema.md). Plan [03](03-native-implementation-plan.md) must be complete.

## Global Constraints

- Package manager `pnpm`; unit tests run per package with `cd packages/<Package> && pnpm test`.
- Migrations are T-SQL under `migrations/v6/`, filenames `V<YYYYMMDDHHMM>__v6.<minor>.x__<Description>.sql`, timestamp later than every existing migration. No PostgreSQL counterpart in this plan.
- Metadata primary keys are hardcoded UUIDs already allocated below; `sync` blocks are never hand-written.
- Public members PascalCase; payload JSON camelCase; no `any` in new code (existing `any` in legacy files is left alone); static imports only.
- Compare UUIDs with `UUIDsEqual`; check `Save()`/`Delete()` booleans.
- `QueueManager.AddTask`, `QueueBase`, `TaskBase` and `TaskResult` keep their signatures.

---

## Findings this plan is built on

Research on `packages/MJQueue` (September 2026) found:

| Finding | Evidence | Consequence |
| --- | --- | --- |
| The legacy queue cannot persist a task | `CK_QueueTask_Status` allows only `'In Progress'`, `'Completed'`, `'Failed'`, while `QueueManager.AddTask`, the column default and `spCreateQueueTask` all write `'Pending'`; `Status` is `NCHAR(10)`, too short for `'In Progress'` | Task 1 repairs the column. Integration bundle `queue` (IT82) documents both defects |
| Claims and retries are in memory only | `QueueBase` keeps tasks in an array, never reloads `QueueTask` rows, never writes heartbeats | Crash recovery exists only once a task type is routed to the work queue |
| The only production callers enqueue Entity AI Actions | `GenericDatabaseProvider.EnqueueAfterSaveAIAction`, `SQLServerDataProvider.EnqueueAfterSaveAIAction` and its deferred-task replay | Task 3 changes exactly these three call sites |
| Those callers put a live `BaseEntity` in the task data | `EntityAIActionParams.entityRecord` | A `BaseEntity` cannot be serialised; Task 2 introduces a record reference |
| The Entity AI Action path is deprecated and currently inert | `MJ: Entity AI Actions` and `MJ: AI Actions` have Status `Deprecated`; `BaseAIEngine.EntityAIActions` returns `[]` | Low risk: the port preserves behaviour without depending on it. Removing the path entirely is out of scope |
| Nothing starts queues at server startup | Queues are created lazily on the first `AddTask` | Routing needs no startup change beyond plan 03 |

**Design choices**

- **Routing is opt-in per queue type.** The seeded `Entity AI Action` and `AI Action` work queues are created
  **inactive**. Activating one moves that task type to the work queue; leaving it inactive keeps today's
  in-process behaviour. An operator must run at least one worker (`workQueue.workerEnabled`) before
  activating.
- **The fallback handler covers any `QueueBase` driver**, including drivers in applications outside this
  repository: create an active work queue with the queue type's name and its tasks move.
- **Deprecating `MJ: Queues`, `MJ: Queue Tasks` and `MJ: Queue Types` is deferred** until routing is the
  default, because the legacy path remains the fallback.

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | Repair `QueueTask.Status`; seed inactive legacy work queues | Migration applied; generated `Status` type widened; two work queues seeded |
| 2 | Entity AI Action task references | Serialisable reference, conversion and resolution, tested |
| 3 | `QueueBase.ExecuteTask`; drivers resolve references; providers enqueue references | Legacy and work-queue paths both run Entity AI Actions from a reference |
| 4 | Route `QueueManager.AddTask` and the fallback handler | Routed tasks run through the registered `QueueBase` driver, tested |
| 5 | Integration checks QU8–QU10, manifest, README | IT82 grows to 10 checks and passes on a live database |

## File structure

```
migrations/v6/V<ts>__v6.<minor>.x__Fix_QueueTask_Status.sql                       Task 1
metadata/work-queues/.mj-sync.json · .legacy-queues.json                           Task 1

packages/MJQueue/
  package.json                                                                     Task 4
  README.md                                                                        Task 5
  src/index.ts                                                                     Tasks 2 and 4
  src/references/EntityAIActionTaskReference.ts                                    Task 2
  src/generic/QueueBase.ts                                                         Task 3
  src/drivers/AIActionQueue.ts                                                     Task 3
  src/generic/QueueManager.ts                                                      Task 4
  src/workQueue/LegacyQueueTaskPayload.ts                                          Task 4
  src/workQueue/RouteToWorkQueue.ts                                                Task 4
  src/workQueue/LegacyQueueDriverHandler.ts                                        Task 4
  src/__tests__/EntityAIActionTaskReference.test.ts                                Task 2
  src/__tests__/AIActionQueue.test.ts                                              Task 3
  src/__tests__/RouteToWorkQueue.test.ts · LegacyQueueDriverHandler.test.ts        Task 4

packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts                    Task 3
packages/SQLServerDataProvider/src/SQLServerDataProvider.ts                        Task 3

packages/ServerBootstrap/src/generated/mj-class-registrations.ts                   Task 5
packages/TestingFramework/integration-test-suite/src/checks/queue.checks.ts        Task 5
packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts   Task 5
metadata-optional/integration-test/tests/integration/.IT82-queue.json              Task 5
```

## Pre-flight

- [ ] Plan 03 is merged: `packages/WorkQueue` builds, and `MJ: Work Queues` exists in your database.
- [ ] Your development database is the one `mj.config.cjs` points at, and no other agent shares it.
- [ ] `cd packages/MJQueue && pnpm test` passes before you start.

---

### Task 1: Repair `QueueTask.Status` and seed inactive legacy work queues

**Files:**
- Create: `migrations/v6/V<ts>__v6.<minor>.x__Fix_QueueTask_Status.sql`
- Create: `metadata/work-queues/.mj-sync.json`, `metadata/work-queues/.legacy-queues.json`
- Regenerated by CodeGen: `packages/MJCoreEntities/src/generated/entities/__mj.ts` (the `MJQueueTaskEntity.Status` type) and a `CodeGen_Run_*.sql` migration

**Interfaces:**
- Consumes: `MJ: Work Queues` (plan 03 Task 1).
- Produces: `MJQueueTaskEntity.Status: 'Cancelled' | 'Completed' | 'Failed' | 'In Progress' | 'Pending'`; inactive work queues `Entity AI Action` (`63B30B9C-D16F-4598-A245-DAEACB3981AB`) and `AI Action` (`5D381B80-93D4-47B8-880F-3C608164AE0F`).

- [ ] **Step 1: Confirm the column has no dependent index**

Run against the development database:

```sql
SELECT i.name FROM sys.index_columns ic
JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE ic.object_id = OBJECT_ID(N'__mj.QueueTask') AND c.name = N'Status';
```

Expected: no rows. If an index is listed, drop it before `ALTER COLUMN` in the migration and recreate it after.

- [ ] **Step 2: Write the migration**

`migrations/v6/V<ts>__v6.<minor>.x__Fix_QueueTask_Status.sql`:

```sql
-- Repair MJ: Queue Tasks.Status.
--   * CK_QueueTask_Status allowed only 'In Progress', 'Completed' and 'Failed', but QueueManager.AddTask, the
--     column default and spCreateQueueTask all write 'Pending', so no task could be inserted.
--   * The column was NCHAR(10), too short for 'In Progress', and padded every stored value.
-- The column becomes NVARCHAR(20) with the lifecycle the code actually uses.

DECLARE @DefaultConstraint SYSNAME;
SELECT @DefaultConstraint = dc.name
FROM sys.default_constraints dc
INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'${flyway:defaultSchema}.QueueTask') AND c.name = N'Status';

IF @DefaultConstraint IS NOT NULL
    EXEC (N'ALTER TABLE [${flyway:defaultSchema}].[QueueTask] DROP CONSTRAINT [' + @DefaultConstraint + N']');
GO

ALTER TABLE ${flyway:defaultSchema}.QueueTask DROP CONSTRAINT CK_QueueTask_Status;
GO

ALTER TABLE ${flyway:defaultSchema}.QueueTask ALTER COLUMN Status NVARCHAR(20) NOT NULL;
GO

-- NCHAR storage padded values with trailing spaces; the new CHECK compares exact strings.
UPDATE ${flyway:defaultSchema}.QueueTask SET Status = RTRIM(Status) WHERE Status <> RTRIM(Status);
GO

ALTER TABLE ${flyway:defaultSchema}.QueueTask ADD
    CONSTRAINT DF_QueueTask_Status DEFAULT (N'Pending') FOR Status,
    CONSTRAINT CK_QueueTask_Status CHECK (Status IN (N'Pending', N'In Progress', N'Completed', N'Failed', N'Cancelled'));
GO

EXEC sp_updateextendedproperty @name = N'MS_Description',
    @value = N'Lifecycle of the task: Pending when created, In Progress while a queue runs it, then Completed, Failed or Cancelled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'QueueTask',
    @level2type = N'COLUMN', @level2name = N'Status';
GO
```

If `sp_updateextendedproperty` fails because the column has no description yet, change it to
`sp_addextendedproperty` with the same arguments.

- [ ] **Step 3: Apply the migration and regenerate**

Run: `pnpm run mj:migrate`
Expected: the migration applies with no errors.

Run: `pnpm exec mj codegen --skipfiles`
Then run: `pnpm exec mj codegen --skipdb`

Run: `grep -n "get Status(): 'Cancelled' | 'Completed' | 'Failed' | 'In Progress' | 'Pending'" packages/MJCoreEntities/src/generated/entities/__mj.ts`
Expected: one match, in `MJQueueTaskEntity`.

Commit the `CodeGen_Run_*.sql` file CodeGen writes alongside the migration.

- [ ] **Step 4: Seed the legacy work queues, inactive**

`metadata/work-queues/.mj-sync.json`:

```json
{
  "entity": "MJ: Work Queues",
  "filePattern": "**/.*.json"
}
```

`metadata/work-queues/.legacy-queues.json`:

```json
[
  {
    "fields": {
      "Name": "Entity AI Action",
      "Description": "Runs MJQueue 'Entity AI Action' tasks through the durable work queue. Inactive by default: activate it only when at least one server runs the work queue worker; while inactive, QueueManager runs these tasks in-process as before.",
      "LeaseSeconds": 600,
      "MaxAttempts": 3,
      "InitialBackoffSeconds": 30,
      "MaxBackoffSeconds": 600,
      "DeadLetterPolicy": "Skip Partition",
      "PurgeOnComplete": true,
      "IsActive": false
    },
    "primaryKey": { "ID": "63B30B9C-D16F-4598-A245-DAEACB3981AB" }
  },
  {
    "fields": {
      "Name": "AI Action",
      "Description": "Runs MJQueue 'AI Action' tasks through the durable work queue. Inactive by default: activate it only when at least one server runs the work queue worker; while inactive, QueueManager runs these tasks in-process as before.",
      "LeaseSeconds": 600,
      "MaxAttempts": 3,
      "InitialBackoffSeconds": 30,
      "MaxBackoffSeconds": 600,
      "DeadLetterPolicy": "Skip Partition",
      "PurgeOnComplete": true,
      "IsActive": false
    },
    "primaryKey": { "ID": "5D381B80-93D4-47B8-880F-3C608164AE0F" }
  }
]
```

Run: `pnpm exec mj sync push --dir=metadata --ci --dry-run`
Expected: 2 work queue creates; no other changes.

Run: `pnpm exec mj sync push --dir=metadata --ci`

- [ ] **Step 5: Verify the repaired column**

Run against the development database:

```sql
SELECT TOP 0 * FROM __mj.QueueTask;  -- confirms the table still compiles into its view
SELECT c.name, t.name AS type_name, c.max_length FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'__mj.QueueTask') AND c.name = N'Status';
```

Expected: `Status nvarchar 40` (40 bytes = 20 characters).

- [ ] **Step 6: Commit**

```bash
git add migrations/v6 metadata/work-queues packages/MJCoreEntities/src/generated
git commit -m "fix(queue): repair QueueTask.Status and seed inactive legacy work queues"
```

---

### Task 2: Entity AI Action task references

**Files:**
- Create: `packages/MJQueue/src/references/EntityAIActionTaskReference.ts`
- Modify: `packages/MJQueue/src/index.ts`
- Test: `packages/MJQueue/src/__tests__/EntityAIActionTaskReference.test.ts`

**Interfaces:**
- Consumes: `CompositeKey`, `KeyValuePair`, `BaseEntity`, `UserInfo` (`@memberjunction/core`); `EntityAIActionParams` (`@memberjunction/aiengine`).
- Produces:
  - `interface EntityAIActionTaskReference { kind: 'EntityAIActionReference'; entityName: string; primaryKey: { fieldName: string; value: string }[]; entityAIActionId: string; actionId: string; modelId: string }`
  - `ToEntityAIActionTaskReference(params: EntityAIActionParams): EntityAIActionTaskReference`
  - `IsEntityAIActionTaskReference(data: unknown): data is EntityAIActionTaskReference`
  - `interface EntityObjectSource { GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> }`
  - `ResolveEntityAIActionParams(reference, source: EntityObjectSource, contextUser: UserInfo): Promise<EntityAIActionParams>`

A reference names the record by entity and primary key and reloads it when the task runs. The action
therefore sees the record as committed, not as it was in memory when the save fired, which is also what an
after-save action deferred past a transaction commit needs.

- [ ] **Step 1: Write the failing test**

`packages/MJQueue/src/__tests__/EntityAIActionTaskReference.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, type BaseEntity, type UserInfo } from '@memberjunction/core';
import type { EntityAIActionParams } from '@memberjunction/aiengine';
import {
    IsEntityAIActionTaskReference, ResolveEntityAIActionParams, ToEntityAIActionTaskReference,
    type EntityObjectSource,
} from '../references/EntityAIActionTaskReference';

const USER = {} as UserInfo;

/** Only the members the reference code touches; the rest of BaseEntity is irrelevant here. */
function fakeRecord(loads: boolean): BaseEntity {
    const record = {
        EntityInfo: { Name: 'Contacts' },
        PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'C-1'),
        InnerLoad: vi.fn(async () => loads),
    };
    return record as unknown as BaseEntity;
}

const PARAMS: EntityAIActionParams = {
    entityAIActionId: 'EAA-1', actionId: 'A-1', modelId: 'M-1', entityRecord: fakeRecord(true),
};

describe('Entity AI Action task references', () => {
    it('names the record by entity and primary key, and survives JSON', () => {
        const reference = ToEntityAIActionTaskReference(PARAMS);
        expect(JSON.parse(JSON.stringify(reference))).toEqual({
            kind: 'EntityAIActionReference', entityName: 'Contacts', primaryKey: [{ fieldName: 'ID', value: 'C-1' }],
            entityAIActionId: 'EAA-1', actionId: 'A-1', modelId: 'M-1',
        });
    });

    it('recognises a reference and nothing else', () => {
        expect(IsEntityAIActionTaskReference(ToEntityAIActionTaskReference(PARAMS))).toBe(true);
        expect(IsEntityAIActionTaskReference(PARAMS)).toBe(false);
        expect(IsEntityAIActionTaskReference({ kind: 'EntityAIActionReference' })).toBe(false);
        expect(IsEntityAIActionTaskReference(null)).toBe(false);
    });

    it('reloads the record and rebuilds the action parameters', async () => {
        const record = fakeRecord(true);
        const source: EntityObjectSource = { GetEntityObject: vi.fn(async () => record) as EntityObjectSource['GetEntityObject'] };
        const params = await ResolveEntityAIActionParams(ToEntityAIActionTaskReference(PARAMS), source, USER);
        expect(source.GetEntityObject).toHaveBeenCalledWith('Contacts', USER);
        expect(params).toEqual({ entityAIActionId: 'EAA-1', actionId: 'A-1', modelId: 'M-1', entityRecord: record });
        const key = vi.mocked(record.InnerLoad).mock.calls[0][0];
        expect(key.KeyValuePairs.map(pair => [pair.FieldName, pair.Value])).toEqual([['ID', 'C-1']]);
    });

    it('fails clearly when the record no longer exists', async () => {
        const source: EntityObjectSource = { GetEntityObject: vi.fn(async () => fakeRecord(false)) as EntityObjectSource['GetEntityObject'] };
        await expect(ResolveEntityAIActionParams(ToEntityAIActionTaskReference(PARAMS), source, USER))
            .rejects.toThrow('Entity AI Action record not found: Contacts');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/MJQueue && pnpm test EntityAIActionTaskReference`
Expected: FAIL — unresolved import `../references/EntityAIActionTaskReference`.

- [ ] **Step 3: Write `src/references/EntityAIActionTaskReference.ts`**

```typescript
import { CompositeKey, KeyValuePair, type BaseEntity, type UserInfo } from '@memberjunction/core';
import type { EntityAIActionParams } from '@memberjunction/aiengine';

/**
 * Serialisable stand-in for EntityAIActionParams. It names the record instead of carrying the live
 * BaseEntity, so the task can be stored as JSON and the record reloaded when the task runs.
 */
export interface EntityAIActionTaskReference {
    kind: 'EntityAIActionReference';
    entityName: string;
    primaryKey: { fieldName: string; value: string }[];
    entityAIActionId: string;
    actionId: string;
    modelId: string;
}

/** The provider slice needed to reload a record. IMetadataProvider and Metadata satisfy it. */
export interface EntityObjectSource {
    GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
}

export function ToEntityAIActionTaskReference(params: EntityAIActionParams): EntityAIActionTaskReference {
    const record = params.entityRecord;
    return {
        kind: 'EntityAIActionReference',
        entityName: record.EntityInfo.Name,
        primaryKey: record.PrimaryKey.KeyValuePairs.map(pair => ({ fieldName: pair.FieldName, value: String(pair.Value) })),
        entityAIActionId: params.entityAIActionId,
        actionId: params.actionId,
        modelId: params.modelId,
    };
}

export function IsEntityAIActionTaskReference(data: unknown): data is EntityAIActionTaskReference {
    return typeof data === 'object' && data !== null
        && 'kind' in data && data.kind === 'EntityAIActionReference'
        && 'entityName' in data && typeof data.entityName === 'string'
        && 'primaryKey' in data && Array.isArray(data.primaryKey)
        && 'entityAIActionId' in data && typeof data.entityAIActionId === 'string'
        && 'actionId' in data && typeof data.actionId === 'string'
        && 'modelId' in data && typeof data.modelId === 'string';
}

/** Reloads the referenced record. Throws when it no longer exists. */
export async function ResolveEntityAIActionParams(
    reference: EntityAIActionTaskReference,
    source: EntityObjectSource,
    contextUser: UserInfo,
): Promise<EntityAIActionParams> {
    const record = await source.GetEntityObject<BaseEntity>(reference.entityName, contextUser);
    const key = CompositeKey.FromKeyValuePairs(reference.primaryKey.map(pair => new KeyValuePair(pair.fieldName, pair.value)));
    if (!(await record.InnerLoad(key))) {
        throw new Error(`Entity AI Action record not found: ${reference.entityName} ${JSON.stringify(reference.primaryKey)}`);
    }
    return {
        entityAIActionId: reference.entityAIActionId,
        entityRecord: record,
        actionId: reference.actionId,
        modelId: reference.modelId,
    };
}
```

- [ ] **Step 4: Export it**

Append to `packages/MJQueue/src/index.ts`:

```typescript
export * from './references/EntityAIActionTaskReference';
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/MJQueue && pnpm test`
Expected: PASS — the existing suite plus EntityAIActionTaskReference (4).

Run: `cd packages/MJQueue && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/MJQueue/src
git commit -m "feat(queue): serialisable Entity AI Action task references"
```

---

### Task 3: `QueueBase.ExecuteTask`, reference-aware drivers and reference-enqueuing providers

**Files:**
- Modify: `packages/MJQueue/src/generic/QueueBase.ts`, `packages/MJQueue/src/drivers/AIActionQueue.ts`
- Modify: `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`, `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`
- Test: `packages/MJQueue/src/__tests__/AIActionQueue.test.ts`

**Interfaces:**
- Consumes: `IsEntityAIActionTaskReference`, `ResolveEntityAIActionParams`, `ToEntityAIActionTaskReference` (Task 2).
- Produces:
  - `QueueBase.ExecuteTask(task: TaskBase, contextUser: UserInfo): Promise<TaskResult>` — runs `ProcessTask` without the in-memory loop or `QueueTask` persistence; never throws
  - `AIActionQueue.EntityAIActionParamsFor(task: TaskBase): Promise<EntityAIActionParams>` (protected)
  - Providers enqueue `EntityAIActionTaskReference`, never `EntityAIActionParams`

`ExecuteTask` is the seam the work-queue handler (Task 4) uses. Drivers accept both shapes of task data:
a reference (all producers after this task) or parameters carrying a live record (any external caller not yet
updated). A reference whose record was deleted becomes a failed task, not a crash.

- [ ] **Step 1: Write the failing test**

`packages/MJQueue/src/__tests__/AIActionQueue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeEntityAIAction, executeAIAction, getEntityObject } = vi.hoisted(() => ({
    executeEntityAIAction: vi.fn(),
    executeAIAction: vi.fn(),
    getEntityObject: vi.fn(),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            ExecuteEntityAIAction: executeEntityAIAction,
            ExecuteAIAction: executeAIAction,
        },
    },
}));

vi.mock('@memberjunction/core', async importOriginal => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    Metadata: class {
        GetEntityObject = getEntityObject;
    },
}));

import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJQueueEntity, MJQueueTaskEntity } from '@memberjunction/core-entities';
import { AIActionQueue, EntityAIActionQueue } from '../drivers/AIActionQueue';
import { QueueBase, TaskBase, type TaskResult } from '../generic/QueueBase';
import type { EntityAIActionTaskReference } from '../references/EntityAIActionTaskReference';

const USER = {} as UserInfo;
const QUEUE_RECORD = {} as MJQueueEntity;
const REFERENCE: EntityAIActionTaskReference = {
    kind: 'EntityAIActionReference', entityName: 'Contacts', primaryKey: [{ fieldName: 'ID', value: 'C-1' }],
    entityAIActionId: 'EAA-1', actionId: 'A-1', modelId: 'M-1',
};

function makeTask(data: unknown): TaskBase {
    return new TaskBase({} as MJQueueTaskEntity, data, {});
}

class ThrowingQueue extends QueueBase {
    protected async ProcessTask(): Promise<TaskResult> {
        throw new Error('boom');
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    executeEntityAIAction.mockResolvedValue({ success: true });
    executeAIAction.mockResolvedValue({ success: true });
});

describe('EntityAIActionQueue', () => {
    it('reloads a referenced record before running the action', async () => {
        const record = { InnerLoad: vi.fn(async () => true) } as unknown as BaseEntity;
        getEntityObject.mockResolvedValue(record);
        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(makeTask(REFERENCE), USER);
        expect(result.success).toBe(true);
        expect(getEntityObject).toHaveBeenCalledWith('Contacts', USER);
        expect(executeEntityAIAction).toHaveBeenCalledWith({ entityAIActionId: 'EAA-1', actionId: 'A-1', modelId: 'M-1', entityRecord: record });
    });

    it('still accepts parameters that carry a live record', async () => {
        const params = { entityAIActionId: 'EAA-1', actionId: 'A-1', modelId: 'M-1', entityRecord: {} };
        await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(makeTask(params), USER);
        expect(executeEntityAIAction).toHaveBeenCalledWith(params);
        expect(getEntityObject).not.toHaveBeenCalled();
    });

    it('reports a deleted record as a failed task without running the action', async () => {
        getEntityObject.mockResolvedValue({ InnerLoad: vi.fn(async () => false) });
        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(makeTask(REFERENCE), USER);
        expect(result.success).toBe(false);
        expect(result.userMessage).toContain('Entity AI Action record not found: Contacts');
        expect(executeEntityAIAction).not.toHaveBeenCalled();
    });

    it('reports a failed action with its message', async () => {
        getEntityObject.mockResolvedValue({ InnerLoad: vi.fn(async () => true) });
        executeEntityAIAction.mockResolvedValue({ success: false, errorMessage: 'model refused' });
        const result = await new EntityAIActionQueue(QUEUE_RECORD, 'type-1', USER).ExecuteTask(makeTask(REFERENCE), USER);
        expect(result).toMatchObject({ success: false, userMessage: 'model refused' });
    });
});

describe('AIActionQueue', () => {
    it('runs a plain AI action with the task data', async () => {
        const data = { actionId: 'A-1', modelId: 'M-1' };
        await new AIActionQueue(QUEUE_RECORD, 'type-2', USER).ExecuteTask(makeTask(data), USER);
        expect(executeAIAction).toHaveBeenCalledWith(data);
    });
});

describe('QueueBase.ExecuteTask', () => {
    it('turns a throwing ProcessTask into a failed result', async () => {
        const result = await new ThrowingQueue(QUEUE_RECORD, 'type-3', USER).ExecuteTask(makeTask({}), USER);
        expect(result).toMatchObject({ success: false, userMessage: 'Execution Error: boom' });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/MJQueue && pnpm test AIActionQueue`
Expected: FAIL — `ExecuteTask is not a function`.

- [ ] **Step 3: Add `ExecuteTask` to `QueueBase`**

In `packages/MJQueue/src/generic/QueueBase.ts`, directly after the `protected abstract ProcessTask(…)`
declaration, add:

```typescript
  /**
   * Runs one task through this driver's ProcessTask without the in-memory loop or QueueTask persistence.
   * The work queue's legacy handler calls this and owns retries and status. Never throws: a throwing
   * ProcessTask becomes a failed TaskResult, as it does in StartTask.
   */
  public async ExecuteTask(task: TaskBase, contextUser: UserInfo): Promise<TaskResult> {
    try {
      return await this.ProcessTask(task, contextUser);
    }
    catch (e) {
      return {
        success: false,
        output: null,
        userMessage: 'Execution Error: ' + (e instanceof Error ? e.message : String(e)),
        exception: e
      };
    }
  }
```

- [ ] **Step 4: Make the AI action drivers resolve references**

Replace `packages/MJQueue/src/drivers/AIActionQueue.ts` with:

```typescript
import { QueueBase, TaskBase, TaskResult } from "../generic/QueueBase";
import { RegisterClass } from '@memberjunction/global'
import { Metadata } from '@memberjunction/core';
import { AIEngine, type EntityAIActionParams } from '@memberjunction/aiengine';
import { IsEntityAIActionTaskReference, ResolveEntityAIActionParams } from '../references/EntityAIActionTaskReference';

@RegisterClass(QueueBase, 'AI Action')
export class AIActionQueue extends QueueBase {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.ProcessGeneric(task, false)
    }

    protected async ProcessGeneric(task: TaskBase, entityAIAction: boolean): Promise<TaskResult> {
        try {
            await AIEngine.Instance.Config(false, this._contextUser);
            let result: any = null;

            if (entityAIAction)
                result = await AIEngine.Instance.ExecuteEntityAIAction(await this.EntityAIActionParamsFor(task));
            else
                result = await AIEngine.Instance.ExecuteAIAction(task.Data);

            return {
                success: result ? result.success : false,
                output: result ? (result.success ? null : result.errorMessage) : null,
                userMessage: result ? result.errorMessage : null,
                exception: null
            }
        }
        catch (e) {
            return {
                success: false,
                output: null,
                userMessage: 'Execution Error: ' + e.message,
                exception: e
            }
        }
    }

    /**
     * Task data is an EntityAIActionTaskReference (every producer after the work queue port, and anything
     * restored from storage) or, from callers not yet updated, EntityAIActionParams carrying the live record.
     */
    protected async EntityAIActionParamsFor(task: TaskBase): Promise<EntityAIActionParams> {
        if (IsEntityAIActionTaskReference(task.Data)) {
            const md = new Metadata(); // global-provider-ok: queue drivers are process-scoped and receive no provider
            return ResolveEntityAIActionParams(task.Data, md, this._contextUser);
        }
        return task.Data;
    }
}

@RegisterClass(QueueBase, 'Entity AI Action', 1)
export class EntityAIActionQueue extends AIActionQueue {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.ProcessGeneric(task, true)
    }
}
```

Only `EntityAIActionParamsFor` and its call are new; the `any` and result mapping are the existing code.

- [ ] **Step 5: Run the MJQueue tests**

Run: `cd packages/MJQueue && pnpm test`
Expected: PASS — the existing suite, EntityAIActionTaskReference (4) and AIActionQueue (6).

Run: `cd packages/MJQueue && pnpm run build`
Expected: builds.

- [ ] **Step 6: Enqueue references from the providers**

In `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts`, change the import

```typescript
import { QueueManager } from '@memberjunction/queue';
```

to

```typescript
import { QueueManager, ToEntityAIActionTaskReference } from '@memberjunction/queue';
```

and replace `EnqueueAfterSaveAIAction` with:

```typescript
    /**
     * Enqueues an after-save AI action for execution. By default, immediately adds
     * to QueueManager. Subclasses with transaction support can override to defer
     * until after transaction commit. Task data is a record reference, never the live
     * entity: it is serialised, and may run later or in another process.
     */
    protected EnqueueAfterSaveAIAction(params: EntityAIActionParams, user: UserInfo): void {
        QueueManager.AddTask('Entity AI Action', ToEntityAIActionTaskReference(params), null, user);
    }
```

In `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`, change the import

```typescript
import { QueueManager } from '@memberjunction/queue';
```

to

```typescript
import { QueueManager, ToEntityAIActionTaskReference } from '@memberjunction/queue';
```

and replace the `EnqueueAfterSaveAIAction` override with:

```typescript
  /**
   * Override to defer AI action tasks when a transaction is active.
   * When inside a transaction, tasks are queued to _deferredTasks and
   * processed after transaction commit (see processDeferredTasks).
   * The reference is captured now; the record is reloaded, as committed, when the task runs.
   */
  protected override EnqueueAfterSaveAIAction(params: EntityAIActionParams, user: UserInfo): void {
    const reference = ToEntityAIActionTaskReference(params);
    if (this.isTransactionActive) {
      this._deferredTasks.push({ type: 'Entity AI Action', data: reference, options: null, user });
    } else {
      QueueManager.AddTask('Entity AI Action', reference, null, user);
    }
  }
```

`processDeferredTasks` needs no change: it passes `task.data`, which is now the reference.

- [ ] **Step 7: Build and test the providers**

Run: `cd packages/GenericDatabaseProvider && pnpm run build && pnpm test`
Expected: builds; PASS (the existing `EnqueueAfterSaveAIAction` test only checks the method exists).

Run: `cd packages/SQLServerDataProvider && pnpm run build && pnpm test`
Expected: builds; PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/MJQueue/src packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts packages/SQLServerDataProvider/src/SQLServerDataProvider.ts
git commit -m "feat(queue): run Entity AI Actions from record references; add QueueBase.ExecuteTask"
```

---

### Task 4: Route `QueueManager.AddTask` to the work queue; the fallback handler

**Files:**
- Modify: `packages/MJQueue/package.json`, `packages/MJQueue/src/generic/QueueManager.ts`, `packages/MJQueue/src/index.ts`
- Create: `packages/MJQueue/src/workQueue/LegacyQueueTaskPayload.ts`, `src/workQueue/RouteToWorkQueue.ts`, `src/workQueue/LegacyQueueDriverHandler.ts`
- Test: `packages/MJQueue/src/__tests__/RouteToWorkQueue.test.ts`, `src/__tests__/LegacyQueueDriverHandler.test.ts`

**Interfaces:**
- Consumes: `WorkQueueRuntime`, `BaseWorkQueueHandler`, `WorkQueueContext`, `FatalQueueError`, `TransientQueueError`, `WORK_QUEUE_FALLBACK_HANDLER_KEY` (plan 03); `QueueBase.ExecuteTask` (Task 3); `TaskBase`, `TaskOptions`.
- Produces:
  - `interface LegacyQueueTaskPayload { data: unknown; options: TaskOptions | null }`
  - `TryRouteToWorkQueue(queueType: string, data: unknown, options: TaskOptions | null, contextUser: UserInfo): Promise<boolean>`
  - `class LegacyQueueDriverHandler extends BaseWorkQueueHandler<LegacyQueueTaskPayload>`, registered under `WORK_QUEUE_FALLBACK_HANDLER_KEY`
  - `QueueManager.AddTask` (static) routes first; its signature is unchanged

Routing rules:

| Situation | `TryRouteToWorkQueue` | `QueueManager.AddTask` (static) |
| --- | --- | --- |
| No work queue runtime in this process (CLI, CodeGen, tests) | `false` | legacy in-process path |
| No **active** work queue whose name matches the queue type (trimmed, case-insensitive) | `false` | legacy path |
| Work queue metadata cannot be read | `false`, logged | legacy path |
| Active same-named work queue | enqueues `{ data, options }`; `true` | returns `undefined` — there is no in-process `TaskBase` |
| Enqueue throws | logged; `true` | returns `undefined`; the task is not also run in-process, so it can never run twice |

Only the static `AddTask(QueueType, …)` routes. The instance `AddTask(QueueTypeID, …)` always uses the legacy
path; no production caller uses it.

Handler rules: the driver comes from `ClassFactory.GetRegistration(QueueBase, <queue name>)`, receives unsaved
`MJ: Queues` and `MJ: Queue Tasks` records (routed tasks are tracked as work queue items, not `QueueTask` rows),
and runs through `ExecuteTask`. A failed `TaskResult` throws `TransientQueueError` (retried with the queue's
backoff, then dead-lettered). No registered driver, or a payload without `data`, throws `FatalQueueError`.
Because this is the work queue's **fallback** handler, any queue with no handler of its own now dead-letters
with reason `'Fatal Error'` and message `No handler is registered for queue '<name>'`, instead of
`'Handler Not Found'`.

- [ ] **Step 1: Add the dependency**

In `packages/MJQueue/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue": "6.1.0-edge.4",
```

Run: `pnpm install` (repository root)
Expected: installs. `@memberjunction/work-queue` does not depend on `@memberjunction/queue`, so no cycle forms.

- [ ] **Step 2: Write the failing tests**

`packages/MJQueue/src/__tests__/RouteToWorkQueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
    BaseWorkQueueDriver, NATIVE_DRIVER_CAPABILITIES, WorkQueueMetadataIndex, WorkQueueProducer, WorkQueueRuntime,
    type ClaimedWorkItem, type DeliveredItem, type DeliveryEnvelope, type DeliveryTarget,
    type WorkQueueDefinition, type WorkQueueMetadataSource,
} from '@memberjunction/work-queue';
import { TryRouteToWorkQueue } from '../workQueue/RouteToWorkQueue';

const USER = {} as UserInfo;

function unused<T>(): Promise<T> {
    return Promise.reject(new Error('not used by these tests'));
}

class RecordingDriver extends BaseWorkQueueDriver {
    public readonly DriverKey = 'Recording';
    public readonly Capabilities = NATIVE_DRIVER_CAPABILITIES;
    public readonly Deliveries: { Targets: DeliveryTarget[]; Envelope: DeliveryEnvelope }[] = [];
    public async Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope): Promise<DeliveredItem[]> {
        this.Deliveries.push({ Targets: targets, Envelope: envelope });
        return targets.map(target => ({ ItemID: `item-${target.QueueName}`, QueueID: target.QueueID }));
    }
    public Claim(): Promise<ClaimedWorkItem | null> { return unused(); }
    public Heartbeat(): Promise<boolean> { return unused(); }
    public Complete(): Promise<boolean> { return unused(); }
    public Retry(): Promise<boolean> { return unused(); }
    public DeadLetter(): Promise<boolean> { return unused(); }
    public ReapLeaseExhausted(): Promise<number> { return unused(); }
}

function legacyQueue(isActive: boolean): WorkQueueDefinition {
    return {
        ID: '63B30B9C-D16F-4598-A245-DAEACB3981AB', Name: 'Entity AI Action', LeaseSeconds: 600, MaxAttempts: 3,
        InitialBackoffSeconds: 30, MaxBackoffSeconds: 600, DeadLetterPolicy: 'Skip Partition', PurgeOnComplete: true, IsActive: isActive,
    };
}

let driver: RecordingDriver;

function configure(metadata: WorkQueueMetadataSource): void {
    WorkQueueRuntime.Instance.Configure({ Driver: driver, Metadata: metadata, Producer: new WorkQueueProducer(driver, metadata) });
}

function withQueues(queues: WorkQueueDefinition[]): WorkQueueMetadataSource {
    return { GetIndex: async () => new WorkQueueMetadataIndex(queues, [], []) };
}

beforeEach(() => {
    WorkQueueRuntime.Instance.Reset();
    driver = new RecordingDriver();
});

describe('TryRouteToWorkQueue', () => {
    it('leaves the task to the legacy path when this process has no work queue runtime', async () => {
        expect(await TryRouteToWorkQueue('Entity AI Action', {}, null, USER)).toBe(false);
    });

    it('leaves the task to the legacy path when the same-named work queue is inactive or missing', async () => {
        configure(withQueues([legacyQueue(false)]));
        expect(await TryRouteToWorkQueue('Entity AI Action', {}, null, USER)).toBe(false);
        expect(await TryRouteToWorkQueue('AI Action', {}, null, USER)).toBe(false);
        expect(driver.Deliveries).toHaveLength(0);
    });

    it('enqueues data and options on the active same-named work queue', async () => {
        configure(withQueues([legacyQueue(true)]));
        expect(await TryRouteToWorkQueue(' entity ai action ', { kind: 'x' }, { priority: 2 }, USER)).toBe(true);
        expect(driver.Deliveries[0].Targets.map(target => target.QueueName)).toEqual(['Entity AI Action']);
        expect(driver.Deliveries[0].Envelope.PayloadJSON).toBe('{"data":{"kind":"x"},"options":{"priority":2}}');
    });

    it('stores missing data and options as null', async () => {
        configure(withQueues([legacyQueue(true)]));
        await TryRouteToWorkQueue('Entity AI Action', undefined, null, USER);
        expect(driver.Deliveries[0].Envelope.PayloadJSON).toBe('{"data":null,"options":null}');
    });

    it('keeps ownership when enqueueing fails, so the task never also runs in-process', async () => {
        configure(withQueues([legacyQueue(true)]));
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(await TryRouteToWorkQueue('Entity AI Action', circular, null, USER)).toBe(true);
        expect(driver.Deliveries).toHaveLength(0);
    });

    it('falls back to the legacy path when work queue metadata cannot be read', async () => {
        configure({ GetIndex: async () => { throw new Error('database unavailable'); } });
        expect(await TryRouteToWorkQueue('Entity AI Action', {}, null, USER)).toBe(false);
    });
});
```

`packages/MJQueue/src/__tests__/LegacyQueueDriverHandler.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseWorkQueueHandler, FatalQueueError, TransientQueueError, WORK_QUEUE_FALLBACK_HANDLER_KEY, type WorkQueueContext,
} from '@memberjunction/work-queue';
import { QueueBase, TaskBase, type TaskResult } from '../generic/QueueBase';
import { LegacyQueueDriverHandler } from '../workQueue/LegacyQueueDriverHandler';
import type { LegacyQueueTaskPayload } from '../workQueue/LegacyQueueTaskPayload';

const USER = {} as UserInfo;
const seen: { Data: unknown; Options: unknown }[] = [];
let nextResult: TaskResult;

class RecordingLegacyQueue extends QueueBase {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        seen.push({ Data: task.Data, Options: task.Options });
        return nextResult;
    }
}
MJGlobal.Instance.ClassFactory.Register(QueueBase, RecordingLegacyQueue, 'legacy-test-queue');

const getEntityObject = vi.fn(async () => ({ NewRecord: vi.fn(), Name: '' }));
/** Hands out unsaved record stand-ins; the driver under test never reads them. */
const PROVIDER = { GetEntityObject: getEntityObject } as unknown as IMetadataProvider;

function makeContext(queueName: string, payload: LegacyQueueTaskPayload): WorkQueueContext<LegacyQueueTaskPayload> {
    return {
        ItemID: 'I-1', PublishID: 'P-1', QueueName: queueName, TopicName: null, PartitionKey: null, TenantID: null,
        CorrelationID: null, Payload: payload, AttemptCount: 1, MaxAttempts: 3, FenceToken: 1, ContextUser: USER,
        Provider: PROVIDER, Heartbeat: async () => true, LeaseLost: false,
    };
}

beforeEach(() => {
    seen.length = 0;
    getEntityObject.mockClear();
    nextResult = { success: true, userMessage: '', output: null, exception: null };
});

describe('LegacyQueueDriverHandler', () => {
    it('is the work queue fallback handler', () => {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseWorkQueueHandler, WORK_QUEUE_FALLBACK_HANDLER_KEY);
        expect(registration?.SubClass).toBe(LegacyQueueDriverHandler);
    });

    it('runs the QueueBase driver registered under the queue name with the task data and options', async () => {
        await new LegacyQueueDriverHandler().Handle(makeContext('Legacy-Test-Queue', { data: { a: 1 }, options: { priority: 2 } }));
        expect(seen).toEqual([{ Data: { a: 1 }, Options: { priority: 2 } }]);
        expect(getEntityObject.mock.calls.map(call => call[0]).sort()).toEqual(['MJ: Queue Tasks', 'MJ: Queues']);
    });

    it('retries a failed task with its message', async () => {
        nextResult = { success: false, userMessage: 'upstream timeout', output: null, exception: null };
        const handling = new LegacyQueueDriverHandler().Handle(makeContext('legacy-test-queue', { data: {}, options: null }));
        await expect(handling).rejects.toThrow(TransientQueueError);
        await expect(new LegacyQueueDriverHandler().Handle(makeContext('legacy-test-queue', { data: {}, options: null }))).rejects.toThrow('upstream timeout');
    });

    it('dead-letters a queue that has no legacy driver either', async () => {
        const handling = new LegacyQueueDriverHandler().Handle(makeContext('no-such-legacy-queue', { data: {}, options: null }));
        await expect(handling).rejects.toThrow(FatalQueueError);
        await expect(new LegacyQueueDriverHandler().Handle(makeContext('no-such-legacy-queue', { data: {}, options: null })))
            .rejects.toThrow("No handler is registered for queue 'no-such-legacy-queue'");
    });

    it('dead-letters a payload that is not a legacy task', async () => {
        const notLegacy = { importId: 7 } as unknown as LegacyQueueTaskPayload;
        await expect(new LegacyQueueDriverHandler().Handle(makeContext('legacy-test-queue', notLegacy))).rejects.toThrow('is not a legacy queue task');
        expect(seen).toHaveLength(0);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm run build` (MJQueue consumes the built package)
Run: `cd packages/MJQueue && pnpm test RouteToWorkQueue LegacyQueueDriverHandler`
Expected: FAIL — unresolved imports `../workQueue/RouteToWorkQueue` and `../workQueue/LegacyQueueDriverHandler`.

- [ ] **Step 4: Write `src/workQueue/LegacyQueueTaskPayload.ts`**

```typescript
import type { TaskOptions } from '../generic/QueueBase';

/** The work-queue payload QueueManager.AddTask enqueues for a routed queue type. */
export interface LegacyQueueTaskPayload {
    /** The data passed to AddTask. It must survive JSON; Entity AI Actions pass an EntityAIActionTaskReference. */
    data: unknown;
    options: TaskOptions | null;
}
```

- [ ] **Step 5: Write `src/workQueue/RouteToWorkQueue.ts`**

```typescript
import { LogError, type UserInfo } from '@memberjunction/core';
import { WorkQueueRuntime } from '@memberjunction/work-queue';
import type { TaskOptions } from '../generic/QueueBase';
import type { LegacyQueueTaskPayload } from './LegacyQueueTaskPayload';

/**
 * Hands a legacy task to the work queue when this process has a configured work queue runtime and an active
 * work queue named after the queue type. Returns true when the work queue owns the task — including when
 * enqueueing failed and the failure was logged, so the task is never also run in-process — and false when
 * the caller should use the legacy path.
 */
export async function TryRouteToWorkQueue(
    queueType: string,
    data: unknown,
    options: TaskOptions | null,
    contextUser: UserInfo,
): Promise<boolean> {
    const runtime = WorkQueueRuntime.Instance;
    if (!runtime.IsConfigured) {
        return false;
    }
    const queueName = await activeQueueName(runtime, queueType, contextUser);
    if (!queueName) {
        return false;
    }
    try {
        const payload: LegacyQueueTaskPayload = { data: data ?? null, options: options ?? null };
        await runtime.Producer.Enqueue(queueName, payload, contextUser);
    } catch (error) {
        LogError(`[QueueManager] Could not enqueue a '${queueType}' task on the work queue`, undefined, error);
    }
    return true;
}

async function activeQueueName(runtime: WorkQueueRuntime, queueType: string, contextUser: UserInfo): Promise<string | null> {
    try {
        const queue = (await runtime.Metadata.GetIndex(contextUser)).QueueByName(queueType);
        return queue?.IsActive ? queue.Name : null;
    } catch (error) {
        LogError(`[QueueManager] Could not read work queue metadata; running '${queueType}' in-process`, undefined, error);
        return null;
    }
}
```

- [ ] **Step 6: Write `src/workQueue/LegacyQueueDriverHandler.ts`**

```typescript
import type { BaseEntity } from '@memberjunction/core';
import type { MJQueueEntity, MJQueueTaskEntity } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    BaseWorkQueueHandler, FatalQueueError, TransientQueueError, WORK_QUEUE_FALLBACK_HANDLER_KEY, type WorkQueueContext,
} from '@memberjunction/work-queue';
import { QueueBase, TaskBase } from '../generic/QueueBase';
import type { LegacyQueueTaskPayload } from './LegacyQueueTaskPayload';

/**
 * Runs work-queue items for queues with no handler of their own through the MJQueue driver registered under
 * the same name (@RegisterClass(QueueBase, '<queue type name>')). The driver receives a TaskBase built from
 * the payload with unsaved Queue and QueueTask records — routed tasks are tracked as work queue items, not
 * QueueTask rows. A failed TaskResult is retried with the queue's backoff.
 */
@RegisterClass(BaseWorkQueueHandler, WORK_QUEUE_FALLBACK_HANDLER_KEY)
export class LegacyQueueDriverHandler extends BaseWorkQueueHandler<LegacyQueueTaskPayload> {
    public async Handle(context: WorkQueueContext<LegacyQueueTaskPayload>): Promise<void> {
        if (!isLegacyPayload(context.Payload)) {
            throw new FatalQueueError(`The payload for queue '${context.QueueName}' is not a legacy queue task`);
        }
        const driver = await this.createDriver(context);
        const taskRecord = await newRecord<MJQueueTaskEntity>(context, 'MJ: Queue Tasks');
        const task = new TaskBase(taskRecord, context.Payload.data, context.Payload.options ?? {});
        const result = await driver.ExecuteTask(task, context.ContextUser);
        if (!result.success) {
            throw new TransientQueueError(result.userMessage || `Legacy queue task in '${context.QueueName}' failed`);
        }
    }

    private async createDriver(context: WorkQueueContext<LegacyQueueTaskPayload>): Promise<QueueBase> {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(QueueBase, context.QueueName);
        if (!registration) {
            throw new FatalQueueError(`No handler is registered for queue '${context.QueueName}'`);
        }
        const queueRecord = await newRecord<MJQueueEntity>(context, 'MJ: Queues');
        queueRecord.Name = context.QueueName;
        const driver: QueueBase = new registration.SubClass(queueRecord, '', context.ContextUser);
        return driver;
    }
}

async function newRecord<T extends BaseEntity>(context: WorkQueueContext<LegacyQueueTaskPayload>, entityName: string): Promise<T> {
    const record = await context.Provider.GetEntityObject<T>(entityName, context.ContextUser);
    record.NewRecord();
    return record;
}

function isLegacyPayload(payload: unknown): payload is LegacyQueueTaskPayload {
    return typeof payload === 'object' && payload !== null && 'data' in payload;
}
```

- [ ] **Step 7: Route the static `AddTask`**

In `packages/MJQueue/src/generic/QueueManager.ts`, add the import:

```typescript
import { TryRouteToWorkQueue } from "../workQueue/RouteToWorkQueue";
```

and replace the static `AddTask` with:

```typescript
  /**
   * Adds a task by queue type name. When an active work queue has the same name and this process has a
   * configured work queue runtime, the task is enqueued there and this returns undefined — the work queue
   * owns it and there is no in-process TaskBase. Otherwise the task runs in-process as before.
   */
  public static async AddTask(QueueType: string, data: any, options: any, contextUser: UserInfo): Promise<TaskBase | undefined> {
    if (await TryRouteToWorkQueue(QueueType, data, options, contextUser)) {
      return undefined;
    }
    await QueueManager.Config(contextUser);
    const queueType = QueueManager.QueueTypes.find(qt => qt.Name == QueueType);
    if (queueType == null)
      throw new Error(`Queue Type ${QueueType} not found.`)

    return QueueManager.Instance.AddTask(queueType.ID, data, options, contextUser);
  }
```

The lookup, error and delegation lines are the existing code, unchanged.

- [ ] **Step 8: Export the new modules**

Append to `packages/MJQueue/src/index.ts`:

```typescript
export * from './workQueue/LegacyQueueTaskPayload';
export * from './workQueue/RouteToWorkQueue';
export * from './workQueue/LegacyQueueDriverHandler';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/MJQueue && pnpm test`
Expected: PASS — the existing suite, EntityAIActionTaskReference (4), AIActionQueue (6), RouteToWorkQueue (6) and
LegacyQueueDriverHandler (5). The existing `MJQueue.test.ts` mocks `@memberjunction/core` and does not exercise
the static `AddTask`, so it is unaffected; if it fails on the new import, add
`vi.mock('../workQueue/RouteToWorkQueue', () => ({ TryRouteToWorkQueue: vi.fn(async () => false) }))` to it.

Run: `cd packages/MJQueue && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/MJQueue pnpm-lock.yaml
git commit -m "feat(queue): route AddTask to same-named work queues and run legacy drivers as the fallback handler"
```

---

### Task 5: Integration checks QU8–QU10, manifest and README

**Files:**
- Modify: `packages/TestingFramework/integration-test-suite/src/checks/queue.checks.ts`
- Modify: `packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts`
- Modify: `metadata-optional/integration-test/tests/integration/.IT82-queue.json`
- Regenerate: `packages/ServerBootstrap/src/generated/mj-class-registrations.ts`
- Modify: `packages/MJQueue/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–4; `CreateWorkQueueRuntimeParts`, `WorkQueueEngine`, `WorkQueueRuntime`, `WorkQueueWorker`, `WorkQueueMetadataIndex` (plan 03). The integration suite already depends on `@memberjunction/work-queue` (plan 03 Task 16) and `@memberjunction/queue`.
- Produces: the `queue` bundle with 10 checks; a server manifest that registers `LegacyQueueDriverHandler`.

| Check | Proves |
| --- | --- |
| QU8 | Static `AddTask` with the name of an active work queue enqueues `{ data, options }` there and returns `undefined` — even though no `MJ: Queue Types` row has that name, so routing happens first |
| QU9 | A worker with the default resolver runs that item through the fallback handler and the `QueueBase` driver registered under the queue name; the item completes |
| QU10 | The repaired `QueueTask.Status` stores `'Pending'` and the full `'In Progress'` |

QU8 and QU9 need the server transport. The bundle configures `WorkQueueRuntime` itself (a test process has
no MJServer) and resets it in Teardown. The route fixture is a work queue named `mj-it-queue-route`; Setup
removes any leftover before the checks run.

- [ ] **Step 1: Pin the new count in the registry test (failing)**

In `packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts`, change
`'queue': 7,` to `'queue': 10,`.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: FAIL — `queue` has 7 checks, expected 10.

- [ ] **Step 2: Extend `queue.checks.ts`**

Replace the import block at the top of `packages/TestingFramework/integration-test-suite/src/checks/queue.checks.ts` with:

```typescript
import { DatabaseProviderBase, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { MJQueueEntity, MJQueueTaskEntity, MJQueueTypeEntity, type MJWorkQueueEntity } from '@memberjunction/core-entities';
import { QueueBase, TaskBase, TaskResult, TaskStatus, QueueManager, AIActionQueue, EntityAIActionQueue } from '@memberjunction/queue';
import {
    CreateWorkQueueRuntimeParts, WorkQueueEngine, WorkQueueMetadataIndex, WorkQueueRuntime, WorkQueueWorker,
    type WorkQueueMetadataSource,
} from '@memberjunction/work-queue';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
```

In the header comment, replace the `⚠️ Schema findings …` paragraph (both numbered points) with:

```typescript
 * Schema repair (work queue port, plan 04 Task 1): QueueTask.Status is NVARCHAR(20) with a CHECK allowing
 * Pending, In Progress, Completed, Failed and Cancelled. QU10 asserts it. QU3–QU5 still create fixture rows
 * with 'Completed'/'Failed' initial values, which remain valid.
 *   - QU8  Static AddTask with the name of an ACTIVE work queue enqueues { data, options } there and returns
 *          undefined, before any MJ: Queue Types lookup (the route fixture has no queue type at all).
 *   - QU9  A WorkQueueWorker with the default resolver runs that item through LegacyQueueDriverHandler and
 *          the QueueBase driver registered under the queue name; the item completes.
 *   - QU10 The repaired Status column stores 'Pending' and the untruncated 'In Progress'.
 * QU8–QU9 configure WorkQueueRuntime in-process (no MJServer here) and Teardown resets it.
```

Directly after the `MjItStubQueue` class, add:

```typescript
/** Name shared by the route fixture work queue and the QueueBase driver QU9 registers. */
const ROUTE_QUEUE_NAME = 'mj-it-queue-route';

/** Records what the fallback handler hands it; registered under ROUTE_QUEUE_NAME by QU9. */
class MjItRoutedQueue extends QueueBase {
    public static readonly Received: unknown[] = [];

    protected override async ProcessTask(task: TaskBase): Promise<TaskResult> {
        MjItRoutedQueue.Received.push(task.Data);
        return { success: true, userMessage: '', output: null, exception: null };
    }
}

interface RouteFixture {
    Provider: DatabaseProviderBase;
    QueueID: string;
}
let route: RouteFixture | undefined;

function serverProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    const provider = ctx.Provider;
    if (!(provider instanceof DatabaseProviderBase)) {
        throw new Error('QU8–QU9 need the server transport (a DatabaseProviderBase provider)');
    }
    return provider;
}

/** Creates the active route work queue once and configures the in-process work queue runtime. */
async function ensureRouteFixture(ctx: IntegrationCheckContext): Promise<RouteFixture> {
    if (route) {
        return route;
    }
    const provider = serverProvider(ctx);
    const queue = await provider.GetEntityObject<MJWorkQueueEntity>('MJ: Work Queues', ctx.User);
    queue.NewRecord();
    queue.Name = ROUTE_QUEUE_NAME;
    queue.Description = `Queue routing fixture ${FIXTURE_TAG}`;
    queue.LeaseSeconds = 10;
    queue.MaxAttempts = 1;
    queue.InitialBackoffSeconds = 0;
    queue.MaxBackoffSeconds = 0;
    queue.DeadLetterPolicy = 'Skip Partition';
    queue.PurgeOnComplete = false;
    queue.IsActive = true;
    Assert(await queue.Save(), `creating the route work queue failed: ${queue.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    await WorkQueueEngine.Instance.Config(true, ctx.User, provider);
    WorkQueueRuntime.Instance.Configure(CreateWorkQueueRuntimeParts({ DriverKey: 'Native', Executor: provider }));
    route = { Provider: provider, QueueID: queue.ID };
    return route;
}

/** Deletes the route work queue and its items, from this run or an interrupted earlier one. */
async function removeRouteFixtures(ctx: IntegrationCheckContext): Promise<void> {
    const provider = ctx.Provider;
    if (!(provider instanceof DatabaseProviderBase)) {
        return;
    }
    const queues = await new RunView().RunView<MJWorkQueueEntity>({
        EntityName: 'MJ: Work Queues', ExtraFilter: `Name='${ROUTE_QUEUE_NAME}'`, ResultType: 'entity_object', BypassCache: true,
    }, ctx.User);
    Assert(queues.Success, `finding the route work queue failed: ${queues.ErrorMessage}`);
    const placeholder = provider.PlatformKey === 'postgresql'
        ? `${provider.BuildParameterPlaceholder(0)}::uuid`
        : provider.BuildParameterPlaceholder(0);
    for (const queue of queues.Results) {
        for (const table of ['WorkQueueItem', 'WorkQueueDeduplication']) {
            const qualified = `${provider.QuoteIdentifier(provider.MJCoreSchemaName)}.${provider.QuoteIdentifier(table)}`;
            await provider.ExecuteSQL(`DELETE FROM ${qualified} WHERE ${provider.QuoteIdentifier('QueueID')} = ${placeholder}`, [queue.ID], { isMutation: true }, ctx.User);
        }
        Assert(await queue.Delete(), `removing the route work queue failed: ${queue.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

async function routeItems(ctx: IntegrationCheckContext, queueID: string): Promise<{ ID: string; Status: string; Payload: string }[]> {
    const result = await new RunView().RunView<{ ID: string; Status: string; Payload: string }>({
        EntityName: 'MJ: Work Queue Items', ExtraFilter: `QueueID='${queueID}'`, Fields: ['ID', 'Status', 'Payload'],
        OrderBy: 'Sequence', ResultType: 'simple', BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `reading route work queue items failed: ${result.ErrorMessage}`);
    return result.Results;
}

/** Only the route queue, so the QU9 worker cannot touch any other queue in the database. */
function routeQueueOnly(): WorkQueueMetadataSource {
    return {
        GetIndex: async (user: UserInfo) => {
            const queue = (await WorkQueueEngine.Instance.GetIndex(user)).QueueByName(ROUTE_QUEUE_NAME);
            if (!queue) {
                throw new Error('the route work queue is not visible to WorkQueueEngine');
            }
            return new WorkQueueMetadataIndex([queue], [], []);
        },
    };
}
```

Append these three entries to the end of the `QueueChecks` array, after `queue.QU7`:

```typescript
    {
        Id: 'queue.QU8',
        Name: 'QU8: static AddTask enqueues on an active same-named work queue before any queue-type lookup',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fixtureRoute = await ensureRouteFixture(ctx);
            const result = await QueueManager.AddTask(ROUTE_QUEUE_NAME, { probe: 'qu8' }, { priority: 2 }, ctx.User);
            AssertEqual(result, undefined, 'a routed AddTask returns no in-process task');
            const items = await routeItems(ctx, fixtureRoute.QueueID);
            AssertEqual(items.length, 1, 'work queue items created by the routed AddTask');
            AssertEqual(items[0].Status, 'Pending', 'status of the routed item');
            AssertEqual(items[0].Payload, '{"data":{"probe":"qu8"},"options":{"priority":2}}', 'payload of the routed item');
            console.log(`      → routed to work queue item ${items[0].ID}`);
        }
    },
    {
        Id: 'queue.QU9',
        Name: 'QU9: the fallback handler runs a routed item through the QueueBase driver registered under the queue name',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fixtureRoute = await ensureRouteFixture(ctx);
            MJGlobal.Instance.ClassFactory.Register(QueueBase, MjItRoutedQueue, ROUTE_QUEUE_NAME);
            const config = { WorkerID: 'mj-it-queue-route-worker', PollingIntervalMs: 1000, MaxConcurrentItems: 1, HeartbeatMinIntervalMs: 5000 };
            const worker = new WorkQueueWorker(config, WorkQueueRuntime.Instance.Driver, routeQueueOnly(), ctx.User, fixtureRoute.Provider);
            AssertEqual(await worker.PollOnce(), 1, 'items the worker started');
            await worker.WaitForInFlight();
            AssertEqual(JSON.stringify(MjItRoutedQueue.Received), '[{"probe":"qu8"}]', 'data the legacy driver received');
            const items = await routeItems(ctx, fixtureRoute.QueueID);
            Assert(items.length === 1 && items[0].Status === 'Completed', `routed item after the worker ran: ${JSON.stringify(items)}`);
        }
    },
    {
        Id: 'queue.QU10',
        Name: "QU10: the repaired QueueTask.Status stores 'Pending' and the untruncated 'In Progress'",
        Fn: async (ctx: IntegrationCheckContext) => {
            const task = await ctx.Provider.GetEntityObject<MJQueueTaskEntity>('MJ: Queue Tasks', ctx.User);
            task.NewRecord();
            task.QueueID = fx().QueueID;
            task.Status = 'Pending';
            task.Data = JSON.stringify({ probe: 'qu10' });
            Assert(await task.Save(), `saving a Pending task failed: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            fx().TaskIds.push(task.ID);
            task.Status = 'In Progress';
            Assert(await task.Save(), `saving In Progress failed: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            const rows = await new RunView().RunView<{ Status: string }>({
                EntityName: 'MJ: Queue Tasks', ExtraFilter: `ID='${task.ID}'`, Fields: ['Status'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            Assert(rows.Success && rows.Results.length === 1, `reading the task back failed: ${rows.ErrorMessage}`);
            AssertEqual(rows.Results[0].Status, 'In Progress', 'the stored status, exactly');
        }
    }
```

In `RegisterLifecycle('queue', …)`, make `removeRouteFixtures` the first statement of `Setup`:

```typescript
    Setup: async (ctx: IntegrationCheckContext) => {
        await removeRouteFixtures(ctx);
        // …existing Setup body unchanged…
```

and make these the first statements of `Teardown`, before its `if (!fixture)` early return:

```typescript
    Teardown: async (ctx: IntegrationCheckContext) => {
        await removeRouteFixtures(ctx);
        WorkQueueRuntime.Instance.Reset();
        route = undefined;
        // …existing Teardown body unchanged…
```

- [ ] **Step 3: Run the registry test and build**

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: PASS — `queue` has 10 checks with unique ids.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm run build`
Expected: builds. A type error on `task.Status = 'Pending'` means Task 1's CodeGen step did not run.

- [ ] **Step 4: Update the IT82 record**

In `metadata-optional/integration-test/tests/integration/.IT82-queue.json`:

- In `Description`, replace the final sentence, which begins `The two schema quirks in the bundle header`, with:
  `The schema quirks it once documented (the 'Pending' default rejected by CK_QueueTask_Status, and nchar(10) truncating 'In Progress') are repaired by the work queue port; QU10 asserts the repair. QU8: static AddTask with the name of an active work queue enqueues { data, options } there before any queue-type lookup. QU9: a work queue worker runs that item through LegacyQueueDriverHandler and the QueueBase driver registered under the queue name. QU8-QU9 configure the work queue runtime in-process and reset it in Teardown.`
- Set `ExpectedOutcomes.summary` to:
  `Queue types load from the DB, drivers resolve via the ClassFactory, the real queue loop persists terminal task statuses, survives throwing tasks and honors stop/negative-path contracts; AddTask routes to same-named work queues whose items run through the legacy driver; the repaired Status column stores every lifecycle value. 10 checks (QU1-QU10).`

- [ ] **Step 5: Run the bundle against the development database**

Run: `npx mj sync push --dir=metadata-optional/integration-test`
Expected: 1 test update.

Run: `MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT82 - Queue Engine Lifecycle"`
Expected: 10 of 10 checks pass.

Run: `MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT87 - Work Queue (native driver)"`
Expected: 10 of 10 checks pass — the fallback handler registration does not affect the work queue bundle,
whose worker uses its own resolver.

- [ ] **Step 6: Regenerate the server manifest**

Run: `pnpm exec turbo run build --filter=@memberjunction/queue`
Run: `pnpm run mj:manifest:server-bootstrap`

Run: `grep -c "LegacyQueueDriverHandler" packages/ServerBootstrap/src/generated/mj-class-registrations.ts`
Expected: at least 1.

Run: `cd packages/ServerBootstrap && pnpm run build`
Expected: builds.

- [ ] **Step 7: Document routing in the MJQueue README**

Append to `packages/MJQueue/README.md`:

````markdown
## Running tasks on the durable work queue

`QueueManager.AddTask(queueTypeName, data, options, contextUser)` hands a task to the durable work queue
(`@memberjunction/work-queue`) instead of running it in-process when both hold:

1. the process has a configured work queue runtime — MJServer configures one at startup; CLI tools and
   CodeGen do not; and
2. an **active** `MJ: Work Queues` record has the same name as the queue type.

Otherwise the task runs in-process exactly as before. `AddTask` returns `undefined` for a routed task,
because the work queue, not an in-process `TaskBase`, owns it.

**Moving a task type.** The `Entity AI Action` and `AI Action` work queues are seeded inactive. Enable the
worker on at least one server (`workQueue.workerEnabled: true`), then set the work queue's `IsActive` to
true. For your own `QueueBase` driver, create an active work queue named exactly like its queue type.

What changes for a routed task:

- The item is durable, retried with the work queue's backoff, and dead-lettered after `MaxAttempts`. A
  `TaskResult` with `success: false` counts as a retryable failure.
- Progress lives on `MJ: Work Queue Items`; no `MJ: Queue Tasks` row is written.
- `data` must survive JSON. Entity AI Action producers enqueue an `EntityAIActionTaskReference`, and the
  driver reloads the record when the task runs.
- Your driver runs through `QueueBase.ExecuteTask`, with unsaved `MJ: Queues` and `MJ: Queue Tasks`
  records. Do not rely on their IDs.

Only the static `AddTask(queueTypeName, …)` routes; the instance `AddTask(queueTypeID, …)` always runs
in-process.
````

- [ ] **Step 8: Commit**

```bash
git add packages/TestingFramework/integration-test-suite metadata-optional/integration-test packages/ServerBootstrap/src/generated packages/MJQueue/README.md
git commit -m "test(queue): QU8-QU10 cover work queue routing and the Status repair; document routing"
```
