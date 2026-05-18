# Keyset (Seek) Pagination Guide

**Status:** Stable — available from v5.x onward.

## When to use this

Use **keyset pagination** (`RunViewParams.AfterKey`) when your code iterates through *all* records of a large entity in batches — typically a background job, scheduled action, vectorization run, or bulk export. It stays **O(log N) per page** regardless of how deep you go.

Keep using **OFFSET-based pagination** (`RunViewParams.StartRow`) for UI grid pagination — a few hundred pages of a few hundred rows each, where users jump around to arbitrary pages. OFFSET is correct for that workload and supports arbitrary `OrderBy`.

| Workload | Use |
|---|---|
| Background job iterating a large entity | **`AfterKey`** |
| Vectorization / classification / sync of large entities | **`AfterKey`** |
| Bulk maintenance ("find missing X across the table") | **`AfterKey`** |
| UI grid paged by user (jump-to-page) | `StartRow` |
| Small result sets (a few thousand rows) | Either is fine |

## Why keyset is fast

`OFFSET N FETCH N` requires the DB engine to enumerate the first N rows and discard them before returning the page. At offset 2,000,000 on a 2.6M-row table that's millions of rows of work for every page.

Keyset pagination instead does `WHERE pk > @lastSeenKey ORDER BY pk LIMIT N`, which the optimizer resolves as a single clustered-index seek + range scan. Every page costs roughly the same, whether it's page 1 or page 50,000.

| Page (on a 2.6M-row entity, warm cache) | OFFSET | Keyset |
|---|---|---|
| 0 (first page) | 6 ms | 6 ms |
| 1 (offset 500) | <1 ms | <1 ms |
| 100 (offset 50,000) | ~25 ms | ~1 ms |
| 5000 (offset 2,500,000) | **~770 ms** | ~5 ms |

## How to use it

### Single-column PK (the common case)

```typescript
import { CompositeKey, RunView } from '@memberjunction/core';

const rv = new RunView();
let lastSeenKey: CompositeKey | undefined; // undefined => first page

while (true) {
    const result = await rv.RunView({
        EntityName: 'Tax Returns',
        ExtraFilter: '(AddressLine1 IS NOT NULL)',
        AfterKey: lastSeenKey,         // undefined on first call
        MaxRows: 500,
        ResultType: 'entity_object',
        BypassCache: true,              // optional — AfterKey already bypasses cache, this is just explicit
    }, contextUser);

    if (!result.Success || result.Results.length === 0) break;

    for (const record of result.Results) {
        // ... process record ...
    }

    // End-of-data signal: partial page means we've reached the last page.
    if (result.Results.length < 500) break;

    // Advance the keyset cursor to the last record's PK.
    const last = result.Results[result.Results.length - 1];
    lastSeenKey = CompositeKey.FromID(last.ID);
}
```

### Custom PK column name (not `ID`)

```typescript
const last = result.Results[result.Results.length - 1];
lastSeenKey = CompositeKey.FromKeyValuePair('CustomerCode', last.CustomerCode);
```

### Using the helper to check entity compatibility upfront

When you're writing a generic helper that might be called for any entity, guard with `IsKeysetPaginationOrderableType` and `entity.PrimaryKeys.length === 1`:

```typescript
import { IsKeysetPaginationOrderableType } from '@memberjunction/core';

const pkField = entity.FirstPrimaryKey;
const canUseKeyset = entity.PrimaryKeys.length === 1
    && pkField != null
    && IsKeysetPaginationOrderableType(pkField.Type);

if (canUseKeyset) {
    // … iterate with AfterKey
} else {
    // … fall back to StartRow / pageNumber
}
```

## Constraints — and the errors you'll see if you violate them

`RunView` throws `AfterKeyNotSupportedError` (in `@memberjunction/core`) when AfterKey can't be honored. The error carries an `EntityName` and a `Reason` code so caller logic can branch sensibly.

| `Reason` | When it fires | What to do |
|---|---|---|
| `CompositePK` | The entity has more than one PK column. | Fall back to `StartRow` (OFFSET), or restructure to query a single-PK projection. |
| `UnsupportedPKType` | PK column type is exotic (`xml`, `sql_variant`, `varbinary`). Essentially never happens with real MJ entities. | Use `StartRow`. |
| `StartRowConflict` | You passed both `AfterKey` and a non-zero `StartRow`. | Pick one. |
| `AfterKeyShape` | The `CompositeKey` shape doesn't match the entity's PK (wrong column name, > 1 pair, null/empty value). | Build the key correctly via `CompositeKey.FromID()` or `CompositeKey.FromKeyValuePair(<pk-col>, value)`. |
| `IncompatibleOrderBy` | You passed `OrderBy` that references columns other than the PK. | Drop the OrderBy (the framework auto-applies `ORDER BY pk`) or use `<pk-col> ASC`/`DESC`. |

