---
"@memberjunction/ai-agents": patch
---

Fix agent failure propagation and Flow agent error handling

**Flow Agent Improvements:**

- Handle 'Failed' steps in PreProcessNextStep to enable conditional failure path navigation
- Properly terminate when step fails with no recovery path
- Navigate to failure handler steps when recovery paths exist
- Add logging for failure recovery path evaluation

**Base Agent Improvements:**

- Capture error messages from child and related sub-agent failures
- Extract errorMessage from subAgentResult.agentRun.ErrorMessage
- Prioritize finalStep.errorMessage over finalStep.message in finalizeAgentRun
- Ensure error context propagates up the agent hierarchy

These changes enable Flow agents to detect sub-agent failures, evaluate
