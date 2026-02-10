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

**IMPORTANT: High similarity scores indicate topical overlap, NOT necessarily duplicate information.** Two notes can be about the same subject yet convey distinct facts. Always compare the **specific values and details**, not just the general topic.

Add the candidate note if it provides:

1. **New or Additive Information**: Contains specific facts, preferences, values, or constraints not stated in existing notes — even if the topic overlaps. For example, "User prefers Python for scripting" adds to "User prefers TypeScript for web development"; these are two distinct language preferences in different contexts, not duplicates.
2. **Different Scope**: Applies to a different agent/user/company combination
3. **Refinement**: Provides more specific or actionable guidance than existing notes
4. **Contradiction Resolution**: Clarifies or updates outdated information

**Do NOT add** the candidate if:

1. **True Duplicate**: Conveys the **exact same specific information** as an existing note, just worded differently (e.g., "User prefers dark mode" vs "User likes dark theme" — same preference, same value)
2. **Strict Subset**: Every specific detail is already covered by existing notes
3. **Redundant**: Would not provide any additional actionable value to agents

## Output Format

Return your decision as JSON:

```json
{
  "shouldAdd": true,
  "reason": "Brief explanation of why this note adds value or is redundant"
}
```

Preserve every distinct piece of information. When in doubt about whether two notes convey the same specific fact, prefer adding the candidate.
