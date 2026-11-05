---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
---

Preserve a terminating sub-agent's `artifactDirective` and `payloadArtifactTypeID` (resolved from `subAgentResult.payloadArtifactTypeID ?? subAgentEntity.DefaultArtifactTypeID`) through `BaseAgent` and `AgentRunner.ProcessAgentArtifacts` so router agents do not overwrite a specialist child agent's artifact type or directive when `terminateAfter: true` (or when a sub-agent parks on a workflow, propagates a Chat step, or runs as a folded 1-node task graph).
