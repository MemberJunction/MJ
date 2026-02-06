You are analyzing a database table to generate comprehensive documentation. Your task is to infer the table's purpose based on the evidence provided.

## Table Information
- **Name**: {{ tableName }}
- **Schema**: {{ schemaName }}
- **Row Count**: {{ rowCount }}
{% if dependencyLevel is defined %}- **Dependency Level**: {{ dependencyLevel }} (0 = no dependencies){% endif %}

## Columns
{% for col in columns %}
- **{{ col.name }}** ({{ col.dataType }}){% if not col.isNullable %} NOT NULL{% endif %}
  {% if col.isPrimaryKey %}{% if col.pkSource === 'schema' %}- **🔒 HARD PRIMARY KEY (SQL constraint)** - DO NOT suggest as foreign key{% else %}- **Soft Primary Key** (discovered{% if col.pkDiscoveryConfidence %}, confidence: {{ col.pkDiscoveryConfidence }}%{% endif %}){% endif %}{% endif %}
  {% if col.isForeignKey %}{% if col.fkSource === 'schema' %}- **🔒 HARD FOREIGN KEY (SQL constraint)** → {{ col.foreignKeyReferences.schema }}.{{ col.foreignKeyReferences.table }}.{{ col.foreignKeyReferences.column }}{% else %}- **Soft Foreign Key** (discovered{% if col.fkDiscoveryConfidence %}, confidence: {{ col.fkDiscoveryConfidence }}%{% endif %}) → {{ col.foreignKeyReferences.schema }}.{{ col.foreignKeyReferences.table }}.{{ col.foreignKeyReferences.column }}{% endif %}{% endif %}
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

{% if allTables %}
## All Database Tables
**IMPORTANT**: When referring to foreign key relationships, you MUST use one of these exact table names:
{% for tbl in allTables %}
- {{ tbl.schema }}.{{ tbl.name }}
{% endfor %}

**Do NOT make up table names** - only use the exact names listed above.
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
  "foreignKeys": [
    {
      "columnName": "prd_id",
      "referencesSchema": "inv",
      "referencesTable": "prd",
      "referencesColumn": "prd_id",
      "confidence": 0.95
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

**🚨 CRITICAL: Foreign Key Validation Rules**

Before adding a foreign key to your response, you MUST validate it meets these requirements:

1. **NEVER mark a PRIMARY KEY as a foreign key** (unless clear 1:1 inheritance pattern)
   - Exception: Rare inheritance cases where child PK extends parent (e.g., Employee.PersonID → Person.PersonID)
   - If column is marked as PRIMARY KEY above, do NOT add to foreignKeys array

2. **FK confidence MUST correlate with value overlap**
   - Low overlap (<30%) = Low confidence (<0.5)
   - Medium overlap (30-70%) = Medium confidence (0.5-0.8)
   - High overlap (>70%) = High confidence (>0.8)
   - **NEVER use high confidence (>0.9) with low overlap (<10%)**

3. **Check cardinality direction** (many-to-one expected for FKs)
   - Valid: Many rows in THIS table → Few rows in target table
   - Invalid: Few rows in THIS table → Many rows in target table (likely one-to-many, not FK)
   - Use distinctCount and sample values to assess this

4. **Generic "ID" columns do NOT automatically imply relationships**
   - Column named "ID" alone is NOT evidence of FK
   - Require at least TWO pieces of evidence:
     - Naming match (e.g., CustomerID → Customer.ID) AND value overlap (>50%)
     - OR explicit domain knowledge from context

5. **Only reference tables from "All Database Tables" list**
   - Do NOT invent table names
   - Do NOT assume tables exist without seeing them in the provided list
   - If unsure, leave foreignKeys array empty

**Guidelines:**
1. **Table Description**: Focus on WHAT the table stores and WHY it exists. Be specific about the real-world entities or business processes it represents.
2. **Reasoning**: Reference specific evidence (column names, FK relationships, sample values, cardinality patterns)
3. **Confidence**: 0-1 scale. Be conservative. Use < 0.7 if ambiguous.
4. **Column Descriptions**: Every column should be described. Explain its role and meaning.
5. **Foreign Keys**: **CRITICAL** - Use structured format for ALL foreign key relationships:
   - Include EVERY column that references another table
   - Use EXACT schema and table names from the "All Database Tables" list above
   - Specify confidence (0-1 scale) based on evidence strength
   - Example: If `prd_id` exists, add: `{"columnName": "prd_id", "referencesSchema": "inv", "referencesTable": "prd", "referencesColumn": "prd_id", "confidence": 0.95}`
   - **Leave empty array if no foreign keys detected**
6. **Business Domain**: Infer from table name and purpose (e.g., "Sales", "HR", "Inventory", "Billing", "Security")
7. **Parent Table Insights**: If analyzing this child table reveals new information about parent tables, include it. Examples:
   - Discovering enum values in the parent (e.g., "Member table has a 'Type' column with values: Individual, Corporate, Student")
   - Revealing parent table classification/purpose (e.g., "BoardMember reveals that Member table includes leadership roles, not just general members")
   - Identifying parent table patterns (e.g., "Multiple child tables suggest Organization serves as a multi-tenant partition key")
   - **Leave empty array if no new insights about parents**

**Important:**
- **When mentioning table names in descriptions, ALWAYS use the exact `schema.table` format from the "All Database Tables" list**
- If column has low cardinality (< 20 distinct values), those are likely enum/category values - use them to understand meaning
- Foreign keys reveal relationships and context - use parent table descriptions to inform your analysis
- High uniqueness ratio (> 95%) suggests identifier/code column
- String length patterns can reveal format (e.g., phone, email, code)
- Null percentage reveals whether column is required or optional

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
