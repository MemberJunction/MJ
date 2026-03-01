# DatabaseProviderBase Refactoring: Full Implementation Brief

You are implementing a major refactoring of `DatabaseProviderBase` in MemberJunction. This is a 6-phase plan followed by PostgreSQL provider creation and vertically integrated testing. Read the plan carefully and implement it precisely.

## CRITICAL COMPILATION GOTCHAS (Discovered During Planning)

These are real errors you WILL hit if you don't handle them upfront:

1. **RecordMergeRequest/RecordMergeResult/RecordMergeDetailResult** are exported from `./entityInfo.ts`, NOT `./interfaces.ts`. Import them from `entityInfo`.

2. **MJCoreSchemaName** is NOT a direct property of the class. Access it via `this.ConfigData.MJCoreSchemaName` (see `ProviderConfigDataBase` in interfaces.ts).

3. **BaseEntity does NOT have a `Load(id)` method**. It uses `InnerLoad(compositeKey)`. Generated subclasses add convenience `Load(id)` methods, but `BaseEntity` itself does not have one. When you need to load records generically, use `RunView` or create a `CompositeKey` and call `InnerLoad()`.

4. **DatabaseProviderBase lives in `@memberjunction/core`** which CANNOT import from `@memberjunction/core-entities`. Therefore, you CANNOT use typed entity subclasses (like `MJAuditLogEntity`, `UserFavoriteEntity`, etc.). Instead, use `BaseEntity` with `.Set('FieldName', value)` calls for methods like `CreateAuditLogRecord`, `SetRecordFavoriteStatus`, `StartMergeLogging`, etc.

5. **HandleEntityActions/HandleEntityAIActions** depend on server-side packages (`@memberjunction/actions`, `@memberjunction/aiengine`, `@memberjunction/queue`) that CANNOT be imported into `@memberjunction/core`. Make them virtual methods with no-op defaults in the base class.

6. **Never use `any` types** - MemberJunction has a strict no-any policy. Use proper types throughout.

## Architecture

**Class hierarchy after refactoring:**
```
ProviderBase (abstract, MJCore/providerBase.ts)
  └── DatabaseProviderBase (abstract, MJCore/databaseProviderBase.ts) ← grows from 51 to ~2,000+ lines
       ├── SQLServerDataProvider (~2,500 lines, down from 6,094)
       └── PostgreSQLDataProvider (~800 lines, NEW)
```

**Key design principle:** DatabaseProviderBase is the single source of truth for ALL business logic. Subclasses are thin SQL dialect adapters that implement abstract methods for SQL generation only.

**Atomic Record Change Tracking:** The base class pre-computes `RecordChangeData` (business logic: what changed, diffs, descriptions). The subclass embeds it atomically in SQL:
- SQL Server: Single SQL batch with @ResultTable capture + INSERT
- PostgreSQL: CTE chain

## The 6-Phase Plan

Read the plan file at: `/workspace/MJ/plans/postgres-docker-agent-notes.md` - wait, that may not exist. Instead, here is the full plan inline:

### New Types (add to databaseProviderBase.ts)

```typescript
export type FieldChange = {
    field: string;
    oldValue: unknown;
    newValue: unknown;
};

export interface RecordChangeData {
    entityName: string;
    entityID: string;
    recordID: string | null;
    userID: string;
    type: 'Create' | 'Update' | 'Delete';
    changesJSON: string;
    changesDescription: string;
    fullRecordJSON: string;
}

export interface SaveSQLResult {
    fullSQL: string;
    simpleSQL: string;
    parameters?: unknown[];
}

export interface DeleteSQLResult {
    fullSQL: string;
    simpleSQL: string;
    parameters?: unknown[];
}
```

### Phase 1: Pure Business Logic Methods (No SQL, No Risk)

Move these methods from SQLServerDataProvider → DatabaseProviderBase. They use only entity objects and in-memory operations. No direct SQL.

**Record Change Utilities (move verbatim, adjust for base class):**
- `DiffObjects()` (lines 4165-4230 in SQLServerDataProvider) — make `quoteToEscape` param optional (default: no escaping). Returns FieldChange[]
- `CreateUserDescriptionOfChanges()` (lines 4030-4049) — human-readable change summary
- `trimString()` (lines 4051-4056) — value truncation helper
- `escapeQuotesInProperties()` (lines 4094-4133) — recursive quote escaping for SQL embedding
- `MapTransactionResultToNewValues()` (lines 3661-3668) — transform result to field/value pairs
- `FieldChange` type (lines 126-131) — type definition

**New concrete methods:**
- `ComputeRecordChangeData(entity, isNew, user)` — pre-computes RecordChangeData from entity state using DiffObjects
- `ShouldTrackRecordChanges(entity)` — returns true if entity has TrackRecordChanges AND isn't the RecordChange entity itself

