# Single-Query Conversation Loading Implementation

**Date:** 2025-01-19
**Status:** Ready for Testing
**Performance Goal:** ~70% reduction in conversation loading time

---

## Summary

Implemented a single-query optimization for loading conversation data using SQL Server's `FOR JSON PATH` feature to aggregate related data (agent runs and artifacts) as JSON columns. This eliminates 3 database round trips, reducing the peripheral data loading from 4 queries to 1 query.

---

## Files Created

### 1. SQL Query Definition
**File:** `metadata/queries/SQL/get-conversation-complete.sql`

- Single optimized query that returns all conversation details with JSON-aggregated related data
- Uses `FOR JSON PATH` subqueries to include:
  - Agent runs array (0-1 per conversation detail)
  - Artifacts array (0-N per conversation detail)
- Excludes heavy `Content` field from artifacts for performance
- Returns all fields needed for display without additional queries

**Key Features:**
- Correlated subqueries for JSON aggregation
- Filters artifacts to only `Direction = 'Output'`
- Properly ordered results for consistent display

### 2. Query Metadata
**File:** `metadata/queries/.get-conversation-complete.json`

- Registers the query in MemberJunction's query system
- Category: `Conversations`
- Query Name: `GetConversationComplete`
- Status: `Approved`
- Quality Rank: 9 (high quality)
- Execution Cost Rank: 2 (low cost)

### 3. TypeScript Type Definitions
**File:** `packages/Angular/Generic/Conversations/src/lib/models/conversation-complete-query.model.ts`

**Exports:**
- `AgentRunJSON` - Type for agent run data in JSON format
- `ArtifactJSON` - Type for artifact data in JSON format
- `ConversationDetailComplete` - Raw query result type (extends `ConversationDetailEntityType`)
- `ConversationDetailParsed` - Parsed result with typed arrays
- `parseConversationDetailComplete()` - Helper function for JSON parsing

**Usage Pattern:**
```typescript
// Query returns ConversationDetailComplete with JSON strings
const result = await rq.RunQuery({...});

// Parse JSON columns into typed arrays
const parsed = parseConversationDetailComplete(result.Results[0]);

// Access typed data
parsed.agentRuns  // AgentRunJSON[]
parsed.artifacts  // ArtifactJSON[]
```

---

## Files Modified

### 1. Public API Exports
**File:** `packages/Angular/Generic/Conversations/src/public-api.ts`

**Changes:**
- Added export for `conversation-complete-query.model.ts`
- Makes new types available to consuming packages

### 2. Conversation Chat Area Component
**File:** `packages/Angular/Generic/Conversations/src/lib/components/conversation/conversation-chat-area.component.ts`

**Changes:**

#### Imports Added:
```typescript
import { ConversationDetailComplete, parseConversationDetailComplete, AgentRunJSON }
  from '../../models/conversation-complete-query.model';
```

#### Method Completely Rewritten: `loadPeripheralData()`

**OLD Approach (4 queries):**
1. RunView for agent runs
2. RunQuery for artifact map
3. RunView batch for artifacts
4. RunView batch for artifact versions

**NEW Approach (1 query):**
1. RunQuery for `GetConversationComplete` with all data

**Implementation Details:**
- Single `RunQuery` call replaces all previous queries
- Results come with JSON-aggregated agent runs and artifacts
- Parse JSON columns using `parseConversationDetailComplete()`
- Convert JSON data to BaseEntity objects:
  - Agent runs: Create `AIAgentRunEntityExtended` via `LoadFromData()`
  - Artifacts: Create `LazyArtifactInfo` with display data (lazy-load full entities on click)
- Date string conversion for `__mj_CreatedAt` and `__mj_UpdatedAt` fields
- Proper Map reference replacement for Angular change detection

**Performance Tracking:**
- Added console logs showing "SINGLE OPTIMIZED QUERY" execution
- Logs summary of loaded data (agent runs count, artifact mappings count)
- Error handling sets `lastLoadedConversationId = null` on failure for retry

