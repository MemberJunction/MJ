# Sample Query Generation - Quality Control

This document describes the current quality control mechanisms in the sample query generation feature.

## Overview

The sample query generator includes comprehensive quality control to ensure generated queries are valid, executable, and useful for AI agent training.

**Current Success Rate:** ~96% of generated queries validate successfully against the database.

---

## Validation Process

Every generated query goes through a multi-step validation process:

### 1. SQL Generation (Phase 2)

```typescript
// After Phase 1 query planning, Phase 2 generates actual SQL
const querySQL = await this.generateQuerySQL(schema, focusTable, plan, queryPlans);

// Combines plan + SQL into complete SampleQuery
const completeQuery: SampleQuery = {
  ...plan,           // Business metadata from planning
  ...querySQL,       // Actual SQL and technical details
  schema: schema.name,
  sampleResultRows: [],
  validated: false,  // Not yet validated
  generatedAt: new Date().toISOString(),
  modelUsed: this.model
};
```

### 2. Automatic Query Validation

**Enabled by default** if `maxExecutionTime > 0` (default: 30000ms)

```typescript
if (this.config.maxExecutionTime > 0) {
  await this.validateQuery(completeQuery);
}
```

### 3. Validation Steps

#### 3.1 Query Preparation

Before execution, queries are modified for safe validation:

**Parameter Substitution:**
```typescript
// Replace @paramName with sample values
@StartDate  → '2024-01-01'
@EndDate    → '2024-12-31'
@Status     → 'Active'
@MemberID   → 1
@Name       → 'Sample'
```

**Row Limiting:**
```typescript
// Automatically adds TOP 10 if not present
SELECT * FROM Members              // Original
↓
SELECT TOP 10 * FROM Members       // Prepared for validation
```

#### 3.2 Database Execution

```typescript
const validationQuery = this.prepareValidationQuery(query.sqlQuery);
const startTime = Date.now();
const result = await this.driver.executeQuery(validationQuery);
const executionTime = Date.now() - startTime;
```

#### 3.3 Result Processing

**On Success:**
```typescript
if (result.success && result.data) {
  query.validated = true;
  query.executionTime = executionTime;
  query.sampleResultRows = result.data.slice(0, 5);  // Capture first 5 rows
}
```

**On Failure:**
```typescript
else {
  query.validated = false;
  query.validationError = result.errorMessage || 'Query returned no results';
}
```

---

## Error Recovery Strategy

### Failed Query Handling

**Queries are NOT discarded when validation fails.** Instead, they are included in the output with metadata:

```json
{
  "id": "query-5",
  "name": "Detailed Email Engagement for Campaign",
  "sqlQuery": "SELECT e.EmailID, e.CampaignID, ...",
  "validated": false,
  "validationError": "Operand type clash: uniqueidentifier is incompatible with tinyint",
  "confidence": 0.95,
  "queryType": "detail",
  "queryPattern": "join-detail",
  // ... all other metadata still present
}
```

**Rationale:**
1. **Transparency**: Developers can see what failed and why
2. **Debugging**: Error messages help identify schema issues
3. **Partial Success**: Get 24 good queries even if 1 fails
4. **Token Efficiency**: Don't waste LLM tokens on discarded queries
5. **Iterative Improvement**: Can fix and re-run specific failed queries

### Generation Error Handling

If SQL generation itself fails (not validation), the query is skipped:

```typescript
try {
  const querySQL = await this.generateQuerySQL(...);
  // ... validation ...
  queries.push(completeQuery);
} catch (error) {
  LogError(`Failed to generate SQL for query: ${plan.name}`);
  // Continue with other queries - no cascading failures
}
```

**Result:** The system continues processing remaining queries. If 1 out of 5 queries fails to generate, you still get 4 queries for that table.

---

## Quality Metrics

### Summary Statistics

After generation, comprehensive metrics are collected:

```json
{
  "totalQueriesGenerated": 25,
  "queriesValidated": 24,
  "queriesFailed": 1,
  "totalExecutionTime": 312814,
  "tokensUsed": 113458,
  "estimatedCost": 0,
  "averageConfidence": 0.95,
  "queriesByType": {
    "aggregation": 5,
    "filter": 5,
    "ranking": 5,
    "join": 4,
    "time-series": 4,
    "summary": 1,
    "detail": 1
  },
  "queriesByPattern": {
    "aggregation-group-by": 6,
    "filtered-select": 5,
    "ranking-top-n": 5,
    "join-detail": 4,
    "time-series-aggregation": 4,
    "drill-down-detail": 1
  },
  "queriesByComplexity": {
    "simple": 6,
    "moderate": 14,
    "complex": 5
  }
}
```

### Per-Query Metadata

Each query includes:

**Generation Metadata:**
- `id`: Unique identifier
- `name`: Descriptive name
- `description`: What the query does
- `businessPurpose`: Why someone would run this
- `generatedAt`: ISO timestamp
- `modelUsed`: LLM model that generated it
- `confidence`: LLM's confidence score (0-1)

