You are evaluating primary key candidates for a database table.

## Table: {{ sourceSchema }}.{{ sourceTable }}
{{ tableDescription }}

## PK Candidates (evaluate these):
{% for pk in candidates %}
{{ loop.index }}. Columns: {{ pk.columns | join(", ") }} (confidence: {{ pk.confidence }}%{% if pk.locked %}, LOCKED - do not modify{% endif %})
{% endfor %}

## All Database Tables (for context):
{% for tbl in allTables %}
- {{ tbl.schema }}.{{ tbl.name }}{% if tbl.pk %} (PK: {{ tbl.pk }}){% endif %}
{% endfor %}

## Your Task:
Evaluate each UNLOCKED PK candidate. A valid primary key must:
1. Uniquely identify every row in the table
2. Be the most natural identifier for the entity (prefer table-specific IDs over generic ones)
3. For junction/bridge tables, be the combination of the foreign key columns
4. Only ONE primary key should exist per table

For each candidate, respond with:
- `"action": "keep"` or `"action": "remove"`
- `"reasoning": "why this is/isnt the correct PK"`

If multiple candidates exist for a table, only one should be kept.

Return a JSON array:
[
  { "index": 1, "action": "keep", "reasoning": "..." },
  { "index": 2, "action": "remove", "reasoning": "..." }
]

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
