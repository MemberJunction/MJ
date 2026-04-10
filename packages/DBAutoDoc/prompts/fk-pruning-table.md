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

5. **Sibling fan-out**: When a source column has multiple FK targets with the same column name, usually only ONE is the correct FK (to the parent/lookup table). The others are sibling tables that independently reference the same parent. Look for the pattern: `A.TerritoryID → SalesTerritory.TerritoryID` (correct — SalesTerritory is the lookup) vs `A.TerritoryID → SalesTerritoryHistory.TerritoryID` (wrong — History is a sibling, not a parent). The correct target is typically:
   - The table whose PK matches the FK column
   - The shorter/simpler table name (lookup/master vs history/detail)
   - The table with fewer columns (lookup tables are small)

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

**Be moderately aggressive** — remove FKs that follow the sibling/reverse/transitive patterns described above. The locked FKs protect the high-confidence correct relationships, so your job is to clean up the lower-confidence noise.

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
