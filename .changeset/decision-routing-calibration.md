---
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/testing-engine": patch
---

Conversation routing acts on calibrated probabilities (plan Task 2.4). `ApplyPlattCalibration` and `PlattCalibration` in `@memberjunction/ai` map a decision model's raw probability to a calibrated one. Routing calibrates the thread Likelihood only for the exact model each fit was made on (`ROUTING_CONTINUES_CALIBRATION`: Jev at `typesafe/jev-1.13-20260917`, and LLM Decision when GPT-OSS-120B answered, fitted by the Phase 2 Decision Eval), and treats any other model's answer as unsure. `FindDecisionCalibration` in `@memberjunction/ai-core-plus` looks a calibration up by the decision model and the model behind it, for any consumer that calibrates. The `RunDecision` mutation and `GraphQLAIClient.RunDecision` return that model as `resolvedModel` / `ResolvedModel`. Routing waits 350 ms instead of 250 ms, which covers about 95% of Jev's answers in-process. The Decision Eval records production's routing verdict with the model that answered and the policy it was reached under, and its scorecard scores that verdict end to end, per run.