```typescript
import { AfterKeyNotSupportedError } from '@memberjunction/core';

try {
    await rv.RunView({ EntityName: 'Something', AfterKey: key, MaxRows: 500 }, user);
} catch (e) {
    if (e instanceof AfterKeyNotSupportedError && e.Reason === 'CompositePK') {
        // Fall back to OFFSET-based iteration
    } else {
        throw e;
    }
}
```

## Cache interaction

Keyset queries **automatically bypass both the client-side and server-side caches**. This is intentional — each call uses a different seek key, so a cached entry would never be reusable. You can pass `BypassCache: true` explicitly for clarity, but it's not required.

This also means keyset queries do **not** trigger `OnDataChanged` callbacks via Redis pub/sub — they're not subscribing to anything cacheable in the first place.

## Direction handling

The seek predicate inverts automatically based on the `OrderBy` direction:

| `OrderBy` | Predicate generated |
|---|---|
| (unset) | `WHERE pk > @lastSeenKey ORDER BY pk ASC` |
| `'ID'` or `'ID ASC'` | `WHERE pk > @lastSeenKey ORDER BY pk ASC` |
| `'ID DESC'` | `WHERE pk < @lastSeenKey ORDER BY pk DESC` |

## End-of-data signal

Same as `StartRow`-mode: when a page returns **fewer rows than `MaxRows`**, you've reached the end. Stop iterating.

## What about `RunQuery`?

`RunQuery` (saved queries with arbitrary SQL) doesn't support keyset pagination in v1, because the framework can't safely rewrite a user-authored query to add a seek predicate. If you're iterating through a saved query's results, OFFSET-mode `StartRow` is the only option today. A future enhancement may add saved-query conventions for keyset.

## Reference implementations

These callers in the codebase use the pattern and are good examples to copy from:

- **`packages/Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts`** — `processMissingForEntity()` iterates entities marked `SupportsGeoCoding`, using keyset when the entity has a single-column PK and falling back to OFFSET otherwise.
- **`packages/AI/Vectors/Core/src/models/VectorBase.ts`** — `PageRecordsByEntityID()` accepts an optional `AfterKey` in its `PageRecordsParams`, with the helper `CanUseKeysetPagination(entityID)` for callers to check compatibility upfront.
- **`packages/AI/Vectors/Sync/src/models/entityVectorSync.ts`** — `startDataPaging()` auto-promotes to keyset when possible, falls back to OFFSET when `StartingOffset` is set (since keyset can't skip to an arbitrary offset).

## Migration checklist for existing OFFSET callers

When you find a caller iterating a large entity with `StartRow`, ask:

1. **Does the entity have a single-column PK?** If composite, leave it alone for now.
2. **Does the OrderBy reference only the PK?** If it sorts by something else (e.g. `RetryCount ASC, CreatedAt ASC`), keyset doesn't apply — the workload may not need keyset anyway if the result set is small.
3. **Is the StartRow value typically growing > a few thousand?** If always small (UI pagination), leave it on OFFSET. If it climbs into the millions on big tables, migrate it.

The migration itself is small:
- Remove `StartRow: offset + 1`
- Add `AfterKey: lastSeenKey`
- Track the last record's PK after each page and rebuild the `CompositeKey`
- That's it — `MaxRows` and `ExtraFilter` stay the same

## Implementation details (for framework maintainers)

- The seek predicate is built by `GenericDatabaseProvider.BuildKeysetSeekClause()` and appended to `viewSQL` (data query only) — not to `countSQL` (total count should reflect all matching rows, not "rows after the seek key").
- Seek values are inlined as SQL literals with type-aware escaping in `formatKeysetSeekValue()` rather than parameter-bound, consistent with how the rest of the WHERE clause is assembled. UUID values are validated against a strict pattern; numeric values are validated as finite numbers; string/date values are escape-quoted and rejected if they contain semicolons, comment markers, or other suspicious patterns.
- Cache bypass is enforced at three layers: `LocalCacheManager.SetRunViewResult` short-circuits writes; `ProviderBase.RunView`/`PreRunView`/`PreRunViews` short-circuit reads; `GenericDatabaseProvider.RunViewsWithCacheCheck` routes keyset items to the no-cache-check pipeline.
- The GraphQL surface uses the existing `CompositeKeyInputType` so the `AfterKey` field doesn't require any new scalar shape on the wire.
