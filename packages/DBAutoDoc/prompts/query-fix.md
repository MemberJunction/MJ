# Fix Failed SQL Query

You are fixing a SQL query that failed validation. Your task is to analyze the error and provide a corrected version of the SQL.

## Original Query Plan

**Query ID:** {{ queryPlan.id }}
**Name:** {{ queryPlan.name }}
**Description:** {{ queryPlan.description }}
**Business Purpose:** {{ queryPlan.businessPurpose }}
**Type:** {{ queryPlan.queryType }}
**Pattern:** {{ queryPlan.queryPattern }}
**Complexity:** {{ queryPlan.complexity }}

{% if queryPlan.relatedQueryIds.length > 0 %}
**Related Queries:** {{ queryPlan.relatedQueryIds | join(', ') }}
{% endif %}

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

## Failed Query

### Current SQL
```sql
{{ currentSQL }}
```

### Error Message
```
{{ errorMessage }}
```

{% if attemptNumber > 1 %}
### Previous Fix Attempts
This is attempt {{ attemptNumber }} of {{ maxAttempts }}.

{% for attempt in previousAttempts %}
**Attempt {{ loop.index }}:**
```sql
{{ attempt.sql }}
```
Error: `{{ attempt.error }}`

{% endfor %}
{% endif %}

---

## Task

Analyze the error and provide a corrected SQL query that:
1. Fixes the specific error mentioned above
2. Maintains the original business purpose and query intent
3. Uses correct column names and data types from the schema
4. Is valid and executable against {{ databaseType }}

### Common Issues to Check
- **Column name errors**: Verify column names match the schema exactly (case-sensitive)
- **Table name errors**: Check table names and aliases are correct
- **Data type mismatches**: Ensure comparisons use compatible types
- **Syntax errors**: Fix SQL syntax for {{ databaseType }}
- **Missing joins**: Add required joins if referencing multiple tables
- **Aggregation errors**: Ensure all non-aggregated columns are in GROUP BY
- **Parameter syntax**: Use `@ParameterName` format for {{ databaseType }}

---

## Output Format

Return a JSON object with the corrected query:

```json
{
  "sqlQuery": "SELECT ...",
  "parameters": [
    {
      "name": "ParameterName",
      "dataType": "VARCHAR|INT|DATE|...",
      "description": "What this parameter controls",
      "required": true,
      "defaultValue": "DefaultIfAny",
      "exampleValues": ["Example1", "Example2", "Example3"]
    }
  ],
  "sampleResultColumns": [
    {
      "name": "ColumnName",
      "dataType": "VARCHAR|INT|DECIMAL|...",
      "description": "What this column contains",
      "isMeasure": false,
      "isDimension": true
    }
  ],
  "filteringRules": [
    "Explicit rule about how filtering works in this query"
  ],
  "aggregationRules": [
    "Explicit rule about how aggregation works (if applicable)"
  ],
  "joinRules": [
    "Explicit rule about how tables are joined (if applicable)"
  ],
  "alignmentNotes": "How this query's filtering logic aligns with related queries (if relatedQueryIds exist)",
  "fixExplanation": "Brief explanation of what was wrong and how it was fixed"
}
```

**IMPORTANT:**
- The corrected SQL must be valid and executable against {{ databaseType }}
- All JSON must be valid and parseable
- Use actual column names from the schema above
- The fix must address the specific error while preserving the query's business purpose
