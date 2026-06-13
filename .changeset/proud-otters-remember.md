---
"@memberjunction/core": minor
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/aiengine": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/ng-core-entity-forms": patch
---

Agent in-flight memory writes: agents can commit durable cross-run memories mid-run via the memoryWrites loop-response field, gated by AIAgent.AllowMemoryWrite (ON by default — opt out per agent). Writes land as immediately-injectable Provisional agent notes (new Status value, with AuthorType provenance) under framework-enforced guards (descriptive types only, scope clamp, exact-restatement dedupe with same-run supersede, per-run cap, TTL), inject with recency-wins precedence and per-note recorded dates, and are hardened or pruned by a new Memory Manager pass each cycle. Cross-run dedupe requires exact normalized restatement so corrections are never silently absorbed into a stale note; the loop-agent prompt instructs agents not to claim a memory was saved before its result message arrives.
