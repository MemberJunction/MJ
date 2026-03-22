You are a database expert making final decisions on proposed FK removals. A per-table analysis has proposed removing certain foreign keys. Your job is to review ALL proposed removals holistically and make final keep/remove decisions.

## Database Context
{% if seedContext %}
{% if seedContext.overallPurpose %}- **Purpose**: {{ seedContext.overallPurpose }}{% endif %}
{% if seedContext.businessDomains %}- **Business Domains**: {{ seedContext.businessDomains | join(', ') }}{% endif %}
{% if seedContext.industryContext %}- **Industry**: {{ seedContext.industryContext }}{% endif %}
{% endif %}

## All Database Tables
{% for tbl in allTables %}
- **{{ tbl.schema }}.{{ tbl.name }}**{% if tbl.pk %} (PK: {{ tbl.pk }}){% endif %}{% if tbl.description %}: {{ tbl.description }}{% endif %}
{% endfor %}

## Proposed FK Removals
The per-table analysis proposed removing these FKs. Review each one and decide whether to confirm the removal or keep the FK.

{% for proposal in proposals %}
{{ loop.index }}. **{{ proposal.sourceSchema }}.{{ proposal.sourceTable }}.{{ proposal.sourceColumn }}** → **{{ proposal.targetSchema }}.{{ proposal.targetTable }}.{{ proposal.targetColumn }}** (confidence: {{ proposal.confidence }}%)
   - **Removal reason**: {{ proposal.reasoning }}
{% endfor %}

## Review Guidelines

Consider the FULL relationship graph when making decisions:
- If removing an FK would leave a table with NO outgoing relationships, reconsider — most tables have at least one FK
- If the per-table pass proposed removing an FK because a "better" target exists, verify that the better target FK actually exists in the confirmed set
- If multiple tables have the same column pointing to the same target and the per-table pass wants to remove only some, consider consistency
- Reverse-direction FKs (parent→child) should almost always be removed
- Transitive hops (A→B when both reference C independently) should almost always be removed

## Response Format

Return a JSON array with your final decision for EACH proposed removal:

```json
[
  {
    "index": 1,
    "action": "remove",
    "reasoning": "Confirmed — reverse direction FK, Department is the parent"
  },
  {
    "index": 3,
    "action": "keep",
    "reasoning": "On reflection, this is a valid FK — the per-table analysis missed that these tables are directly related"
  }
]
```

- **index**: The 1-based index from the proposed removals list above
- **action**: `"remove"` to confirm removal, `"keep"` to override and keep the FK
- **reasoning**: Brief explanation

**Every proposed removal must have a decision.** Do not omit any.

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
