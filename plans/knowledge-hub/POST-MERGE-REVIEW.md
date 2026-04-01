# Knowledge Hub — Post-Merge Review & Improvement Plan

**Reviewed**: 2026-04-01
**PR**: #2212 (merged)
**Scope**: ~32,000 lines across ~709 files, 8 new packages
**Reviewer**: Claude (Opus 4.6)

---

## Executive Summary

The Knowledge Hub PR introduces a unified search infrastructure (vector + full-text + RRF fusion), a vectorization pipeline, an agent client SDK, a knowledge agent, and a rich Angular dashboard. The **Angular UI layer is excellent** — best-in-class adherence to MJ conventions across design tokens, template syntax, change detection, naming, and reactive patterns. The **package architecture is well-designed** with clean dependency layering, proper provider abstractions, and zero `any` types.

However, there are **critical gaps in the server-side integration** that undermine the feature's core value proposition: the KnowledgeAgent never actually calls the UnifiedSearchService it was designed around, there is a case-mismatch bug in search score breakdowns, migrations contain ~2,100 lines of CodeGen output that shouldn't be there, and test coverage across all new packages is ~15-20%.

### Severity Counts

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 5 | Must fix before next release |
| HIGH | 5 | Should fix in current sprint |
| MEDIUM | 6 | Fix in next sprint |
| LOW | 4 | Nice-to-have / tech debt |

---

## Issue Index

| # | Severity | Layer | Title | Package/File |
|---|----------|-------|-------|-------------|
| 1 | CRITICAL | Agent | KnowledgeAgent does not use UnifiedSearchService | `AI/Agents/src/KnowledgeAgent.ts` |
| 2 | CRITICAL | Search | SearchFusion score breakdown case-mismatch bug | `AI/Knowledge/Search/.../SearchFusion.ts` |
| 3 | CRITICAL | DB | Migrations contain ~2,100 lines of CodeGen output | `migrations/v5/V202603301728`, `V202603301800`, `V202603311500` |
| 4 | CRITICAL | Search | SQL injection risk — field names not quoted | `AI/Knowledge/Search/.../FullTextSearchProvider.ts` |
| 5 | CRITICAL | Pipeline | Entity name missing "MJ: " prefix | `AI/Knowledge/Pipeline/.../KnowledgePipeline.ts` |
| 6 | HIGH | Client | No reconnection logic in WebSocketTransport | `AI/AgentsClient/.../WebSocketTransport.ts` |
| 7 | HIGH | Client | Memory leaks — no handler unregistration | `AI/AgentsClient/.../AgentClientSession.ts` |
| 8 | HIGH | Pipeline | No error recovery, retry, or resume capability | `AI/Knowledge/Pipeline/.../KnowledgePipeline.ts` |
| 9 | HIGH | Search | N+1 query pattern in full-text search | `AI/Knowledge/Search/.../FullTextSearchProvider.ts` |
| 10 | HIGH | All | Test coverage critically low (~15-20%) | All new packages |
| 11 | MEDIUM | Search | FusionMethod parameter ignored (weighted dead code) | `AI/Knowledge/Search/.../UnifiedSearchService.ts` |
| 12 | MEDIUM | Pipeline | Pipeline methods exceed 40-line decomposition guideline | `AI/Knowledge/Pipeline/.../KnowledgePipeline.ts` |
| 13 | MEDIUM | Pipeline | Progress reporting is misleading / inaccurate | `AI/Knowledge/Pipeline/.../KnowledgePipeline.ts` |
| 14 | MEDIUM | Multi | Missing parameter validation across packages | Multiple files |
| 15 | MEDIUM | Search | FTS ignores native database relevance scores | `AI/Knowledge/Search/.../FullTextSearchProvider.ts` |
| 16 | MEDIUM | Search | Silent search failures — caller unaware of partial errors | `AI/Knowledge/Search/.../FullTextSearchProvider.ts` |
| 17 | LOW | Agent | `Record<string, unknown>` overuse in KnowledgeAgent | `AI/Agents/src/KnowledgeAgent.ts` |
| 18 | LOW | DB | VectorIndex.Metric lacks CHECK constraint | `migrations/v5/V202603301800` |
| 19 | LOW | Angular | SearchOverlay uses global `@HostListener` | `Angular/Generic/search/.../search-overlay.component.ts` |
| 20 | LOW | Client | AgentClientSession double-cast loses type safety | `AI/AgentsClient/.../AgentClientSession.ts` |

---

## CRITICAL Issues (Must Fix Before Next Release)

### Issue 1: KnowledgeAgent Does Not Use UnifiedSearchService

**File**: `packages/AI/Agents/src/KnowledgeAgent.ts`, lines 229-332
**Layer**: Agent / Search integration

#### Problem

The KnowledgeAgent's `executeSearchKnowledge()` method implements a custom LIKE-based search using `RunView` instead of delegating to the `UnifiedSearchService` that was built as part of this same PR. The tool description at line 79 promises *"unified vector + full-text search with RRF fusion"*, but the implementation only does:

