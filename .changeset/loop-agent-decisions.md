---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Loop agents can ask typed decision questions (Likelihood, Choice, Score) through a new `decisions` field in their response. A fast decision model answers them inline on the same turn, at no LLM-turn cost, and the answers arrive on the next turn, as artifact tool results do. A request can target literal text, a payload path, or each item of a payload array. It is on by default and documented in the loop system prompt, and can be disabled per agent with `includeDecisionsDocs: false`.
