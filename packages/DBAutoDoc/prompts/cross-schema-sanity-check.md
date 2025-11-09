You are reviewing multiple database schemas to ensure consistency in terminology, relationship descriptions, and business concept definitions across the entire database.

## Database: {{ databaseName }}

Total schemas: {{ schemaCount }}

### Schemas Overview

{% for schema in schemas %}
## Schema: {{ schema.name }}

**Description**: {{ schema.description }}
**Business Domains**: {{ schema.businessDomains }}
**Table Count**: {{ schema.tableCount }}

### Representative Tables
{% for table in schema.representativeTables %}
- **{{ table.name }}**: {{ table.description }}
{% endfor %}

---

{% endfor %}

## Shared/Cross-Schema Tables

The following tables appear in multiple schemas or have cross-schema relationships:

{% for table in crossSchemaTables %}
### {{ table.fullName }}

**Schemas**: {{ table.schemas }}
**Description**: {{ table.description }}
**Cross-Schema References**: {{ table.crossSchemaReferences }}

{% endfor %}

## Your Task

Perform a cross-schema consistency review and identify **MATERIAL** issues that affect understanding across the entire database.

Focus on:

1. **Terminology Consistency**: Are the same business concepts described consistently across schemas?
2. **Shared Table Consistency**: Are tables that span schemas described coherently?
3. **Cross-Schema Relationships**: Do relationships between schemas make logical sense?
4. **Business Domain Boundaries**: Are schema boundaries aligned with business domains?
5. **Naming Convention Conflicts**: Are similar concepts named differently in different schemas?
6. **Duplicate Concepts**: Are there tables in different schemas that appear to serve the same purpose?

## What Counts as MATERIAL

**MATERIAL issues** (flag these):
- Same business entity described differently in different schemas
- Contradictory relationship descriptions between schemas
- Shared tables with inconsistent purposes across schemas
- Critical cross-schema dependencies not properly documented
- Business domain misalignment that creates confusion
- Terminology that means different things in different schemas

**NOT material** (ignore these):
- Schema-specific implementation details
- Different levels of detail (if not contradictory)
- Stylistic variations
- Schema-specific business rules that don't contradict
- Minor naming differences that are schema-appropriate

## Response Format

Generate a JSON response with this exact structure:

```json
{
  "hasMaterialIssues": false,
  "overallConsistency": "excellent | good | fair | poor",
  "overallAssessment": "High-level summary of cross-schema consistency",
  "crossSchemaIssues": [
    {
      "issueType": "terminology | shared_tables | relationships | business_domains | naming | duplication",
      "severity": "high | medium | low",
      "description": "Specific description of the cross-schema issue",
      "affectedSchemas": ["Schema1", "Schema2"],
      "affectedTables": [
        {"schema": "Schema1", "table": "Table1"},
        {"schema": "Schema2", "table": "Table2"}
      ],
      "suggestedResolution": "How to resolve the inconsistency"
    }
  ],
  "terminologyConflicts": [
    {
      "term": "Term that has conflicts",
      "usages": [
        {
          "schema": "Schema1",
          "table": "Table1",
          "meaning": "How it's used here"
        },
        {
          "schema": "Schema2",
          "table": "Table2",
          "meaning": "Different meaning here"
        }
      ],
      "recommendedStandardization": "How the term should be used consistently"
    }
  ],
  "schemaIssues": [
    {
      "schemaName": "SchemaName",
      "issueType": "description | business_domain | relationships",
      "description": "What's wrong with this schema's documentation",
      "suggestedFix": "How to correct it"
    }
  ],
  "databaseLevelObservations": [
    {
      "observation": "Broader insights about the entire database structure",
      "impact": "How this affects understanding/usage",
      "recommendation": "What should be done about it"
    }
  ]
}
```

**Guidelines:**
- Set `hasMaterialIssues: true` ONLY if corrections are needed
- Focus on issues that create confusion across schema boundaries
- Identify terminology that needs standardization
- Highlight duplicate or overlapping functionality
- Consider whether schema boundaries align with business domains

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
