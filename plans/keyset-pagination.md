# Keyset (Seek) Pagination for RunView

**Status:** Draft for review
**Author:** Claude (paired with Amith)
**Date:** 2026-05-13

## 1. Why

MJ's `RunView` pagination uses OFFSET/FETCH in SQL Server and LIMIT/OFFSET in PostgreSQL ([GenericDatabaseProvider.ts:1182](../packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts#L1182), [SQLServerDataProvider.ts:576](../packages/SQLServerDataProvider/src/SQLServerDataProvider.ts#L576), [PostgreSQLDataProvider.ts:562](../packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts#L562)). This works fine for UI grids paging through a few hundred rows, but degrades badly when callers iterate large tables:

| `StartRow` (vwTaxReturns, 2.6M rows, local SSD warm cache) | Elapsed |
|---|---|
| 0 (page 0) | 6 ms |
| 500 (page 1) | 0 ms |
| 450,000 | 54 ms |
| 2,000,000 | **773 ms** |

In production this is much worse — cold-cache pages hit physical I/O and the same query runs 37k times/day with avg 2.2 sec each. Audited callers that paginate deeply through large entities (i.e. abuse OFFSET as a "give me all of it, in chunks" mechanism):

- `packages/Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts:221` — iterates every entity with `SupportsGeoCoding`, in pages of 500
- `packages/ExternalChangeDetection/src/ChangeDetector.ts:292` — paginates entity record sets for change detection
- `packages/AI/Vectors/Core/src/models/VectorBase.ts:68` — vectorization sync paginates source records
- (likely) duplicate detection, content autotag, archive runs — audit confirms during implementation

