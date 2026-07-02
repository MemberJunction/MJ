---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-vectordb": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/ai-vectors-memory": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-record-merge": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/record-comparison": minor
"@memberjunction/server-bootstrap": minor
---

Add an LLM/agentic reasoning pass on top of the embedding/vector duplicate-detection pipeline — "vectors filter, reasoning validates". A small/fast LLM judges high-probability vector candidates (Merge / NotDuplicate / Uncertain) to shrink the human-review set, strengthening or weakening the vector score rather than replacing it. Adds a dual-provider reasoning seam (Prompt/Agent), per-entity gating (EnableLLMReasoning, ReasoningThreshold, AutomationLevel), per-candidate verdict/audit columns, the new @memberjunction/record-comparison engine + resolver/client, and an in-place reasoning UI in the duplicates dashboard. Fully back-compat: EnableLLMReasoning defaults to 0, leaving the vector-only path byte-for-byte unchanged.