```typescript
// Current: basic SQL LIKE — no semantic search, no RRF
const safeQuery = query.replace(/'/g, "''");
filter = `[Name] LIKE '%${safeQuery}%'`;
```

This means:
- **No vector/semantic search** — defeats the core Knowledge Hub value proposition
- **No RRF fusion** — the SearchFusion class is never invoked
- **No full-text search** — SQL Server FREETEXT / PostgreSQL tsvector unused
- **Duplicate logic** — reinvents search instead of using the service

Additionally, the agent class **lacks a `@RegisterClass` decorator** (compare to `QueryBuilderAgent` which has one), so it may not be discoverable by the MJ agent framework.

#### Recommended Fix

```typescript
// Replace lines 229-291 with:
import { UnifiedSearchService, UnifiedSearchConfig } from '@memberjunction/ai-knowledge-search';

private async executeSearchKnowledge(
    parameters: Record<string, unknown>,
    contextUser: UserInfo
): Promise<ToolResult> {
    const query = String(parameters['query'] || '');
    if (!query.trim()) {
        return { Success: false, ErrorMessage: 'Query parameter is required' };
    }

    const config: UnifiedSearchConfig = {
        VectorSearch: { Enabled: true },
        FullTextSearch: { Enabled: true },
        FusionMethod: 'rrf'
    };
    const service = new UnifiedSearchService(config);
    const response = await service.Search({
        Query: query,
        MaxResults: Number(parameters['maxResults']) || 20,
        EntityFilter: parameters['entityFilter'] as string[] | undefined,
    }, contextUser);

    return {
        Success: response.Success,
        Data: { Results: response.Results, TotalCount: response.TotalCount },
        ErrorMessage: response.ErrorMessage
    };
}
```

Also add `@RegisterClass(BaseAgent, 'KnowledgeAgent')` to the class declaration.

#### Effort: Medium (1-2 hours)

---

### Issue 2: SearchFusion Score Breakdown Case-Mismatch Bug

**File**: `packages/AI/Knowledge/Search/src/generic/SearchFusion.ts`, lines 71-106
**Layer**: Search engine

#### Problem

The `Fuse()` method builds the `breakdown` object with **lowercase** keys matching `SearchSourceType` (`'vector'`, `'fulltext'`, `'entity'`):

```typescript
// Line 71-75: lowercase keys
const breakdown: Record<string, number | undefined> = {
    vector: undefined,
    fulltext: undefined,
    entity: undefined,
};
breakdown[list.Source] = candidate.Score;  // e.g., breakdown['vector'] = 0.85
```

But the `ScoreBreakdown` interface in `SearchTypes.ts` (lines 75-79) expects **PascalCase** properties:

```typescript
interface ScoreBreakdown {
    Vector?: number;
    FullText?: number;
    Entity?: number;
}
```

When results are mapped at lines 103-106:
```typescript
ScoreBreakdown: {
    Vector: entry.Breakdown['Vector'],    // undefined — key is actually 'vector'
    FullText: entry.Breakdown['FullText'],  // undefined — key is actually 'fulltext'
    Entity: entry.Breakdown['Entity'],    // undefined — key is actually 'entity'
}
```

**Impact**: Score breakdowns in every search result are **always undefined**. Any UI component showing per-source relevance (e.g., "78% vector, 22% full-text") will show nothing.

#### Recommended Fix

Normalize the breakdown keys to PascalCase at lines 71-75:

```typescript
const breakdown: Record<string, number | undefined> = {
    Vector: undefined,
    FullText: undefined,
    Entity: undefined,
};
// And normalize the source key when assigning:
const sourceKey = this.normalizeToPascal(list.Source);
breakdown[sourceKey] = candidate.Score;
```

Or simpler — change lines 71-75 to build from the source directly:

```typescript
breakdown[list.Source === 'vector' ? 'Vector' 
    : list.Source === 'fulltext' ? 'FullText' 
    : 'Entity'] = candidate.Score;
```

#### Effort: Small (15 minutes + test)

---

### Issue 3: Migrations Contain ~2,100 Lines of CodeGen Output

**Files**:
- `migrations/v5/V202603301728__v5.22.x__Add_VectorIndexID_To_EntityDocument.sql` (861 lines, should be ~25)
- `migrations/v5/V202603301800__v5.22.x__Add_VectorIndex_Metadata_Columns.sql` (856 lines, should be ~50)
- `migrations/v5/V202603311500__v5.22.x__Add_Configuration_Columns.sql` (1,170 lines, should be ~40)

**Layer**: Database

#### Problem

All three migrations include content that CLAUDE.md explicitly states **CodeGen handles automatically**:

