You are a database expert reviewing foreign key relationships for a single table. Your job is to identify ONLY the clearly incorrect FKs that should be removed.

## Table: {{ sourceSchema }}.{{ sourceTable }}
{% if tableDescription %}**Description**: {{ tableDescription }}{% endif %}

## All Database Tables (for reference)
{% for tbl in allTables %}
- **{{ tbl.schema }}.{{ tbl.name }}**{% if tbl.pk %} (PK: {{ tbl.pk }}){% endif %}{% if tbl.description %}: {{ tbl.description }}{% endif %}
{% endfor %}

## Foreign Keys to Review
These FKs were identified by statistical analysis and/or LLM analysis. Some are correct, some may be false positives.

**NOTE**: FKs marked as **[LOCKED]** have very high confidence and CANNOT be removed. Only evaluate the unlocked ones.

{% for fk in candidates %}
{{ loop.index }}. {% if fk.locked %}**[LOCKED]** {% endif %}**{{ fk.sourceColumn }}** → {{ fk.targetSchema }}.{{ fk.targetTable }}.{{ fk.targetColumn }} (confidence: {{ fk.confidence }}%)
{% endfor %}

## What to look for when proposing removals:

1. **Reverse direction**: FK goes from parent→child instead of child→parent. Example: `Department.DepartmentID → EmployeeDepartmentHistory.DepartmentID` is backwards — the history table should reference Department, not the other way around.

2. **Transitive/indirect relationships**: Two tables both reference a common parent but aren't directly related. Example: `EmployeePayHistory.BusinessEntityID → PersonPhone.BusinessEntityID` — both reference Person, but PayHistory doesn't depend on PersonPhone.

3. **Wrong target when better target exists**: If a column points to a generic table but a more specific table is the correct target. Example: `Employee.BusinessEntityID → BusinessEntity.BusinessEntityID` when `Employee.BusinessEntityID → Person.BusinessEntityID` is the correct FK (Person is more specific).

4. **Column name mismatch creating false match**: Same data type and overlapping values but no real relationship. Example: `OrderQty → OnOrderQty` — both are integers with overlapping ranges but aren't referential.

## Response Format

Return a JSON array of FKs you propose to REMOVE. Only include FKs you are confident are wrong. Do NOT include locked FKs. If all unlocked FKs look correct, return an empty array `[]`.

```json
[
  {
    "index": 2,
    "action": "remove",
    "reasoning": "Reverse direction — Department is the parent table, not the child"
  }
]
```

**Be conservative** — only propose removal when you are confident the FK is wrong. It is better to keep a questionable FK than to remove a correct one.

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
