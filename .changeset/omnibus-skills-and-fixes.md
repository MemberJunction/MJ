---
"@memberjunction/ai-agents": minor
"@memberjunction/core": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Omnibus fixes: (1) skill-granted sub-agent execution — resolveSubAgentByName now resolves from the same runtime-effective set the prompt offers and validation approves (skill activations / subAgentChanges), the resolved entity threads into child dispatch, and execution-time not-found retries are bounded by the shared validation-retry cap with a self-correcting available-sub-agents message (fixes an infinite delegation loop observed live on Research Agent → Infographic Agent); (2) RunView dedup/linger cache write-invalidation on entity events (@memberjunction/core); (3) regenerated class-registration manifests.
