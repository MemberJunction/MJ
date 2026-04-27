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

Answer ONE question: **If an agent had only the existing note(s), would it behave any differently toward this user than if it also had the candidate note?**

- If the agent would act the SAME either way → the candidate is redundant. Do NOT add.
- If the candidate would cause the agent to act DIFFERENTLY → it adds value. ADD it.

"Act differently" means: give different advice, use a different tool, apply a different constraint, avoid a different thing, or make a different assumption about the user.

Notes are redundant when they express the same actionable stance regardless of:
- Wording or phrasing differences
- Positive vs negative framing (requiring X = prohibiting not-X)
- Reasoning that merely explains the motivation behind an already-recorded stance without introducing new situational facts
- Provenance or backstory about when, where, or how a preference originated
- Different levels of precision for the same measurement
- Synonyms or domain-equivalent terminology

Notes are additive when they enable genuinely different agent actions:
- A different tool, technology, or domain
- A different constraint or threshold
- A fact about a different aspect of the user's work
- A scope the existing notes don't cover
- Factual information about the user's situation that, while accompanying a known preference, would independently inform agent behavior in scenarios beyond that preference

## Output Format

Return your decision as JSON:

```json
{
  "shouldAdd": true,
  "reason": "Brief explanation of why this note adds value or is redundant"
}
```

The test is always behavioral: same agent action = duplicate, different agent action = keep.

**Burden of proof**: These notes were already flagged as semantically similar. The candidate must enable a CONCRETELY different agent action — not just contain different words. Rewording, restating from a different angle, adding justification, or mentioning when/where something was discussed are NOT different actions. However, a genuinely broader or narrower scope that would change which situations the agent applies the preference to IS a different action.