Live geocoding-on-save already runs inline in `GenericDatabaseProvider.OnSaveCompleted` ([line 582-588](../packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts#L582-L588)), so the scheduled job is only a backfill safety net — it doesn't need to be aggressive, but it shouldn't be *broken* either.

The fix is **keyset (seek) pagination**: instead of `OFFSET N`, the caller passes "the key of the last row I saw" and the query becomes `WHERE pk > @lastSeen ORDER BY pk LIMIT N`. Every page is O(log n) regardless of depth.

## 2. Design decisions

### 2.1 Scope: single-column PK only, throw on composite

Keyset paging across composite PKs requires expanded boolean clauses on SQL Server (no native row-value comparison) and tight coordination between OrderBy and the AfterKey shape. Most MJ entities have a single-column PK (overwhelmingly `uniqueidentifier`), so the simpler API serves the common case cleanly. Callers needing keyset on composite PKs have two options: refactor the entity, or use raw SQL via `RunQuery`.

**Validation rule:** When `AfterKey` is present, throw `AfterKeyNotSupportedError` if:
- The entity has more than one PK column, OR
- The single PK column's `Type` is not in the orderable allowlist (see §2.3), OR
- The `OrderBy` is set to something other than the PK column (we don't try to keyset on arbitrary orderings — see §2.4).

### 2.2 Use `CompositeKey` as the parameter type

`CompositeKey` is MJ's canonical PK representation ([packages/MJCore/src/generic/compositeKey.ts:339](../packages/MJCore/src/generic/compositeKey.ts#L339)). It already has `FromID(value)` for the single-column case and round-trips cleanly through GraphQL (it's the same shape used for entity loads, deletes, etc.). Even though we only accept single-key form initially, using `CompositeKey` keeps the door open for future composite-PK support without an API break.

```typescript
// New RunViewParams field
AfterKey?: CompositeKey;
```

### 2.3 Orderable type allowlist

All native SQL types that are sane PKs are orderable. We allowlist defensively rather than blacklist:

```
uniqueidentifier, int, bigint, smallint, tinyint, decimal, numeric, money, smallmoney,
float, real, char, varchar, nchar, nvarchar, date, datetime, datetime2, datetimeoffset,
smalldatetime, time
```

Anything outside this set (e.g. `xml`, `sql_variant`, `varbinary`) throws. This is essentially a no-op in practice for real MJ entities but protects future maintainability.

### 2.4 OrderBy interaction

When `AfterKey` is present:
- If the caller passes `OrderBy`, it must be exactly the PK column (with optional `ASC`/`DESC`). Otherwise throw.
- If the caller omits `OrderBy`, the provider auto-applies `ORDER BY <pk>` and a default `ASC` direction (matching today's pagination behavior at line 1180).

This restriction is the price of simplicity. Arbitrary-ORDER-BY keyset paging is technically possible but requires the caller to know which columns are covered by which index, and degenerates to a sort-then-skip if not. Out of scope for v1.

### 2.5 Direction handling

For `OrderBy: 'ID DESC'`, the seek inverts: `WHERE id < @lastSeen`. Provider builds the correct comparison from the OrderBy direction.

## 3. API

### 3.1 New `RunViewParams` field

```typescript
// packages/MJCore/src/generic/interfaces.ts
export interface RunViewParams {
    // ... existing fields ...

    /**
     * Keyset (seek) pagination: when set, the query returns the next page of records
     * after the given PK value, ordered by the PK column. Use this in place of
     * StartRow when iterating large result sets (e.g. background jobs, bulk processing).
     *
     * Constraints:
     * - Entity must have a single-column primary key
     * - PK column type must be in the orderable allowlist (most types are; see docs)
     * - OrderBy, if set, must reference only the PK column (any direction)
     * - Cannot be combined with StartRow
     *
     * Example:
     *   const result = await rv.RunView({
     *     EntityName: 'Tax Returns',
     *     ExtraFilter: '(AddressLine1 IS NOT NULL)',
     *     AfterKey: CompositeKey.FromID(lastSeenId),
     *     MaxRows: 500,
     *     ResultType: 'entity_object'
     *   }, contextUser);
     *
     * @throws AfterKeyNotSupportedError if the entity has a composite PK or unsupported PK type
     * @throws Error if AfterKey is combined with StartRow, or if OrderBy is incompatible
     *
     * @since v5.x
     */
    AfterKey?: CompositeKey;
}
```

### 3.2 New error type

```typescript
// packages/MJCore/src/generic/runViewKeysetError.ts
export class AfterKeyNotSupportedError extends Error {
    constructor(
        public readonly EntityName: string,
        public readonly Reason: 'CompositePK' | 'UnsupportedPKType' | 'IncompatibleOrderBy',
        message: string
    ) {
        super(message);
        this.name = 'AfterKeyNotSupportedError';
    }
}
```

### 3.3 GraphQL surface

The GraphQL `RunViewsWithCacheCheckQuery` / `RunViewsQuery` inputs need a new optional `AfterKey` field (CompositeKey scalar — already a JSON-stringified shape in MJ's resolvers). Client-side `GraphQLDataProvider` forwards it through to the server provider.

## 4. Provider implementation

### 4.1 New abstract method on `GenericDatabaseProvider`

```typescript
// packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts
/**
 * Build the SQL fragment for keyset (seek) pagination.
 * Called when RunViewParams.AfterKey is set.
 *
 * @param pkColumnName  The quoted PK column name (e.g. "[ID]" for SQL Server, '"ID"' for PG)
 * @param keyParamPlaceholder  The parameter placeholder for the seek key value (e.g. "@p0")
 * @param direction  'ASC' (use >) or 'DESC' (use <)
 * @param maxRows  Page size
 * @returns SQL fragment to append after WHERE/ORDER BY clauses, e.g.
 *          "ORDER BY [ID] ASC OFFSET 0 ROWS FETCH NEXT 500 ROWS ONLY"
 *          (no, that's OFFSET — keyset returns: "ORDER BY [ID] ASC" + the WHERE clause is built separately)
 *
 * NB: This method ONLY emits the ORDER BY + TOP/LIMIT fragment. The WHERE
 * predicate (pkColumn > @keyValue) is built by the shared
 * applyKeysetSeekPredicate() helper and added to whereSQL before this method
 * is called. Each provider only needs to differ in TOP-vs-LIMIT syntax.
 */
protected abstract BuildKeysetPaginationSQL(
    pkColumnName: string,
    direction: 'ASC' | 'DESC',
    maxRows: number
): string;
```

### 4.2 SQL Server implementation

```typescript
// packages/SQLServerDataProvider/src/SQLServerDataProvider.ts
protected override BuildKeysetPaginationSQL(
    pkColumnName: string,
    direction: 'ASC' | 'DESC',
    maxRows: number
): string {
    // SQL Server: TOP N already emitted at SELECT site by BuildTopClause; just ORDER BY here.
    return `ORDER BY ${pkColumnName} ${direction}`;
}
```

Wait — SQL Server emits `TOP N` at the SELECT level via `BuildTopClause`, but `BuildPaginationSQL` currently emits `OFFSET 0 ROWS FETCH NEXT N ROWS ONLY` and is appended AFTER ORDER BY. For keyset we want `TOP N ... WHERE pk > @last ORDER BY pk`. The implementation has to:

1. When `AfterKey` is set, **bypass** the existing pagination branch at line 1178-1187.
2. Append the seek predicate to `whereSQL` BEFORE the ORDER BY is emitted.
3. Force a `TOP N` clause at the SELECT site (treat it like a non-paginated query for emit purposes).
4. Emit the ORDER BY as usual.

So the structural change in `GenericDatabaseProvider.RunView` is:

```typescript
const usingKeyset = !!params.AfterKey;
if (usingKeyset) {
    // 1. Validate (single-col PK, orderable type, OrderBy compatibility) — throw if violated
    // 2. Apply seek predicate to whereSQL: `${pk} > @keyValue` (or < for DESC)
    // 3. Force topSQL emission (TOP N for SQL Server, LIMIT N for PG via BuildNonPaginatedLimitSQL)
    // 4. Force ORDER BY pk if no OrderBy specified
    // 5. Skip the existing OFFSET branch
}
```

So we don't actually need `BuildKeysetPaginationSQL` per-provider. The provider methods we already have (`BuildTopClause`, `BuildNonPaginatedLimitSQL`, `BuildParameterPlaceholder`) are sufficient. The keyset logic lives in `GenericDatabaseProvider` and uses existing per-provider primitives.

This simplifies the implementation — no new abstract methods, just a new branch in the shared `RunView` method.

### 4.3 PostgreSQL — same approach

PG already uses `LIMIT N` at the end (via `BuildNonPaginatedLimitSQL`) when not paginating. For keyset, we use that same LIMIT plus a seek predicate in WHERE. No PG-specific changes needed.

### 4.4 SQL injection / parameter safety

The seek key value gets bound as a parameter (using existing `BuildParameterPlaceholder` / parameter array mechanism), not interpolated. Type matches the PK column type. This goes through the same parameter-binding path that `whereSQL` already uses for view parameters.

## 5. Migration

### 5.1 Callers to migrate (priority order)

1. **`packages/Actions/CoreActions/src/custom/geo/scheduled-geocoding.action.ts`** — `loadEntityPage` at line 209-230. Replace `StartRow: offset+1` with `AfterKey: lastSeenKey`. Track the last-seen ID across pages. This is the canonical reference adoption — get it right and document it as the example.

2. **`packages/AI/Vectors/Core/src/models/VectorBase.ts:68`** (`PageRecordsByEntityID`) and **`packages/AI/Vectors/Sync/src/models/entityVectorSync.ts:479`** (the loop in `getData`) — vectorization iterates entire entities via `PageNumber → StartRow`. Migrate the core helper to use `AfterKey` so all vectorization callers benefit.

3. **Classifier / Autotag (Content Autotagging)** — the `@memberjunction/actions-content-autotag` action surfaces in the UI as "Classifier". The orchestrator action (`content-autotag-and-vectorize.action.ts`) doesn't paginate itself, but it triggers vectorization tasks that flow through #2. **Migrating #2 fixes the classifier's deep-page cost indirectly.** No direct changes needed in the autotag package — but verify by running a classifier task end-to-end after the vectorization migration.

4. **`packages/ExternalChangeDetection/src/ChangeDetector.ts:292`** — verify the iteration pattern (StartRow grows per page?). If yes, migrate.

5. **(Audit during implementation)** — grep for any other places that pass non-zero `StartRow` to RunView in non-UI contexts. UI grid pagination via `packages/Angular/Generic/pagination/` stays on `StartRow` (small page numbers, no real benefit from keyset, plus arbitrary OrderBy is needed).

6. **Audit AI/Vectors/Dupe, Archive Runs, any custom user actions** — confirm whether they iterate large tables.

### 5.2 What does NOT migrate

- UI grid pagination (`Angular/Generic/pagination`, `entity-viewer`, dialog selectors with shallow paging) — they use arbitrary `OrderBy` and shallow page numbers, exactly where OFFSET is fine.
- GraphQL `GetQueryData` resolver — query results, not view rows. Separate code path.
- Anything with `StartRow: 0` — already first-page, no migration needed.

## 6. Tests

### 6.1 Unit tests (vitest)

- `packages/GenericDatabaseProvider/src/__tests__/keyset-pagination.test.ts` (new) — covers SQL emission:
  - Single-col PK + ASC: emits `WHERE pk > @key ORDER BY pk`
  - Single-col PK + DESC: emits `WHERE pk < @key ORDER BY pk DESC`
  - Throws `AfterKeyNotSupportedError` on composite PK
  - Throws on unsupported PK type
  - Throws when OrderBy references non-PK columns
  - Throws when AfterKey + StartRow both set
  - First-page case: AfterKey omitted → standard TOP/LIMIT N
- `packages/SQLServerDataProvider/src/__tests__/keyset.test.ts` — verifies SQL Server-specific TOP N + ORDER BY + WHERE assembly
- `packages/PostgreSQLDataProvider/src/__tests__/keyset.test.ts` — verifies PG LIMIT N + ORDER BY + WHERE assembly

### 6.2 Integration tests

- Live against the workbench SQL Server: iterate a real entity (e.g. `MJ: Audit Logs`) in keyset pages, verify all rows returned exactly once, no duplicates, no gaps.
- Run against PostgreSQL (Docker workbench) — same assertions.
- Regression: existing OFFSET-based pagination still works for callers that didn't migrate.

### 6.3 Caller regression tests

- Migrated callers (geocoding, change detector, vectorization) get integration tests that walk a seeded dataset and assert all rows visited exactly once.

## 7. Documentation

- New: `/guides/KEYSET_PAGINATION_GUIDE.md` — when to use, when not to, API examples, common pitfalls (using non-PK OrderBy, composite PK entities, tracking last-seen key across pages).
- Update: `RunViewParams` JSDoc with the new field + cross-link to the guide.
- Update: `/CLAUDE.md` performance section — add a "Use AfterKey for large iteration" note alongside the existing `RunViews` (batch) guidance.
- Update: package `README.md` for `@memberjunction/core` to mention the addition.
- Update: scheduled-geocoding action's docstring to point at the keyset pattern.

## 8. Open questions — resolved

### 8.1 Cache interaction — **resolved: AfterKey bypasses cache; rely on existing `AllowCaching` gate**

Three relevant facts:

1. **`LocalCacheManager` already gates writes by `EntityInfo.AllowCaching`** ([line 1229](../packages/MJCore/src/generic/localCacheManager.ts#L1229)). Entities with `AllowCaching=false` (the default for most entities, including the large iteration tables this plan targets) **never get written to the cache at all** — the short-circuit fires before fingerprinting matters.

2. **The audit raised in this plan applies only to `AllowCaching=true` entities**, which are deliberately limited to metadata-shaped tables (small, frequently-read reference data). Those entities aren't the ones callers iterate with `AfterKey`.

3. **`AfterKey` queries are single-use by design**: each call uses a different seek key, so a cached entry would never be reusable. Caching them is pure overhead.

**Decision: When `AfterKey` is present, RunView treats the query as if `BypassCache: true` were set** — skips both cache read and cache write, regardless of `AllowCaching`. This is the cleanest semantic and doesn't require touching the fingerprint logic at all. The recent cache hardening PR (`4ea20fb737`, see §8.4) is unaffected — its `schemaHash`, timestamp precision, and remote-index fixes all sit on the cache write/read path that AfterKey skips entirely.

Verify during implementation: for the actual entities we plan to migrate (TaxReturn, TaxReturnContractor, Contact, vectorization source entities, etc.), confirm `AllowCaching=false` so even the bypass is theoretically redundant. If any have `AllowCaching=true`, the bypass still saves us from polluting their metadata cache with one-shot iteration reads.

### 8.2 Cursor end-of-data signal

Currently `RunView` returns `Results.length < MaxRows` as the natural "no more pages" signal. With keyset that still works: when a page returns fewer rows than `MaxRows`, the caller knows to stop. **Document this contract clearly in the keyset guide.**

### 8.3 GraphQL `CompositeKey` scalar shape

`CompositeKey` already round-trips through GraphQL today for entity loads/deletes. We need to verify the existing input shape works for a `RunViewsParams.AfterKey` field on `RunViewsWithCacheCheckQuery`/`RunViewsQuery`. If the existing input types don't accept it directly, add a `KeyValuePair[]` input type field to the GraphQL schema. **Action: confirm during implementation by reading `packages/MJServer/src/resolvers/RunViewResolver.ts` and the corresponding input types.**

### 8.4 Compatibility with recent cache hardening PR (`4ea20fb737`)

Reviewed the PR (`fix(mjcore): cache architecture fixes from audit`, merged via `next`). Its scope:

- **Schema upgrade detection** — adds `schemaHash` to `CachedRunViewData` so a cache entry is invalidated when the entity's column set changes
- **Empty-result timestamp fix** — `extractMaxUpdatedAt` returns `''` for empty results instead of "now"
- **Timestamp precision** — `isCacheCurrent` uses millisecond comparison with 1-second tolerance
- **Remote fingerprint index** — `resolveFingerprintsForEntity` populates the local entity index after Redis scans
- **Null PK handling** — `UpsertSingleEntity`/`RemoveSingleEntity` skip null-PK rows

**No conflict** with keyset pagination — these changes harden the cache read/write path. Our decision to bypass that path entirely for `AfterKey` (per §8.1) means we don't intersect with any of these fixes. Confirm during implementation that the bypass branches above the schemaHash + isCacheCurrent gates so we don't accidentally trigger their stale-detection logic with unrelated query shapes.

## 9. Execution order

1. **DONE** — Geocoding cron metadata: Saturdays 2 AM UTC.
2. **Audit** — Confirm all caller locations to migrate (grep + read each context). Expand caller list in §5.1 if needed.
3. **Implementation** —
   - Add `AfterKey` to `RunViewParams` + `AfterKeyNotSupportedError`
   - Implement validation + SQL assembly in `GenericDatabaseProvider.RunView`
   - Update SQL Server + PostgreSQL providers (likely no per-provider changes needed — see §4.2)
   - Implement cache bypass for `AfterKey` queries in `LocalCacheManager` (per §8.1 — no fingerprint changes needed)
   - Extend GraphQL input types + `GraphQLDataProvider` client to forward `AfterKey`
4. **Tests** — Unit + integration per §6.
5. **Migrate** — Geocoding first (reference adoption), then change detection, then vectorization, then remainder.
6. **Docs** — Guide + JSDoc + README + CLAUDE.md updates per §7.
7. **Changeset** — Add a `.changeset/` entry describing the new API and (no) breaking changes. Verify nothing in `RunViewParams` becomes required.

## 10. Risks & non-risks

- **Risk: misuse of `OrderBy` invalidating seek** — mitigated by runtime validation throwing early. Documented.
- **Risk: GraphQL serialization edge case for `CompositeKey`** — mitigated by reusing the existing `CompositeKey` GQL shape used for `LoadEntity` etc.
- **Risk: server cache pollution** — mitigated by bypassing cache writes for AfterKey queries (per §8.1).
- **Non-risk: existing UI pagination** — untouched, no behavior change.
- **Non-risk: backward compatibility** — `AfterKey` is purely additive; absence preserves current behavior.

## 11. Acceptance criteria

- [x] Geocoding scheduled job runs weekly (Saturdays 2 AM UTC) per the metadata change
- [ ] `RunViewParams.AfterKey: CompositeKey` accepted by the framework
- [ ] Composite-PK / unsupported-type entities throw `AfterKeyNotSupportedError` with a clear message
- [ ] SQL Server + PostgreSQL both emit keyset-style SQL when `AfterKey` is present
- [ ] `AfterKey` queries bypass cache read AND write (verified by inspecting `LocalCacheManager` behavior in unit test)
- [ ] `ScheduledGeocodingAction.loadEntityPage` migrated and verified to iterate a million-row entity without OFFSET cost growth
- [ ] `VectorBase.PageRecordsByEntityID` (and `entityVectorSync`) migrated; classifier task verified end-to-end after migration
- [ ] At least one full integration test walks a seeded dataset end-to-end in keyset pages on SQL Server AND PostgreSQL
- [ ] Guide + JSDoc + CLAUDE.md updated
- [ ] All affected packages build green; all tests pass
- [ ] Changeset committed
