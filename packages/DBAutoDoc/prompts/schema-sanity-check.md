You are reviewing all table descriptions within the "{{ schemaName }}" schema for consistency and completeness.

## Schema Tables

{% for table in tables %}
### {{ table.name }}
**Description**: {{ table.description }}

**Columns**:
{% for col in table.columns %}
- {{ col.name }}: {{ col.description }}
{% endfor %}

{% endfor %}

---

## Your Task

Review the table and column descriptions for consistency, coherence, and completeness.

Generate a JSON response with this exact structure:

```json
{
  "schemaDescription": "A high-level description of what this schema contains and its overall purpose",
  "inconsistencies": [
    "Description of any contradictions or inconsistencies found between table descriptions",
    "Note any tables that seem to serve similar purposes but are described differently"
  ],
  "suggestions": [
    "Suggestions for improving clarity or completeness",
    "Recommendations for additional context or details"
  ]
}
```

**Guidelines:**
1. **Schema Description**: Synthesize the table descriptions into a coherent schema-level summary
2. **Inconsistencies**: Look for:
   - Contradictory descriptions between related tables
   - Similar tables described with different terminology
   - Missing relationships or unclear dependencies
   - Descriptions that don't align with column details
3. **Suggestions**: Provide actionable recommendations for improvement
4. **If no issues found**: Return empty arrays for inconsistencies and suggestions

**Focus on:**
- Terminology consistency across tables
- Logical coherence of the schema as a whole
- Completeness of explanations
- Clarity and precision of language

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
