---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-mcp-server": minor
"@memberjunction/core-entities": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/messaging-adapters": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server": minor
---

Agent runs no longer write `AIAgentRun.Result`; use `FinalPayload`, which holds the same value. The `Result` column remains, deprecated, for existing rows.

New column `AIAgentRunStep.PayloadAtStartSourceStepID`. When a step starts from the same payload an earlier step in the run ended with, `PayloadAtStart` is stored as NULL and this column points at that step. Readers resolve the value with `ResolvePayloadAtStart` / `ApplyResolvedPayloadAtStart` from `@memberjunction/ai-core-plus`. External API clients that read `PayloadAtStart` directly must follow the pointer.
