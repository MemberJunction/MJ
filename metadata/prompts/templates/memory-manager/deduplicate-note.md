# Memory Manager - Note Deduplication

You are evaluating whether a new note should be added to the agent memory system, given that similar notes already exist.

## Candidate Note

**Type:** {{ candidateNote.type }}
**Content:** {{ candidateNote.content }}
**Scope:**
- Agent: {{ candidateNote.agentId or 'any' }}
- User: {{ candidateNote.userId or 'any' }}
- Company: {{ candidateNote.companyId or 'any' }}

## Similar Existing Notes

{% for note in similarNotes %}
### Note {{ loop.index }} (Similarity: {{ note.similarity | round(2) }})
**Type:** {{ note.type }}
**Content:** {{ note.content }}
**Scope:** Agent={{ note.agentId or 'any' }}, User={{ note.userId or 'any' }}, Company={{ note.companyId or 'any' }}

{% endfor %}

## Decision Criteria

Add the candidate note **only if** it provides:

1. **New Information**: Contains facts, preferences, or constraints not covered by existing notes
2. **Different Scope**: Applies to a different agent/user/company combination
3. **Refinement**: Provides more specific or actionable guidance than existing notes
4. **Contradiction Resolution**: Clarifies or updates outdated information

**Do NOT add** the candidate if:

1. **Duplicate**: Same meaning as an existing note, even if worded differently
2. **Subset**: All information is already covered by existing notes
3. **Redundant**: Would not provide any additional value to agents

## Output Format

Return your decision as JSON:

```json
{
  "shouldAdd": true,
  "reason": "Brief explanation of why this note adds value or is redundant"
}
```

Be conservative - only add notes that genuinely provide new value. Quality over quantity.