---

## Data Flow

### Phase 1: Messages (Unchanged)
```
User clicks conversation
  ↓
loadMessages() called
  ↓
dataCache.loadConversationDetails()
  ↓
RunView: Conversation Details
  ↓
Messages displayed immediately (fast!)
```

### Phase 2: Peripheral Data (NEW - Single Query)
```
loadPeripheralData() called
  ↓
RunQuery: GetConversationComplete
  ↓
SQL returns rows with JSON columns:
  - ConversationDetail fields
  - AgentRunsJSON (string)
  - ArtifactsJSON (string)
  ↓
Parse JSON columns
  ↓
Create BaseEntity objects:
  - Agent runs → AIAgentRunEntityExtended.LoadFromData()
  - Artifacts → LazyArtifactInfo (display data only)
  ↓
Populate Maps:
  - agentRunsByDetailId
  - artifactsByDetailId
  ↓
Trigger change detection
  ↓
UI updates with agent/artifact data
```

---

## SQL Server JSON Functions Used

### FOR JSON PATH
Converts query results to JSON array format. Used in subqueries to aggregate related data:

```sql
(
    SELECT ar.ID, ar.Status, ar.TotalCost
    FROM vwAIAgentRuns ar
    WHERE ar.ConversationDetailID = cd.ID
    FOR JSON PATH
) as AgentRunsJSON
```

**Returns:** `"[{\"ID\":\"...\",\"Status\":\"Complete\",\"TotalCost\":0.05}]"` or `NULL`

### Benefits:
- ✅ Server-side aggregation (faster than client-side joins)
- ✅ Single database round trip
- ✅ No row multiplication from JOINs
- ✅ Null-safe (returns NULL if no rows)

---

## Type Safety Approach

### Problem: RunQuery Returns Plain Objects
`RunQuery` returns `RunQueryResult.Results` which is an array of plain objects, not `BaseEntity` instances.

### Solution: Layered Type Definitions

**Layer 1: Raw Query Result**
```typescript
type ConversationDetailComplete = ConversationDetailEntityType & {
  AgentRunsJSON: string | null;
  ArtifactsJSON: string | null;
};
```
- Uses the Zod-inferred type from `ConversationDetailSchema`
- Adds JSON string fields
- No BaseEntity overhead

**Layer 2: Parsed Result**
```typescript
interface ConversationDetailParsed extends ConversationDetailEntityType {
  agentRuns: AgentRunJSON[];
  artifacts: ArtifactJSON[];
}
```
- JSON parsed into typed arrays
- Still plain objects (no BaseEntity)

**Layer 3: BaseEntity Reconstruction**
```typescript
// In component code
const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', currentUser);
agentRun.LoadFromData(agentRunData);
```
- Create actual BaseEntity instances when needed
- Only for data that needs entity behavior (Save, validation, etc.)
- Artifacts stay as LazyArtifactInfo (no need for full entities until clicked)

---

## Performance Expectations

### Before (4 queries):
- **Query 1:** Load agent runs - ~50-100ms
- **Query 2:** Load artifact map - ~50-100ms
- **Query 3:** Batch load artifacts - ~50-100ms
- **Query 4:** Batch load artifact versions - ~50-100ms
- **Network latency:** 4 round trips × ~20ms = ~80ms
- **Total:** ~280-480ms

### After (1 query):
- **Query 1:** Load everything with JSON - ~100-200ms
- **Network latency:** 1 round trip × ~20ms = ~20ms
- **JSON parsing:** ~10-20ms (client-side)
- **Total:** ~130-240ms

**Expected improvement:** ~50-70% faster

### Trade-offs:
- ✅ **Network:** 4 round trips → 1 round trip
- ✅ **Queries:** 4 database queries → 1 database query
- ❌ **SQL Complexity:** Correlated subqueries (slightly more expensive per row)
- ❌ **Client Processing:** JSON parsing overhead (~10-20ms)

