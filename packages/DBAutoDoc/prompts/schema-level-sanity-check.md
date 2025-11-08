You are reviewing an entire database schema to ensure all table descriptions are coherent, consistent, and logically sound when considered together as a complete system.

## Schema: {{ schemaName }}

Total tables: {{ tableCount }}

### Schema Description
{{ schemaDescription }}

### All Tables in Schema

{% for table in tables %}
#### {{ table.name }}

**Dependency Level**: {{ table.dependencyLevel }}
**Row Count**: {{ table.rowCount }}

**Description**: {{ table.description }}

**Key Columns**:
{% for column in table.keyColumns %}
- **{{ column.name }}** ({{ column.dataType }}): {{ column.description }}
{% endfor %}

**Relationships**:
- Depends On: {% for dep in table.dependsOn %}{{ dep.table }}{% if not loop.last %}, {% endif %}{% endfor %}
- Referenced By: {% for dep in table.dependents %}{{ dep.table }}{% if not loop.last %}, {% endif %}{% endfor %}

---

{% endfor %}

## Your Task

Perform a holistic review of this entire schema and identify **MATERIAL** issues that affect the overall coherence and understanding of the database.

Focus on:

1. **Schema-Wide Consistency**: Are business concepts described consistently across all tables?
2. **Relationship Network**: Do the relationships between tables make logical sense?
3. **Missing Relationships**: Are there implied relationships not captured in foreign keys?
4. **Business Domain Alignment**: Do all tables fit the stated business domain(s)?
5. **Naming Convention Issues**: Are there tables that seem misnamed or miscategorized?
6. **Architectural Patterns**: Do you see patterns (audit, configuration, transaction) that should be documented?

## What Counts as MATERIAL

**MATERIAL issues** (flag these):
- Tables described with contradictory purposes
- Relationship chains that don't make business sense
- Core business entities misidentified or misdescribed
- Critical patterns not recognized (e.g., audit trail, versioning)
- Terminology used inconsistently across tables in ways that confuse understanding
- Missing schema-level context that would help interpret individual tables

**NOT material** (ignore these):
- Minor wording variations
- Different description styles
- Redundant information across tables
- Grammar or formatting
- Obvious facts already captured elsewhere

## Response Format

Generate a JSON response with this exact structure:

```json
{
  "hasMaterialIssues": false,
  "schemaCoherence": "overall | good | fair | poor",
  "overallAssessment": "High-level summary of schema documentation quality",
  "schemaLevelIssues": [
    {
      "issueType": "consistency | relationships | business_domain | naming | architecture | missing_pattern",
      "severity": "high | medium | low",
      "description": "Specific description of the schema-wide issue",
      "affectedTables": ["Table1", "Table2", "Table3"],
      "suggestedSchemaDescription": "If the schema description should be added/updated"
    }
  ],
  "tableIssues": [
    {
      "tableName": "TableName",
      "issueType": "description | business_purpose | relationships | terminology",
      "severity": "high | medium | low",
      "description": "What's wrong with this table's description",
      "suggestedFix": "How to correct the table description"
    }
  ],
  "architecturalPatterns": [
    {
      "pattern": "audit_trail | configuration | lookup | transaction | versioning | soft_delete | hierarchy",
      "tables": ["Table1", "Table2"],
      "description": "Pattern identified and how it should be documented"
    }
  ],
  "businessDomainSuggestions": [
    {
      "suggestedDomain": "Domain name",
      "reasoning": "Why this domain applies to this schema",
      "confidence": "high | medium | low"
    }
  ]
}
```

**Guidelines:**
- Set `hasMaterialIssues: true` ONLY if corrections are needed
- Be specific about which tables need description updates
- Identify architectural patterns that should be explicitly documented
- Suggest business domains if not already specified
- Focus on issues that would mislead database users or developers

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