**Virtual hooks (no-op defaults, overridden by server-side providers):**
- `HandleEntityActions(entity, baseType, before, user)` → returns empty array
- `HandleEntityAIActions(entity, baseType, before, user)` → no-op
- `GetEntityAIActions(entityInfo, before)` → returns empty array

**ISA Hierarchy Utilities (pure metadata, no SQL):**
- `isEntityOrAncestorOf()` (lines 5783-5789) — tree traversal
- `getFullSubTree()` (lines 5795-5801) — recursive enumeration
- `GetCRUDProcedureName()` (lines 3676-3685) — SP name from metadata (renamed from GetCreateUpdateSPName to be more general)

**Other Business Logic:**
- `CheckUserReadPermissions()` (lines 2817-2826) — metadata-only permission check
- `CreateAuditLogRecord()` (lines 2769-2815) — uses BaseEntity with .Set() calls, NOT typed entity subclasses

**After Phase 1:** Build MJCore, build SQLServerDataProvider, run tests.

### Phase 2: Save() Decomposition

Decompose the monolithic Save() (lines 3464-3659) into a 10-step pipeline in the base class.

**Save Pipeline Steps:**
1. ValidateSavePermissions — concrete
2. InitSaveTracking — concrete (BaseEntityResult, ResultHistory)
3. RunValidationActions — concrete → calls virtual HandleEntityActions('validate')
4. RunBeforeSaveHooks — concrete → calls virtual HandleEntityActions + HandleEntityAIActions
5. CapturePreSaveState — concrete (oldData, compute RecordChangeData)
6. GenerateSaveSQL — ABSTRACT (subclass generates dialect-specific SQL)
7. ExecuteOrEnqueue — concrete (TransactionGroup vs direct ExecuteSQL)
8. ProcessSaveResult — concrete → calls abstract ProcessEntityRows
9. RunAfterSaveHooks — concrete (fire & forget)
10. PropagateISAChanges — concrete orchestration

**New Abstract Method:**
```typescript
protected abstract GenerateSaveSQL(
    entity: BaseEntity, isNew: boolean, user: UserInfo,
    recordChangeData: RecordChangeData | null
): Promise<SaveSQLResult>;
```

**Virtual Hooks:**
- `OnSuspendRefresh()` — no-op default, SQL Server sets `_bAllowRefresh = false`
- `OnResumeRefresh()` — no-op default, SQL Server sets `_bAllowRefresh = true`
- `GetTransactionExtraData()` — returns `{}`, SQL Server returns `{ dataSource: this._pool }`

**After Phase 2:** Build MJCore, build SQLServerDataProvider, run tests.

### Phase 3: Delete() Decomposition

Same pattern as Save. 7-step pipeline.

**Delete Pipeline Steps:**
1. ValidateDeletePermissions — concrete
2. InitDeleteTracking — concrete
3. CapturePreDeleteState — concrete (compute RecordChangeData for deletion)
4. GenerateDeleteSQL — ABSTRACT
5. RunBeforeDeleteHooks — concrete
6. ExecuteOrEnqueueDelete — concrete
7. RunAfterDeleteHooks — concrete (fire & forget)

**New Abstract Method:**
```typescript
protected abstract GenerateDeleteSQL(
    entity: BaseEntity, user: UserInfo,
    recordChangeData: RecordChangeData | null
): DeleteSQLResult;
```

### Phase 4: ISA Propagation & Record Change Operations

**Move to Base (Concrete Orchestration):**
- `PropagateRecordChangesToSiblings()` — walks ISA tree, calls abstract SQL method
- `FindISAChildEntity()` / `FindISAChildEntities()` — calls abstract `BuildChildDiscoverySQL` + ExecuteSQL
- `GetRecordChanges()` — SQL query on vwRecordChanges view
- `LogRecordChange()` — builds RecordChangeData + calls abstract SQL generation

**New Abstract Methods:**
```typescript
protected abstract BuildSiblingRecordChangeSQL(entityInfo: EntityInfo, changeData: RecordChangeData): string;
protected abstract BuildChildDiscoverySQL(childEntities: EntityInfo[], recordPKValue: string): string;
protected abstract ProcessEntityRows<T>(rows: T[], entityInfo: EntityInfo, user: UserInfo): Promise<T[]>;
```

### Phase 5: Additional Operations

**Move to Base:**
- `GetRecordFavoriteStatus()` / `GetRecordFavoriteID()` — uses ExecuteSQL + QuoteIdentifier
- `SetRecordFavoriteStatus()` — uses BaseEntity with .Set()
- `GetRecordDependencies()` — orchestration + abstract SQL builders
- `GetRecordDuplicates()` — uses AI engine (virtual), no direct SQL
- `MergeRecords()` — complex orchestration, uses entity system

