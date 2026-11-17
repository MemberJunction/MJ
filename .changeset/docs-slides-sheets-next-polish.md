---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/server": patch
"@memberjunction/ng-artifacts": patch
---

Add Living Report manual refresh and recurring schedule management endpoints (`RefreshLivingArtifact`, `GetArtifactLivingReportSchedule`, `UpsertArtifactLivingReportSchedule`, `DeleteArtifactLivingReportSchedule`) with strict owner-context execution (`BaseScheduledJob.resolveScheduleOwnerUser` in `ActionScheduledJobDriver`), cron DoS and IANA timezone validation (`LivingReportScheduleHelpers`), toolbar/schedule modal UI in `<mj-artifact-viewer-panel>`, direct Sheet Chart and Sheet Range ribbon insert actions in `MarkdownArtifactViewerComponent`, fix MSE codec fallback for bare `video/mp4` fMP4 frames and suspended `AudioContext` resumption in `ai-realtime-client`, and matching unit/DOM/Playwright E2E tests and architecture documentation.
