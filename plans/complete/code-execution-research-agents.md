# Code Execution Integration for Research Agents

## Overview

Enable Database Research Agent and Report Writer Agent to leverage the code execution sandbox for data transformation, statistical analysis, and complex calculations. This extends their capabilities beyond basic querying and LLM processing to include programmatic data manipulation.

## Current State

### Existing Code Execution Infrastructure
- ✅ `@memberjunction/code-execution` package - Sandboxed JavaScript execution service
- ✅ `Execute Code` action - Thin wrapper exposing execution to agents/workflows
- ✅ `Codesmith Agent` - Loop agent that generates, tests, and refines code iteratively
- ✅ Curated libraries: lodash, date-fns, mathjs, papaparse, uuid, validator
- ✅ Security: vm2 sandbox, timeouts, blocked filesystem/network access

### Current Research Agent Capabilities
**Database Research Agent:**
- Discovers entities via schema exploration
- Executes queries via RunView
- Returns raw CSV/JSON data
- Limited to SQL-level aggregations

**Report Writer Agent:**
- Receives data from sub-agents
- Generates HTML reports with visualizations
- Calls SVG actions for charts/diagrams
- Limited to LLM-based data formatting

## Problem Statement

Both agents currently lack the ability to perform **programmatic data transformations** that would be more efficient in code than prompting:

### Database Research Agent Gaps
1. **Complex Aggregations**: Group by multiple dimensions, pivot tables, percentile calculations
2. **Date Arithmetic**: Quarter/fiscal year grouping, date range analysis
3. **Statistical Analysis**: Averages, medians, standard deviations, correlations
4. **Data Cleansing**: Deduplication, normalization, outlier detection
5. **Format Conversions**: Transforming flat data to hierarchical structures

### Report Writer Agent Gaps
1. **Metric Calculations**: Computing KPIs, growth rates, derived values
2. **Data Preparation**: Formatting data for visualization specs
3. **Summary Statistics**: Rolling up raw data for tables/charts
4. **Data Validation**: Checking data quality before visualization

## Proposed Solution

### Phase 1: Database Research Agent Enhancement

**Goal**: Enable programmatic post-query data processing

#### Implementation Steps

1. **Add Execute Code Action**
   - Update `.database-research-agent.json` to include Execute Code in available actions
   - No schema changes required (action already exists)

2. **Update Agent Prompt**
   - Add new section: "Using Code for Data Processing"
   - Define clear use cases (when to use code vs SQL vs LLM)
   - Provide code generation examples
   - Include error handling guidance

3. **Prompt Guidelines**
   ```markdown
   ## When to Use Code vs SQL

   **Use SQL (RunView) when:**
   - Basic filtering and sorting
   - Simple aggregations (SUM, COUNT, AVG)
   - Joining related entities
   - Leveraging database indexes

   **Use Code (Execute Code) when:**
   - Complex grouping/pivoting beyond SQL capabilities
   - Statistical calculations (median, percentiles, std dev)
   - Date arithmetic (fiscal quarters, relative dates)
   - Data transformations (flat to hierarchical, denormalization)
   - Cleaning/validation (deduplication, outlier detection)

   **Use LLM when:**
   - Summarizing text content
   - Interpreting qualitative data
   - Generating natural language insights
   ```

4. **Workflow Pattern**
   ```
   User Request: "Show quarterly sales trends by region"

   Step 1: Database Query (RunView)
   → SELECT * FROM Sales WHERE Date >= '2024-01-01'
   → Returns 10,000 raw sales records

   Step 2: Code Execution (Execute Code)
   → Group by fiscal quarter and region
   → Calculate totals, averages, growth rates
   → Returns structured summary (40 rows)

   Step 3: Return to User/Parent Agent
   → CSV summary for Report Writer
   → Raw data optionally included
   ```

### Phase 2: Report Writer Agent Enhancement

**Goal**: Enable dynamic metric calculation and data preparation for visualizations

#### Implementation Steps

1. **Add Execute Code Action**
   - Update `.research-agent.json` to include Execute Code for Report Writer sub-agent
   - Ensure Report Writer has access to code execution

2. **Update Agent Prompt**
   - Add section: "Computing Metrics with Code"
   - Provide examples of data prep for SVG actions
   - Show metric calculation patterns

3. **Prompt Guidelines**
   ```markdown
   ## When to Use Code for Report Generation

   **Use Code when:**
   - Computing derived metrics (growth rates, percentages, ratios)
   - Aggregating data for charts (grouping, binning, summarizing)
   - Formatting data for visualization specs (hierarchical, nested, keyed)
   - Validating data completeness before visualization
   - Creating summary tables with calculated columns

   **Example: Preparing Data for SVG Chart**

   Input: 1000 sales records with dates and amounts

   Code:
   ```javascript
   const _ = require('lodash');
   const { format, startOfMonth } = require('date-fns');

   // Group sales by month
   const byMonth = _.chain(input.sales)
     .map(sale => ({
       month: format(startOfMonth(new Date(sale.date)), 'yyyy-MM'),
       amount: sale.amount
     }))
     .groupBy('month')
     .map((items, month) => ({
       month,
       total: _.sumBy(items, 'amount'),
       count: items.length,
       average: _.meanBy(items, 'amount')
     }))
     .orderBy('month')
     .value();

   output = byMonth;
   ```

   Output: 12 month summary rows → Feed to Create SVG Chart
   ```

