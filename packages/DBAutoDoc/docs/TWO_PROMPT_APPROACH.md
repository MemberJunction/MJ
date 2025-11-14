# Two-Prompt Approach for Sample Query Generation

## Overview

The sample query generation feature now uses a **two-prompt approach** to avoid JSON truncation issues and improve quality.

## Architecture

### Phase 1: Query Planning (`query-planning.md`)
**Purpose**: Decide what queries to create
**Output**: Lightweight query plans (descriptions, types, patterns)
**Token Budget**: ~4,000 output tokens
**LLM Calls**: 1 per table

```typescript
interface QueryPlan {
  id: string;
  name: string;
  description: string;
  businessPurpose: string;
  queryType: QueryType;
  queryPattern: QueryPattern;
  complexity: QueryComplexity;
  primaryEntities: EntityReference[];
  relatedEntities: EntityReference[];
  relatedQueryIds: string[];  // Links related queries for alignment
  confidence: number;
  reasoning?: string;
}
```

### Phase 2: SQL Generation (`single-query-generation.md`)
**Purpose**: Generate SQL for each query individually
**Output**: Detailed SQL with parameters, rules, and alignment notes
**Token Budget**: ~3,000 output tokens per query
**LLM Calls**: N per table (where N = queriesPerTable)

```typescript
interface QuerySQL {
  sqlQuery: string;
  parameters: QueryParameter[];
  sampleResultColumns: ResultColumn[];
  filteringRules: string[];
  aggregationRules: string[];
  joinRules: string[];
  alignmentNotes?: string;
}
```

## Benefits

### ✅ Solves Token Limit Issues
- **Old approach**: 1 call returning 5 queries = ~8,000-10,000 tokens (often truncated)
- **New approach**: 1 planning call (~2K tokens) + 5 SQL calls (~2K each) = no truncation

### ✅ Better Quality Control
- Can retry individual failed queries without regenerating entire set
- Separate concerns: strategy (what to build) vs. tactics (how to build)
- Better error messages and progress visibility

### ✅ Maintains Context
- Phase 1 plans all queries together (prevents duplicates)
- Phase 2 receives related query plans for alignment awareness
- No loss of multi-query alignment tracking

### ✅ More Flexible
- Could parallelize Phase 2 calls in future
- Could use different models per phase
- Easier to adjust token limits per query complexity

## API Call Analysis

### Old Approach
- **Per table**: 1 LLM call
- **58 tables**: 58 calls
- **Token usage**: ~10K per call (often truncated)
- **Failure mode**: All queries lost if JSON truncated

### New Approach
- **Per table**: 1 + N calls (where N = queriesPerTable, default 5)
- **58 tables**: 58 + 290 = **348 calls**
- **Token usage**:
  - Planning: ~2K per call (58 × 2K = 116K tokens)
  - SQL: ~2K per query (290 × 2K = 580K tokens)
  - **Total**: ~696K tokens
- **Failure mode**: Individual query failures don't affect others

### Cost Comparison

Assuming GPT-4o pricing ($2.50/1M input, $10/1M output):

**Old Approach** (if it worked):
- Input: 58 tables × ~3K context = 174K tokens → $0.44
- Output: 58 tables × 10K response = 580K tokens → $5.80
- **Total**: ~$6.24

**New Approach**:
- Input: 348 calls × ~3K context = 1,044K tokens → $2.61
- Output: 348 calls × ~2K response = 696K tokens → $6.96
- **Total**: ~$9.57

**Trade-off**: ~50% more cost, but:
- Actually works (no truncation)
- Better quality
- Individual retry capability
- Progress visibility

## Implementation Details

### SampleQueryGenerator.generateQueriesForTable()

```typescript
private async generateQueriesForTable(
  schema: SchemaDefinition,
  focusTable: TableDefinition,
  existingQueries: SampleQuery[]
): Promise<SampleQuery[]> {
  // PHASE 1: Plan queries (what to create)
  const queryPlans = await this.planQueries(schema, focusTable, existingQueries);

  // PHASE 2: Generate SQL for each query
  const queries: SampleQuery[] = [];
  for (const plan of queryPlans) {
    const querySQL = await this.generateQuerySQL(schema, focusTable, plan, queryPlans);

    // Combine plan + SQL
    const completeQuery: SampleQuery = {
      ...plan,
      ...querySQL,
      schema: schema.name,
      validated: false,
      generatedAt: new Date().toISOString(),
      modelUsed: this.model
    };

    // Validate if enabled
    if (this.config.maxExecutionTime > 0) {
      await this.validateQuery(completeQuery);
    }

    queries.push(completeQuery);
  }

  return queries;
}
```

### Progress Logging

The new approach provides better visibility:

```
[SampleQueryGenerator] === Generating queries for Member ===
[SampleQueryGenerator] Phase 1: Planning queries for Member
[SampleQueryGenerator] Generated 5 query plans for Member
[SampleQueryGenerator] Generating SQL for query 1/5: Active Members by Industry
[SampleQueryGenerator] ✓ Query 1 complete: Active Members by Industry
[SampleQueryGenerator] Generating SQL for query 2/5: Member Enrollment Trends
[SampleQueryGenerator] ✓ Query 2 complete: Member Enrollment Trends
...
[SampleQueryGenerator] === Completed 5/5 queries for Member ===
```

## Query Alignment

The two-prompt approach maintains query alignment through `relatedQueryIds`:

### Phase 1: Planning
```json
{
  "queries": [
    {
      "id": "summary-attendance",
      "name": "Event Attendance Summary",
      "queryType": "summary",
      "relatedQueryIds": ["detail-attendance"]
    },
    {
      "id": "detail-attendance",
      "name": "Attendance Detail Drill-Down",
      "queryType": "drill-down",
      "relatedQueryIds": ["summary-attendance"]
    }
  ]
}
```

### Phase 2: SQL Generation

When generating SQL for `detail-attendance`, the prompt receives:
- The query plan for `detail-attendance`
- The related plan for `summary-attendance`
- **Explicit alignment instructions**

This ensures both queries use consistent filtering logic.

## Testing

To test the new implementation:

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/Demos/AssociationDB

# Make sure config uses GPT-4o (not GPT-5) with sufficient tokens
# {
#   "ai": {
#     "model": "gpt-4o",
#     "temperature": 0.1,
#     "maxTokens": 16000
#   }
# }

mj dbdoc generate-queries --from-state output/run-1/state.json
```

Expected output:
- Planning phase completes for each table
- SQL generation happens per-query with progress updates
- No JSON truncation errors
- ~290 queries generated total (5 per table × 58 tables ÷ 2 for important tables)

## Future Enhancements

1. **Parallel SQL Generation**: Could generate SQL for all 5 queries in parallel instead of sequentially
2. **Smart Retries**: Could retry individual failed queries with adjusted prompts
3. **Model Selection**: Could use cheaper model for Phase 2 (SQL is more mechanical)
4. **Caching**: Could cache query plans and regenerate only SQL if needed

## Files Modified

1. `src/types/sample-queries.ts` - Added `QueryPlan` and `QuerySQL` interfaces
2. `prompts/query-planning.md` - Phase 1 prompt template
3. `prompts/single-query-generation.md` - Phase 2 prompt template
4. `src/generators/SampleQueryGenerator.ts` - Rewrote `generateQueriesForTable()`

## Migration Notes

**No breaking changes** - the output format (`SampleQuery[]`) remains the same. The implementation details changed but the API is compatible.
