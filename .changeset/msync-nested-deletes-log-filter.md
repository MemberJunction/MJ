---
"@memberjunction/metadata-sync": patch
---

Push no longer skips deletions when the only delete markers are nested under `relatedEntities` or sit in an `@include`d file. The push SQL log now leaves out the create and update calls for AI prompt runs, AI agent runs, AI agent run steps and action execution logs by default (`sqlLogging.excludeTransactionalDefaults: false` turns this off).
