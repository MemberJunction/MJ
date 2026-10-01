---
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Calibrated decision probabilities. `ApplyPlattCalibration` and `PlattCalibration` in `@memberjunction/ai` map a decision model's raw probability to a calibrated one. `FindDecisionCalibration` in `@memberjunction/ai-core-plus` looks a calibration up by the decision model and the exact model behind it, so a fit applies only to the model it was fitted on and any other model's answer is treated as unsure. The `RunDecision` mutation and `GraphQLAIClient.RunDecision` return that model as `resolvedModel` / `ResolvedModel`.
