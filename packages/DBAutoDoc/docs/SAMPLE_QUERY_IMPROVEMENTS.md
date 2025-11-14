# Sample Query Generation - Potential Improvements

This document outlines potential enhancements to the sample query generation feature for future implementation.

## Current Quality Control Status

The feature currently includes:
- ✅ Automatic validation of every generated query
- ✅ Execution against actual database
- ✅ Capture of validation errors with detailed messages
- ✅ Failed queries included in output with metadata
- ✅ Smart parameter substitution for validation
- ✅ Row limiting to prevent large result sets
- ✅ Resilient error handling (continues on failures)

**Current Success Rate:** ~96% (24/25 queries validated successfully in test run)

---

## Priority 1: Error Recovery & Quality Improvements

### 1.1 Automatic Retry with Simplification

**Problem:** Some queries fail due to overly complex structures or type mismatches that could be fixed with simpler logic.

**Example Failure:**
```
Query: "Detailed Email Engagement for Campaign"
Error: "Operand type clash: uniqueidentifier is incompatible with tinyint"
```

**Proposed Solution:**
```typescript
private async validateWithRetry(query: SampleQuery, maxRetries: number = 2): Promise<void> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    const result = await this.validateQuery(query);

    if (result.validated) {
      return; // Success
    }

    // Try to fix common issues
    if (attempt < maxRetries) {
      query.sqlQuery = this.simplifyQuery(query.sqlQuery, result.validationError);
      attempt++;
      LogStatus(`[SampleQueryGenerator] Retrying query ${query.name} (attempt ${attempt}/${maxRetries})`);
    }
  }
}

private simplifyQuery(sql: string, error: string): string {
  // Remove complex subqueries if type mismatch
  if (error.includes('type clash') || error.includes('incompatible')) {
    // Simplify joins, remove calculated columns, etc.
  }

  // Remove problematic CASE statements
  if (error.includes('CASE')) {
    // Strip CASE expressions
  }

  return sql;
}
```

**Benefits:**
- Increases validation success rate from 96% to potentially 98-99%
- Provides simpler fallback queries that still demonstrate patterns
- Logs retry attempts for transparency

**Effort:** Medium (2-3 hours)

---

### 1.2 LLM-Assisted Error Fixing

**Problem:** When queries fail validation, the LLM could potentially fix them if given the error context.

**Proposed Solution:**
```typescript
private async fixQueryWithLLM(
  query: SampleQuery,
  validationError: string,
  tableSchema: TableContext
): Promise<SampleQuery> {
  const fixPrompt = {
    originalQuery: query.sqlQuery,
    error: validationError,
    tableSchema: tableSchema,
    instructions: 'Fix the SQL query to resolve the validation error while maintaining the business logic'
  };

  const result = await this.promptEngine.executePrompt<{ fixedSQL: string }>(
    'query-fix',
    fixPrompt,
    { responseFormat: 'JSON', maxTokens: 2000 }
  );

  if (result.success) {
    query.sqlQuery = result.result.fixedSQL;
    query.wasFixed = true;
    query.originalError = validationError;
  }

  return query;
}
```

**New Prompt Template:** `prompts/query-fix.md`
- Receives: Original SQL, error message, schema context
- Returns: Corrected SQL with explanation

**Benefits:**
- Leverages LLM's SQL expertise for error correction
- Learns from common error patterns
- Maintains query intent while fixing syntax/type issues

**Costs:**
- Additional ~1,000 tokens per failed query
- Minimal cost impact (only used for ~4% of queries)

**Effort:** Medium (3-4 hours)

---

### 1.3 Pre-Validation Schema Check

**Problem:** Some errors could be caught before executing against the database by checking column types and relationships.

