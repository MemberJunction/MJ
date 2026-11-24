---
"@memberjunction/ai-agents": patch
"@memberjunction/content-pipeline": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-composer": patch
---

Replace name-resolved `[[Name]]` doc links with durable record-mention tokens (`ConversationUtility.CreateRecordLink`), `[[` autocomplete in the MJ Docs editor (searching readable artifacts as the current user), batched permission-aware link chip rendering (`ArtifactPermissionEngine.ResolvePermissionsBatch` + batched PK-only entity `RunViews`), and plain-label export.
