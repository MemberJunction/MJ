# Query Planning for Database Documentation

You are designing a set of reference SQL queries for the **{{ focusTable }}** table in the **{{ schemaName }}** schema. These queries will serve as examples for AI agents and developers.

## Database Context

**Database Type:** {{ databaseType }}

**Focus Table:** {{ focusTable }}
{{ tables[0].description }}

**Row Count:** {{ tables[0].rowCount }}

### Columns
{% for col in tables[0].columns %}
- **{{ col.name }}** ({{ col.dataType }}){% if col.isPrimaryKey %} [PRIMARY KEY]{% endif %}{% if col.isForeignKey %} [FOREIGN KEY]{% endif %}
  {% if col.description %}{{ col.description }}{% endif %}
  {% if col.possibleValues %}Possible values: {{ col.possibleValues | jsoninline }}{% endif %}
{% endfor %}

### Relationships
{% if tables[0].foreignKeys.length > 0 %}
**Foreign Keys:**
{% for fk in tables[0].foreignKeys %}
- {{ fk.column }} → {{ fk.referencesTable }}.{{ fk.referencesColumn }}
{% endfor %}
{% endif %}

{% if tables[0].dependents.length > 0 %}
**Referenced By:** {{ tables[0].dependents | join(', ') }}
{% endif %}

{% if tables.length > 1 %}
### Related Tables Available
{% for table in tables | slice(1) %}
- **{{ table.name }}** ({{ table.rowCount }} rows){% if table.description %}: {{ table.description }}{% endif %}
{% endfor %}
{% endif %}

{% if seedContext %}
## Database Purpose
{{ seedContext }}
{% endif %}

{% if existingQueries.length > 0 %}
## Already Planned Queries
Avoid duplicating these query patterns:
{% for q in existingQueries %}
- {{ q.name }} ({{ q.queryType }}, {{ q.queryPattern }})
{% endfor %}
{% endif %}

---

## Task

Plan **{{ queriesPerTable }}** diverse, high-quality reference queries for the {{ focusTable }} table. Each query should demonstrate different patterns and business use cases.

### Query Types to Consider
- **aggregation**: GROUP BY with counts/sums/averages
- **filter**: SELECT with WHERE clauses
- **join**: Queries with related tables
- **detail**: Detailed record views
- **summary**: High-level aggregations
- **ranking**: TOP N / ORDER BY queries
- **time-series**: Date-based aggregations (if date columns exist)
- **drill-down**: Detail queries that support summary aggregations

### Query Patterns to Use
- simple-select
- filtered-select
- aggregation-group-by
- time-series-aggregation (if date columns available)
- join-detail
- left-join-counts
- drill-down-detail
- ranking-top-n
- multi-level-aggregation

### Complexity Distribution
- 40% simple: Basic SELECTs, single-table queries
- 40% moderate: JOINs, GROUP BY, basic aggregations
- 20% complex: Multi-table JOINs, nested aggregations, complex filtering

### Requirements
1. **Diversity**: Each query should demonstrate a different pattern or use case
2. **Business Value**: Focus on real-world business questions
3. **Alignment**: If creating summary + detail pairs, note their relationship in `relatedQueryIds`
4. **Realistic**: Queries should reflect actual data analysis needs
5. **Progressive Complexity**: Start simple, build to more complex patterns

### Multi-Query Alignment
When planning related queries (e.g., summary + drill-down detail):
- Use `relatedQueryIds` to link them
- Ensure they use **consistent filtering logic**
- Plan alignment notes for implementation phase

Example alignment issue to AVOID:
- Summary: "COUNT(*) FROM Registrations" (counts ALL)
- Detail: "SELECT * FROM Registrations WHERE Status='Attended'" (filters by status)
- ❌ Numbers won't match - bad user experience

Correct approach:
- Summary: "COUNT(*) FROM Registrations WHERE Status='Attended'"
- Detail: "SELECT * FROM Registrations WHERE Status='Attended'"
- ✅ Aligned filtering = numbers match

---

## Output Format

Return a JSON object with this structure:

```json
{
  "queries": [
    {
      "id": "unique-id-1",
      "name": "Clear, Descriptive Query Name",
      "description": "What this query does and returns",
      "businessPurpose": "Why someone would run this query - what business question it answers",
      "queryType": "aggregation|filter|join|detail|summary|ranking|time-series|drill-down",
      "queryPattern": "simple-select|filtered-select|aggregation-group-by|time-series-aggregation|join-detail|left-join-counts|drill-down-detail|ranking-top-n|multi-level-aggregation",
      "complexity": "simple|moderate|complex",
      "primaryEntities": [
        {"schema": "{{ schemaName }}", "table": "{{ focusTable }}", "alias": "main"}
      ],
      "relatedEntities": [
        {"schema": "{{ schemaName }}", "table": "RelatedTable", "alias": "rel"}
      ],
      "relatedQueryIds": ["unique-id-2"],
      "confidence": 0.95,
      "reasoning": "Why this query is valuable and how it differs from others"
    }
  ]
}
```

**IMPORTANT:**
- Generate exactly {{ queriesPerTable }} diverse queries
- Ensure variety in queryType and queryPattern
- Link related queries via relatedQueryIds for alignment tracking
- All output must be valid, parseable JSON
- Use realistic business terminology from the domain
