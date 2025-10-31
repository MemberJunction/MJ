# Memory Manager - Example Deduplication

You are evaluating whether a candidate example should be added to the agent's example database, given existing similar examples.

## Candidate Example

**Type**: {{ candidateExample.type }}
**Agent ID**: {{ candidateExample.agentId }}
**Input**: {{ candidateExample.exampleInput }}
**Output**: {{ candidateExample.exampleOutput }}
**Success Score**: {{ candidateExample.successScore }}
**Confidence**: {{ candidateExample.confidence }}

## Similar Existing Examples

{% if similarExamples.length > 0 %}
{% for example in similarExamples %}
### Example {{ loop.index }} (Similarity: {{ (example.similarity * 100) | round }}%)

**Input**: {{ example.input }}
**Output**: {{ example.output }}
**Success Score**: {{ example.successScore or 'N/A' }}

---

{% endfor %}
{% else %}
No similar examples found in the database.
{% endif %}

## Your Task

Determine if the candidate example adds meaningful value compared to the existing similar examples.

### Decision Criteria

**Add the example (shouldAdd: true) if**:
- Demonstrates a different aspect or nuance not covered by existing examples
- Shows a more complete or better response pattern
- Covers an edge case or variation not represented
- Uses a different approach that's equally valid
- Provides significantly better quality (clearer, more accurate)

**Skip the example (shouldAdd: false) if**:
- Essentially duplicates an existing example
- Shows the same pattern already well-represented
- Lower quality than existing similar examples
- Minor variation that doesn't add learning value
- Too similar (>90% similarity) to existing examples

### Quality Considerations

- **Similarity scores**: Examples with >90% similarity are likely redundant
- **Success scores**: Consider if candidate has higher success score than similar examples
- **Coverage**: Prefer diversity - add examples that expand coverage
- **Clarity**: Prefer clearer, more actionable examples

## Output Format

Return JSON with your decision:

```json
{
  "shouldAdd": true,
  "reason": "Shows handling of multi-step request not covered in existing examples"
}
```

OR

```json
{
  "shouldAdd": false,
  "reason": "Duplicate of Example 1 with 95% similarity and lower success score"
}
```

Be conservative - when in doubt, skip redundant examples to keep the database high-quality and focused.
