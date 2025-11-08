You are analyzing a database table to generate comprehensive documentation. Your task is to infer the table's purpose based on the evidence provided.

## Table Information
- **Name**: {{ tableName }}
- **Schema**: {{ schemaName }}
- **Row Count**: {{ rowCount }}
{% if dependencyLevel is defined %}- **Dependency Level**: {{ dependencyLevel }} (0 = no dependencies){% endif %}

## Columns
{% for col in columns %}
- **{{ col.name }}** ({{ col.dataType }}){% if not col.isNullable %} NOT NULL{% endif %}
  {% if col.isPrimaryKey %}- **PRIMARY KEY**{% endif %}
  {% if col.isForeignKey %}- **FOREIGN KEY** → {{ col.foreignKeyReferences.schema }}.{{ col.foreignKeyReferences.table }}.{{ col.foreignKeyReferences.column }}{% endif %}
  {% if col.checkConstraint %}- Check Constraint: {{ col.checkConstraint }}{% endif %}
  {% if col.defaultValue %}- Default: {{ col.defaultValue }}{% endif %}
  {% if col.statistics %}- Distinct Values: {{ col.statistics.distinctCount }} ({{ (col.statistics.uniquenessRatio * 100) | round(1) }}% unique){% endif %}
  {% if col.statistics and col.statistics.nullPercentage > 0 %}- Nulls: {{ col.statistics.nullPercentage | round(1) }}%{% endif %}
  {% if col.possibleValues %}- Possible Values: {{ col.possibleValues | join(', ') }}{% endif %}
  {% if col.statistics and col.statistics.min is defined %}- Range: {{ col.statistics.min }} to {{ col.statistics.max }}{% if col.statistics.avg %} (avg: {{ col.statistics.avg | round(2) }}){% endif %}{% endif %}
  {% if col.statistics and col.statistics.avgLength %}- Avg Length: {{ col.statistics.avgLength | round(1) }} chars{% endif %}
  {% if col.statistics.sampleValues and col.statistics.sampleValues.length > 0 %}- Sample Values: {{ col.statistics.sampleValues | jsoninline }}{% endif %}
{% endfor %}

## Relationships
{% if dependsOn and dependsOn.length > 0 %}
**This table references (depends on):**
{% for dep in dependsOn %}
- {{ dep.schema }}.{{ dep.table }} (via column: {{ dep.column }} → {{ dep.referencedColumn }})
{% endfor %}
{% endif %}

{% if dependents and dependents.length > 0 %}
**Referenced by (dependents):**
{% for dep in dependents %}
- {{ dep.schema }}.{{ dep.table }}
{% endfor %}
{% endif %}

{% if not dependsOn or dependsOn.length === 0 %}
**Note**: This table has no foreign key dependencies (dependency level 0). It is likely a foundational/lookup table.
{% endif %}

{% if parentDescriptions and parentDescriptions.length > 0 %}
## Parent Table Context
Understanding from tables this table references:

{% for parent in parentDescriptions %}
**{{ parent.schema }}.{{ parent.table }}**: {{ parent.description }}
{% endfor %}
{% endif %}

{% if userNotes %}
## User Notes
{{ userNotes }}
{% endif %}

{% if seedContext %}
## Database Context
{% if seedContext.overallPurpose %}- **Purpose**: {{ seedContext.overallPurpose }}{% endif %}
{% if seedContext.businessDomains %}- **Business Domains**: {{ seedContext.businessDomains | join(', ') }}{% endif %}
{% if seedContext.industryContext %}- **Industry**: {{ seedContext.industryContext }}{% endif %}
{% if seedContext.customInstructions %}- **Special Instructions**: {{ seedContext.customInstructions }}{% endif %}
{% endif %}

---

## Your Task

Based on the evidence above, generate a JSON response with this exact structure:

```json
{
  "tableDescription": "A clear, concise description of what this table stores and its purpose in the database",
  "reasoning": "Explain the evidence that led to this conclusion (column names, data types, relationships, sample values, etc.)",
  "confidence": 0.95,
  "columnDescriptions": [
    {
      "columnName": "ColumnName",
      "description": "What this column represents and why it exists",
      "reasoning": "Brief explanation of the evidence"
    }
  ],
  "inferredBusinessDomain": "Sales",
  "parentTableInsights": [
    {
      "parentTable": "schema.table",
      "insight": "What this analysis reveals about the parent table that wasn't known before",
      "confidence": 0.85
    }
  ]
}
```

**Guidelines:**
1. **Table Description**: Focus on WHAT the table stores and WHY it exists. Be specific about the real-world entities or business processes it represents.
2. **Reasoning**: Reference specific evidence (column names, FK relationships, sample values, cardinality patterns)
3. **Confidence**: 0-1 scale. Be conservative. Use < 0.7 if ambiguous.
4. **Column Descriptions**: Every column should be described. Explain its role and meaning.
5. **Business Domain**: Infer from table name and purpose (e.g., "Sales", "HR", "Inventory", "Billing", "Security")
6. **Parent Table Insights**: If analyzing this child table reveals new information about parent tables, include it. Examples:
   - Discovering enum values in the parent (e.g., "Member table has a 'Type' column with values: Individual, Corporate, Student")
   - Revealing parent table classification/purpose (e.g., "BoardMember reveals that Member table includes leadership roles, not just general members")
   - Identifying parent table patterns (e.g., "Multiple child tables suggest Organization serves as a multi-tenant partition key")
   - **Leave empty array if no new insights about parents**

**Important:**
- If column has low cardinality (< 20 distinct values), those are likely enum/category values - use them to understand meaning
- Foreign keys reveal relationships and context - use parent table descriptions to inform your analysis
- High uniqueness ratio (> 95%) suggests identifier/code column
- String length patterns can reveal format (e.g., phone, email, code)
- Null percentage reveals whether column is required or optional

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
