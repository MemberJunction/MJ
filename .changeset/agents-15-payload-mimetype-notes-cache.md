---
"@memberjunction/ai-agents": patch
"@memberjunction/feature-pipelines": patch
"@memberjunction/ng-artifacts": patch
---

Agent payload artifact versions carry their artifact type's concrete ContentType as MimeType (null for wildcard types), so preview plugins can match on content type (#4597). The Recent/All note path injects Provisional notes again, matching the semantic path, and the dead SQL note-scoping builders are removed (#1934). Feature value cache entries clamp KeyDisplay to the column's length so long keys are cached instead of failing to save (#4917).
