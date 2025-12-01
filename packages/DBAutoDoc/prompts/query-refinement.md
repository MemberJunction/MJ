# Refine SQL Query Based on Results

You are reviewing the results of a SQL query to determine if it correctly fulfills its intended business purpose. Analyze the sample results and suggest improvements if needed.

## Query Information

**Query ID:** {{ queryPlan.id }}
**Name:** {{ queryPlan.name }}
**Description:** {{ queryPlan.description }}
**Business Purpose:** {{ queryPlan.businessPurpose }}
**Type:** {{ queryPlan.queryType }}
**Pattern:** {{ queryPlan.queryPattern }}

## Database Context

**Database Type:** {{ databaseType }}
**Schema:** {{ schemaName }}

### Primary Table: {{ focusTable }}
{{ tableInfo.description }}

**Columns:**
{% for col in tableInfo.columns %}
- **{{ col.name }}** ({{ col.dataType }}){% if col.isPrimaryKey %} [PK]{% endif %}{% if col.isForeignKey %} [FK → {{ col.foreignKeyReferences.referencesTable }}]{% endif %}
  {% if col.description %}{{ col.description }}{% endif %}
  {% if col.possibleValues %}Values: {{ col.possibleValues | jsoninline }}{% endif %}
{% endfor %}

{% if relatedTables.length > 0 %}
### Related Tables
{% for table in relatedTables %}
**{{ table.name }}** ({{ table.rowCount }} rows)
{% if table.description %}{{ table.description }}{% endif %}

Columns:
{% for col in table.columns %}
- {{ col.name }} ({{ col.dataType }}){% if col.isPrimaryKey %} [PK]{% endif %}
{% endfor %}

{% endfor %}
{% endif %}

---

## Current Query

### SQL
```sql
{{ currentSQL }}
```

### Parameters
{% for param in parameters %}
- **@{{ param.name }}** ({{ param.dataType }}): {{ param.description }}
{% endfor %}

### Expected Result Columns
{% for col in sampleResultColumns %}
- **{{ col.name }}** ({{ col.dataType }}): {{ col.description }}{% if col.isMeasure %} [Measure]{% endif %}{% if col.isDimension %} [Dimension]{% endif %}
{% endfor %}

---

## Sample Results

The query returned **{{ totalRows }} rows**. Here are {{ sampleRows.length }} sample rows:

{% if sampleRows.length > 0 %}
| {% for col in resultColumnNames %}{{ col }} | {% endfor %}
| {% for col in resultColumnNames %}--- | {% endfor %}
{% for row in sampleRows %}
| {% for col in resultColumnNames %}{{ row[col] }} | {% endfor %}
{% endfor %}
{% else %}
*No rows returned*
{% endif %}

{% if refinementNumber > 1 %}
### Previous Refinement Attempts
This is refinement attempt {{ refinementNumber }} of {{ maxRefinements }}.

{% for attempt in previousRefinements %}
**Attempt {{ loop.index }}:**
Feedback: {{ attempt.feedback }}
{% endfor %}
{% endif %}

---

## Task

Analyze the sample results and determine if the query correctly fulfills its business purpose.

### Questions to Consider

1. **Data Completeness**: Are we getting the expected columns and data? Are any important fields missing?

2. **Filter Correctness**: Do the results match the intended filters? For example:
   - If filtering by "Active" status, do all rows show "Active"?
   - If filtering by date range, are dates within the expected range?

3. **Aggregation Accuracy**: If this is an aggregation query:
   - Do the counts/sums/averages seem reasonable?
   - Is the grouping correct?

4. **Join Behavior**: Are we including or excluding records correctly?
   - Are there unexpected NULL values from missing joins?
   - Are we over-filtering by using INNER JOIN instead of LEFT JOIN?

5. **Business Logic**: Does the data make sense for the stated business purpose?
   - Any unexpected patterns or outliers?
   - Any values that shouldn't appear based on the query intent?

### Decision

Based on your analysis, decide one of the following:

1. **KEEP** - The query is correct and results match the business purpose
2. **REFINE** - The query needs improvements to better match the business purpose

---

## Output Format

Return a JSON object:

```json
{
  "decision": "KEEP" | "REFINE",
  "analysis": "Brief analysis of the results and why they do or don't match the business purpose",
  "issues": [
    "List of specific issues found (if any)"
  ],
  "refinedQuery": {
    "sqlQuery": "SELECT ... (only if decision is REFINE)",
    "parameters": [...],
    "sampleResultColumns": [...],
    "filteringRules": [...],
    "aggregationRules": [...],
    "joinRules": [...],
    "alignmentNotes": "..."
  },
  "refinementExplanation": "What was changed and why (only if decision is REFINE)"
}
```

**IMPORTANT:**
- Only provide `refinedQuery` if decision is "REFINE"
- The refined SQL must be valid and executable against {{ databaseType }}
- Preserve the original business purpose - don't change what the query is meant to do
- Focus on correctness, not optimization
