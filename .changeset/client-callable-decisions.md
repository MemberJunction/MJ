---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/core-actions": patch
---

Add a `RunDecision` GraphQL mutation and `GraphQLAIClient.RunDecision`, so browser code can run a typed decision in one round trip, under the same authorization as `RunAIPrompt`: the API-key `prompt:execute` scope is checked against the ID of the prompt that runs. The mutation refuses scope-limited sessions, and bounds the state and question sizes and the model-call timeout on the server. The `Run Decision` action's question validation moves unchanged to `ParseDecisionQuestions` in `@memberjunction/ai-prompts`, which the action and the mutation now share.
