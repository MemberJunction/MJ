You are performing a final review of proposed primary key removals across a database.

## Proposed PK Removals:
{% for p in proposals %}
{{ loop.index }}. {{ p.sourceSchema }}.{{ p.sourceTable }}: columns [{{ p.columns | join(", ") }}] (confidence: {{ p.confidence }}%)
   Reasoning: {{ p.reasoning }}
{% endfor %}

## All Database Tables:
{% for tbl in allTables %}
- {{ tbl.schema }}.{{ tbl.name }}{% if tbl.pk %} (PK: {{ tbl.pk }}){% endif %}{% if tbl.description %} — {{ tbl.description }}{% endif %}
{% endfor %}

## Your Task:
Review each proposed removal. Consider:
1. Would removing this PK leave the table without any primary key?
2. Is this PK actually correct and should not be removed?
3. Are there any cross-table consistency issues?

For each proposal, confirm or reject the removal:
[
  { "index": 1, "action": "remove", "reasoning": "Confirmed: not the real PK" },
  { "index": 2, "action": "keep", "reasoning": "Actually correct, do not remove" }
]

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
