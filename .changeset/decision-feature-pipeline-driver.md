---
"@memberjunction/core": minor
"@memberjunction/feature-pipelines": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/record-set-processor": minor
---

Add `DecisionFeaturePipelineDriver`, an infer processor driver that evaluates structured decisions through `AIDecisionRunner` for feature pipelines. Supports Likelihood (boolean with configurable constraint threshold), Choice (enum), and Score (numeric with 2-10 level rubrics) outputs, confidence tracking, and metadata catalog integration.
