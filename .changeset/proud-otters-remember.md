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

Agent in-flight memory writes: agents with AllowMemoryWrite enabled can commit durable cross-run memories mid-run via the memoryWrites loop-response field. Writes land as immediately-injectable Provisional agent notes (new Status value) with framework-enforced guards (descriptive types only, scope clamp, near-dup supersede/dedupe, per-run cap, TTL), inject with recency-wins precedence, and are hardened or pruned by a new Memory Manager pass each cycle.
