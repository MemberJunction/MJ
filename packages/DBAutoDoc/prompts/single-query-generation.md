# Generate SQL for Single Query

You are implementing SQL for a planned reference query. This query will serve as an example for AI agents and developers.

## Query Plan

**Query ID:** {{ queryPlan.id }}
**Name:** {{ queryPlan.name }}
**Description:** {{ queryPlan.description }}
**Business Purpose:** {{ queryPlan.businessPurpose }}
**Type:** {{ queryPlan.queryType }}
**Pattern:** {{ queryPlan.queryPattern }}
**Complexity:** {{ queryPlan.complexity }}

{% if queryPlan.relatedQueryIds.length > 0 %}
**Related Queries:** {{ queryPlan.relatedQueryIds | join(', ') }}
⚠️ **ALIGNMENT REQUIRED**: This query must use consistent filtering logic with its related queries!
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

{% if relatedQueryPlans.length > 0 %}
## Related Query Plans (for alignment)
{% for plan in relatedQueryPlans %}
### {{ plan.name }} (ID: {{ plan.id }})
- **Type:** {{ plan.queryType }}
- **Purpose:** {{ plan.businessPurpose }}
- **Description:** {{ plan.description }}
{% endfor %}

⚠️ **CRITICAL**: Your SQL MUST use filtering logic that aligns with these related queries!
{% endif %}

---

## Task

Generate executable, parameterized SQL for this query plan.

### Requirements

1. **Executable SQL**: Must be valid SQL for {{ databaseType }}
2. **Parameterized**: Use `@ParameterName` for dynamic values
3. **Efficient**: Use appropriate indexes (primary keys, foreign keys)
4. **Well-Formatted**: Readable, properly indented SQL
5. **Documented Logic**: Explain filtering, aggregation, and join rules

### Parameter Guidelines
- Use descriptive parameter names: `@StartDate`, `@MemberID`, `@Status`
- Include diverse example values that reflect real data patterns
- Mark required vs. optional parameters
- Provide default values where appropriate

### Business Logic Documentation
Document the **rules and logic** that make this query work correctly:

**Filtering Rules**: What filters are applied and why
- Example: "Always filter by Status='Active' to exclude archived records"
- Example: "Date range filters use >= StartDate AND < EndDate for consistency"

**Aggregation Rules**: How data is grouped and calculated
- Example: "Use COUNT(DISTINCT MemberID) to avoid double-counting"
- Example: "GROUP BY uses fiscal quarters (Oct-Dec = Q1)"

**Join Rules**: How tables are related
- Example: "LEFT JOIN ensures all events included even without registrations"
- Example: "INNER JOIN filters to only members with active certifications"

**Alignment Notes** (if relatedQueryIds exist):
- Explicitly state how filtering must match related queries
- Example: "MUST filter by Status='Completed' to match summary query totals"

### Sample Result Columns
Define what columns the query returns and what they mean:
- Column name
- Data type
- Description
- Whether it's a measure (numeric metric) or dimension (grouping)

---

## Output Format

Return a JSON object with this structure:

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
  "alignmentNotes": "How this query's filtering logic aligns with related queries (if relatedQueryIds exist)"
}
```

**IMPORTANT:**
- SQL must be executable against {{ databaseType }}
- All JSON must be valid and parseable
- Use actual column names from the schema above
- Parameters use `@ParameterName` syntax for {{ databaseType }}
{% if queryPlan.relatedQueryIds.length > 0 %}
- **CRITICAL**: Filtering logic MUST align with related queries to prevent mismatched totals!
{% endif %}
