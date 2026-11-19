---
"@memberjunction/task-graph": patch
---

`TaskGraph.CompleteWaitingStep` now refuses a Human step raised by a plugged-in provider. Only the provider completes that step, in process, when the person it asked decides; through the operation the run's owner could complete their own approval with any payload.