**Technical Metadata:**
- `sqlQuery`: The actual SQL
- `queryType`: aggregation, filter, join, detail, summary, ranking, time-series
- `queryPattern`: Specific pattern (e.g., aggregation-group-by, join-detail)
- `complexity`: simple, moderate, complex
- `primaryEntities`: Tables directly queried
- `relatedEntities`: Tables joined
- `parameters`: Query parameters with types and defaults

**Validation Metadata:**
- `validated`: Boolean success/failure
- `validationError`: Error message if failed
- `executionTime`: Milliseconds to execute
- `sampleResultRows`: First 5 result rows (for validated queries)
- `sampleResultColumns`: Expected column metadata

**Alignment Metadata:**
- `relatedQueries`: IDs of related queries (summary ↔ detail)
- `alignmentNotes`: LLM's notes on ensuring consistent filters
- `filteringRules`: Array of filter rules
- `aggregationRules`: Array of aggregation rules
- `joinRules`: Array of join rules

---

## Test Results Example

From actual test run (AssociationDB, 58 tables, 5 tables processed):

**Success Metrics:**
- ✅ 25 queries generated (5 queries × 5 tables)
- ✅ 24 queries validated successfully (96% success rate)
- ✅ 1 query failed with clear error message
- ✅ 113,458 tokens used (~$0.57 at GPT-4o rates)
- ✅ 312 seconds execution time (~5 minutes)
- ✅ 95% average confidence from LLM

**Query Distribution:**
- 6 simple queries (24%)
- 14 moderate queries (56%)
- 5 complex queries (20%)

**Pattern Diversity:**
- 6 different query types
- 6 different query patterns
- No duplicate query structures

---

## Configuration

### Validation Control

```json
{
  "sampleQueryGeneration": {
    "maxExecutionTime": 30000  // Set to 0 to disable validation
  }
}
```

**When to Disable Validation:**
- Testing prompt quality (don't care if SQL is valid)
- Database is unavailable
- Pure SQL generation testing

**Note:** Validation is recommended for production use to ensure query quality.

---

## Logging

Detailed logs are provided during generation:

```
[SampleQueryGenerator] === Generating queries for Member ===
[SampleQueryGenerator] Phase 1: Planning queries for Member
[SampleQueryGenerator] Generated 5 query plans for Member
[SampleQueryGenerator] Generating SQL for query 1/5: List Members by Industry
[SampleQueryGenerator] Query validated: List Members by Industry (18ms, 5 rows)
[SampleQueryGenerator] ✓ Query 1 complete: List Members by Industry
[SampleQueryGenerator] Generating SQL for query 2/5: Filter Members by Join Date
[SampleQueryGenerator] Query validated: Filter Members by Join Date (15ms, 10 rows)
[SampleQueryGenerator] ✓ Query 2 complete: Filter Members by Join Date
...
[SampleQueryGenerator] === Completed 5/5 queries for Member ===
```

---

## Best Practices

### 1. Review Failed Queries

After generation, check failed queries:

```bash
# Find failed queries
cat sample-queries.json | jq '.[] | select(.validated == false) | {name, validationError}'
```

Common failure causes:
- Type mismatches in JOINs
- Missing columns (schema changes)
- Invalid parameter defaults
- Complex subqueries with errors

### 2. Iterative Refinement

For failed queries:
1. Review the error message
2. Fix schema issues if needed
3. Regenerate queries for that table
4. Update query generation prompts if pattern repeats

### 3. Monitor Success Rate

Track validation success rate over time:
- < 90%: Check schema quality or prompt templates
- 90-95%: Normal (some complex queries may fail)
- > 95%: Excellent (current level)

### 4. Use Summary Statistics

The summary file provides quick health check:

```bash
# Quick check
cat sample-queries-summary.json | jq '{validated: .queriesValidated, failed: .queriesFailed, successRate: (.queriesValidated / .totalQueriesGenerated * 100)}'
```

---

## Future Enhancements

See [SAMPLE_QUERY_IMPROVEMENTS.md](./SAMPLE_QUERY_IMPROVEMENTS.md) for planned improvements:

**Priority 1:**
- Automatic retry with query simplification
- LLM-assisted error fixing
- Pre-validation schema checks

**Priority 2:**
- Alignment verification between related queries
- Query performance testing
- Query diversity scoring

---

## Comparison with Other Tools

**DBAutoDoc Sample Query Generation:**
- ✅ Validates every query against real database
- ✅ Captures actual result samples
- ✅ Includes failed queries with error details
- ✅ Tracks comprehensive metadata
- ✅ Measures execution time
- ✅ ~96% success rate

**Typical AI SQL Generators:**
- ❌ No validation (syntax only)
- ❌ No execution testing
- ❌ Discards failed queries
- ❌ Minimal metadata
- ❌ No execution metrics
- ❌ Unknown success rate

---

## Support

For issues or questions:
1. Check the summary JSON for overall statistics
2. Review failed query error messages
3. Check the debug logs for generation details
4. Consult [SAMPLE_QUERY_IMPROVEMENTS.md](./SAMPLE_QUERY_IMPROVEMENTS.md) for enhancement plans

---

**Last Updated:** 2025-01-14
**Version:** 1.0
**Status:** Production Quality