| Content Type | Lines | Should Be In Migration? |
|-------------|-------|------------------------|
| `ALTER TABLE` + FK constraints | ~80 | Yes |
| `sp_addextendedproperty` | ~40 | Yes |
| `CREATE VIEW` / `DROP VIEW` | ~200 | No — CodeGen |
| `CREATE PROCEDURE` / `DROP PROCEDURE` | ~600 | No — CodeGen |
| `INSERT INTO EntityField` | ~300 | No — CodeGen |
| `INSERT INTO EntityRelationship` | ~30 | No — CodeGen |
| `UPDATE EntityField` (properties) | ~400 | No — CodeGen |
| `CREATE INDEX IDX_AUTO_MJ_FKEY_*` | ~100 | No — CodeGen |
| `INSERT INTO EntitySetting` | ~50 | No — CodeGen |
| `__mj_CreatedAt/UpdatedAt` in INSERTs | ~10 instances | No — auto-populated |

**Total**: ~2,880 lines of which ~2,100 are CodeGen's responsibility, inflating 3 simple DDL changes by **36x**.

#### Impact

- CodeGen will **regenerate all of this** when it runs, potentially creating conflicts
- Makes migration files **unreadable** — the actual schema change is buried
- Violates separation of concerns between migrations (DDL) and CodeGen (metadata)

#### Recommended Fix

Since the migrations are already merged and applied, the pragmatic fix is:
1. **Document the violation** — add a comment at the top of each file noting the CodeGen content should not be replicated in future migrations
2. **For future migrations** — enforce the rule that migrations contain ONLY: `ALTER TABLE`, `CREATE TABLE`, FK constraints, and `sp_addextendedproperty`
3. **Consider a linting step** in CI that flags `CREATE VIEW`, `CREATE PROCEDURE`, `INSERT INTO EntityField`, etc. in migration files

#### Effort: Small (documentation only — not worth rewriting merged migrations)

---

### Issue 4: SQL Injection Risk — Field Names Not Quoted

**File**: `packages/AI/Knowledge/Search/src/generic/FullTextSearchProvider.ts`, lines 155-167
**Layer**: Search engine / Security

#### Problem

`buildSqlServerFilter()` and `buildPostgresFilter()` interpolate field names directly into SQL without identifier quoting:

```typescript
// Line 155-158: SQL Server — fields unquoted
private buildSqlServerFilter(fields: string[], query: string): string {
    const fieldList = fields.join(', ');  // No [brackets]
    return `FREETEXT((${fieldList}), '${sanitizedQuery}')`;
}

// Line 163-167: PostgreSQL — fields unquoted
private buildPostgresFilter(fields: string[], query: string): string {
    const tsvectorExpr = fields
        .map(f => `COALESCE(${f}, '')`)  // No "double quotes"
        .join(" || ' ' || ");
    return `to_tsvector('english', ${tsvectorExpr}) @@ plainto_tsquery(...)`;
}
```

While field names come from internal config (not user input), this violates defense-in-depth. A field name containing a SQL keyword or special character would break the query or worse.

#### Recommended Fix

```typescript
// SQL Server: wrap in brackets
const fieldList = fields.map(f => `[${f}]`).join(', ');

// PostgreSQL: wrap in double quotes
const tsvectorExpr = fields.map(f => `COALESCE("${f}", '')`).join(" || ' ' || ");
```

Additionally, the query sanitization at line 143 (`query.replace(/'/g, "''")`) is minimal. Consider adding a **field name whitelist** validation against entity metadata before interpolation.

#### Effort: Small (30 minutes)

---

### Issue 5: Entity Name Missing "MJ: " Prefix

**File**: `packages/AI/Knowledge/Pipeline/src/generic/KnowledgePipeline.ts`, line 119
**Layer**: Pipeline / Data access

#### Problem

```typescript
const contentItems = await rv.RunView<Record<string, unknown>>({
    EntityName: 'Content Items',  // Missing "MJ: " prefix
    ExtraFilter: `ContentSourceID='${params.ContentSourceID}'`,
    ResultType: 'simple',
    Fields: ['ID', 'Name', 'ContentSourceID'],
}, contextUser);
```

Per CLAUDE.md, newer MJ entities use the `"MJ: "` prefix to prevent naming collisions. Using the unprefixed name will fail at runtime on systems following the prefix convention.

#### Recommended Fix

```typescript
EntityName: 'MJ: Content Items',
```

Verify the correct entity name in `packages/MJCoreEntities/src/generated/entity_subclasses.ts` and update accordingly.

#### Effort: Trivial (5 minutes)

---

## HIGH Priority Issues (Current Sprint)

### Issue 6: No Reconnection Logic in WebSocketTransport

**File**: `packages/AI/AgentsClient/src/generic/WebSocketTransport.ts`
**Layer**: Agent Client SDK

#### Problem

The `WebSocketTransport` accepts `TransportOptions` with a `Reconnect` configuration (defined in `AgentClientTypes.ts`, lines 145-152) including `MaxAttempts`, `DelayMs`, and `BackoffMultiplier`. However, **none of this config is used**. The implementation:

- **No auto-reconnect**: `OnClose` handler (line 61-66) marks `_isConnected = false` and calls the disconnect callback, but never attempts reconnection
- **No heartbeat/ping-pong**: WebSocket connections can silently die; no keep-alive mechanism detects this
- **Hard failure on send**: If the WebSocket closes between session creation and message send, `Send()` at line 87 throws immediately with no retry
- **No exponential backoff**: The `DelayMs` and `BackoffMultiplier` from `TransportOptions` are declared but never read