**Net Result:** Faster overall due to eliminated network latency

---

## Testing Checklist

### Backend Testing (SQL)

1. **Test Query Execution**
   ```sql
   -- Run query directly in SSMS
   DECLARE @ConversationID uniqueidentifier = '<test-conversation-id>';
   -- Paste query from get-conversation-complete.sql
   ```

2. **Verify JSON Format**
   - Check `AgentRunsJSON` is valid JSON array or NULL
   - Check `ArtifactsJSON` is valid JSON array or NULL
   - Verify NULL is returned when no related data exists

3. **Performance Testing**
   - Run with STATISTICS IO, STATISTICS TIME
   - Compare execution time vs old 4-query approach
   - Test with conversations containing:
     - 0 messages
     - 10 messages
     - 100+ messages (stress test)

### Frontend Testing (Angular)

1. **Compile Check**
   ```bash
   cd packages/Angular/Generic/Conversations
   npm run build
   ```

2. **Runtime Testing**
   - Open conversation with no agent runs or artifacts
   - Open conversation with agent runs
   - Open conversation with artifacts
   - Open conversation with BOTH agent runs and artifacts
   - Check browser console for:
     - "EXECUTING SINGLE OPTIMIZED QUERY" log
     - Successful load confirmation
     - Agent run/artifact counts

3. **UI Verification**
   - Verify agent run gear icon appears correctly
   - Verify artifact cards display correctly
   - Click artifact card → should load full entity on-demand
   - Click gear icon → should show agent run details

4. **Error Handling**
   - Test with invalid conversation ID
   - Test with database connection error
   - Verify `lastLoadedConversationId` is cleared on error for retry

---

## Migration Notes

### Database Changes Required
1. Deploy query files to metadata system:
   - `metadata/queries/SQL/get-conversation-complete.sql`
   - `metadata/queries/.get-conversation-complete.json`

2. Run metadata sync to register query in database:
   ```bash
   npx mj-sync push --dir=./metadata
   ```

### Code Deployment
1. Build and deploy updated packages:
   - `@memberjunction/ng-conversations`

2. No breaking changes - this is a drop-in replacement
3. Old queries (`GetConversationArtifactsMap`) can remain for backwards compatibility

---

## Rollback Plan

If issues occur, simply revert `conversation-chat-area.component.ts` to use the old 4-query approach:

1. Remove imports for `conversation-complete-query.model`
2. Restore previous `loadPeripheralData()` implementation from git history
3. No database changes needed (old queries still exist)

---

## Future Optimizations

### Potential Enhancement 1: Include Messages in Single Query
Currently messages are loaded separately in Phase 1. Could combine with peripheral data for truly single-query loading:
- **Benefit:** Eliminate additional query
- **Trade-off:** No instant message display (everything waits for one big query)
- **Recommendation:** Keep two-phase approach for better UX

### Potential Enhancement 2: Add Caching Layer
SQL Server query results could be cached with short TTL:
- **Benefit:** Instant loads for recently-viewed conversations
- **Trade-off:** Stale data risk, cache invalidation complexity
- **Recommendation:** Implement if conversation re-opening is common pattern

### Potential Enhancement 3: Optimize JSON Parsing
Current approach creates BaseEntity objects in a loop:
- **Benefit:** Batch creation for better performance
- **Trade-off:** More complex code
- **Recommendation:** Profile first - current approach may be fast enough

---

## Summary

This implementation successfully reduces conversation loading from 4 queries to 1 query using SQL Server's JSON aggregation capabilities. The approach maintains type safety through layered type definitions and preserves the existing LazyArtifactInfo pattern for on-demand entity loading.

**Ready for testing!** Test the SQL query first to verify JSON output, then test the Angular component to ensure proper parsing and display.
