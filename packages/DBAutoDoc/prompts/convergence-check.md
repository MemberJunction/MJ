You are determining whether the database documentation analysis has converged (is complete and stable).

## Analysis Status

- **Schemas Analyzed**: {{ schemaCount }}
- **Tables Analyzed**: {{ tableCount }}
- **Iterations Performed**: {{ iterationCount }}
- **Average Confidence**: {{ averageConfidence | round(2) }}

## Recent Changes (Last Iteration)

{% if recentChanges and recentChanges.length > 0 %}
{% for change in recentChanges %}
- **{{ change.table }}**: {{ change.changeType }} (confidence: {{ change.confidence | round(2) }})
  - Before: {{ change.before | truncate(100) }}
  - After: {{ change.after | truncate(100) }}
{% endfor %}
{% else %}
No changes in the last iteration.
{% endif %}

## Low-Confidence Tables

{% if lowConfidenceTables and lowConfidenceTables.length > 0 %}
Tables below confidence threshold ({{ confidenceThreshold }}):
{% for table in lowConfidenceTables %}
- **{{ table.name }}** (confidence: {{ table.confidence | round(2) }})
  - Description: {{ table.description | truncate(150) }}
  - Reason: {{ table.reasoning | truncate(150) }}
{% endfor %}
{% else %}
All tables meet or exceed the confidence threshold.
{% endif %}

---

## Your Task

Determine if the analysis has converged or if further iterations are needed.

Generate a JSON response with this exact structure:

```json
{
  "hasConverged": true,
  "reasoning": "Explain why you believe analysis is complete or needs more work. Reference specific evidence from above.",
  "recommendedActions": [
    "If hasConverged is false, suggest specific actions",
    "Examples: 'Re-analyze Table X with additional context', 'Gather more sample data for Table Y'"
  ]
}
```

**Guidelines:**

**Set hasConverged to TRUE if:**
1. No changes occurred in the last iteration
2. All tables have confidence >= threshold
3. No obvious contradictions or inconsistencies remain
4. The documentation appears complete and stable

**Set hasConverged to FALSE if:**
1. Recent changes suggest understanding is still evolving
2. Multiple tables have low confidence scores
3. Contradictions exist that might resolve with more iteration
4. Key relationships are unclear

**Reasoning should include:**
- Reference to stability (changes vs no changes)
- Assessment of confidence levels
- Evaluation of completeness
- Any remaining concerns

**Recommended Actions (if not converged):**
- Be specific about which tables need attention
- Suggest concrete steps for improvement
- Prioritize actions by impact

Return ONLY valid JSON. Do not include markdown code fences or explanatory text.
