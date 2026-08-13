---
"@memberjunction/core-actions": patch
---

Find Candidate Agents and Find Best Agent now search in hybrid mode (semantic + lexical), so a newly-created agent is discoverable by name/description before the daily vector sync embeds it. runSemanticEntitySearch gained a mode arg (default semantic); in hybrid it passes minscore : 0 and the action reapplies the cosine floor against components.semantic while letting lexical hits through.