**New Abstract Methods:**
```typescript
protected abstract QuoteIdentifier(name: string): string;
protected abstract QuoteSchemaAndView(schema: string, view: string): string;
protected abstract BuildHardLinkDependencySQL(entityDeps: EntityDependency[], compositeKey: CompositeKey): string;
protected abstract BuildSoftLinkDependencySQL(entityName: string, compositeKey: CompositeKey): string;
```

### Phase 6: SQL Server Cleanup

Remove all methods from SQLServerDataProvider that are now inherited from the base class. SQLServerDataProvider should only keep:
- GenerateSaveSQL() override (T-SQL)
- GenerateDeleteSQL() override (T-SQL)
- BuildSiblingRecordChangeSQL() override (T-SQL)
- generateSPParams(), generateSetStatementValue(), packageSPParam() (T-SQL parameter generation)
- getAllEntityColumnsSQL() (T-SQL @ResultTable columns)
- ProcessEntityRows() override (SQL Server datetime/encryption)
- BuildChildDiscoverySQL() override (T-SQL UNION ALL)
- QuoteIdentifier() override (returns `[name]`)
- BuildHardLinkDependencySQL() / BuildSoftLinkDependencySQL() overrides
- HandleEntityActions/HandleEntityAIActions/GetEntityAIActions overrides
- OnSuspendRefresh/OnResumeRefresh/GetTransactionExtraData overrides
- RunView/RunQuery/Metadata/Dataset methods (existing implementations)
- Transaction management (mssql-specific)
- ExecuteSQL/ExecuteSQLBatch (mssql-specific)

**Target:** SQLServerDataProvider shrinks from 6,094 to ~2,500 lines.

## Post-Plan: PostgreSQL Provider

After all 6 phases are complete and SQLServerDataProvider builds and tests pass, create a new PostgreSQL provider package:

**Location:** `packages/PostgreSQLDataProvider/` (directory already exists with some leftover files)

**Package structure:**
- `package.json` — peer to SQLServerDataProvider, depends on `@memberjunction/core`, `pg` (node-postgres)
- `tsconfig.json` — follows same pattern as SQLServerDataProvider
- `src/PostgreSQLDataProvider.ts` — main provider class
- `src/index.ts` — barrel export

**PostgreSQLDataProvider class implements:**
- `GenerateSaveSQL()` — PG function calls with CTE-based record change tracking
- `GenerateDeleteSQL()` — PG delete with CTE
- `BuildSiblingRecordChangeSQL()` — PG INSERT using json_build_object
- `BuildChildDiscoverySQL()` — PG UNION ALL with "schema"."table" quoting
- `ProcessEntityRows()` — PG-specific type conversion
- `QuoteIdentifier()` — returns `"name"` (double-quoted)
- `QuoteSchemaAndView()` — returns `"schema"."view"`
- `BuildHardLinkDependencySQL()` / `BuildSoftLinkDependencySQL()` — PG syntax
- `ExecuteSQL()` — pg pool.query
- `BeginTransaction()` / `CommitTransaction()` / `RollbackTransaction()` — pg client transactions
- `HandleEntityActions()` / `HandleEntityAIActions()` — same server-side overrides as SQL Server

## Verification Steps

After EACH phase:
1. `cd /workspace/MJ/packages/MJCore && npm run build` — base class compiles
2. `cd /workspace/MJ/packages/SQLServerDataProvider && npm run build` — provider compiles
3. `cd /workspace/MJ/packages/SQLServerDataProvider && npm run test` — tests pass (update tests if needed)

After PG provider:
4. `cd /workspace/MJ/packages/PostgreSQLDataProvider && npm run build` — PG provider compiles

## IMPORTANT IMPLEMENTATION NOTES

- **Study the SQLServerDataProvider code CAREFULLY before moving methods.** Read each method in full, understand all its dependencies, and adapt for the base class context.
- **Maintain exact behavior for SQL Server.** This is a refactoring, not a rewrite. The SQL Server path must produce identical results.
- **Use `protected` for methods that subclasses need to call or override.** Use `private` for implementation details.
- **Follow MemberJunction naming conventions:** PascalCase for public methods, camelCase for private/protected.
- **Keep functions focused** — decompose any method over 30-40 lines into smaller helpers.
- **Run builds after each phase** — don't accumulate errors.
- **The existing `ExecuteSQLOptions` interface and the 4 existing abstract methods (ExecuteSQL, BeginTransaction, CommitTransaction, RollbackTransaction) must remain unchanged.**
