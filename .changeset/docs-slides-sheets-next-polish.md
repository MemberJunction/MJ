---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/server": patch
---

Add Living Report manual refresh and recurring schedule management endpoints (`RefreshLivingArtifact`, `GetArtifactLivingReportSchedule`, `UpsertArtifactLivingReportSchedule`, `DeleteArtifactLivingReportSchedule`) with strict owner-context execution (`BaseScheduledJob.resolveScheduleOwnerUser` in `ActionScheduledJobDriver`), cron DoS and IANA timezone validation (`LivingReportScheduleHelpers`), toolbar/schedule modal UI in `<mj-artifact-viewer-panel>`, direct Sheet Chart and Sheet Range ribbon insert actions in `MarkdownArtifactViewerComponent`, fix MSE codec fallback for bare `video/mp4` fMP4 frames and suspended `AudioContext` resumption in `ai-realtime-client`, align realtime avatar/voice defaults and tab audio continuity (`@memberjunction/ai-agents`, `metadata`), gate live channel tabs to used channels with auto-switching (`@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`), persist and restore `Workspace`, `Media`, and `Remote Browser` tabs in session review, and restore target agent name, multi-leg channels, and `on-demand` workspace channels on **Resume session** (`MJServer`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`).
