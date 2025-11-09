You are comparing two versions of database table documentation to determine if there are MATERIAL differences in informational content.

## Table: {{ schemaName }}.{{ tableName }}

### Previous Version (Iteration {{ previousIteration }})

**Table Description**: {{ previousTableDescription }}

**Column Descriptions**:
{% for col in previousColumns %}
- **{{ col.columnName }}**: {{ col.description }}
{% endfor %}

---

### Current Version (Iteration {{ currentIteration }})

**Table Description**: {{ currentTableDescription }}

**Column Descriptions**:
{% for col in currentColumns %}
- **{{ col.columnName }}**: {{ col.description }}
{% endfor %}

---

## Your Task

Compare these two versions and determine if there are **MATERIAL** changes in informational content. Ignore stylistic differences, rewording, or changes in phrasing that don't affect the actual meaning.

Generate a JSON response with this exact structure:

```json
{
  "tableMateriallyChanged": false,
  "tableChangeReasoning": "Explain what material information changed, or why no material change occurred",
  "columnChanges": [
    {
      "columnName": "ColumnName",
      "materiallyChanged": false,
      "changeReasoning": "Brief explanation of what changed or why no material change"
    }
  ]
}
```

**Guidelines:**

1. **Material Changes** include:
   - Change in actual purpose or meaning of table/column
   - Addition or removal of key information
   - Correction of factual errors
   - Change in data relationships or constraints described
   - Clarification that changes understanding (not just wording)

2. **NOT Material Changes** (mark as false):
   - Rewording with same meaning ("flag indicating" vs "boolean flag indicating")
   - Stylistic changes ("stores" vs "contains")
   - Reordering of phrases with same content
   - Grammar improvements that don't change meaning
   - Different phrasing of identical information

3. **For each column**:
   - Compare previous vs current description
   - Set `materiallyChanged: true` only if informational content differs
   - Provide reasoning that references specific semantic differences

4. **For the table**:
   - Set `tableMateriallyChanged: true` if the table description's meaning changed
   - Consider if the overall understanding of the table's purpose differs

**Important:**
- Be strict about what counts as "material" - we want to avoid unnecessary iterations
- If you're unsure whether a change is material, it probably isn't
- Focus on INFORMATION content, not presentation style
- All columns from the current version must be included in columnChanges array

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
