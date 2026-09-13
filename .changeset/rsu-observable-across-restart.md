---
"@memberjunction/integration-progress-artifacts": minor
"@memberjunction/schema-engine": minor
"@memberjunction/server": minor
---

The runtime schema update is observable across its own restart: the progress emitter can resume a run (manifest preserved, sequence continues), RSU run artifacts carry the connection id so they are readable over the API, and the post-restart half emits `CreateEntityMaps` and `StartSync` steps before closing the run.