**Proposed Solution:**
```typescript
private validateAgainstSchema(query: SampleQuery, table: TableContext): ValidationResult {
  const issues: string[] = [];

  // Parse SQL to extract referenced columns
  const referencedColumns = this.extractColumnReferences(query.sqlQuery);

  // Check each column exists and has compatible type in joins
  for (const colRef of referencedColumns) {
    const column = table.columns.find(c => c.name === colRef.name);

    if (!column) {
      issues.push(`Column ${colRef.name} does not exist in ${table.name}`);
    }

    // Check type compatibility in JOINs
    if (colRef.isJoinCondition) {
      const foreignColumn = this.getForeignColumn(colRef.joinTable, colRef.joinColumn);
      if (column && foreignColumn && !this.typesCompatible(column.dataType, foreignColumn.dataType)) {
        issues.push(`Type mismatch in JOIN: ${column.dataType} vs ${foreignColumn.dataType}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

private typesCompatible(type1: string, type2: string): boolean {
  // Normalize SQL Server types
  const normalize = (t: string) => t.toLowerCase()
    .replace(/\(\d+\)/, '') // Remove size
    .replace('nvarchar', 'varchar')
    .replace('nchar', 'char');

  return normalize(type1) === normalize(type2);
}
```

**Benefits:**
- Catch obvious errors before database execution
- Faster feedback loop (no network roundtrip)
- Reduce database load
- Provide specific error messages for LLM fixing

**Effort:** Medium-High (4-5 hours)

---

## Priority 2: Query Quality Improvements

### 2.1 Alignment Verification Between Related Queries

**Problem:** Multi-query patterns (summary + detail) may have misaligned filters, leading to confusing results.

**Current:** We generate alignment notes but don't verify them.

**Proposed Solution:**
```typescript
private async verifyQueryAlignment(
  summaryQuery: SampleQuery,
  detailQuery: SampleQuery
): Promise<AlignmentReport> {
  // Execute both queries
  const summaryResult = await this.driver.executeQuery(summaryQuery.sqlQuery);
  const detailResult = await this.driver.executeQuery(detailQuery.sqlQuery);

  // Compare counts
  const summaryCount = summaryResult.data[0]?.TotalCount || 0;
  const detailCount = detailResult.data.length;

  const aligned = Math.abs(summaryCount - detailCount) < 2; // Allow for rounding

  return {
    aligned,
    summaryCount,
    detailCount,
    difference: Math.abs(summaryCount - detailCount),
    recommendation: aligned ? 'Queries are properly aligned' : 'Filter mismatch detected'
  };
}
```

**Benefits:**
- Ensures Skip AI agent gets consistent data
- Builds trust in generated queries
- Identifies filter mismatches early

**Effort:** Medium (3-4 hours)

---

### 2.2 Query Performance Testing

**Problem:** Some generated queries may be slow or inefficient.

**Proposed Solution:**
```typescript
private async assessQueryPerformance(query: SampleQuery): Promise<PerformanceReport> {
  // Get execution plan
  const plan = await this.driver.executeQuery(`SET SHOWPLAN_XML ON; ${query.sqlQuery}`);

  // Analyze plan
  const analysis = {
    estimatedCost: this.extractCostFromPlan(plan),
    hasTableScan: plan.includes('Table Scan'),
    hasIndexSeek: plan.includes('Index Seek'),
    warningLevel: 'low' as 'low' | 'medium' | 'high'
  };

  // Classify performance
  if (analysis.estimatedCost > 100 || analysis.hasTableScan) {
    analysis.warningLevel = 'high';
    query.performanceWarning = 'Query may be slow on large datasets';
  }

  return analysis;
}
```

**Benefits:**
- Identify potentially slow queries
- Suggest indexes for common patterns
- Provide performance guidance to users

**Effort:** Medium-High (4-6 hours)

---

### 2.3 Query Diversity Scoring

**Problem:** Some queries may be too similar, reducing the value of the training set.

**Proposed Solution:**
```typescript
private calculateQueryDiversity(queries: SampleQuery[]): DiversityReport {
  const patterns = {
    joinCount: queries.map(q => (q.sqlQuery.match(/JOIN/gi) || []).length),
    whereComplexity: queries.map(q => (q.sqlQuery.match(/WHERE|AND|OR/gi) || []).length),
    aggregations: queries.map(q => (q.sqlQuery.match(/COUNT|SUM|AVG|MAX|MIN/gi) || []).length),
    groupBy: queries.map(q => q.sqlQuery.includes('GROUP BY')),
    orderBy: queries.map(q => q.sqlQuery.includes('ORDER BY'))
  };

  // Calculate variance
  const diversity = {
    joinDiversity: this.variance(patterns.joinCount),
    filterDiversity: this.variance(patterns.whereComplexity),
    aggregationDiversity: this.variance(patterns.aggregations),
    overallScore: 0
  };

  diversity.overallScore = (
    diversity.joinDiversity +
    diversity.filterDiversity +
    diversity.aggregationDiversity
  ) / 3;

  return diversity;
}
```

**Benefits:**
- Ensure variety in training examples
- Identify gaps in query pattern coverage
- Guide LLM to generate more diverse queries

**Effort:** Low-Medium (2-3 hours)

---

## Priority 3: Configuration & Usability

### 3.1 Query Regeneration for Failed Queries Only

**Problem:** If you have 24 good queries and 1 failed, you have to regenerate all 25.

**Proposed Solution:**
```typescript
// New command flag
mj dbdoc generate-queries \
  --from-state output/run-1/state.json \
  --retry-failed  // Only regenerate queries where validated=false
