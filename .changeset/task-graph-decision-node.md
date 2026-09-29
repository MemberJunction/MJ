---
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/task-graph": minor
---

A task-graph node can be a typed `Decision`: `MJ: Tasks.StepType` gains the `Decision` value.
A Decision node answers its questions in one call, edges route on the answers through the new `decisions` condition root, a fork on a Choice must cover every option at submit, and an answer below its `minConfidence` or from a failed call holds the edge instead of reading as false.