#### Recommended Fix

Implement a reconnection state machine:

```typescript
private async attemptReconnect(): Promise<void> {
    const { MaxAttempts = 5, DelayMs = 1000, BackoffMultiplier = 2 } = this.options.Reconnect ?? {};
    
    for (let attempt = 1; attempt <= MaxAttempts; attempt++) {
        const delay = DelayMs * Math.pow(BackoffMultiplier, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            await this.Connect();
            return; // Success
        } catch {
            if (attempt === MaxAttempts) {
                this.errorHandler?.(`Reconnection failed after ${MaxAttempts} attempts`);
            }
        }
    }
}
```

Add a heartbeat interval (ping every 30s) to detect silent disconnects.

#### Effort: Medium (2-3 hours)

---

### Issue 7: Memory Leaks — No Handler Unregistration

**File**: `packages/AI/AgentsClient/src/generic/AgentClientSession.ts`, lines 119-136
**Layer**: Agent Client SDK

#### Problem

Handler arrays (`messageHandlers`, `toolRequestHandlers`, `progressHandlers`, `errorHandlers`) only support `push()` via the `On*()` methods. There are **no `Off*()` methods** to unregister handlers:

```typescript
// Lines 119-136: Only pushes, never removes
public OnAgentMessage(handler: (msg: AgentMessage) => void): void {
    this.messageHandlers.push(handler);
}
public OnToolRequest(handler: (req: ToolRequest) => void): void {
    this.toolRequestHandlers.push(handler);
}
// ... same for OnProgress, OnError
```

**Impact**:
- If a client registers handlers in a loop or reuses sessions, handlers **accumulate without bound**
- Transport handler closures (lines 142-158) hold references to the session via closure, preventing GC if the session is discarded but the transport lives on
- WebSocket event listeners assigned in `Connect()` (lines 42-66) are not explicitly removed in `Disconnect()` — the `ws` object is set to null but listeners aren't cleaned up

#### Recommended Fix

Return unsubscribe functions from `On*()` methods:

```typescript
public OnAgentMessage(handler: (msg: AgentMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
        const idx = this.messageHandlers.indexOf(handler);
        if (idx >= 0) this.messageHandlers.splice(idx, 1);
    };
}
```

Add a `Dispose()` method that clears all handlers and disconnects the transport:

```typescript
public Dispose(): void {
    this.messageHandlers.length = 0;
    this.toolRequestHandlers.length = 0;
    this.progressHandlers.length = 0;
    this.errorHandlers.length = 0;
    this.transport.Disconnect();
}
```

#### Effort: Small (1 hour)

---

### Issue 8: No Error Recovery, Retry, or Resume in Pipeline

**File**: `packages/AI/Knowledge/Pipeline/src/generic/KnowledgePipeline.ts`
**Layer**: Pipeline

#### Problem

`ProcessEntity()` (lines 48-97), `ProcessContentSource()` (lines 103-197), and `ProcessSingleRecord()` (lines 202-247) all catch errors at the top level but have:

- **No retry logic**: External calls to `EntityVectorSyncer` and `RunView` lack retry mechanisms for transient failures (network timeouts, database deadlocks)
- **No checkpointing**: A failure halfway through vectorizing 10,000 records loses all progress — the entire batch must restart
- **No resume capability**: No state is saved that would allow a pipeline run to pick up where it left off
- **No per-item error tracking**: If 5 out of 100 items fail, the only output is a generic error message — no indication of which specific records failed
- **No dead-letter queue**: Failed records are not collected for later retry or manual inspection

Additionally, `ProcessContentSource()` at line 137 loads ALL content items into memory via `RunView` with no pagination, which could cause OOM on large content sources.

#### Recommended Fix

1. **Add retry with backoff** for transient failures:
   ```typescript
   private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
       for (let attempt = 1; attempt <= maxRetries; attempt++) {
           try { return await fn(); }
           catch (error) {
               if (attempt === maxRetries) throw error;
               await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
           }
       }
       throw new Error('Unreachable');
   }
   ```

2. **Track per-item results** in `PipelineResult`:
   ```typescript
   interface PipelineItemResult {
       RecordID: string;
       Success: boolean;
       ErrorMessage?: string;
   }
   ```

3. **Paginate content item loading** instead of loading all at once

4. **Emit progress per item**, not just at start/end

#### Effort: Large (4-6 hours)

---

### Issue 9: N+1 Query Pattern in Full-Text Search

**File**: `packages/AI/Knowledge/Search/src/generic/FullTextSearchProvider.ts`, lines 72-76
**Layer**: Search engine / Performance

#### Problem

Each searchable entity gets its own separate `RunView` call:

```typescript
// Lines 72-76: One RunView per entity — N+1 pattern
const searchPromises = entitiesToSearch.map(entity =>
    this.searchEntity(rv, entity, query, contextUser)
);
const results = await Promise.all(searchPromises);
```

If 10 entities are indexed for full-text search, this fires **10 separate database queries**. Per MJ best practices (CLAUDE.md), this should use `RunViews` (plural) to batch all queries into a single round-trip.