### Phase 3: Error Handling & Fallbacks

**Strategy**: Code execution is optional enhancement, not required capability

1. **Graceful Degradation**
   - If code execution fails, fall back to SQL/LLM approach
   - Track failures in payload for debugging
   - Warn user if code would have been beneficial but failed

2. **Validation**
   - Validate code output matches expected structure
   - Handle timeout/memory errors gracefully
   - Log execution metrics (time, tokens saved)

3. **Iteration Limits**
   - Max 3 code execution attempts per task
   - If all fail, proceed without code enhancement
   - Document limitation in final report

## Benefits

### Performance
- **Reduced Token Usage**: Compute instead of prompting for math
- **Faster Execution**: JavaScript is faster than multi-turn LLM calls
- **Lower Costs**: Avoid expensive LLM calls for calculations

### Capabilities
- **Statistical Rigor**: Proper median, percentile, correlation calculations
- **Complex Transformations**: Multi-dimensional grouping, pivoting
- **Data Quality**: Programmatic validation and cleansing

### User Experience
- **Accurate Results**: No LLM hallucination in numeric calculations
- **Reproducibility**: Same input = same output (deterministic)
- **Transparency**: Show code used for calculations

## Alternative Approaches Considered

### Option 1: Delegate to Codesmith Agent (Not Recommended)
**Pros**: Clean separation of concerns
**Cons**: Extra sub-agent hop adds latency, complexity, and potential for communication failures

### Option 2: Create Specialized "Analyst" Sub-Agent (Future Enhancement)
**Pros**: Could be shared across multiple agents
**Cons**: More coordination overhead, deferred for now

### Option 3: Teach Agents to Write Code in Prompts (Anti-Pattern)
**Pros**: No additional actions needed
**Cons**: No execution, validation, or testing - just generates code snippets for users

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Code execution errors break agent flow | Medium | Implement fallback to non-code approach |
| Agents over-rely on code, underuse SQL | Low | Clear prompt guidance on when to use each |
| Security concerns with generated code | High | Already mitigated by vm2 sandbox, timeouts |
| Increased prompt complexity | Medium | Organize prompts clearly, provide examples |
| Performance regression if misused | Low | Monitor execution time, add timeout limits |

## Success Metrics

### Quantitative
- Reduction in token usage for numeric-heavy queries (target: 30-50%)
- Faster execution time for aggregation tasks (target: 20-40% improvement)
- Lower LLM costs on data analysis requests (track before/after)

### Qualitative
- More accurate statistical calculations (no hallucination)
- Better structured data for visualizations
- User satisfaction with analysis depth

## Implementation Checklist

### Database Research Agent
- [ ] Add Execute Code to available actions in `.database-research-agent.json`
- [ ] Update `database-research-agent.md` prompt with code execution section
- [ ] Add "When to Use Code vs SQL vs LLM" decision tree
- [ ] Include 5-7 code examples for common transformations
- [ ] Document error handling and fallback behavior
- [ ] Test with real-world scenarios (sales analysis, multi-dimensional grouping)

### Report Writer Agent
- [ ] Add Execute Code to available actions in `.research-agent.json`
- [ ] Update `research-report-writer.md` prompt with metric calculation section
- [ ] Add examples of data prep for each SVG action type
- [ ] Show metric calculation patterns (growth rates, percentages, ratios)
- [ ] Document when to compute vs when to query
- [ ] Test with hierarchical data, summary tables, chart preparation

### Testing
- [ ] Database Agent: Query → Transform → Return pattern
- [ ] Report Writer: Receive data → Compute metrics → Visualize pattern
- [ ] Error scenarios: timeout, syntax error, runtime error
- [ ] Fallback behavior when code execution unavailable
- [ ] Performance comparison: with vs without code execution

## Timeline Estimate

- **Prompt Updates**: 2-3 hours (both agents)
- **Action Configuration**: 15 minutes (metadata updates)
- **Testing**: 2-3 hours (various scenarios)
- **Documentation**: 1 hour (examples, best practices)

**Total**: ~6-8 hours of focused work

## Open Questions

1. Should we add code execution to Web Research Agent and File Research Agent?
   - **Recommendation**: Defer until we see value in Database/Report Writer

2. Should agents store generated code in payload for debugging?
   - **Recommendation**: Yes, helpful for transparency and debugging

3. Should we create pre-built code snippets library?
   - **Recommendation**: Good future enhancement, not required for MVP

4. Should Codesmith Agent be available as sub-agent to Research Agent?
   - **Recommendation**: No, Execute Code action is sufficient for this use case

## References

- Code Execution Package: `/packages/Actions/CodeExecution/`
- Execute Code Action: `/packages/Actions/CoreActions/src/custom/code-execution/execute-code.action.ts`
- Codesmith Agent: `/metadata/agents/.codesmith-agent.json`
- Database Research Agent: `/metadata/prompts/templates/research-agent/database-research-agent.md`
- Report Writer Agent: `/metadata/prompts/templates/research-agent/research-report-writer.md`
