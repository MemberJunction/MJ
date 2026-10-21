---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-viewer": patch
---

Deleting a record in Explorer no longer leaves its form open on a blank record.

- **The record's tab closes and you go back to where you opened it from**: the view (with its filters and position), the parent record, or the page you came from. A record loaded straight from a URL, with nowhere to go back to, lands on the Home dashboard (or the app's landing page when there is no Home app).
- **The Data Explorer's preview panel closes and its grid reloads.** The deleted row drops out without losing your page or sort, and returning from the deleted record's tab can't reopen the preview on it.
- **The Recycle Bin count updates** on any grid showing that entity, whether the record was deleted in this session or by someone else.
- **Every other tab showing the record closes too**, however it was deleted: its form, a custom form, a grid row, or any other `BaseEntity.Delete()` in the session.
- **Browser Back doesn't reopen it.** The deleted record's history entry is replaced.
- **No crumb leads back to it.** A record opened from inside the deleted one now returns to where the deleted record itself came from.
- **Deleted by someone else**: the tab stays open with a banner saying so, and a Close button, rather than vanishing while you read it.

New exports: `NavigationService.OpenHomeDashboard()`; `ViewWorkspaceComponent.RefreshInPlace()`; `TabService.MarkRecordUrlForReplacement` / `ConsumeRecordUrlReplacement`; and `GetDeletedRecordFromEvent`, `RecordTabShowsRecord`, `RecordIdentityMatches`, `NormalizeRecordIdForMatch`, `RemoveDeletedRecordFromOrigin`, `OriginHasReturnTarget` and `OriginToTabConfiguration` from `@memberjunction/ng-shared`.