Additionally, at line 79:
```typescript
for (const entityCandidates of results) {
    allCandidates.push(...entityCandidates);  // Spread per iteration
}
```
Should use `results.flat()` for cleaner, more efficient flattening.

#### Recommended Fix

```typescript
// Batch all entity searches into a single RunViews call
const viewParams = entitiesToSearch.map(entity => ({
    EntityName: entity.EntityName,
    ExtraFilter: this.buildFilter(entity.IndexedFields, query),
    ResultType: 'simple' as const,
    Fields: ['ID', ...entity.IndexedFields],
    MaxRows: maxResultsPerEntity,
}));

const batchResults = await rv.RunViews(viewParams, contextUser);
const allCandidates = batchResults.flat();
```

#### Effort: Small (1 hour)

---

### Issue 10: Test Coverage Critically Low (~15-20%)

**Layer**: All new packages
**Files**: `src/__tests__/` directories in Search, Pipeline, AgentsClient

#### Problem

All new packages have **only type-shape tests** — tests that verify interface structures compile but never exercise actual behavior. This table shows the gap:

| Package | Test File(s) | What's Tested | What's NOT Tested |
|---------|-------------|---------------|-------------------|
| **Knowledge/Search** | `search-types.test.ts` | Type shapes | `UnifiedSearchService.Search()`, `SearchFusion.Fuse()` (the case-mismatch bug!), all providers, error paths, SQL generation |
| **Knowledge/Pipeline** | `pipeline-types.test.ts` | Type shapes | `ProcessEntity()`, `ProcessContentSource()`, progress callbacks, error recovery, vectorization |
| **AgentsClient** | `client-tool-registry.test.ts` | Register/Execute basics | Timeout handling, `WebSocketTransport` (zero tests), `AgentClientSession` message routing (zero tests), handler lifecycle |