```

**Implementation:**
```typescript
if (flags['retry-failed']) {
  const existingQueries = await this.loadExistingQueries(outputDir);
  const failedQueries = existingQueries.filter(q => !q.validated);

  // Only regenerate failed ones
  for (const failed of failedQueries) {
    const regenerated = await this.regenerateQuery(failed);
    // Replace in output
  }
}
```

**Benefits:**
- Save time and tokens
- Iterative improvement workflow
- Focus effort on problematic queries

**Effort:** Low (1-2 hours)

---

### 3.2 Query Templates Library

**Problem:** Common query patterns could be templated for consistency.

**Proposed Solution:**
```typescript
// Query templates in prompts/query-templates/
const templates = {
  'top-n-by-metric': {
    pattern: 'SELECT TOP @n {columns} FROM {table} ORDER BY {metric} DESC',
    description: 'Get top N records by a metric'
  },
  'aggregation-by-dimension': {
    pattern: 'SELECT {dimension}, COUNT(*) FROM {table} GROUP BY {dimension}',
    description: 'Count records grouped by dimension'
  },
  'time-series-trend': {
    pattern: 'SELECT {dateColumn}, COUNT(*) FROM {table} WHERE {dateColumn} >= @start GROUP BY {dateColumn}',
    description: 'Time series aggregation'
  }
};
```

**Benefits:**
- More consistent query structure
- Faster generation (less tokens needed)
- Known-good patterns

**Effort:** Medium (3-4 hours)

---

### 3.3 Query Testing Suite

**Problem:** No automated tests for query generation quality.

**Proposed Solution:**
```typescript
// test/sample-query-generator.test.ts
describe('SampleQueryGenerator', () => {
  it('should generate valid queries for simple tables', async () => {
    const queries = await generator.generateQueries(simpleSchema);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every(q => q.validated)).toBe(true);
  });

  it('should handle foreign key relationships correctly', async () => {
    const queries = await generator.generateQueries(schemaWithFKs);
    const joinQueries = queries.filter(q => q.queryPattern === 'join-detail');
    expect(joinQueries.length).toBeGreaterThan(0);
    expect(joinQueries.every(q => q.sqlQuery.includes('JOIN'))).toBe(true);
  });

  it('should align summary and detail queries', async () => {
    const queries = await generator.generateQueries(schema);
    const summaryQuery = queries.find(q => q.queryType === 'summary');
    const detailQuery = queries.find(q => q.relatedQueries?.includes(summaryQuery.id));

    const aligned = await verifyAlignment(summaryQuery, detailQuery);
    expect(aligned.difference).toBeLessThan(5);
  });
});
```

**Benefits:**
- Catch regressions early
- Ensure quality across changes
- Document expected behavior

**Effort:** Medium (3-4 hours)

---

## Priority 4: Advanced Features

### 4.1 Multi-Table Query Patterns

**Problem:** Current queries focus on single tables. Real-world analytics often need 3+ table joins.

**Proposed Enhancement:**
```json
{
  "queryPattern": "multi-table-aggregation",
  "tablesInvolved": ["Orders", "OrderDetails", "Products", "Customers"],
  "complexity": "complex",
  "description": "Revenue by product category and customer segment"
}
```

**Effort:** High (6-8 hours)

---

### 4.2 Parameterized Query Variants

**Problem:** Each query is a single instance. Could generate variants with different parameter values.

**Proposed Enhancement:**
```typescript
const variants = [
  { params: { status: 'Active' }, description: 'Active records only' },
  { params: { status: 'Inactive' }, description: 'Inactive records only' },
  { params: { dateRange: 'last30days' }, description: 'Recent activity' }
];
```

**Effort:** Medium (3-4 hours)

---

### 4.3 Query Explanation Generation

**Problem:** Queries lack natural language explanations for business users.

**Proposed Enhancement:**
```typescript
{
  "name": "Top 5 Customers by Revenue",
  "sqlQuery": "SELECT TOP 5...",
  "explanation": {
    "simple": "Shows the 5 customers who spent the most money",
    "technical": "Aggregates OrderDetails by CustomerID, sums LineTotal, orders descending",
    "businessValue": "Helps identify VIP customers for targeted marketing campaigns"
  }
}
```

**Effort:** Low-Medium (2-3 hours)

---

## Implementation Priority

### Phase 1 (Quick Wins - 1-2 days)
1. Query Regeneration for Failed Queries Only (1-2 hours)
2. Query Diversity Scoring (2-3 hours)
3. Query Explanation Generation (2-3 hours)

### Phase 2 (Quality Improvements - 3-5 days)
1. Automatic Retry with Simplification (2-3 hours)
2. Pre-Validation Schema Check (4-5 hours)
3. Alignment Verification (3-4 hours)
4. Query Testing Suite (3-4 hours)

### Phase 3 (Advanced Features - 1-2 weeks)
1. LLM-Assisted Error Fixing (3-4 hours)
2. Query Performance Testing (4-6 hours)
3. Query Templates Library (3-4 hours)
4. Multi-Table Query Patterns (6-8 hours)

---

## Testing Strategy

For each improvement:
1. Unit tests for new functions
2. Integration tests with sample database
3. Cost analysis (token usage)
4. Success rate comparison (before/after)
5. Documentation updates

---

## Success Metrics

Track these metrics to measure improvement effectiveness:

- **Validation Success Rate**: Currently 96%, target 98-99%
- **Query Diversity Score**: Target variance > 0.5 across patterns
- **Alignment Accuracy**: Target < 2% difference between summary/detail
- **Token Efficiency**: Tokens per successful query
- **Generation Speed**: Time per query
- **User Satisfaction**: Feedback on query quality

---

## Notes

- All improvements should maintain backward compatibility
- Consider token cost vs. quality tradeoff for each enhancement
- Document configuration options for new features
- Update README with new capabilities
- Add examples to demonstrate new features

---

## Questions for Future Discussion

1. Should we implement automatic query fixing by default or make it opt-in?
2. What's an acceptable token budget increase for quality improvements?
3. Should we prioritize success rate (99%) vs diversity vs cost?
4. Do we need a query rating system (user feedback loop)?
5. Should we cache common query patterns to reduce LLM calls?

---

**Last Updated:** 2025-01-14
**Author:** Claude Code Analysis
**Status:** Proposal - Pending Review
