---
"@memberjunction/ng-conversations": patch
---

Add an opt-in `EnableDecisionRouting` input to the chat area: an untagged message can ask one fast typed decision which agent in the conversation should answer it, and which artifact version it modifies, instead of always going back to the last agent. Only agents in the person's '@' list (the ones they may run) are offered. It is off by default, and any error, slow answer (over 250 ms) or unsure answer keeps today's routing; a routed turn carries the new `DecisionRouted` route. A host `AgentTurnHandler` receives the artifact version the decision named as the new `AgentTurnRequest.TargetArtifactVersionId`.