**Impact**: The SearchFusion case-mismatch bug (Issue #2) would have been caught by even a basic behavioral test of `Fuse()`. The missing entity prefix (Issue #5) would have been caught by an integration test.

#### Recommended Test Plan

**Phase 1 — Critical path tests** (catch bugs like Issues #2, #5):
- `SearchFusion.test.ts`: Test `Fuse()` with mock candidates, verify score breakdown keys match interface
- `FullTextSearchProvider.test.ts`: Test SQL generation for both SQL Server and PostgreSQL, test field quoting
- `KnowledgePipeline.test.ts`: Test `ProcessEntity()` with mocked syncer, verify entity names

**Phase 2 — Error path tests**:
- `UnifiedSearchService.test.ts`: Test provider failures, empty results, invalid config
- `AgentClientSession.test.ts`: Test message routing, handler registration/unregistration
- `WebSocketTransport.test.ts`: Test connect/disconnect, send while disconnected

**Phase 3 — Edge cases**:
- Empty queries, special characters in search terms
- Timeout behavior in tool registry
- Progress estimation with 0 items processed
- Large batch sizes

#### Effort: Large (8-12 hours total across phases)

---

## MEDIUM Priority Issues (Next Sprint)

### Issue 11: FusionMethod Parameter Ignored

**File**: `packages/AI/Knowledge/Search/src/generic/UnifiedSearchService.ts`, line 70
**Layer**: Search engine

`UnifiedSearchConfig` accepts a `FusionMethod` property, and `SearchTypes.ts` defines the type as `'rrf' | 'weighted'`. However, the `Search()` method always uses RRF regardless of what's configured — the `weighted` option is dead code with no implementation.

**Fix**: Either implement weighted fusion or remove `'weighted'` from the type union and document that RRF is the only supported method. Dead type members create false expectations for consumers.

#### Effort: Small (30 minutes to remove, 2-3 hours to implement weighted)

---

### Issue 12: Pipeline Methods Exceed Decomposition Guideline

**File**: `packages/AI/Knowledge/Pipeline/src/generic/KnowledgePipeline.ts`
**Layer**: Pipeline

Three methods exceed the CLAUDE.md 30-40 line functional decomposition guideline:

| Method | Lines | Guideline |
|--------|-------|-----------|
| `ProcessEntity()` | ~50 | Max 40 |
| `ProcessContentSource()` | ~95 | Max 40 |
| `ProcessSingleRecord()` | ~46 | Max 40 |

All three repeat similar patterns (progress emission, error handling, syncer setup, result construction) that should be extracted into shared helpers:

```typescript
private createSyncer(contextUser: UserInfo): EntityVectorSyncer { ... }
private buildResult(stage: string, processed: number, errors: PipelineError[]): PipelineResult { ... }
private wrapWithProgress<T>(stage: string, total: number, fn: () => Promise<T>): Promise<T> { ... }
```

#### Effort: Medium (1-2 hours)

---

### Issue 13: Progress Reporting Is Misleading

**File**: `packages/AI/Knowledge/Pipeline/src/generic/KnowledgePipeline.ts`, lines 61-78, 281-293
**Layer**: Pipeline

Two issues:

1. **Inconsistent `total` semantics**: `ProcessEntity()` emits `total=1` (line 61), but `ProcessContentSource()` emits `total=items.length` (line 154). A progress bar consumer can't know whether "50%" means "50% of entities" or "50% of records."

2. **Inaccurate time estimates**: `estimateRemainingTime()` at lines 281-293 divides elapsed time by processed items (`msPerItem = elapsedMs / processed`). After processing 1 item in 5000ms, it estimates 4999 * 5000ms for the remaining items — wildly inaccurate because the first item often includes one-time setup overhead.

**Fix**: Use consistent progress semantics (always report record count, not entity count) and implement a sliding-window time estimator that averages the last N items rather than dividing total elapsed by total processed.

#### Effort: Small (1 hour)

---

### Issue 14: Missing Parameter Validation Across Packages

**Layer**: Multiple packages

Several methods accept parameters without validation, creating silent failure modes:

| File | Location | Missing Validation |
|------|----------|-------------------|
| `KnowledgePipeline.ts` | `ProcessEntity()` entry | `EntityID` non-empty, `BatchSize > 0` |
| `KnowledgePipeline.ts` | `ProcessContentSource()` entry | `ContentSourceID` non-empty |
| `UnifiedSearchService.ts` | `Search()`, line 60 | `MaxResults >= 1` |
| `KnowledgeAgent.ts` | `executeSearchKnowledge()`, line 234 | String type validation beyond `String()` cast |
| `WebSocketTransport.ts` | `Connect()` | URL format validation |

**Fix**: Add guard clauses at method entry points. Example:

```typescript
public async ProcessEntity(params: PipelineEntityParams, contextUser: UserInfo): Promise<PipelineResult> {
    if (!params.EntityID?.trim()) throw new Error('EntityID is required');
    if (params.BatchSize !== undefined && params.BatchSize <= 0) throw new Error('BatchSize must be > 0');
    // ... proceed
}
```

#### Effort: Small (1 hour across all files)

---

### Issue 15: FTS Ignores Native Database Relevance Scores

**File**: `packages/AI/Knowledge/Search/src/generic/FullTextSearchProvider.ts`, line 181
**Layer**: Search engine / Quality

The full-text search provider assigns scores based on **positional order** in the result set:

```typescript
Score: 1.0 / (index + 1)  // Position 1 = 1.0, position 2 = 0.5, position 100 = 0.01
```

This discards the **native relevance scores** that both SQL Server (`CONTAINSTABLE.RANK`) and PostgreSQL (`ts_rank()`) compute. These database-computed scores reflect term frequency, inverse document frequency, and other linguistic features — significantly more informative than simple ordinal position.

**Fix**: Use `CONTAINSTABLE` (SQL Server) or `ts_rank()` (PostgreSQL) instead of `FREETEXT`/`plainto_tsquery`, and pass the native rank as the `Score` property. Normalize to 0-1 range for consistent fusion with vector scores.

#### Effort: Medium (2-3 hours — requires different SQL generation for ranked FTS)

---

### Issue 16: Silent Search Failures

**File**: `packages/AI/Knowledge/Search/src/generic/FullTextSearchProvider.ts`, line 122
**Layer**: Search engine / Observability

Per-entity search failures are caught, logged via `LogError`, and return empty arrays:

```typescript
} catch (error) {
    LogError(`FTS search failed for ${entity.EntityName}`, undefined, error);
    return [];  // Caller sees empty results, not failure
}
```

The `UnifiedSearchService` then merges these empty arrays with successful results — it has **no way to know** that a provider partially failed. From the consumer's perspective, "no results from this entity" is indistinguishable from "this entity's search crashed."

**Fix**: Return a result envelope with both data and status:

```typescript
interface ProviderSearchResult {
    Candidates: ScoredCandidate[];
    Warnings: string[];  // "FTS failed for entity X: timeout"
    PartialFailure: boolean;
}
```

Propagate warnings up to `UnifiedSearchResponse` so the UI can display "Some sources could not be searched" when appropriate.

#### Effort: Medium (1-2 hours — touches SearchTypes, providers, and UnifiedSearchService)

---

## LOW Priority Issues (Tech Debt / Nice-to-Have)

### Issue 17: `Record<string, unknown>` Overuse in KnowledgeAgent

**File**: `packages/AI/Agents/src/KnowledgeAgent.ts` (16 instances)

While `Record<string, unknown>` is appropriate for JSON schema tool parameters (which are inherently dynamic), it's also used for internal result types and `RunView` generics where stronger types would help. For example, the inline result type `{ EntityName: string; RecordID: string; Title: string; Snippet: string }` appears 3+ times and should be extracted:

```typescript
interface SearchResultRow {
    EntityName: string;
    RecordID: string;
    Title: string;
    Snippet: string;
}
```

Similarly, define `ToolResult<T>` instead of the repeated `{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }`.

#### Effort: Small (30 minutes)

---

### Issue 18: VectorIndex.Metric Lacks CHECK Constraint

**File**: `migrations/v5/V202603301800__v5.22.x__Add_VectorIndex_Metadata_Columns.sql`, line 6

The `Metric` column is `NVARCHAR(50) NULL` with no constraint. Valid values are `'cosine'`, `'euclidean'`, and `'dotproduct'`. A CHECK constraint would prevent invalid data at the database level:

```sql
ALTER TABLE ${flyway:defaultSchema}.VectorIndex
ADD CONSTRAINT CK_VectorIndex_Metric
CHECK (Metric IS NULL OR Metric IN ('cosine', 'euclidean', 'dotproduct'));
```

Not critical since this is config data set by trusted code, but it's good practice for data integrity.

#### Effort: Trivial (new migration, 5 minutes)

---

### Issue 19: SearchOverlay Uses Global `@HostListener`

**File**: `packages/Angular/Generic/search/src/lib/search-overlay.component.ts`, line 131

The component uses `@HostListener('document:keydown')` to listen for keyboard shortcuts (Cmd+K / Ctrl+K to open). This is fine for a singleton overlay, but as a generic component, if multiple instances are ever created, each would independently listen to all keyboard events.

**Fix**: Either document that this component is singleton-only, or make the keyboard listener opt-in via an `@Input() EnableKeyboardShortcut = true` flag that conditionally subscribes.

#### Effort: Trivial (15 minutes)

---

### Issue 20: AgentClientSession Double-Cast

**File**: `packages/AI/AgentsClient/src/generic/AgentClientSession.ts`, line 235

```typescript
const payload = response as unknown as Record<string, unknown>;
```

The `as unknown as T` double-cast pattern is a red flag — it tells TypeScript "I know better, trust me" and silently drops type safety. The `ClientToolResponse` type should either be structurally compatible with the payload format, or a proper transformation function should convert between them.

**Fix**: Define the Payload field's type to accept `ClientToolResponse` directly, or create a `toPayload(response: ClientToolResponse): Record<string, unknown>` mapper with explicit field extraction.

#### Effort: Small (30 minutes)

---

## What's Done Well

The review identified several areas of **strong execution** that should be highlighted as patterns to replicate:

### Angular UI — Exemplary Quality

| Aspect | Details |
|--------|---------|
| **Template syntax** | 100% modern `@if`/`@for` block syntax with `track` expressions throughout |
| **Design tokens** | Zero hardcoded hex colors — all CSS uses `var(--mj-*)` semantic tokens |
| **Loading states** | `<mj-loading>` component used consistently, proper `IsLoading` state management |
| **Input properties** | Getter/setter pattern with change detection on all complex inputs (`IsHidden`, `IsOpen`, `ConversationId`) |
| **Change detection** | Proper `cdr.detectChanges()` after all async state changes |
| **Cleanup** | `destroy$` Subject with `takeUntil()` on every subscription; `ngOnDestroy` implemented everywhere |
| **Dependency injection** | Modern `inject()` function used (not constructor injection) |
| **Functional decomposition** | All methods under 20 lines; private helpers extracted cleanly |
| **Component isolation** | Generic components (ChatOverlay, SearchOverlay) explicitly avoid Router imports |

### Naming Conventions — 100% Compliant

Every file across all 8 new packages follows the MJ convention:
- **PascalCase** for all public properties and methods
- **camelCase** for all private/protected members
- **PascalCase** for interfaces and type aliases

### Package Architecture — Clean Layering

```
AgentsClient (minimal deps: @memberjunction/global only)
    |
Knowledge/Search (depends on: ai, ai-vectordb, ai-vectors, core)
    |
Knowledge/Pipeline (depends on: ai, ai-vectordb, ai-vectors, ai-vector-sync, core)
```

- No circular dependencies
- No re-exports of external package types from public APIs
- No manual singleton patterns (correct per CLAUDE.md)
- Appropriate dependency breadth — each package imports only what it needs

### Type Safety — Zero `any`

Not a single `any` type across ~5,000 lines of new TypeScript. The team used:
- `Record<string, unknown>` for dynamic data (appropriate for JSON schema parameters)
- Proper generics on `RunView<T>()` calls
- `contextUser` passed on all server-side entity operations
- Discriminated unions for message types in AgentsClient

### Search Fusion (RRF) — Mathematically Correct

The Reciprocal Rank Fusion implementation uses k=60 (matching the academic standard and production implementations in Azure Cognitive Search, Elasticsearch, and OpenSearch). The algorithm correctly:
- Uses ordinal rank positions (1-based), immune to score-scale artifacts
- Only counts present items — missing items contribute zero, not negative scores
- Supports arbitrary numbers of input lists via generic `LabeledCandidateList[]`

### Metadata Files — Properly Structured

- Agent metadata uses correct Loop agent type, proper modalities, linked prompts
- Prompt metadata uses `@file:` references for template content (not inline strings)
- Application metadata has correct NavItems with `ResourceType: "Custom"` and matching DriverClass names
- All tree-shaking prevention functions exist on resource components

---

## Effort Estimate Summary

| Priority | Issue Count | Estimated Total Effort |
|----------|------------|----------------------|
| CRITICAL | 5 | ~4-5 hours |
| HIGH | 5 | ~16-24 hours |
| MEDIUM | 6 | ~8-12 hours |
| LOW | 4 | ~2 hours |
| **Total** | **20** | **~30-43 hours** |

### Recommended Sprint Plan

**Week 1 — Critical + Quick Wins**:
1. Fix entity name prefix (Issue #5) — 5 min
2. Fix SearchFusion case-mismatch (Issue #2) — 15 min
3. Add field name quoting (Issue #4) — 30 min
4. Wire KnowledgeAgent to UnifiedSearchService (Issue #1) — 2 hours
5. Add handler unregistration to AgentClientSession (Issue #7) — 1 hour
6. Document migration violations (Issue #3) — 30 min

**Week 2 — High Priority**:
1. Write Phase 1 tests (Issue #10) — 4-6 hours
2. Add WebSocket reconnection (Issue #6) — 2-3 hours
3. Batch FTS queries with RunViews (Issue #9) — 1 hour
4. Add pipeline retry logic (Issue #8, partial) — 2-3 hours

**Week 3 — Medium Priority**:
1. Remove dead weighted fusion type (Issue #11) — 30 min
2. Decompose pipeline methods (Issue #12) — 1-2 hours
3. Fix progress reporting (Issue #13) — 1 hour
4. Add parameter validation (Issue #14) — 1 hour
5. Implement native FTS scoring (Issue #15) — 2-3 hours
6. Add partial failure reporting (Issue #16) — 1-2 hours

**Backlog — Low Priority**:
- Issues #17-20 as time permits

---

## Appendix A: Files Changed in PR

### New Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@memberjunction/ai-knowledge-search` | `packages/AI/Knowledge/Search/` | Unified search with vector + FTS + RRF fusion |
| `@memberjunction/ai-knowledge-pipeline` | `packages/AI/Knowledge/Pipeline/` | Vectorization pipeline orchestrator |
| `@memberjunction/ai-agents-client` | `packages/AI/AgentsClient/` | Client SDK for agent communication |

### New Agent

| File | Purpose |
|------|---------|
| `packages/AI/Agents/src/KnowledgeAgent.ts` | Knowledge management sub-agent (search, vectorize, dedup) |
| `metadata/agents/.knowledge-agent.json` | Agent metadata definition |
| `metadata/prompts/.knowledge-agent-prompt.json` | Agent prompt metadata |
| `metadata/prompts/templates/Knowledge Agent - System Prompt.template.md` | System prompt template |

### New Angular Components

| Component | Path | Type |
|-----------|------|------|
| KnowledgeSearchResourceComponent | `Angular/Explorer/dashboards/src/KnowledgeHub/components/search/` | Dashboard resource |
| KnowledgeConfigResourceComponent | `Angular/Explorer/dashboards/src/KnowledgeHub/components/config/` | Dashboard resource |
| SearchResultDetailComponent | `Angular/Explorer/dashboards/src/KnowledgeHub/components/results-detail/` | Sub-component |
| SearchOverlayComponent | `Angular/Generic/search/src/lib/` | Generic overlay |
| SearchFilterComponent | `Angular/Generic/search/src/lib/` | Generic filter |
| SearchResultsComponent | `Angular/Generic/search/src/lib/` | Generic results list |
| ChatOverlayComponent | `Angular/Generic/chat-overlay/src/lib/` | Generic chat overlay |

### Migrations

| File | DDL Change |
|------|-----------|
| `V202603301728__v5.22.x__Add_VectorIndexID_To_EntityDocument.sql` | Adds `VectorIndexID` FK column to EntityDocument |
| `V202603301800__v5.22.x__Add_VectorIndex_Metadata_Columns.sql` | Adds `ExternalID`, `Dimensions`, `Metric`, `ProviderConfig` to VectorIndex |
| `V202603311500__v5.22.x__Add_Configuration_Columns.sql` | Adds `Configuration` to EntityDocument and VectorDatabase |

### Metadata

| File | Purpose |
|------|---------|
| `metadata/applications/.knowledge-hub-application.json` | Knowledge Hub application definition |
| `metadata/agent-types/.agent-types.json` | Updated agent type definitions |

---

## Appendix B: Package Dependency Graph

```
@memberjunction/global
    |
    +-- @memberjunction/core
    |       |
    |       +-- @memberjunction/core-entities
    |       |
    |       +-- @memberjunction/ai
    |       |       |
    |       |       +-- @memberjunction/ai-vectordb
    |       |       |       |
    |       |       |       +-- @memberjunction/ai-knowledge-search  [NEW]
    |       |       |       |
    |       |       |       +-- @memberjunction/ai-vector-sync
    |       |       |               |
    |       |       |               +-- @memberjunction/ai-knowledge-pipeline  [NEW]
    |       |       |
    |       |       +-- @memberjunction/ai-agents
    |       |               |
    |       |               +-- KnowledgeAgent  [NEW - in ai-agents package]
    |
    +-- @memberjunction/ai-agents-client  [NEW - minimal deps]
```

No circular dependencies detected. All dependency directions are top-down.
