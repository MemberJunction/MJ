You are a database expert evaluating foreign key candidates that were identified by statistical analysis. Your job is to confirm or reject each candidate based on semantic plausibility, directionality, and database design principles.

## Database Context
{% if seedContext %}
{% if seedContext.overallPurpose %}- **Purpose**: {{ seedContext.overallPurpose }}{% endif %}
{% if seedContext.businessDomains %}- **Business Domains**: {{ seedContext.businessDomains | join(', ') }}{% endif %}
{% if seedContext.industryContext %}- **Industry**: {{ seedContext.industryContext }}{% endif %}
{% endif %}

## All Tables
{% for tbl in allTables %}
- **{{ tbl.schema }}.{{ tbl.name }}**{% if tbl.description %}: {{ tbl.description }}{% endif %}{% if tbl.pk %} (PK: {{ tbl.pk }}){% endif %}
{% endfor %}

## FK Candidates to Evaluate
The following candidates were found by statistical analysis (value overlap, naming patterns, cardinality). Each has statistical evidence but needs semantic validation.

{% for fk in candidates %}
{{ loop.index }}. **{{ fk.sourceSchema }}.{{ fk.sourceTable }}.{{ fk.sourceColumn }}** → **{{ fk.targetSchema }}.{{ fk.targetTable }}.{{ fk.targetColumn }}**
   - Statistical confidence: {{ fk.confidence }}%
   - Value overlap: {{ (fk.valueOverlap * 100) | round(1) }}%
   - Source nulls: {{ (fk.nullPercentage * 100) | round(1) }}%
   - Cardinality ratio (source/target distinct): {{ fk.cardinalityRatio | round(2) }}
{% endfor %}

## Evaluation Rules

### Rule 1: Value overlap is the strongest signal — respect it
High value overlap (>85%) means the source column's values are almost entirely contained within the target column's values. This is near-proof of a FK relationship. **Only reject high-overlap candidates if you have a concrete, specific reason** (e.g., clearly wrong direction, or an obviously better target exists for the same source column).

Do NOT reject candidates just because column names don't match. Real databases frequently use alias names for FK columns:
- `PersonID` referencing `BusinessEntityID` (alias for the same concept)
- `ComponentID` referencing `ProductID` (a component IS a product)
- `Owner` referencing `BusinessEntityID` (semantic alias)
- `SizeUnitMeasureCode` referencing `UnitMeasureCode` (prefixed FK)
- `FromCurrencyCode` / `ToCurrencyCode` referencing `CurrencyCode` (role-based aliases)

These are all valid FKs despite name mismatches. The statistical overlap proves the relationship.

### Rule 2: Directionality — child references parent
FKs point FROM the child table TO the parent table. The child table contains the FK column referencing the parent's PK/unique key.
- `OrderDetail.ProductID → Product.ProductID` is CORRECT (child → parent, many-to-one)
- `Product.ProductID → OrderDetail.ProductID` is WRONG (parent → child, one-to-many)

**How to determine direction**: The target table should generally have FEWER or EQUAL distinct values in the referenced column compared to the source. A cardinality ratio > 1.0 suggests correct child→parent direction.

### Rule 3: Inheritance / specialization — prefer the most specific target
When a source column has candidates pointing to multiple target tables (e.g., `BusinessEntityID` exists in both `BusinessEntity` and `Person`), the correct FK is usually to the **most specialized table**, not the root/base table. This is the Table-Per-Type inheritance pattern common in databases:
- `Employee.BusinessEntityID → Person.BusinessEntityID` is CORRECT (Employee IS-A Person)
- `Employee.BusinessEntityID → BusinessEntity.BusinessEntityID` is WRONG (too generic — Employee relates to Person specifically)

Look at the table names and relationships to identify inheritance chains. The FK should point to the table that the source table has the most specific relationship with.

### Rule 4: Transitive hops — reject indirect relationships
If `A.col` and `B.col` both reference the same parent table but A and B have no direct relationship, reject `A.col → B.col`. Example:
- `EmployeePayHistory.BusinessEntityID → PersonPhone.BusinessEntityID` — REJECT (both reference Person independently; PayHistory doesn't depend on PersonPhone)

**Key distinction**: A transitive hop has LOW cardinality ratio (close to 1.0) and makes no business sense. A real FK has a meaningful dependency.

### Rule 5: Semantic plausibility
Does the relationship make business sense? Consider the table purposes. But remember: statistical evidence (high value overlap) outweighs naming concerns. If the data proves the relationship, confirm it even if the naming seems unusual.

### Rule 6: Multiple candidates for same source column
When a source column has multiple FK candidates, you may confirm MORE THAN ONE if they are genuinely valid (e.g., a column that references different tables in different contexts). But typically, prefer the single best target and reject the others.

## Response Format

Return a JSON array where each object represents your evaluation of ONE candidate. Use the same index as the input list. Only include candidates you are confirming — omit rejected ones entirely.

```json
[
  {
    "index": 1,
    "verdict": "confirm",
    "confidence": 0.95,
    "reasoning": "Brief explanation"
  },
  {
    "index": 3,
    "verdict": "confirm",
    "confidence": 0.80,
    "reasoning": "Brief explanation"
  }
]
```

- **index**: The 1-based index from the candidate list above
- **verdict**: Always "confirm" (omit rejected candidates entirely)
- **confidence**: Your adjusted confidence (0-1 scale)
- **reasoning**: Brief explanation of why this is a valid FK

**IMPORTANT**: Err on the side of confirming when statistical evidence is strong. It is better to include a borderline FK than to miss a real one. Only reject when you are confident the relationship is wrong.

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
