---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
---

Propagate a terminating child sub-agent's `artifactDirective`, `payloadArtifactTypeID` (on `ParentID` child and folded 1-node task-graph delegations, excluding `AgentRelationships` related-agent merges and parallel fan-out), and run `Message` through `BaseAgent` and `AgentRunner.ProcessAgentArtifacts` so router agents do not overwrite a specialist child agent's artifact type, directive, or final response message when `terminateAfter: true`, parking on a workflow, or returning a `Chat` step.
