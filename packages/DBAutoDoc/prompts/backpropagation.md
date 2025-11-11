You previously analyzed the table "{{ schemaName }}.{{ tableName }}" and generated this description:

**Current Description**: {{ currentDescription }}

**Reasoning**: {{ currentReasoning }}

**Confidence**: {{ currentConfidence }}

---

## New Insights from Related Tables

We have since analyzed tables that reference or are referenced by this table, and discovered the following insights:

{{ insights }}

---

## Your Task

Based on these new insights from related tables, determine if you need to revise your understanding of this table.

Generate a JSON response with this exact structure:

```json
{
  "needsRevision": true,
  "revisedDescription": "Updated description if needed",
  "reasoning": "Explain what changed based on the new insights and why the revision is necessary",
  "confidence": 0.98
}
```

**Guidelines:**
1. **Carefully evaluate** whether the new insights actually contradict or enhance your original understanding
2. **Set needsRevision to false** if:
   - The insights are consistent with your current description
   - The insights don't add meaningful new understanding
   - The current description is still accurate
3. **Set needsRevision to true** if:
   - The insights reveal the table serves a different purpose than originally thought
   - Child/parent table analysis clarifies ambiguity
   - The insights reveal relationships or usage patterns that change the meaning
4. **If revising**:
   - Keep what was correct from the original description
   - Integrate the new insights
   - Explain clearly what changed and why
5. **Confidence**: Should generally be higher than original if insights clarify, lower if they introduce new ambiguity

**Important:**
- Don't revise just for the sake of revising
- Be precise about what specifically changed
- Reference the insights explicitly in your reasoning

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
