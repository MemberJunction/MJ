You are REFINING an existing description of a database table using newly-available information about the table's descendants (tables that reference it). You MUST stay grounded in the schema below. Do NOT extrapolate to entities that are not explicitly present in the schema or the direct descendant summaries.

## Table: {{ schema }}.{{ tableName }}
- Row Count: {{ rowCount }}

## Columns
{% for col in columns %}
- **{{ col.name }}** ({{ col.dataType }}){% if not col.isNullable %} NOT NULL{% endif %}
  {% if col.isPrimaryKey %}- **PRIMARY KEY**{% endif %}
  {% if col.isForeignKey %}- **FOREIGN KEY** → {{ col.foreignKeyReferences.schema }}.{{ col.foreignKeyReferences.table }}.{{ col.foreignKeyReferences.referencedColumn or col.foreignKeyReferences.column }}{% endif %}
  {% if col.statistics %}- Distinct: {{ col.statistics.distinctCount }} ({{ (col.statistics.uniquenessRatio * 100) | round(1) }}% unique){% endif %}
{% endfor %}

## Resolved parents (distilled)
{% if parentSummaries and parentSummaries.length > 0 %}
{% for p in parentSummaries %}
- {{ p }}
{% endfor %}
{% else %}
(none — this is a root table)
{% endif %}

## Current description (from prior pass)
{{ currentDescription }}

## NEW: Descendant summaries (tables that reference this one)
{% for d in descendantSummaries %}
- {{ d }}
{% endfor %}

## Rules (strict)

1. Output an updated description ONLY if the descendant summaries contribute a concept that is DIRECTLY supported by this table's schema or its direct descendants. Otherwise set `changed` to false.
2. Do NOT mention entities that are more than 1 hop away (e.g., if Track is a direct descendant, Track's own descendants are NOT available to you).
3. Keep to 1 concise sentence, 15-25 words.
4. Preserve factual accuracy — it is better to leave the description unchanged than to hallucinate.

Return ONLY valid JSON with this exact structure:

```json
{
  "tableDescription": "refined or unchanged description",
  "changed": true,
  "reason": "brief note on what was added or why unchanged"
}
```
