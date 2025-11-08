## Advanced Data Analysis with Codesmith

When you have structured data that requires mathematical operations, statistical analysis, or complex transformations, use the **Codesmith Agent** sub-agent for analytical processing.

### When to Use Codesmith

✅ **Use Codesmith When You Have:**
- **Statistical Analysis Needs**: Averages, medians, standard deviations, correlations, regressions
- **Complex Calculations**: Growth rates, percentages, ratios, moving averages, percentiles
- **Data Transformations**: Pivoting, unpivoting, merging, normalizing, deduplication
- **Cross-Source Synthesis**: Combining data from multiple sources or queries
- **Pattern Detection**: Outlier analysis, trend identification, clustering
- **Custom Business Logic**: Domain-specific calculations that are easier in code than LLM reasoning

✅ **Specific Scenarios:**
- Analyzing 50+ data points where LLM might hallucinate numbers
- Calculations requiring precision (financial, scientific, statistical)
- Iterative computations (compound growth, recursive calculations)
- Matrix operations, linear algebra, or advanced mathematics
- Time series analysis with date arithmetic
- Large dataset aggregations and grouping

❌ **Don't Use Codesmith For:**
- **Simple Extraction**: LLM can extract facts from text perfectly well
- **Single-Item Calculations**: "What's 10% of $500?" - LLM handles this
- **Qualitative Analysis**: Sentiment analysis, content summarization, interpretation
- **Small Datasets**: 3-5 data points where LLM can reason accurately
- **Text Generation**: Writing summaries, explanations, or narratives

### How to Invoke Codesmith

**CRITICAL RULE**: Always include the actual data in your message to Codesmith. Don't reference it - include it inline!

```json
{
  "taskComplete": false,
  "reasoning": "Gathered 50 data points - need statistical analysis with confidence LLM won't hallucinate",
  "nextStep": {
    "type": "Sub-Agent",
    "subAgent": {
      "name": "Codesmith Agent",
      "message": "I have data in CSV format with 50 rows:

[INCLUDE THE ACTUAL DATA HERE - CSV or JSON format]
Item,Category,Value,Date
Product A,Electronics,299.99,2024-01-15
Product B,Electronics,149.99,2024-01-16
...
(paste all 50 rows)

Please write JavaScript code to:
1. [Specific calculation 1]
2. [Specific calculation 2]
3. [Specific analysis task 3]

Return results as a JSON object with clear structure.",
      "terminateAfter": false
    }
  }
}
```

### Available Libraries in Codesmith

Codesmith provides these JavaScript libraries for data processing:

- **lodash** (`_`): Grouping, sorting, filtering, statistical functions (mean, median, etc.)
- **mathjs**: Advanced mathematics, linear regression, correlation, standard deviation, Z-scores
- **date-fns**: Date arithmetic, parsing, formatting, quarter/month calculations
- **papaparse**: CSV parsing and generation
- **validator**: Data validation, URL/email checking, sanitization
- **uuid**: Generate unique identifiers

### General Workflow Pattern

```
Step 1: Gather & Normalize Data
[Your agent gathers data from your domain]
→ Normalize into CSV or JSON format
→ Ensure clean, structured format

Step 2: Invoke Codesmith for Analysis
→ Include ALL data in message (don't reference it)
→ Specify exact calculations needed
→ Request structured JSON output

Step 3: Receive Analysis Results
→ Codesmith writes code, executes it, returns results
→ Results include both the code and output

Step 4: Add to Findings
→ Create one finding with normalized data
→ Create another finding with calculated insights
→ Reference Codesmith as source method
```

### Example Output Pattern After Using Codesmith

```json
{
  "taskComplete": true,
  "reasoning": "Gathered 50 data points, normalized to CSV, ran statistical analysis via Codesmith",
  "payloadChangeRequest": {
    "newElements": {
      "findings": [
        {
          "description": "Normalized data from [your source type]",
          "data": "[CSV or JSON data here]",
          "source": {
            "type": "[web|database|storage|knowledge_base]",
            "sources": ["src_001", "src_002", ...],
            "searchQueries": ["your query"]
          }
        },
        {
          "description": "Statistical analysis: [summary of key insights with numbers]",
          "analysis": {
            "summary": {
              "average": 42.5,
              "median": 40.0,
              "stdDev": 12.3
            },
            "trends": {
              "slope": 0.05,
              "interpretation": "5% growth per period"
            },
            "outliers": ["Item X", "Item Y"],
            "insights": ["Key insight 1", "Key insight 2"]
          },
          "source": {
            "type": "calculated",
            "method": "codesmith",
            "basedOn": ["finding_001"]
          }
        }
      ]
    }
  }
}
```

### Best Practices for Codesmith Usage

1. **Always Include Data**: Paste the actual data in your message - Codesmith needs to see it
2. **Use Structured Formats**: CSV for tabular data, JSON for hierarchical data
3. **Be Specific**: Don't ask "analyze this" - specify exact calculations needed
4. **Request JSON Output**: Makes it easy to parse and add to findings
5. **Document Units**: Include units in column names (PriceUSD, WeightKg) or specify in message
6. **Limit Data Size**: If you have thousands of rows, sample or aggregate first
7. **Two Findings Pattern**: One for raw normalized data, one for calculated insights
8. **Source Attribution**: Always mark Codesmith analysis with `"method": "codesmith"`

### Common Calculation Examples

**Statistical Analysis:**
```javascript
// Codesmith can calculate:
- mean, median, mode, standard deviation
- percentiles (25th, 50th, 75th)
- variance, coefficient of variation
- Z-scores for outlier detection
```

**Trend Analysis:**
```javascript
// Linear regression for trends:
- slope and intercept
- R-squared (fit quality)
- predictions based on trend
```

**Comparative Analysis:**
```javascript
// Comparisons across groups:
- Group by category, calculate metrics per group
- Compare growth rates between segments
- Rank items by calculated scores
```

**Time Series:**
```javascript
// Temporal analysis:
- Period-over-period growth rates
- Moving averages (7-day, 30-day)
- Seasonality detection
- Date range aggregations
```

Remember: Codesmith excels at **precision** and **scale**. Use it when you need mathematical accuracy or are processing many data points. For interpretation, narrative, or small datasets, rely on your LLM capabilities.
