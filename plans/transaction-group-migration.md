# Transaction Group Migration Guide

This guide covers how to migrate sequential `Save()` and `Delete()` operations on BaseEntity objects to use atomic transaction patterns. It is intended for developers who are new to MemberJunction's transaction system and need a clear, step-by-step understanding of when and how to apply each pattern.

## Table of Contents

1. [Overview](#overview)
2. [Background: How TransactionGroup Works](#background-how-transactiongroup-works)
3. [Background: Server-Side Direct DB Transactions](#background-server-side-direct-db-transactions)
4. [When to Use Which Pattern](#when-to-use-which-pattern)
5. [Migration Inventory](#migration-inventory)
6. [Step-by-Step Migration Process](#step-by-step-migration-process)
7. [Common Gotchas](#common-gotchas)
8. [Testing Checklist](#testing-checklist)
9. [Reference: Existing Good Examples](#reference-existing-good-examples)

---

## Overview

### The Problem

Throughout the MemberJunction codebase, there are many places where multiple `Save()` or `Delete()` calls happen inside a loop or in sequence. Each of these calls is an independent operation:

```typescript
// BAD: N separate network round trips, no atomicity
for (const item of items) {
    item.Status = 'Active';
    await item.Save();  // Network round trip #1
}
for (const removed of removedItems) {
    await removed.Delete();  // Network round trip #2, #3, ...
}
```

This pattern has two major problems:

1. **Performance**: Each `Save()` or `Delete()` is a separate network round trip. If you are saving 50 items, that is 50 separate GraphQL mutations (client-side) or 50 separate SQL executions (server-side). This is slow and wasteful.

2. **No Atomicity**: If the 30th save fails, the first 29 saves have already been committed. Your data is now in an inconsistent, partially-updated state. There is no way to roll back the successful operations.

### The Two Solutions

MemberJunction provides two mechanisms to solve this, depending on where your code runs:

| Pattern | Where It Runs | What It Does |
|---------|--------------|--------------|
| **TransactionGroup** | Client-side (Angular components, services) | Queues all `Save()`/`Delete()` calls locally, then sends them as a **single GraphQL request** to the server. The server executes them inside a **single database transaction**. |
| **Direct DB Transactions** | Server-side (resolvers, actions, entity servers) | Wraps multiple `Save()`/`Delete()` calls in a `BeginTransaction`/`CommitTransaction`/`RollbackTransaction` block. Each call is still a separate SQL execution, but they all share one database transaction. |

### When to Use Which (Quick Reference)

- **Your code is in an Angular component or service** --> Use TransactionGroup
- **Your code is in a resolver, action, or entity server** --> Use Direct DB Transactions
- **Your code is very complex with many dependencies and error paths** --> Consider moving the logic to a custom resolver and calling it from the client with a single mutation

---

## Background: How TransactionGroup Works

### Architecture

The TransactionGroup system is built on three layers:

1. **`TransactionGroupBase`** (abstract base class): Defined in `packages/MJCore/src/generic/transactionGroup.ts`. Manages the queue of pending transactions, variables, preprocessing, and the `Submit()` lifecycle.

2. **`GraphQLTransactionGroup`** (client-side implementation): Used when your code runs in the browser. Created by calling `md.CreateTransactionGroup()` through the `GraphQLDataProvider`. Batches all queued operations into a single GraphQL mutation request.

3. **`SQLServerTransactionGroup` / `PostgreSQLTransactionGroup`** (server-side implementations): Used when your code runs on the server. Wraps all queued operations in a single database transaction.

### How It Works

When you assign a `TransactionGroup` to a BaseEntity object via the `TransactionGroup` property, the entity's `Save()` and `Delete()` methods change their behavior. Instead of immediately executing, they add a `TransactionItem` to the group's internal queue and return immediately. The actual execution happens only when you call `Submit()` on the group.

### The API

Here is the complete basic pattern:

```typescript
import { Metadata } from '@memberjunction/core';

// Step 1: Create a TransactionGroup
const md = new Metadata();
const tg = await md.CreateTransactionGroup();

// Step 2: Queue operations by assigning the TG before Save/Delete
entity1.Name = 'Updated Name';
entity1.TransactionGroup = tg;
await entity1.Save();  // Does NOT execute yet - queues the save

entity2.TransactionGroup = tg;
await entity2.Delete();  // Does NOT execute yet - queues the delete

entity3.NewRecord();
entity3.Name = 'New Record';
entity3.TransactionGroup = tg;
await entity3.Save();  // Does NOT execute yet - queues the save

// Step 3: Execute all queued operations at once
const success = await tg.Submit();

if (success) {
    // All operations succeeded - data is committed
    console.log('All operations completed successfully');
} else {
    // ALL operations were rolled back - nothing was committed
    console.error('Transaction failed - all changes rolled back');
}
```

**Key points about this pattern:**

- `Save()` and `Delete()` return `true` immediately when a TransactionGroup is assigned. This only means the operation was successfully queued, **not** that it succeeded.
- `Submit()` sends everything to the server in one request and returns a single `boolean`. `true` means every operation succeeded. `false` means every operation was rolled back.
- After `Submit()`, the entity objects are updated with the latest data from the server (for saves) or marked as deleted (for deletes), just as if you had called `Save()` or `Delete()` individually.
- A `TransactionGroup` can only be submitted once. After `Submit()`, the group's status changes to `'Complete'` or `'Failed'`. You cannot add more operations to it.

### TransactionVariable: Passing Data Between Transactions

Sometimes transaction B depends on data produced by transaction A. The most common case: you create a parent record and need its server-generated ID to set a foreign key on a child record. `TransactionVariable` solves this.

Here is the complete pattern:

```typescript
import { Metadata, TransactionVariable } from '@memberjunction/core';

const md = new Metadata();
const tg = await md.CreateTransactionGroup();

// Step 1: Create the parent record and queue it
const parent = await md.GetEntityObject<ParentEntity>('Parents');
parent.NewRecord();
parent.Name = 'New Parent';
parent.TransactionGroup = tg;
await parent.Save();  // Queued as transaction #1

// Step 2: Define a variable that captures the parent's ID after it saves
//   - 'NewParentID' is the variable name (you choose this, it can be anything)
//   - parent is the entity object to read from
//   - 'ID' is the field name to capture
//   - 'Define' means "capture this value after the entity saves"
const tvDefine = new TransactionVariable('NewParentID', parent, 'ID', 'Define');
tg.AddVariable(tvDefine);

// Step 3: Create the child record with a placeholder FK value
const child = await md.GetEntityObject<ChildEntity>('Children');
child.NewRecord();
child.ParentID = 'placeholder-will-be-overwritten';  // This value does not matter
child.Name = 'New Child';
child.TransactionGroup = tg;
await child.Save();  // Queued as transaction #2

// Step 4: Define a variable that injects the captured value into the child's FK
//   - 'NewParentID' must match the Define variable name (case-insensitive)
//   - child is the entity object to write to
//   - 'ParentID' is the field to set on the child
//   - 'Use' means "inject the captured value before this entity saves"
const tvUse = new TransactionVariable('NewParentID', child, 'ParentID', 'Use');
tg.AddVariable(tvUse);

// Step 5: Submit - execution order is:
//   1. Parent saves -> server returns its new ID
//   2. Variable 'NewParentID' captures parent.ID
//   3. Variable 'NewParentID' is injected into child.ParentID
//   4. Child saves with the correct FK
const success = await tg.Submit();
```

**How TransactionVariable works internally:**

- **`'Define'` type**: After the source entity's transaction executes, the TransactionGroup reads the specified field (`'ID'` in the example above) from the entity object and stores the value in the variable.
- **`'Use'` type**: Before the target entity's transaction executes, the TransactionGroup finds the matching `'Define'` variable by name (case-insensitive), reads its stored value, and calls `entity.Set(fieldName, value)` to inject it.
- **Variable names must match**: The `'Define'` and `'Use'` variables must have the same name string. If no matching `'Define'` is found for a `'Use'`, the transaction throws an error and rolls back.
- **Ordering matters**: The entity with the `'Define'` variable must be queued (via `Save()` or `Delete()`) **before** the entity with the `'Use'` variable. The TransactionGroup executes transactions in queue order when variables are present.
- **The placeholder value does not matter**: Whatever you set on the child's FK field before queuing gets overwritten by the variable injection. You still need to set *something* to satisfy any client-side validation, but the actual value is irrelevant.

### Reference: Real TransactionVariable Example in the Codebase

See the `TestTransactionGroupVariables()` method in:

`packages/Angular/Explorer/explorer-core/src/lib/user-notifications/user-notifications.component.ts` (line ~289)

This is a test method that demonstrates the full variable pattern with real entity objects.

---

## Background: Server-Side Direct DB Transactions

When your code already runs on the server (in a resolver, action, or entity server), there is no network overhead to reduce. Each `Save()` or `Delete()` call directly executes SQL. However, you still need atomicity: if one operation fails, all operations should roll back.

The `DatabaseProviderBase` class provides three methods for this:

- `BeginTransaction()`: Starts a database transaction
- `CommitTransaction()`: Commits the current transaction
- `RollbackTransaction()`: Rolls back the current transaction

### The Pattern

```typescript
import { Metadata } from '@memberjunction/core';
import { DatabaseProviderBase } from '@memberjunction/core';

// Get a reference to the database provider
// On the server, Metadata.Provider is always a DatabaseProviderBase subclass
const provider = Metadata.Provider as DatabaseProviderBase;

await provider.BeginTransaction();
try {
    // All Save/Delete calls within this block share the same DB transaction
    for (const item of items) {
        item.Status = 'Active';
        const saveResult = await item.Save();
        if (!saveResult) {
            // Save() returns false on failure - we must throw to trigger rollback
            throw new Error(`Save failed for item ${item.ID}: ${item.LatestResult?.Message}`);
        }
    }

    for (const removed of removedItems) {
        const deleteResult = await removed.Delete();
        if (!deleteResult) {
            throw new Error(`Delete failed for item ${removed.ID}: ${removed.LatestResult?.Message}`);
        }
    }

    // Everything succeeded - commit
    await provider.CommitTransaction();
} catch (e) {
    // Something failed - roll back everything
    await provider.RollbackTransaction();
    throw e;  // Re-throw so the caller knows it failed
}
```

### Important Details

- **SQL Server supports nested transactions** via savepoints. If your code is already inside a transaction (for example, an entity server's `Save()` method already wraps operations in a transaction), calling `BeginTransaction()` again creates a savepoint. `RollbackTransaction()` rolls back to the savepoint, not the outer transaction.
- **PostgreSQL does not support nesting yet** in MemberJunction's implementation. Be careful not to nest `BeginTransaction()` calls on PostgreSQL.
- **Always use try/catch with rollback**. If you begin a transaction and an exception occurs without rolling back, the transaction may remain open and block other operations.
- **Check every `Save()` and `Delete()` return value**. Unlike exceptions, a failed `Save()` returns `false` silently. You must check the return value and explicitly throw to trigger the rollback.
- **This does NOT reduce round trips**. Each `Save()` and `Delete()` still executes its own SQL statement. The benefit is purely atomicity: all statements share one transaction, so they either all commit or all roll back.

### Reference: Real Server-Side Transaction Example

See the `Save()` method in:

`packages/MJCoreEntitiesServer/src/custom/MJApplicationEntityServer.server.ts`

This demonstrates wrapping multiple child entity operations in a single database transaction during a parent entity's save.

---

## When to Use Which Pattern

### Decision Tree

```
Is your code running in the browser (Angular component, service, etc.)?
  YES --> Use TransactionGroup (via md.CreateTransactionGroup())
  NO  --> Is your code running on the server (resolver, action, entity server)?
    YES --> Use Direct DB Transactions (provider.BeginTransaction/Commit/Rollback)
    NO  --> This shouldn't happen in MJ. Figure out where your code runs first.
```

### Client-Side Code (Angular components, services)

**Use TransactionGroup** via `md.CreateTransactionGroup()`.

Benefits:
- Reduces N GraphQL mutations to 1 (massive performance improvement)
- Provides atomicity on the server (all-or-nothing)
- Supports variable passing between transactions (for parent-child relationships)
- The server handles the actual DB transaction wrapping

### Server-Side Code (Resolvers, Actions, Entity Servers)

**Use Direct DB Transactions** via `provider.BeginTransaction()`/`CommitTransaction()`/`RollbackTransaction()`.

Benefits:
- Already on the server, so no network bundling is needed
- Direct database transaction gives atomicity
- Simpler pattern with less overhead
- No serialization/deserialization of transaction items

### When to Consider a Custom Resolver Instead

If client-side code has very complex logic with many sequential operations, multiple dependency chains, and intricate error handling, consider moving the entire operation to a **custom GraphQL resolver**. The client then makes a single mutation call, and all the complex logic runs server-side with full transaction support.

Benefits of this approach:
- Single network call from client
- Full server-side transaction management
- Better encapsulation of business logic
- Client code becomes a simple mutation call
- Easier to test the business logic in isolation

---

## Migration Inventory

The items below are organized into tiers by priority. Each entry includes the file path, what the current pattern looks like, what the fix should be, the estimated complexity, and any special considerations.

### Tier 1 -- Critical (Server-side, high volume)

These are server-side code paths that handle high volumes of data and currently lack transactional wrapping. Failures here can leave the database in an inconsistent state.

---

#### 1. SyncRolesUsersResolver.ts

- **Path**: `packages/MJServer/src/resolvers/SyncRolesUsersResolver.ts`
- **Current Pattern**: 10+ distinct save/delete loops for role and user synchronization. The code has **commented-out TransactionGroup code** with the note: *"HAVING PROBLEMS with this, so skipping for now, I think the entire thing is wrapped in a transaction and that's causing issues with two styles of trans wrappers"* (line 312).
- **Fix**: Use direct DB transactions (`provider.BeginTransaction()`/`CommitTransaction()`/`RollbackTransaction()`) since this is server-side code. The commented-out TG code confirms that TransactionGroup does not work here due to nesting conflicts with the outer transaction.
- **Complexity**: **HIGH** -- Many interdependent loops. Roles must sync before users. Deletes must happen before adds. Careful testing is required to verify ordering constraints are preserved.
- **Special Considerations**: This resolver is critical infrastructure. Test with a realistic number of roles and users. Verify that partial failures roll back cleanly.

---

#### 2. SyncDataResolver.ts

- **Path**: `packages/MJServer/src/resolvers/SyncDataResolver.ts`
- **Current Pattern**: Loop deletes with no transaction wrapping.
- **Fix**: Direct DB transactions.
- **Complexity**: **LOW**

---

#### 3. RotateEncryptionKeyAction.ts

- **Path**: `packages/Encryption/src/actions/RotateEncryptionKeyAction.ts`
- **Current Pattern**: Sequential saves in a batch re-encryption loop (50-1000+ records per batch).
- **Fix**: Direct DB transactions wrapping each batch.
- **Complexity**: **MEDIUM** -- Verify rollback semantics work for encryption. A partial re-encryption (some records on old key, some on new key) would leave data in an unrecoverable state.
- **Special Considerations**: This is one of the most dangerous places to lack atomicity. If the process fails midway, some records are encrypted with the new key and some with the old key. The rollback must ensure all records stay on the original key if anything fails.

---

#### 4. IntegrationEngine.ts

- **Path**: `packages/Integration/engine/src/IntegrationEngine.ts`
- **Current Pattern**: Per-record `Save()`/`Delete()` inside the `ApplySingleRecord` loop (1-10,000+ records).
- **Fix**: Direct DB transactions, batched in groups of ~500 records.
- **Complexity**: **HIGH** -- Large volume, needs a batching strategy.
- **Special Considerations**: Do not put 10,000 operations in a single transaction. This causes lock escalation in SQL Server (row locks escalate to table locks), blocking all other queries on the table. Batch into groups of 100-500 records per transaction.

---

#### 5. newUsers.ts

- **Path**: `packages/MJServer/src/auth/newUsers.ts`
- **Current Pattern**: Nested loops for user roles, user applications, and user entities.
- **Fix**: Direct DB transactions.
- **Complexity**: **MEDIUM**

---

#### 6. createNewUser.ts

- **Path**: `packages/CodeGenLib/src/Misc/createNewUser.ts`
- **Current Pattern**: Role and application assignment loops.
- **Fix**: Direct DB transactions.
- **Complexity**: **LOW**

---

### Tier 2 -- High (Client-side, user-facing latency)

These are Angular components where users experience noticeable latency from sequential network calls. Each `Save()` or `Delete()` is a separate GraphQL mutation, and the user waits for all of them to complete.

---

#### 7. api-key-edit-panel.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/APIKeys/api-key-edit-panel.component.ts`
- **Current Pattern**: Separate add/remove loops for API key scopes (0-100+ items).
- **Fix**: TransactionGroup.
- **Complexity**: **MEDIUM** -- Mixed creates and deletes in the same transaction.

---

#### 8. api-applications-panel.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/APIKeys/api-applications-panel.component.ts`
- **Current Pattern**: Mixed CRUD loop -- create, update, and delete operations in a single loop (0-100+ items).
- **Fix**: TransactionGroup.
- **Complexity**: **MEDIUM**

---

#### 9. user-management.component.ts

- **Path**: `packages/Angular/Explorer/explorer-settings/src/lib/user-management/user-management.component.ts`
- **Current Pattern**: Bulk set status, bulk delete, and bulk role assignment loops (1-100+ items).
- **Fix**: TransactionGroup.
- **Complexity**: **MEDIUM**

---

#### 10. user-dialog.component.ts

- **Path**: `packages/Angular/Explorer/explorer-settings/src/lib/user-management/user-dialog/user-dialog.component.ts`
- **Current Pattern**: Sequential delete + save loops for role assignment (1-10 items).
- **Fix**: TransactionGroup.
- **Complexity**: **LOW**

---

#### 11. flow-agent-editor.component.ts

- **Path**: `packages/Angular/Generic/flow-editor/src/lib/agent-editor/flow-agent-editor.component.ts`
- **Current Pattern**: Dual loops for steps and paths, plus delete loops (5-20+ items).
- **Fix**: TransactionGroup.
- **Complexity**: **MEDIUM**

---

#### 12. credentials-list-resource.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/Credentials/components/credentials-list-resource.component.ts`
- **Current Pattern**: Bulk delete loop, bulk toggle-active loop (1-100+ items).
- **Fix**: TransactionGroup.
- **Complexity**: **LOW**

---

#### 13. dashboard-browser-resource.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/DashboardBrowser/dashboard-browser-resource.component.ts`
- **Current Pattern**: Save and delete loops for dashboard management (1-100+ items).
- **Fix**: TransactionGroup.
- **Complexity**: **LOW**

---

#### 14. mcp-dashboard.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.ts`
- **Current Pattern**: Sequential delete loops across 5 different entity types.
- **Fix**: TransactionGroup. All 5 entity type deletes can be combined into a single TG.
- **Complexity**: **MEDIUM**

---

#### 15. agent-editor.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/AI/components/agents/agent-editor.component.ts`
- **Current Pattern**: Loop saves for agent prompts and actions (1-10 items).
- **Fix**: TransactionGroup. If prompts depend on the agent ID for a new agent, use TransactionVariable.
- **Complexity**: **LOW-MEDIUM**

---

#### 16. agent-configuration.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/AI/components/agents/agent-configuration.component.ts`
- **Current Pattern**: Loop saves for agent prompts and actions (1-10 items).
- **Fix**: TransactionGroup.
- **Complexity**: **LOW-MEDIUM**

---

#### 17. lists-operations-resource.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts`
- **Current Pattern**: List item operations in loops.
- **Fix**: TransactionGroup.
- **Complexity**: **MEDIUM**

---

### Tier 3 -- Medium (Server-side actions, moderate volume)

These are server-side action classes that process moderate volumes of data. They benefit from atomicity even though the per-operation overhead is lower than client-side code.

---

#### 18. create-list.action.ts

- **Path**: `packages/Actions/CoreActions/src/custom/lists/create-list.action.ts`
- **Current Pattern**: Loop save for list details after list creation (1-1000+ items).
- **Fix**: Direct DB transactions. The list is created first, then details reference its ID -- these are sequential dependencies.
- **Complexity**: **LOW**

---

#### 19. update-list-item-status.action.ts

- **Path**: `packages/Actions/CoreActions/src/custom/lists/update-list-item-status.action.ts`
- **Current Pattern**: Loop save to update status on each detail (1-1000+ items).
- **Fix**: Direct DB transactions.
- **Complexity**: **LOW**

---

#### 20. remove-records-from-list.action.ts

- **Path**: `packages/Actions/CoreActions/src/custom/lists/remove-records-from-list.action.ts`
- **Current Pattern**: Loop delete for each list item (1-1000+ items).
- **Fix**: Direct DB transactions.
- **Complexity**: **LOW**

---

#### 21. assign-user-roles.action.ts

- **Path**: `packages/Actions/CoreActions/src/custom/user-management/assign-user-roles.action.ts`
- **Current Pattern**: Loop save per role assignment (1-20 items).
- **Fix**: Direct DB transactions.
- **Complexity**: **LOW**

---

#### 22. MJActionEntityServer.server.ts

- **Path**: `packages/MJCoreEntitiesServer/src/custom/MJActionEntityServer.server.ts`
- **Current Pattern**: Three loops: add libraries, update libraries, remove libraries (1-20 each).
- **Fix**: This file already uses direct DB transactions for the outer `Save()`. Verify that the inner loops (`manageLibraries` etc.) execute within that transaction scope. If they do, no changes are needed. If they run outside the transaction, wrap them.
- **Complexity**: **MEDIUM** -- Requires careful inspection of the existing transaction scope.

---

#### 23. QueryDatabaseWriter.ts

- **Path**: `packages/QueryGen/src/core/QueryDatabaseWriter.ts`
- **Current Pattern**: Loop save per generated query (1-50 items).
- **Fix**: Direct DB transactions.
- **Complexity**: **LOW**

---

#### 24. AutotagRSSFeed.ts

- **Path**: `packages/ContentAutotagging/src/RSSFeed/generic/AutotagRSSFeed.ts`
- **Current Pattern**: Loop save per RSS content item (10-500+ items).
- **Fix**: Direct DB transactions, batched in groups.
- **Complexity**: **MEDIUM**

---

#### 25. TaskOrchestrator.ts

- **Path**: `packages/MJServer/src/services/TaskOrchestrator.ts`
- **Current Pattern**: Multiple scattered saves for task status updates.
- **Fix**: Direct DB transactions where multiple saves happen in sequence.
- **Complexity**: **LOW**

---

### Tier 4 -- Low Priority (Small loops, infrequent)

These are cases where the loop size is small (typically under 10 items) and the operations are infrequent. They should still be migrated for correctness (atomicity), but the performance impact is minimal.

---

#### 26. template-editor.component.ts

- **Path**: `packages/Angular/Explorer/core-entity-forms/src/lib/shared/components/template-editor.component.ts`
- **Current Pattern**: Loop save for template contents (2-5 items).
- **Fix**: TransactionGroup.
- **Complexity**: **LOW**

---

#### 27. knowledge-config-resource.component.ts — N/A (no migration needed)

- **Path**: `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/config/knowledge-config-resource.component.ts`
- **Status**: **Skipped on inspection.** The file has only single-record `Save()`/`Delete()` calls (`CreateIndex`, `DeleteIndex`) — no loop pattern. `SaveConfiguration` is a placeholder that doesn't persist FTS toggles or pipeline settings yet. TransactionGroup adds overhead for single-record operations with no atomicity benefit. Revisit if/when the FTS toggle and pipeline-settings persistence is actually wired up; *that* would introduce the loop the original inventory anticipated.

---

#### 28. collection-view.component.ts

- **Path**: `packages/Angular/Generic/conversations/src/lib/components/collection/collection-view.component.ts`
- **Current Pattern**: Loop delete for artifact removal (1-5 items).
- **Fix**: TransactionGroup.
- **Complexity**: **LOW**

---

#### 29. duplicate-detection-resource.component.ts

- **Path**: `packages/Angular/Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.ts`
- **Current Pattern**: Loop save for match status updates.
- **Fix**: TransactionGroup.
- **Complexity**: **LOW**

---

## Step-by-Step Migration Process

### For Client-Side (TransactionGroup) Migrations

Follow these steps exactly for each migration:

**Step 1: Identify the loop or sequential block.**

Find the code that calls `Save()` or `Delete()` multiple times in a loop or in sequence. Note what entity types are involved and whether any operations depend on results from earlier operations.

**Step 2: Add the required imports.**

```typescript
import { Metadata, TransactionVariable } from '@memberjunction/core';
```

You only need `TransactionVariable` if operations have dependencies (e.g., child records need a parent ID).

**Step 3: Create a TransactionGroup before the loop.**

```typescript
const md = new Metadata();
const tg = await md.CreateTransactionGroup();
```

**Step 4: Inside the loop, assign the TransactionGroup before each Save/Delete.**

```typescript
// BEFORE (sequential saves)
for (const item of items) {
    item.Status = 'Active';
    await item.Save();
}

// AFTER (transactional saves)
const tg = await md.CreateTransactionGroup();
for (const item of items) {
    item.Status = 'Active';
    item.TransactionGroup = tg;
    await item.Save();  // Queues, does not execute
}
```

**Step 5: After the loop, call Submit().**

```typescript
const success = await tg.Submit();
```

**Step 6: Handle the result.**

```typescript
if (!success) {
    // All operations were rolled back
    // Show error to the user
    this.ShowNotification('Failed to save changes. All changes have been rolled back.', 'error');
    return;
}
// All operations succeeded
this.ShowNotification('Changes saved successfully.', 'success');
```

**Step 7: Update error handling.**

With the sequential pattern, you might have been checking each `Save()` return value individually. With TransactionGroup, the individual `Save()` calls always return `true` (meaning "queued successfully"). The real success/failure comes from `Submit()`. Remove any per-item error handling and replace it with a single check on `Submit()`.

**Step 8: If operations have dependencies, add TransactionVariables.**

If a child record's foreign key depends on a parent record's ID that is generated during the save, use the TransactionVariable pattern described in the [TransactionVariable section](#transactionvariable-passing-data-between-transactions) above.

---

### For Server-Side (Direct DB Transaction) Migrations

Follow these steps exactly for each migration:

**Step 1: Identify the loop or sequential block.**

Same as client-side: find the code that calls `Save()` or `Delete()` multiple times.

**Step 2: Add the required import.**

```typescript
import { DatabaseProviderBase } from '@memberjunction/core';
```

If `Metadata` is not already imported, add that too:

```typescript
import { Metadata } from '@memberjunction/core';
```

**Step 3: Get a reference to the database provider.**

```typescript
const provider = Metadata.Provider as DatabaseProviderBase;
```

**Step 4: Wrap the operations in BeginTransaction / CommitTransaction / RollbackTransaction.**

```typescript
await provider.BeginTransaction();
try {
    for (const item of items) {
        item.Status = 'Active';
        const result = await item.Save();
        if (!result) {
            throw new Error(`Save failed for ${item.ID}: ${item.LatestResult?.Message}`);
        }
    }
    await provider.CommitTransaction();
} catch (e) {
    await provider.RollbackTransaction();
    throw e;
}
```

**Step 5: Check every Save() and Delete() return value.**

This is critical. `Save()` and `Delete()` return `false` on failure -- they do not throw. If you do not check the return value, the loop continues, and you commit a partially-failed transaction. Always throw on failure to trigger the rollback.

**Step 6: For large loops (500+ items), batch into smaller transactions.**

```typescript
const BATCH_SIZE = 500;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await provider.BeginTransaction();
    try {
        for (const item of batch) {
            item.Status = 'Active';
            const result = await item.Save();
            if (!result) {
                throw new Error(`Save failed for ${item.ID}`);
            }
        }
        await provider.CommitTransaction();
    } catch (e) {
        await provider.RollbackTransaction();
        throw e;
    }
}
```

This prevents lock escalation in SQL Server. When a transaction holds locks on too many rows (typically around 5000), SQL Server escalates from row-level locks to a table-level lock, blocking all other queries on the table.

---

## Common Gotchas

### 1. Do not mix TransactionGroup with direct DB transactions

The `SyncRolesUsersResolver.ts` bug (item #1 in the inventory) was exactly this. The resolver was already inside a server-side transaction, and someone tried to add a TransactionGroup on top. TransactionGroup on the server creates its *own* transaction, resulting in nested transactions that conflict with each other. The fix was to remove the TransactionGroup and use the direct DB transaction instead.

**Rule**: If you are on the server and already in a transaction, do not add a TransactionGroup. Use the existing transaction.

### 2. TransactionGroup.Submit() returns boolean, not void

`Submit()` returns `true` if all operations succeeded and `false` if they all rolled back. It does **not** throw an exception on failure. Always check the return value.

### 3. Individual Save() return values change meaning with TransactionGroup

Without a TransactionGroup, `entity.Save()` returns `true` if the save succeeded and `false` if it failed. **With** a TransactionGroup, `entity.Save()` always returns `true` because it only means "the operation was successfully added to the queue." The actual success/failure is determined by `Submit()`.

This means you cannot rely on per-item `Save()` results to detect failures in a TransactionGroup context. Move your error handling to the `Submit()` call.

### 4. Variable ordering matters

When using TransactionVariable, the entity with the `'Define'` variable must be queued (via `Save()`) **before** the entity with the `'Use'` variable. If you queue them in the wrong order, the `'Define'` variable will not have been processed yet when the `'Use'` variable tries to read it, and the transaction will fail with an error.

### 5. Error handling changes with TransactionGroup

With sequential saves, you might handle errors per-item (retry one failed item, skip it, etc.). With TransactionGroup, it is all-or-nothing. If any operation fails, **all** operations roll back. You cannot partially commit. If you need per-item error handling, TransactionGroup may not be the right tool -- consider keeping sequential saves with individual error handling, or moving to a custom resolver with more granular transaction control.

### 6. Do not put too many operations in one TransactionGroup

Putting 10,000 operations in a single TransactionGroup causes two problems:
- **Memory**: All operations are held in memory until `Submit()` is called.
- **Lock escalation**: The database transaction holds locks on all affected rows. At high volumes, SQL Server escalates to table-level locks, blocking all other operations.

Batch into groups of 100-500 operations per TransactionGroup.

---

## Testing Checklist

For each migration, verify the following:

- [ ] **Happy path works**: All operations succeed and data is correctly committed
- [ ] **Atomicity**: If one operation fails (simulate by corrupting one item's data), ALL operations roll back -- verify no partial writes
- [ ] **Operation count matches**: The same number of records are created/updated/deleted as before the migration
- [ ] **TransactionVariable usage** (if applicable): Verify that IDs flow correctly from parent to child records
- [ ] **Large data volumes**: Test with realistic data sizes (not just 2-3 items)
- [ ] **Error messages surface**: Users still see meaningful error messages when operations fail
- [ ] **Unit tests pass**: Run `cd packages/PackageName && npm run test` for the affected package
- [ ] **No regressions in related features**: If the migrated code is part of a larger workflow, test the entire workflow end-to-end

---

## Reference: Existing Good Examples

These files in the codebase already use TransactionGroup or direct DB transactions correctly. Use them as reference implementations when migrating other code.

### Client-Side TransactionGroup Examples

| File | What It Does |
|------|-------------|
| `packages/Angular/Generic/base-forms/src/lib/base-form-component.ts` (line ~338) | Saves a parent record and its related child entities in a single transaction. The canonical example of TransactionGroup usage in Angular components. |
| `packages/Angular/Generic/join-grid/src/lib/join-grid/join-grid.component.ts` (line ~220) | Creates, updates, and deletes join-table records in a single transaction. Good example of mixed operations (add + delete) in one TG. |
| `packages/Angular/Generic/resource-permissions/src/lib/resource-permissions.component.ts` (line ~183) | Saves permission changes (create, update, delete) in a single transaction. |
| `packages/Angular/Explorer/explorer-core/src/lib/user-notifications/user-notifications.component.ts` (TestTransactionGroupVariables method) | Test/demo of TransactionVariable for passing data between transactions. |

### Server-Side Direct DB Transaction Examples

| File | What It Does |
|------|-------------|
| `packages/MJCoreEntitiesServer/src/custom/MJApplicationEntityServer.server.ts` (Save method) | Wraps child entity operations in a direct DB transaction during a parent entity save. |
| `packages/MJCoreEntitiesServer/src/custom/MJActionEntityServer.server.ts` (Save method) | Manages library associations (add, update, remove) within a transaction scope. |
| `packages/MJCore/src/generic/databaseProviderBase.ts` (MergeRecords method, line ~1760) | Uses BeginTransaction/CommitTransaction/RollbackTransaction for the record merge operation. |

### TransactionGroup on Server (via Resolver)

| File | What It Does |
|------|-------------|
| `packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts` | Uses TransactionGroup on the server side within resolver methods. Note: this works because the resolver creates its own TG and is not inside another transaction. |
