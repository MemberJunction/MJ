You are reviewing a group of database tables that were analyzed together at the same dependency level. Your task is to identify **MATERIAL** inconsistencies or logical issues in how these tables are described and related to each other.

## Dependency Level {{ dependencyLevel }}

These tables all have the same dependency level, meaning they depend on the same set of parent tables and are analyzed together as a cohesive group.

### Tables at This Level

{% for table in tables %}
#### {{ table.name }}

**Description**: {{ table.description }}

**Columns**:
{% for column in table.columns %}
- **{{ column.name }}** ({{ column.dataType }}): {{ column.description }}
{% endfor %}

**Depends On**:
{% for dep in table.dependsOn %}
- {{ dep.schema }}.{{ dep.table }} (via {{ dep.column }})
{% endfor %}

**Referenced By**:
{% for dep in table.dependents %}
- {{ dep.schema }}.{{ dep.table }}
{% endfor %}

---

{% endfor %}

## Your Task

Review these tables as a group and identify **MATERIAL** issues only. Focus on:

1. **Relationship Consistency**: Do foreign key descriptions align between parent and child tables?
2. **Business Logic Coherence**: Do the table descriptions make sense together as a group?
3. **Terminology Consistency**: Are similar concepts described using consistent terminology?
4. **Logical Contradictions**: Are there contradictions in how tables relate or what they represent?
5. **Missing Context**: Are there critical details missing that affect understanding of the group?

## What Counts as MATERIAL

**MATERIAL issues** (flag these):
- Contradictory descriptions of the same relationship
- Misidentified business purpose that affects other tables
- Missing critical information about how tables interact
- Incorrect understanding of cardinality or relationship types
- Terminology conflicts that create confusion (e.g., "member" means different things)

**NOT material** (ignore these):
- Minor wording differences
- Stylistic variations
- Different levels of detail that don't contradict
- Grammar or formatting issues
- Redundant information that's technically correct

## Response Format

Generate a JSON response with this exact structure:

```json
{
  "hasMaterialIssues": false,
  "overallAssessment": "Brief summary of the dependency level's coherence",
  "tableIssues": [
    {
      "tableName": "TableName",
      "issueType": "relationship_inconsistency | business_logic | terminology | contradiction | missing_context",
      "severity": "high | medium | low",
      "description": "Specific description of the material issue",
      "affectedTables": ["Table1", "Table2"],
      "suggestedFix": "What should be corrected in the description"
    }
  ],
  "crossTableObservations": [
    {
      "observation": "Broader pattern or insight across multiple tables",
      "tables": ["Table1", "Table2", "Table3"]
    }
  ]
}
```

**Guidelines:**
- Set `hasMaterialIssues: true` ONLY if you found material problems
- Be specific about which tables and descriptions need correction
- Focus on issues that would mislead someone trying to understand the database
- Group related issues together in crossTableObservations when appropriate

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
