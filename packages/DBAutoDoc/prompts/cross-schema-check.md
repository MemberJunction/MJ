You are reviewing the relationships and coherence across multiple database schemas.

## Schemas

{% for schema in schemas %}
### {{ schema.name }}
**Description**: {{ schema.description }}
**Table Count**: {{ schema.tableCount }}
{% if schema.inferredPurpose %}**Purpose**: {{ schema.inferredPurpose }}{% endif %}
{% if schema.businessDomains %}**Business Domains**: {{ schema.businessDomains | join(', ') }}{% endif %}

{% endfor %}

---

## Your Task

Review the schema descriptions for cross-schema patterns, relationships, and global insights.

Generate a JSON response with this exact structure:

```json
{
  "insights": [
    "Observations about how schemas relate to each other",
    "Patterns that emerge across multiple schemas",
    "Potential organizational structure insights"
  ],
  "globalPatterns": [
    "Common naming conventions",
    "Shared architectural patterns",
    "Repeated design patterns"
  ],
  "suggestions": [
    "Recommendations for schema organization",
    "Opportunities for consolidation or clarification",
    "Potential documentation improvements"
  ]
}
```

**Guidelines:**
1. **Insights**: Focus on:
   - How schemas work together
   - Logical separation of concerns
   - Dependencies between schemas
2. **Global Patterns**: Identify:
   - Consistent naming conventions
   - Architectural patterns (e.g., audit schemas, lookup schemas, transactional schemas)
   - Design principles evident across schemas
3. **Suggestions**: Provide:
   - High-level organizational recommendations
   - Opportunities for improved clarity
   - Potential refactoring or consolidation ideas

**Important:**
- Focus on the big picture, not individual tables
- Look for system-wide patterns
- Consider the database as a whole

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
