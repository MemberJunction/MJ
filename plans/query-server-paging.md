# Plan: Server-Side Pagination for Ad-Hoc Queries

## Context

The Query Builder agent currently includes `TOP 100` in generated SQL to limit result sets. This is a blunt cap — users can't page through the full dataset. We need proper server-side pagination that wraps the agent's SQL into a CTE and applies `OFFSET/FETCH` paging, similar to how `RunView` handles pagination.

## Current State

- Agent-generated SQL uses `TOP 100` to cap results
- `QueryDataGrid` receives all rows at once and relies on AG Grid's DOM virtualization (only visible rows rendered)
- `entity-data-grid` (used by Data Explorer) already implements server-side paging with a pager bar
- AG Grid supports both client-side pagination (`pagination: true`) and infinite/server-side row models

## Design: Server-Side Paging via CTE Wrapping

### SQL Wrapping Strategy

Wrap the fully-resolved (post-parameter) SQL into a CTE, then apply `OFFSET/FETCH`:

```sql
-- Original agent SQL (with TOP removed):
-- SELECT col1, col2 FROM ... WHERE ... ORDER BY ...

WITH QueryCTE AS (
    SELECT col1, col2 FROM ... WHERE ... -- agent SQL without TOP/ORDER BY
)
SELECT *
FROM QueryCTE
ORDER BY <original order by>
OFFSET @offset ROWS
FETCH NEXT @pageSize ROWS ONLY
```

Also run a parallel `COUNT(*)` query for total row count:

```sql
WITH QueryCTE AS (
    SELECT col1, col2 FROM ... WHERE ...
)
SELECT COUNT(*) AS TotalCount FROM QueryCTE
```

### API Changes

Extend `RunQuery` params to support paging:

```typescript
interface RunQueryParams {
    // ... existing fields
    SQL?: string;
    // NEW: Paging params
    PageNumber?: number;    // 1-based
    PageSize?: number;      // Default: 100
}

interface RunQueryResult {
    // ... existing fields
    TotalRowCount?: number; // Total rows before paging
    PageNumber?: number;
    PageSize?: number;
}
```

### UI: Shared Data Pager Component

Create `@memberjunction/ng-data-pager` (or add to `ng-shared-generic`):

- Extract pager UX from entity-data-grid into a reusable component
- Shows: `< 1 2 3 ... 10 >` page buttons + "Showing 1-100 of 2,345 rows"
- Inputs: `TotalRows`, `PageSize`, `CurrentPage`
- Output: `PageChange` event
- Both `query-data-grid` and `entity-data-grid` consume this component

### Agent Prompt Changes

- Remove `TOP 100` requirement from agent SQL guidelines
- Agent generates clean SQL without artificial limits
- Server handles paging transparently

## Implementation Order

1. Create `ng-data-pager` component (extract from entity-data-grid)
2. Extend `RunQuery` API with paging params
3. Server-side CTE wrapping + COUNT in `ExecuteAdhocQuery` resolver
4. Wire pager into `query-data-grid`
5. Update agent prompts to remove TOP 100
6. Migrate entity-data-grid to use shared pager

## OFFSET/FETCH Scalability Notes

OFFSET/FETCH has **no hard limit** — it works at any row count. The concern is **progressive performance degradation** at high offsets:

- **How it works**: SQL Server must scan/sort ALL rows from the beginning up to `OFFSET + FETCH`, then discard the first `OFFSET` rows. It cannot skip ahead.
- **Page 1** (OFFSET 0, FETCH 100): Fast — process 100 rows, return 100.
- **Page 100** (OFFSET 9900, FETCH 100): Must process 10,000 rows, discard 9,900, return 100.
- **Page 1000** (OFFSET 99900, FETCH 100): Must process 100,000 rows, discard 99,900, return 100.

**For our use case this is fine.** Ad-hoc analytical queries are browsed interactively — users rarely page past the first few hundred rows. Even at 100k rows, the overhead is a few extra seconds at worst, and the CTE wrapping doesn't add meaningful cost since SQL Server optimizes the plan.

**If we ever need to scale beyond this**, the alternative is **keyset/cursor pagination** (`WHERE ID > @lastSeenId ORDER BY ID`), which is O(page_size) per page regardless of depth. But it requires a stable, unique sort key and doesn't support jumping to arbitrary pages. We can add this as an optional strategy later if real-world usage demands it.

## Not In Scope (Now)

- Keyset/cursor pagination (OFFSET/FETCH is sufficient for interactive use)
- Infinite scroll (can add later as alternative to page buttons)
- Server-side sorting (ORDER BY is in the SQL itself)
