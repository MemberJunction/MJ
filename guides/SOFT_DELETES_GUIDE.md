# Soft Deletes Guide

MemberJunction supports **soft deletes** as a per-entity metadata setting. When enabled, calling `entity.Delete()` marks the row as deleted instead of physically removing it, and the rest of the framework transparently hides the deleted rows from queries.

This is a CodeGen-managed feature — you turn it on by changing one field on the entity, and the framework adds the column, rewrites the view, and rewrites the delete stored procedure for you.

## TL;DR

| | Hard delete (default) | Soft delete |
|---|---|---|
| Entity field | `DeleteType = 'Hard'` | `DeleteType = 'Soft'` |
| Column added by CodeGen | — | `__mj_DeletedAt DATETIMEOFFSET NULL` |
| `spDelete<Entity>` body | `DELETE FROM ...` | `UPDATE ... SET __mj_DeletedAt = GETUTCDATE()` |
| Base view WHERE clause | none | `WHERE __mj_DeletedAt IS NULL` |
| Required for `AllowRecordMerge` | no | **yes** |

You write `await entity.Delete()` in TypeScript either way — the framework hides which mode the entity is in.

---

## How to enable soft delete on an entity

1. **Update the entity's metadata.** Set `DeleteType = 'Soft'` on the row in `${flyway:defaultSchema}.Entity`. Do this via a metadata sync file or a one-line migration — don't hand-edit production data.
2. **Run CodeGen.** This will:
   - Add a `__mj_DeletedAt DATETIMEOFFSET NULL` column to the base table (via [`ensureDeletedAtFieldsExist()`](../packages/CodeGenLib/src/Database/manage-metadata.ts#L2605)).
   - Regenerate the base view with a `WHERE __mj_DeletedAt IS NULL` filter.
   - Regenerate `spDelete<Entity>` to do an UPDATE instead of a DELETE.
   - Regenerate the TypeScript entity subclass.
3. **Done.** Existing app code that calls `entity.Delete()` now soft-deletes. RunView, BaseEntity loads, and FK joins through the base view all automatically skip soft-deleted rows.

You never write the `__mj_DeletedAt` column in a migration yourself. It's in the same category as `__mj_CreatedAt` / `__mj_UpdatedAt` — CodeGen owns it.

---

## What CodeGen actually generates

### Base view (SQL Server)
[`SQLServerCodeGenProvider.ts:79-80`](../packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts#L79-L80):

```sql
CREATE VIEW [schema].[vwMyEntity]
AS
SELECT m.*
FROM [schema].[MyEntity] AS m
WHERE
    m.[__mj_DeletedAt] IS NULL
```

### Base view (PostgreSQL)
[`PostgreSQLCodeGenProvider.ts:2044`](../packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts#L2044) — same pattern with quoted identifiers.

### Delete stored procedure (SQL Server)
[`SQLServerCodeGenProvider.ts:307-316`](../packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts#L307-L316):

```sql
-- For DeleteType='Soft':
UPDATE [schema].[MyEntity]
SET __mj_DeletedAt = GETUTCDATE()
WHERE [ID] = @ID
  AND __mj_DeletedAt IS NULL  -- don't re-delete an already soft-deleted row
```

### Delete function (PostgreSQL)
[`PostgreSQLCodeGenProvider.ts:2182-2184`](../packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts#L2182-L2184) — same pattern, `NOW() AT TIME ZONE 'UTC'`.

---

## Implications for app code

### You don't need to filter on `__mj_DeletedAt` anywhere
Every RunView, every `BaseEntity.Load()`, every join in a generated view goes through the base view, which already filters out soft-deleted rows. **Never add `__mj_DeletedAt IS NULL` to an `ExtraFilter`** — it'll fail because RunView queries the view, not the base table, and the view doesn't expose the column.

### You can't "see deleted records" through the normal API
If you need to inspect or restore soft-deleted rows, you have to query the base table directly (raw SQL or a custom view). There is no built-in "include deleted" flag on RunView.

### Restoring a soft-deleted record
Set `__mj_DeletedAt = NULL` on the base table with raw SQL. The framework intentionally does not expose a Restore API for soft-deleted records — once `Delete()` runs, the entity object can no longer be loaded through normal channels because the view filters it out.

For other restore scenarios (`Status='Inactive'` flags etc.), see [`plans/record-changes-restore/plan.md`](../plans/record-changes-restore/plan.md) — those go through the normal Record Changes restore flow.

### Record Changes still tracks the delete
The audit trail (Record Changes) captures the soft-delete event the same way it captures a hard delete. You get full history.

### AllowRecordMerge requires soft delete
The Entity metadata enforces this rule via [`ValidateAllowRecordMergeForSoftDeleteAPI`](../packages/MJCoreEntities/src/generated/entity_subclasses.ts#L63312):

> For `AllowRecordMerge` to be enabled, the entity must have `AllowDeleteAPI=1` and `DeleteType='Soft'`.

This is because merging needs to preserve the "merged-away" record for audit / reference purposes, which soft delete provides naturally.

---

## When to choose soft delete

**Good candidates:**
- Entities that participate in record merging.
- Entities referenced by long-lived foreign keys where dangling references would be a problem.
- Entities where audit / "who deleted what" matters and Record Changes alone isn't enough.
- User-facing records where "undo delete" is a plausible feature.

**Stick with hard delete for:**
- High-volume transactional / log tables where you actually want rows gone.
- Junction / link tables where the row has no meaning on its own.
- Tables where FK constraints already make orphaning impossible.

---

## Anti-patterns

```typescript
// ❌ WRONG — never query the base table or filter on __mj_DeletedAt yourself
await rv.RunView({
    EntityName: 'My Entity',
    ExtraFilter: '__mj_DeletedAt IS NULL'  // The view already does this!
});

// ❌ WRONG — never write __mj_DeletedAt in a migration
CREATE TABLE ${flyway:defaultSchema}.MyEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ...
    __mj_DeletedAt DATETIMEOFFSET NULL  -- CodeGen adds this!
);

// ❌ WRONG — never bypass Delete() to "really" delete a soft-delete entity
await dataSource.query(`DELETE FROM MyEntity WHERE ID = '${id}'`);
// You'll skip Record Changes, skip event publication, skip cache invalidation,
// and break any code that holds a stale BaseEntity reference.

// ✅ CORRECT — just call Delete()
const deleted = await entity.Delete();
if (!deleted) {
    LogError(`Delete failed: ${entity.LatestResult?.CompleteMessage}`);
}
```

---

## Related

- [BaseEntity Server-Side Patterns](BASE_ENTITY_SERVER_PATTERNS.md) — for `ValidateAsync` cross-record invariants and FK cleanup before delete.
- [Caching & Real-Time Synchronization Guide](CACHING_AND_PUBSUB_GUIDE.md) — soft deletes go through the same `BaseEntity.Delete()` path and trigger the same cache invalidation events as hard deletes.
- `migrations/CLAUDE.md` — general migration rules; `__mj_DeletedAt` is in the "CodeGen handles this — don't write it yourself" bucket.
