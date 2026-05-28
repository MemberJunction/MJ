---
"@memberjunction/ng-artifacts": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/server": minor
---

fix: image display + artifact/attachment unification cleanup

- Add ImageArtifactViewerPlugin for raster image artifacts
- Remove persist gate so agent-generated media always persists as artifacts
- AgentRunner writes media artifacts directly (bypass deprecated ConversationDetailAttachment)
- Remove deprecated SuggestedResponses feature (superseded by ResponseForm)
- Backfill migration for legacy ConversationDetailAttachment rows
- Remove all back-compat reads from deprecated ConversationDetailAttachment
