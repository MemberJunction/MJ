---
"@memberjunction/scheduling-engine": patch
"@memberjunction/server": patch
"@memberjunction/ng-artifacts": patch
---

Add Living Report manual refresh and recurring schedule management endpoints (`RefreshLivingArtifact`, `GetArtifactLivingReportSchedule`, `UpsertArtifactLivingReportSchedule`, `DeleteArtifactLivingReportSchedule`) with strict owner-context execution (`BaseScheduledJob.resolveScheduleOwnerUser` in `ActionScheduledJobDriver`), cron DoS and IANA timezone validation (`LivingReportScheduleHelpers`), toolbar/schedule modal UI in `<mj-artifact-viewer-panel>`, direct Sheet Chart and Sheet Range ribbon insert actions in `MarkdownArtifactViewerComponent`, and matching unit/DOM/Playwright E2E tests and architecture documentation.
